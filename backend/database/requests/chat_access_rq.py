"""Persistence for paid access to private Telegram channels and groups."""

import re
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select

from database.models import ChatAccessGrant, async_session


def compute_recurring_period_delta(period: str | None) -> timedelta:
    """Return timedelta for recurring tariff period (default 30 days)."""
    if not period:
        return timedelta(days=30)
    p = str(period).lower().strip()
    if p in ("1_week", "week", "1 week", "7_days", "7 days", "7d"):
        return timedelta(days=7)
    elif p in ("3_months", "3months", "3 months", "90_days", "90 days", "90d"):
        return timedelta(days=90)
    elif p in ("1_year", "year", "1 year", "365_days", "365 days", "365d"):
        return timedelta(days=365)
    elif "day" in p:
        nums = re.findall(r"\d+", p)
        if nums:
            return timedelta(days=int(nums[0]))
    elif "month" in p:
        nums = re.findall(r"\d+", p)
        if nums:
            return timedelta(days=int(nums[0]) * 30)
    elif "week" in p:
        nums = re.findall(r"\d+", p)
        if nums:
            return timedelta(days=int(nums[0]) * 7)
    elif "year" in p:
        nums = re.findall(r"\d+", p)
        if nums:
            return timedelta(days=int(nums[0]) * 365)
    return timedelta(days=30)


async def get_chat_access_grant_for_payment(payment_id: uuid.UUID) -> ChatAccessGrant | None:
    async with async_session() as session:
        return await session.scalar(
            select(ChatAccessGrant).where(ChatAccessGrant.client_payment_id == payment_id)
        )


async def get_chat_access_grants_for_payment(payment_id: uuid.UUID) -> list[ChatAccessGrant]:
    async with async_session() as session:
        return list(
            (
                await session.scalars(
                    select(ChatAccessGrant).where(ChatAccessGrant.client_payment_id == payment_id)
                )
            ).all()
        )


async def create_chat_access_grant(
    *,
    bot_id: int,
    lead_id: int,
    payment_id: uuid.UUID,
    chat_id: str,
    invite_link: str,
    access_mode: str,
    expires_at: datetime | None,
) -> ChatAccessGrant:
    async with async_session() as session:
        grant = ChatAccessGrant(
            bot_id=bot_id,
            lead_id=lead_id,
            client_payment_id=payment_id,
            chat_id=chat_id,
            invite_link=invite_link,
            access_mode=access_mode,
            expires_at=expires_at,
        )
        session.add(grant)
        await session.commit()
        await session.refresh(grant)
        return grant


async def activate_chat_access_grant(
    *, bot_id: int, lead_telegram_id: int, chat_id: str, invite_link: str
) -> ChatAccessGrant | None:
    async with async_session() as session:
        grant = await session.scalar(
            select(ChatAccessGrant)
            .where(
                ChatAccessGrant.bot_id == bot_id,
                ChatAccessGrant.chat_id == str(chat_id),
                ChatAccessGrant.invite_link == invite_link,
            )
        )
        if not grant or grant.status != "issued":
            return None
        # The invite URL alone is not sufficient: it must be used by the buyer.
        from database.models import Lead

        lead = await session.get(Lead, grant.lead_id)
        if not lead or lead.telegram_id != lead_telegram_id:
            return None
        grant.status = "active"
        grant.joined_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(grant)
        return grant


async def get_expired_chat_access_grants(limit: int = 100) -> list[ChatAccessGrant]:
    """Return all active grants whose expires_at is past now."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        return list(
            (
                await session.scalars(
                    select(ChatAccessGrant)
                    .where(
                        ChatAccessGrant.status == "active",
                        ChatAccessGrant.expires_at.is_not(None),
                        ChatAccessGrant.expires_at <= now,
                    )
                    .limit(limit)
                )
            ).all()
        )


async def mark_chat_access_grant_revoked(grant_id: uuid.UUID | str) -> None:
    """Mark a grant as revoked."""
    try:
        normalized_id = uuid.UUID(str(grant_id))
    except (ValueError, TypeError):
        return
    async with async_session() as session:
        grant = await session.get(ChatAccessGrant, normalized_id)
        if grant:
            grant.status = "revoked"
            await session.commit()


async def extend_chat_access_grants_for_payment(
    payment_id: uuid.UUID | str,
    period_delta: timedelta | None = None,
) -> list[ChatAccessGrant]:
    """Extend expires_at for all grants belonging to this client payment upon renewal."""
    try:
        normalized_id = uuid.UUID(str(payment_id))
    except (ValueError, TypeError):
        return []
    now = datetime.now(timezone.utc)
    from database.models import ClientPayment
    from sqlalchemy.orm.attributes import flag_modified

    async with async_session() as session:
        payment = await session.get(ClientPayment, normalized_id)
        if not payment:
            return []

        if period_delta is None:
            snapshot = payment.tariff_snapshot or {}
            period = (
                snapshot.get("recurring_period")
                or snapshot.get("recurringPeriod")
                or snapshot.get("billing_period")
                or snapshot.get("billingPeriod")
            )
            period_delta = compute_recurring_period_delta(period)

        grants = list(
            (
                await session.scalars(
                    select(ChatAccessGrant).where(ChatAccessGrant.client_payment_id == normalized_id)
                )
            ).all()
        )

        for grant in grants:
            base_time = grant.expires_at if (grant.expires_at and grant.expires_at > now) else now
            grant.expires_at = base_time + period_delta
            if grant.status == "revoked":
                grant.status = "active"

        if isinstance(payment.tariff_snapshot, dict):
            snapshot = dict(payment.tariff_snapshot)
            snapshot["auto_renew"] = True
            payment.tariff_snapshot = snapshot
            flag_modified(payment, "tariff_snapshot")

        await session.commit()
        for g in grants:
            await session.refresh(g)
        return grants
