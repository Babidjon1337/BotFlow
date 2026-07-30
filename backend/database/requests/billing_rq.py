"""Persistence operations for Bot Father's own products and subscriptions."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from database.models import SaasPayment, User, async_session


async def create_saas_payment(
    user_id: int, product: str, amount: int, attempt: int = 0
) -> SaasPayment:
    async with async_session() as session:
        payment = SaasPayment(
            user_id=user_id,
            product=product,
            amount=Decimal(str(amount)),
            idempotence_key=str(uuid.uuid4()),
            attempt=attempt,
        )
        session.add(payment)
        await session.commit()
        await session.refresh(payment)
        return payment


async def set_saas_payment_provider_id(payment_id: uuid.UUID, provider_payment_id: str) -> None:
    async with async_session() as session:
        payment = await session.get(SaasPayment, payment_id)
        if payment:
            payment.yookassa_payment_id = provider_payment_id
            await session.commit()


async def get_saas_payment_by_provider_id(provider_payment_id: str) -> SaasPayment | None:
    async with async_session() as session:
        return await session.scalar(
            select(SaasPayment)
            .options(joinedload(SaasPayment.user))
            .where(SaasPayment.yookassa_payment_id == provider_payment_id)
        )


async def apply_successful_saas_payment(
    provider_payment_id: str, payment_method_enc: bytes | None = None
) -> tuple[bool, User | None]:
    """Apply an already verified YooKassa payment exactly once."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(SaasPayment)
            .options(joinedload(SaasPayment.user))
            .where(SaasPayment.yookassa_payment_id == provider_payment_id)
            .with_for_update()
        )
        if not payment:
            return False, None
        if payment.status == "succeeded":
            return False, payment.user

        user = payment.user
        payment.status = "succeeded"
        payment.paid_at = now
        if payment.product == "license":
            user.lifetime_slots += 1
        else:
            period_start = max(user.subscription_ends_at or now, now)
            user.subscription_ends_at = period_start + timedelta(days=30)
            user.subscription_auto_renew = payment_method_enc is not None or user.subscription_auto_renew
            if payment_method_enc is not None:
                user.subscription_payment_method_enc = payment_method_enc
            user.subscription_retry_count = 0
            user.subscription_next_retry_at = user.subscription_ends_at
            user.subscription_grace_until = None

        await session.commit()
        return True, user


async def mark_saas_payment_failed(provider_payment_id: str) -> User | None:
    """Record a failed PRO renewal and schedule at most three daily attempts."""
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(SaasPayment)
            .options(joinedload(SaasPayment.user))
            .where(SaasPayment.yookassa_payment_id == provider_payment_id)
            .with_for_update()
        )
        if not payment or payment.status == "succeeded":
            return None
        payment.status = "failed"
        user = payment.user
        if payment.product == "pro_renewal":
            user.subscription_retry_count = max(user.subscription_retry_count, payment.attempt)
            if payment.attempt >= 3:
                user.subscription_auto_renew = False
                user.subscription_next_retry_at = None
                user.subscription_grace_until = None
            else:
                user.subscription_next_retry_at = now + timedelta(days=1)
                user.subscription_grace_until = (user.subscription_ends_at or now) + timedelta(days=3)
        await session.commit()
        return user


async def mark_saas_payment_failed_by_id(payment_id: uuid.UUID) -> User | None:
    async with async_session() as session:
        payment = await session.get(SaasPayment, payment_id)
        if not payment:
            return None
        provider_payment_id = payment.yookassa_payment_id
    if provider_payment_id:
        return await mark_saas_payment_failed(provider_payment_id)
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        payment = await session.scalar(
            select(SaasPayment)
            .options(joinedload(SaasPayment.user))
            .where(SaasPayment.id == payment_id)
            .with_for_update()
        )
        if not payment or payment.status == "succeeded":
            return None
        payment.status = "failed"
        user = payment.user
        if payment.product == "pro_renewal":
            user.subscription_retry_count = max(user.subscription_retry_count, payment.attempt)
            if payment.attempt >= 3:
                user.subscription_auto_renew = False
                user.subscription_next_retry_at = None
                user.subscription_grace_until = None
            else:
                user.subscription_next_retry_at = now + timedelta(days=1)
                user.subscription_grace_until = (user.subscription_ends_at or now) + timedelta(days=3)
        await session.commit()
        return user


async def get_users_due_for_subscription_renewal() -> list[User]:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        result = await session.scalars(
            select(User).where(
                User.subscription_auto_renew.is_(True),
                User.subscription_payment_method_enc.is_not(None),
                User.subscription_next_retry_at.is_not(None),
                User.subscription_next_retry_at <= now,
                User.subscription_retry_count < 3,
            )
        )
        return list(result.all())


async def defer_subscription_retry(user_id: int) -> None:
    """Prevent another scheduler tick from creating a duplicate pending payment."""
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user:
            user.subscription_next_retry_at = datetime.now(timezone.utc) + timedelta(days=1)
            await session.commit()


async def cancel_subscription_auto_renew(user_id: int) -> User | None:
    """Stop future recurring charges without shortening paid access."""
    async with async_session() as session:
        user = await session.get(User, user_id)
        if not user:
            return None
        user.subscription_auto_renew = False
        user.subscription_next_retry_at = None
        await session.commit()
        await session.refresh(user)
        return user
