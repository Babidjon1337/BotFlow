import json
import re
import random
import hmac
import hashlib
import uuid
import httpx
from typing import Any, Optional
from urllib.parse import urlencode
from prodamuspy import ProdamusPy
from database.models import BotConfig
from services.security import crypto
from loggers import logger

# Глобальный клиент для всех запросов
http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)


async def generate_payment_link(
    bot_config: BotConfig, amount: float, description: str, lead_telegram_id: int
) -> Optional[str]:
    """
    Универсальная функция генерации платежной ссылки.
    Определяет провайдера бота, расшифровывает ключи и возвращает готовую ссылку.
    """
    if not bot_config.payment_provider or not bot_config.payment_creds_enc:
        logger.warning(f"У бота {bot_config.id} не настроена платежная система!")
        return None

    try:
        creds_json = crypto.decrypt(bot_config.payment_creds_enc)
        creds = json.loads(creds_json)
    except Exception as e:
        logger.error(f"Ошибка расшифровки платежных ключей: {e}")
        return None

    provider = bot_config.payment_provider.lower()

    if provider == "yookassa":
        return await _create_yookassa_link(creds, amount, description, lead_telegram_id)
    elif provider == "robokassa":
        return _create_robokassa_link(creds, amount, description, lead_telegram_id)
    elif provider == "prodamus":
        return await _create_prodamus_link(creds, amount, description, lead_telegram_id)
    else:
        logger.warning(f"Неподдерживаемый платежный провайдер: {provider}")
        return None


# ==========================================
# 1. ИНТЕГРАЦИЯ ЮKASSA
# ==========================================
async def _create_yookassa_link(
    creds: dict, amount: float, description: str, telegram_id: int
) -> Optional[str]:
    shop_id = creds.get("shop_id")
    api_key = creds.get("api_key")

    if not shop_id or not api_key:
        logger.error("Для ЮKassa не переданы shop_id или api_key!")
        return None

    url = "https://api.yookassa.ru/v3/payments"
    headers = {"Idempotence-Key": str(uuid.uuid4()), "Content-Type": "application/json"}

    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": "https://t.me/telegram"},
        "description": description,
        "metadata": {"telegram_id": str(telegram_id)},
        "receipt": {
            "customer": {"email": f"client_{telegram_id}@telegram-bot.ru"},
            "items": [
                {
                    "description": description,
                    "quantity": "1.00",
                    "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                    "vat_code": 1,
                    "payment_mode": "full_prepayment",
                    "payment_subject": "service",
                }
            ],
        },
    }

    try:
        response = await http_client.post(
            url, json=payload, headers=headers, auth=(str(shop_id), str(api_key))
        )
        if response.status_code == 200:
            return response.json()["confirmation"]["confirmation_url"]
        logger.error(f"Ошибка API ЮKassa: {response.text}")
    except Exception as e:
        logger.error(f"Сетевой сбой при обращении к ЮKassa: {e}")
    return None


# ==========================================
# 2. ИНТЕГРАЦИЯ РОБОКАССЫ
# ==========================================
def _create_robokassa_link(
    creds: dict, amount: float, description: str, telegram_id: int
) -> Optional[str]:
    merchant_login = creds.get("merchant_login")
    password_1 = creds.get("password_1")
    is_test = creds.get("is_test", True)

    if not merchant_login or not password_1:
        logger.error("Для Робокассы не переданы merchant_login или password_1!")
        return None

    inv_id = int(uuid.uuid4().int >> 96)
    signature_str = f"{merchant_login}:{amount:.2f}:{inv_id}:{password_1}:shp_telegram_id={telegram_id}"
    signature = hashlib.md5(signature_str.encode("utf-8")).hexdigest()

    params = {
        "MerchantLogin": merchant_login,
        "OutSum": f"{amount:.2f}",
        "InvId": str(inv_id),
        "SignatureValue": signature,
        "Description": description,
        "shp_telegram_id": str(telegram_id),
    }
    if is_test:
        params["IsTest"] = "1"

    return f"https://auth.robokassa.ru/Merchant/Index.aspx?{urlencode(params)}"


# ==========================================
# 3. ИНТЕГРАЦИЯ PRODAMUS
# ==========================================
async def _create_prodamus_link(
    creds: dict, amount: float, description: str, telegram_id: int
) -> Optional[str]:
    payment_page = creds.get("payment_page", "").rstrip("/") + "/"
    api_key = creds.get("api_key")

    if not payment_page or not api_key:
        logger.error("Для Prodamus не переданы payment_page или api_key!")
        return None

    prodamus = ProdamusPy(api_key)
    order_id = f"{telegram_id}_{random.randint(100000, 999999)}"

    data = {
        "do": "link",
        "order_id": order_id,
        "products": [
            {
                "name": description,
                "price": f"{amount:.2f}",
                "quantity": "1",
                "type": "service",
            }
        ],
        "customer_email": f"client_{telegram_id}@telegram.bot",
    }

    data["signature"] = prodamus.sign(data)

    def _flatten(prefix, value):
        items = []
        if isinstance(value, dict):
            for k, v in value.items():
                items.extend(_flatten(f"{prefix}[{k}]", v))
        elif isinstance(value, list):
            for i, v in enumerate(value):
                items.extend(_flatten(f"{prefix}[{i}]", v))
        else:
            items.append((prefix, str(value)))
        return items

    flat_params = []
    for k, v in data.items():
        if isinstance(v, (dict, list)):
            flat_params.extend(_flatten(k, v))
        else:
            flat_params.append((k, v))

    try:
        response = await http_client.get(payment_page, params=flat_params)
        if response.status_code == 200:
            content = response.text.strip()
            found = re.findall(r"https?://payform\.ru/[a-zA-Z0-9]+/?", content)
            if found:
                return found[0]
        logger.error(
            f"Prodamus API error {response.status_code}: {response.text[:100]}"
        )
    except Exception as e:
        logger.error(f"Ошибка при получении ссылки Prodamus: {e}")

    return None


async def send_success_message(tg_bot_id: int, telegram_id: int, http_session: Any):
    """
    Вспомогательная функция: достает настройки бота и отправляет node_success или delivery ноду V2.
    """
    from database.requests.bot_rq import get_bot_by_tg_id
    from services.funnel_message import send_funnel_node_message
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties

    bot_config = await get_bot_by_tg_id(tg_bot_id)
    if not bot_config or not bot_config.funnel_schema:
        return

    try:
        token = crypto.decrypt(bot_config.bot_token_enc)
        funnel_schema = bot_config.funnel_schema
        node_success = None

        if isinstance(funnel_schema, dict):
            nodes = funnel_schema.get("nodes")
            if isinstance(nodes, list):
                node_success = next((n for n in nodes if n.get("id") in ["success", "delivery", "node_success"]), None)
                if not node_success:
                    payment_node = next((n for n in nodes if n.get("id") == "payment"), None)
                    if payment_node and payment_node.get("tariffs"):
                        tariff = payment_node["tariffs"][0]
                        if tariff.get("has_delivery", True) or tariff.get("hasDelivery", True):
                            action_type = tariff.get("action_type") or tariff.get("actionType", "text")
                            action_data = tariff.get("action_data") or tariff.get("actionData", "")
                            node_success = {
                                "content": f"✅ <b>Оплата успешно получена!</b>\n\nВаш доступ ({tariff.get('name', 'Тариф')}):\n{action_data}" if action_type in ["link", "text"] else "✅ <b>Оплата успешно получена!</b>",
                                "media_file_id": action_data if action_type == "file" else None,
                                "media_type": "photo" if action_type == "file" else None
                            }
            elif isinstance(nodes, dict):
                node_success = nodes.get("node_success") or nodes.get("success") or nodes.get("delivery")

        if node_success:
            bot = Bot(
                token=token,
                session=http_session,
                default=DefaultBotProperties(parse_mode="HTML"),
            )
            await send_funnel_node_message(
                bot=bot, chat_id=telegram_id, node=node_success
            )
            logger.info(f"✅ Сообщение об успехе отправлено {telegram_id}")

    except Exception as e:
        logger.error(f"Ошибка отправки сообщения пользователю {telegram_id}: {e}")
