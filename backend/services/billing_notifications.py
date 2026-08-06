"""Best-effort user notifications for Bot Father billing events."""

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError

from config import MAIN_BOT_TOKEN, PROXY_URL
from aiogram.client.session.aiohttp import AiohttpSession
from loggers import logger


async def notify_billing_user(telegram_id: int, text: str) -> None:
    if not MAIN_BOT_TOKEN:
        return
    try:
        session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else None
        async with Bot(
            MAIN_BOT_TOKEN,
            session=session,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        ) as bot:
            await bot.send_message(telegram_id, text)
    except TelegramAPIError as exc:
        logger.warning("Не удалось отправить billing-уведомление %s: %s", telegram_id, exc)
