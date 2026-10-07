"""Выдача оферты-файла без хранения на сервере.

Файл лежит в Telegram (file_id привязан к токену конкретного бота). По
публичной ссылке мы скачиваем его из Telegram в память и отдаём:
- PDF -> inline как есть (application/pdf)
- DOCX, DOC, RTF, ODT, TXT -> чистая HTML-страница с адаптивной вёрсткой (text/html)
"""

import io
import logging
import re
import zipfile
import xml.etree.ElementTree as ET
from html import escape

logger = logging.getLogger(__name__)

MAX_OFFER_BYTES = 20 * 1024 * 1024  # лимит Bot API getFile
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "rtf", "odt", "txt"}

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC_MIME = "application/msword"
RTF_MIME = "application/rtf"
ODT_MIME = "application/vnd.oasis.opendocument.text"
TXT_MIME = "text/plain"

KIND_TO_MIME = {
    "pdf": PDF_MIME,
    "docx": DOCX_MIME,
    "doc": DOC_MIME,
    "rtf": RTF_MIME,
    "odt": ODT_MIME,
    "txt": TXT_MIME,
}


def get_mime_for_kind(kind: str | None) -> str:
    return KIND_TO_MIME.get((kind or "").lower(), "application/octet-stream")


def is_html_renderable(kind: str | None) -> bool:
    return (kind or "").lower() in {"docx", "doc", "rtf", "odt", "txt"}


def detect_offer_kind(filename: str | None, content_type: str | None) -> str | None:
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    if ext in ALLOWED_EXTENSIONS:
        return ext

    ct = (content_type or "").lower().split(";")[0].strip()
    if ct == "application/pdf":
        return "pdf"
    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "docx"
    if ct in ("application/msword", "application/doc"):
        return "doc"
    if ct in ("application/rtf", "text/rtf"):
        return "rtf"
    if ct in ("application/vnd.oasis.opendocument.text", "application/x-vnd.oasis.opendocument.text"):
        return "odt"
    if ct.startswith("text/plain"):
        return "txt"
    return None


# Кэш в памяти отключен: оферта всегда отдаётся свежей напрямую из Telegram.
def cache_get(key: str) -> bytes | None:
    return None


def cache_put(key: str, data: bytes) -> None:
    pass


def cache_drop(key: str) -> None:
    pass


def decode_text_bytes(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1251", "windows-1251", "latin1"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", errors="replace")


def wrap_html_page(body_html: str, title: str) -> str:
    safe_title = escape(title or "Оферта")
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{safe_title}</title>
<style>
body{{margin:0;background:#f5f5f7;color:#1c1c1e;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:24px 20px 48px;background:#fff;min-height:100vh;box-sizing:border-box;overflow-wrap:anywhere}}
h1,h2,h3{{line-height:1.3;margin:1.2em 0 .5em}}
p{{margin:.75em 0}}
table{{border-collapse:collapse;width:100%;margin:1em 0;display:block;overflow-x:auto}}
td,th{{border:1px solid #d1d1d6;padding:8px 10px;vertical-align:top}}
img{{max-width:100%;height:auto}}
@media(prefers-color-scheme:dark){{body{{background:#000;color:#f2f2f7}}main{{background:#1c1c1e}}td,th{{border-color:#3a3a3c}}}}
</style></head><body><main>{body_html}</main></body></html>"""


def text_to_html_body(text: str) -> str:
    paragraphs = []
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        # Простая эвристика для заголовков (например, "1. ОБЩИЕ ПОЛОЖЕНИЯ" или короткие строки КАПСОМ)
        if len(trimmed) < 100 and (trimmed.isupper() or re.match(r"^\d+\.\s+[A-ZА-ЯЁ]", trimmed)):
            paragraphs.append(f"<h2>{escape(trimmed)}</h2>")
        else:
            paragraphs.append(f"<p>{escape(trimmed)}</p>")
    return "\n".join(paragraphs) if paragraphs else "<p></p>"


def text_to_html_page(text: str, title: str) -> str:
    return wrap_html_page(text_to_html_body(text), title)


def docx_to_html_page(data: bytes, title: str) -> str:
    import mammoth

    result = mammoth.convert_to_html(io.BytesIO(data))
    return wrap_html_page(result.value, title)


def odt_to_html_page(data: bytes, title: str) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        content_xml = z.read("content.xml")
    root = ET.fromstring(content_xml)
    blocks = []
    for elem in root.iter():
        tag = elem.tag.split("}")[-1]
        if tag in ("p", "h"):
            text = "".join(elem.itertext()).strip()
            if text:
                html_tag = "h2" if tag == "h" else "p"
                blocks.append(f"<{html_tag}>{escape(text)}</{html_tag}>")
    body = "\n".join(blocks) if blocks else "<p></p>"
    return wrap_html_page(body, title)


def rtf_to_html_page(data: bytes, title: str) -> str:
    from striprtf.striprtf import rtf_to_text

    try:
        raw_text = data.decode("cp1251")
    except UnicodeDecodeError:
        raw_text = data.decode("latin1", errors="ignore")
    plain = rtf_to_text(raw_text)
    return text_to_html_page(plain, title)


def _extract_ole_text_fallback(data: bytes) -> str:
    try:
        from legacy_doc.ole import OleReader

        reader = OleReader(data)
        text_parts = []
        for stream_name in ("WordDocument", "1Table", "0Table"):
            stream = reader.try_read_stream([stream_name])
            if stream:
                # Извлекаем фрагменты текста (ASCII или CP1251 длиной от 4 символов)
                words = re.findall(rb"[\x20-\x7e\xc0-\xff]{4,}", stream)
                for w in words:
                    try:
                        decoded = w.decode("cp1251").strip()
                        if decoded and len(decoded) > 2:
                            text_parts.append(decoded)
                    except Exception:
                        pass
        return "\n".join(text_parts)
    except Exception:
        return ""


def doc_to_text(data: bytes) -> str:
    stripped = data.lstrip()

    # 1. RTF, сохранённый с расширением .doc
    if stripped.startswith(b"{\\rtf"):
        from striprtf.striprtf import rtf_to_text

        try:
            raw = stripped.decode("cp1251")
        except UnicodeDecodeError:
            raw = stripped.decode("latin1", errors="ignore")
        return rtf_to_text(raw)

    # 2. DOCX, переименованный в .doc
    if stripped.startswith(b"PK"):
        import mammoth

        res = mammoth.extract_raw_text(io.BytesIO(data))
        if res.value.strip():
            return res.value

    # 3. Бинарный Word 97-2003 (OLE2 Compound File) через legacy-doc
    if stripped.startswith(b"\xd0\xcf\x11\xe0"):
        try:
            from legacy_doc import extract_text

            res = extract_text(data)
            if res and res.text and res.text.strip():
                return res.text
        except Exception as exc:
            logger.info("legacy_doc parse warning: %s", exc)

        fallback = _extract_ole_text_fallback(data)
        if fallback.strip():
            return fallback

    # 4. Текстовый файл, сохранённый как .doc
    decoded = decode_text_bytes(data)
    if decoded.strip():
        return decoded

    raise ValueError("Не удалось извлечь текст из файла .doc")


def doc_to_html_page(data: bytes, title: str) -> str:
    # Если это на самом деле DOCX:
    if data.startswith(b"PK"):
        return docx_to_html_page(data, title)
    # Если это на самом деле RTF:
    if data.lstrip().startswith(b"{\\rtf"):
        return rtf_to_html_page(data, title)

    text = doc_to_text(data)
    return text_to_html_page(text, title)


def document_to_html_page(data: bytes, kind: str, title: str) -> str:
    kind = (kind or "").lower()
    if kind == "docx":
        return docx_to_html_page(data, title)
    if kind == "odt":
        return odt_to_html_page(data, title)
    if kind == "rtf":
        return rtf_to_html_page(data, title)
    if kind == "txt":
        return text_to_html_page(decode_text_bytes(data), title)
    if kind == "doc":
        return doc_to_html_page(data, title)

    # Автоопределение формата по сигнатуре при неопределённом kind:
    if data.startswith(b"PK"):
        try:
            return docx_to_html_page(data, title)
        except Exception:
            return odt_to_html_page(data, title)
    if data.lstrip().startswith(b"{\\rtf"):
        return rtf_to_html_page(data, title)
    try:
        return doc_to_html_page(data, title)
    except Exception:
        return text_to_html_page(decode_text_bytes(data), title)


def validate_offer_payload(kind: str, data: bytes) -> None:
    if not data:
        raise ValueError("Файл оферты пуст.")
    if len(data) > MAX_OFFER_BYTES:
        raise ValueError("Размер файла не должен превышать 20 МБ.")

    if kind == "pdf":
        if not (data.startswith(b"%PDF") or b"%PDF" in data[:1024]):
            raise ValueError("Файл не является корректным PDF-документом.")
    elif kind == "docx":
        if not data.startswith(b"PK"):
            raise ValueError("Файл не является корректным DOCX-документом.")
        import mammoth

        try:
            mammoth.convert_to_html(io.BytesIO(data))
        except Exception as exc:
            raise ValueError("Не удалось прочитать DOCX. Сохраните документ заново.") from exc
    elif kind == "odt":
        if not data.startswith(b"PK"):
            raise ValueError("Файл не является корректным ODT-документом.")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if "content.xml" not in z.namelist():
                    raise ValueError("Файл ODT повреждён.")
        except Exception as exc:
            raise ValueError("Не удалось прочитать ODT-документ.") from exc
    elif kind == "rtf":
        if not data.lstrip().startswith(b"{\\rtf"):
            raise ValueError("Файл не является корректным RTF-документом.")
    elif kind == "doc":
        try:
            doc_to_text(data)
        except Exception as exc:
            raise ValueError("Не удалось прочитать файл DOC. Сохраните его как DOCX или PDF.") from exc
    elif kind == "txt":
        decoded = decode_text_bytes(data)
        if not decoded.strip():
            raise ValueError("Текстовый файл пуст.")
