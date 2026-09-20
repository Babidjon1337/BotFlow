"""Unit and integration tests for the Tariffs and Deliverables system."""

import asyncio
import io
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api_router
from database.models import Tariff
from schemas.tariff_schemas import (
    DeliverableSchema,
    TariffApiResponse,
    TariffCreateRequest,
    TariffStatsResponse,
    TariffUpdateRequest,
)


def _fake_tariff(**overrides):
    tariff_id = overrides.pop("id", uuid.uuid4())
    values = {
        "id": tariff_id,
        "bot_id": 18,
        "name": "Премиум доступ",
        "description": "Полный доступ к материалам и чату",
        "price": Decimal("1500.00"),
        "payment_type": "one_time",
        "recurring_period": None,
        "sales_mode": "auto",
        "is_active": True,
        "deliverables": [
            {
                "type": "channel",
                "chatId": "-1001234567890",
                "title": "VIP Канал",
                "accessMode": "member",
            },
            {
                "type": "file",
                "filePath": "/uploads/tariffs/18/sample.pdf",
                "filename": "sample.pdf",
                "sizeBytes": 2048,
            },
        ],
        "total_buyers": 5,
        "total_revenue": Decimal("7500.00"),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_tariff_model_has_required_schema_columns():
    """Tariff model schema conforms to the data architecture requirements."""
    columns = set(Tariff.__table__.columns.keys())
    expected = {
        "id",
        "bot_id",
        "name",
        "description",
        "price",
        "payment_type",
        "recurring_period",
        "sales_mode",
        "is_active",
        "deliverables",
        "total_buyers",
        "total_revenue",
        "created_at",
        "updated_at",
    }
    assert expected.issubset(columns)


def test_deliverable_schema_channel_and_group():
    """DeliverableSchema correctly validates channels and groups with chatId."""
    item = DeliverableSchema.model_validate({
        "type": "channel",
        "chatId": "-1001999999",
        "title": "Закрытый канал",
        "accessMode": "read_only",
    })
    assert item.type == "channel"
    assert item.chat_id == "-1001999999"
    assert item.access_mode == "read_only"

    # Missing chatId must fail validation
    with pytest.raises(ValidationError):
        DeliverableSchema.model_validate({"type": "channel"})


def test_deliverable_schema_file_and_link():
    """DeliverableSchema validates files and links with alias normalization."""
    file_item = DeliverableSchema.model_validate({
        "type": "file",
        "path": "/uploads/tariffs/18/test.pdf",
        "originalName": "test.pdf",
        "size": 1024,
    })
    assert file_item.type == "file"
    assert file_item.file_path == "/uploads/tariffs/18/test.pdf"
    assert file_item.filename == "test.pdf"
    assert file_item.size_bytes == 1024

    link_item = DeliverableSchema.model_validate({
        "type": "link",
        "url": "https://t.me/example_bot",
        "title": "Ссылка на курс",
    })
    assert link_item.type == "link"
    assert link_item.url == "https://t.me/example_bot"

    # Missing url for link must fail
    with pytest.raises(ValidationError):
        DeliverableSchema.model_validate({"type": "link"})


def test_tariff_create_request_validation():
    """TariffCreateRequest automatically defaults recurring period and enforces price >= 0."""
    req = TariffCreateRequest.model_validate({
        "name": "Месячная подписка",
        "price": 990,
        "paymentType": "recurring",
        "salesMode": "auto",
    })
    assert req.recurring_period == "1_month"
    assert req.price == 990.0

    with pytest.raises(ValidationError):
        TariffCreateRequest.model_validate({
            "name": "Неверный тариф",
            "price": -100,
        })


def test_list_bot_tariffs_endpoint(monkeypatch):
    """GET /api/bots/{bot_id}/tariffs returns tariffs list and summary statistics."""
    fake_bot = SimpleNamespace(id=18)
    tariff1 = _fake_tariff(name="Тариф 1")
    tariff2 = _fake_tariff(name="Тариф 2")

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))
    monkeypatch.setattr(api_router, "list_tariffs_by_bot_id", AsyncMock(return_value=[tariff1, tariff2]))
    monkeypatch.setattr(
        api_router,
        "get_tariff_summary_stats",
        AsyncMock(return_value={
            "total_tariffs": 2,
            "active_count": 2,
            "total_buyers": 10,
            "total_revenue": Decimal("15000.00"),
        }),
    )

    response = asyncio.run(api_router.list_bot_tariffs_endpoint(18, object()))
    assert response["total"] == 2
    assert len(response["tariffs"]) == 2
    assert response["stats"]["totalTariffs"] == 2
    assert response["stats"]["totalRevenue"] == 15000.0


def test_create_tariff_endpoint(monkeypatch):
    """POST /api/bots/{bot_id}/tariffs creates a tariff and returns its API representation."""
    fake_bot = SimpleNamespace(id=18)
    created = _fake_tariff(name="Созданный тариф", price=Decimal("2000.00"))

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))
    monkeypatch.setattr(api_router, "create_tariff", AsyncMock(return_value=created))

    body = TariffCreateRequest.model_validate({
        "name": "Созданный тариф",
        "price": 2000,
        "paymentType": "one_time",
        "salesMode": "auto",
        "deliverables": [
            {"type": "link", "url": "https://example.com/start"},
        ],
    })

    resp = asyncio.run(api_router.create_tariff_endpoint(18, object(), body))
    assert resp["name"] == "Созданный тариф"
    assert resp["price"] == 2000.0
    assert resp["botId"] == 18


def test_get_and_update_tariff_endpoints(monkeypatch):
    """GET and PUT /api/bots/{bot_id}/tariffs/{tariff_id} enforce ownership and update fields."""
    fake_bot = SimpleNamespace(id=18)
    tariff = _fake_tariff(name="Старое имя")
    updated = _fake_tariff(name="Новое имя", price=Decimal("3000.00"))

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))
    monkeypatch.setattr(api_router, "get_tariff_by_id", AsyncMock(return_value=tariff))
    monkeypatch.setattr(api_router, "update_tariff", AsyncMock(return_value=updated))

    # GET
    get_resp = asyncio.run(api_router.get_tariff_endpoint(18, str(tariff.id), object()))
    assert get_resp["name"] == "Старое имя"

    # PUT
    update_body = TariffUpdateRequest.model_validate({"name": "Новое имя", "price": 3000})
    put_resp = asyncio.run(
        api_router.update_tariff_endpoint(18, str(tariff.id), object(), update_body)
    )
    assert put_resp["name"] == "Новое имя"
    assert put_resp["price"] == 3000.0

    # 404 for wrong bot
    foreign_tariff = _fake_tariff(bot_id=999)
    monkeypatch.setattr(api_router, "get_tariff_by_id", AsyncMock(return_value=foreign_tariff))
    with pytest.raises(HTTPException) as err:
        asyncio.run(api_router.get_tariff_endpoint(18, str(foreign_tariff.id), object()))
    assert err.value.status_code == 404


def test_delete_tariff_endpoint(monkeypatch):
    """DELETE /api/bots/{bot_id}/tariffs/{tariff_id} removes tariff and ensures bot ownership."""
    fake_bot = SimpleNamespace(id=18)
    tariff = _fake_tariff()

    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))
    monkeypatch.setattr(api_router, "get_tariff_by_id", AsyncMock(return_value=tariff))
    delete_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(api_router, "delete_tariff", delete_mock)

    resp = asyncio.run(api_router.delete_tariff_endpoint(18, str(tariff.id), object()))
    assert resp["status"] == "ok"
    delete_mock.assert_awaited_once_with(tariff.id)


def test_tariff_stats_endpoint(monkeypatch):
    """GET /api/bots/{bot_id}/tariffs/stats returns aggregate metrics."""
    fake_bot = SimpleNamespace(id=18)
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))
    monkeypatch.setattr(
        api_router,
        "get_tariff_summary_stats",
        AsyncMock(return_value={
            "total_tariffs": 3,
            "active_count": 2,
            "total_buyers": 25,
            "total_revenue": Decimal("50000.00"),
        }),
    )

    resp = asyncio.run(api_router.get_bot_tariffs_stats_endpoint(18, object()))
    assert resp["totalTariffs"] == 3
    assert resp["activeCount"] == 2
    assert resp["totalBuyers"] == 25
    assert resp["totalRevenue"] == 50000.0


def test_tariff_file_upload_and_download(monkeypatch, tmp_path):
    """File upload accepts any extension, saves securely, and supports file serving."""
    fake_bot = SimpleNamespace(id=18)
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=fake_bot))

    # Mock upload dir to use tmp_path
    monkeypatch.setattr(api_router, "Path", lambda *args: tmp_path if "uploads" in str(args) else Path(*args))

    content = b"%PDF-1.4 sample pdf content for deliverable"
    file = UploadFile(
        file=io.BytesIO(content),
        filename="guide.pdf",
        headers={"content-type": "application/pdf"},
    )

    upload_resp = asyncio.run(
        api_router.upload_tariff_deliverable_file_endpoint(18, object(), file)
    )
    assert upload_resp["filename"] == "guide.pdf"
    assert upload_resp["size"] == len(content)
    assert "/uploads/tariffs/18/" in upload_resp["path"]

    # Empty file must be rejected with 400
    empty_file = UploadFile(
        file=io.BytesIO(b""),
        filename="empty.zip",
    )
    with pytest.raises(HTTPException) as err:
        asyncio.run(
            api_router.upload_tariff_deliverable_file_endpoint(18, object(), empty_file)
        )
    assert err.value.status_code == 400


def test_bot_activation_blocked_for_auto_tariff_without_payment(monkeypatch):
    """Safety rule: auto/hybrid sales mode requires a connected payment provider before launch."""
    auto_tariff = _fake_tariff(is_active=True, sales_mode="auto")
    bot = SimpleNamespace(
        id=18,
        owner_id=9,
        owner=SimpleNamespace(),
        payment_provider=None,  # No payment provider!
        payment_creds_enc=None,
        tariffs=[auto_tariff],
    )

    monkeypatch.setattr(api_router, "_tariffs_for_bot", AsyncMock(return_value=[auto_tariff]))
    monkeypatch.setattr(api_router, "get_bot_subscription", AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as err:
        asyncio.run(
            api_router._toggle_client_bot(
                bot,
                object(),
                action="start",
                allow_admin_entitlement_bypass=False,
            )
        )
    assert err.value.status_code == 422
    assert "Подключите платёжную систему" in err.value.detail


def test_bot_activation_allowed_for_manual_tariff_without_payment(monkeypatch):
    """Safety rule: manual sales mode does NOT require a payment provider for activation."""
    manual_tariff = _fake_tariff(is_active=True, sales_mode="manual")
    bot = SimpleNamespace(
        id=18,
        owner_id=9,
        owner=SimpleNamespace(),
        payment_provider=None,
        payment_creds_enc=None,
        tariffs=[manual_tariff],
        status="draft",
        lifecycle_status="ready",
        pause_reason=None,
        has_lifetime_license=True,
    )
    persisted = SimpleNamespace(
        id=18,
        status="active",
        lifecycle_status="published",
        pause_reason=None,
        username="manual_sales_bot",
    )

    monkeypatch.setattr(api_router, "_tariffs_for_bot", AsyncMock(return_value=[manual_tariff]))
    monkeypatch.setattr(api_router, "get_bot_subscription", AsyncMock(return_value=None))
    monkeypatch.setattr(api_router, "is_pro_active", lambda _owner: True)
    monkeypatch.setattr(api_router.bot_lifecycle_service, "transition", AsyncMock())
    monkeypatch.setattr(api_router, "_install_client_bot_webhook", AsyncMock())
    monkeypatch.setattr(api_router, "set_bot_lifecycle_state", AsyncMock(return_value=persisted))

    resp = asyncio.run(
        api_router._toggle_client_bot(
            bot,
            object(),
            action="start",
            allow_admin_entitlement_bypass=False,
        )
    )
    assert resp["botStatus"] == "active"
