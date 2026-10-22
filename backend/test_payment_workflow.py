"""Focused regression checks for cashier setup and purchase consent."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api_router
from schemas.api_schemas import BillingCheckoutRequest
from services import payment_link
from services.payment_providers import yookassa


def test_cashier_credentials_validation_covers_all_supported_providers(monkeypatch):
    async def yookassa_me(*_args, **_kwargs):
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr(payment_link, "_safe_http_request", yookassa_me)
    cases = [
        ("yookassa", {"shop_id": "shop", "secret_key": "secret"}),
        ("robokassa", {"merchant_login": "shop", "password1": "one", "password2": "two"}),
        ("prodamus", {"domain": "shop.payform.ru", "api_key": "secret"}),
    ]
    for provider, credentials in cases:
        valid, message = asyncio.run(payment_link.validate_payment_credentials(provider, credentials))
        assert valid, f"{provider}: {message}"


def test_cashier_credentials_validation_rejects_invalid_or_incomplete_data(monkeypatch):
    async def yookassa_unauthorized(*_args, **_kwargs):
        return SimpleNamespace(status_code=401)

    monkeypatch.setattr(payment_link, "_safe_http_request", yookassa_unauthorized)
    cases = [
        ("yookassa", {"shop_id": "shop", "secret_key": "wrong"}),
        ("robokassa", {"merchant_login": "shop", "password1": "one"}),
        ("prodamus", {"domain": "shop.payform.ru"}),
    ]
    for provider, credentials in cases:
        valid, _message = asyncio.run(payment_link.validate_payment_credentials(provider, credentials))
        assert not valid, provider


def test_billing_checkout_rejects_missing_offer_acceptance():
    request = SimpleNamespace(headers={})
    body = BillingCheckoutRequest(product="pro")

    try:
        asyncio.run(api_router.create_billing_checkout(request, body))
    except api_router.HTTPException as exc:
        assert exc.status_code == 422
        assert "оферт" in exc.detail
    else:
        raise AssertionError("Checkout must reject purchases without offer acceptance")


def test_billing_checkout_accepts_offer_and_creates_provider_checkout(monkeypatch):
    user = SimpleNamespace(
        id=77,
        telegram_id=1234567,
        email="client@example.com",
        email_receipts_enabled=True,
        email_billing_notifications_enabled=True,
    )
    monkeypatch.setattr(api_router, "get_current_user", AsyncMock(return_value=user))
    monkeypatch.setattr(api_router, "create_user_if_not_exists", AsyncMock(return_value=user))
    create_checkout = AsyncMock(return_value={"paymentId": "pay-123", "confirmationUrl": "https://yookassa.ru/test-pay"})
    monkeypatch.setattr(api_router, "create_checkout", create_checkout)

    body = BillingCheckoutRequest(product="pro", email="client@example.com", offerAccepted=True)
    result = asyncio.run(api_router.create_billing_checkout(SimpleNamespace(headers={}), body))

    assert result["paymentId"] == "pay-123"
    create_checkout.assert_awaited_once()


def test_yookassa_full_refund_uses_original_payment_and_idempotency_key(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"id": "refund-123", "status": "succeeded"}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return FakeResponse()

    monkeypatch.setattr(yookassa.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    bot = SimpleNamespace(
        payment_credentials={"shop_id": "shop-1", "secret_key": "secret-1"},
        payment_creds_enc=None,
    )
    payment = SimpleNamespace(
        provider_payment_id="payment-123",
        amount=1250,
        currency="RUB",
    )

    result = asyncio.run(
        yookassa.YooKassaProvider().refund_payment(
            bot_config=bot,
            payment=payment,
            idempotency_key="refund-local-payment-123",
        )
    )

    assert result.success
    assert result.provider_refund_id == "refund-123"
    assert captured["url"].endswith("/v3/refunds")
    assert captured["headers"]["Idempotence-Key"] == "refund-local-payment-123"
    assert captured["json"] == {
        "payment_id": "payment-123",
        "amount": {"value": "1250.00", "currency": "RUB"},
    }
