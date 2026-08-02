"""Persistence for paid access to private Telegram channels and groups."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from database.models import ChatAccessGrant, async_session


async def get_chat_access_grant_for_payment(payment_id: uuid.UUID) -> ChatAccessGrant | None:
    async with async_session() as session:
        return await session.scalar(
            select(ChatAccessGrant).where(ChatAccessGrant.client_payment_id == payment_id)
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
