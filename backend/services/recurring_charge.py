"""Core execution service for automated and manual recurring subscription charges."""

from datetime import datetime, timezone
import logging
from typing import Optional, Union
import uuid

from database.models import BotConfig, ClientPayment, Lead, Subscription, async_session
from database.requests.bot_rq import get_bot_by_id
from database.requests.chat_access_rq import (
    extend_chat_access_grants_for_payment,
    revoke_chat_access_grants_for_payment,
)
from database.requests.client_payment_rq import create_client_payment
from database.requests.subscription_rq import (
    create_payment_attempt,
    get_subscription_by_id,
    mark_payment_attempt_failed,
    mark_payment_attempt_success,
)
from services.billing_notifications import notify_billing_user
from services.payment_providers import get_payment_provider
from services.security import crypto

logger = logging.getLogger(__name__)


async def execute_recurring_charge(
    subscription_or_id: Union[Subscription, uuid.UUID, str],
    manual: bool = False,
) -> tuple[bool, str]:
    """Execute a single recurring charge attempt for a subscription with strict idempotency."""
    if isinstance(subscription_or_id, (uuid.UUID, str)):
        subscription = await get_subscription_by_id(subscription_or_id)
    else:
        subscription = subscription_or_id

    if not subscription:
        return False, "Подписка не найдена"

    if subscription.status not in ("active", "past_due") and not manual:
        return False, f"Подписка в статусе '{subscription.status}' не подлежит автосписанию."

    # Check auto_renew setting
    snapshot = subscription.tariff_snapshot or {}
    if not snapshot.get("auto_renew", True) and not manual:
        return False, "Автопродление отключено пользователем."

    bot_config = subscription.bot
    if not bot_config:
        bot_config = await get_bot_by_id(subscription.bot_id)
    if not bot_config:
        return False, f"Бот {subscription.bot_id} не найден."

    # Generate deterministic idempotency key for this charge cycle
    now = datetime.now(timezone.utc)
    cycle_date = (subscription.next_charge_at or now).strftime("%Y%m%d")
    idempotency_key = f"rec_{subscription.id}_{cycle_date}_{subscription.retry_count}"
    if manual:
        idempotency_key = f"rec_man_{subscription.id}_{now.strftime('%Y%m%d%H%M%S')}"

    # Lock / Create attempt
    try:
        attempt = await create_payment_attempt(
            subscription_id=subscription.id,
            provider=subscription.provider,
            amount=subscription.amount,
            currency=subscription.currency,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        # Idempotency collision means attempt already exists
        logger.warning(
            "Попытка списания с ключом %s уже существует: %s",
            idempotency_key, exc
        )
        return False, "Списание для этого периода уже находится в обработке."

    # Execute charge via provider abstraction
    tariff_title = (
        snapshot.get("name")
        or snapshot.get("title")
        or "Тариф"
    )

    try:
        provider = get_payment_provider(subscription.provider)
        charge_result = await provider.charge_recurring(
            bot_config=bot_config,
            subscription=subscription,
            attempt=attempt,
        )
    except Exception as exc:
        logger.exception("Ошибка при вызове провайдера %s: %s", subscription.provider, exc)
        await mark_payment_attempt_failed(
            attempt.id,
            error_code="provider_exception",
            error_message=str(exc),
        )
        return False, f"Исключение платежного провайдера: {exc}"

    if charge_result.success:
        await mark_payment_attempt_success(
            attempt.id,
            provider_payment_id=charge_result.provider_payment_id,
        )

        # Extend chat access grant if bound to initial payment
        if subscription.initial_payment_id:
            try:
                await extend_chat_access_grants_for_payment(subscription.initial_payment_id)
            except Exception as e:
                logger.warning("Не удалось продлить ChatAccessGrant: %s", e)

        # Notify user in client bot
        if subscription.user_id and bot_config.bot_token_enc:
            try:
                from aiogram import Bot
                from aiogram.client.default import DefaultBotProperties
                token = crypto.decrypt(bot_config.bot_token_enc)
                bot = Bot(token=token, default=DefaultBotProperties(parse_mode="HTML"))
                await bot.send_message(
                    chat_id=subscription.user_id,
                    text=(
                        f"✅ <b>Подписка успешно продлена!</b>\n\n"
                        f"Тариф: <b>{tariff_title}</b>\n"
                        f"Сумма: <b>{subscription.amount:,.0f} {subscription.currency}</b>\n"
                        f"Доступ продлен без перерывов."
                    ),
                )
                await bot.session.close()
            except Exception as e:
                logger.warning("Не удалось отправить сообщение клиенту о продлении: %s", e)

        # Notify bot owner in BotFlow
        if bot_config.owner and bot_config.owner.telegram_id:
            try:
                client_label = f"ID: {subscription.user_id}"
                if subscription.lead and subscription.lead.username:
                    client_label = f"@{subscription.lead.username}"
                await notify_billing_user(
                    bot_config.owner.telegram_id,
                    (
                        f"💰 <b>Автопродление подписки!</b>\n\n"
                        f"Бот: <b>{bot_config.display_name}</b>\n"
                        f"Тариф: <b>{tariff_title}</b>\n"
                        f"Сумма: <b>{subscription.amount:,.0f} {subscription.currency}</b>\n"
                        f"Клиент: {client_label}"
                    ),
                )
            except Exception as e:
                logger.warning("Не удалось уведомить владельца бота: %s", e)

        logger.info("Успешное списание по подписке %s: %s %s", subscription.id, subscription.amount, subscription.currency)
        return True, "Платёж успешно выполнен"

    else:
        # Failure handling
        attempt, updated_sub = await mark_payment_attempt_failed(
            attempt.id,
            error_code=charge_result.error_code,
            error_message=charge_result.error_message,
        )

        if updated_sub.status == "failed":
            # Retries exhausted -> revoke access
            if subscription.initial_payment_id:
                try:
                    await revoke_chat_access_grants_for_payment(subscription.initial_payment_id)
                except Exception as e:
                    logger.warning("Не удалось отозвать доступ: %s", e)

            if subscription.user_id and bot_config.bot_token_enc:
                try:
                    from aiogram import Bot
                    from aiogram.client.default import DefaultBotProperties
                    token = crypto.decrypt(bot_config.bot_token_enc)
                    bot = Bot(token=token, default=DefaultBotProperties(parse_mode="HTML"))
                    await bot.send_message(
                        chat_id=subscription.user_id,
                        text=(
                            f"❌ <b>Подписка не была продлена</b>\n\n"
                            f"Не удалось списать оплату за тариф «{tariff_title}» после нескольких попыток. "
                            f"Доступ к закрытым материалам и чатам приостановлен."
                        ),
                    )
                    await bot.session.close()
                except Exception as e:
                    logger.warning("Не удалось отправить клиенту уведомление об отмене: %s", e)
        else:
            # Past due -> retry tomorrow
            if subscription.user_id and bot_config.bot_token_enc:
                try:
                    from aiogram import Bot
                    from aiogram.client.default import DefaultBotProperties
                    token = crypto.decrypt(bot_config.bot_token_enc)
                    bot = Bot(token=token, default=DefaultBotProperties(parse_mode="HTML"))
                    await bot.send_message(
                        chat_id=subscription.user_id,
                        text=(
                            f"⚠️ <b>Не удалось продлить подписку</b>\n\n"
                            f"Списание за тариф «{tariff_title}» на сумму {subscription.amount:,.0f} {subscription.currency} отклонено банком. "
                            f"Пожалуйста, пополните баланс карты. Мы повторим попытку завтра."
                        ),
                    )
                    await bot.session.close()
                except Exception as e:
                    logger.warning("Не удалось отправить клиенту предупреждение: %s", e)

        logger.warning(
            "Не удалось списать оплату по подписке %s: %s (статус: %s)",
            subscription.id, charge_result.error_message, updated_sub.status
        )
        return False, charge_result.error_message or "Списание отклонено"
