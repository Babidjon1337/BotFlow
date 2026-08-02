"""Regression tests for truthful Telegram webhook operations."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import api_router
from schemas.api_schemas import BotCreateApiRequest


class _WebhookFailureBot:
    def __init__(self, *args, **kwargs):
        pass

    async def get_me(self):
        return SimpleNamespace(id=777, username="test_bot")

    async def set_webhook(self, **kwargs):
        raise RuntimeError("telegram unavailable")

    async def delete_webhook(self):
        raise RuntimeError("telegram unavailable")


def _request() -> SimpleNamespace:
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(session=None)))


def test_create_bot_rolls_back_when_telegram_rejects_webhook(monkeypatch):
    """A bot is not returned as connected when Telegram setup failed."""
    user = SimpleNamespace(id=1, telegram_id=42)
    created_bot = SimpleNamespace(id=18)
    delete_bot_config = AsyncMock(return_value=True)

    monkeypatch.setattr(api_router, "get_current_user", AsyncMock(return_value=user))
    monkeypatch.setattr(api_router, "create_user_if_not_exists", AsyncMock(return_value=user))
    monkeypatch.setattr(api_router, "get_user_bots", AsyncMock(return_value=[]))
    monkeypatch.setattr(api_router, "is_pro_active", lambda _: False)
    monkeypatch.setattr(api_router, "available_lifetime_licenses", lambda *_: 1)
    monkeypatch.setattr(api_router, "get_bot_by_tg_id", AsyncMock(return_value=None))
    monkeypatch.setattr(api_router, "create_bot_config", AsyncMock(return_value=created_bot))
    monkeypatch.setattr(api_router, "assign_lifetime_license", AsyncMock(return_value=created_bot))
    monkeypatch.setattr(api_router, "delete_bot_config", delete_bot_config)

    import aiogram

    monkeypatch.setattr(aiogram, "Bot", _WebhookFailureBot)

    with pytest.raises(HTTPException, match="не подтвердил подключение") as error:
        asyncio.run(
            api_router.create_bot(
                _request(),
                BotCreateApiRequest(token="123456:token", displayName="Тест"),
            )
        )

    assert error.value.status_code == 502
    delete_bot_config.assert_awaited_once_with(18)


def test_stop_bot_keeps_active_status_when_telegram_rejects_webhook_deletion(monkeypatch):
    """The API never reports a stopped bot while its webhook is still active."""
    bot = SimpleNamespace(id=18, owner_id=1, bot_token_enc="encrypted")
    set_status = AsyncMock()

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=bot))
    monkeypatch.setattr(
        api_router,
        "get_current_user",
        AsyncMock(return_value=SimpleNamespace(telegram_id=42)),
    )
    monkeypatch.setattr(api_router.crypto, "decrypt", lambda _: "123456:token")
    monkeypatch.setattr(api_router, "set_bot_status", set_status)

    import aiogram

    monkeypatch.setattr(aiogram, "Bot", _WebhookFailureBot)

    with pytest.raises(HTTPException, match="не подтвердил остановку") as error:
        asyncio.run(api_router.toggle_bot(18, _request(), {"action": "stop"}))

    assert error.value.status_code == 502
    set_status.assert_not_awaited()
