"""Legacy HTTP contracts that must survive the R2 lifecycle migration."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

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
