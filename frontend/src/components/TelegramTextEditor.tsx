import React, {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
  EyeOff,
  Code,
  FileCode,
  Quote,
  Link2,
  Image as ImageIcon,
  ImagePlus,
  FileText,
  X,
} from "lucide-react";
import {
  escapeHtml,
  getPlainTextLength,
  insertHtmlAtSelection,
  normalizePasteInput,
  toTelegramHtml,
} from "../lib/telegramHtml";
import type { NodeMediaAsset } from "../types";

export const SyncedMediaPreview = ({
  botId,
  assetId,
  mediaType,
  compact,
}: {
  botId: string;
  assetId: string;
  mediaType: "photo" | "video";
  compact?: boolean;
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void import("../services/api")
      .then(({ apiService }) => {
        setPreviewError(false);
        setPreviewUrl(null);
        return apiService.getBotMediaPreview(botId, assetId);
      })
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        }
      })
      .catch(() => !cancelled && setPreviewError(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, botId]);

  if (compact) {
    if (previewError || !previewUrl) {
      return (
        <div className="w-full h-full bg-[var(--color-surface-2)] flex items-center justify-center">
          <ImageIcon size={16} className="text-[var(--color-foreground-tertiary)]" />
        </div>
      );
    }
    return mediaType === "video" ? (
      <video src={previewUrl} className="w-full h-full object-cover" muted />
    ) : (
      <img src={previewUrl} alt="Медиа" className="w-full h-full object-cover" />
    );
  }

  if (previewError) {
    return (
      <p className="text-[11px] text-[var(--color-danger)]">
        Не удалось загрузить предпросмотр. Файл остаётся привязан к сообщению.
      </p>
    );
  }
  if (!previewUrl) {
    return <p className="text-[11px] text-[var(--color-foreground-tertiary)]">Загружаем предпросмотр…</p>;
  }
  return mediaType === "video" ? (
    <video src={previewUrl} controls className="max-h-44 w-full rounded-lg object-contain bg-black" />
  ) : (
    <img src={previewUrl} alt="Предпросмотр прикреплённого файла" className="max-h-44 w-full rounded-lg object-contain bg-[var(--color-surface-2)]" />
  );
};

const keepMobileFieldVisible = (element: HTMLElement) => {
  if (typeof window === "undefined" || window.innerWidth >= 1024) return;
  const reveal = () => element.scrollIntoView({ behavior: "smooth", block: "center" });
  requestAnimationFrame(reveal);
  window.setTimeout(reveal, 360);
  const viewport = window.visualViewport;
  if (!viewport) return;
  const onResize = () => {
    reveal();
    viewport.removeEventListener("resize", onResize);
  };
  viewport.addEventListener("resize", onResize, { once: true });
};

export interface TelegramTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasMedia?: boolean;
  botId?: string;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaType?: "photo" | "video" | "document" | null;
  mediaAssets?: NodeMediaAsset[];
  onUploadMedia?: (file: File) => Promise<void>;
  onRemoveMedia?: () => void;
  attachment?: ReactNode;
  toolbarAccessory?: ReactNode;
  mediaHint?: string;
  maxCharacters?: number;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
}

export const TelegramTextEditor = ({
  value,
  onChange,
  placeholder,
  hasMedia = false,
  botId,
  mediaFileId,
  mediaAssetId,
  mediaType,
  mediaAssets = [],
  onUploadMedia,
  onRemoveMedia,
  attachment,
  toolbarAccessory,
  mediaHint,
  maxCharacters,
  className = "",
  minHeight = "min-h-[88px]",
  maxHeight = "max-h-[360px]",
}: TelegramTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorId = useId();
  const [isUploading, setIsUploading] = useState(false);

  // Modal for adding/editing links
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const linkUrlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current && document.activeElement !== editorRef.current) {
      const cleanValue = toTelegramHtml(value || "");
      if (toTelegramHtml(editorRef.current.innerHTML) !== cleanValue) {
        editorRef.current.innerHTML = cleanValue;
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const clean = toTelegramHtml(editorRef.current.innerHTML);
      onChange(clean);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const htmlData = event.clipboardData.getData("text/html");
    const plainText = event.clipboardData.getData("text/plain");
    const cleanHtml = normalizePasteInput(htmlData, plainText);
    if (cleanHtml) {
      insertHtmlAtSelection(cleanHtml);
      handleInput();
    }
  };

  const keepEditorSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const execFormat = (type: "bold" | "italic" | "strikeThrough" | "underline" | "spoiler" | "code" | "pre" | "blockquote") => {
    if (type === "bold" || type === "italic" || type === "strikeThrough" || type === "underline") {
      document.execCommand(type, false);
      handleInput();
      editorRef.current?.focus();
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);

    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      editorRef.current.focus();
      return;
    }

    const toggleWrapper = (
      tagName: string,
      className?: string,
      defaultPlaceholder: string = "текст"
    ) => {
      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

      let targetEl: HTMLElement | null = null;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLElement) {
          const matchesTag = node.tagName.toLowerCase() === tagName.toLowerCase();
          const matchesClass = className ? node.classList.contains(className) : true;
          if (matchesTag && matchesClass) {
            targetEl = node;
            break;
          }
        }
        node = node.parentElement;
      }

      if (targetEl) {
        const parent = targetEl.parentNode;
        if (parent) {
          while (targetEl.firstChild) {
            parent.insertBefore(targetEl.firstChild, targetEl);
          }
          parent.removeChild(targetEl);
          handleInput();
        }
        return;
      }

      const wrapperClass = className ? ` class="${className}"` : "";
      if (range.collapsed) {
        insertHtmlAtSelection(`<${tagName}${wrapperClass}>${defaultPlaceholder}</${tagName}>`);
      } else {
        const div = document.createElement("div");
        div.appendChild(range.cloneContents());
        insertHtmlAtSelection(`<${tagName}${wrapperClass}>${div.innerHTML}</${tagName}>`);
      }
      handleInput();
    };

    if (type === "spoiler") {
      toggleWrapper("span", "tg-spoiler", "спойлер");
    } else if (type === "code") {
      toggleWrapper("code", undefined, "код");
    } else if (type === "pre") {
      toggleWrapper("pre", undefined, "блок кода");
    } else if (type === "blockquote") {
      toggleWrapper("blockquote", undefined, "цитата");
    }

    editorRef.current?.focus();
  };

  const handleOpenLinkModal = () => {
    const sel = window.getSelection();
    let text = "";
    let url = "";
    let isExisting = false;

    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      text = range.toString();

      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLAnchorElement) {
          url = node.getAttribute("href") || "";
          if (!text) text = node.textContent || "";
          isExisting = true;
          break;
        }
        node = node.parentElement;
      }
    } else {
      savedRangeRef.current = null;
    }

    setLinkText(text);
    setLinkUrl(url);
    setIsEditingExistingLink(isExisting);
    setIsLinkModalOpen(true);
    setTimeout(() => {
      linkUrlInputRef.current?.focus();
    }, 60);
  };

  const handleApplyLink = () => {
    let url = linkUrl.trim();
    if (!url) return;

    if (!/^(https?:\/\/|tg:\/\/)/i.test(url)) {
      url = "https://" + url;
    }

    const textToDisplay = linkText.trim() || url;

    if (savedRangeRef.current && editorRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }

    const sel = window.getSelection();
    let existingAnchor: HTMLAnchorElement | null = null;
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLAnchorElement) {
          existingAnchor = node;
          break;
        }
        node = node.parentElement;
      }
    }

    if (existingAnchor) {
      existingAnchor.setAttribute("href", url);
      existingAnchor.textContent = textToDisplay;
      handleInput();
    } else {
      const linkHtml = `<a href="${escapeHtml(url)}">${escapeHtml(textToDisplay)}</a>`;
      insertHtmlAtSelection(linkHtml);
      handleInput();
    }

    setIsLinkModalOpen(false);
    editorRef.current?.focus();
  };

  const handleRemoveLink = () => {
    if (savedRangeRef.current && editorRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLAnchorElement) {
          const parent = node.parentNode;
          if (parent) {
            while (node.firstChild) {
              parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
            handleInput();
          }
          break;
        }
        node = node.parentElement;
      }
    }

    setIsLinkModalOpen(false);
    editorRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      handleOpenLinkModal();
    }
  };

  const charCount = getPlainTextLength(value);
  const limit = maxCharacters || (hasMedia ? 1024 : 4096);
  const isOverLimit = charCount > limit;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile || !onUploadMedia) return;
    setIsUploading(true);
    try {
      await onUploadMedia(selectedFile);
    } finally {
      setIsUploading(false);
    }
  };

  const hasSingleMedia = hasMedia || Boolean(mediaAssetId || mediaFileId);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--color-surface)] shadow-2xs transition-colors ${
        isOverLimit
          ? "border-[var(--color-danger)]"
          : "border-[var(--color-border)] focus-within:border-[var(--color-primary)]"
      } ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* ── Сверху: Медиа-ряд ── */}
      {attachment}
      {!attachment && onUploadMedia && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <ul className="flex flex-wrap items-center gap-2">
            <AnimatePresence mode="popLayout">
              {mediaAssets.map((asset) => (
                <motion.li
                  key={asset.mediaAssetId}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="relative flex size-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  {botId ? (
                    <SyncedMediaPreview
                      botId={botId}
                      assetId={asset.mediaAssetId}
                      mediaType={asset.mediaType === "document" ? "photo" : asset.mediaType}
                      compact
                    />
                  ) : (
                    <ImageIcon size={18} className="text-[var(--color-foreground-tertiary)]" />
                  )}
                  {onRemoveMedia && (
                    <button
                      type="button"
                      onMouseDown={keepEditorSelection}
                      onClick={onRemoveMedia}
                      aria-label="Убрать медиа"
                      className="absolute right-0.5 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                    >
                      <X className="size-2.5" aria-hidden />
                    </button>
                  )}
                </motion.li>
              ))}

              {mediaAssets.length === 0 && hasSingleMedia && (
                <motion.li
                  key="single-media"
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="relative flex size-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  {mediaType === "document" ? (
                    <FileText size={20} className="text-[var(--color-primary)]" />
                  ) : botId && mediaAssetId && mediaType ? (
                    <SyncedMediaPreview
                      botId={botId}
                      assetId={mediaAssetId}
                      mediaType={mediaType === "video" ? "video" : "photo"}
                      compact
                    />
                  ) : (
                    <ImageIcon size={20} className="text-[var(--color-foreground-tertiary)]" />
                  )}
                  {onRemoveMedia && (
                    <button
                      type="button"
                      onMouseDown={keepEditorSelection}
                      onClick={onRemoveMedia}
                      aria-label="Убрать медиа"
                      className="absolute right-0.5 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                    >
                      <X className="size-2.5" aria-hidden />
                    </button>
                  )}
                </motion.li>
              )}
            </AnimatePresence>

            {(mediaAssets.length > 0 ? mediaAssets.length < 10 : !hasSingleMedia) && (
              <li>
                <button
                  type="button"
                  onMouseDown={keepEditorSelection}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Добавить фото или видео"
                  aria-label="Добавить медиафайл"
                  className="flex size-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[var(--color-border-strong)] text-[var(--color-foreground-tertiary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {isUploading ? (
                    <span
                      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden
                    />
                  ) : (
                    <ImagePlus className="size-5" aria-hidden />
                  )}
                  <span className="text-[10px] font-semibold">{isUploading ? "…" : "фото"}</span>
                </button>
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-[11px] text-[var(--color-foreground-tertiary)]">
            {mediaHint ||
              (mediaAssets.length > 0
                ? "Медиа уйдёт одним сообщением, текст — следующим · до 10 файлов по 20 МБ"
                : "Фото или видео над текстом · до 20 МБ")}
          </p>
        </div>
      )}

      {/* ── Текстовая область ── */}
      <div
        id={editorId}
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Текст сообщения"}
        onInput={handleInput}
        onFocus={(event) => {
          keepMobileFieldVisible(event.currentTarget);
        }}
        onBlur={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        className={`p-3 ${minHeight} ${maxHeight} overflow-y-auto outline-none text-[14px] rich-text-editor scroll-my-24`}
        style={{
          color: "var(--color-foreground)",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          width: "100%",
          boxSizing: "border-box",
        }}
        data-placeholder={placeholder}
      />

      {/* ── Снизу: Панель форматирования Telegram HTML ── */}
      <div className="flex items-center justify-between gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 overflow-x-auto shrink-0">
        <div
          className="flex items-center gap-0.5 shrink-0"
          role="toolbar"
          aria-label="Форматирование текста Telegram"
        >
          {/* Bold */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("bold")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Жирный (Ctrl+B)"
            aria-label="Жирный"
          >
            <Bold size={13} />
          </button>

          {/* Italic */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("italic")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Курсив (Ctrl+I)"
            aria-label="Курсив"
          >
            <Italic size={13} />
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("strikeThrough")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Зачёркнутый"
            aria-label="Зачёркнутый"
          >
            <Strikethrough size={13} />
          </button>

          {/* Underline */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("underline")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Подчёркнутый (Ctrl+U)"
            aria-label="Подчёркнутый"
          >
            <Underline size={13} />
          </button>

          <div className="w-px h-3.5 bg-[var(--color-border)] mx-0.5 shrink-0" />

          {/* Spoiler */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("spoiler")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Спойлер"
            aria-label="Спойлер"
          >
            <EyeOff size={13} />
          </button>

          {/* Code */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("code")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Моноширинный код"
            aria-label="Моноширинный код"
          >
            <Code size={13} />
          </button>

          {/* Pre */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("pre")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Блок кода"
            aria-label="Блок кода"
          >
            <FileCode size={13} />
          </button>

          {/* Blockquote */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execFormat("blockquote")}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Цитата"
            aria-label="Цитата"
          >
            <Quote size={13} />
          </button>

          <div className="w-px h-3.5 bg-[var(--color-border)] mx-0.5 shrink-0" />

          {/* Link */}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={handleOpenLinkModal}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            title="Добавить ссылку (Ctrl+K)"
            aria-label="Добавить ссылку"
          >
            <Link2 size={13} />
          </button>
        </div>

        {/* Правая часть: аксессуар или кнопка «Медиа» */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {toolbarAccessory}
          {!toolbarAccessory && onUploadMedia && (
            <button
              type="button"
              onMouseDown={keepEditorSelection}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary)] hover:text-white transition-all shadow-2xs disabled:opacity-50"
              title="Прикрепить фото или видео"
              aria-label="Добавить медиафайл"
            >
              <ImageIcon size={13} />
              <span>{isUploading ? "Загружаем…" : "Медиа"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Кастомная модалка добавления / редактирования ссылки ── */}
      {isLinkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsLinkModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-dialog-title"
          >
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-foreground)]"
                id="link-dialog-title"
              >
                <Link2 className="size-4 text-[var(--color-primary)]" />
                <span>{isEditingExistingLink ? "Редактировать ссылку" : "Добавить ссылку"}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(false)}
                aria-label="Закрыть"
                className="flex size-7 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--color-foreground-secondary)] mb-1 block">
                  Текст ссылки
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Текст для перехода"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-tertiary)] outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-foreground-secondary)] mb-1 block">
                  Ссылка (URL)
                </label>
                <input
                  ref={linkUrlInputRef}
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyLink();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIsLinkModalOpen(false);
                    }
                  }}
                  placeholder="https://example.com или t.me/..."
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-tertiary)] outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {isEditingExistingLink ? (
                <button
                  type="button"
                  onClick={handleRemoveLink}
                  className="text-xs text-[var(--color-danger)] hover:underline"
                >
                  Удалить ссылку
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={!linkUrl.trim()}
                  onClick={handleApplyLink}
                  className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
