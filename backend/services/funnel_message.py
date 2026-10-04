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


def _resolve_media_source(fid: str):
    """Resolve file_id or local uploads path to a Telegram-compatible media source."""
    if not fid or not isinstance(fid, str):
        return fid
    if fid.startswith("/uploads/") or "/" in fid or "\\" in fid:
        from pathlib import Path
        from aiogram.types import FSInputFile
        local_path = Path(__file__).resolve().parent.parent / fid.lstrip("/\\")
        if local_path.exists():
            return FSInputFile(str(local_path))
    return fid


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
        media_assets = node.get("mediaAssets") or node.get("media_assets") or []
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
        media_assets = getattr(node, "media_assets", []) or getattr(node, "mediaAssets", []) or []

    text = to_telegram_html(text)

    if reply_markup is None and button_text:
        reply_markup = user_payment_button(button_text)

    # Collect valid media items
    valid_assets: list[tuple[str, str]] = []
    if isinstance(media_assets, list) and len(media_assets) > 0:
        for item in media_assets[:10]:
            if isinstance(item, dict):
                fid = item.get("mediaFileId") or item.get("media_file_id") or item.get("fileId")
                mtype = item.get("mediaType") or item.get("media_type") or "photo"
                if fid:
                    valid_assets.append((str(fid), str(mtype).lower()))
            elif hasattr(item, "media_file_id") and item.media_file_id:
                valid_assets.append((str(item.media_file_id), str(getattr(item, "media_type", "photo")).lower()))
    elif file_id:
        valid_assets.append((str(file_id), str(media_type or "photo").lower()))

    try:
        from aiogram.types import InputMediaPhoto, InputMediaVideo, InputMediaDocument

        visual_assets = [a for a in valid_assets if a[1] in ("photo", "video")]
        doc_assets = [a for a in valid_assets if a[1] == "document"]
        other_assets = [a for a in valid_assets if a[1] not in ("photo", "video", "document")]
        if other_assets:
            visual_assets.extend(other_assets)

        if not valid_assets:
            await bot.send_message(
                chat_id=chat_id,
                text=text or "👋",
                reply_markup=reply_markup,
            )
            return

        MAX_CAPTION_LEN = 1024
        caption_fits = len(text) <= MAX_CAPTION_LEN if text else True
        media_caption = text if caption_fits else None

        async def _send_single_visual_safe(
            fid: str,
            mtype: str,
            caption_str: str | None = None,
            markup=None,
        ) -> bool:
            source = _resolve_media_source(fid)
            if mtype == "video":
                try:
                    await bot.send_video(
                        chat_id=chat_id,
                        video=source,
                        caption=caption_str,
                        reply_markup=markup,
                        supports_streaming=True,
                    )
                    return True
                except Exception as vid_err:
                    logger.warning(
                        "send_video не удался для %s (%s). Пробуем отправить как документ...",
                        fid,
                        vid_err,
                    )
                    try:
                        kwargs = {
                            "chat_id": chat_id,
                            "document": source,
                            "caption": caption_str,
                        }
                        if markup is not None:
                            kwargs["reply_markup"] = markup
                        await bot.send_document(**kwargs)
                        return True
                    except Exception as doc_err:
                        logger.error(
                            "Не удалось отправить медиа %s ни как видео, ни как документ: %s",
                            fid,
                            doc_err,
                        )
                        return False
            else:
                try:
                    await bot.send_photo(
                        chat_id=chat_id,
                        photo=source,
                        caption=caption_str,
                        reply_markup=markup,
                    )
                    return True
                except Exception as photo_err:
                    logger.warning(
                        "send_photo не удался для %s (%s). Пробуем отправить как документ...",
                        fid,
                        photo_err,
                    )
                    try:
                        kwargs = {
                            "chat_id": chat_id,
                            "document": source,
                            "caption": caption_str,
                        }
                        if markup is not None:
                            kwargs["reply_markup"] = markup
                        await bot.send_document(**kwargs)
                        return True
                    except Exception as doc_err:
                        logger.error(
                            "Не удалось отправить фото %s ни как фото, ни как документ: %s",
                            fid,
                            doc_err,
                        )
                        return False

        async def _send_visual_assets(
            assets: list[tuple[str, str]],
            caption_str: str | None = None,
            markup=None,
        ) -> None:
            if not assets:
                return

            if len(assets) == 1:
                fid, mtype = assets[0]
                if caption_fits:
                    ok = await _send_single_visual_safe(fid, mtype, caption_str, markup)
                    if not ok and (text or markup):
                        await bot.send_message(chat_id=chat_id, text=text or "👋", reply_markup=markup)
                else:
                    await _send_single_visual_safe(fid, mtype, None, None)
                    await bot.send_message(chat_id=chat_id, text=text or "👋", reply_markup=markup)
                return

            # Multiple visual assets: attempt send_media_group first
            album_sent = False
            try:
                visual_group = []
                for i, (fid, mtype) in enumerate(assets):
                    source = _resolve_media_source(fid)
                    c = caption_str if (i == 0 and not markup and caption_fits) else None
                    pm = "HTML" if c else None
                    if mtype == "video":
                        visual_group.append(
                            InputMediaVideo(
                                media=source,
                                caption=c,
                                parse_mode=pm,
                                supports_streaming=True,
                            )
                        )
                    else:
                        visual_group.append(
                            InputMediaPhoto(media=source, caption=c, parse_mode=pm)
                        )
                await bot.send_media_group(chat_id=chat_id, media=visual_group)
                album_sent = True
            except Exception as album_err:
                logger.warning(
                    "send_media_group не удался для пользователя %s (%s). Отправляем файлы по отдельности...",
                    chat_id,
                    album_err,
                )

            if album_sent:
                if markup or (not (caption_fits and not markup) and text):
                    await bot.send_message(
                        chat_id=chat_id,
                        text=text or "👇",
                        reply_markup=markup,
                    )
                return

            # Fallback if album failed (e.g. MEDIA_INVALID): send items individually
            for i, (fid, mtype) in enumerate(assets):
                await _send_single_visual_safe(fid, mtype, None, None)

            if text or markup:
                await bot.send_message(
                    chat_id=chat_id,
                    text=text or "👇",
                    reply_markup=markup,
                )

        async def _send_doc_assets(
            assets: list[tuple[str, str]],
            caption_str: str | None = None,
            markup=None,
        ) -> None:
            if not assets:
                return

            if len(assets) == 1:
                fid, _ = assets[0]
                doc_source = _resolve_media_source(fid)
                if caption_fits:
                    try:
                        kwargs = {
                            "chat_id": chat_id,
                            "document": doc_source,
                            "caption": caption_str,
                        }
                        if markup is not None:
                            kwargs["reply_markup"] = markup
                        await bot.send_document(**kwargs)
                        return
                    except Exception as err:
                        logger.warning("Не удалось отправить документ %s: %s", fid, err)
                        if text or markup:
                            await bot.send_message(chat_id=chat_id, text=text or "Материалы для скачивания:", reply_markup=markup)
                        return
                else:
                    try:
                        await bot.send_document(chat_id=chat_id, document=doc_source)
                    except Exception as err:
                        logger.warning("Не удалось отправить документ %s: %s", fid, err)
                    if text or markup:
                        await bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)
                    return

            # Multiple documents: try album first
            album_sent = False
            try:
                doc_group = [
                    InputMediaDocument(
                        media=_resolve_media_source(fid),
                        caption=caption_str if (i == 0 and not markup and caption_fits) else None,
                        parse_mode="HTML" if (i == 0 and not markup and caption_fits and caption_str) else None,
                    )
                    for i, (fid, _) in enumerate(assets)
                ]
                await bot.send_media_group(chat_id=chat_id, media=doc_group)
                album_sent = True
            except Exception as album_err:
                logger.warning("send_media_group для документов не удался (%s). Отправляем по отдельности...", album_err)

            if album_sent:
                if markup or (not (caption_fits and not markup) and text):
                    await bot.send_message(
                        chat_id=chat_id,
                        text=text or "Материалы для скачивания:",
                        reply_markup=markup,
                    )
                return

            # Fallback for documents: send individually
            for fid, _ in assets:
                try:
                    await bot.send_document(chat_id=chat_id, document=_resolve_media_source(fid))
                except Exception as doc_err:
                    logger.error("Не удалось отправить документ %s: %s", fid, doc_err)

            if text or markup:
                await bot.send_message(
                    chat_id=chat_id,
                    text=text or "Материалы для скачивания:",
                    reply_markup=markup,
                )

        # -------------------------------------------------------------
        # Case 1: Mixed assets (Documents AND Photos/Videos)
        # Documents are sent FIRST as a group (or single file).
        # Then the photo/video + text are sent below with the button attached.
        # -------------------------------------------------------------
        if doc_assets and visual_assets:
            await _send_doc_assets(doc_assets, None, None)
            await _send_visual_assets(visual_assets, media_caption, reply_markup)
            return

        # -------------------------------------------------------------
        # Case 2: Only documents (no photo/video)
        # If 1 document (e.g. PDF), attach it to the message with text caption
        # and the button attached directly to it without "👇".
        # -------------------------------------------------------------
        if doc_assets and not visual_assets:
            await _send_doc_assets(doc_assets, media_caption, reply_markup)
            return

        # -------------------------------------------------------------
        # Case 3: Only visual assets (photos and videos)
        # -------------------------------------------------------------
        if visual_assets and not doc_assets:
            await _send_visual_assets(visual_assets, media_caption, reply_markup)
            return

    except Exception as e:
        logger.warning(
            f"Ошибка отправки медиа-сообщения пользователю {chat_id}: {e}. "
            "Отправляем текстовое сообщение в качестве фоллбека."
        )
        try:
            await bot.send_message(
                chat_id=chat_id,
                text=text or "👋",
                reply_markup=reply_markup,
            )
        except Exception as fallback_e:
            logger.error(
                f"Не удалось отправить даже текстовое сообщение пользователю {chat_id}: {fallback_e}"
            )
            raise e
