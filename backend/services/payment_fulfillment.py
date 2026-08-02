"""Durable, retryable delivery for verified client-bot payments."""

from html import escape
import uuid

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties

from database.requests.bot_rq import get_bot_by_id
from database.requests.client_payment_rq import (
    claim_client_payment_fulfillment,
    claim_owner_payment_notification,
    get_client_payment,
    mark_client_payment_fulfilled,
    mark_client_payment_fulfillment_failed,
    mark_owner_payment_notification_failed,
    mark_owner_payment_notification_sent,
)
from loggers import logger
from services.payment_link import send_success_message
from services.security import crypto


async def _notify_owner(payment, http_session) -> None:
    bot_config = await get_bot_by_id(payment.bot_id)
    if not bot_config:
        raise RuntimeError("Bot configuration is unavailable")
    token = crypto.decrypt(bot_config.bot_token_enc)
    bot = Bot(
        token=token,
        session=http_session,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    lead_name = payment.lead.first_name or payment.lead.username or str(payment.lead.telegram_id)
    username = f"@{payment.lead.username}" if payment.lead.username else "без username"
    tariff_name = payment.tariff_snapshot.get("name") or "Тариф"
    await bot.send_message(
        bot_config.owner.telegram_id,
        "💰 <b>Новая оплата</b>\n\n"
        f"Бот: <b>{escape(bot_config.display_name)}</b>\n"
        f"Тариф: <b>{escape(str(tariff_name))}</b>\n"
        f"Сумма: <b>{payment.amount:,.2f} {escape(payment.currency)}</b>\n"
        f"Клиент: {escape(str(lead_name))} ({escape(username)})",
    )


async def process_client_payment_fulfillment(
    payment_id: uuid.UUID, http_session
) -> dict[str, bool]:
    """Attempt buyer delivery and owner notification as independent outbox jobs."""
    result = {"access_delivered": False, "owner_notified": False}

    claimed = await claim_client_payment_fulfillment(payment_id)
    if claimed:
        payment = await get_client_payment(payment_id)
        try:
            if not payment:
                raise RuntimeError("Client payment disappeared during fulfillment")
            await send_success_message(
                tg_bot_id=payment.bot.tg_bot_id,
                telegram_id=payment.lead.telegram_id,
                http_session=http_session,
                tariff_snapshot=payment.tariff_snapshot,
                client_payment=payment,
            )
        except Exception as exc:
            await mark_client_payment_fulfillment_failed(payment_id, str(exc))
            logger.exception("Не удалось выдать оплаченное содержимое %s", payment_id)
        else:
            await mark_client_payment_fulfilled(payment_id)
            result["access_delivered"] = True

    owner_claim = await claim_owner_payment_notification(payment_id)
    if owner_claim:
        payment = await get_client_payment(payment_id)
        try:
            if not payment:
                raise RuntimeError("Client payment disappeared before owner notification")
            await _notify_owner(payment, http_session)
        except Exception as exc:
            await mark_owner_payment_notification_failed(payment_id, str(exc))
            logger.exception("Не удалось уведомить владельца об оплате %s", payment_id)
        else:
            await mark_owner_payment_notification_sent(payment_id)
            result["owner_notified"] = True

    return result
