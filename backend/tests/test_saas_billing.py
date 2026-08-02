"""Main Bot Father billing verification and order-integrity tests."""

import uuid
import asyncio
from decimal import Decimal
from types import SimpleNamespace

import pytest

from database.models import SaasPayment
from database.requests.billing_rq import (
    SaasPaymentInvariantError,
    _validate_and_bind_provider_payment,
)
from services import saas_billing


class _Response:
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _Client:
    def __init__(self, payload):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, *_args, **_kwargs):
        return _Response(self._payload)


def _local_payment() -> SaasPayment:
    return SaasPayment(
        id=uuid.uuid4(),
        user_id=7,
        product="license",
        amount=Decimal("2000.00"),
        currency="RUB",
        idempotence_key=str(uuid.uuid4()),
    )


def test_verified_provider_id_can_be_bound_after_fast_webhook():
    payment = _local_payment()

    _validate_and_bind_provider_payment(
        payment,
        provider_payment_id="provider-1",
        amount=Decimal("2000.00"),
        currency="RUB",
        user_id=7,
        product="license",
    )

    assert payment.yookassa_payment_id == "provider-1"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("amount", Decimal("1.00")),
        ("currency", "USD"),
        ("user_id", 8),
        ("product", "pro_initial"),
    ],
)
def test_verified_payment_must_match_immutable_local_order(field, value):
    payment = _local_payment()
    values = {
        "provider_payment_id": "provider-1",
        "amount": Decimal("2000.00"),
        "currency": "RUB",
        "user_id": 7,
        "product": "license",
    }
    values[field] = value

    with pytest.raises(SaasPaymentInvariantError):
        _validate_and_bind_provider_payment(payment, **values)


def test_webhook_uses_local_order_id_and_verified_provider_values(monkeypatch):
    local_id = uuid.uuid4()
    provider_payload = {
        "id": "provider-1",
        "status": "succeeded",
        "paid": True,
        "amount": {"value": "2000.00", "currency": "RUB"},
        "metadata": {
            "saas_payment_id": str(local_id),
            "user_id": "7",
            "product": "license",
        },
        "payment_method": {},
    }
    captured = {}

    async def apply(local_payment_id, **values):
        captured["local_payment_id"] = local_payment_id
        captured.update(values)
        return True, SimpleNamespace(id=7)

    monkeypatch.setattr(saas_billing, "_credentials", lambda: ("shop", "secret"))
    monkeypatch.setattr(
        saas_billing.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(provider_payload),
    )
    monkeypatch.setattr(saas_billing, "apply_successful_saas_payment", apply)

    applied, _user = asyncio.run(
        saas_billing.verify_billing_notification(
            {"object": {"id": "provider-1"}}
        )
    )

    assert applied is True
    assert captured["local_payment_id"] == local_id
    assert captured["provider_payment_id"] == "provider-1"
    assert captured["amount"] == Decimal("2000.00")
    assert captured["currency"] == "RUB"
    assert captured["user_id"] == 7
    assert captured["product"] == "license"
