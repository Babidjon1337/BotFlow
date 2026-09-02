"""R7 broadcast contracts: validation, camelCase payloads and claim safety."""

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api_router
from database.models import Broadcast
from database.requests import broadcast_rq
from schemas.api_schemas import BroadcastApiResponse, BroadcastCreateRequest


def _broadcast(**overrides):
    values = {
        "id": uuid.uuid4(),
        "bot_id": 18,
        "status": "queued",
        "audience": "all",
        "text": "Привет! Скидка 20% только сегодня.",
        "platform": "telegram",
        "total_recipients": 42,
        "sent_count": 0,
        "failed_count": 0,
        "scheduled_at": None,
        "media_asset_ids": [],
        "button": None,
        "claimed_at": None,
        "started_at": None,
        "completed_at": None,
        "last_error": None,
        "created_at": datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_broadcast_create_rejects_bad_input_before_touching_db():
    with pytest.raises(ValueError, match="Текст рассылки пуст"):
        asyncio.run(broadcast_rq.create_broadcast(1, "   ", "all"))
    with pytest.raises(ValueError, match="4096"):
        asyncio.run(broadcast_rq.create_broadcast(1, "x" * 4097, "all"))
    with pytest.raises(ValueError, match="аудитории"):
        asyncio.run(broadcast_rq.create_broadcast(1, "Привет", "vip"))


def test_broadcast_media_upload_does_not_require_funnel_node():
    # Регресс: медиа рассылки (node_id=broadcast) не принадлежит блокам воронки,
    # поэтому загрузка не должна падать с 404 «Блок воронки не найден».
    assert api_router.BROADCAST_MEDIA_NODE_ID == 'broadcast'
    source = Path(api_router.__file__).read_text(encoding='utf-8')
    upload_src = source.split('async def upload_bot_media(', 1)[1].split('@api_router', 1)[0]
    assert 'is_broadcast_media = node_id == BROADCAST_MEDIA_NODE_ID' in upload_src
    # 404 поднимается только когда это НЕ медиа рассылки.
    assert 'if not is_broadcast_media and target_node is None and target_tariff_id is None:' in upload_src


def test_access_link_validation():
    from database.requests.access_link_rq import _generate_token
    token = _generate_token()
    assert len(token) == 10 and token.isalnum()
    # period без срока - ошибка
    import asyncio as _aio
    from database.requests import access_link_rq
    with pytest.raises(ValueError, match='срок'):
        _aio.run(access_link_rq.create_access_link(kind='period', days=None, expires_at=None, note=None))
    with pytest.raises(ValueError, match='Неизвестный тип'):
        _aio.run(access_link_rq.create_access_link(kind='forever', days=1, expires_at=None, note=None))


def test_broadcast_button_normalization():
    # Consult: без текста подставляется дефолт, url валидируется.
    btn = broadcast_rq.normalize_broadcast_button({'type': 'consult', 'url': 'https://t.me/owner'})
    assert btn == {'type': 'consult', 'text': 'Написать автору', 'url': 'https://t.me/owner'}
    with pytest.raises(ValueError, match='https'):
        broadcast_rq.normalize_broadcast_button({'type': 'consult', 'url': 't.me/owner'})
    # Tariffs: пустой список запрещён.
    with pytest.raises(ValueError, match='тарифы'):
        broadcast_rq.normalize_broadcast_button({'type': 'tariffs', 'tariffIds': []})
    assert broadcast_rq.normalize_broadcast_button(None) is None
    with pytest.raises(ValueError, match='Неизвестный тип'):
        broadcast_rq.normalize_broadcast_button({'type': 'nope'})


def test_broadcast_response_uses_camel_case_and_hides_nothing_sensitive():
    payload = BroadcastApiResponse.from_orm_broadcast(
        _broadcast(status="sent", sent_count=40, failed_count=2)
    ).model_dump(by_alias=True)

    assert payload["status"] == "sent"
    assert payload["totalRecipients"] == 42
    assert payload["sentCount"] == 40
    assert payload["failedCount"] == 2
    assert payload["createdAt"] == "2026-08-28T12:00:00+00:00"
    assert "botId" not in payload


def test_create_broadcast_endpoint_maps_empty_audience_to_400(monkeypatch):
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=SimpleNamespace(id=18)))
    monkeypatch.setattr(
        api_router,
        "create_broadcast",
        AsyncMock(side_effect=ValueError("В выбранной аудитории нет получателей")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            api_router.create_broadcast_endpoint(
                18, object(), BroadcastCreateRequest(text="Привет", audience="paid")
            )
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "В выбранной аудитории нет получателей"


def test_create_broadcast_endpoint_returns_broadcast_payload(monkeypatch):
    broadcast = _broadcast()
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=SimpleNamespace(id=18)))
    monkeypatch.setattr(api_router, "create_broadcast", AsyncMock(return_value=broadcast))

    response = asyncio.run(
        api_router.create_broadcast_endpoint(
            18, object(), BroadcastCreateRequest(text="Привет", audience="all")
        )
    )

    assert response["id"] == str(broadcast.id)
    assert response["totalRecipients"] == 42
    assert response["status"] == "queued"


def test_list_audience_endpoint_passes_filter_through(monkeypatch):
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    spy = AsyncMock(return_value=([], 0))
    monkeypatch.setattr(api_router, "list_audience_leads", spy)

    asyncio.run(api_router.list_audience_endpoint(18, object(), audience="unpaid"))

    assert spy.call_args.kwargs["audience"] == "unpaid"


def test_broadcast_detail_is_hidden_when_bot_is_foreign(monkeypatch):
    broadcast = _broadcast()
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=broadcast))
    monkeypatch.setattr(
        api_router,
        "get_owned_bot",
        AsyncMock(side_effect=HTTPException(status_code=404, detail="Бот не найден")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api_router.get_broadcast_endpoint(broadcast.id, object()))

    assert exc_info.value.status_code == 404


def test_get_broadcast_endpoint_returns_404_for_missing_broadcast(monkeypatch):
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api_router.get_broadcast_endpoint(uuid.uuid4(), object()))

    assert exc_info.value.status_code == 404


def test_retry_endpoint_requires_finished_broadcast_with_failures(monkeypatch):
    broadcast = _broadcast(status="sent", failed_count=0)
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=broadcast))
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    monkeypatch.setattr(
        api_router,
        "requeue_failed_recipients",
        AsyncMock(side_effect=ValueError("Повтор доступен только для завершённой рассылки")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api_router.retry_broadcast_endpoint(broadcast.id, object()))

    assert exc_info.value.status_code == 400


def test_retry_endpoint_requeues_failed_recipients(monkeypatch):
    broadcast = _broadcast(status="sent", sent_count=40, failed_count=2)
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=broadcast))
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    monkeypatch.setattr(api_router, "requeue_failed_recipients", AsyncMock(return_value=2))

    response = asyncio.run(api_router.retry_broadcast_endpoint(broadcast.id, object()))

    assert response["status"] == "sent"
    assert response["failedCount"] == 2


def test_claim_query_locks_one_queued_broadcast_with_skip_locked():
    from sqlalchemy import select, update

    subquery = (
        select(Broadcast.id)
        .where(Broadcast.status == "queued")
        .order_by(Broadcast.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    sql = str(
        update(Broadcast)
        .where(Broadcast.id.in_(subquery))
        .values(status="sending")
        .compile(dialect=postgresql.dialect())
    ).upper()

    assert "FOR UPDATE" in sql
    assert "SKIP LOCKED" in sql


def test_broadcast_recipient_unique_constraint_is_declared():
    """Уникальность пары (broadcast, lead) — защита от дублей при повторах."""
    from database.models import BroadcastRecipient

    unique = [
        constraint
        for constraint in BroadcastRecipient.__table__.constraints
        if constraint.name == "uq_broadcast_recipient"
    ]
    assert unique, "Ожидается уникальный constraint на (broadcast_id, lead_id)"


# ── R7.3: отложенная отправка и отмена ───────────────────────


def test_broadcast_response_exposes_scheduled_at():
    when = datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc)
    payload = BroadcastApiResponse.from_orm_broadcast(
        _broadcast(status="scheduled", scheduled_at=when)
    ).model_dump(by_alias=True)
    assert payload["scheduledAt"] == "2026-09-01T09:30:00+00:00"
    assert payload["status"] == "scheduled"

    payload_now = BroadcastApiResponse.from_orm_broadcast(
        _broadcast()
    ).model_dump(by_alias=True)
    assert payload_now["scheduledAt"] is None


def test_broadcast_response_exposes_media_asset_ids():
    payload = BroadcastApiResponse.from_orm_broadcast(
        _broadcast(media_asset_ids=["11111111-1111-1111-1111-111111111111"])
    ).model_dump(by_alias=True)
    assert payload["mediaAssetIds"] == ["11111111-1111-1111-1111-111111111111"]

    empty = BroadcastApiResponse.from_orm_broadcast(_broadcast()).model_dump(by_alias=True)
    assert empty["mediaAssetIds"] == []


def test_create_broadcast_validates_media_count():
    """Больше 10 медиа в одной рассылке — нельзя (лимит Telegram media group)."""
    ids = [str(uuid.uuid4()) for _ in range(11)]
    with pytest.raises(ValueError, match="10 медиафайлов"):
        asyncio.run(broadcast_rq.create_broadcast(1, "Привет", "all", media_asset_ids=ids))


def test_create_broadcast_requires_text_or_media():
    """Валидация текста/медиа — до обращения к базе."""
    with pytest.raises(ValueError, match="Некорректный идентификатор медиафайла"):
        asyncio.run(
            broadcast_rq.create_broadcast(1, "   ", "all", media_asset_ids=["не-uuid"])
        )
    # Пустой текст без медиа отсекается до БД (как и раньше)
    with pytest.raises(ValueError, match="Текст рассылки пуст"):
        asyncio.run(broadcast_rq.create_broadcast(1, "   ", "all"))


def test_create_broadcast_accepts_media_only_with_valid_uuids():
    """Плохие uuid отсекаются до запроса в БД."""
    with pytest.raises(ValueError, match="Некорректный идентификатор медиафайла"):
        asyncio.run(
            broadcast_rq.create_broadcast(
                1, "Привет", "all", media_asset_ids=["not-a-uuid"]
            )
        )


def test_create_endpoint_passes_media_through(monkeypatch):
    broadcast = _broadcast()
    spy = AsyncMock(return_value=broadcast)
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=SimpleNamespace(id=18)))
    monkeypatch.setattr(api_router, "create_broadcast", spy)

    asset_id = str(uuid.uuid4())
    response = asyncio.run(
        api_router.create_broadcast_endpoint(
            18,
            object(),
            BroadcastCreateRequest(text="Привет", audience="all", media_asset_ids=[asset_id]),
        )
    )

    assert spy.call_args.kwargs["media_asset_ids"] == [asset_id]
    assert response["id"] == str(broadcast.id)


def test_create_broadcast_validates_scheduled_date_before_db():
    """Невалидная дата отсекается до обращения к базе."""
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    with pytest.raises(ValueError, match="в будущем"):
        asyncio.run(broadcast_rq.create_broadcast(1, "Привет", "all", scheduled_at=past))

    naive_soon = datetime.now() + timedelta(hours=2)
    normalized = broadcast_rq.normalize_scheduled_at(naive_soon)
    assert normalized is not None and normalized.tzinfo is not None

    far = datetime.now(timezone.utc) + timedelta(days=91)
    with pytest.raises(ValueError, match="90 дней"):
        asyncio.run(broadcast_rq.create_broadcast(1, "Привет", "all", scheduled_at=far))


def test_scheduled_request_model_accepts_camel_case():
    request = BroadcastCreateRequest.model_validate(
        {"text": "Привет", "audience": "all", "scheduledAt": "2026-09-01T09:30:00Z"}
    )
    assert request.scheduled_at is not None
    assert request.scheduled_at.tzinfo is not None


def test_create_endpoint_passes_schedule_through(monkeypatch):
    when = datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc)
    broadcast = _broadcast(status="scheduled", scheduled_at=when)
    spy = AsyncMock(return_value=broadcast)
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=SimpleNamespace(id=18)))
    monkeypatch.setattr(api_router, "create_broadcast", spy)

    response = asyncio.run(
        api_router.create_broadcast_endpoint(
            18,
            object(),
            BroadcastCreateRequest(text="Привет", audience="all", scheduled_at=when),
        )
    )

    assert spy.call_args.kwargs["scheduled_at"] == when
    assert response["status"] == "scheduled"
    assert response["scheduledAt"] == "2026-09-01T09:30:00+00:00"


def test_create_endpoint_maps_bad_schedule_to_400(monkeypatch):
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock(return_value=SimpleNamespace(id=18)))
    monkeypatch.setattr(
        api_router,
        "create_broadcast",
        AsyncMock(side_effect=ValueError("Дата отправки должна быть хотя бы на минуту в будущем")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            api_router.create_broadcast_endpoint(
                18, object(), BroadcastCreateRequest(text="Привет", audience="all")
            )
        )

    assert exc_info.value.status_code == 400
    assert "будущем" in exc_info.value.detail


def test_claim_query_ignores_unmatured_scheduled_broadcasts():
    """Claim берёт только queued без даты или с наступившей датой."""
    from sqlalchemy import func, or_, select, update

    now = datetime.now(timezone.utc)
    subquery = (
        select(Broadcast.id)
        .where(
            Broadcast.status == "queued",
            or_(
                Broadcast.scheduled_at.is_(None),
                Broadcast.scheduled_at <= now,
            ),
        )
        .order_by(func.coalesce(Broadcast.scheduled_at, Broadcast.created_at).asc())
        .limit(1)
    )
    sql = str(subquery.compile(dialect=postgresql.dialect())).upper()

    assert "SCHEDULED_AT" in sql
    assert "COALESCE" in sql


def test_cancel_endpoint_marks_queued_broadcast_cancelled(monkeypatch):
    broadcast = _broadcast()
    cancelled = _broadcast(
        id=broadcast.id, status="cancelled", completed_at=broadcast.created_at
    )
    monkeypatch.setattr(
        api_router,
        "get_broadcast",
        AsyncMock(side_effect=[broadcast, cancelled]),
    )
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    monkeypatch.setattr(api_router, "cancel_broadcast", AsyncMock(return_value="cancelled"))

    response = asyncio.run(api_router.cancel_broadcast_endpoint(broadcast.id, object()))

    assert response["status"] == "cancelled"
    assert response["id"] == str(broadcast.id)


def test_cancel_endpoint_blocks_sending_broadcast(monkeypatch):
    broadcast = _broadcast(status="sending")
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=broadcast))
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    monkeypatch.setattr(
        api_router,
        "cancel_broadcast",
        AsyncMock(side_effect=ValueError("Рассылка уже отправляется — отменить нельзя")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api_router.cancel_broadcast_endpoint(broadcast.id, object()))

    assert exc_info.value.status_code == 400
    assert "отправляется" in exc_info.value.detail


def test_cancel_endpoint_is_hidden_for_foreign_bot(monkeypatch):
    broadcast = _broadcast(status="scheduled")
    monkeypatch.setattr(api_router, "get_broadcast", AsyncMock(return_value=broadcast))
    monkeypatch.setattr(
        api_router,
        "get_owned_bot",
        AsyncMock(side_effect=HTTPException(status_code=404, detail="Бот не найден")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api_router.cancel_broadcast_endpoint(broadcast.id, object()))

    assert exc_info.value.status_code == 404


def test_cancel_rq_query_only_touches_queued_and_scheduled():
    """Отмена одним UPDATE: только queued/scheduled, остальное — исключение."""
    from sqlalchemy import update

    sql = str(
        update(Broadcast)
        .where(Broadcast.status.in_(("queued", "scheduled")))
        .values(status="cancelled")
        .compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    ).upper()

    assert "QUEUED" in sql and "SCHEDULED" in sql and "CANCELLED" in sql
    assert "SENDING" not in sql
