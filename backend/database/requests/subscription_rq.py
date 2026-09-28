"""Database requests for client recurring subscriptions and payment attempts."""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import logging
from typing import Optional, Sequence
import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.orm import selectinload

from database.models import (
    async_session,
    BotConfig,
    ClientPayment,
    Lead,
    PaymentAttempt,
    Subscription,
)
from database.requests.chat_access_rq import compute_recurring_period_delta

logger = logging.getLogger(__name__)


async def create_subscription_from_payment(
    payment: ClientPayment,
    binding_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
) -> Optional[Subscription]:
    """Create or update a Subscription row upon successful initial payment for a recurring tariff."""
    snapshot = payment.tariff_snapshot or {}
    is_recurring = (
        snapshot.get("payment_type") == "recurring"
        or snapshot.get("paymentType") == "recurring"
    )
    if not is_recurring:
        return None

    period = (
        snapshot.get("recurring_period")
        or snapshot.get("recurringPeriod")
        or snapshot.get("billing_period")
        or snapshot.get("billingPeriod")
    )
    delta = compute_recurring_period_delta(period)
    paid_time = payment.paid_at or payment.created_at or datetime.now(timezone.utc)
    next_charge = paid_time + delta

    async with async_session() as session:
        # Check if subscription already exists for this payment or lead+tariff
        existing = await session.scalar(
            select(Subscription).where(
                Subscription.bot_id == payment.bot_id,
                Subscription.lead_id == payment.lead_id,
                Subscription.tariff_id == payment.tariff_id,
                Subscription.status.in_(["active", "past_due"]),
            )
        )

        effective_binding = binding_id or (payment.provider_payment_id if payment.provider == "prodamus" else None)

        if existing:
            # Update existing active subscription with fresh payment method / next_charge
            existing.initial_payment_id = payment.id
            existing.amount = payment.amount
            existing.currency = payment.currency
            existing.provider = payment.provider
            if effective_binding:
                existing.provider_payment_method_id = effective_binding
            if subscription_id:
                existing.provider_subscription_id = subscription_id
            existing.next_charge_at = next_charge
            existing.last_charge_at = paid_time
            existing.status = "active"
            existing.retry_count = 0
            existing.last_error = None
            await session.commit()
            await session.refresh(existing)
            logger.info("Обновлена рекуррентная подписка %s (lead_id=%s, bot_id=%s)", existing.id, payment.lead_id, payment.bot_id)
            return existing

        new_sub = Subscription(
            bot_id=payment.bot_id,
            lead_id=payment.lead_id,
            user_id=payment.lead.telegram_id if payment.lead else None,
            tariff_id=payment.tariff_id,
            tariff_snapshot=snapshot,
            initial_payment_id=payment.id,
            provider=payment.provider,
            provider_subscription_id=subscription_id or (payment.provider_payment_id if payment.provider == "prodamus" else None),
            provider_payment_method_id=effective_binding,
            status="active",
            amount=payment.amount,
            currency=payment.currency,
            next_charge_at=next_charge,
            last_charge_at=paid_time,
            retry_count=0,
        )
        session.add(new_sub)
        await session.commit()
        await session.refresh(new_sub)
        logger.info("Создана новая рекуррентная подписка %s (lead_id=%s, next_charge=%s)", new_sub.id, payment.lead_id, next_charge)
        return new_sub


async def get_due_subscriptions(limit: int = 50) -> list[Subscription]:
    """Retrieve active subscriptions whose next_charge_at <= now and auto_renew is enabled."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        result = await session.scalars(
            select(Subscription)
            .options(
                selectinload(Subscription.bot),
                selectinload(Subscription.lead),
            )
            .where(
                Subscription.status.in_(["active", "past_due"]),
                Subscription.next_charge_at <= now,
            )
            .order_by(Subscription.next_charge_at.asc())
            .limit(limit)
        )
        due = list(result.all())
        # Filter by auto_renew flag in tariff_snapshot
        valid = [
            s for s in due
            if (s.tariff_snapshot or {}).get("auto_renew", True) is not False
        ]
        return valid


async def get_subscription_by_id(subscription_id: uuid.UUID | str) -> Optional[Subscription]:
    """Get subscription by UUID."""
    try:
        sub_uuid = uuid.UUID(str(subscription_id))
    except (ValueError, TypeError):
        return None
    async with async_session() as session:
        return await session.scalar(
            select(Subscription)
            .options(
                selectinload(Subscription.bot),
                selectinload(Subscription.lead),
                selectinload(Subscription.attempts),
            )
            .where(Subscription.id == sub_uuid)
        )


async def create_payment_attempt(
    subscription_id: uuid.UUID,
    provider: str,
    amount: Decimal,
    currency: str,
    idempotency_key: str,
) -> PaymentAttempt:
    """Create a pending payment attempt record with unique idempotency key."""
    async with async_session() as session:
        attempt = PaymentAttempt(
            subscription_id=subscription_id,
            provider=provider,
            amount=amount,
            currency=currency,
            idempotency_key=idempotency_key,
            status="pending",
        )
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt)
        return attempt


async def mark_payment_attempt_success(
    attempt_id: uuid.UUID,
    provider_payment_id: Optional[str] = None,
) -> tuple[PaymentAttempt, Subscription]:
    """Mark attempt succeeded and extend subscription next_charge_at."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        attempt = await session.get(PaymentAttempt, attempt_id)
        if not attempt:
            raise ValueError(f"PaymentAttempt {attempt_id} not found")
        sub = await session.get(Subscription, attempt.subscription_id)
        if not sub:
            raise ValueError(f"Subscription {attempt.subscription_id} not found")

        attempt.status = "succeeded"
        attempt.paid_at = now
        if provider_payment_id:
            attempt.provider_payment_id = provider_payment_id

        period = (
            sub.tariff_snapshot.get("recurring_period")
            or sub.tariff_snapshot.get("recurringPeriod")
            or sub.tariff_snapshot.get("billing_period")
            or sub.tariff_snapshot.get("billingPeriod")
        )
        delta = compute_recurring_period_delta(period)
        sub.last_charge_at = now
        sub.next_charge_at = now + delta
        sub.retry_count = 0
        sub.status = "active"
        sub.last_error = None

        await session.commit()
        await session.refresh(attempt)
        await session.refresh(sub)
        return attempt, sub


async def mark_payment_attempt_failed(
    attempt_id: uuid.UUID,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    max_retries: int = 3,
) -> tuple[PaymentAttempt, Subscription]:
    """Mark attempt failed and apply retry policy to subscription."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        attempt = await session.get(PaymentAttempt, attempt_id)
        if not attempt:
            raise ValueError(f"PaymentAttempt {attempt_id} not found")
        sub = await session.get(Subscription, attempt.subscription_id)
        if not sub:
            raise ValueError(f"Subscription {attempt.subscription_id} not found")

        attempt.status = "failed"
        attempt.error_code = error_code
        attempt.error_message = error_message

        sub.retry_count += 1
        sub.last_error = f"{error_code}: {error_message}" if error_code else error_message

        if sub.retry_count < max_retries:
            sub.status = "past_due"
            # Exponential or 1-day retry policy: retry 1 -> +1 day, retry 2 -> +2 days
            retry_days = 1 if sub.retry_count == 1 else 2
            sub.next_charge_at = now + timedelta(days=retry_days)
            logger.warning(
                "Платёж по подписке %s не удался (попытка %s/%s). Следующая попытка через %s дн.",
                sub.id, sub.retry_count, max_retries, retry_days
            )
        else:
            sub.status = "failed"
            sub.failed_at = now
            logger.error("Подписка %s переведена в failed после %s неудачных попыток.", sub.id, sub.retry_count)

        await session.commit()
        await session.refresh(attempt)
        await session.refresh(sub)
        return attempt, sub


async def cancel_subscription(
    subscription_id: uuid.UUID | str,
    reason: str = "User or admin canceled",
) -> Optional[Subscription]:
    """Mark a subscription canceled."""
    try:
        sub_uuid = uuid.UUID(str(subscription_id))
    except (ValueError, TypeError):
        return None

    now = datetime.now(timezone.utc)
    async with async_session() as session:
        sub = await session.get(Subscription, sub_uuid)
        if not sub:
            return None
        sub.status = "canceled"
        sub.canceled_at = now
        sub.last_error = f"Отменено: {reason}"
        snapshot = dict(sub.tariff_snapshot or {})
        snapshot["auto_renew"] = False
        snapshot["auto_renew_cancelled_at"] = now.isoformat()
        sub.tariff_snapshot = snapshot
        await session.commit()
        await session.refresh(sub)
        return sub


async def list_subscriptions_for_admin(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 25,
) -> tuple[list[dict], int]:
    """Retrieve paginated subscriptions with relations for admin dashboard."""
    async with async_session() as session:
        query = select(Subscription).options(
            selectinload(Subscription.bot),
            selectinload(Subscription.lead),
            selectinload(Subscription.attempts),
        )
        if status:
            query = query.where(Subscription.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        total = await session.scalar(count_query) or 0

        offset = (page - 1) * limit
        items = (
            await session.scalars(
                query.order_by(desc(Subscription.created_at)).offset(offset).limit(limit)
            )
        ).all()

        results = []
        for s in items:
            tariff_title = (
                s.tariff_snapshot.get("name")
                or s.tariff_snapshot.get("title")
                or "Тариф"
            )
            bot_name = s.bot.display_name if s.bot else f"Bot {s.bot_id}"
            user_title = (
                f"@{s.lead.username}" if s.lead and s.lead.username
                else (s.lead.first_name if s.lead and s.lead.first_name else str(s.user_id or "—"))
            )
            results.append({
                "id": str(s.id),
                "bot_id": s.bot_id,
                "bot_name": bot_name,
                "lead_id": s.lead_id,
                "user_id": s.user_id,
                "user_name": user_title,
                "tariff_id": s.tariff_id,
                "tariff_name": tariff_title,
                "provider": s.provider,
                "provider_subscription_id": s.provider_subscription_id,
                "provider_payment_method_id": s.provider_payment_method_id,
                "status": s.status,
                "amount": float(s.amount),
                "currency": s.currency,
                "next_charge_at": s.next_charge_at.isoformat() if s.next_charge_at else None,
                "last_charge_at": s.last_charge_at.isoformat() if s.last_charge_at else None,
                "retry_count": s.retry_count,
                "failed_at": s.failed_at.isoformat() if s.failed_at else None,
                "canceled_at": s.canceled_at.isoformat() if s.canceled_at else None,
                "last_error": s.last_error,
                "created_at": s.created_at.isoformat(),
                "attempts_count": len(s.attempts),
            })

        return results, total


async def list_subscriptions_by_bot(
    bot_id: int,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[dict], int]:
    """Retrieve subscriptions belonging to a specific bot."""
    async with async_session() as session:
        query = select(Subscription).options(
            selectinload(Subscription.lead),
            selectinload(Subscription.attempts),
        ).where(Subscription.bot_id == bot_id)

        total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
        offset = (page - 1) * limit
        items = (
            await session.scalars(
                query.order_by(desc(Subscription.created_at)).offset(offset).limit(limit)
            )
        ).all()

        results = []
        for s in items:
            tariff_title = (
                s.tariff_snapshot.get("name")
                or s.tariff_snapshot.get("title")
                or "Тариф"
            )
            user_title = (
                f"@{s.lead.username}" if s.lead and s.lead.username
                else (s.lead.first_name if s.lead and s.lead.first_name else str(s.user_id or "—"))
            )
            results.append({
                "id": str(s.id),
                "lead_id": s.lead_id,
                "user_id": s.user_id,
                "user_name": user_title,
                "tariff_id": s.tariff_id,
                "tariff_name": tariff_title,
                "provider": s.provider,
                "status": s.status,
                "amount": float(s.amount),
                "currency": s.currency,
                "next_charge_at": s.next_charge_at.isoformat() if s.next_charge_at else None,
                "last_charge_at": s.last_charge_at.isoformat() if s.last_charge_at else None,
                "retry_count": s.retry_count,
                "last_error": s.last_error,
                "created_at": s.created_at.isoformat(),
            })
        return results, total
