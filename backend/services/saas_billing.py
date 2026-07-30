"""YooKassa billing for Bot Father licenses and PRO subscriptions."""

import json
from typing import Any

import httpx

from config import (
    SAAS_LICENSE_PRICE_RUB,
    SAAS_PRO_PRICE_RUB,
    SAAS_YOOKASSA_SECRET_KEY,
    SAAS_YOOKASSA_SHOP_ID,
    SAAS_YOOKASSA_VAT_CODE,
    WEBAPP_URL,
)
from database.requests.billing_rq import (
    apply_successful_saas_payment,
    create_saas_payment,
    defer_subscription_retry,
    mark_saas_payment_failed,
    mark_saas_payment_failed_by_id,
    set_saas_payment_provider_id,
)
from services.security import crypto


class BillingError(ValueError):
    pass


PRODUCTS = {
    "license": ("license", SAAS_LICENSE_PRICE_RUB, "Лицензия на Telegram-бота"),
    "basic": ("license", SAAS_LICENSE_PRICE_RUB, "Лицензия на Telegram-бота"),
    "pro": ("pro_initial", SAAS_PRO_PRICE_RUB, "PRO-подписка Bot Father"),
}


def _credentials() -> tuple[str, str]:
    if not SAAS_YOOKASSA_SHOP_ID or not SAAS_YOOKASSA_SECRET_KEY:
        raise BillingError("SaaS YooKassa credentials are not configured")
    return SAAS_YOOKASSA_SHOP_ID, SAAS_YOOKASSA_SECRET_KEY


async def create_checkout(
    user_id: int,
    product_key: str,
    *,
    receipt_email: str | None = None,
) -> dict[str, str]:
    try:
        product, amount, description = PRODUCTS[product_key]
    except KeyError as exc:
        raise BillingError("Unknown billing product") from exc

    payment = await create_saas_payment(user_id, product, amount)
    payload: dict[str, Any] = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": WEBAPP_URL or "https://t.me/",
        },
        "description": description,
        "metadata": {
            "saas_payment_id": str(payment.id),
            "user_id": str(user_id),
            "product": product,
        },
    }
    if receipt_email:
        payload["receipt"] = {
            "customer": {"email": receipt_email},
            "items": [{
                "description": description,
                "quantity": "1.00",
                "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                "vat_code": SAAS_YOOKASSA_VAT_CODE,
                "payment_mode": "full_payment",
                "payment_subject": "service",
            }],
        }
    if product == "pro_initial":
        payload["save_payment_method"] = True

    shop_id, secret_key = _credentials()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.yookassa.ru/v3/payments",
                json=payload,
                auth=(shop_id, secret_key),
                headers={"Idempotence-Key": payment.idempotence_key},
            )
    except httpx.HTTPError as exc:
        raise BillingError("YooKassa is unavailable") from exc
    if response.status_code != 200:
        raise BillingError("YooKassa could not create a payment")

    data = response.json()
    try:
        await set_saas_payment_provider_id(payment.id, data["id"])
        return {
            "paymentId": str(payment.id),
            "confirmationUrl": data["confirmation"]["confirmation_url"],
        }
    except (KeyError, TypeError) as exc:
        raise BillingError("YooKassa returned an invalid payment") from exc


async def verify_billing_notification(payload: dict[str, Any]) -> tuple[bool, Any | None]:
    """Verify YooKassa state, then apply the corresponding SaaS entitlement."""
    payment_id = payload.get("object", {}).get("id")
    if not payment_id:
        raise BillingError("YooKassa payment ID is missing")
    shop_id, secret_key = _credentials()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.yookassa.ru/v3/payments/{payment_id}",
                auth=(shop_id, secret_key),
            )
    except httpx.HTTPError as exc:
        raise BillingError("YooKassa verification is unavailable") from exc
    if response.status_code != 200:
        raise BillingError("YooKassa payment was not found")

    payment = response.json()
    metadata = payment.get("metadata") or {}
    local_payment_id = metadata.get("saas_payment_id")
    if not local_payment_id:
        raise BillingError("Payment does not belong to Bot Father billing")

    if payment.get("status") == "canceled":
        user = await mark_saas_payment_failed(payment_id)
        return False, user
    if payment.get("status") != "succeeded" or payment.get("paid") is not True:
        raise BillingError("YooKassa payment is not successful")

    method = payment.get("payment_method") or {}
    method_id = method.get("id") if method.get("saved") else None
    method_enc = crypto.encrypt(method_id) if method_id else None
    return await apply_successful_saas_payment(payment_id, method_enc)


async def create_recurring_payment(user):
    """Create one server-side PRO renewal; fulfillment remains webhook-driven."""
    if not user.subscription_payment_method_enc:
        raise BillingError("Saved payment method is missing")
    shop_id, secret_key = _credentials()
    payment = await create_saas_payment(
        user.id,
        "pro_renewal",
        SAAS_PRO_PRICE_RUB,
        attempt=user.subscription_retry_count + 1,
    )
    method_id = crypto.decrypt(user.subscription_payment_method_enc)
    payload = {
        "amount": {"value": f"{SAAS_PRO_PRICE_RUB:.2f}", "currency": "RUB"},
        "capture": True,
        "payment_method_id": method_id,
        "description": "Продление PRO-подписки Bot Father",
        "metadata": {"saas_payment_id": str(payment.id), "user_id": str(user.id), "product": "pro_renewal"},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.yookassa.ru/v3/payments",
                json=payload,
                auth=(shop_id, secret_key),
                headers={"Idempotence-Key": payment.idempotence_key},
            )
    except httpx.HTTPError as exc:
        await mark_saas_payment_failed_by_id(payment.id)
        raise BillingError("YooKassa renewal request failed") from exc
    if response.status_code != 200:
        await mark_saas_payment_failed_by_id(payment.id)
        raise BillingError("YooKassa renewal request failed")
    data = response.json()
    await set_saas_payment_provider_id(payment.id, data["id"])
    if data.get("status") == "canceled":
        await mark_saas_payment_failed(data["id"])
        raise BillingError("YooKassa renewal was declined")
    if data.get("status") == "succeeded" and data.get("paid") is True:
        return await verify_billing_notification({"object": {"id": data["id"]}})
    await defer_subscription_retry(user.id)
    return False, None
