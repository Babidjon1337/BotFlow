"""Focused contract tests for the isolated administrative API foundation."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api_router  # noqa: E402
from database.models import AdminAuditLog  # noqa: E402
from services.telegram_auth import TelegramUser  # noqa: E402
from schemas.api_schemas import (  # noqa: E402
    AdminUserAccessRequest,
    AdminBotActionRequest,
    AdminBotSubscriptionRequest,
    AdminUserGrantBotRequest,
)


def test_admin_audit_log_model_has_append_only_fields():
    """The model contains all fields required for future immutable audit records."""
    assert set(AdminAuditLog.__table__.columns.keys()) == {
        "id",
        "actor_telegram_id",
        "action",
        "target_type",
        "target_id",
        "details",
        "created_at",
    }


def test_get_current_admin_rejects_authenticated_non_admin(monkeypatch):
    """Admin routes must not rely on the frontend's hidden navigation."""
    async def fake_current_user(_request):
        return TelegramUser(telegram_id=101)

    monkeypatch.setattr(api_router, "get_current_user", fake_current_user)
    monkeypatch.setattr(api_router, "ADMIN_TELEGRAM_IDS", frozenset({202}))

    with pytest.raises(HTTPException) as error:
        asyncio.run(api_router.get_current_admin(object()))

    assert error.value.status_code == 403


def test_admin_overview_endpoint_returns_real_source_contract(monkeypatch):
    """Overview uses the server contract and does not fabricate dashboard values."""
    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_overview():
        return {
            "users_total": 4,
            "bots_total": 7,
            "bots_active": 3,
            "saas_payments_succeeded": 2,
            "saas_revenue": 5000.0,
            "operations_requiring_attention": 1,
        }

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "get_admin_overview", fake_overview)

    result = asyncio.run(api_router.get_admin_overview_endpoint(object()))

    assert result["saas_revenue"] == 5000.0
    assert result["operations_requiring_attention"] == 1


def test_admin_access_endpoint_passes_explicit_bot_stop_choice(monkeypatch):
    """The API must not silently stop a customer's bots while pausing access."""
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_set_access(**kwargs):
        received.update(kwargs)
        return {"user_id": 11, "is_disabled": True, "stopped_active_bots": 2}

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "set_admin_user_access", fake_set_access)
    monkeypatch.setattr(api_router, "ADMIN_TELEGRAM_IDS", frozenset({202}))

    result = asyncio.run(
        api_router.update_admin_user_access_endpoint(
            11,
            object(),
            AdminUserAccessRequest(disabled=True, stopActiveBots=True),
        )
    )

    assert result["stopped_active_bots"] == 2
    assert received["disabled"] is True
    assert received["stop_active_bots"] is True
    assert received["actor_telegram_id"] == 202


def test_paused_account_is_rejected_before_any_user_route(monkeypatch):
    """A paused account cannot keep using a previously issued Mini App session."""
    async def fake_user(_telegram_id):
        return type("Account", (), {"is_disabled": True})()

    monkeypatch.setattr(api_router, "get_user_by_tg_id", fake_user)

    with pytest.raises(HTTPException) as error:
        asyncio.run(api_router._ensure_account_is_active(101))

    assert error.value.status_code == 403


def test_admin_bot_start_uses_shared_entitlement_safe_transition(monkeypatch):
    """An admin start command must not be a hidden bypass around customer limits."""
    bot = type("Bot", (), {"id": 18, "owner_id": 11})()
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_bot(_bot_id):
        return bot

    async def fake_toggle(*args, **kwargs):
        received.update(kwargs)
        return {"status": "ok", "message": "Бот запущен", "botStatus": "active"}

    async def fake_audit(**_kwargs):
        return None

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "get_bot_by_id", fake_bot)
    monkeypatch.setattr(api_router, "_toggle_client_bot", fake_toggle)
    monkeypatch.setattr(api_router, "write_admin_audit_log", fake_audit)

    result = asyncio.run(
        api_router.admin_bot_action_endpoint(
            18, object(), AdminBotActionRequest(action="start")
        )
    )

    assert result["botStatus"] == "active"
    assert received["action"] == "start"
    assert received["allow_admin_entitlement_bypass"] is False


def test_admin_operation_retry_requeues_only_delivery_work(monkeypatch):
    """Retrying a paid order never changes payment verification or creates a charge."""
    payment_id = uuid4()
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_requeue(value):
        received["requeued_id"] = value
        return {"fulfillment_requeued": True, "owner_notification_requeued": False}

    async def fake_process(value, session):
        received["processed_id"] = value
        received["session"] = session
        return {"access_delivered": True, "owner_notified": False}

    async def fake_audit(**kwargs):
        received["audit"] = kwargs

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "requeue_client_payment_delivery", fake_requeue)
    monkeypatch.setattr(api_router, "process_client_payment_fulfillment", fake_process)
    monkeypatch.setattr(api_router, "write_admin_audit_log", fake_audit)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(session="session")))

    result = asyncio.run(api_router.retry_admin_operation_endpoint(payment_id, request))

    assert result["access_delivered"] is True
    assert received["requeued_id"] == payment_id
    assert received["processed_id"] == payment_id
    assert received["audit"]["action"] == "payment_delivery_retry"


def test_admin_lead_archive_preserves_the_bot_and_records_audit(monkeypatch):
    """Admin CRM cleanup is an archive operation, never a bot or payment deletion."""
    bot = SimpleNamespace(id=18, owner_id=11)
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_bot(_bot_id):
        return bot

    async def fake_archive(bot_id):
        received["bot_id"] = bot_id
        return 3

    async def fake_audit(**kwargs):
        received["audit"] = kwargs

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "get_bot_by_id", fake_bot)
    monkeypatch.setattr(api_router, "archive_leads_by_bot_id", fake_archive)
    monkeypatch.setattr(api_router, "write_admin_audit_log", fake_audit)

    result = asyncio.run(api_router.archive_admin_bot_leads_endpoint(18, object()))

    assert result == {"status": "ok", "archivedCount": 3}
    assert received["bot_id"] == 18
    assert received["audit"]["action"] == "bot_leads_archived"
    assert received["audit"]["details"]["archived_count"] == 3


def test_admin_bot_subscription_grant(monkeypatch):
    """Admin can grant 3 months (or N days) subscription to a specific bot."""
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_grant(**kwargs):
        received.update(kwargs)
        return {
            "status": "ok",
            "message": "Подписка выдана на 90 дн.",
            "subscription": {
                "status": "active",
                "ends_at": "2026-12-15T00:00:00+00:00",
                "auto_renew": False,
                "amount_rub": 0,
                "is_lifetime": False,
            },
        }

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "grant_admin_bot_subscription", fake_grant)

    result = asyncio.run(
        api_router.grant_admin_bot_subscription_endpoint(
            18, object(), AdminBotSubscriptionRequest(days=90, isLifetime=False)
        )
    )

    assert result["status"] == "ok"
    assert received["bot_id"] == 18
    assert received["duration_days"] == 90
    assert received["is_lifetime"] is False
    assert received["actor_telegram_id"] == 202


def test_admin_bot_subscription_revoke(monkeypatch):
    """Admin can revoke a bot's subscription."""
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_revoke(**kwargs):
        received.update(kwargs)
        return {"status": "ok", "message": "Подписка бота отозвана."}

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "revoke_admin_bot_subscription", fake_revoke)

    result = asyncio.run(api_router.revoke_admin_bot_subscription_endpoint(18, object()))

    assert result["status"] == "ok"
    assert received["bot_id"] == 18
    assert received["actor_telegram_id"] == 202


def test_admin_user_grant_bot_subscription(monkeypatch):
    """Admin can grant free period to a user's bot from the user profile."""
    received = {}

    async def fake_admin(_request):
        return TelegramUser(telegram_id=202)

    async def fake_user_grant(**kwargs):
        received.update(kwargs)
        return {
            "status": "ok",
            "message": "Подписка выдана на 90 дн.",
            "subscription": {"status": "active"},
        }

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)
    monkeypatch.setattr(api_router, "grant_admin_user_bot_subscription", fake_user_grant)

    result = asyncio.run(
        api_router.grant_admin_user_bot_subscription_endpoint(
            11, object(), AdminUserGrantBotRequest(days=90, isLifetime=False)
        )
    )

    assert result["status"] == "ok"
    assert received["user_id"] == 11
    assert received["duration_days"] == 90
    assert received["actor_telegram_id"] == 202


def test_bot_entitlement_service_handles_naive_and_aware_datetimes():
    """Entitlement service handles both timezone-naive and timezone-aware datetimes without crashing."""
    from datetime import datetime, timedelta, timezone
    from services.bot_entitlement import BotEntitlementService

    service = BotEntitlementService()
    now_utc = datetime.now(timezone.utc)

    # 1. Active with future naive ends_at
    sub_naive_future = SimpleNamespace(
        status="active",
        starts_at=None,
        ends_at=datetime.now().replace(tzinfo=None) + timedelta(days=30),  # naive
    )
    assert service.can_publish(sub_naive_future, now=now_utc) is True

    # 2. Active with expired naive ends_at
    sub_naive_past = SimpleNamespace(
        status="active",
        starts_at=None,
        ends_at=datetime.now().replace(tzinfo=None) - timedelta(days=5),  # naive
    )
    assert service.can_publish(sub_naive_past, now=now_utc) is False

    # 3. Active with lifetime (ends_at is None)
    sub_lifetime = SimpleNamespace(
        status="active",
        starts_at=None,
        ends_at=None,
    )
    assert service.can_publish(sub_lifetime, now=now_utc) is True

    # 4. Inactive status
    sub_inactive = SimpleNamespace(
        status="inactive",
        starts_at=None,
        ends_at=datetime.now().replace(tzinfo=None) + timedelta(days=30),
    )
    assert service.can_publish(sub_inactive, now=now_utc) is False


def test_admin_user_grant_bot_subscription_rejects_unowned_bot(monkeypatch):
    """Admin user grant must reject a bot_id that does not belong to the targeted user."""
    from database.requests.admin_rq import AdminMutationError, grant_admin_user_bot_subscription
    import database.requests.admin_rq as admin_rq_module

    class DummySession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, model, user_id):
            return SimpleNamespace(id=user_id, telegram_id=12345)

        async def scalar(self, stmt):
            # Simulate bot not found for this user
            return None

    monkeypatch.setattr(admin_rq_module, "async_session", lambda: DummySession())

    with pytest.raises(AdminMutationError, match="Указанный бот не найден у данного пользователя"):
        asyncio.run(
            grant_admin_user_bot_subscription(
                user_id=11,
                bot_id=999,  # does not belong to user 11
                duration_days=90,
                is_lifetime=False,
                actor_telegram_id=202,
            )
        )


def test_admin_can_access_other_user_bot(monkeypatch):
    """Admin in ADMIN_TELEGRAM_IDS can load any bot in get_owned_bot."""
    bot = SimpleNamespace(id=42, owner_id=999)
    admin_user = SimpleNamespace(telegram_id=101)  # 101 is in ADMIN_TELEGRAM_IDS in test setup

    monkeypatch.setattr(api_router, "ADMIN_TELEGRAM_IDS", {101})
    monkeypatch.setattr(api_router, "get_current_user", AsyncMock(return_value=admin_user))
    monkeypatch.setattr(api_router, "create_user_if_not_exists", AsyncMock(return_value=SimpleNamespace(id=11, telegram_id=101)))
    monkeypatch.setattr(api_router, "get_bot_by_id", AsyncMock(return_value=bot))

    result = asyncio.run(api_router.get_owned_bot(42, object()))
    assert result.id == 42
    assert result.owner_id == 999


