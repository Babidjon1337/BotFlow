import json
import re
import hmac
import hashlib
import uuid
import httpx
from typing import Any, Optional
from urllib.parse import urlencode
from prodamuspy import ProdamusPy
from database.models import BotConfig, ClientPayment
from database.requests.client_payment_rq import set_client_payment_provider_id
from services.security import crypto
from loggers import logger

# Глобальный клиент для всех запросов
http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)

_YOOKASSA_DESCRIPTION_MAX_LENGTH = 128


def _yookassa_description(description: str) -> str:
    """Normalize provider-facing description without losing the user-facing offer."""
    normalized = re.sub(r"\s+", " ", description).strip()
    if not normalized:
        return "Оплата доступа"
    if len(normalized) <= _YOOKASSA_DESCRIPTION_MAX_LENGTH:
        return normalized
    logger.info(
        "Описание платежа ЮKassa сокращено с %s до %s символов.",
        len(normalized),
        _YOOKASSA_DESCRIPTION_MAX_LENGTH,
    )
    return f"{normalized[:_YOOKASSA_DESCRIPTION_MAX_LENGTH - 1].rstrip()}…"


def _yookassa_credentials(creds: dict) -> tuple[str | None, str | None]:
    return (
        creds.get("shop_id") or creds.get("shopId"),
        creds.get("secret_key") or creds.get("secretKey") or creds.get("api_key"),
    )


async def validate_payment_credentials(provider: str | None, creds: dict | None) -> tuple[bool, str]:
    """Check payment credentials without creating a charge."""
    if not provider:
        return False, "Выберите платёжного провайдера."
    credentials = creds or {}
    normalized_provider = provider.lower()
    if normalized_provider == "yookassa":
        shop_id, secret_key = _yookassa_credentials(credentials)
        if not shop_id or not secret_key:
            return False, "Укажите Shop ID и секретный ключ ЮKassa."
        try:
            response = await http_client.get(
                "https://api.yookassa.ru/v3/me",
                auth=(str(shop_id), str(secret_key)),
            )
        except httpx.HTTPError:
            return False, "Не удалось связаться с ЮKassa. Проверьте интернет и повторите попытку."
        if response.status_code == 200:
            return True, "ЮKassa подключена."
        if response.status_code in (401, 403):
            return False, "ЮKassa отклонила реквизиты. Проверьте Shop ID и секретный ключ."
        return False, "ЮKassa временно не подтвердила реквизиты. Попробуйте сохранить позже."
    if normalized_provider == "robokassa":
        valid = bool(credentials.get("merchant_login") and credentials.get("password1"))
        return (True, "Реквизиты Robokassa заполнены.") if valid else (False, "Укажите Merchant Login и пароль Robokassa.")
    if normalized_provider == "prodamus":
        valid = bool(credentials.get("api_key") and credentials.get("domain"))
        return (True, "Реквизиты Prodamus заполнены.") if valid else (False, "Укажите API-ключ и домен Prodamus.")
    return False, "Этот платёжный провайдер не поддерживается."


async def generate_payment_link(
    bot_config: BotConfig,
    amount: float,
    description: str,
    lead_telegram_id: int,
    *,
    client_payment: ClientPayment | None = None,
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
        return await _create_yookassa_link(
            creds, amount, description, lead_telegram_id, bot_config, client_payment
        )
    elif provider == "robokassa":
        return await _create_robokassa_link(
            creds, amount, description, lead_telegram_id, bot_config, client_payment
        )
    elif provider == "prodamus":
        return await _create_prodamus_link(
            creds, amount, description, lead_telegram_id, bot_config, client_payment
        )
    else:
        logger.warning(f"Неподдерживаемый платежный провайдер: {provider}")
        return None


# ==========================================
# 1. ИНТЕГРАЦИЯ ЮKASSA
# ==========================================
async def _create_yookassa_link(
    creds: dict, amount: float, description: str, telegram_id: int,
    bot_config: BotConfig, client_payment: ClientPayment | None,
) -> Optional[str]:
    shop_id, api_key = _yookassa_credentials(creds)

    if not shop_id or not api_key:
        logger.error("Для ЮKassa не переданы shop_id или secret_key!")
        return None

    url = "https://api.yookassa.ru/v3/payments"
    headers = {
        "Idempotence-Key": client_payment.idempotence_key if client_payment else str(uuid.uuid4()),
        "Content-Type": "application/json",
    }

    # YooKassa returns a generic "description" validation error for some
    # otherwise valid Unicode offer texts. The full offer is displayed in
    # Telegram; the provider receives a stable ASCII order reference.
    if client_payment:
        provider_description = f"Payment {client_payment.id}"
        if len(_yookassa_description(description)) > 0 and len(description.strip()) > _YOOKASSA_DESCRIPTION_MAX_LENGTH:
            logger.info("Для ЮKassa используется безопасный номер заказа вместо длинного описания.")
    else:
        provider_description = "Payment"
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": "https://t.me/telegram"},
        "description": provider_description,
        "metadata": {
            "telegram_id": str(telegram_id),
            "bot_id": str(bot_config.id),
            **({"client_payment_id": str(client_payment.id), "tariff_id": client_payment.tariff_id} if client_payment else {}),
        },
        "receipt": {
            "customer": {"email": f"client_{telegram_id}@telegram-bot.ru"},
            "items": [
                {
                    "description": provider_description,
                    "quantity": "1.00",
                    "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                    "vat_code": 1,
                    "payment_mode": "full_prepayment",
                    "payment_subject": "service",
                }
            ],
        },
    }
    if bot_config.offer_installments:
        # YooKassa's documented "Плати частями" method. It is available only
        # for amounts from 1,000 to 50,000 RUB and enabled merchant accounts.
        if not 1_000 <= amount <= 50_000:
            logger.error("Рассрочка ЮKassa доступна только для суммы от 1 000 до 50 000 ₽.")
            return None
        payload["payment_method_data"] = {"type": "sber_bnpl"}

    try:
        response = await http_client.post(
            url, json=payload, headers=headers, auth=(str(shop_id), str(api_key))
        )
        if response.status_code == 200:
            data = response.json()
            if client_payment:
                await set_client_payment_provider_id(client_payment.id, str(data["id"]))
            logger.info(
                "Счёт ЮKassa создан: bot_id=%s, order_id=%s, provider_payment_id=%s, amount=%s",
                bot_config.id,
                client_payment.id if client_payment else None,
                data["id"],
                amount,
            )
            return data["confirmation"]["confirmation_url"]
        logger.error(f"Ошибка API ЮKassa: {response.text}")
    except Exception as e:
        logger.error(f"Сетевой сбой при обращении к ЮKassa: {e}")
    return None


# ==========================================
# 2. ИНТЕГРАЦИЯ РОБОКАССЫ
# ==========================================
async def _create_robokassa_link(
    creds: dict, amount: float, description: str, telegram_id: int,
    bot_config: BotConfig, client_payment: ClientPayment | None,
) -> Optional[str]:
    merchant_login = creds.get("merchant_login")
    password_1 = creds.get("password1") or creds.get("password_1")
    is_test = creds.get("is_test", True)

    if not merchant_login or not password_1:
        logger.error("Для Робокассы не переданы merchant_login или password_1!")
        return None

    inv_id = str(client_payment.id) if client_payment else str(uuid.uuid4())
    signature_parts = [f"shp_bot_id={bot_config.id}"]
    if client_payment:
        signature_parts.append(f"shp_client_payment_id={client_payment.id}")
    signature_parts.append(f"shp_telegram_id={telegram_id}")
    extra = ":".join(signature_parts)
    signature_str = f"{merchant_login}:{amount:.2f}:{inv_id}:{password_1}:{extra}"
    signature = hashlib.md5(signature_str.encode("utf-8")).hexdigest()

    params = {
        "MerchantLogin": merchant_login,
        "OutSum": f"{amount:.2f}",
        "InvId": str(inv_id),
        "SignatureValue": signature,
        "Description": description,
        "shp_bot_id": str(bot_config.id),
        "shp_telegram_id": str(telegram_id),
    }
    if is_test:
        params["IsTest"] = "1"

    if client_payment:
        params["shp_client_payment_id"] = str(client_payment.id)
        await set_client_payment_provider_id(client_payment.id, inv_id)

    return f"https://auth.robokassa.ru/Merchant/Index.aspx?{urlencode(params)}"


# ==========================================
# 3. ИНТЕГРАЦИЯ PRODAMUS
# ==========================================
async def _create_prodamus_link(
    creds: dict, amount: float, description: str, telegram_id: int,
    bot_config: BotConfig, client_payment: ClientPayment | None,
) -> Optional[str]:
    payment_page = creds.get("payment_page") or creds.get("domain", "")
    if payment_page and not payment_page.startswith("http"):
        payment_page = f"https://{payment_page}"
    payment_page = payment_page.rstrip("/") + "/"
    api_key = creds.get("api_key")

    if not payment_page or not api_key:
        logger.error("Для Prodamus не переданы payment_page или api_key!")
        return None

    prodamus = ProdamusPy(api_key)
    order_id = str(client_payment.id) if client_payment else f"{telegram_id}_{uuid.uuid4()}"

    data = {
        "do": "link",
        "order_id": order_id,
        "tg_user_id": str(telegram_id),
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
    if client_payment:
        await set_client_payment_provider_id(client_payment.id, order_id)

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


async def send_success_message(
    tg_bot_id: int,
    telegram_id: int,
    http_session: Any,
    tariff_snapshot: dict[str, Any] | None = None,
    client_payment: ClientPayment | None = None,
):
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
                if not node_success and tariff_snapshot:
                    tariff = tariff_snapshot
                    action_type = tariff.get("action_type") or tariff.get("actionType", "text")
                    action_data = tariff.get("action_data") or tariff.get("actionData", "")
                    if action_type == "group" and client_payment:
                        from services.chat_access import (
                            ChatAccessError,
                            chat_delivery_success_text,
                            issue_paid_chat_invite,
                        )

                        try:
                            invite_link = await issue_paid_chat_invite(
                                bot_config=bot_config,
                                payment=client_payment,
                                tariff=tariff,
                                http_session=http_session,
                            )
                            node_success = {
                                "content": chat_delivery_success_text(tariff, invite_link)
                            }
                        except ChatAccessError as exc:
                            logger.error(
                                "Не удалось выдать доступ в чат: bot_id=%s, payment_id=%s, error=%s",
                                bot_config.id,
                                client_payment.id,
                                exc,
                            )
                            node_success = {
                                "content": "⚠️ <b>Оплата получена.</b>\n\nМы не смогли автоматически выдать доступ в закрытый чат. Владелец уже уведомлён."
                            }
                            try:
                                from services.billing_notifications import notify_billing_user

                                await notify_billing_user(
                                    bot_config.owner.telegram_id,
                                    "⚠️ Оплата получена, но не удалось создать инвайт в закрытый чат. Проверьте права бота в чате и настройки тарифа.",
                                )
                            except Exception as notification_error:
                                logger.warning("Не удалось уведомить владельца о выдаче чата: %s", notification_error)
                    node_success = {
                        "content": f"✅ <b>Оплата успешно получена!</b>\n\nВаш доступ ({tariff.get('name', 'Тариф')}):\n{action_data}" if not node_success and action_type in ["link", "text", "group"] else (node_success or {"content": "✅ <b>Оплата успешно получена!</b>"})["content"],
                        "media_file_id": action_data if action_type == "file" else None,
                        "media_type": "photo" if action_type == "file" else None,
                    }
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
