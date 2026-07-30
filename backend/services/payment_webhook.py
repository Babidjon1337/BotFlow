"""Provider-specific validation for payment notifications.

No notification may grant access before the provider-specific checks in this
module have completed successfully.
"""

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Mapping

import httpx


class PaymentWebhookError(ValueError):
    """Raised when a payment notification is malformed or untrusted."""


class PaymentProviderUnavailable(RuntimeError):
    """Raised when a provider cannot be reached for mandatory verification."""


@dataclass(frozen=True)
class VerifiedPayment:
    provider: str
    payment_id: str
    telegram_id: int


def _get_credentials(bot_config: Any) -> dict[str, Any]:
    if not bot_config.payment_creds_enc:
        raise PaymentWebhookError("Payment credentials are not configured")
    try:
        from services.security import crypto

        credentials = json.loads(crypto.decrypt(bot_config.payment_creds_enc))
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PaymentWebhookError("Payment credentials are invalid") from exc
    if not isinstance(credentials, dict):
        raise PaymentWebhookError("Payment credentials are invalid")
    return credentials


def _value(data: Mapping[str, Any], *names: str) -> str | None:
    normalized = {str(key).casefold(): value for key, value in data.items()}
    for name in names:
        value = normalized.get(name.casefold())
        if value is not None:
            return str(value)
    return None


async def verify_payment_notification(
    provider: str, bot_config: Any, payload: Mapping[str, Any], headers: Mapping[str, str]
) -> VerifiedPayment:
    """Verify a successful notification and return its trusted payment data."""
    normalized_provider = provider.casefold()
    credentials = _get_credentials(bot_config)

    if normalized_provider == "yookassa":
        return await _verify_yookassa(bot_config, credentials, payload)
    if normalized_provider == "robokassa":
        return _verify_robokassa(credentials, payload)
    if normalized_provider == "prodamus":
        return _verify_prodamus(credentials, payload, headers)
    raise PaymentWebhookError("Unsupported payment provider")


async def _verify_yookassa(
    bot_config: Any, credentials: Mapping[str, Any], payload: Mapping[str, Any]
) -> VerifiedPayment:
    payment = payload.get("object")
    payment_id = payment.get("id") if isinstance(payment, Mapping) else None
    if payload.get("event") != "payment.succeeded" or not payment_id:
        raise PaymentWebhookError("Unexpected YooKassa notification")

    shop_id = credentials.get("shop_id") or credentials.get("shopId")
    secret_key = credentials.get("secret_key") or credentials.get("secretKey") or credentials.get("api_key")
    if not shop_id or not secret_key:
        raise PaymentWebhookError("YooKassa credentials are incomplete")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.yookassa.ru/v3/payments/{payment_id}",
                auth=(str(shop_id), str(secret_key)),
            )
    except httpx.HTTPError as exc:
        raise PaymentProviderUnavailable("YooKassa verification is unavailable") from exc

    if response.status_code >= 500:
        raise PaymentProviderUnavailable("YooKassa verification is unavailable")
    if response.status_code != 200:
        raise PaymentWebhookError("YooKassa payment was not found")

    try:
        verified_payment = response.json()
        metadata = verified_payment["metadata"]
        telegram_id = int(metadata["telegram_id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PaymentWebhookError("YooKassa payment metadata is invalid") from exc

    if (
        verified_payment.get("id") != payment_id
        or verified_payment.get("status") != "succeeded"
        or verified_payment.get("paid") is not True
    ):
        raise PaymentWebhookError("YooKassa payment is not successful")

    payment_bot_id = metadata.get("bot_id")
    if payment_bot_id is not None and str(payment_bot_id) != str(bot_config.id):
        raise PaymentWebhookError("YooKassa payment belongs to another bot")

    return VerifiedPayment("yookassa", str(payment_id), telegram_id)


def _verify_robokassa(
    credentials: Mapping[str, Any], payload: Mapping[str, Any]
) -> VerifiedPayment:
    out_sum = _value(payload, "OutSum")
    invoice_id = _value(payload, "InvId", "InvID")
    signature = _value(payload, "SignatureValue")
    password_2 = credentials.get("password_2") or credentials.get("password2")
    if not out_sum or invoice_id is None or not signature or not password_2:
        raise PaymentWebhookError("Robokassa notification is incomplete")

    custom_parameters = sorted(
        (
            (str(key), str(value))
            for key, value in payload.items()
            if str(key).casefold().startswith("shp_")
        ),
        key=lambda item: item[0].casefold(),
    )
    signature_parts = [out_sum, invoice_id, str(password_2)]
    signature_parts.extend(f"{key}={value}" for key, value in custom_parameters)
    expected_signature = hashlib.md5(":".join(signature_parts).encode()).hexdigest()
    if not hmac.compare_digest(expected_signature.casefold(), signature.casefold()):
        raise PaymentWebhookError("Robokassa signature is invalid")

    telegram_id = _value(payload, "shp_telegram_id")
    try:
        return VerifiedPayment("robokassa", invoice_id, int(telegram_id or ""))
    except ValueError as exc:
        raise PaymentWebhookError("Robokassa Telegram ID is invalid") from exc


def _verify_prodamus(
    credentials: Mapping[str, Any], payload: Mapping[str, Any], headers: Mapping[str, str]
) -> VerifiedPayment:
    if _value(payload, "payment_status", "status") != "success":
        raise PaymentWebhookError("Prodamus payment is not successful")

    secret = (
        credentials.get("webhook_secret")
        or credentials.get("secret_key")
        or credentials.get("api_key")
    )
    signature = (
        _value(headers, "signature", "sign", "x-signature")
        or _value(payload, "signature", "sign")
    )
    if not secret or not signature:
        raise PaymentWebhookError("Prodamus signature is missing")

    signed_payload = {
        str(key): value
        for key, value in payload.items()
        if str(key).casefold() not in {"signature", "sign"}
    }
    serialized_payload = json.dumps(
        signed_payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    expected_signature = hmac.new(
        str(secret).encode(), serialized_payload.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_signature.casefold(), signature.casefold()):
        raise PaymentWebhookError("Prodamus signature is invalid")

    order_id = _value(payload, "order_num", "order_id")
    if not order_id:
        raise PaymentWebhookError("Prodamus order ID is missing")
    try:
        telegram_id = int(order_id.split("_", maxsplit=1)[0])
    except ValueError as exc:
        raise PaymentWebhookError("Prodamus Telegram ID is invalid") from exc
    return VerifiedPayment("prodamus", order_id, telegram_id)
