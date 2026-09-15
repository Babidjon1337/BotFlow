"""Retry and idempotency behavior for paid-access fulfillment."""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from services import payment_fulfillment


def _payment(payment_id):
    return SimpleNamespace(
        id=payment_id,
        bot_id=18,
        bot=SimpleNamespace(tg_bot_id=777),
        lead=SimpleNamespace(telegram_id=12345),
        tariff_snapshot={"name": "PRO", "actionType": "link", "actionData": "https://example.com"},
    )


def test_failed_access_is_persisted_for_retry(monkeypatch):
    payment_id = uuid.uuid4()
    payment = _payment(payment_id)
    failure = AsyncMock()
    fulfilled = AsyncMock()

    monkeypatch.setattr(payment_fulfillment, "claim_client_payment_fulfillment", AsyncMock(return_value=payment))
    monkeypatch.setattr(payment_fulfillment, "claim_owner_payment_notification", AsyncMock(return_value=None))
    monkeypatch.setattr(payment_fulfillment, "get_client_payment", AsyncMock(return_value=payment))
    monkeypatch.setattr(payment_fulfillment, "send_success_message", AsyncMock(side_effect=RuntimeError("Telegram unavailable")))
    monkeypatch.setattr(payment_fulfillment, "mark_client_payment_fulfillment_failed", failure)
    monkeypatch.setattr(payment_fulfillment, "mark_client_payment_fulfilled", fulfilled)

    result = asyncio.run(
        payment_fulfillment.process_client_payment_fulfillment(payment_id, None)
    )

    assert result["access_delivered"] is False
    failure.assert_awaited_once()
    fulfilled.assert_not_awaited()


def test_duplicate_webhook_does_not_redeliver_completed_access(monkeypatch):
    payment_id = uuid.uuid4()
    delivery = AsyncMock()

    monkeypatch.setattr(payment_fulfillment, "claim_client_payment_fulfillment", AsyncMock(return_value=None))
    monkeypatch.setattr(payment_fulfillment, "claim_owner_payment_notification", AsyncMock(return_value=None))
    monkeypatch.setattr(payment_fulfillment, "send_success_message", delivery)

    result = asyncio.run(
        payment_fulfillment.process_client_payment_fulfillment(payment_id, None)
    )

    assert result == {"access_delivered": False, "owner_notified": False}
    delivery.assert_not_awaited()
