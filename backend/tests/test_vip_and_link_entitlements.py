"""Unit tests for VIP separation, free bot slots, access links and payment bypass prevention."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database.requests import access_link_rq
from database.requests.admin_rq import _admin_user_payload
from services.entitlements import is_user_vip, is_pro_active
import api_router
from schemas.api_schemas import AdminUserVipRequest
from services.telegram_auth import TelegramUser


def test_is_user_vip_and_is_pro_active_logic():
    now = datetime.now(timezone.utc)

    # 1. Non-VIP user
    user_plain = SimpleNamespace(is_vip_permanent=False, subscription_ends_at=None)
    assert is_user_vip(user_plain, now=now) == (False, "none", None)
    assert is_pro_active(user_plain, now=now) is False

    # 2. Expired VIP user
    user_expired = SimpleNamespace(is_vip_permanent=False, subscription_ends_at=now - timedelta(days=1))
    assert is_user_vip(user_expired, now=now) == (False, "none", None)
    assert is_pro_active(user_expired, now=now) is False

    # 3. Active period VIP user
    future_date = now + timedelta(days=30)
    user_period = SimpleNamespace(is_vip_permanent=False, subscription_ends_at=future_date)
    is_vip, vip_type, ends_at = is_user_vip(user_period, now=now)
    assert is_vip is True
    assert vip_type == "period"
    assert ends_at == future_date
    assert is_pro_active(user_period, now=now) is True

    # 4. Permanent VIP user
    user_perm = SimpleNamespace(is_vip_permanent=True, subscription_ends_at=None)
    is_vip, vip_type, ends_at = is_user_vip(user_perm, now=now)
    assert is_vip is True
    assert vip_type == "permanent"
    assert ends_at is None
    assert is_pro_active(user_perm, now=now) is True


def test_admin_user_payload_vip_and_free_slots_structure():
    now = datetime.now(timezone.utc)
    user = SimpleNamespace(
        id=42,
        telegram_id=12345678,
        username="test_vip",
        created_at=now,
        subscription_ends_at=now + timedelta(days=15),
        subscription_auto_renew=False,
        is_pro=True,
        is_vip_permanent=False,
        lifetime_slots=3,
        is_disabled=False,
        disabled_at=None,
        disabled_reason=None,
    )
    payload = _admin_user_payload(user, bots_count=5, used_slots=2)

    assert payload["id"] == 42
    assert payload["is_vip"] is True
    assert payload["is_vip_permanent"] is False
    assert payload["vip_type"] == "period"
    assert payload["free_slots_total"] == 3
    assert payload["free_slots_used"] == 2
    assert payload["free_slots_available"] == 1


def test_access_link_validation_vip_and_free_bots():
    assert "vip" in access_link_rq.SUPPORTED_LINK_KINDS
    assert "free_bots" in access_link_rq.SUPPORTED_LINK_KINDS
    assert access_link_rq.LINK_KINDS == ("period", "permanent", "one_bot")

    # VIP link without days and without is_permanent must fail validation
    with pytest.raises(ValueError, match="Укажите срок VIP-доступа"):
        asyncio.run(access_link_rq.create_access_link(
            kind="vip",
            days=None,
            is_permanent=False,
        ))

    # free_bots link with count < 1 must fail
    with pytest.raises(ValueError, match="Количество бесплатных ботов"):
        asyncio.run(access_link_rq.create_access_link(
            kind="free_bots",
            free_bots_count=0,
        ))


def test_admin_vip_endpoint_grant_and_revoke(monkeypatch):
    async def fake_admin(_request):
        return TelegramUser(telegram_id=999)

    monkeypatch.setattr(api_router, "get_current_admin", fake_admin)

    # 1. Test Grant VIP
    mock_grant = AsyncMock(return_value={
        "user_id": 10,
        "is_vip": True,
        "is_vip_permanent": False,
        "vip_ends_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "message": "VIP-доступ успешно начислен на 30 дн.",
    })
    monkeypatch.setattr(api_router, "grant_admin_user_vip", mock_grant)

    req_grant = AdminUserVipRequest(action="grant", days=30, is_permanent=False)
    res_grant = asyncio.run(api_router.update_admin_user_vip_endpoint(10, object(), req_grant))
    assert res_grant["is_vip"] is True
    assert "30 дн" in res_grant["message"]
    mock_grant.assert_awaited_once_with(
        user_id=10,
        actor_telegram_id=999,
        days=30,
        is_permanent=False,
    )

    # 2. Test Revoke VIP
    mock_revoke = AsyncMock(return_value={
        "user_id": 10,
        "is_vip": False,
        "is_vip_permanent": False,
        "vip_ends_at": None,
        "message": "VIP-доступ успешно отозван.",
    })
    monkeypatch.setattr(api_router, "revoke_admin_user_vip", mock_revoke)

    req_revoke = AdminUserVipRequest(action="revoke")
    res_revoke = asyncio.run(api_router.update_admin_user_vip_endpoint(10, object(), req_revoke))
    assert res_revoke["is_vip"] is False
    assert res_revoke["message"] == "VIP-доступ успешно отозван."
    mock_revoke.assert_awaited_once_with(user_id=10, actor_telegram_id=999)


def test_bot_application_mode_payment_bypass_rejection():
    """Verify payment mode detection and rejection conditions."""
    from handlers.user_bot import _payment_mode

    # 1. Funnel with application mode in payment node
    payment_node_app = SimpleNamespace(id="payment", payment_mode="application")
    funnel_app = SimpleNamespace(nodes=[payment_node_app], get_node=lambda nid: payment_node_app if nid == "payment" else None)
    assert _payment_mode(funnel_app) == "application"

    # 2. Funnel with auto mode in payment node
    payment_node_auto = SimpleNamespace(id="payment", payment_mode="auto")
    funnel_auto = SimpleNamespace(nodes=[payment_node_auto], get_node=lambda nid: payment_node_auto if nid == "payment" else None)
    assert _payment_mode(funnel_auto) == "auto"

    # 3. Funnel with hybrid mode in payment node
    payment_node_hybrid = SimpleNamespace(id="payment", payment_mode="hybrid")
    funnel_hybrid = SimpleNamespace(nodes=[payment_node_hybrid], get_node=lambda nid: payment_node_hybrid if nid == "payment" else None)
    assert _payment_mode(funnel_hybrid) == "hybrid"

    # 4. None funnel
    assert _payment_mode(None) == "auto"
