import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  Send,
} from "lucide-react";
import {
  escapeHtml,
  getPlainTextLength,
  insertHtmlAtSelection,
  normalizePasteInput,
  toTelegramHtml,
} from "../lib/telegramHtml";
import { apiService } from "../services/api";
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
  const [mediaState, setMediaState] = useState<{
    assetId: string;
    url: string | null;
    error: boolean;
  }>({
    assetId,
    url: null,
    error: false,
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    apiService
      .getBotMediaPreview(botId, assetId)
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setMediaState({ assetId, url: objectUrl, error: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMediaState({ assetId, url: null, error: true });
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, botId]);

  const previewUrl = mediaState.assetId === assetId ? mediaState.url : null;
  const previewError = mediaState.assetId === assetId ? mediaState.error : false;

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
  onUploadLargeMedia?: () => void;
  onRemoveMedia?: (assetId?: string) => void;
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
  onUploadLargeMedia,
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
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Active formatting state for toolbar highlights
  const [activeFormats, setActiveFormats] = useState<{
    bold: boolean;
    italic: boolean;
    strikeThrough: boolean;
    underline: boolean;
    spoiler: boolean;
    code: boolean;
    pre: boolean;
    blockquote: boolean;
    link: boolean;
  }>({
    bold: false,
    italic: false,
    strikeThrough: false,
    underline: false,
    spoiler: false,
    code: false,
    pre: false,
    blockquote: false,
    link: false,
  });

  // Modal for adding/editing links
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const editingAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const linkTextInputRef = useRef<HTMLInputElement>(null);
  const linkUrlInputRef = useRef<HTMLInputElement>(null);

  const updateActiveFormats = useCallback(() => {
    if (typeof document === "undefined" || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return;
    }

    let isSpoiler = false;
    let isCode = false;
    let isPre = false;
    let isQuote = false;
    let isLink = false;

    let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== editorRef.current) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();
        if (tag === "span" && node.classList.contains("tg-spoiler")) isSpoiler = true;
        if (tag === "tg-spoiler") isSpoiler = true;
        if (tag === "code") isCode = true;
        if (tag === "pre") isPre = true;
        if (tag === "blockquote") isQuote = true;
        if (tag === "a") isLink = true;
      }
      node = node.parentElement;
    }

    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      strikeThrough: document.queryCommandState("strikeThrough"),
      underline: document.queryCommandState("underline"),
      spoiler: isSpoiler,
      code: isCode,
      pre: isPre,
      blockquote: isQuote,
      link: isLink,
    });
  }, []);

  useEffect(() => {
    if (editorRef.current && document.activeElement !== editorRef.current) {
      const cleanValue = toTelegramHtml(value || "");
      if (!cleanValue) {
        if (editorRef.current.innerHTML !== "") {
          editorRef.current.innerHTML = "";
        }
      } else if (toTelegramHtml(editorRef.current.innerHTML) !== cleanValue) {
        editorRef.current.innerHTML = cleanValue;
      }
    }
  }, [value]);

  // Global Escape handler when modal is open
  useEffect(() => {
    if (!isLinkModalOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLinkModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isLinkModalOpen]);

  const handleInput = () => {
    if (editorRef.current) {
      const clean = toTelegramHtml(editorRef.current.innerHTML);
      onChange(clean);
      updateActiveFormats();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    // 1. Проверяем вставку медиафайлов из буфера обмена (картинки, скриншоты, видео)
    const items = event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
    const mediaItem = items.find(
      (item) => item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/"))
    );
    const files = event.clipboardData.files ? Array.from(event.clipboardData.files) : [];
    const mediaFile = mediaItem
      ? mediaItem.getAsFile()
      : files.find((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));

    if (mediaFile && onUploadMedia) {
      event.preventDefault();
      if (mediaFile.size > 20 * 1024 * 1024) {
        if (onUploadLargeMedia) {
          onUploadLargeMedia();
        } else {
          alert("Размер файла превышает 20 МБ. Используйте загрузку через Telegram-бота.");
        }
        return;
      }
      setIsUploading(true);
      onUploadMedia(mediaFile).finally(() => setIsUploading(false));
      return;
    }

    // 2. Обычная вставка форматированного текста
    event.preventDefault();
    const htmlData = event.clipboardData.getData("text/html");
    const plainText = event.clipboardData.getData("text/plain");
    const cleanHtml = normalizePasteInput(htmlData, plainText);
    if (cleanHtml) {
      insertHtmlAtSelection(cleanHtml);
      handleInput();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const mediaFile = files.find((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (mediaFile && onUploadMedia) {
      if (mediaFile.size > 20 * 1024 * 1024) {
        if (onUploadLargeMedia) {
          onUploadLargeMedia();
        } else {
          alert("Размер файла превышает 20 МБ. Используйте загрузку через Telegram-бота.");
        }
        return;
      }
      setIsUploading(true);
      onUploadMedia(mediaFile).finally(() => setIsUploading(false));
    }
  };

  const keepEditorSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const execFormat = (type: "bold" | "italic" | "strikeThrough" | "underline" | "spoiler" | "code" | "pre" | "blockquote") => {
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }

    if (type === "bold" || type === "italic" || type === "strikeThrough" || type === "underline") {
      document.execCommand(type, false);
      handleInput();
      updateActiveFormats();
      editorRef.current?.focus();
      return;
    }

    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;

    if (sel.rangeCount === 0 || !editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const range = sel.getRangeAt(0);

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
          updateActiveFormats();
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
      updateActiveFormats();
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
    let foundAnchor: HTMLAnchorElement | null = null;

    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      text = range.toString();

      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLAnchorElement) {
          foundAnchor = node;
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

    editingAnchorRef.current = foundAnchor;
    setLinkText(text);
    setLinkUrl(url);
    setIsEditingExistingLink(isExisting);
    setIsLinkModalOpen(true);

    setTimeout(() => {
      if (!text) {
        linkTextInputRef.current?.focus();
      } else {
        linkUrlInputRef.current?.focus();
        linkUrlInputRef.current?.select();
      }
    }, 60);
  };

  const handleApplyLink = () => {
    let url = linkUrl.trim();
    if (!url) return;

    if (!/^(https?:\/\/|tg:\/\/)/i.test(url)) {
      url = "https://" + url;
    }

    const textToDisplay = linkText.trim() || url;

    // Focus editor first so DOM/Range operations apply to the editor
    if (editorRef.current) {
      editorRef.current.focus();
    }

    // Direct anchor update if we targeted an existing element
    const anchor = editingAnchorRef.current;
    if (anchor && editorRef.current?.contains(anchor)) {
      anchor.setAttribute("href", url);
      anchor.textContent = textToDisplay;
      handleInput();
      setIsLinkModalOpen(false);
      editingAnchorRef.current = null;
      editorRef.current?.focus();
      return;
    }

    // Restore saved selection
    const sel = window.getSelection();
    if (savedRangeRef.current && sel && editorRef.current) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } catch {
        // Fallback handled below
      }
    } else if (sel && editorRef.current && (!sel.rangeCount || !editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer))) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Check if restored selection is inside an anchor
    let existingAnchor: HTMLAnchorElement | null = null;
    const currentSel = window.getSelection();
    if (currentSel && currentSel.rangeCount > 0 && editorRef.current?.contains(currentSel.getRangeAt(0).commonAncestorContainer)) {
      let node: Node | null = currentSel.getRangeAt(0).commonAncestorContainer;
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
    editingAnchorRef.current = null;
    editorRef.current?.focus();
  };

  const handleRemoveLink = () => {
    if (editorRef.current) {
      editorRef.current.focus();
    }

    const anchor = editingAnchorRef.current;
    if (anchor && editorRef.current?.contains(anchor)) {
      const parent = anchor.parentNode;
      if (parent) {
        while (anchor.firstChild) {
          parent.insertBefore(anchor.firstChild, anchor);
        }
        parent.removeChild(anchor);
        handleInput();
      }
      setIsLinkModalOpen(false);
      editingAnchorRef.current = null;
      editorRef.current?.focus();
      return;
    }

    const sel = window.getSelection();
    if (savedRangeRef.current && sel && editorRef.current) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } catch {
        // Selection restoration failed, proceed with fallback
      }
    }

    const currentSel = window.getSelection();
    if (currentSel && currentSel.rangeCount > 0 && editorRef.current?.contains(currentSel.getRangeAt(0).commonAncestorContainer)) {
      let node: Node | null = currentSel.getRangeAt(0).commonAncestorContainer;
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
    editingAnchorRef.current = null;
    editorRef.current?.focus();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest("a");
    if (anchor && editorRef.current?.contains(anchor)) {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      savedRangeRef.current = range;
      editingAnchorRef.current = anchor as HTMLAnchorElement;
      setLinkText(anchor.textContent || "");
      setLinkUrl(anchor.getAttribute("href") || "");
      setIsEditingExistingLink(true);
      setIsLinkModalOpen(true);
    }
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
  const isEmpty = !value || charCount === 0;

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

  const allAssets: NodeMediaAsset[] =
    mediaAssets.length > 0
      ? mediaAssets
      : (mediaAssetId || mediaFileId)
      ? [
          {
            mediaFileId: mediaFileId || "",
            mediaAssetId: mediaAssetId || "",
            mediaType: (mediaType || "photo") as "photo" | "video" | "document",
          },
        ]
      : [];

  const getFormatBtnClass = (isActive: boolean) =>
    `flex size-7 items-center justify-center rounded-md transition-all ${
      isActive
        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-semibold shadow-xs"
        : "text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
    }`;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--color-surface)] shadow-2xs transition-all ${
        isDraggingOver
          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]"
          : isOverLimit
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
      {!attachment && (onUploadMedia || onUploadLargeMedia) && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <ul className="flex flex-wrap items-center gap-2">
            <AnimatePresence mode="popLayout">
              {allAssets.map((asset, idx) => (
                <motion.li
                  key={asset.mediaAssetId || `asset-${idx}`}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="relative flex size-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shrink-0"
                >
                  {botId && asset.mediaAssetId ? (
                    <SyncedMediaPreview
                      botId={botId}
                      assetId={asset.mediaAssetId}
                      mediaType={asset.mediaType === "document" ? "photo" : asset.mediaType}
                      compact
                    />
                  ) : asset.mediaType === "document" ? (
                    <FileText size={20} className="text-[var(--color-primary)]" />
                  ) : (
                    <ImageIcon size={18} className="text-[var(--color-foreground-tertiary)]" />
                  )}
                  {onRemoveMedia && (
                    <button
                      type="button"
                      onMouseDown={keepEditorSelection}
                      onClick={() => onRemoveMedia(asset.mediaAssetId)}
                      aria-label="Убрать медиа"
                      title="Удалить этот файл"
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 shadow-xs cursor-pointer z-10"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>

            {allAssets.length < 10 && onUploadMedia && (
              <li>
                <button
                  type="button"
                  onMouseDown={keepEditorSelection}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Добавить фото или видео (до 20 МБ)"
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
                  <span className="text-[10px] font-semibold">{isUploading ? "…" : "+ фото"}</span>
                </button>
              </li>
            )}

            {allAssets.length < 10 && onUploadLargeMedia && (
              <li>
                <button
                  type="button"
                  onMouseDown={keepEditorSelection}
                  onClick={onUploadLargeMedia}
                  title="Загрузить большое видео или медиа через Telegram-бота (до 2 ГБ)"
                  aria-label="Загрузить большое видео через бота"
                  className="flex h-16 px-2.5 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/20 text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary-soft)]/40 hover:border-[var(--color-primary)]"
                >
                  <div className="flex items-center gap-1">
                    <Send size={13} className="rotate-45" />
                    <span className="text-[10px] font-bold tracking-tight">Большое видео</span>
                  </div>
                  <span className="text-[9px] opacity-75 font-medium">в боте до 2 ГБ</span>
                </button>
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-[11px] text-[var(--color-foreground-tertiary)]">
            {mediaHint ||
              (allAssets.length > 0
                ? "Медиа над текстом · до 10 файлов · обычные до 20 МБ, большие через Telegram"
                : "Фото или видео над текстом · обычные до 20 МБ, большие через Telegram")}
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
        onClick={handleEditorClick}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onSelect={updateActiveFormats}
        onFocus={(event) => {
          keepMobileFieldVisible(event.currentTarget);
          updateActiveFormats();
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
        data-empty={isEmpty ? "true" : undefined}
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
            className={getFormatBtnClass(activeFormats.bold)}
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
            className={getFormatBtnClass(activeFormats.italic)}
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
            className={getFormatBtnClass(activeFormats.strikeThrough)}
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
            className={getFormatBtnClass(activeFormats.underline)}
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
            className={getFormatBtnClass(activeFormats.spoiler)}
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
            className={getFormatBtnClass(activeFormats.code)}
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
            className={getFormatBtnClass(activeFormats.pre)}
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
            className={getFormatBtnClass(activeFormats.blockquote)}
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
            className={getFormatBtnClass(activeFormats.link)}
            title="Добавить ссылку (Ctrl+K)"
            aria-label="Добавить ссылку"
          >
            <Link2 size={13} />
          </button>
        </div>

        {/* Правая часть: аксессуар (если передан) */}
        {toolbarAccessory && (
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {toolbarAccessory}
          </div>
        )}
      </div>

      {/* ── Кастомная модалка добавления / редактирования ссылки через Portal ── */}
      {isLinkModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsLinkModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
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
                  ref={linkTextInputRef}
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!linkUrl.trim() && linkUrlInputRef.current) {
                        linkUrlInputRef.current.focus();
                      } else {
                        handleApplyLink();
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIsLinkModalOpen(false);
                    }
                  }}
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
                  className="text-xs font-medium text-[var(--color-danger)] hover:underline"
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
        </div>,
        document.body
      )}
    </div>
  );
};
