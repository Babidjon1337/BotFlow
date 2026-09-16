import re
from html import escape
from html.parser import HTMLParser

from aiogram import Bot
from keyboard.user_kb import *
from loggers import logger


def _markdown_to_telegram_html(text: str) -> str:
    """Convert Markdown syntax to Telegram-compatible HTML tags."""
    if not text:
        return ""

    # 1. Protect code blocks
    code_blocks: list[str] = []

    def _save_code_block(match: re.Match) -> str:
        placeholder = f"__CODE_BLOCK_{len(code_blocks)}__"
        code_blocks.append(f"<pre>{escape(match.group(1).strip(), quote=False)}</pre>")
        return placeholder

    text = re.sub(r"```(?:\w+)?\n?([\s\S]*?)```", _save_code_block, text)

    # 2. Protect inline code
    inline_codes: list[str] = []

    def _save_inline_code(match: re.Match) -> str:
        placeholder = f"__INLINE_CODE_{len(inline_codes)}__"
        inline_codes.append(f"<code>{escape(match.group(1), quote=False)}</code>")
        return placeholder

    text = re.sub(r"`([^`\n]+)`", _save_inline_code, text)

    # 3. Blockquotes: lines starting with >
    lines = text.split("\n")
    processed_lines: list[str] = []
    current_quote: list[str] = []
    for line in lines:
        match = re.match(r"^>[ \t]?(.*)$", line)
        if match:
            current_quote.append(match.group(1))
        else:
            if current_quote:
                processed_lines.append(f"<blockquote>{chr(10).join(current_quote).strip()}</blockquote>")
                current_quote = []
            processed_lines.append(line)
    if current_quote:
        processed_lines.append(f"<blockquote>{chr(10).join(current_quote).strip()}</blockquote>")
    text = "\n".join(processed_lines)

    # 4. Bold: **text** or __text__
    text = re.sub(r"\*\*([^\n*]+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"__([^\n_]+?)__", r"<b>\1</b>", text)

    # 5. Strikethrough: ~~text~~ or ~text~
    text = re.sub(r"~~([^\n~]+?)~~", r"<s>\1</s>", text)
    text = re.sub(r"(?<!\w)~([^\s~\n](?:.*?~?[^\s~\n])?)~(?![\w~])", r"<s>\1</s>", text)

    # 6. Underline: ++text++
    text = re.sub(r"\+\+([^\n+]+?)\+\+", r"<u>\1</u>", text)

    # 7. Spoiler: ||text||
    text = re.sub(r"\|\|([^\n|]+?)\|\|", r"<tg-spoiler>\1</tg-spoiler>", text)

    # 8. Links: [text](url)
    text = re.sub(r"\[([^\]\n]+)\]\(((?:https?:\/\/|tg:\/\/)[^\s)]+)\)", r'<a href="\2">\1</a>', text)

    # 9. Italic: *text* or _text_
    text = re.sub(r"(?<![\w*])\*([^\s*\n][^*\n]*?[^\s*\n])\*(?![\w*])", r"<i>\1</i>", text)
    text = re.sub(r"(?<![\w_])_([^\s_\n][^_\n]*?[^\s_\n])_(?![\w_])", r"<i>\1</i>", text)

    # 10. Restore code placeholders
    for idx, code_html in enumerate(inline_codes):
        text = text.replace(f"__INLINE_CODE_{idx}__", code_html)
    for idx, code_html in enumerate(code_blocks):
        text = text.replace(f"__CODE_BLOCK_{idx}__", code_html)

    return text


class _TelegramHtmlFormatter(HTMLParser):
    """Convert browser editor HTML, Markdown, or pasted content into Telegram's supported HTML subset."""

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
        "blockquote": "blockquote",
        "tg-spoiler": "tg-spoiler",
    }

    _block_tags = {"p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[tuple[str, str]] = []
        self.ignore_depth = 0

    def _newline(self) -> None:
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()

        if tag in {"style", "script", "xml", "head", "meta", "link"}:
            self.ignore_depth += 1
            return

        if self.ignore_depth > 0:
            return

        if tag in self._block_tags:
            self._newline()

        if tag == "br":
            self.parts.append("\n")
            return

        # Support <span class="tg-spoiler">
        if tag == "span":
            classes = next((val for name, val in attrs if name.lower() == "class"), "")
            if "tg-spoiler" in classes.split():
                self.parts.append("<tg-spoiler>")
                self.open_tags.append((tag, "tg-spoiler"))
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

        if tag in {"style", "script", "xml", "head", "meta", "link"}:
            if self.ignore_depth > 0:
                self.ignore_depth -= 1
            return

        if self.ignore_depth > 0:
            return

        for index in range(len(self.open_tags) - 1, -1, -1):
            source_tag, formatted_tag = self.open_tags[index]
            if source_tag == tag:
                for _, pending_tag in reversed(self.open_tags[index:]):
                    self.parts.append(f"</{pending_tag}>")
                del self.open_tags[index:]
                break

        if tag in self._block_tags:
            self._newline()

    def handle_data(self, data: str) -> None:
        if self.ignore_depth > 0:
            return
        self.parts.append(escape(data, quote=False))

    def render(self) -> str:
        for _, formatted_tag in reversed(self.open_tags):
            self.parts.append(f"</{formatted_tag}>")
        self.open_tags.clear()
        text = "".join(self.parts)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def to_telegram_html(value: object) -> str:
    """Keep editor formatting while removing tags unsupported by Telegram and supporting Markdown."""
    if not isinstance(value, str) or not value.strip():
        return ""

    raw = value

    # Pre-process Markdown if present
    if (
        "**" in raw
        or "~~" in raw
        or "||" in raw
        or "```" in raw
        or "`" in raw
        or "[" in raw
        or "\n>" in raw
        or raw.startswith(">")
        or re.search(r"(?<!\w)[*_]\S", raw)
    ):
        raw = _markdown_to_telegram_html(raw)

    formatter = _TelegramHtmlFormatter()
    formatter.feed(raw)
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
