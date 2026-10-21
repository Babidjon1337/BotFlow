import html
import json
import re
import hashlib
import hmac
import uuid
import httpx
from typing import Any, Optional
from urllib.parse import urlencode
from prodamuspy import ProdamusPy
from database.models import BotConfig, ClientPayment
from database.requests.client_payment_rq import set_client_payment_provider_id
from services.security import crypto
from loggers import logger
from config import WEBHOOK_URL

# Глобальный клиент для всех запросов
http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)


async def _safe_http_request(method: str, *args, **kwargs) -> httpx.Response:
    global http_client
    try:
        req_fn = getattr(http_client, method)
        return await req_fn(*args, **kwargs)
    except RuntimeError as e:
        if "Event loop is closed" in str(e) or "attached to a different loop" in str(e):
            http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
            req_fn = getattr(http_client, method)
            return await req_fn(*args, **kwargs)
        raise


_YOOKASSA_DESCRIPTION_MAX_LENGTH = 128



class PaymentDeliveryError(RuntimeError):
    """Paid access could not be delivered and must be retried."""


class RecurringPaymentDisabledError(Exception):
    """Raised when payment provider rejects recurring subscription charge because it is not enabled on the merchant account."""

    def __init__(self, message: str, provider: str = "yookassa", shop_id: str | None = None):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.shop_id = shop_id


_last_recurring_alert: dict[int, float] = {}


async def notify_bot_owner_recurring_disabled(
    bot_config: Any,
    client_payment: Any | None = None,
    shop_id: str | None = None,
    provider: str = "yookassa",
) -> None:
    """Notify the bot owner about recurring payments being disabled on their payment account."""
    import time
    from database.models import async_session, User
    from services.billing_notifications import notify_billing_user

    bot_id = getattr(bot_config, "id", None)
    now = time.time()
    # Rate limit alerts to once per 10 minutes per bot to prevent spamming
    if bot_id and (now - _last_recurring_alert.get(bot_id, 0)) < 600:
        logger.info("Уведомление о рекурренте для бота %s уже отправлялось недавно, пропускаем дубль", bot_id)
        return
    if bot_id:
        _last_recurring_alert[bot_id] = now

    owner_tg_id = None
    if getattr(bot_config, "owner", None) and getattr(bot_config.owner, "telegram_id", None):
        owner_tg_id = bot_config.owner.telegram_id
    elif getattr(bot_config, "owner_id", None):
        try:
            async with async_session() as session:
                user = await session.get(User, bot_config.owner_id)
                if user:
                    owner_tg_id = user.telegram_id
        except Exception as e:
            logger.warning("Не удалось загрузить владельца бота %s: %s", bot_id, e)

    bot_name = getattr(bot_config, "display_name", None) or getattr(bot_config, "username", None) or f"ID {bot_id}"
    tariff_name = "с подпиской"
    amount_str = ""
    if client_payment:
        snap = getattr(client_payment, "tariff_snapshot", None) or {}
        tariff_name = snap.get("name") or "с подпиской"
        amount = getattr(client_payment, "amount", None)
        if amount:
            amount_str = f" ({float(amount):,.0f} ₽)"

    shop_info = f" (Shop ID: <code>{shop_id}</code>)" if shop_id else ""

    text = (
        f"⚠️ <b>Ошибка оплаты в боте «{bot_name}»</b>\n\n"
        f"Клиент попытался оплатить тариф «<b>{tariff_name}</b>»{amount_str}, "
        f"но платёж был отклонён платёжной системой <b>ЮKassa</b>{shop_info}.\n\n"
        f"❌ <b>Причина:</b> В настройках вашего магазина ЮKassa <b>не включены рекуррентные платежи (подписки)</b>.\n\n"
        f"🛠 <b>Что нужно сделать (варианты решения):</b>\n\n"
        f"1️⃣ <b>Подключить рекуррент в ЮKassa (рекомендуется):</b>\n"
        f"Напишите вашему менеджеру в ЮKassa или в поддержку ЮMoney на <code>merchants@yoomoney.ru</code>:\n"
        f"<i>«Здравствуйте! Прошу подключить возможность приёма рекуррентных платежей (автосписания/подписки) для магазина {shop_id or ''}»</i>.\n"
        f"Обычно подключение занимает 1–2 рабочих дня.\n\n"
        f"2️⃣ <b>Сделать тариф разовым платежом:</b>\n"
        f"Если вам не нужны автосписания каждый месяц, откройте конструктор бота, "
        f"выберите блок тарифов и измените тип платежа этого тарифа с <i>«Рекуррентный (подписка)»</i> на <i>«Разовый»</i>.\n\n"
        f"3️⃣ <b>Использовать тестовую кассу:</b>\n"
        f"Если вы сейчас тестируете бота, подключите тестовый магазин ЮKassa (в тестовых кассах рекуррентные списания работают сразу)."
    )

    if owner_tg_id:
        try:
            await notify_billing_user(owner_tg_id, text)
            logger.info("Уведомление об ошибке рекуррента успешно отправлено владельцу %s бота %s", owner_tg_id, bot_id)
        except Exception as e:
            logger.warning("Не удалось отправить сообщение владельцу %s: %s", owner_tg_id, e)

    try:
        from services.event_bus import event_bus
        if owner_tg_id:
            event_bus.publish_user(
                owner_tg_id,
                "bot:payment_error",
                {
                    "bot_id": bot_id,
                    "error_type": "recurring_disabled",
                    "provider": provider,
                    "shop_id": shop_id,
                    "tariff_name": tariff_name,
                    "message": "В ЮKassa не включены рекуррентные платежи",
                },
            )
    except Exception:
        pass


def _clean_payment_description(description: str, max_length: int = 120) -> str:
    """Strip HTML tags, unescape entities, collapse whitespace, and truncate safely."""
    text = re.sub(r"<[^>]+>", " ", description)
    text = html.unescape(text)
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return "Оплата доступа"
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[:max_length - 1].rstrip()}…"


def _yookassa_description(description: str) -> str:
    """Normalize provider-facing description without losing the user-facing offer."""
    return _clean_payment_description(
        description, max_length=_YOOKASSA_DESCRIPTION_MAX_LENGTH
    )


def _yookassa_credentials(creds: dict) -> tuple[str | None, str | None]:
    return (
        creds.get("shop_id") or creds.get("shopId"),
        creds.get("secret_key") or creds.get("secretKey") or creds.get("api_key"),
    )


async def validate_payment_credentials(
    provider: str | None, creds: dict | None
) -> tuple[bool, str]:
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
            response = await _safe_http_request(
                "get",
                "https://api.yookassa.ru/v3/me",
                auth=(str(shop_id), str(secret_key)),
            )
        except httpx.HTTPError:
            return (
                False,
                "Не удалось связаться с ЮKassa. Проверьте интернет и повторите попытку.",
            )
        if response.status_code == 200:
            return True, "ЮKassa подключена."
        if response.status_code in (401, 403):
            return (
                False,
                "ЮKassa отклонила реквизиты. Проверьте Shop ID и секретный ключ.",
            )
        return (
            False,
            "ЮKassa временно не подтвердила реквизиты. Попробуйте сохранить позже.",
        )
    if normalized_provider == "robokassa":
        valid = bool(
            credentials.get("merchant_login")
            and (credentials.get("password1") or credentials.get("password_1"))
            and (credentials.get("password2") or credentials.get("password_2"))
        )
        return (
            (True, "Реквизиты Robokassa заполнены.")
            if valid
            else (
                False,
                "Укажите Merchant Login, пароль №1 и пароль №2 Robokassa.",
            )
        )
    if normalized_provider == "prodamus":
        valid = bool(
            (credentials.get("api_key") or credentials.get("secret") or credentials.get("secret_key") or credentials.get("token"))
            and (credentials.get("domain") or credentials.get("payment_page") or credentials.get("subdomain") or credentials.get("shop_id"))
        )
        return (
            (True, "Реквизиты Prodamus заполнены.")
            if valid
            else (
                False,
                "Укажите API-ключ и домен платёжной страницы Prodamus.",
            )
        )
    return False, "Этот платёжный провайдер не поддерживается."


def get_checkout_page_url(payment_id: uuid.UUID | str) -> str:
    """Return checkout web page URL for the given payment."""
    import time
    from config import WEBAPP_URL, WEBHOOK_URL
    base = (WEBAPP_URL or WEBHOOK_URL or "https://botflow.malinaezo.ru").rstrip("/")
    return f"{base}/checkout/{payment_id}?v={int(time.time())}"


async def generate_payment_link(
    bot_config: BotConfig,
    amount: float,
    description: str,
    lead_telegram_id: int,
    *,
    client_payment: ClientPayment | None = None,
    installments: bool = False,
    customer_email: str | None = None,
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
            creds,
            amount,
            description,
            lead_telegram_id,
            bot_config,
            client_payment,
            installments,
            customer_email=customer_email,
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
def _build_yookassa_receipt(
    description: str,
    amount: float,
    telegram_id: int,
    bot_config: Any,
    creds: dict | None = None,
    customer_email: str | None = None,
) -> dict[str, Any]:
    credentials = creds or {}
    email_to_use = (
        customer_email
        or credentials.get("receipt_email")
        or credentials.get("customer_email")
        or f"tg_{telegram_id}@{getattr(bot_config, 'username', None) or 'buyer'}.t.me"
    )
    vat_code = int(credentials.get("vat_code") or 1)
    return {
        "customer": {"email": email_to_use},
        "items": [
            {
                "description": _clean_payment_description(description, max_length=128),
                "quantity": "1.00",
                "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                "vat_code": vat_code,
                "payment_mode": "full_payment",
                "payment_subject": "service",
            }
        ],
    }


async def _create_yookassa_link(
    creds: dict,
    amount: float,
    description: str,
    telegram_id: int,
    bot_config: BotConfig,
    client_payment: ClientPayment | None,
    installments: bool = False,
    customer_email: str | None = None,
) -> Optional[str]:
    shop_id, api_key = _yookassa_credentials(creds)

    if not shop_id or not api_key:
        logger.error("Для ЮKassa не переданы shop_id или secret_key!")
        return None

    url = "https://api.yookassa.ru/v3/payments"
    headers = {
        "Idempotence-Key": (
            client_payment.idempotence_key if client_payment else str(uuid.uuid4())
        ),
        "Content-Type": "application/json",
    }

    # YooKassa returns a generic "description" validation error for some
    # otherwise valid Unicode offer texts. The full offer is displayed in
    # Telegram; the provider receives a stable ASCII order reference.
    if client_payment:
        provider_description = f"Payment {client_payment.id}"
        if (
            len(_yookassa_description(description)) > 0
            and len(description.strip()) > _YOOKASSA_DESCRIPTION_MAX_LENGTH
        ):
            logger.info(
                "Для ЮKassa используется безопасный номер заказа вместо длинного описания."
            )
    else:
        provider_description = "Payment"
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": (
                f"https://t.me/{bot_config.username}"
                if bot_config.username
                else "https://t.me/telegram"
            ),
        },
        "description": provider_description,
        "metadata": {
            "telegram_id": str(telegram_id),
            "bot_id": str(bot_config.id),
            **(
                {
                    "client_payment_id": str(client_payment.id),
                    "tariff_id": client_payment.tariff_id,
                }
                if client_payment
                else {}
            ),
        },
    }
    tariff_snapshot = (client_payment.tariff_snapshot or {}) if client_payment else {}
    if (
        tariff_snapshot.get("payment_type") == "recurring"
        or tariff_snapshot.get("paymentType") == "recurring"
    ):
        payload["save_payment_method"] = True
    # A YooKassa shop can be connected to several client bots. The callback
    # must identify the bot that created this payment rather than rely on one
    # shop-wide notification URL configured in the YooKassa dashboard.
    if WEBHOOK_URL:
        payload["notification_url"] = (
            f"{WEBHOOK_URL.rstrip('/')}/webhook/payments/yookassa/{bot_config.tg_bot_id}"
        )
    # We don't force 'sber_bnpl' anymore. Users can choose it on the YooKassa checkout page natively.

    if customer_email:
        payload["receipt"] = _build_yookassa_receipt(
            description, amount, telegram_id, bot_config, creds, customer_email=customer_email
        )

    try:
        response = await _safe_http_request(
            "post", url, json=payload, headers=headers, auth=(str(shop_id), str(api_key))
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

        resp_lower = response.text.lower()
        if response.status_code == 400 and "receipt" in resp_lower:
            # 1. Если магазин в ЮKassa требует фискальный чек (54-ФЗ)
            logger.warning(
                "У магазина ЮKassa включена фискализация (54-ФЗ), но чек не был передан (%s). Повторяем с объектом receipt...",
                response.text[:200],
            )
            receipt_payload = dict(payload)
            receipt_payload["receipt"] = _build_yookassa_receipt(
                description, amount, telegram_id, bot_config, creds, customer_email=customer_email
            )
            receipt_headers = dict(headers)
            receipt_headers["Idempotence-Key"] = str(uuid.uuid4())
            receipt_resp = await _safe_http_request(
                "post",
                url,
                json=receipt_payload,
                headers=receipt_headers,
                auth=(str(shop_id), str(api_key)),
            )
            if receipt_resp.status_code == 200:
                data = receipt_resp.json()
                if client_payment:
                    await set_client_payment_provider_id(client_payment.id, str(data["id"]))
                logger.info("Счёт ЮKassa с фискализацией успешно создан: order_id=%s", data["id"])
                return data["confirmation"]["confirmation_url"]

            if (receipt_resp.status_code in (400, 403)) and receipt_payload.get("save_payment_method"):
                receipt_resp_lower = receipt_resp.text.lower()
                if (
                    "recurring" in receipt_resp_lower
                    or "forbidden" in receipt_resp_lower
                    or "save_payment_method" in receipt_resp_lower
                    or "can't make recurring" in receipt_resp_lower
                ):
                    logger.warning("ЮKassa с чеком отклонила рекуррентный платёж: %s", receipt_resp.text[:200])
                    await notify_bot_owner_recurring_disabled(
                        bot_config, client_payment, shop_id=str(shop_id), provider="yookassa"
                    )
                    raise RecurringPaymentDisabledError(
                        "Рекуррентные платежи не подключены в магазине ЮKassa",
                        provider="yookassa",
                        shop_id=str(shop_id),
                    )

        # 2. Если магазин отклонил save_payment_method (400 или 403 Forbidden "This store can't make recurring payments")
        elif (response.status_code in (400, 403)) and payload.get("save_payment_method"):
            if (
                "recurring" in resp_lower
                or "forbidden" in resp_lower
                or "save_payment_method" in resp_lower
                or "can't make recurring" in resp_lower
            ):
                logger.warning(
                    "ЮKassa отклонила рекуррентный платёж (status=%s: %s). Оповещаем владельца бота...",
                    response.status_code,
                    response.text[:200],
                )
                await notify_bot_owner_recurring_disabled(
                    bot_config, client_payment, shop_id=str(shop_id), provider="yookassa"
                )
                raise RecurringPaymentDisabledError(
                    "Рекуррентные платежи не подключены в магазине ЮKassa",
                    provider="yookassa",
                    shop_id=str(shop_id),
                )

        logger.error(f"Ошибка API ЮKassa: {response.text}")
    except RecurringPaymentDisabledError:
        raise
    except Exception as e:
        logger.error(f"Сетевой сбой при обращении к ЮKassa: {e}")
    return None


# ==========================================
# 2. ИНТЕГРАЦИЯ РОБОКАССЫ
# ==========================================
async def _create_robokassa_link(
    creds: dict,
    amount: float,
    description: str,
    telegram_id: int,
    bot_config: BotConfig,
    client_payment: ClientPayment | None,
) -> Optional[str]:
    merchant_login = creds.get("merchant_login") or creds.get("login")
    password_1 = creds.get("password_1") or creds.get("password1")
    is_test = creds.get("is_test", True)

    if not merchant_login or not password_1:
        logger.error("Для Робокассы не переданы merchant_login или password_1!")
        return None

    inv_id = (
        str(client_payment.provider_order_number)
        if client_payment
        else str(uuid.uuid4().int % 9_223_372_036_854_775_807 or 1)
    )
    signature_parts = [f"shp_bot_id={bot_config.id}"]
    if client_payment:
        signature_parts.append(f"shp_client_payment_id={client_payment.id}")
    signature_parts.append(f"shp_telegram_id={telegram_id}")
    extra = ":".join(signature_parts)
    signature_str = f"{merchant_login}:{amount:.2f}:{inv_id}:{password_1}:{extra}"
    algorithm = str(creds.get("hash_algorithm") or "md5").casefold()
    if algorithm not in {"md5", "sha256", "sha512"}:
        logger.error("Неподдерживаемый алгоритм подписи Robokassa: %s", algorithm)
        return None
    digest = hashlib.new(algorithm)
    digest.update(signature_str.encode("utf-8"))
    signature = digest.hexdigest()

    params = {
        "MerchantLogin": merchant_login,
        "OutSum": f"{amount:.2f}",
        "InvId": str(inv_id),
        "SignatureValue": signature,
        "Description": _yookassa_description(description)[:100],
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
def _sign_prodamus_data(data: dict[str, Any], secret: str) -> str:
    """
    Sign Prodamus payload matching Prodamus PHP backend behavior.
    PHP's json_encode($data, JSON_UNESCAPED_UNICODE) escapes '/' as '\\/' by default.
    Python's standard json.dumps does not escape '/', which causes signature verification
    failure on the Prodamus server whenever any URL or slash is present.
    """
    raw_json = json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    php_json = raw_json.replace('/', r'\/')
    return hmac.new(
        bytes(str(secret).strip(), 'utf-8'),
        msg=bytes(php_json, 'utf-8'),
        digestmod=hashlib.sha256,
    ).hexdigest()


async def _create_prodamus_link(
    creds: dict,
    amount: float,
    description: str,
    telegram_id: int,
    bot_config: BotConfig,
    client_payment: ClientPayment | None,
) -> Optional[str]:
    payment_page = (
        creds.get("payment_page")
        or creds.get("domain")
        or creds.get("subdomain")
        or creds.get("shop_id")
        or ""
    )
    if payment_page:
        s = payment_page.strip().rstrip("/")
        if not s.startswith("http"):
            if "." not in s:
                s = f"https://{s}.payform.ru"
            else:
                s = f"https://{s}"
        payment_page = s.rstrip("/") + "/"
    api_key = (
        creds.get("api_key")
        or creds.get("secret")
        or creds.get("secret_key")
        or creds.get("token")
        or ""
    )
    integration_code = creds.get("sys") or creds.get("integration_code")

    if not payment_page or not api_key:
        logger.error("Для Prodamus не переданы domain или api_key!")
        return None

    order_id = (
        str(client_payment.id) if client_payment else f"{telegram_id}_{uuid.uuid4()}"
    )

    data = {
        "do": "link",
        "order_id": order_id,
        "tg_user_id": str(telegram_id),
        "customer_extra": str(telegram_id),
        "products": [
            {
                "name": _clean_payment_description(description, max_length=120),
                "price": f"{amount:.2f}",
                "quantity": "1",
                "type": "service",
            }
        ],
    }
    tariff_snapshot = (client_payment.tariff_snapshot or {}) if client_payment else {}
    if (
        tariff_snapshot.get("payment_type") == "recurring"
        or tariff_snapshot.get("paymentType") == "recurring"
    ):
        data["subscription"] = "1"
        data["subscription_auto"] = "0"
        data["recurring"] = "1"
        data["binding"] = "1"
        period = (
            tariff_snapshot.get("recurring_period")
            or tariff_snapshot.get("recurringPeriod")
            or tariff_snapshot.get("billing_period")
            or tariff_snapshot.get("billingPeriod")
        )
        if period:
            data["recurring_period"] = str(period)
            data["subscription_period"] = str(period)
    if getattr(bot_config, "username", None):
        clean_username = bot_config.username.lstrip("@")
        bot_url = f"https://t.me/{clean_username}"
        data["url_success"] = bot_url
        data["url_return"] = bot_url

    demo_mode_val = creds.get("demo_mode")
    if demo_mode_val is None:
        demo_mode_val = creds.get("is_test")
    if demo_mode_val and str(demo_mode_val).strip().lower() in {"1", "true", "yes"}:
        data["demo_mode"] = "1"
    if integration_code:
        data["sys"] = str(integration_code)
    data["signature"] = _sign_prodamus_data(data, api_key)

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
        response = await _safe_http_request("get", payment_page, params=flat_params)
        if response.status_code == 200:
            content = response.text.strip()
            found = re.findall(r"https?://payform\.ru/[a-zA-Z0-9]+/?", content)
            if found:
                return found[0]
            err_clean = re.sub(r"<[^>]+>", " ", content)
            err_clean = " ".join(err_clean.split())[:200]
            logger.error("Prodamus вернул страницу без ссылки (200): %s", err_clean)
        else:
            logger.error(
                "Prodamus API error %s: %s", response.status_code, response.text[:200]
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
        raise PaymentDeliveryError("Конфигурация бота или воронки недоступна.")

    try:
        token = crypto.decrypt(bot_config.bot_token_enc)
        funnel_schema = bot_config.funnel_schema
        node_success = None

        if isinstance(funnel_schema, dict):
            nodes = funnel_schema.get("nodes")
            if isinstance(nodes, list):
                configured_success = next(
                    (
                        n
                        for n in nodes
                        if n.get("id") in ["success", "delivery", "node_success"]
                    ),
                    None,
                )
                if tariff_snapshot:
                    tariff = tariff_snapshot
                    is_free = (client_payment and getattr(client_payment, "provider", "") == "free") or (float(tariff.get("price", 0) or 0) <= 0)
                    header_text = "✅ <b>Доступ успешно получен!</b>" if is_free else "✅ <b>Оплата успешно получена!</b>"
                    deliverables = tariff.get("deliverables")
                    if not deliverables and client_payment and getattr(client_payment, "tariff_id", None):
                        try:
                            from database.requests.tariff_rq import get_tariff_by_id
                            db_t = await get_tariff_by_id(client_payment.tariff_id)
                            if db_t and getattr(db_t, "deliverables", None):
                                deliverables = db_t.deliverables
                        except Exception:
                            pass
                    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

                    items: list[dict] = []
                    if deliverables and isinstance(deliverables, list) and len(deliverables) > 0:
                        items = [d for d in deliverables if isinstance(d, dict)]
                    else:
                        legacy_type = tariff.get("action_type") or tariff.get("actionType", "text")
                        legacy_data = tariff.get("action_data") or tariff.get("actionData", "")
                        has_del = tariff.get("has_delivery", tariff.get("hasDelivery", True))
                        if has_del and legacy_data:
                            if legacy_type == "group":
                                from services.chat_access import _parse_chat_ids
                                for cid in _parse_chat_ids(str(legacy_data)):
                                    items.append({"type": "group", "chatId": cid, "title": "Вступить в закрытый чат"})
                            elif legacy_type in ("link", "text") and str(legacy_data).startswith(("http://", "https://")):
                                items.append({"type": "link", "url": str(legacy_data), "title": "Открыть доступ"})
                            elif legacy_type == "file":
                                items.append({"type": "file", "filePath": str(legacy_data), "title": "Скачать файл"})
                            elif legacy_type == "text":
                                items.append({"type": "text", "content": str(legacy_data)})

                    has_delivery = tariff.get("has_delivery", tariff.get("hasDelivery", True))
                    if has_delivery and not items:
                        logger.error(
                            "The tariff delivery is empty for bot %s, payment %s",
                            bot_config.id,
                            client_payment.id if client_payment else "none",
                        )
                        try:
                            from services.billing_notifications import notify_billing_user
                            await notify_billing_user(
                                bot_config.owner.telegram_id,
                                "⚠️ Пользователь оформил доступ, но в настройках тарифа не указано, что именно нужно выдать (пустое поле). Свяжитесь с клиентом вручную.",
                            )
                        except Exception:
                            pass
                        node_success = {
                            "content": f"{header_text}\n\nК сожалению, произошла заминка: в системе не настроена автоматическая выдача для этого тарифа. Администратор уже уведомлен об этом и свяжется с вами в ближайшее время."
                        }
                    elif items:
                        chat_items = [d for d in items if d.get("type") in ("channel", "group")]
                        link_items = [d for d in items if d.get("type") == "link"]
                        file_items = [d for d in items if d.get("type") == "file"]
                        text_items = [d for d in items if d.get("type") == "text"]

                        buttons: list[list[InlineKeyboardButton]] = []
                        media_file_id = None
                        media_type = None
                        chat_error = None

                        # 1. Process Telegram Channels and Groups
                        if chat_items and client_payment:
                            from services.chat_access import issue_paid_chat_invites, ChatAccessError
                            try:
                                invite_links = await issue_paid_chat_invites(
                                    bot_config=bot_config,
                                    payment=client_payment,
                                    tariff=tariff,
                                    http_session=http_session,
                                )
                                for i, d in enumerate(chat_items):
                                    lnk = invite_links[i] if i < len(invite_links) else (invite_links[0] if invite_links else None)
                                    if not lnk:
                                        continue
                                    d_title = (d.get("title") or "").strip()
                                    d_type = d.get("type")
                                    icon = "📢" if d_type == "channel" else "💬"
                                    if d_title:
                                        btn_text = d_title if d_title.startswith(("📢", "💬", "👥", "👉", "🔗", "✨")) else f"{icon} {d_title}"
                                    else:
                                        if d_type == "channel":
                                            btn_text = f"📢 Вступить в канал {i + 1}" if len(chat_items) > 1 else "📢 Вступить в канал"
                                        else:
                                            btn_text = f"💬 Вступить в чат {i + 1}" if len(chat_items) > 1 else "💬 Вступить в закрытый чат"
                                    buttons.append([InlineKeyboardButton(text=btn_text, url=lnk)])
                            except ChatAccessError as exc:
                                logger.error(
                                    "Не удалось выдать доступ в чат: bot_id=%s, payment_id=%s, error=%s",
                                    bot_config.id,
                                    client_payment.id,
                                    exc,
                                )
                                chat_error = exc
                                try:
                                    from services.billing_notifications import notify_billing_user
                                    await notify_billing_user(
                                        bot_config.owner.telegram_id,
                                        f"⚠️ Клиент оформил доступ, но не удалось создать инвайт в закрытый чат.\nОшибка: {exc}\nСвяжитесь с клиентом вручную, чтобы выдать доступ.",
                                    )
                                except Exception:
                                    pass

                        # 2. Process Links (external links, websites, Notion, etc.) - ALWAYS in buttons!
                        for d in link_items:
                            l_url = (d.get("url") or d.get("linkUrl") or "").strip()
                            if l_url:
                                l_title = (d.get("title") or "").strip()
                                if l_title:
                                    btn_text = l_title if l_title.startswith(("🔗", "👉", "🌐", "💻", "📚", "✨")) else f"🔗 {l_title}"
                                else:
                                    btn_text = "🔗 Открыть доступ"
                                buttons.append([InlineKeyboardButton(text=btn_text, url=l_url)])

                        # 3. Process Files
                        delivery_doc_assets: list[dict[str, Any]] = []
                        for d in file_items:
                            f_path = (d.get("filePath") or d.get("file_path") or d.get("url") or d.get("fileId") or "").strip()
                            if f_path:
                                if f_path.startswith(("http://", "https://")):
                                    f_title = (d.get("title") or "Скачать файл").strip()
                                    buttons.append([InlineKeyboardButton(text=f"📥 {f_title}", url=f_path)])
                                else:
                                    delivery_doc_assets.append({
                                        "mediaFileId": f_path,
                                        "mediaType": "document",
                                        "fileName": d.get("fileName") or d.get("title") or "document",
                                    })

                        title = str(tariff.get("name") or tariff.get("title") or "Тариф")
                        content_lines = [f"{header_text}\n\nДоступ к «{title}» активирован."]
                        if tariff.get("description"):
                            content_lines.append(f"\n{tariff.get('description')}")
                        if buttons or file_items:
                            content_lines.append("Все доступы и материалы открыты по кнопкам ниже 👇")
                        if chat_items and not chat_error:
                            if len(chat_items) > 1:
                                content_lines.append("\n<i>Ссылки на каналы и чаты персональные и сработают только один раз.</i>")
                            else:
                                content_lines.append("\n<i>Ссылка на вступление персональная и сработает только для одного входа.</i>")
                        elif chat_error and not buttons:
                            content_lines.append("\nК сожалению, произошла небольшая заминка при генерации ссылки на чат. Администратор уже уведомлен и свяжется с вами!")

                        if text_items:
                            content_lines.append("\n" + "\n".join(str(t.get("content", "")) for t in text_items if t.get("content")))

                        raw_tariff_assets = list(tariff.get("media_assets") or tariff.get("mediaAssets") or [])
                        if not raw_tariff_assets and tariff.get("media_file_id"):
                            raw_tariff_assets.append({
                                "mediaFileId": tariff.get("media_file_id"),
                                "mediaType": tariff.get("media_type") or "photo",
                            })

                        # Delivery documents are sent first, followed by tariff description media (photo/video)
                        combined_delivery_assets = delivery_doc_assets + raw_tariff_assets
                        primary_file_id = combined_delivery_assets[0]["mediaFileId"] if combined_delivery_assets else None
                        primary_media_type = combined_delivery_assets[0]["mediaType"] if combined_delivery_assets else None

                        node_success = {
                            "content": "\n".join(content_lines),
                            "media_file_id": primary_file_id,
                            "media_type": primary_media_type,
                            "media_assets": combined_delivery_assets,
                            "reply_markup": InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None,
                        }
                if not node_success:
                    node_success = configured_success
                if not node_success:
                    payment_node = next(
                        (n for n in nodes if n.get("id") == "payment"), None
                    )
                    if payment_node and payment_node.get("tariffs"):
                        tariff = payment_node["tariffs"][0]
                        if tariff.get("has_delivery", True) or tariff.get(
                            "hasDelivery", True
                        ):
                            action_type = tariff.get("action_type") or tariff.get(
                                "actionType", "text"
                            )
                            action_data = tariff.get("action_data") or tariff.get(
                                "actionData", ""
                            )
                            reply_markup = None
                            if action_type in ["link", "text"] and str(action_data).startswith(("http://", "https://")):
                                from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
                                reply_markup = InlineKeyboardMarkup(
                                    inline_keyboard=[[InlineKeyboardButton(text="🔗 Открыть доступ", url=str(action_data))]]
                                )
                                content_text = f"✅ <b>Оплата успешно получена!</b>\n\nДоступ к «{tariff.get('name', 'Тариф')}» активирован.\nНажмите кнопку ниже, чтобы открыть доступ:"
                            elif action_type in ["link", "text"] and action_data:
                                content_text = f"✅ <b>Оплата успешно получена!</b>\n\nВаш доступ ({tariff.get('name', 'Тариф')}):\n{action_data}"
                            else:
                                content_text = "✅ <b>Оплата успешно получена!</b>"

                            node_success = {
                                "content": content_text,
                                "media_file_id": (
                                    action_data if action_type == "file" else None
                                ),
                                "media_type": (
                                    "document" if action_type == "file" else None
                                ),
                                "reply_markup": reply_markup,
                            }
            elif isinstance(nodes, dict):
                node_success = (
                    nodes.get("node_success")
                    or nodes.get("success")
                    or nodes.get("delivery")
                )

        if node_success:
            node_success = dict(node_success) if isinstance(node_success, dict) else node_success
            tariff_data = (
                tariff_snapshot
                or (client_payment.tariff_snapshot if client_payment else None)
                or {}
            )
            is_recurring = (
                tariff_data.get("payment_type") == "recurring"
                or tariff_data.get("paymentType") == "recurring"
            )
            if is_recurring and isinstance(node_success, dict):
                cur_content = node_success.get("content") or ""
                if "/sub" not in cur_content:
                    node_success["content"] = (
                        cur_content.rstrip()
                        + "\n\n<i>ℹ️ Управлять своими подписками и автосписанием вы можете по кнопке ниже или командами /sub и /help.</i>"
                    )
                from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
                sub_btn = InlineKeyboardButton(
                    text="⚙️ Управление подпиской", callback_data="my_subscriptions"
                )
                existing_markup = node_success.get("reply_markup")
                if existing_markup is None:
                    node_success["reply_markup"] = InlineKeyboardMarkup(
                        inline_keyboard=[[sub_btn]]
                    )
                elif isinstance(existing_markup, InlineKeyboardMarkup):
                    new_keyboard = [list(r) for r in existing_markup.inline_keyboard]
                    has_sub = any(
                        any(getattr(b, "callback_data", None) == "my_subscriptions" for b in r)
                        for r in new_keyboard
                    )
                    if not has_sub:
                        new_keyboard.append([sub_btn])
                        node_success["reply_markup"] = InlineKeyboardMarkup(inline_keyboard=new_keyboard)

            bot = Bot(
                token=token,
                session=http_session,
                default=DefaultBotProperties(parse_mode="HTML"),
            )
            await send_funnel_node_message(
                bot=bot,
                chat_id=telegram_id,
                node=node_success,
                reply_markup=(
                    node_success.get("reply_markup")
                    if isinstance(node_success, dict)
                    else None
                ),
            )
            logger.info(f"✅ Сообщение об успехе отправлено {telegram_id}")
            return
        raise PaymentDeliveryError("В оплаченном тарифе нет контента для выдачи.")

    except Exception as e:
        logger.error(f"Ошибка отправки сообщения пользователю {telegram_id}: {e}")
        if isinstance(e, PaymentDeliveryError):
            raise
        raise PaymentDeliveryError(str(e)) from e
