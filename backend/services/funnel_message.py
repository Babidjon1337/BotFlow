from aiogram import Bot
from keyboard.user_kb import *
from loggers import logger


async def send_funnel_node_message(bot: Bot, chat_id: int, node) -> None:
    if isinstance(node, dict):
        text = node.get("content", "")
        if isinstance(text, dict):
            text = text.get("text", "")
        media_type = node.get("media_type")
        file_id = node.get("media_file_id")
        if not file_id and isinstance(node.get("content"), dict):
            media = node["content"].get("media", {})
            media_type = media.get("type")
            file_id = media.get("file_id")
        button_text = node.get("button_text")
        if not button_text and isinstance(node.get("button"), dict):
            button_text = node["button"].get("text")
    else:
        text = getattr(node, "content", "")
        if not isinstance(text, str) and hasattr(text, "text"):
            text = text.text
        media_type = getattr(node, "media_type", None)
        file_id = getattr(node, "media_file_id", None)
        if not file_id and hasattr(node, "content") and hasattr(node.content, "media"):
            media_type = getattr(node.content.media, "type", None)
            file_id = getattr(node.content.media, "file_id", None)
        button_text = getattr(node, "button_text", None)
        if not button_text and hasattr(node, "button") and node.button:
            button_text = getattr(node.button, "text", None)

    reply_markup = None
    if button_text:
        reply_markup = user_payment_button(button_text)

    try:
        if media_type == "video" and file_id:
            await bot.send_video(
                chat_id=chat_id,
                video=file_id,
                caption=text,
                reply_markup=reply_markup,
            )
        elif media_type == "photo" and file_id:
            await bot.send_photo(
                chat_id=chat_id,
                photo=file_id,
                caption=text,
                reply_markup=reply_markup,
            )
        else:
            await bot.send_message(
                chat_id=chat_id,
                text=text or "👋",
                reply_markup=reply_markup,
            )
    except Exception as e:
        logger.warning(f"Ошибка отправки сообщения пользователю {chat_id}: {e}")
        raise e
