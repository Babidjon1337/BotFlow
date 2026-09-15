"""Read models and append-only persistence for the internal admin panel."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import String, cast, func, or_, select

from database.models import (
    AdminAuditLog,
    BotConfig,
    BotSubscription,
    ClientPayment,
    SaasPayment,
    User,
    async_session,
)


def _paginate(page: int, limit: int) -> tuple[int, int]:
    """Normalize pagination values shared by all admin list queries."""
    normalized_page = max(page, 1)
    normalized_limit = min(max(limit, 1), 100)
    return normalized_page, normalized_limit


def _admin_user_payload(user: User, bots_count: int, *, is_platform_admin: bool = False) -> dict[str, Any]:
    """Serialize a support-safe owner record without credentials or payment data."""
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "bots_count": int(bots_count or 0),
        "lifetime_slots": user.lifetime_slots,
        "subscription_ends_at": _iso(user.subscription_ends_at),
        "subscription_auto_renew": user.subscription_auto_renew,
        "subscription_retry_count": user.subscription_retry_count,
        "is_disabled": user.is_disabled,
        "is_platform_admin": is_platform_admin,
        "created_at": _iso(user.created_at),
    }


def _admin_bot_payload(
    bot: BotConfig,
    owner_telegram_id: int,
    subscription: BotSubscription | None = None,
) -> dict[str, Any]:
    """Serialize operational bot state and intentionally omit encrypted secrets."""
    sub_payload = None
    if subscription:
        sub_payload = {
            "status": subscription.status,
            "ends_at": _iso(subscription.ends_at),
            "auto_renew": subscription.auto_renew,
            "amount_rub": subscription.amount_rub,
            "is_lifetime": bot.has_lifetime_license or subscription.ends_at is None,
        }
    elif bot.has_lifetime_license:
        sub_payload = {
            "status": "active",
            "ends_at": None,
            "auto_renew": False,
            "amount_rub": 0,
            "is_lifetime": True,
        }

    return {
        "id": bot.id,
        "owner_id": bot.owner_id,
        "owner_telegram_id": owner_telegram_id,
        "display_name": bot.display_name,
        "username": bot.username,
        "tg_bot_id": bot.tg_bot_id,
        "status": bot.status,
        "users_count": bot.users_count,
        "is_token_locked": bot.is_token_locked,
        "has_lifetime_license": bot.has_lifetime_license,
        "funnel_complete": bot.funnel_complete,
        "media_sync_done": bot.media_sync_done,
        "payment_provider": bot.payment_provider,
        "has_payment_credentials": bool(bot.payment_creds_enc),
        "created_at": _iso(bot.created_at),
        "subscription": sub_payload,
    }


async def get_admin_overview() -> dict[str, int | float]:
    """Return only dashboard metrics with a trustworthy database source."""
    async with async_session() as session:
        users_total = await session.scalar(select(func.count(User.id)))
        active_bots = await session.scalar(
            select(func.count(BotConfig.id)).where(BotConfig.status == "active")
        )
        total_bots = await session.scalar(select(func.count(BotConfig.id)))
        successful_payments, revenue = (
            await session.execute(
                select(
                    func.count(SaasPayment.id),
                    func.coalesce(func.sum(SaasPayment.amount), Decimal("0.00")),
                ).where(SaasPayment.status == "succeeded")
            )
        ).one()
        pending_operations = await session.scalar(
            select(func.count(ClientPayment.id)).where(
                ClientPayment.status == "succeeded",
                or_(
                    ClientPayment.fulfillment_status.in_(("pending", "retry", "processing")),
                    ClientPayment.owner_notification_status.in_(("pending", "retry", "processing")),
                ),
            )
        )
    return {
        "users_total": int(users_total or 0),
        "bots_total": int(total_bots or 0),
        "bots_active": int(active_bots or 0),
        "saas_payments_succeeded": int(successful_payments or 0),
        "saas_revenue": float(revenue or 0),
        "operations_requiring_attention": int(pending_operations or 0),
    }


async def list_admin_users(
    *,
    query: str | None,
    page: int,
    limit: int,
    protected_admin_telegram_ids: frozenset[int] = frozenset(),
) -> tuple[list[dict[str, Any]], int]:
    """List bot owners without exposing their secrets or private payment method."""
    page, limit = _paginate(page, limit)
    bot_count = (
        select(func.count(BotConfig.id))
        .where(BotConfig.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    filters = []
    if query:
        normalized_query = query.strip().lstrip("@")
        value = f"%{normalized_query}%"
        if value != "%%":
            filters.append(
                or_(
                    cast(User.telegram_id, String).ilike(value),
                    cast(User.id, String).ilike(value),
                    func.lower(func.coalesce(User.username, "")).ilike(value.lower()),
                )
            )

    async with async_session() as session:
        base = select(User).where(*filters)
        total = await session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await session.execute(
            select(User, bot_count.label("bots_count"))
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )

    users = [
        _admin_user_payload(
            user,
            bots_count,
            is_platform_admin=user.telegram_id in protected_admin_telegram_ids,
        )
        for user, bots_count in rows
    ]
    return users, int(total or 0)


async def list_admin_bots(*, query: str | None, status: str | None, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    """List bots with operational state but never with encrypted credentials."""
    page, limit = _paginate(page, limit)
    filters = []
    if query:
        value = f"%{query.strip()}%"
        if value != "%%":
            filters.append(
                or_(
                    BotConfig.display_name.ilike(value),
                    BotConfig.username.ilike(value),
                    cast(BotConfig.tg_bot_id, String).ilike(value),
                )
            )
    if status:
        filters.append(BotConfig.status == status)

    async with async_session() as session:
        base = select(BotConfig).where(*filters)
        total = await session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await session.execute(
            select(BotConfig, User.telegram_id.label("owner_telegram_id"), BotSubscription)
            .join(User, User.id == BotConfig.owner_id)
            .outerjoin(BotSubscription, BotSubscription.bot_id == BotConfig.id)
            .where(*filters)
            .order_by(BotConfig.created_at.desc(), BotConfig.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )

    bots = [_admin_bot_payload(bot, owner_telegram_id, sub) for bot, owner_telegram_id, sub in rows]
    return bots, int(total or 0)


async def get_admin_user_detail(
    *, user_id: int, protected_admin_telegram_ids: frozenset[int]
) -> dict[str, Any] | None:
    """Return one owner's support profile and their bots, excluding all secrets."""
    async with async_session() as session:
        user = await session.get(User, user_id)
        if not user:
            return None
        rows = await session.execute(
            select(BotConfig, BotSubscription)
            .outerjoin(BotSubscription, BotSubscription.bot_id == BotConfig.id)
            .where(BotConfig.owner_id == user.id)
            .order_by(BotConfig.created_at.desc(), BotConfig.id.desc())
        )
        owner_bots = list(rows.all())

    return {
        "user": _admin_user_payload(
            user,
            len(owner_bots),
            is_platform_admin=user.telegram_id in protected_admin_telegram_ids,
        ),
        "bots": [_admin_bot_payload(bot, user.telegram_id, sub) for bot, sub in owner_bots],
    }


async def list_admin_saas_payments(*, status: str | None, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    """List BotFlow payments without disclosure of provider payment method data."""
    page, limit = _paginate(page, limit)
    filters = [SaasPayment.status == status] if status else []
    async with async_session() as session:
        base = select(SaasPayment).where(*filters)
        total = await session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await session.execute(
            select(SaasPayment, User.telegram_id.label("user_telegram_id"))
            .join(User, User.id == SaasPayment.user_id)
            .where(*filters)
            .order_by(SaasPayment.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    payments = [
        {
            "id": str(payment.id),
            "user_id": payment.user_id,
            "user_telegram_id": user_telegram_id,
            "product": payment.product,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "attempt": payment.attempt,
            "paid_at": _iso(payment.paid_at),
            "created_at": _iso(payment.created_at),
        }
        for payment, user_telegram_id in rows
    ]
    return payments, int(total or 0)


async def list_admin_operations(*, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    """Return paid client orders whose delivery or owner notification needs attention."""
    page, limit = _paginate(page, limit)
    condition = or_(
        ClientPayment.fulfillment_status.in_(("pending", "retry", "processing")),
        ClientPayment.owner_notification_status.in_(("pending", "retry", "processing")),
    )
    async with async_session() as session:
        base = select(ClientPayment).where(ClientPayment.status == "succeeded", condition)
        total = await session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await session.execute(
            select(ClientPayment, BotConfig.display_name.label("bot_name"))
            .join(BotConfig, BotConfig.id == ClientPayment.bot_id)
            .where(ClientPayment.status == "succeeded", condition)
            .order_by(ClientPayment.paid_at.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    operations = [
        {
            "payment_id": str(payment.id),
            "bot_id": payment.bot_id,
            "bot_name": bot_name,
            "lead_id": payment.lead_id,
            "provider": payment.provider,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "paid_at": _iso(payment.paid_at),
            "fulfillment_status": payment.fulfillment_status,
            "fulfillment_attempts": payment.fulfillment_attempts,
            "fulfillment_error": payment.fulfillment_error,
            "owner_notification_status": payment.owner_notification_status,
            "owner_notification_attempts": payment.owner_notification_attempts,
            "owner_notification_error": payment.owner_notification_error,
        }
        for payment, bot_name in rows
    ]
    return operations, int(total or 0)


async def list_admin_audit_log(*, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    """Read audit entries in reverse chronological order."""
    page, limit = _paginate(page, limit)
    async with async_session() as session:
        total = await session.scalar(select(func.count(AdminAuditLog.id)))
        rows = await session.scalars(
            select(AdminAuditLog)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    entries = [
        {
            "id": str(entry.id),
            "actor_telegram_id": entry.actor_telegram_id,
            "action": entry.action,
            "target_type": entry.target_type,
            "target_id": entry.target_id,
            "details": entry.details,
            "created_at": _iso(entry.created_at),
        }
        for entry in rows
    ]
    return entries, int(total or 0)


async def write_admin_audit_log(
    *,
    actor_telegram_id: int,
    action: str,
    target_type: str,
    target_id: str | int | None = None,
    details: dict[str, Any] | None = None,
) -> AdminAuditLog:
    """Append an audit entry. No update/delete operation is exposed by this module."""
    entry = AdminAuditLog(
        actor_telegram_id=actor_telegram_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=details or {},
    )
    async with async_session() as session:
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
    return entry


class AdminMutationError(ValueError):
    """A controlled administrative action error safe to return from the API."""


def _append_audit_entry(
    session,
    *,
    actor_telegram_id: int,
    action: str,
    target_type: str,
    target_id: str | int | None,
    details: dict[str, Any],
) -> None:
    """Attach the audit entry to the same transaction as the mutation."""
    session.add(
        AdminAuditLog(
            actor_telegram_id=actor_telegram_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details,
        )
    )


async def set_admin_user_access(
    *,
    user_id: int,
    disabled: bool,
    stop_active_bots: bool,
    actor_telegram_id: int,
    protected_admin_telegram_ids: frozenset[int],
) -> dict[str, Any]:
    """Pause or restore account access, optionally stopping active client bots."""
    async with async_session() as session:
        async with session.begin():
            user = await session.scalar(
                select(User).where(User.id == user_id).with_for_update()
            )
            if not user:
                raise AdminMutationError("Пользователь не найден.")
            if user.telegram_id in protected_admin_telegram_ids:
                raise AdminMutationError("Нельзя ограничить доступ администратора платформы.")

            changed = user.is_disabled != disabled
            stopped_bot_ids: list[int] = []
            if disabled and stop_active_bots:
                active_bots = list(
                    (
                        await session.scalars(
                            select(BotConfig)
                            .where(BotConfig.owner_id == user.id, BotConfig.status == "active")
                            .with_for_update()
                        )
                    ).all()
                )
                for bot in active_bots:
                    bot.status = "draft"
                    stopped_bot_ids.append(bot.id)

            if changed:
                user.is_disabled = disabled
                user.disabled_at = datetime.now(timezone.utc) if disabled else None

            if changed or stopped_bot_ids:
                _append_audit_entry(
                    session,
                    actor_telegram_id=actor_telegram_id,
                    action="user_access_disabled" if disabled else "user_access_restored",
                    target_type="user",
                    target_id=user.id,
                    details={
                        "telegram_id": user.telegram_id,
                        "stopped_active_bot_ids": stopped_bot_ids,
                    },
                )
        return {
            "user_id": user.id,
            "is_disabled": user.is_disabled,
            "stopped_active_bots": len(stopped_bot_ids),
            "changed": changed,
        }


async def change_admin_user_lifetime_licenses(
    *,
    user_id: int,
    direction: str,
    quantity: int,
    actor_telegram_id: int,
) -> dict[str, Any]:
    """Grant or safely revoke permanent license capacity for one account."""
    delta = quantity if direction == "grant" else -quantity
    async with async_session() as session:
        async with session.begin():
            user = await session.scalar(
                select(User).where(User.id == user_id).with_for_update()
            )
            if not user:
                raise AdminMutationError("Пользователь не найден.")
            used_licenses = await session.scalar(
                select(func.count(BotConfig.id)).where(
                    BotConfig.owner_id == user.id,
                    BotConfig.has_lifetime_license.is_(True),
                )
            )
            next_slots = user.lifetime_slots + delta
            if next_slots < 0:
                raise AdminMutationError("Нельзя отозвать больше лицензий, чем выдано пользователю.")
            if next_slots < int(used_licenses or 0):
                raise AdminMutationError(
                    "Нельзя отозвать лицензию: она уже закреплена за существующим ботом."
                )
            user.lifetime_slots = next_slots
            _append_audit_entry(
                session,
                actor_telegram_id=actor_telegram_id,
                action="lifetime_licenses_granted" if delta > 0 else "lifetime_licenses_revoked",
                target_type="user",
                target_id=user.id,
                details={
                    "telegram_id": user.telegram_id,
                    "quantity": quantity,
                    "lifetime_slots": next_slots,
                    "used_lifetime_licenses": int(used_licenses or 0),
                },
            )
        return {
            "user_id": user.id,
            "lifetime_slots": user.lifetime_slots,
            "used_lifetime_licenses": int(used_licenses or 0),
        }


async def extend_admin_user_pro(
    *, user_id: int, days: int, actor_telegram_id: int
) -> dict[str, Any]:
    """Extend paid PRO access without changing its auto-renew preference."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        async with session.begin():
            user = await session.scalar(
                select(User).where(User.id == user_id).with_for_update()
            )
            if not user:
                raise AdminMutationError("Пользователь не найден.")
            starts_from = max(user.subscription_ends_at or now, now)
            user.subscription_ends_at = starts_from + timedelta(days=days)
            _append_audit_entry(
                session,
                actor_telegram_id=actor_telegram_id,
                action="pro_extended",
                target_type="user",
                target_id=user.id,
                details={
                    "telegram_id": user.telegram_id,
                    "days": days,
                    "subscription_ends_at": _iso(user.subscription_ends_at),
                },
            )
        return {"user_id": user.id, "subscription_ends_at": _iso(user.subscription_ends_at)}


async def disable_admin_user_auto_renew(
    *, user_id: int, actor_telegram_id: int
) -> dict[str, Any]:
    """Disable future recurring charges without shortening already paid PRO time."""
    async with async_session() as session:
        async with session.begin():
            user = await session.scalar(
                select(User).where(User.id == user_id).with_for_update()
            )
            if not user:
                raise AdminMutationError("Пользователь не найден.")
            changed = user.subscription_auto_renew or user.subscription_next_retry_at is not None
            user.subscription_auto_renew = False
            user.subscription_next_retry_at = None
            if changed:
                _append_audit_entry(
                    session,
                    actor_telegram_id=actor_telegram_id,
                    action="pro_auto_renew_disabled",
                    target_type="user",
                    target_id=user.id,
                    details={"telegram_id": user.telegram_id},
                )
        return {"user_id": user.id, "subscription_auto_renew": False, "changed": changed}


async def grant_admin_bot_subscription(
    *,
    bot_id: int,
    duration_days: int | None = None,
    is_lifetime: bool = False,
    actor_telegram_id: int,
) -> dict[str, Any]:
    """Grant or extend a BotSubscription for a specific bot."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        async with session.begin():
            bot = await session.scalar(
                select(BotConfig).where(BotConfig.id == bot_id).with_for_update()
            )
            if not bot:
                raise AdminMutationError("Бот не найден.")

            subscription = await session.scalar(
                select(BotSubscription)
                .where(BotSubscription.bot_id == bot_id)
                .with_for_update()
            )

            if is_lifetime:
                bot.has_lifetime_license = True
                if subscription is None:
                    subscription = BotSubscription(
                        bot_id=bot.id,
                        status="active",
                        starts_at=now,
                        ends_at=None,
                        product_code="lifetime_grant",
                        amount_rub=0,
                        auto_renew=False,
                    )
                    session.add(subscription)
                else:
                    subscription.status = "active"
                    subscription.ends_at = None
                    subscription.auto_renew = False
                ends_at_iso = None
            else:
                days = duration_days or 90
                period_start = max(subscription.ends_at if subscription and subscription.ends_at else now, now)
                next_ends_at = period_start + timedelta(days=days)
                if subscription is None:
                    subscription = BotSubscription(
                        bot_id=bot.id,
                        status="active",
                        starts_at=now,
                        ends_at=next_ends_at,
                        product_code=f"grant_{days}d",
                        amount_rub=0,
                        auto_renew=False,
                    )
                    session.add(subscription)
                else:
                    subscription.status = "active"
                    subscription.ends_at = next_ends_at
                    subscription.auto_renew = False
                    subscription.retry_count = 0
                    subscription.next_retry_at = None
                    subscription.grace_until = None
                ends_at_iso = _iso(subscription.ends_at)

            _append_audit_entry(
                session,
                actor_telegram_id=actor_telegram_id,
                action="bot_subscription_granted",
                target_type="bot",
                target_id=bot.id,
                details={
                    "bot_id": bot.id,
                    "owner_id": bot.owner_id,
                    "duration_days": duration_days,
                    "is_lifetime": is_lifetime,
                    "ends_at": ends_at_iso,
                },
            )

        return {
            "status": "ok",
            "message": "Бессрочный доступ выдан" if is_lifetime else f"Подписка выдана на {duration_days or 90} дн.",
            "subscription": {
                "status": "active",
                "ends_at": ends_at_iso,
                "auto_renew": False,
                "amount_rub": 0,
                "is_lifetime": is_lifetime,
            },
        }


async def revoke_admin_bot_subscription(
    *,
    bot_id: int,
    actor_telegram_id: int,
) -> dict[str, Any]:
    """Revoke a bot's subscription or lifetime access."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        async with session.begin():
            bot = await session.scalar(
                select(BotConfig).where(BotConfig.id == bot_id).with_for_update()
            )
            if not bot:
                raise AdminMutationError("Бот не найден.")

            bot.has_lifetime_license = False
            subscription = await session.scalar(
                select(BotSubscription)
                .where(BotSubscription.bot_id == bot_id)
                .with_for_update()
            )
            if subscription:
                subscription.status = "inactive"
                subscription.ends_at = now
                subscription.auto_renew = False

            _append_audit_entry(
                session,
                actor_telegram_id=actor_telegram_id,
                action="bot_subscription_revoked",
                target_type="bot",
                target_id=bot.id,
                details={"bot_id": bot.id, "owner_id": bot.owner_id},
            )

        return {"status": "ok", "message": "Подписка бота отозвана."}


async def grant_admin_user_bot_subscription(
    *,
    user_id: int,
    bot_id: int | None = None,
    duration_days: int | None = None,
    is_lifetime: bool = False,
    actor_telegram_id: int,
) -> dict[str, Any]:
    """Grant free bot subscription directly from user profile."""
    async with async_session() as session:
        user = await session.get(User, user_id)
        if not user:
            raise AdminMutationError("Пользователь не найден.")

        target_bot_id = bot_id
        if target_bot_id is None:
            bots = list((await session.scalars(
                select(BotConfig).where(BotConfig.owner_id == user_id).order_by(BotConfig.id)
            )).all())
            if not bots:
                raise AdminMutationError("У пользователя пока нет ботов. Создайте подарочную ссылку.")
            if len(bots) == 1:
                target_bot_id = bots[0].id
            else:
                raise AdminMutationError("У пользователя несколько ботов. Выберите конкретного бота.")

    return await grant_admin_bot_subscription(
        bot_id=target_bot_id,
        duration_days=duration_days,
        is_lifetime=is_lifetime,
        actor_telegram_id=actor_telegram_id,
    )


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
