"""Database operations for bot tariffs and deliverables."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
import uuid

from sqlalchemy import delete, func, select
from database.models import ClientPayment, Tariff, async_session


async def create_tariff(
    *,
    bot_id: int,
    name: str,
    description: str | None = None,
    price: Decimal | float | int = Decimal("0.00"),
    old_price: Decimal | float | int | None = None,
    payment_type: str = "one_time",
    recurring_period: str | None = None,
    sales_mode: str = "auto",
    manager_url: str | None = None,
    button_text: str | None = None,
    is_active: bool = True,
    deliverables: list[dict[str, Any]] | None = None,
    media_assets: list[dict[str, Any]] | None = None,
) -> Tariff:
    """Create and persist a new tariff belonging to bot_id."""
    if isinstance(price, (int, float, str)):
        price = Decimal(str(price)).quantize(Decimal("0.01"))
    elif isinstance(price, Decimal):
        price = price.quantize(Decimal("0.01"))

    norm_old_price = None
    if old_price is not None:
        if isinstance(old_price, (int, float, str)):
            norm_old_price = Decimal(str(old_price)).quantize(Decimal("0.01"))
        elif isinstance(old_price, Decimal):
            norm_old_price = old_price.quantize(Decimal("0.01"))

    tariff = Tariff(
        bot_id=bot_id,
        name=name.strip(),
        description=description.strip() if description else None,
        price=price,
        old_price=norm_old_price,
        payment_type=payment_type,
        recurring_period=recurring_period.strip() if recurring_period else None,
        sales_mode=sales_mode,
        manager_url=manager_url.strip() if manager_url else None,
        button_text=button_text.strip() if button_text else None,
        is_active=is_active,
        deliverables=list(deliverables or []),
        media_assets=list(media_assets or []),
    )
    async with async_session() as session:
        session.add(tariff)
        await session.commit()
        await session.refresh(tariff)
        return tariff


async def get_tariff_by_id(tariff_id: uuid.UUID | str) -> Tariff | None:
    """Load a tariff by UUID."""
    try:
        norm_id = uuid.UUID(str(tariff_id))
    except (ValueError, TypeError):
        return None

    async with async_session() as session:
        return await session.get(Tariff, norm_id)


async def list_tariffs_by_bot_id(bot_id: int, active_only: bool = False) -> list[Tariff]:
    """List all tariffs belonging to bot_id ordered by created_at."""
    async with async_session() as session:
        stmt = select(Tariff).where(Tariff.bot_id == bot_id)
        if active_only:
            stmt = stmt.where(Tariff.is_active == True)
        stmt = stmt.order_by(Tariff.created_at.asc())
        result = await session.scalars(stmt)
        return list(result.all())


async def update_tariff(
    tariff_id: uuid.UUID | str,
    *,
    name: str | None = None,
    description: str | None = None,
    price: Decimal | float | int | None = None,
    old_price: Decimal | float | int | None = None,
    payment_type: str | None = None,
    recurring_period: str | None = None,
    sales_mode: str | None = None,
    manager_url: str | None = None,
    button_text: str | None = None,
    is_active: bool | None = None,
    deliverables: list[dict[str, Any]] | None = None,
    media_assets: list[dict[str, Any]] | None = None,
) -> Tariff | None:
    """Update fields of an existing tariff."""
    try:
        norm_id = uuid.UUID(str(tariff_id))
    except (ValueError, TypeError):
        return None

    async with async_session() as session:
        tariff = await session.get(Tariff, norm_id)
        if not tariff:
            return None

        if name is not None:
            tariff.name = name.strip()
        if description is not None:
            tariff.description = description.strip() if description else None
        if price is not None:
            tariff.price = Decimal(str(price)).quantize(Decimal("0.01"))
        if old_price is not None:
            tariff.old_price = Decimal(str(old_price)).quantize(Decimal("0.01")) if old_price else None
        if payment_type is not None:
            tariff.payment_type = payment_type
        if recurring_period is not None:
            tariff.recurring_period = recurring_period.strip() if recurring_period else None
        if sales_mode is not None:
            tariff.sales_mode = sales_mode
        if manager_url is not None:
            tariff.manager_url = manager_url.strip() if manager_url else None
        if button_text is not None:
            tariff.button_text = button_text.strip() if button_text else None
        if is_active is not None:
            tariff.is_active = is_active
        if deliverables is not None:
            tariff.deliverables = list(deliverables)
        if media_assets is not None:
            tariff.media_assets = list(media_assets)

        tariff.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(tariff)
        return tariff


async def delete_tariff(tariff_id: uuid.UUID | str) -> bool:
    """Delete a tariff by ID. Returns True if deleted."""
    try:
        norm_id = uuid.UUID(str(tariff_id))
    except (ValueError, TypeError):
        return False

    async with async_session() as session:
        result = await session.execute(delete(Tariff).where(Tariff.id == norm_id))
        await session.commit()
        return result.rowcount > 0


async def get_tariff_summary_stats(bot_id: int) -> dict[str, Any]:
    """Calculate summary metrics for all tariffs of a bot."""
    async with async_session() as session:
        # 1. Total and active count from tariffs table
        count_res = await session.execute(
            select(
                func.count(Tariff.id),
                func.count(func.nullif(Tariff.is_active, False)),
                func.coalesce(func.sum(Tariff.total_buyers), 0),
                func.coalesce(func.sum(Tariff.total_revenue), Decimal("0.00")),
            ).where(Tariff.bot_id == bot_id)
        )
        row = count_res.one()
        total_tariffs = int(row[0] or 0)
        active_count = int(row[1] or 0)
        table_buyers = int(row[2] or 0)
        table_revenue = Decimal(row[3] or 0)

        # 2. Reconcile with ClientPayment (succeeded payments for this bot)
        payment_res = await session.execute(
            select(
                func.count(func.distinct(ClientPayment.lead_id)),
                func.coalesce(func.sum(ClientPayment.amount), Decimal("0.00")),
            ).where(
                ClientPayment.bot_id == bot_id,
                ClientPayment.status == "succeeded",
            )
        )
        p_row = payment_res.one()
        payment_buyers = int(p_row[0] or 0)
        payment_revenue = Decimal(p_row[1] or 0)

        # Use maximum of table metrics and payment metrics to ensure consistency
        total_buyers = max(table_buyers, payment_buyers)
        total_revenue = max(table_revenue, payment_revenue)

        return {
            "total_tariffs": total_tariffs,
            "active_count": active_count,
            "total_buyers": total_buyers,
            "total_revenue": total_revenue,
        }


async def record_tariff_purchase(
    tariff_id: uuid.UUID | str, amount: Decimal
) -> None:
    """Increment buyer count and revenue for a purchased tariff."""
    try:
        norm_id = uuid.UUID(str(tariff_id))
    except (ValueError, TypeError):
        return

    async with async_session() as session:
        tariff = await session.get(Tariff, norm_id)
        if tariff:
            tariff.total_buyers += 1
            tariff.total_revenue = (tariff.total_revenue or Decimal("0.00")) + amount
            await session.commit()
