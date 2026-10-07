"""Выдача оферты-файла без хранения на сервере.

Файл лежит в Telegram (file_id привязан к токену конкретного бота). По
публичной ссылке мы скачиваем его из Telegram в память и отдаём:
DOCX -> HTML-страница (mammoth), PDF -> inline как есть.
"""

import io
import time
from collections import OrderedDict
from html import escape

MAX_OFFER_BYTES = 20 * 1024 * 1024  # лимит Bot API getFile
ALLOWED_EXTENSIONS = {"pdf", "docx"}
PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

def detect_offer_kind(filename: str | None, content_type: str | None) -> str | None:
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    if ext == "pdf":
        return "pdf"
    if ext == "docx":
        return "docx"
    return None


# Кэш в памяти отключен: оферта всегда отдаётся свежей напрямую из Telegram.
def cache_get(key: str) -> bytes | None:
    return None


def cache_put(key: str, data: bytes) -> None:
    pass


def cache_drop(key: str) -> None:
    pass


def docx_to_html_page(data: bytes, title: str) -> str:
    import mammoth

    result = mammoth.convert_to_html(io.BytesIO(data))
    body = result.value
    safe_title = escape(title or "Оферта")
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{safe_title}</title>
<style>
body{{margin:0;background:#f5f5f7;color:#1c1c1e;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:20px 18px 48px;background:#fff;min-height:100vh;box-sizing:border-box;overflow-wrap:anywhere}}
h1,h2,h3{{line-height:1.3}} p{{margin:.7em 0}}
table{{border-collapse:collapse;width:100%;display:block;overflow-x:auto}}
td,th{{border:1px solid #d1d1d6;padding:6px 8px;vertical-align:top}}
img{{max-width:100%;height:auto}}
@media(prefers-color-scheme:dark){{body{{background:#000;color:#f2f2f7}}main{{background:#1c1c1e}}td,th{{border-color:#3a3a3c}}}}
</style></head><body><main>{body}</main></body></html>"""
