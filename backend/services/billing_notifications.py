"""Best-effort user notifications for BotFlow billing events."""

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError

from config import MAIN_BOT_TOKEN, PROXY_URL
from loggers import logger

_session: AiohttpSession | None = None


def _get_session() -> AiohttpSession:
    global _session
    if _session is None:
        _session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else AiohttpSession()
    return _session


async def close_billing_notification_session() -> None:
    global _session
    if _session is not None:
        await _session.close()
        _session = None


async def notify_billing_user(
    telegram_id: int,
    text: str,
    http_session: AiohttpSession | None = None,
) -> None:
    if not MAIN_BOT_TOKEN:
        return
    try:
        session = http_session or _get_session()
        bot = Bot(
            MAIN_BOT_TOKEN,
            session=session,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        await bot.send_message(telegram_id, text)
    except TelegramAPIError as exc:
        logger.warning("Не удалось отправить billing-уведомление %s: %s", telegram_id, exc)
