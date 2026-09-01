"""R7 broadcast sending engine.

Держится в рамках лимитов Telegram: не быстрее ~20 сообщений в секунду
на один бот-токен, честно обрабатывает flood-wait и блокировки.
Состав получателей зафиксирован снимком при создании рассылки.
"""
import asyncio
from uuid import UUID

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.types import InputMediaPhoto, InputMediaVideo

from config import PROXY_URL
from database.models import BotConfig
from database.requests.bot_rq import get_bot_by_id
from database.requests.broadcast_rq import (
    finalize_broadcast,
    get_broadcast,
    get_broadcast_media,
    get_pending_recipients,
    mark_recipient_failed,
    mark_recipient_sent,
)
from loggers import logger
from services.funnel_message import to_telegram_html
from services.security import crypto

# Порция получателей на один заход в БД.
BROADCAST_CHUNK_SIZE = 100
# Пауза между сообщениями: 20 сообщений/сек — запас до лимита 30/сек.
SEND_GAP_SECONDS = 0.05
# Сколько раз ждём flood-wait для одного получателя, прежде чем пометить failed.
MAX_FLOOD_WAITS_PER_RECIPIENT = 3

_session: AiohttpSession | None = None


def _get_session() -> AiohttpSession:
    """Отдельная сессия для движка рассылок (общая с планировщиком не требуется)."""
    global _session
    if _session is None:
        _session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else AiohttpSession()
    return _session


async def close_broadcast_session() -> None:
    global _session
    if _session is not None:
        await _session.close()
        _session = None


def _friendly_error(exc: Exception) -> str:
    if isinstance(exc, TelegramForbiddenError):
        return "Пользователь заблокировал бота"
    if isinstance(exc, TelegramBadRequest):
        return f"Telegram отклонил сообщение: {exc}"
    return str(exc)[:500]


async def _deliver_one(bot: Bot, telegram_id: int, text: str) -> None:
    """Отправка одному получателю с ожиданием flood-limits."""
    flood_waits = 0
    while True:
        try:
            await bot.send_message(chat_id=telegram_id, text=text)
            return
        except TelegramRetryAfter as exc:
            flood_waits += 1
            if flood_waits >= MAX_FLOOD_WAITS_PER_RECIPIENT:
                raise
            await asyncio.sleep(exc.retry_after + 1)


async def _deliver_media_then_text(
    bot: Bot, telegram_id: int, media_assets: list, text: str
) -> None:
    """Медиа-группа (file_id) отдельным сообщением, затем текст.

    В Telegram подпись медиа-группы ограничена 1024 символами и по ТЗ
    текст идёт отдельным сообщением — как обычное сообщение без медиа.
    """
    flood_waits = 0
    while True:
        try:
            if len(media_assets) == 1:
                asset = media_assets[0]
                if asset.media_type == "video":
                    await bot.send_video(chat_id=telegram_id, video=asset.telegram_file_id)
                else:
                    await bot.send_photo(chat_id=telegram_id, photo=asset.telegram_file_id)
            else:
                # aiogram принимает file_id строкой как InputMedia-источник.
                media_group = [
                    InputMediaVideo(media=a.telegram_file_id)
                    if a.media_type == "video"
                    else InputMediaPhoto(media=a.telegram_file_id)
                    for a in media_assets
                ]
                await bot.send_media_group(chat_id=telegram_id, media=media_group)
            break
        except TelegramRetryAfter as exc:
            flood_waits += 1
            if flood_waits >= MAX_FLOOD_WAITS_PER_RECIPIENT:
                raise
            await asyncio.sleep(exc.retry_after + 1)

    if text:
        await _deliver_one(bot, telegram_id, text)


async def _send_pending_chunk(
    bot: Bot, broadcast_id: UUID, text: str, chunk: list, media_assets: list | None = None
) -> None:
    media_assets = media_assets or []
    for recipient in chunk:
        try:
            if media_assets:
                await _deliver_media_then_text(
                    bot, recipient.telegram_id, media_assets, text
                )
            else:
                await _deliver_one(bot, recipient.telegram_id, text)
            await mark_recipient_sent(recipient.id, broadcast_id)
        except Exception as exc:  # один получатель не должен остановить рассылку
            await mark_recipient_failed(
                recipient.id, broadcast_id, _friendly_error(exc)
            )
            logger.info(
                "Рассылка %s: получатель %s не доставлен: %s",
                broadcast_id,
                recipient.telegram_id,
                exc,
            )
        await asyncio.sleep(SEND_GAP_SECONDS)


async def run_broadcast_sending(broadcast_id: UUID, bot_session: AiohttpSession | None = None) -> str:
    """Досылает все pending-получатели рассылки и финализирует статус.

    Безопасно вызывать повторно: обрабатывает только pending-записи,
    поэтому после сбоя отправка продолжается с места остановки.
    """
    broadcast = await get_broadcast(broadcast_id)
    if broadcast is None:
        return "missing"
    if broadcast.status != "sending":
        return broadcast.status

    bot_config: BotConfig | None = await get_bot_by_id(broadcast.bot_id)
    if bot_config is None or not bot_config.bot_token_enc:
        logger.error("Рассылка %s: у бота нет токена, помечаем failed", broadcast_id)
        for recipient in await get_pending_recipients(broadcast_id, limit=500):
            await mark_recipient_failed(
                recipient.id, broadcast_id, "У бота не настроен токен"
            )
        return await finalize_broadcast(broadcast_id)

    token = crypto.decrypt(bot_config.bot_token_enc)
    bot = Bot(
        token=token,
        session=bot_session or _get_session(),
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    # Текст рассылки может содержать HTML из композера (жирный/курсив/ссылки).
    # Санитизируем до недопустимых Telegram-тегов и отправляем одним текстом.
    text = to_telegram_html(text)
    media_assets = await get_broadcast_media(broadcast)
    try:
        while True:
            chunk = await get_pending_recipients(broadcast_id, BROADCAST_CHUNK_SIZE)
            if not chunk:
                break
            await _send_pending_chunk(
                bot, broadcast_id, broadcast.text, chunk, media_assets=media_assets
            )
    finally:
        final_status = await finalize_broadcast(broadcast_id)
        logger.info("Рассылка %s завершена со статусом %s", broadcast_id, final_status)
    return final_status
