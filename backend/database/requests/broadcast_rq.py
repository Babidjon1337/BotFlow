"""R7 broadcast queries: audience counts, recipient snapshots, claim and progress."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select, String, update

from database.models import Broadcast, BroadcastRecipient, Lead, async_session
from loggers import logger

AUDIENCE_FILTERS = ("all", "paid", "unpaid")

# Аварийное возвращение рассылки в очередь, если процесс умер во время отправки.
STALE_SENDING_THRESHOLD = timedelta(minutes=10)


def audience_condition(audience: str):
    """SQL-условие фильтра аудитории; None означает «все»."""
    if audience == "paid":
        return Lead.has_purchased.is_(True)
    if audience == "unpaid":
        return Lead.has_purchased.is_(False)
    return None


async def get_audience_summary(bot_id: int) -> dict:
    """Честные счётчики активной (не архивной) аудитории бота."""
    async with async_session() as session:
        base = select(Lead.has_purchased).where(
            Lead.bot_id == bot_id, Lead.is_archived.is_(False)
        )
        rows = await session.execute(base)
        all_count = 0
        paid_count = 0
        for (has_purchased,) in rows:
            all_count += 1
            if has_purchased:
                paid_count += 1
        return {
            "all": all_count,
            "paid": paid_count,
            "unpaid": all_count - paid_count,
        }


async def list_audience_leads(
    bot_id: int,
    audience: str = "all",
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
) -> tuple[list[Lead], int]:
    """Страница аудитории с фильтром все/оплатившие/неоплатившие."""
    if audience not in AUDIENCE_FILTERS:
        audience = "all"
    page = max(page, 1)
    limit = max(min(limit, 100), 1)
    async with async_session() as session:
        query = select(Lead).where(
            Lead.bot_id == bot_id, Lead.is_archived.is_(False)
        )
        condition = audience_condition(audience)
        if condition is not None:
            query = query.where(condition)
        if search:
            search_str = f"%{search.lower()}%"
            query = query.where(
                or_(
                    func.lower(Lead.username).like(search_str),
                    func.lower(Lead.first_name).like(search_str),
                    func.cast(Lead.telegram_id, String).like(search_str),
                )
            )
        total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = await session.scalars(
            query.order_by(Lead.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        return list(items.all()), total


async def create_broadcast(bot_id: int, text: str, audience: str) -> Broadcast:
    """Создаёт рассылку и мгновенный снимок получателей; ставит в очередь.

    Снимок делается в момент создания: изменение аудитории после этого
    не меняет состав рассылки, а счётчик получателей детерминирован.
    """
    if audience not in AUDIENCE_FILTERS:
        raise ValueError("Неизвестный фильтр аудитории")
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("Текст рассылки пуст")
    if len(cleaned) > 4096:
        raise ValueError("Текст длиннее лимита Telegram в 4096 символов")

    async with async_session() as session:
        leads_query = select(Lead).where(
            Lead.bot_id == bot_id, Lead.is_archived.is_(False)
        )
        condition = audience_condition(audience)
        if condition is not None:
            leads_query = leads_query.where(condition)
        leads = (await session.scalars(leads_query)).all()
        if not leads:
            raise ValueError("В выбранной аудитории нет получателей")

        broadcast = Broadcast(
            bot_id=bot_id,
            status="queued",
            audience=audience,
            text=cleaned,
            platform="telegram",
            total_recipients=len(leads),
        )
        session.add(broadcast)
        await session.flush()
        session.add_all(
            [
                BroadcastRecipient(
                    broadcast_id=broadcast.id,
                    lead_id=lead.id,
                    telegram_id=lead.telegram_id,
                )
                for lead in leads
            ]
        )
        await session.commit()
        await session.refresh(broadcast)
        return broadcast


async def list_broadcasts(bot_id: int, limit: int = 30) -> list[Broadcast]:
    async with async_session() as session:
        items = await session.scalars(
            select(Broadcast)
            .where(Broadcast.bot_id == bot_id)
            .order_by(Broadcast.created_at.desc())
            .limit(max(min(limit, 100), 1))
        )
        return list(items.all())


async def get_broadcast(broadcast_id: UUID) -> Optional[Broadcast]:
    async with async_session() as session:
        return await session.get(Broadcast, broadcast_id)


async def claim_queued_broadcast() -> Optional[Broadcast]:
    """Атомарно забирает одну рассылку из очереди (PostgreSQL SKIP LOCKED)."""
    async with async_session() as session:
        subquery = (
            select(Broadcast.id)
            .where(Broadcast.status == "queued")
            .order_by(Broadcast.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        result = await session.execute(
            update(Broadcast)
            .where(Broadcast.id.in_(subquery))
            .values(
                status="sending",
                claimed_at=datetime.now(timezone.utc),
                started_at=func.coalesce(Broadcast.started_at, func.now()),
            )
            .returning(Broadcast)
            .execution_options(synchronize_session=False)
        )
        row = result.scalar_one_or_none()
        if row is None:
            await session.rollback()
            return None
        await session.commit()
        return row


async def requeue_stale_sending_broadcasts() -> int:
    """Возвращает в очередь рассылки, застрявшие в sending после сбоя."""
    threshold = datetime.now(timezone.utc) - STALE_SENDING_THRESHOLD
    async with async_session() as session:
        result = await session.execute(
            update(Broadcast)
            .where(
                Broadcast.status == "sending",
                or_(Broadcast.claimed_at.is_(None), Broadcast.claimed_at < threshold),
            )
            .values(status="queued", claimed_at=None, last_error="Отправка прервана, возобновляем")
            .execution_options(synchronize_session=False)
        )
        await session.commit()
        return result.rowcount or 0


async def get_pending_recipients(
    broadcast_id: UUID, limit: int = 100
) -> list[BroadcastRecipient]:
    async with async_session() as session:
        items = await session.scalars(
            select(BroadcastRecipient)
            .where(
                BroadcastRecipient.broadcast_id == broadcast_id,
                BroadcastRecipient.status == "pending",
            )
            .limit(max(min(limit, 500), 1))
        )
        return list(items.all())


async def mark_recipient_sent(recipient_id: int, broadcast_id: UUID) -> None:
    async with async_session() as session:
        await session.execute(
            update(BroadcastRecipient)
            .where(
                BroadcastRecipient.id == recipient_id,
                BroadcastRecipient.status == "pending",
            )
            .values(status="sent", sent_at=func.now())
        )
        await session.execute(
            update(Broadcast)
            .where(Broadcast.id == broadcast_id)
            .values(sent_count=Broadcast.sent_count + 1)
        )
        await session.commit()


async def mark_recipient_failed(
    recipient_id: int, broadcast_id: UUID, error: str
) -> None:
    async with async_session() as session:
        await session.execute(
            update(BroadcastRecipient)
            .where(
                BroadcastRecipient.id == recipient_id,
                BroadcastRecipient.status == "pending",
            )
            .values(status="failed", error=(error or "Ошибка отправки")[:500])
        )
        await session.execute(
            update(Broadcast)
            .where(Broadcast.id == broadcast_id)
            .values(failed_count=Broadcast.failed_count + 1)
        )
        await session.commit()


async def finalize_broadcast(broadcast_id: UUID) -> str:
    """Завершает рассылку: sent, если доставлено хотя бы одно сообщение."""
    async with async_session() as session:
        broadcast = await session.get(Broadcast, broadcast_id)
        if broadcast is None:
            return "missing"
        pending = await session.scalar(
            select(func.count())
            .select_from(BroadcastRecipient)
            .where(
                BroadcastRecipient.broadcast_id == broadcast_id,
                BroadcastRecipient.status == "pending",
            )
        )
        if pending:
            # Отправка была прервана — оставляем в sending до возврата в очередь.
            return broadcast.status
        final_status = "failed" if broadcast.sent_count == 0 else "sent"
        await session.execute(
            update(Broadcast)
            .where(Broadcast.id == broadcast_id, Broadcast.status == "sending")
            .values(
                status=final_status,
                completed_at=func.now(),
                last_error=(
                    "Ни одно сообщение не доставлено" if final_status == "failed" else None
                ),
            )
        )
        await session.commit()
        return final_status


async def requeue_failed_recipients(broadcast_id: UUID) -> int:
    """Готовит повтор неудачных доставок: failed -> pending, рассылка -> queued."""
    async with async_session() as session:
        broadcast = await session.get(Broadcast, broadcast_id)
        if broadcast is None:
            raise ValueError("Рассылка не найдена")
        if broadcast.status not in ("sent", "failed"):
            raise ValueError("Повтор доступен только для завершённой рассылки")
        result = await session.execute(
            update(BroadcastRecipient)
            .where(
                BroadcastRecipient.broadcast_id == broadcast_id,
                BroadcastRecipient.status == "failed",
            )
            .values(status="pending", error=None)
            .execution_options(synchronize_session=False)
        )
        requeued = result.rowcount or 0
        if requeued == 0:
            return 0
        await session.execute(
            update(Broadcast)
            .where(Broadcast.id == broadcast_id)
            .values(
                status="queued",
                failed_count=0,
                completed_at=None,
                last_error=None,
                claimed_at=None,
            )
        )
        await session.commit()
        return requeued
