"""Persistence operations for individual payments made to client bots."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from database.models import ClientPayment, async_session


async def get_client_payment_stats(bot_id: int) -> tuple[int, Decimal]:
    async with async_session() as session:
        count, revenue = await session.execute(
            select(
                func.count(ClientPayment.id),
                func.coalesce(func.sum(ClientPayment.amount), Decimal("0.00")),
            ).where(ClientPayment.bot_id == bot_id, ClientPayment.status == "succeeded")
        )
        return int(count or 0), Decimal(revenue or 0)


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
) -> ClientPayment | None:
    """Mark exactly one verified provider payment as fulfilled once."""
    try:
        normalized_id = uuid.UUID(str(payment_id))
    except ValueError:
        return None
    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .options(joinedload(ClientPayment.lead))
            .where(ClientPayment.id == normalized_id)
            .with_for_update()
        )
        if not payment:
            return None
        if (
            payment.bot_id != bot_id
            or payment.provider != provider.casefold()
            or payment.amount != amount
            or payment.currency != currency
        ):
            return None
        if payment.provider_payment_id and payment.provider_payment_id != provider_payment_id:
            return None
        if payment.status == "succeeded":
            return None
        payment.provider_payment_id = provider_payment_id
        payment.status = "succeeded"
        payment.paid_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(payment)
        return payment
