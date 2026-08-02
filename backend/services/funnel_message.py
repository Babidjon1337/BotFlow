from html import escape
from html.parser import HTMLParser

from aiogram import Bot
from keyboard.user_kb import *
from loggers import logger


class _TelegramHtmlFormatter(HTMLParser):
    """Convert the browser editor's HTML into Telegram's supported HTML subset."""

    _formatting_tags = {
        "b": "b",
        "strong": "b",
        "i": "i",
        "em": "i",
        "u": "u",
        "ins": "u",
        "s": "s",
        "strike": "s",
        "del": "s",
        "code": "code",
        "pre": "pre",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[tuple[str, str]] = []

    def _newline(self) -> None:
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in {"p", "div"}:
            self._newline()
            return
        if tag == "br":
            self._newline()
            return
        formatted_tag = self._formatting_tags.get(tag)
        if formatted_tag:
            self.parts.append(f"<{formatted_tag}>")
            self.open_tags.append((tag, formatted_tag))
            return
        if tag == "a":
            href = next((value for name, value in attrs if name.lower() == "href"), None)
            if href and href.strip().lower().startswith(("https://", "http://", "tg://")):
                self.parts.append(f'<a href="{escape(href.strip(), quote=True)}">')
                self.open_tags.append((tag, "a"))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"p", "div"}:
            self._newline()
            return

        for index in range(len(self.open_tags) - 1, -1, -1):
            source_tag, formatted_tag = self.open_tags[index]
            if source_tag == tag:
                for _, pending_tag in reversed(self.open_tags[index:]):
                    self.parts.append(f"</{pending_tag}>")
                del self.open_tags[index:]
                return

    def handle_data(self, data: str) -> None:
        self.parts.append(escape(data, quote=False))

    def render(self) -> str:
        for _, formatted_tag in reversed(self.open_tags):
            self.parts.append(f"</{formatted_tag}>")
        self.open_tags.clear()
        return "".join(self.parts).strip()


def to_telegram_html(value: object) -> str:
    """Keep editor formatting while removing tags unsupported by Telegram."""
    if not isinstance(value, str) or not value:
        return ""

    formatter = _TelegramHtmlFormatter()
    formatter.feed(value)
    formatter.close()
    return formatter.render()


async def send_funnel_node_message(bot: Bot, chat_id: int, node, reply_markup=None) -> None:
    if isinstance(node, dict):
        text = node.get("content", "")
        if isinstance(text, dict):
            text = text.get("text", "")
        media_type = node.get("mediaType") or node.get("media_type")
        file_id = node.get("mediaFileId") or node.get("media_file_id")
        if not file_id and isinstance(node.get("content"), dict):
            media = node["content"].get("media", {})
            media_type = media.get("type")
            file_id = media.get("file_id")
        # Stored V2 funnels use camelCase; older scheduled tasks use snake_case.
        button_text = node.get("buttonText") or node.get("button_text")
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

    text = to_telegram_html(text)

    if reply_markup is None and button_text:
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
        elif media_type == "document" and file_id:
            await bot.send_document(
                chat_id=chat_id,
                document=file_id,
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
