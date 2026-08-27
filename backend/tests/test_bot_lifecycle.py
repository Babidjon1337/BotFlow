"""Public contracts for the additive R2 bot lifecycle module."""

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

from services.bot_lifecycle import BotLifecycleService, LifecycleTransitionError
from services.bot_entitlement import BotEntitlementService
from services.funnel_readiness import FunnelReadiness
from services import scheduler


def _bot(**overrides):
    values = {
        "status": "draft",
        "lifecycle_status": None,
        "pause_reason": None,
        "funnel_complete": False,
        "funnel_schema": {"nodes": []},
        "payment_provider": None,
        "payment_creds_enc": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _service(*, reasons=()):
    async def connected_chat_ids_for(_bot):
        return set()

    def evaluate(*_args, **_kwargs):
        return FunnelReadiness(tuple(reasons))

    return BotLifecycleService(
        readiness_evaluator=evaluate,
        connected_chat_ids_for=connected_chat_ids_for,
    )


def test_pause_dual_writes_lifecycle_and_legacy_status():
    bot = _bot(status="active", lifecycle_status=None)

    asyncio.run(_service().transition(bot, "paused", reason="manual"))

    assert bot.lifecycle_status == "paused"
    assert bot.pause_reason == "manual"
    assert bot.status == "draft"


def test_publishing_requires_server_readiness():
    bot = _bot(lifecycle_status="ready", funnel_complete=True)

    with pytest.raises(LifecycleTransitionError, match="not ready"):
        asyncio.run(_service(reasons=("missing payment",)).transition(bot, "published"))

    assert bot.lifecycle_status == "ready"
    assert bot.status == "draft"


def test_resume_to_published_clears_pause_reason_and_dual_writes_active():
    bot = _bot(lifecycle_status="paused", pause_reason="subscription", funnel_complete=True)

    asyncio.run(_service().transition(bot, "published"))

    assert bot.lifecycle_status == "published"
    assert bot.pause_reason is None
    assert bot.status == "active"


def test_archived_bot_has_no_runtime_transition():
    bot = _bot(status="archived", lifecycle_status="archived")

    with pytest.raises(LifecycleTransitionError, match="archived"):
        asyncio.run(_service().transition(bot, "draft"))


def test_expired_bot_subscription_pauses_only_the_linked_published_bot(monkeypatch):
    expired_bot = _bot(
        id=71,
        status="active",
        lifecycle_status="published",
        pause_reason=None,
        bot_token_enc=b"encrypted",
    )
    persisted = AsyncMock()
    claimed_expiry = AsyncMock(return_value=True)
    finalized_expiry = AsyncMock()

    class TelegramBot:
        def __init__(self, **_kwargs):
            pass

        async def delete_webhook(self):
            return None

    monkeypatch.setattr(scheduler, "get_expired_published_bots", AsyncMock(return_value=[expired_bot]))
    monkeypatch.setattr(scheduler, "set_bot_lifecycle_state", persisted)
    monkeypatch.setattr(scheduler, "claim_expired_bot_subscription", claimed_expiry)
    monkeypatch.setattr(scheduler, "finalize_bot_subscription_expiry", finalized_expiry)
    monkeypatch.setattr(scheduler.crypto, "decrypt", lambda _value: "123456:token")
    monkeypatch.setattr(scheduler, "Bot", TelegramBot)

    asyncio.run(scheduler.expire_bot_subscriptions_job())

    assert expired_bot.lifecycle_status == "paused"
    assert expired_bot.pause_reason == "subscription"
    persisted.assert_awaited_once_with(71, "paused", "subscription")
    claimed_expiry.assert_awaited_once_with(71)
    finalized_expiry.assert_awaited_once_with(71)


def test_renewed_subscription_is_not_paused_by_an_old_expiry_scan(monkeypatch):
    expired_bot = _bot(
        id=71,
        status="active",
        lifecycle_status="published",
        pause_reason=None,
    )
    persisted = AsyncMock()

    monkeypatch.setattr(scheduler, "get_expired_published_bots", AsyncMock(return_value=[expired_bot]))
    monkeypatch.setattr(scheduler, "claim_expired_bot_subscription", AsyncMock(return_value=False))
    monkeypatch.setattr(scheduler, "set_bot_lifecycle_state", persisted)

    asyncio.run(scheduler.expire_bot_subscriptions_job())

    assert expired_bot.lifecycle_status == "published"
    persisted.assert_not_awaited()


def test_future_dedicated_subscription_cannot_publish_early():
    now = datetime.now(timezone.utc)
    subscription = SimpleNamespace(
        status="active",
        starts_at=now + timedelta(minutes=1),
        ends_at=now + timedelta(days=30),
    )

    assert not BotEntitlementService().can_publish(subscription, now=now)
