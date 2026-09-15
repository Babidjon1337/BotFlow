"""Tests for delivery of funnel text and bot-scoped media."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from services.funnel_message import send_funnel_node_message, to_telegram_html


def test_browser_html_is_converted_to_telegram_html():
    value = "<p><strong>Жирный</strong> и <em>курсив</em></p><p>Новая строка<br>и <s>зачёркнутый</s></p>"

    assert to_telegram_html(value) == (
        "<b>Жирный</b> и <i>курсив</i>\nНовая строка\nи <s>зачёркнутый</s>"
    )


def test_start_node_photo_is_sent_with_caption_and_keyboard():
    bot = SimpleNamespace(
        send_photo=AsyncMock(),
        send_video=AsyncMock(),
        send_document=AsyncMock(),
        send_message=AsyncMock(),
    )
    markup = object()
    node = {
        "content": "Подпись к изображению",
        "mediaType": "photo",
        "mediaFileId": "bot-scoped-file-id",
    }

    asyncio.run(send_funnel_node_message(bot, 42, node, reply_markup=markup))

    bot.send_photo.assert_awaited_once_with(
        chat_id=42,
        photo="bot-scoped-file-id",
        caption="Подпись к изображению",
        reply_markup=markup,
    )
    bot.send_message.assert_not_awaited()


def test_empty_text_is_replaced_with_safe_placeholder():
    bot = SimpleNamespace(
        send_photo=AsyncMock(),
        send_video=AsyncMock(),
        send_document=AsyncMock(),
        send_message=AsyncMock(),
    )

    asyncio.run(send_funnel_node_message(bot, 42, {"content": ""}))

    bot.send_message.assert_awaited_once_with(
        chat_id=42,
        text="👋",
        reply_markup=None,
    )
