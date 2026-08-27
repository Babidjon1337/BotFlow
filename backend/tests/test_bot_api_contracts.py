"""Legacy HTTP contracts that must survive the R2 lifecycle migration."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api_router
from schemas.api_schemas import BotApiResponse


def _legacy_bot(**overrides):
    values = {
        "id": 18,
        "display_name": "Legacy funnel",
        "username": "legacy_funnel_bot",
        "status": "active",
        "users_count": 4,
        "offer_url": None,
        "offer_installments": False,
        "funnel_complete": True,
        "media_sync_done": True,
        "is_token_locked": False,
        "payment_provider": "yookassa",
        "payment_creds_enc": b"encrypted",
        "bot_token_enc": None,
        "tg_bot_id": 123456,
        "created_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_bot_response_keeps_legacy_status_and_never_exposes_secrets():
    """Existing clients keep their fields while migration fields are still absent."""
    response = BotApiResponse.from_orm_bot(
        _legacy_bot(),
        "https://tg.botflow.example",
        "https://botflow.example",
    ).model_dump(by_alias=True)

    assert response["status"] == "active"
    assert response["funnelComplete"] is True
    assert response["hasPaymentCredentials"] is True
    assert response["scenarioType"] is None
    assert response["lifecycleStatus"] is None
    assert response["webhookUrl"] == "https://tg.botflow.example/webhook/bots/18"
    assert "token" not in response
    assert "paymentCreds" not in response


def test_readiness_endpoint_keeps_machine_shape_for_legacy_bot(monkeypatch):
    """The frontend receives a boolean and reasons before lifecycle fields exist."""
    bot = _legacy_bot(status="draft")

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=bot))
    monkeypatch.setattr(
        api_router,
        "_readiness_for_bot",
        AsyncMock(return_value=(False, ["Заполните текст блока «Старт». "])),
    )

    response = asyncio.run(api_router.get_bot_readiness(18, object()))

    assert response == {
        "isReady": False,
        "reasons": ["Заполните текст блока «Старт». "],
        "reasonDetails": [
            {
                "code": "message_content_missing",
                "message": "Заполните текст блока «Старт». ",
            }
        ],
    }


def test_quote_endpoint_exposes_only_the_current_sellable_configuration(monkeypatch):
    bot = _legacy_bot(scenario_type=None)
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=bot))

    response = asyncio.run(api_router.get_bot_quote(18, object()))

    assert response == {
        "scenarioType": "sales_funnel",
        "platforms": ["telegram"],
        "currency": "RUB",
        "lineItems": [{"code": "sales_funnel_base", "amountMinor": 99_000}],
        "subtotalMinor": 99_000,
        "totalMinor": 99_000,
        "checkoutAvailable": False,
    }


def test_dedicated_active_subscription_publishes_only_its_bot(monkeypatch):
    bot = _legacy_bot(
        status="draft",
        lifecycle_status="ready",
        pause_reason=None,
        owner_id=9,
        owner=SimpleNamespace(),
    )
    subscription = SimpleNamespace(
        status="active",
        ends_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    persisted_bot = _legacy_bot(
        lifecycle_status="published", pause_reason=None, username="legacy_funnel_bot"
    )

    get_user_bots = AsyncMock()
    monkeypatch.setattr(
        api_router, "get_bot_subscription", AsyncMock(return_value=subscription)
    )
    monkeypatch.setattr(api_router, "get_user_bots", get_user_bots)
    monkeypatch.setattr(api_router, "is_pro_active", lambda _owner: False)
    monkeypatch.setattr(api_router.bot_lifecycle_service, "transition", AsyncMock())
    monkeypatch.setattr(api_router, "_install_client_bot_webhook", AsyncMock())
    monkeypatch.setattr(
        api_router,
        "set_bot_lifecycle_state",
        AsyncMock(return_value=persisted_bot),
    )

    response = asyncio.run(
        api_router._toggle_client_bot(
            bot,
            object(),
            action="start",
            allow_admin_entitlement_bypass=False,
        )
    )

    assert response["botStatus"] == "active"
    get_user_bots.assert_not_awaited()


def test_inactive_dedicated_subscription_does_not_fall_back_to_legacy_pro(monkeypatch):
    bot = _legacy_bot(owner=SimpleNamespace())
    subscription = SimpleNamespace(status="inactive", ends_at=None)

    monkeypatch.setattr(
        api_router, "get_bot_subscription", AsyncMock(return_value=subscription)
    )
    monkeypatch.setattr(api_router, "is_pro_active", lambda _owner: True)

    with pytest.raises(api_router.HTTPException) as error:
        asyncio.run(
            api_router._toggle_client_bot(
                bot,
                object(),
                action="start",
                allow_admin_entitlement_bypass=False,
            )
        )

    assert error.value.status_code == 403
    assert error.value.detail == "Подписка этого бота неактивна или закончилась."


def test_stopping_a_bot_does_not_read_the_r3_subscription_table(monkeypatch):
    bot = _legacy_bot(
        owner=SimpleNamespace(), lifecycle_status="published", pause_reason=None
    )
    get_subscription = AsyncMock()

    monkeypatch.setattr(api_router, "get_bot_subscription", get_subscription)
    monkeypatch.setattr(api_router.bot_lifecycle_service, "transition", AsyncMock())
    monkeypatch.setattr(api_router, "_remove_client_bot_webhook", AsyncMock())
    monkeypatch.setattr(
        api_router,
        "set_bot_lifecycle_state",
        AsyncMock(return_value=_legacy_bot(lifecycle_status="paused", pause_reason="manual")),
    )

    response = asyncio.run(
        api_router._toggle_client_bot(
            bot,
            object(),
            action="stop",
            allow_admin_entitlement_bypass=False,
        )
    )

    assert response["botStatus"] == "draft"
    get_subscription.assert_not_awaited()
