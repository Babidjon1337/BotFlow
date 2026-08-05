import { useState, useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Image as ImageIcon,
  ShieldAlert,
  Bold,
  Italic,
  Strikethrough,
  Link2,
  Power,
  Settings,
  Clock,
  CreditCard,
  Receipt,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageCircle,
  RefreshCw,
  Bot,
  FileText,
} from "lucide-react";
import { EmptyBotState } from "../EmptyBotState";
import { FunnelCard } from "../FunnelCard";
import { PaymentBlockEditor } from "../PaymentBlockEditor";
import { TimerPresets } from "../TimerPresets";
import { InfoTooltip } from "../InfoTooltip";
import { useAppState } from "../../providers/AppStateProvider";
import { useBotToggle } from "../../hooks/useBotToggle";
import { useAlert } from "../AlertProvider";
import type { Tariff } from "../../types";
// --- Button Input with Telegram Limit Validator ---
const ButtonInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => {
  const inputId = useId();
  const len = (value || "").length;
  const isOverRecommended = len > 30;
  const isOverLimit = len > 64;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-label">{label}</label>
        <span
          className={`text-[11px] font-semibold ${
            isOverLimit
              ? "text-[var(--color-danger)] font-bold"
              : isOverRecommended
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-foreground-tertiary)]"
          }`}
        >
          {len} / 64 {isOverRecommended && !isOverLimit && "(длинно для ТГ)"}
        </span>
      </div>
      <input
        id={inputId}
        value={value || ""}
        maxLength={64}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          if (window.innerWidth <= 768) {
            setTimeout(() => {
              e.target.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 300);
          }
        }}
        placeholder={placeholder}
        className={`input w-full ${isOverLimit ? "border-[var(--color-danger)]" : isOverRecommended ? "border-[var(--color-warning)]" : ""}`}
      />
      <p className="text-[11px] text-[var(--color-foreground-tertiary)] leading-tight">
        {isOverLimit
          ? "❌ Ошибка: Telegram не допускает кнопки длиннее 64 символов!"
          : isOverRecommended
          ? "⚠️ Рекомендуем до 30 символов, иначе надпись может не поместиться на экране телефона."
          : "Надпись на кнопке в Telegram"}
      </p>
    </div>
  );
};

const SyncedMediaPreview = ({
  botId,
  assetId,
  mediaType,
}: {
  botId: string;
  assetId: string;
  mediaType: "photo" | "video";
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void import("../../services/api")
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

  if (previewError) {
    return <p className="text-[11px] text-[var(--color-danger)]">Не удалось загрузить предпросмотр. Файл остаётся привязан к сообщению.</p>;
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

// --- Rich Text Editor with Telegram Limits & Media ---
export const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  hasMedia = false,
  botId,
  mediaFileId,
  mediaAssetId,
  mediaType,
  onUploadMedia,
  onRemoveMedia,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hasMedia?: boolean;
  botId?: string;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaType?: "photo" | "video" | "document" | null;
  onUploadMedia?: (file: File) => Promise<void>;
  onRemoveMedia?: () => void;
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorId = useId();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (
      editorRef.current &&
      value !== editorRef.current.innerHTML &&
      document.activeElement !== editorRef.current
    ) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    handleInput();
    editorRef.current?.focus();
  };

  const keepEditorSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const plainText = value ? value.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim() : "";
  const charCount = plainText.length;
  const maxChars = hasMedia ? 1024 : 4096;
  const isOverLimit = charCount > maxChars;

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

  return (
    <div className={`flex flex-col overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--color-surface)] shadow-2xs transition-colors ${isOverLimit ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus-within:border-[var(--color-primary)]"}`}>
      {/* Toolbar */}
      <div className="order-2 flex items-center justify-between gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5">
        <div className="flex items-center gap-0.5" role="toolbar" aria-label="Форматирование текста">
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execCmd("bold")}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
            title="Жирный"
            aria-label="Жирный"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execCmd("italic")}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
            title="Курсив"
            aria-label="Курсив"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => execCmd("strikeThrough")}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
            title="Зачёркнутый"
            aria-label="Зачёркнутый"
          >
            <Strikethrough size={13} />
          </button>
          {/* Divider */}
          <div className="w-px h-4 bg-[var(--color-border)] mx-1 shrink-0" />
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => {
              const url = prompt("Введите URL:");
              if (url) execCmd("createLink", url);
            }}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
            title="Добавить ссылку"
            aria-label="Добавить ссылку"
          >
            <Link2 size={13} />
          </button>
        </div>

        {/* Media Toggle Button */}
        {onUploadMedia && !hasMedia && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all ${
              hasMedia
                ? "bg-[var(--color-primary)] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] border border-[var(--color-border)] hover:border-[var(--color-primary)]"
            }`}
            title="Прикрепить фото или видео к сообщению в Telegram"
            aria-label="Добавить фото, видео или документ"
          >
            <ImageIcon size={13} />
            <span>{isUploading ? "Загружаем…" : hasMedia ? "Заменить фото/видео" : "Добавить фото/видео"}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* Media Uploader Preview Area */}
      <AnimatePresence>
        {hasMedia && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="order-1 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 flex flex-col gap-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--color-foreground)]">
                <ImageIcon size={14} className="text-[var(--color-primary)]" />
                <span>Прикрепленный медиафайл</span>
              </div>
              <button
                type="button"
                onClick={onRemoveMedia}
                className="text-[11px] font-semibold text-[var(--color-danger)] hover:underline"
              >
                Удалить медиа
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-[12px]">
                <ImageIcon size={16} className="shrink-0 text-[var(--color-primary)]" />
                <span className="truncate font-semibold text-[var(--color-foreground)]">
                  {isUploading
                    ? "Загружаем и синхронизируем с Telegram…"
                    : mediaFileId
                      ? "Файл синхронизирован с Telegram"
                      : "Подготавливаем файл…"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="shrink-0 text-[12px] font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-60"
              >
                Заменить
              </button>
            </div>
            {mediaType === "document" ? (
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-foreground-secondary)]">
                <FileText size={16} /> Документ синхронизирован с Telegram
              </div>
            ) : botId && mediaAssetId && mediaType ? (
              <SyncedMediaPreview botId={botId} assetId={mediaAssetId} mediaType={mediaType} />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editable Area */}
      <div
        id={editorId}
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Текст сообщения"}
        onInput={handleInput}
        onBlur={handleInput}
        className="order-3 p-3 min-h-[96px] max-h-[360px] overflow-y-auto outline-none text-[14px] rich-text-editor"
        style={{
          color: "var(--color-foreground)",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          width: "100%",
          boxSizing: "border-box"
        }}
        data-placeholder={placeholder}
      />

      {/* Telegram Character Counter & Validator Footer */}
      <div className={`order-4 flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border)] text-[11px] transition-colors ${isOverLimit ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-bold" : "bg-[var(--color-surface-2)] text-[var(--color-foreground-secondary)]"}`}>
        <div className="flex items-center gap-1">
          <span>{isOverLimit ? "⚠️ Превышен лимит Telegram!" : "Лимит символов Telegram:"}</span>
          <span className="opacity-80">({hasMedia ? "с медиа — макс. 1024" : "текстовое — макс. 4096"})</span>
        </div>
        <div className={isOverLimit ? "font-extrabold text-[12px]" : "font-semibold"}>
          {charCount} / {maxChars}
        </div>
      </div>
    </div>
  );
};
// --- End Editor ---

const MessageBubble = ({
  text,
  button,
  button2,
  media,
  theme,
  onButtonClick,
}: {
  text?: string;
  button?: string;
  button2?: string;
  media?: boolean;
  theme: "light" | "dark";
  onButtonClick?: (btnIndex: 1 | 2) => void;
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "85%",
    }}
  >
    <div
      style={{
        background: theme === "dark" ? "#27272a" : "#ffffff",
        color: "var(--color-foreground)",
        padding: media ? "4px" : "10px 14px",
        borderRadius: "16px",
        borderBottomLeftRadius: "4px",
        fontSize: "14px",
        lineHeight: 1.4,
        boxShadow:
          theme === "dark"
            ? "0 1px 2px rgba(0,0,0,0.3)"
            : "0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)",
      }}
    >
      {media && (
        <div
          style={{
            background: "var(--color-surface-2)",
            borderRadius: "12px",
            height: "140px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: text ? "8px" : "0",
            color: "var(--color-foreground-tertiary)",
          }}
        >
          <ImageIcon size={24} style={{ marginBottom: "8px" }} />
          <span
            style={{ fontSize: "11px", textAlign: "center", padding: "0 10px" }}
          >
            Тут находится ваше фото или видео
          </span>
        </div>
      )}
      {text && (
        <div
          style={{
            padding: media ? "0 8px 8px 8px" : "0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: text.replace(/<[^>]*>?/gm, "") }}
        />
      )}
    </div>
    {button && (
      <div
        onClick={() => onButtonClick?.(1)}
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "var(--color-primary)",
          padding: "10px",
          borderRadius: "12px",
          fontSize: "14px",
          fontWeight: 600,
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          cursor: onButtonClick ? "pointer" : "default",
          userSelect: "none",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
        className="hover:bg-white/20 active:scale-[0.98] transition-all"
      >
        {button}
      </div>
    )}
    {button2 && (
      <div
        onClick={() => onButtonClick?.(2)}
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "var(--color-primary)",
          padding: "10px",
          borderRadius: "12px",
          fontSize: "14px",
          fontWeight: 600,
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          cursor: onButtonClick ? "pointer" : "default",
          userSelect: "none",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
        className="hover:bg-white/20 active:scale-[0.98] transition-all"
      >
        {button2}
      </div>
    )}
  </div>
);

export const Build = () => {
  const {
    appState,
    blocks,
    setSelectedBlockId,
    updateBlock,
    theme,
    setSheet,
    handleCreateBotClick: onCreateBot,
    setToastMessage,
    setAppState,
    getFunnelRevision,
    getFunnelWorkspaceGeneration,
  } = useAppState();

  const onOpenSettings = () => setSheet("bot_settings");

  const getBlock = (id: string) => blocks.find((b) => b.id === id);

  // Interactive Preview state
  const [previewScreen, setPreviewScreen] = useState<
    "start" | "push1" | "push2" | "tariffs" | "invoice" | "manager"
  >("start");
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showAlert } = useAlert();
  const { toggleBot, isToggling } = useBotToggle();

  const handleMediaUpload = async (nodeId: string, file: File) => {
    if (!appState.activeBot) return;
    const uploadBotId = appState.activeBot.id;
    const workspaceGeneration = getFunnelWorkspaceGeneration();
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Размер файла не должен превышать 20 МБ.");
    }
    try {
      const { apiService } = await import("../../services/api");
      const media = await apiService.uploadBotMedia(uploadBotId, nodeId, file);
      if (getFunnelWorkspaceGeneration() !== workspaceGeneration) {
        setToastMessage("Файл загружен для исходного бота. Откройте его воронку, чтобы увидеть результат.");
        return;
      }
      updateBlock(nodeId, "media", true);
      updateBlock(nodeId, "mediaFileId", media.fileId);
      updateBlock(nodeId, "mediaAssetId", media.id);
      updateBlock(nodeId, "mediaType", media.mediaType);
      setToastMessage("Файл синхронизирован с Telegram");
    } catch (error) {
      showAlert({
        title: "Не удалось загрузить файл",
        message: error instanceof Error ? error.message : "Повторите попытку.",
        type: "danger",
        confirmText: "Понятно",
        cancelText: "",
      });
      throw error;
    }
  };

  const removeMedia = (nodeId: string) => {
    updateBlock(nodeId, "media", false);
    updateBlock(nodeId, "mediaFileId", null);
    updateBlock(nodeId, "mediaAssetId", null);
    updateBlock(nodeId, "mediaType", null);
  };

  const handleSave = async () => {
    if (!appState.activeBot) return;
    const activeBotId = appState.activeBot.id;
    const revisionAtSave = getFunnelRevision();
    setIsSaving(true);
    try {
      const { apiService } = await import("../../services/api");
      const savedFunnel = await apiService.saveFunnel(activeBotId, blocks, isAllBlocksComplete);
      setIsSaving(false);
      setAppState((prev) => ({
        ...prev,
        isDirty: prev.activeBot?.id === activeBotId && getFunnelRevision() === revisionAtSave
          ? false
          : prev.isDirty,
        bots: prev.bots.map(bot => bot.id === activeBotId ? {
          ...bot,
          funnelComplete: savedFunnel.funnelComplete,
          status: savedFunnel.botStatus === "active" ? "active" : "inactive",
        } : bot),
        activeBot: prev.activeBot?.id === activeBotId
          ? {
            ...prev.activeBot,
            funnelComplete: savedFunnel.funnelComplete,
            status: savedFunnel.botStatus === "active" ? "active" : "inactive",
          }
          : prev.activeBot,
      }));
      setToastMessage(savedFunnel.stopped
        ? "Воронка сохранена: бот остановлен до завершения настройки"
        : savedFunnel.funnelComplete
          ? "Воронка сохранена"
          : `Воронка сохранена: ${savedFunnel.readinessReasons[0] || 'завершите настройку перед запуском'}`);
    } catch (error) {
      setIsSaving(false);
      showAlert({
        title: "Не удалось сохранить воронку",
        message: error instanceof Error ? error.message : "Проверьте подключение к интернету и попробуйте ещё раз.",
        type: "danger",
        confirmText: "Понятно",
        cancelText: "",
      });
    }
  };

  const paymentBlock = getBlock("payment");
  const paymentMode = paymentBlock?.paymentMode || "auto";

  const isStartComplete = !!(
    getBlock("start")
      ?.content?.replace(/<[^>]*>/g, "")
      .trim() &&
    getBlock("start")?.buttonText?.trim() &&
    (paymentMode === "hybrid" ? !!getBlock("start")?.buttonText2?.trim() : true)
  );
  const isPush1Complete = !!(
    getBlock("push1")
      ?.content?.replace(/<[^>]*>/g, "")
      .trim() &&
    getBlock("push1")?.buttonText?.trim() &&
    (paymentMode === "hybrid" ? !!getBlock("push1")?.buttonText2?.trim() : true)
  );
  const isPush2Complete = !!(
    getBlock("push2")
      ?.content?.replace(/<[^>]*>/g, "")
      .trim() &&
    getBlock("push2")?.buttonText?.trim() &&
    (paymentMode === "hybrid" ? !!getBlock("push2")?.buttonText2?.trim() : true)
  );
  const isPaymentComplete = !!(
    paymentBlock?.tariffs?.length &&
    paymentBlock.tariffs.every((t) =>
      !!(t.name?.trim()) &&
      Number(t.price) > 0 &&
      !!(t.description?.trim()) &&
      (t.hasDelivery === false || paymentMode === "application"
        ? true
        : !!t.actionData?.trim()),
    ) &&
    (paymentMode === "application" || paymentMode === "hybrid"
      ? !!paymentBlock?.managerText?.trim() && !!paymentBlock?.managerUrl?.trim()
      : true) &&
    (paymentBlock.tariffs.length > 1
      ? !!paymentBlock?.tariffSelectionText?.trim()
      : true)
  );

  const isAllBlocksComplete =
    isStartComplete && isPush1Complete && isPush2Complete && isPaymentComplete;

  const funnelSteps = [
    { label: "Старт", complete: isStartComplete },
    { label: "Дожим 1", complete: isPush1Complete },
    { label: "Дожим 2", complete: isPush2Complete },
    { label: "Оплата и выдача", complete: isPaymentComplete },
  ];
  const incompleteSteps = funnelSteps.filter((step) => !step.complete);
  const completedStepsCount = funnelSteps.length - incompleteSteps.length;
  const modeOutcome = paymentMode === "application"
    ? "Клиент напишет менеджеру, а вы выставите счёт вручную."
    : paymentMode === "hybrid"
      ? "Клиент сможет оплатить сразу или написать менеджеру."
      : "Клиент выберет тариф, оплатит онлайн и получит доступ автоматически.";

  const handlePreviewButtonClick = (btnIndex: 1 | 2) => {
    if (btnIndex === 2 || paymentMode === "application") {
      setPreviewScreen("manager");
    } else {
      const tariffs = paymentBlock?.tariffs || [];
      if (tariffs.length === 1) {
        setSelectedTariff(tariffs[0]);
        setPreviewScreen("invoice");
      } else if (tariffs.length > 1) {
        setPreviewScreen("tariffs");
      }
    }
  };

  if (!appState.activeBot) {
    return (
      <EmptyBotState
        onCreateBot={onCreateBot}
        title="Воронка недоступна"
        description="Чтобы настроить структуру воронки, необходимо подключить Telegram-бота."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <style>{`
        .action-bar-fixed {
          bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
        }
        @media (min-width: 1024px) {
          .action-bar-fixed { bottom: 24px; }
        }
      `}</style>

      {/* Bot Header (Settings Access) */}
      {appState.activeBot.mediaSyncDone && (
      <div
        className="flex items-center justify-between gap-3 p-4 md:px-5 md:py-4 mb-6 md:mb-8 border rounded-[20px] md:rounded-[24px] shadow-sm relative overflow-hidden"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3 md:gap-[14px] flex-1 min-w-0">
          <div
            className="w-10 h-10 md:w-[44px] md:h-[44px] rounded-[14px] md:rounded-[16px] shrink-0"
            style={{
              background: "var(--color-primary-soft)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "18px",
            }}
          >
            {appState.activeBot.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{
                fontWeight: 700,
                color: "var(--color-foreground)",
                fontSize: "15px",
                letterSpacing: "-0.01em",
              }}
            >
              {appState.activeBot.name}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-0.5">
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-foreground-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background:
                      appState.activeBot.status === "active"
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                    boxShadow:
                      appState.activeBot.status === "active"
                        ? "0 0 8px var(--color-success-soft)"
                        : "0 0 8px var(--color-warning-soft)",
                  }}
                />
                {appState.activeBot.status === "active"
                  ? "Бот работает"
                  : "Черновик"}
              </div>
              {!appState.activeBot.paymentProvider && (
                <div
                  className="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                  title="Платежная система не подключена"
                >
                  Нет кассы
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <button
            className="w-10 h-10 md:w-11 md:h-11 rounded-[10px] md:rounded-[12px] flex items-center justify-center border transition-colors hover:bg-[var(--color-surface-2)]"
            onClick={onOpenSettings}
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-foreground-secondary)",
            }}
            title="Настройки бота"
            aria-label="Открыть настройки бота"
          >
            <Settings
              size={18}
              className="w-[16px] h-[16px] md:w-[18px] md:h-[18px]"
            />
          </button>

          <button
            onClick={() => toggleBot(appState.activeBot!)}
            disabled={isToggling[appState.activeBot.id]}
            className="w-10 h-10 md:w-11 md:h-11 rounded-[10px] md:rounded-[12px] flex items-center justify-center border transition-colors"
            style={{
              borderColor:
                appState.activeBot.status === "active"
                  ? "var(--color-success-soft)"
                  : "var(--color-border)",
              color:
                appState.activeBot.status === "active"
                  ? "var(--color-success)"
                  : "var(--color-foreground-tertiary)",
              background:
                appState.activeBot.status === "active"
                  ? "var(--color-success-soft)"
                  : "transparent",
              opacity: isToggling[appState.activeBot.id] ? 0.5 : 1,
            }}
            title={
              appState.activeBot.status === "active"
                ? "Остановить"
                : "Запустить"
            }
            aria-label={
              appState.activeBot.status === "active"
                ? "Остановить бота"
                : "Запустить бота"
            }
            aria-busy={isToggling[appState.activeBot.id] || undefined}
          >
            {isToggling[appState.activeBot.id] ? (
              <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Power
                size={18}
                className="w-[16px] h-[16px] md:w-[18px] md:h-[18px]"
              />
            )}
          </button>
        </div>
      </div>
      )}

      <motion.div
        key="build"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={!appState.activeBot.mediaSyncDone ? "flex-1 flex flex-col justify-center items-center h-[calc(100vh-160px)] w-full" : "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"}
      >
        {!appState.activeBot.mediaSyncDone ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-8 md:p-12 text-center shadow-[var(--shadow-card)] flex flex-col items-center max-w-2xl w-full mx-auto my-auto mt-12 lg:mt-0">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center mb-6">
              <RefreshCw size={32} className="animate-spin" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[var(--color-foreground)] mb-4">
              Остался один шаг!
            </h2>
            <p className="text-[15px] md:text-[16px] text-[var(--color-foreground-secondary)] leading-relaxed mb-8 max-w-[400px]">
              Чтобы получить доступ к настройке воронки, необходимо инициализировать бота. Нажмите кнопку ниже, чтобы перейти в бота, и нажмите <b>START</b>.
            </p>
            <button 
              onClick={() => {
                const tg = (window as Window & { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
                const botUrl = appState.activeBot!.botUrl || `https://t.me/${appState.activeBot!.username}`;
                if (tg && tg.openTelegramLink) {
                  tg.openTelegramLink(`${botUrl}?start=sync`);
                } else {
                  window.open(`${botUrl}?start=sync`, '_blank');
                }
              }}
              className="btn btn-primary min-h-11 px-6 text-[15px] flex items-center gap-2"
            >
              <Bot size={18} /> Открыть бота в Telegram
            </button>
          </div>
        ) : (
          <>
        {/* Left: funnel steps */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxWidth: "none",
            margin: "0",
            width: "100%",
          }}
        >
          <div
            data-tour="tour-funnel-steps"
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <section
              aria-live="polite"
              className={`rounded-[var(--radius-lg)] border p-4 ${
                isAllBlocksComplete
                  ? "border-[var(--color-success-soft)] bg-[var(--color-success-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isAllBlocksComplete ? (
                    <CheckCircle2 size={18} className="shrink-0 text-[var(--color-success)]" />
                  ) : (
                    <ShieldAlert size={18} className="shrink-0 text-[var(--color-warning)]" />
                  )}
                  <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">
                    Готовность воронки
                  </h3>
                </div>
                <span className="text-[13px] font-semibold text-[var(--color-foreground-secondary)]">
                  {completedStepsCount} из {funnelSteps.length} шагов
                </span>
              </div>

              {isAllBlocksComplete ? (
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
                  Все обязательные шаги заполнены. Воронку можно сохранить и запустить.
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
                    Заполните: {incompleteSteps.map((step) => step.label).join(", ")}.
                  </p>
                  {appState.activeBot.status === "active" && (
                    <p className="text-[12px] leading-relaxed text-[var(--color-warning)]">
                      Если сохранить неполную воронку, бот остановится до завершения настройки.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Global Mode Switcher */}
            <div className="p-4 rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm mb-2 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <h4 className="text-[15px] font-bold text-[var(--color-foreground)]">
                    Режим работы воронки
                  </h4>
                  <InfoTooltip
                    side="right"
                    title="Логика работы воронки"
                    text={
                      <>
                        <strong>Автопродажа:</strong> Клиент выбирает тариф в боте и оплачивает онлайн. Доступ выдается автоматически.<br />
                        <strong>По заявкам:</strong> Кнопка ведет в ЛС к администратору с готовым текстом. Выставляете счет вручную.<br />
                        <strong>Гибрид:</strong> В сообщениях показываются сразу две кнопки — для онлайн-оплаты и для связи с менеджером.
                      </>
                    }
                  />
                </div>
              </div>
              <p className="text-[12px] text-[var(--color-foreground-secondary)] mt-1">
                Определяет глобальное действие при нажатии целевых кнопок клиентом
              </p>
              <div className="flex bg-[var(--color-surface-2)] p-1 rounded-xl gap-1" role="radiogroup" aria-label="Режим работы воронки">
                <button
                  type="button"
                  onClick={() => updateBlock("payment", "paymentMode", "auto")}
                  role="radio"
                  aria-checked={paymentMode === "auto"}
                  className={`flex-1 py-2 px-2 text-[12px] md:text-[13px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${paymentMode === "auto" ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] inline-block shrink-0" />
                  <span>Автопродажа</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateBlock("payment", "paymentMode", "application")}
                  role="radio"
                  aria-checked={paymentMode === "application"}
                  className={`flex-1 py-2 px-2 text-[12px] md:text-[13px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${paymentMode === "application" ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block shrink-0" />
                  <span>По заявкам</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateBlock("payment", "paymentMode", "hybrid")}
                  role="radio"
                  aria-checked={paymentMode === "hybrid"}
                  className={`flex-1 py-2 px-2 text-[12px] md:text-[13px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${paymentMode === "hybrid" ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7] inline-block shrink-0" />
                  <span>Гибрид</span>
                </button>
              </div>

              <p className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">
                {modeOutcome}
              </p>

              <AnimatePresence>
                {(paymentMode === "application" || paymentMode === "hybrid") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-2 border-t border-[var(--color-border)] mt-1"
                  >
                    <div className="flex items-center mb-1.5">
                      <label htmlFor="manager-url" className="text-[13px] font-semibold text-[var(--color-foreground)]">
                        Ссылка на Telegram менеджера
                      </label>
                      <InfoTooltip
                        title="Куда перейдёт клиент"
                        text="Укажите публичный @username или ссылку вида https://t.me/username. Клиент перейдёт в личный чат, а текст ниже Telegram подставит в поле ввода."
                      />
                    </div>
                    <input
                      id="manager-url"
                      type="text"
                      className="input w-full text-[13px] h-9 bg-[var(--color-surface-2)] border-[var(--color-border)] focus:border-[var(--color-primary)] font-medium"
                      value={paymentBlock?.managerUrl || ""}
                      placeholder="@manager или https://t.me/manager"
                      onChange={(e) => updateBlock("payment", "managerUrl", e.target.value)}
                      onFocus={(e) => {
                        if (window.innerWidth <= 768) { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }
                      }}
                    />
                    <label htmlFor="manager-text" className="text-[13px] font-semibold text-[var(--color-foreground)] block mt-3 mb-1.5">
                      Текст для связи
                    </label>
                    <input
                      id="manager-text"
                      type="text"
                      className="input w-full text-[13px] h-9 bg-[var(--color-surface-2)] border-[var(--color-border)] focus:border-[var(--color-primary)] font-medium"
                      value={paymentBlock?.managerText || ""}
                      placeholder="Хочу узнать подробнее / записаться..."
                      onChange={(e) => updateBlock("payment", "managerText", e.target.value)}
                      onFocus={(e) => {
                        if (window.innerWidth <= 768) { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }
                      }}
                    />
                    <div className="text-[11px] text-[var(--color-foreground-tertiary)] mt-1">
                      Telegram подставит этот текст в поле ввода клиента. Сообщение отправится менеджеру только после нажатия «Отправить» самим клиентом.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <FunnelCard
              stepId="start"
              title="Шаг 1 · Старт (Гайд / Презентация)"
              isComplete={isStartComplete}
              defaultExpanded
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div onClick={() => setSelectedBlockId("start")}>
                  <label
                    className="text-label"
                    style={{ display: "block", marginBottom: "8px" }}
                  >
                    Текст сообщения
                  </label>
                  <RichTextEditor
                    value={getBlock("start")?.content || ""}
                    onChange={(v) => updateBlock("start", "content", v)}
                    placeholder="Первое сообщение бота..."
                    hasMedia={!!getBlock("start")?.media}
                    botId={appState.activeBot.id}
                    mediaFileId={getBlock("start")?.mediaFileId}
                    mediaAssetId={getBlock("start")?.mediaAssetId}
                    mediaType={getBlock("start")?.mediaType}
                    onUploadMedia={(file) => handleMediaUpload("start", file)}
                    onRemoveMedia={() => removeMedia("start")}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ButtonInput
                    label={paymentMode === "hybrid" ? "Кнопка 1 (Покупка)" : "Текст кнопки"}
                    value={getBlock("start")?.buttonText || ""}
                    onChange={(v) => updateBlock("start", "buttonText", v)}
                    placeholder={paymentMode === "hybrid" ? "💰 Купить сейчас" : "🚀 Начать"}
                  />
                  {paymentMode === "hybrid" && (
                    <ButtonInput
                      label="Кнопка 2 (Консультация)"
                      value={getBlock("start")?.buttonText2 || ""}
                      onChange={(v) => updateBlock("start", "buttonText2", v)}
                      placeholder="📞 Записаться"
                    />
                  )}
                </div>
              </div>
            </FunnelCard>

            <div className="flex items-center justify-center my-0.5 py-1 relative">
              <div className="absolute w-[2px] h-full bg-[var(--color-border)] left-1/2 -translate-x-1/2" />
              <div className="relative z-10 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-foreground-secondary)] flex items-center gap-1.5 shadow-sm">
                <Clock size={12} className="text-[var(--color-primary)]" />
                <span>Через {getBlock("push1")?.delay || "1ч"}</span>
              </div>
            </div>

            <FunnelCard
              stepId="push1"
              title="Шаг 2 · Дожим 1"
              isComplete={isPush1Complete}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <TimerPresets
                  value={getBlock("push1")?.delay || "1ч"}
                  onChange={(val) => updateBlock("push1", "delay", val)}
                  presets={["1ч", "6ч", "12ч", "24ч", "48ч"]}
                />
                <div onClick={() => setSelectedBlockId("push1")}>
                  <label
                    className="text-label"
                    style={{ display: "block", marginBottom: "8px" }}
                  >
                    Текст дожима
                  </label>
                  <RichTextEditor
                    value={getBlock("push1")?.content || ""}
                    onChange={(v) => updateBlock("push1", "content", v)}
                    placeholder="Напоминание пользователю..."
                    hasMedia={!!getBlock("push1")?.media}
                    botId={appState.activeBot.id}
                    mediaFileId={getBlock("push1")?.mediaFileId}
                    mediaAssetId={getBlock("push1")?.mediaAssetId}
                    mediaType={getBlock("push1")?.mediaType}
                    onUploadMedia={(file) => handleMediaUpload("push1", file)}
                    onRemoveMedia={() => removeMedia("push1")}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ButtonInput
                    label={paymentMode === "hybrid" ? "Кнопка 1 (Покупка)" : "Текст кнопки"}
                    value={getBlock("push1")?.buttonText || ""}
                    onChange={(v) => updateBlock("push1", "buttonText", v)}
                    placeholder={paymentMode === "hybrid" ? "💰 Купить сейчас" : "➡️ Перейти"}
                  />
                  {paymentMode === "hybrid" && (
                    <ButtonInput
                      label="Кнопка 2 (Консультация)"
                      value={getBlock("push1")?.buttonText2 || ""}
                      onChange={(v) => updateBlock("push1", "buttonText2", v)}
                      placeholder="📞 Записаться"
                    />
                  )}
                </div>
              </div>
            </FunnelCard>

            <div className="flex items-center justify-center my-0.5 py-1 relative">
              <div className="absolute w-[2px] h-full bg-[var(--color-border)] left-1/2 -translate-x-1/2" />
              <div className="relative z-10 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-foreground-secondary)] flex items-center gap-1.5 shadow-sm">
                <Clock size={12} className="text-[var(--color-primary)]" />
                <span>Через {getBlock("push2")?.delay || "24ч"}</span>
              </div>
            </div>

            <FunnelCard
              stepId="push2"
              title="Шаг 3 · Дожим 2"
              isComplete={isPush2Complete}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <TimerPresets
                  value={getBlock("push2")?.delay || "24ч"}
                  onChange={(val) => updateBlock("push2", "delay", val)}
                  presets={["1ч", "6ч", "12ч", "24ч", "48ч"]}
                />
                <div onClick={() => setSelectedBlockId("push2")}>
                  <label
                    className="text-label"
                    style={{ display: "block", marginBottom: "8px" }}
                  >
                    Текст дожима
                  </label>
                  <RichTextEditor
                    value={getBlock("push2")?.content || ""}
                    onChange={(v) => updateBlock("push2", "content", v)}
                    placeholder="Последний шанс..."
                    hasMedia={!!getBlock("push2")?.media}
                    botId={appState.activeBot.id}
                    mediaFileId={getBlock("push2")?.mediaFileId}
                    mediaAssetId={getBlock("push2")?.mediaAssetId}
                    mediaType={getBlock("push2")?.mediaType}
                    onUploadMedia={(file) => handleMediaUpload("push2", file)}
                    onRemoveMedia={() => removeMedia("push2")}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ButtonInput
                    label={paymentMode === "hybrid" ? "Кнопка 1 (Покупка)" : "Текст кнопки"}
                    value={getBlock("push2")?.buttonText || ""}
                    onChange={(v) => updateBlock("push2", "buttonText", v)}
                    placeholder={paymentMode === "hybrid" ? "💰 Купить сейчас" : "🎁 Забрать скидку"}
                  />
                  {paymentMode === "hybrid" && (
                    <ButtonInput
                      label="Кнопка 2 (Консультация)"
                      value={getBlock("push2")?.buttonText2 || ""}
                      onChange={(v) => updateBlock("push2", "buttonText2", v)}
                      placeholder="📞 Записаться"
                    />
                  )}
                </div>
              </div>
            </FunnelCard>

            <div className="flex items-center justify-center my-0.5 py-1 relative">
              <div className="absolute w-[2px] h-full bg-[var(--color-border)] left-1/2 -translate-x-1/2" />
              <div className="relative z-10 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-foreground-secondary)] flex items-center gap-1.5 shadow-sm">
                <CreditCard size={12} className="text-[var(--color-primary)]" />
                <span>Переход к оплате / выдаче</span>
              </div>
            </div>

            <FunnelCard
              stepId="payment"
              title="Шаг 4 · Оплата и Выдача доступа"
              isComplete={isPaymentComplete}
            >
              <div onClick={() => setSelectedBlockId("payment")}>
                <PaymentBlockEditor
                  node={getBlock("payment")}
                  botId={appState.activeBot.id}
                  onChange={(field, value) =>
                    updateBlock("payment", field, value)
                  }
                />
              </div>
            </FunnelCard>
          </div>
        </div>

        {/* Right: Live Preview / Interactive Emulator (desktop only) */}
        <div className="hidden lg:block" data-tour="tour-preview">
          <div style={{ position: "sticky", top: "72px" }}>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: "12px", paddingLeft: "4px" }}
            >
              <span className="text-hint">Интерактивный эмулятор</span>
              <button
                onClick={() => {
                  setPreviewScreen("start");
                  setSelectedTariff(null);
                }}
                className="btn btn-ghost flex items-center gap-1"
                style={{
                  height: "28px",
                  padding: "0 8px",
                  fontSize: "12px",
                  color: "var(--color-primary)",
                }}
              >
                <RotateCcw size={13} />
                <span>Сбросить</span>
              </button>
            </div>

            {/* Phone Mockup */}
            <div
              style={{ position: "relative", width: "320px", margin: "0 auto" }}
            >
              {/* Glowing backdrop */}
              <div
                style={{
                  position: "absolute",
                  inset: -20,
                  background: "var(--color-primary)",
                  filter: "blur(60px)",
                  opacity: 0.15,
                  borderRadius: "50%",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  width: "320px",
                  height: "640px",
                  background: theme === "dark" ? "#0f0f0f" : "#e4eaf0",
                  backgroundImage:
                    theme === "dark"
                      ? "radial-gradient(circle at 50% 0%, #1a1a24 0%, #0f0f0f 100%)"
                      : "radial-gradient(circle at 50% 0%, #f0f4f8 0%, #e4eaf0 100%)",
                  borderRadius: "44px",
                  border: `8px solid ${theme === "dark" ? "#18181b" : "#ffffff"}`,
                  boxShadow:
                    theme === "dark"
                      ? "0 25px 50px -12px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.05)"
                      : "0 25px 50px -12px rgba(0,0,0,0.15), inset 0 2px 4px rgba(0,0,0,0.05)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {/* Hardware Notch */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "120px",
                    height: "24px",
                    background: theme === "dark" ? "#18181b" : "#ffffff",
                    borderBottomLeftRadius: "16px",
                    borderBottomRightRadius: "16px",
                    zIndex: 20,
                  }}
                />

                {/* Header */}
                <div
                  style={{
                    background:
                      theme === "dark"
                        ? "rgba(24,24,27,0.85)"
                        : "rgba(255,255,255,0.85)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    padding: "24px 16px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    borderBottom: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    {appState.activeBot.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-foreground)",
                        lineHeight: 1.2,
                      }}
                    >
                      {appState.activeBot.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-foreground-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      bot
                    </div>
                  </div>
                </div>

                {/* Chat Area / Validation Guard */}
                {!isAllBlocksComplete ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--color-warning-soft)] text-[var(--color-warning)] flex items-center justify-center mb-3 shadow-sm">
                      <ShieldAlert size={24} />
                    </div>
                    <div className="text-[15px] font-bold text-[var(--color-foreground)] mb-1">
                      Завершите настройку
                    </div>
                    <p className="text-[12px] text-[var(--color-foreground-secondary)] leading-relaxed max-w-[230px] mb-4">
                      Осталось заполнить несколько полей слева (цены, тексты и т.д.), чтобы воронка заработала.
                    </p>
                    <div className="flex flex-col gap-2 text-left w-full max-w-[210px] bg-[var(--color-surface-2)] p-3.5 rounded-xl border border-[var(--color-border)] text-[11px]">
                      <div className="flex items-center gap-2">
                        {isStartComplete ? <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" /> : <XCircle size={15} className="text-[var(--color-warning)] shrink-0" />}
                        <span className={isStartComplete ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-warning)] font-semibold"}>
                          Шаг 1: Старт
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPush1Complete ? <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" /> : <XCircle size={15} className="text-[var(--color-warning)] shrink-0" />}
                        <span className={isPush1Complete ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-warning)] font-semibold"}>
                          Шаг 2: Дожим 1
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPush2Complete ? <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" /> : <XCircle size={15} className="text-[var(--color-warning)] shrink-0" />}
                        <span className={isPush2Complete ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-warning)] font-semibold"}>
                          Шаг 3: Дожим 2
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPaymentComplete ? <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" /> : <XCircle size={15} className="text-[var(--color-warning)] shrink-0" />}
                        <span className={isPaymentComplete ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-warning)] font-semibold"}>
                          Шаг 4: Оплата / Тарифы
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      overflowY: "auto",
                      zIndex: 10,
                    }}
                  >
                    {/* Step Switcher Pills inside Emulator */}
                    <div className="flex bg-[var(--color-surface-2)] p-1 rounded-xl shrink-0 gap-1 text-[11px] border border-[var(--color-border)]">
                      <button
                        onClick={() => setPreviewScreen("start")}
                        className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${previewScreen === "start" ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                      >
                        <MessageSquare size={12} />
                        <span>Старт</span>
                      </button>
                      <button
                        onClick={() => setPreviewScreen("push1")}
                        className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${previewScreen === "push1" ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                      >
                        <Clock size={12} />
                        <span>Дожим 1</span>
                      </button>
                      <button
                        onClick={() => setPreviewScreen("push2")}
                        className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${previewScreen === "push2" ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                      >
                        <Clock size={12} />
                        <span>Дожим 2</span>
                      </button>
                    </div>

                    <AnimatePresence mode="popLayout">
                      {/* Screen: Start */}
                      {previewScreen === "start" && (
                        <motion.div
                          key="start"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <MessageBubble
                            text={getBlock("start")?.content}
                            button={getBlock("start")?.buttonText}
                            button2={
                              paymentMode === "hybrid"
                                ? getBlock("start")?.buttonText2
                                : undefined
                            }
                            media={getBlock("start")?.media}
                            theme={theme}
                            onButtonClick={handlePreviewButtonClick}
                          />
                        </motion.div>
                      )}

                      {/* Screen: Push 1 */}
                      {previewScreen === "push1" && (
                        <motion.div
                          key="push1"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div className="self-center text-[11px] font-semibold text-[var(--color-foreground-secondary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                            <Clock size={11} className="text-[var(--color-primary)]" />
                            <span>Через {getBlock("push1")?.delay || "1ч"} (если не купил)</span>
                          </div>
                          <MessageBubble
                            text={getBlock("push1")?.content}
                            button={getBlock("push1")?.buttonText}
                            button2={
                              paymentMode === "hybrid"
                                ? getBlock("push1")?.buttonText2
                                : undefined
                            }
                            media={getBlock("push1")?.media}
                            theme={theme}
                            onButtonClick={handlePreviewButtonClick}
                          />
                        </motion.div>
                      )}

                      {/* Screen: Push 2 */}
                      {previewScreen === "push2" && (
                        <motion.div
                          key="push2"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div className="self-center text-[11px] font-semibold text-[var(--color-foreground-secondary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                            <Clock size={11} className="text-[var(--color-primary)]" />
                            <span>Через {getBlock("push2")?.delay || "24ч"} (если не купил)</span>
                          </div>
                          <MessageBubble
                            text={getBlock("push2")?.content}
                            button={getBlock("push2")?.buttonText}
                            button2={
                              paymentMode === "hybrid"
                                ? getBlock("push2")?.buttonText2
                                : undefined
                            }
                            media={getBlock("push2")?.media}
                            theme={theme}
                            onButtonClick={handlePreviewButtonClick}
                          />
                        </motion.div>
                      )}

                      {/* Screen: Tariffs Selection */}
                      {previewScreen === "tariffs" && (
                        <motion.div
                          key="tariffs"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              background:
                                theme === "dark" ? "#27272a" : "#ffffff",
                              color: "var(--color-foreground)",
                              padding: "10px 14px",
                              borderRadius: "16px",
                              borderBottomLeftRadius: "4px",
                              fontSize: "13px",
                              lineHeight: 1.4,
                              boxShadow:
                                theme === "dark"
                                  ? "0 1px 2px rgba(0,0,0,0.3)"
                                  : "0 1px 2px rgba(0,0,0,0.05)",
                            }}
                          >
                            {paymentBlock?.tariffSelectionText ||
                              "Выберите подходящий тариф:"}
                          </div>

                          <div className="flex flex-col gap-2 mt-1">
                            {(paymentBlock?.tariffs || []).map((t, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setSelectedTariff(t);
                                  setPreviewScreen("invoice");
                                }}
                                className="w-full py-2.5 px-3 rounded-xl font-semibold text-[13px] transition-all bg-[var(--color-primary)] text-white shadow-sm hover:opacity-90 active:scale-[0.98] flex items-center justify-between"
                              >
                                <span className="truncate">
                                  {t.name || `Тариф ${idx + 1}`}
                                </span>
                                <span className="shrink-0 font-bold ml-2">
                                  {t.price} ₽
                                </span>
                              </button>
                            ))}
                            <button
                              onClick={() => setPreviewScreen("start")}
                              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-semibold text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-border)]"
                            >
                              <ArrowLeft size={14} />
                              <span>Назад</span>
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Screen: Invoice */}
                      {previewScreen === "invoice" && (
                        <motion.div
                          key="invoice"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              background:
                                theme === "dark" ? "#27272a" : "#ffffff",
                              color: "var(--color-foreground)",
                              padding: "12px 14px",
                              borderRadius: "16px",
                              borderBottomLeftRadius: "4px",
                              fontSize: "13px",
                              lineHeight: 1.4,
                              boxShadow:
                                theme === "dark"
                                  ? "0 1px 2px rgba(0,0,0,0.3)"
                                  : "0 1px 2px rgba(0,0,0,0.05)",
                            }}
                          >
                            <div className="font-bold text-[14px] mb-1.5 flex items-center gap-1.5 text-[var(--color-foreground)]">
                              <Receipt size={16} className="text-[var(--color-primary)]" />
                              <span>Счёт на оплату</span>
                            </div>
                            <div className="font-semibold text-[var(--color-primary)] mb-2">
                              {selectedTariff?.name || "Тариф"}
                            </div>
                            {selectedTariff?.description && (
                              <div className="text-[12px] text-[var(--color-foreground-secondary)] mb-3 pb-2 border-b border-[var(--color-border)]">
                                {selectedTariff.description}
                              </div>
                            )}
                            <div className="flex justify-between items-center font-bold text-[14px] mt-1">
                              <span>К оплате:</span>
                              <span>{selectedTariff?.price || 0} ₽</span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 mt-1">
                            <button
                              onClick={() => {
                                showAlert({
                                  title: "🎉 Эмуляция оплаты",
                                  message: `Оплата на сумму ${selectedTariff?.price || 0} ₽ успешно смоделирована! В реальном боте пользователю будет автоматически выдан доступ.`,
                                  type: "info",
                                  confirmText: "Отлично",
                                  cancelText: "",
                                });
                              }}
                              className="w-full py-2.5 px-3 rounded-xl font-bold text-[13px] transition-all bg-[var(--color-success)] text-white shadow-sm hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-1.5"
                            >
                              <CreditCard size={15} />
                              <span>Оплатить {selectedTariff?.price || 0} ₽</span>
                            </button>
                            <button
                              onClick={() => {
                                if ((paymentBlock?.tariffs || []).length > 1) {
                                  setPreviewScreen("tariffs");
                                } else {
                                  setPreviewScreen("start");
                                }
                              }}
                              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-semibold text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-border)]"
                            >
                              <ArrowLeft size={14} />
                              <span>Назад</span>
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Screen: Manager Redirect */}
                      {previewScreen === "manager" && (
                        <motion.div
                          key="manager"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              background:
                                theme === "dark" ? "#27272a" : "#ffffff",
                              color: "var(--color-foreground)",
                              padding: "12px 14px",
                              borderRadius: "16px",
                              borderBottomLeftRadius: "4px",
                              fontSize: "13px",
                              lineHeight: 1.4,
                              boxShadow:
                                theme === "dark"
                                  ? "0 1px 2px rgba(0,0,0,0.3)"
                                  : "0 1px 2px rgba(0,0,0,0.05)",
                            }}
                          >
                            <div className="font-bold text-[14px] mb-1.5 flex items-center gap-1.5 text-[var(--color-primary)]">
                              <MessageCircle size={16} />
                              <span>Переход к менеджеру</span>
                            </div>
                            <p className="text-[12px] text-[var(--color-foreground-secondary)] mb-2">
                              В Telegram откроется чат с
                              администратором/менеджером, с предзаполненным
                              текстом:
                            </p>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[12px] italic text-[var(--color-foreground)]">
                              «
                              {paymentBlock?.managerText ||
                                "Здравствуйте! Хочу узнать подробнее."}
                              »
                            </div>
                          </div>

                          <button
                            onClick={() => setPreviewScreen("start")}
                            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-semibold text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-border)]"
                          >
                            <ArrowLeft size={14} />
                            <span>Вернуться в бота</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
        )}

      </motion.div>

      {/* Floating Save Action Bar (appears only when dirty) */}
      <AnimatePresence>
        {appState.isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 mx-auto w-[calc(100%-32px)]  max-w-[400px] z-[99] action-bar-fixed pointer-events-none"
          >
            <div
              className="pointer-events-auto flex items-center justify-between gap-2 rounded-[var(--radius-lg)] p-2 shadow-[var(--shadow-float)]"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex min-w-0 items-center gap-2 px-2">
                <span className="size-2 shrink-0 rounded-full bg-[var(--color-warning)]" aria-hidden="true" />
                <span className="truncate text-[13px] font-medium text-[var(--color-foreground)]" aria-live="polite">
                  Есть несохранённые изменения
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary min-h-10 shrink-0 px-4 text-[13px]"
                onClick={() => {
                  const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
                  tg?.HapticFeedback?.impactOccurred("medium");
                  handleSave();
                }}
                disabled={isSaving}
                aria-busy={isSaving || undefined}
              >
                {isSaving ? (
                  <RotateCcw size={14} className="animate-spin" />
                ) : (
                  "Сохранить"
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer to prevent content from hiding behind the fixed action bar if it's shown */}
      {appState.isDirty && <div style={{ height: "90px" }} />}
      <div className="h-[90px] w-full shrink-0" />
    </div>
  );
};
