/**
 * Utilities for normalizing rich text, HTML, and Markdown to Telegram-compatible HTML.
 * Telegram parse_mode="HTML" supports ONLY:
 * <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>,
 * <span class="tg-spoiler">, <tg-spoiler>, <a href="...">,
 * <code>, <pre>, <blockquote>, <tg-emoji>.
 * All other tags (<p>, <div>, <span>, <font>, inline styles, etc.) are unsupported
 * and must be converted to newlines or stripped.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getPlainTextLength(htmlOrText: string): number {
  if (!htmlOrText) return 0;
  return htmlOrText
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim()
    .length;
}

/**
 * Checks if a plain text string likely contains Markdown formatting.
 */
export function isLikelyMarkdown(text: string): boolean {
  if (!text) return false;
  // Bold: **text** or __text__
  if (/(\*\*|__)\S.*?\S\1/.test(text)) return true;
  // Strikethrough: ~~text~~ or ~text~
  if (/(~~|~)\S.*?\S\1/.test(text)) return true;
  // Spoiler: ||text||
  if (/\|\|\S.*?\S\|\|/.test(text)) return true;
  // Code block: ```code```
  if (/```[\s\S]*?```/.test(text)) return true;
  // Inline code: `code`
  if (/`[^`\n]+`/.test(text)) return true;
  // Link: [text](https://...)
  if (/\[[^\]\n]+\]\((https?:\/\/[^\s)]+|tg:\/\/[^\s)]+)\)/.test(text)) return true;
  // Blockquote: > text
  if (/^>[ \t]+\S/m.test(text)) return true;
  // Italic: *text* or _text_
  if (/(?<![\w*])\*\S.*?\S\*(?![\w*])/.test(text)) return true;
  if (/(?<![\w_])_\S.*?\S_(?![\w_])/.test(text)) return true;
  return false;
}

/**
 * Converts Markdown string into Telegram-compatible HTML.
 */
export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return "";

  // 1. Preserve code blocks and inline code with placeholders
  const codeBlocks: string[] = [];
  let text = markdown.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre>${escapeHtml(code.trim())}</pre>`);
    return placeholder;
  });

  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. Escape raw HTML characters in remaining text so user text doesn't break HTML
  // Note: if user already had <b> etc., we preserve Telegram valid tags
  text = text.replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;");
  text = text.replace(/<(?!(\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote|tg-spoiler)|span class="tg-spoiler"|a href="[^"]*"))/gi, "&lt;");

  // 3. Blockquotes: lines starting with >
  const lines = text.split("\n");
  const processedLines: string[] = [];
  let currentQuote: string[] = [];

  for (const line of lines) {
    const match = line.match(/^>[ \t]?(.*)$/);
    if (match) {
      currentQuote.push(match[1]);
    } else {
      if (currentQuote.length > 0) {
        processedLines.push(`<blockquote>${currentQuote.join("\n")}</blockquote>`);
        currentQuote = [];
      }
      processedLines.push(line);
    }
  }
  if (currentQuote.length > 0) {
    processedLines.push(`<blockquote>${currentQuote.join("\n")}</blockquote>`);
  }
  text = processedLines.join("\n");

  // 4. Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");
  text = text.replace(/__(.+?)__/gs, "<b>$1</b>");

  // 5. Strikethrough: ~~text~~ or ~text~
  text = text.replace(/~~(.+?)~~/gs, "<s>$1</s>");
  text = text.replace(/(?<!\w)~([^\s~](?:.*?~?[^\s~])?)~(?![\w~])/gs, "<s>$1</s>");

  // 6. Underline: ++text++
  text = text.replace(/\+\+(.+?)\+\+/gs, "<u>$1</u>");

  // 7. Spoiler: ||text||
  text = text.replace(/\|\|(.+?)\|\|/gs, '<span class="tg-spoiler">$1</span>');

  // 8. Links: [text](url)
  text = text.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|tg:\/\/)[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // 9. Italic: *text* or _text_
  text = text.replace(/(?<![\w*])\*([^\s*](?:.*?[^\s*])?)\*(?![\w*])/gs, "<i>$1</i>");
  text = text.replace(/(?<![\w_])_([^\s_](?:.*?[^\s_])?)_(?![\w_])/gs, "<i>$1</i>");

  // 10. Restore code blocks & inline code
  inlineCodes.forEach((codeHtml, idx) => {
    text = text.replace(`__INLINE_CODE_${idx}__`, codeHtml);
  });
  codeBlocks.forEach((codeHtml, idx) => {
    text = text.replace(`__CODE_BLOCK_${idx}__`, codeHtml);
  });

  return text;
}

/**
 * Recursively cleans arbitrary DOM elements and converts to Telegram-compatible HTML.
 */
function cleanNode(node: Node): string {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent || "");
  }

  // Not an element node
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Strip blacklisted elements completely
  if (["script", "style", "meta", "link", "title", "xml", "head"].includes(tag)) {
    return "";
  }

  // BR produces newline
  if (tag === "br") {
    return "\n";
  }

  // Collect inner HTML recursively
  let inner = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    inner += cleanNode(el.childNodes[i]);
  }

  // If node is empty after cleaning
  if (!inner) {
    if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"].includes(tag)) {
      return "\n";
    }
    return "";
  }

  // Detect formatting from tags OR inline CSS styles (from Word, Google Docs, etc.)
  const style = el.style || ({} as CSSStyleDeclaration);
  const fontWeight = (style.fontWeight || "").toLowerCase();
  const fontStyle = (style.fontStyle || "").toLowerCase();
  const textDecoration = (style.textDecoration || "").toLowerCase();

  const isBold =
    tag === "b" ||
    tag === "strong" ||
    fontWeight === "bold" ||
    parseInt(fontWeight, 10) >= 600;

  const isItalic =
    tag === "i" ||
    tag === "em" ||
    fontStyle === "italic";

  const isUnderline =
    tag === "u" ||
    tag === "ins" ||
    textDecoration.includes("underline");

  const isStrike =
    tag === "s" ||
    tag === "strike" ||
    tag === "del" ||
    textDecoration.includes("line-through");

  const isSpoiler =
    tag === "tg-spoiler" ||
    el.classList.contains("tg-spoiler");

  const isCode = tag === "code";
  const isPre = tag === "pre";
  const isQuote = tag === "blockquote";
  const isLink = tag === "a";
  const isBlock = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"].includes(tag);

  let result = inner;

  if (isCode) {
    result = `<code>${result}</code>`;
  } else if (isPre) {
    result = `<pre>${result}</pre>`;
  } else if (isQuote) {
    result = `<blockquote>${result}</blockquote>`;
  } else if (isSpoiler) {
    result = `<span class="tg-spoiler">${result}</span>`;
  }

  if (isStrike) {
    result = `<s>${result}</s>`;
  }
  if (isUnderline) {
    result = `<u>${result}</u>`;
  }
  if (isItalic) {
    result = `<i>${result}</i>`;
  }
  if (isBold) {
    result = `<b>${result}</b>`;
  }

  if (isLink) {
    const href = (el.getAttribute("href") || "").trim();
    if (/^(https?:\/\/|tg:\/\/)/i.test(href)) {
      result = `<a href="${escapeHtml(href)}">${result}</a>`;
    }
  }

  // Blocks add newlines
  if (isBlock) {
    result = `\n${result}\n`;
  }

  return result;
}

/**
 * Cleans arbitrary HTML (from Word, Google Docs, Apple Notes, or websites)
 * down to Telegram's supported HTML tags without foreign styles, fonts, or colors.
 */
export function cleanHtmlToTelegramHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  // Remove HTML comments, Office XML tags, etc.
  const sanitizedInput = rawHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?\w+:[^>]*>/gi, "");

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedInput, "text/html");

  let text = cleanNode(doc.body);

  // Normalize excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  // If the extracted text contains unparsed Markdown, parse it as well
  if (isLikelyMarkdown(text)) {
    text = markdownToTelegramHtml(text);
  }

  return text;
}

/**
 * Handles paste into a rich-text editor, normalizing HTML, Word, or Markdown into
 * clean Telegram HTML with line breaks for DOM insertion.
 */
export function normalizePasteInput(htmlData?: string, plainText?: string): string {
  let cleaned = "";

  if (htmlData && htmlData.trim().length > 0) {
    cleaned = cleanHtmlToTelegramHtml(htmlData);
  } else if (plainText && plainText.trim().length > 0) {
    if (/<[a-z][\s\S]*>/i.test(plainText)) {
      // Looks like raw HTML was pasted
      cleaned = cleanHtmlToTelegramHtml(plainText);
    } else if (isLikelyMarkdown(plainText)) {
      cleaned = markdownToTelegramHtml(plainText);
    } else {
      cleaned = escapeHtml(plainText);
    }
  }

  if (!cleaned) return "";

  // For inserting into contentEditable DOM:
  // Convert newlines to <br> so browsers render line breaks correctly inside DOM
  return cleaned.replace(/\n/g, "<br>");
}

/**
 * Converts editor HTML (from contentEditable innerHTML) to pure Telegram Bot API HTML.
 * Line breaks (<p>, <div>, <br>) become \n.
 * Unwanted tags/styles are stripped.
 */
export function toTelegramHtml(editorHtml: string): string {
  if (!editorHtml || typeof editorHtml !== "string") return "";

  // If there are no HTML tags at all, check if it's markdown
  if (!/<[a-z][\s\S]*>/i.test(editorHtml)) {
    if (isLikelyMarkdown(editorHtml)) {
      return markdownToTelegramHtml(editorHtml).trim();
    }
    return editorHtml.trim();
  }

  // Parse and clean via DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(editorHtml, "text/html");
  const cleaned = cleanNode(doc.body);

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Safely inserts clean HTML into the active contentEditable element at the current cursor position.
 * Preserves the undo stack via document.execCommand when possible.
 */
export function insertHtmlAtSelection(html: string): void {
  if (!html) return;

  // Modern browsers support execCommand('insertHTML') in contentEditable
  if (typeof document !== "undefined" && document.queryCommandSupported && document.queryCommandSupported("insertHTML")) {
    const success = document.execCommand("insertHTML", false, html);
    if (success) return;
  }

  // Fallback: Range / Selection API
  if (typeof window !== "undefined" && window.getSelection) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const temp = document.createElement("div");
    temp.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: Node | null;
    let lastNode: Node | null = null;
    while ((node = temp.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}
