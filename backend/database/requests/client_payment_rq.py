"""Persistence operations for individual payments made to client bots."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import joinedload

from database.models import ClientPayment, Lead, ScheduledTask, async_session


class ClientPaymentInvariantError(ValueError):
    """A verified provider callback does not match its immutable local order."""


class ClientPaymentDeliveryRetryError(ValueError):
    """A paid order cannot safely be retried at the requested moment."""


async def get_client_payment_stats(bot_id: int) -> tuple[int, Decimal]:
    async with async_session() as session:
        result = await session.execute(
            select(
                func.count(ClientPayment.id),
                func.coalesce(func.sum(ClientPayment.amount), Decimal("0.00")),
            ).where(ClientPayment.bot_id == bot_id, ClientPayment.status == "succeeded")
        )
        count, revenue = result.one()
        return int(count or 0), Decimal(revenue or 0)


async def get_chart_data(
    bot_id: int, period: str = "week"
) -> list[dict]:
    """Return daily sales and new-user counts for the last N days."""
    days = 7 if period == "week" else 30
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    async with async_session() as session:
        # Daily sales counts
        sales_result = await session.execute(
            select(
                func.date(ClientPayment.created_at).label("day"),
                func.count(ClientPayment.id).label("cnt"),
            )
            .where(
                ClientPayment.bot_id == bot_id,
                ClientPayment.status == "succeeded",
                ClientPayment.created_at >= cutoff,
            )
            .group_by(func.date(ClientPayment.created_at))
            .order_by(func.date(ClientPayment.created_at))
        )
        sales_by_day: dict[str, int] = {
            str(row.day): int(row.cnt) for row in sales_result
        }

        # Daily new leads counts
        leads_result = await session.execute(
            select(
                func.date(Lead.created_at).label("day"),
                func.count(Lead.id).label("cnt"),
            )
            .where(Lead.bot_id == bot_id, Lead.created_at >= cutoff)
            .group_by(func.date(Lead.created_at))
            .order_by(func.date(Lead.created_at))
        )
        users_by_day: dict[str, int] = {
            str(row.day): int(row.cnt) for row in leads_result
        }

    points = []
    for i in range(days):
        day = (datetime.now(tz=timezone.utc) - timedelta(days=days - 1 - i)).date()
        key = str(day)
        label = f"{day.day:02d}.{day.month:02d}"
        points.append({"date": label, "sales": sales_by_day.get(key, 0), "users": users_by_day.get(key, 0)})
    return points


async def create_client_payment(
    *,
    bot_id: int,
    lead_id: int,
    provider: str,
    tariff: dict[str, Any],
    invoice_batch_id: uuid.UUID | None = None,
) -> ClientPayment:
    amount = Decimal(str(tariff["price"])).quantize(Decimal("0.01"))
    payment = ClientPayment(
        bot_id=bot_id,
        lead_id=lead_id,
        invoice_batch_id=invoice_batch_id,
        tariff_id=str(tariff["id"]),
        tariff_snapshot=dict(tariff),
        amount=amount,
        provider=provider.casefold(),
        idempotence_key=str(uuid.uuid4()),
    )
    async with async_session() as session:
        session.add(payment)
        await session.commit()
        await session.refresh(payment)
        return payment


async def get_client_payment(payment_id: uuid.UUID | str) -> ClientPayment | None:
    try:
        normalized_id = uuid.UUID(str(payment_id))
    except ValueError:
        return None
    async with async_session() as session:
        return await session.scalar(
            select(ClientPayment)
            .options(joinedload(ClientPayment.bot), joinedload(ClientPayment.lead))
            .where(ClientPayment.id == normalized_id)
        )


async def list_invoice_batch(payment: ClientPayment) -> list[ClientPayment]:
    if not payment.invoice_batch_id:
        return [payment]
    async with async_session() as session:
        rows = await session.scalars(
            select(ClientPayment)
            .where(ClientPayment.invoice_batch_id == payment.invoice_batch_id)
            .order_by(ClientPayment.created_at)
        )
        return list(rows)


async def set_client_payment_provider_id(payment_id: uuid.UUID, provider_id: str) -> None:
    async with async_session() as session:
        payment = await session.get(ClientPayment, payment_id)
        if payment and not payment.provider_payment_id:
            payment.provider_payment_id = provider_id
            await session.commit()


async def mark_client_payment_succeeded(
    *,
    payment_id: uuid.UUID | str,
    bot_id: int,
    provider: str,
    provider_payment_id: str,
    amount: Decimal,
    currency: str,
    telegram_id: int,
) -> tuple[ClientPayment, bool]:
    """Persist verified payment and lead conversion atomically and idempotently."""
    try:
        normalized_id = uuid.UUID(str(payment_id))
    except ValueError:
        raise ClientPaymentInvariantError("Client payment ID is invalid")
    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(ClientPayment.id == normalized_id)
            .with_for_update(of=ClientPayment)
        )
        if not payment:
            raise ClientPaymentInvariantError("Client payment does not exist")
        if (
            payment.bot_id != bot_id
            or payment.provider != provider.casefold()
            or payment.amount != amount
            or payment.currency != currency
        ):
            raise ClientPaymentInvariantError(
                "Verified payment does not match the local order"
            )
        if payment.provider_payment_id and payment.provider_payment_id != provider_payment_id:
            raise ClientPaymentInvariantError(
                "Provider payment ID conflicts with the local order"
            )

        lead = await session.scalar(
            select(Lead)
            .where(Lead.id == payment.lead_id)
            .with_for_update(of=Lead)
        )
        if not lead or lead.bot_id != bot_id or lead.telegram_id != telegram_id:
            raise ClientPaymentInvariantError(
                "Verified payer does not match the local order"
            )

        newly_paid = payment.status != "succeeded"
        payment.provider_payment_id = provider_payment_id
        payment.status = "succeeded"
        payment.paid_at = payment.paid_at or datetime.now(timezone.utc)
        lead.current_step_id = "node_success"
        lead.has_purchased = True
        await session.execute(
            delete(ScheduledTask).where(ScheduledTask.lead_id == lead.id)
        )
        await session.commit()
        await session.refresh(payment)
        return payment, newly_paid


async def _claim_delivery_state(
    payment_id: uuid.UUID,
    *,
    status_field: str,
    attempts_field: str,
    retry_field: str,
) -> ClientPayment | None:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(ClientPayment.id == payment_id)
            .with_for_update(of=ClientPayment)
        )
        if not payment or payment.status != "succeeded":
            return None
        status = getattr(payment, status_field)
        retry_at = getattr(payment, retry_field)
        if status == "succeeded" or (retry_at and retry_at > now):
            return None
        setattr(payment, status_field, "processing")
        setattr(payment, attempts_field, getattr(payment, attempts_field) + 1)
        setattr(payment, retry_field, now + timedelta(minutes=5))
        await session.commit()
        await session.refresh(payment)
        return payment


async def claim_client_payment_fulfillment(payment_id: uuid.UUID) -> ClientPayment | None:
    return await _claim_delivery_state(
        payment_id,
        status_field="fulfillment_status",
        attempts_field="fulfillment_attempts",
        retry_field="fulfillment_next_retry_at",
    )


async def claim_owner_payment_notification(payment_id: uuid.UUID) -> ClientPayment | None:
    return await _claim_delivery_state(
        payment_id,
        status_field="owner_notification_status",
        attempts_field="owner_notification_attempts",
        retry_field="owner_notification_next_retry_at",
    )


async def requeue_client_payment_delivery(payment_id: uuid.UUID | str) -> dict[str, bool]:
    """Make unfinished paid-order delivery eligible for one immediate retry.

    This never changes the provider payment state. A fresh ``processing`` claim is
    intentionally protected from an administrator retry, so two workers cannot
    send the same access message concurrently.
    """
    try:
        normalized_id = uuid.UUID(str(payment_id))
    except ValueError as exc:
        raise ClientPaymentDeliveryRetryError("Некорректный идентификатор операции") from exc

    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(ClientPayment.id == normalized_id)
            .with_for_update(of=ClientPayment)
        )
        if not payment or payment.status != "succeeded":
            raise ClientPaymentDeliveryRetryError(
                "Можно повторить только подтверждённую оплату."
            )

        stages = (
            ("fulfillment_status", "fulfillment_next_retry_at"),
            ("owner_notification_status", "owner_notification_next_retry_at"),
        )
        if any(
            getattr(payment, status_field) == "processing"
            and (retry_at := getattr(payment, retry_field))
            and retry_at > now
            for status_field, retry_field in stages
        ):
            raise ClientPaymentDeliveryRetryError(
                "Операция уже выполняется. Дождитесь завершения текущей попытки."
            )

        requeued_fulfillment = payment.fulfillment_status != "succeeded"
        requeued_notification = payment.owner_notification_status != "succeeded"
        if not requeued_fulfillment and not requeued_notification:
            raise ClientPaymentDeliveryRetryError("Операция уже полностью завершена.")

        if requeued_fulfillment:
            payment.fulfillment_status = "retry"
            payment.fulfillment_next_retry_at = None
        if requeued_notification:
            payment.owner_notification_status = "retry"
            payment.owner_notification_next_retry_at = None
        await session.commit()

    return {
        "fulfillment_requeued": requeued_fulfillment,
        "owner_notification_requeued": requeued_notification,
    }


async def _finish_delivery_state(
    payment_id: uuid.UUID,
    *,
    status_field: str,
    retry_field: str,
    error_field: str,
    completed_field: str,
    error: str | None,
) -> None:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(ClientPayment.id == payment_id)
            .with_for_update(of=ClientPayment)
        )
        if not payment:
            return
        if error is None:
            setattr(payment, status_field, "succeeded")
            setattr(payment, retry_field, None)
            setattr(payment, error_field, None)
            setattr(payment, completed_field, now)
        else:
            attempts_field = (
                "fulfillment_attempts"
                if status_field == "fulfillment_status"
                else "owner_notification_attempts"
            )
            attempts = max(1, getattr(payment, attempts_field))
            delay_minutes = min(24 * 60, 2 ** min(attempts - 1, 10))
            setattr(payment, status_field, "retry")
            setattr(payment, retry_field, now + timedelta(minutes=delay_minutes))
            setattr(payment, error_field, error[:2000])
        await session.commit()


async def mark_client_payment_fulfilled(payment_id: uuid.UUID) -> None:
    await _finish_delivery_state(
        payment_id,
        status_field="fulfillment_status",
        retry_field="fulfillment_next_retry_at",
        error_field="fulfillment_error",
        completed_field="fulfilled_at",
        error=None,
    )


async def mark_client_payment_fulfillment_failed(
    payment_id: uuid.UUID, error: str
) -> None:
    await _finish_delivery_state(
        payment_id,
        status_field="fulfillment_status",
        retry_field="fulfillment_next_retry_at",
        error_field="fulfillment_error",
        completed_field="fulfilled_at",
        error=error,
    )


async def mark_owner_payment_notification_sent(payment_id: uuid.UUID) -> None:
    await _finish_delivery_state(
        payment_id,
        status_field="owner_notification_status",
        retry_field="owner_notification_next_retry_at",
        error_field="owner_notification_error",
        completed_field="owner_notified_at",
        error=None,
    )


async def mark_owner_payment_notification_failed(
    payment_id: uuid.UUID, error: str
) -> None:
    await _finish_delivery_state(
        payment_id,
        status_field="owner_notification_status",
        retry_field="owner_notification_next_retry_at",
        error_field="owner_notification_error",
        completed_field="owner_notified_at",
        error=error,
    )


async def get_due_client_payment_delivery_ids(limit: int = 50) -> list[uuid.UUID]:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        rows = await session.scalars(
            select(ClientPayment.id)
            .where(
                ClientPayment.status == "succeeded",
                or_(
                    ClientPayment.fulfillment_status.in_(("pending", "retry")),
                    ClientPayment.fulfillment_next_retry_at <= now,
                    ClientPayment.owner_notification_status.in_(("pending", "retry")),
                    ClientPayment.owner_notification_next_retry_at <= now,
                ),
            )
            .order_by(ClientPayment.paid_at)
            .limit(limit)
        )
        return list(rows)
