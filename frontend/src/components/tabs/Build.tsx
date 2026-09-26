import { useState, useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  ShieldAlert,
  Power,
  Clock,
  CreditCard,
  Receipt,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageCircle,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { EmptyBotState } from "../EmptyBotState";
import type { NodeMediaAsset, FunnelNode } from "../../types";
import { FunnelCard } from "../FunnelCard";
import { TelegramTextEditor, SyncedMediaPreview } from "../TelegramTextEditor";
import { PaymentBlockEditor } from "../PaymentBlockEditor";
import { TimerPresets } from "../TimerPresets";

import { useAppState } from "../../providers/AppStateProvider";
import { useBotToggle } from "../../hooks/useBotToggle";
import { useAlert } from "../AlertProvider";
import { eventStream } from "../../services/eventStream";
import type { Tariff } from "../../types";

const keepMobileFieldVisible = (element: HTMLElement) => {
  if (window.innerWidth >= 1024) return;
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
        onFocus={(e) => keepMobileFieldVisible(e.currentTarget)}
        placeholder={placeholder}
        className={`input w-full ${isOverLimit ? "border-[var(--color-danger)]" : isOverRecommended ? "border-[var(--color-warning)]" : ""}`}
      />
      <p className="text-[11px] text-[var(--color-foreground-tertiary)] leading-tight flex items-start gap-1">
        {isOverLimit ? (
          <><XCircle size={11} className="shrink-0 mt-0.5 text-[var(--color-danger)]" /><span className="text-[var(--color-danger)] font-semibold">Telegram не допускает кнопки длиннее 64 символов</span></>
        ) : isOverRecommended ? (
          <><AlertTriangle size={11} className="shrink-0 mt-0.5 text-[var(--color-warning)]" /><span className="text-[var(--color-warning)]">Рекомендуем до 30 символов, иначе надпись может не поместиться на экране телефона</span></>
        ) : (
          <span>Надпись на кнопке в Telegram</span>
        )}
      </p>
    </div>
  );
};

export { SyncedMediaPreview };
export const RichTextEditor = TelegramTextEditor;


const MessageBubble = ({
  text,
  button,
  button2,
  mediaAssetId,
  mediaType,
  mediaAssets = [],
  botId,
  theme,
  onButtonClick,
}: {
  text?: string;
  button?: string;
  button2?: string;
  mediaAssetId?: string | null;
  mediaType?: "photo" | "video" | "document" | null;
  mediaAssets?: NodeMediaAsset[];
  botId?: string;
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
        padding: mediaAssetId || mediaAssets.length ? "4px" : "10px 14px",
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
      {/* Медиа-группа: 2+ сетки подряд */}
      {mediaAssets.length > 1 && botId && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: text ? "8px" : "0" }}>
          {mediaAssets.map((asset) => (
            asset.mediaType !== "document" ? (
              <div key={asset.mediaAssetId} style={{ overflow: "hidden", borderRadius: "10px" }}>
                <SyncedMediaPreview
                  botId={botId}
                  assetId={asset.mediaAssetId}
                  mediaType={asset.mediaType}
                  compact={false}
                />
              </div>
            ) : null
          ))}
        </div>
      )}
      {mediaAssetId && botId && (mediaType === "photo" || mediaType === "video") && mediaAssets.length <= 1 && (
        <div style={{ marginBottom: text ? "8px" : "0", overflow: "hidden", borderRadius: "12px" }}>
          <SyncedMediaPreview
            botId={botId}
            assetId={mediaAssetId}
            mediaType={mediaType}
            compact={false}
          />
        </div>
      )}
      {text && (
        <div
          style={{
            padding: mediaAssetId ? "0 8px 8px 8px" : "0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          className="tg-message-text"
          dangerouslySetInnerHTML={{ __html: text }}
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

interface BuildProps {
  onNavigateToCreateTariff?: () => void;
}

export const Build = ({ onNavigateToCreateTariff }: BuildProps = {}) => {
  const {
    appState,
    blocks,
    selectedBlockId,
    setSelectedBlockId,
    updateBlock,
    updateBlockFields,
    theme,
    handleCreateBotClick: onCreateBot,
    setToastMessage,
    setToastType,
    setAppState,
    getFunnelRevision,
    getFunnelWorkspaceGeneration,
    replaceFunnelWorkspace,
    markFunnelSaved,
  } = useAppState();

  const getBlock = (id: string) => blocks.find((b) => b.id === id);

  // Interactive Preview state
  const [previewScreen, setPreviewScreen] = useState<string>("start");
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showAlert, showConfirm } = useAlert();
  const activeUploadSessionCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (activeUploadSessionCleanupRef.current) {
        activeUploadSessionCleanupRef.current();
        activeUploadSessionCleanupRef.current = null;
      }
    };
  }, [appState.activeBot?.id]);

  // Auto-sync emulator: when selectedBlockId changes, switch preview screen
  useEffect(() => {
    const blockToScreen: Record<string, "start" | "push1" | "push2" | "tariffs"> = {
      start: "start",
      push1: "push1",
      push2: "push2",
      payment: "tariffs",
    };
    const nextScreen = selectedBlockId && blockToScreen[selectedBlockId];
    if (!nextScreen) return;
    const timer = window.setTimeout(() => setPreviewScreen(nextScreen), 0);
    return () => window.clearTimeout(timer);
  }, [selectedBlockId]);
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
        setToastType("success");
        setToastMessage("Файл загружен для исходного бота. Откройте его воронку, чтобы увидеть результат.");
        return;
      }

      const node = getBlock(nodeId);
      const existingAssets: NodeMediaAsset[] = Array.isArray(node?.mediaAssets) && node.mediaAssets.length > 0
        ? [...node.mediaAssets]
        : (node?.mediaAssetId && node?.mediaFileId)
        ? [{ mediaAssetId: node.mediaAssetId, mediaFileId: node.mediaFileId, mediaType: node.mediaType === 'video' || node.mediaType === 'document' ? node.mediaType : 'photo' }]
        : [];

      const newAssets = media.mediaAssets && media.mediaAssets.length > 0
        ? media.mediaAssets
        : [...existingAssets.filter(a => a.mediaAssetId !== media.id), { mediaFileId: media.fileId, mediaAssetId: media.id, mediaType: media.mediaType }].slice(-10);

      updateBlockFields(nodeId, {
        media: true,
        mediaFileId: newAssets[0].mediaFileId,
        mediaAssetId: newAssets[0].mediaAssetId,
        mediaType: newAssets[0].mediaType,
        mediaAssets: newAssets,
      });

      setToastType("success");
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

  const removeMedia = (nodeId: string, assetIdToRemove?: string) => {
    const node = getBlock(nodeId);
    const existingAssets: NodeMediaAsset[] = Array.isArray(node?.mediaAssets) && node.mediaAssets.length > 0
      ? [...node.mediaAssets]
      : (node?.mediaAssetId && node?.mediaFileId)
      ? [{ mediaAssetId: node.mediaAssetId, mediaFileId: node.mediaFileId, mediaType: node.mediaType === 'video' || node.mediaType === 'document' ? node.mediaType : 'photo' }]
      : [];

    if (assetIdToRemove && existingAssets.length > 0) {
      const remaining = existingAssets.filter((a) => a.mediaAssetId !== assetIdToRemove);
      if (remaining.length > 0) {
        updateBlockFields(nodeId, {
          media: true,
          mediaFileId: remaining[0].mediaFileId,
          mediaAssetId: remaining[0].mediaAssetId,
          mediaType: remaining[0].mediaType,
          mediaAssets: remaining,
        });
        return;
      }
    }
    updateBlockFields(nodeId, {
      media: false,
      mediaFileId: null,
      mediaAssetId: null,
      mediaType: null,
      mediaAssets: [],
    });
  };

  const handleOpenLargeMediaUpload = async (nodeId: string) => {
    if (!appState.activeBot) return;

    // Clean up any previously active polling session
    if (activeUploadSessionCleanupRef.current) {
      activeUploadSessionCleanupRef.current();
      activeUploadSessionCleanupRef.current = null;
    }

    try {
      const { apiService } = await import("../../services/api");
      const session = await apiService.createMediaUploadSession(appState.activeBot.id, nodeId);

      const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(session.deepLink);
      } else {
        window.open(session.deepLink, "_blank");
      }

      setToastType("success");
      setToastMessage("Открываем Telegram для загрузки большого видео…");

      let isCancelled = false;
      let nextTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let unsubCompleted: (() => void) | null = null;
      let unsubCancelled: (() => void) | null = null;

      const applyAssets = (assets: Array<{ mediaAssetId: string; mediaFileId: string; mediaType: 'photo' | 'video' | 'document' }>) => {
        const node = getBlock(nodeId);
        const currentAssets: NodeMediaAsset[] = Array.isArray(node?.mediaAssets) && node.mediaAssets.length > 0
          ? [...node.mediaAssets]
          : (node?.mediaAssetId && node?.mediaFileId)
          ? [{ mediaAssetId: node.mediaAssetId, mediaFileId: node.mediaFileId, mediaType: node.mediaType === 'video' || node.mediaType === 'document' ? node.mediaType : 'photo' }]
          : [];
        const existingIds = new Set(currentAssets.map((a) => a.mediaAssetId));
        const newItems = assets.filter((a) => !existingIds.has(a.mediaAssetId));
        if (newItems.length > 0) {
          const merged = [...currentAssets, ...newItems].slice(-10);
          updateBlockFields(nodeId, {
            media: true,
            mediaFileId: merged[0].mediaFileId,
            mediaAssetId: merged[0].mediaAssetId,
            mediaType: merged[0].mediaType,
            mediaAssets: merged,
          });
          setToastType("success");
          setToastMessage("Медиа получено из Telegram!");
        }
      };

      const cleanup = () => {
        isCancelled = true;
        if (nextTimeoutId) {
          clearTimeout(nextTimeoutId);
          nextTimeoutId = null;
        }
        if (unsubCompleted) {
          unsubCompleted();
          unsubCompleted = null;
        }
        if (unsubCancelled) {
          unsubCancelled();
          unsubCancelled = null;
        }
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
      activeUploadSessionCleanupRef.current = cleanup;

      // 1. Primary: Subscribe to SSE events for real-time delivery
      unsubCompleted = eventStream.subscribe<{
        botId: number;
        sessionId: string;
        nodeId: string;
        mediaAssets: Array<{ mediaAssetId: string; mediaFileId: string; mediaType: 'photo' | 'video' | 'document' }>;
      }>("media:upload_completed", (data) => {
        if (isCancelled || !data) return;
        if (data.sessionId === session.sessionId || data.nodeId === nodeId) {
          if (data.mediaAssets && data.mediaAssets.length > 0) {
            applyAssets(data.mediaAssets);
          }
          cleanup();
        }
      });

      unsubCancelled = eventStream.subscribe<{
        botId: number;
        sessionId: string;
        nodeId: string;
      }>("media:upload_cancelled", (data) => {
        if (isCancelled || !data) return;
        if (data.sessionId === session.sessionId || data.nodeId === nodeId) {
          cleanup();
        }
      });

      // 2. Check session status once
      const checkSessionOnce = async (): Promise<boolean> => {
        if (isCancelled || !appState.activeBot) return true;
        try {
          const res = await apiService.getMediaUploadSession(appState.activeBot.id, session.sessionId);
          if (isCancelled) return true;

          if (res.mediaAssets && res.mediaAssets.length > 0) {
            applyAssets(res.mediaAssets as Array<{ mediaAssetId: string; mediaFileId: string; mediaType: 'photo' | 'video' | 'document' }>);
            cleanup();
            return true;
          }

          if (res.isCompleted || res.isCancelled) {
            cleanup();
            return true;
          }
        } catch {
          cleanup();
          return true;
        }
        return false;
      };

      // 3. Fallback: progressive polling backoff [2500, 4000, 7000, 10000, 15000, 20000]
      // Only acts as a safety fallback if SSE is delayed or reconnecting.
      const fallbackDelays = [2500, 4000, 7000, 10000, 15000, 20000];
      let fallbackIndex = 0;

      const scheduleNextFallbackPoll = () => {
        if (isCancelled || fallbackIndex >= fallbackDelays.length) return;
        const delay = fallbackDelays[fallbackIndex++];
        nextTimeoutId = setTimeout(async () => {
          if (isCancelled) return;
          const finished = await checkSessionOnce();
          if (!finished && !isCancelled) {
            scheduleNextFallbackPoll();
          }
        }, delay);
      };

      scheduleNextFallbackPoll();

      // 4. Fallback on visibility change: when user returns to Mini App, check immediately
      const handleVisibilityChange = () => {
        if (isCancelled) return;
        if (!document.hidden) {
          if (nextTimeoutId) {
            clearTimeout(nextTimeoutId);
          }
          nextTimeoutId = setTimeout(() => {
            void checkSessionOnce();
          }, 500);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
    } catch (err) {
      showAlert({
        title: "Не удалось открыть Telegram",
        message: err instanceof Error ? err.message : "Повторите попытку.",
        type: "danger",
        confirmText: "Понятно",
        cancelText: "",
      });
    }
  };

  const handleLargeFileDetected = (nodeId: string, file?: File) => {
    if (file) {
      const sizeMb = Math.round(file.size / (1024 * 1024));
      showConfirm({
        title: "Видео весит слишком много",
        message: `Файл (${sizeMb} МБ) превышает лимит браузера (20 МБ).\nОтправьте его напрямую в Telegram-бота — он примет большое видео до 2 ГБ и сохранит для этого блока.`,
        confirmText: "Открыть бота",
        cancelText: "Отмена",
        onConfirm: () => handleOpenLargeMediaUpload(nodeId),
      });
    } else {
      handleOpenLargeMediaUpload(nodeId);
    }
  };

  const handleReorderMedia = (nodeId: string, newAssets: NodeMediaAsset[]) => {
    if (newAssets.length === 0) return;
    updateBlockFields(nodeId, {
      media: true,
      mediaFileId: newAssets[0].mediaFileId,
      mediaAssetId: newAssets[0].mediaAssetId,
      mediaType: newAssets[0].mediaType,
      mediaAssets: newAssets,
    });
  };

  const handleTariffMediaUpload = async (tariffId: string, file: File) => {
    if (!appState.activeBot) return;
    if (file.size > 20 * 1024 * 1024) throw new Error("Размер файла не должен превышать 20 МБ.");
    try {
      const { apiService } = await import("../../services/api");
      const media = await apiService.uploadBotMedia(appState.activeBot.id, `payment:tariff:${tariffId}`, file);
      const tariffs = (getBlock("payment")?.tariffs || []).map((tariff) => tariff.id === tariffId
        ? { ...tariff, mediaFileId: media.fileId, mediaAssetId: media.id, mediaType: media.mediaType as "photo" | "video" }
        : tariff);
      updateBlock("payment", "tariffs", tariffs);
      setToastType("success");
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

  const removeTariffMedia = (tariffId: string) => {
    const tariffs = (getBlock("payment")?.tariffs || []).map((tariff) => tariff.id === tariffId
      ? { ...tariff, mediaFileId: null, mediaAssetId: null, mediaType: null }
      : tariff);
    updateBlock("payment", "tariffs", tariffs);
  };

  const handleSave = async () => {
    if (!appState.activeBot) return;
    const activeBotId = appState.activeBot.id;
    const revisionAtSave = getFunnelRevision();
    setIsSaving(true);
    try {
      const { apiService } = await import("../../services/api");
      const savedFunnel = await apiService.saveFunnel(activeBotId, blocks, isAllBlocksComplete);
      markFunnelSaved(revisionAtSave);
      setIsSaving(false);
      setAppState((prev) => ({
        ...prev,
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
      
      if (savedFunnel.stopped) {
        setToastType("error");
        setToastMessage("Бот остановлен: воронка не заполнена");
      } else {
        setToastType("success");
        setToastMessage("Воронка сохранена");
      }
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

  const checkHasContent = (content?: unknown) => {
    if (!content || typeof content !== 'string') return false;
    const plainText = content.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim();
    return plainText.length > 0;
  };

  const isStartComplete = !!(
    checkHasContent(getBlock("start")?.content) &&
    getBlock("start")?.buttonText?.trim() &&
    (paymentMode === "hybrid" ? !!getBlock("start")?.buttonText2?.trim() : true)
  );

  const reminderBlocks = blocks.filter((b) => b.kind === "reminder");

  const isReminderComplete = (block: FunnelNode) => !!(
    checkHasContent(block.content) &&
    block.buttonText?.trim() &&
    (paymentMode === "hybrid" ? !!block.buttonText2?.trim() : true)
  );

  const isPaymentComplete = !!(
    paymentBlock?.tariffs?.length &&
    paymentBlock.tariffs.every((t) =>
      !!(t.name?.trim()) &&
      !isNaN(Number(t.price)) &&
      Number(t.price) >= 0 &&
      !!(t.description?.trim()) &&
      (t.hasDelivery === false || paymentMode === "application"
        ? true
        : !!t.actionData?.trim() || (Array.isArray(t.deliverables) && t.deliverables.length > 0)),
    ) &&
    (paymentMode === "application" || paymentMode === "hybrid"
      ? !!paymentBlock?.managerText?.trim() && !!paymentBlock?.managerUrl?.trim()
      : true) &&
    (paymentBlock.tariffs.length > 1
      ? !!paymentBlock?.tariffSelectionText?.trim()
      : true)
  );

  const isAllBlocksComplete =
    isStartComplete && reminderBlocks.every(isReminderComplete) && isPaymentComplete;

  const funnelSteps = [
    { id: "start", label: "Старт", complete: isStartComplete },
    ...reminderBlocks.map((b, idx) => ({
      id: b.id,
      label: b.step || `Дожим ${idx + 1}`,
      complete: isReminderComplete(b),
    })),
    { id: "payment", label: "Оплата и выдача", complete: isPaymentComplete },
  ];
  const incompleteSteps = funnelSteps.filter((step) => !step.complete);
  const completedStepsCount = funnelSteps.length - incompleteSteps.length;

  const handleAddDozhim = () => {
    if (reminderBlocks.length >= 5) {
      showAlert({
        title: "Лимит дожимов",
        message: "В воронку можно добавить не более 5 дожимов.",
      });
      return;
    }
    const newIndex = reminderBlocks.length + 1;
    const newId = `push${Date.now()}`;
    const newDozhim: FunnelNode = {
      id: newId,
      step: `Дожим ${newIndex}`,
      subtitle: `Через ${newIndex === 1 ? "1ч" : `${newIndex * 12}ч`}`,
      delay: newIndex === 1 ? "1ч" : "24ч",
      kind: "reminder",
      content: "",
      buttonText: "Перейти",
      x: 250,
      y: 200 + newIndex * 150,
    };
    const paymentIdx = blocks.findIndex((b) => b.id === "payment");
    const nextBlocks =
      paymentIdx !== -1
        ? [...blocks.slice(0, paymentIdx), newDozhim, ...blocks.slice(paymentIdx)]
        : [...blocks, newDozhim];
    replaceFunnelWorkspace(nextBlocks);
    setSelectedBlockId(newId);
    setPreviewScreen(newId);
  };

  const handleDeleteDozhim = (dozhimId: string) => {
    const target = blocks.find((b) => b.id === dozhimId);
    const title = target?.step || "дожим";
    showConfirm({
      title: `Удалить «${title}»?`,
      message: "Этот шаг дожима будет удален из сценария воронки.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      onConfirm: () => {
        const remainingReminders = blocks.filter(
          (b) => b.kind === "reminder" && b.id !== dozhimId
        );
        const nextBlocks = blocks
          .filter((b) => b.id !== dozhimId)
          .map((b) => {
            if (b.kind === "reminder") {
              const idx = remainingReminders.findIndex((r) => r.id === b.id) + 1;
              return { ...b, step: `Дожим ${idx}` };
            }
            return b;
          });
        replaceFunnelWorkspace(nextBlocks);
        if (selectedBlockId === dozhimId) {
          setSelectedBlockId("start");
        }
        if (previewScreen === dozhimId) {
          setPreviewScreen("start");
        }
      },
    });
  };


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
    <div className="relative flex min-h-0 flex-col overflow-x-hidden pb-[calc(72px+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <style>{`
        .action-bar-fixed {
          bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
        }
        @media (min-width: 1024px) {
          .action-bar-fixed { bottom: 24px; }
        }
      `}</style>

      {/* Compact Scenario Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker text-cyan">Сценарий</span>
            <span className="text-fg-tertiary">·</span>
            <h1 className="text-body-lg font-bold text-foreground sm:text-title">Воронка продаж</h1>
            {/* Progress indicator (2/4) - always visible */}
            <div
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-colors ${
                isAllBlocksComplete
                  ? "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
              <span>
                {isAllBlocksComplete
                  ? `${completedStepsCount}/${funnelSteps.length} готово`
                  : `${completedStepsCount}/${funnelSteps.length} заполнено`}
              </span>
            </div>
          </div>
          <p className="mt-0.5 hidden text-meta text-fg-secondary sm:block">
            Последовательность: старт → дожимы → продажа
          </p>
        </div>

        {/* Header Actions: Save Status + Bot Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Always visible Save Indicator (Saved / Saving / Unsaved) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-2)] border border-border text-[12px] font-medium text-[var(--color-foreground)]">
            {isSaving ? (
              <>
                <RotateCcw size={13} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
                <span className="text-[var(--color-primary)] font-semibold">Сохранение…</span>
              </>
            ) : appState.isDirty ? (
              <button
                type="button"
                onClick={() => {
                  const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
                  tg?.HapticFeedback?.impactOccurred("medium");
                  handleSave();
                }}
                className="flex items-center gap-1.5 text-[var(--color-warning)] font-semibold hover:underline"
                title="Нажмите, чтобы сохранить изменения"
              >
                <span className="size-2 rounded-full bg-[var(--color-warning)] animate-pulse" aria-hidden="true" />
                <span>Не сохранено</span>
                <span className="rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-warning)] ml-0.5">Сохранить</span>
              </button>
            ) : (
              <>
                <CheckCircle2 size={13} className="text-[var(--color-success)]" aria-hidden="true" />
                <span className="text-[var(--color-foreground-secondary)]">Сохранено</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggleBot(appState.activeBot!)}
            disabled={isToggling[appState.activeBot.id]}
            className="size-9 rounded-lg flex items-center justify-center border transition-colors"
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
            title={appState.activeBot.status === "active" ? "Остановить бота" : "Запустить бота"}
            aria-label={appState.activeBot.status === "active" ? "Остановить бота" : "Запустить бота"}
            aria-busy={isToggling[appState.activeBot.id] || undefined}
          >
            {isToggling[appState.activeBot.id] ? (
              <div className="animate-spin size-3.5 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Power size={16} />
            )}
          </button>
        </div>
      </div>

      <motion.div
        key="build"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
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
            <FunnelCard
              stepId="start"
              title="Старт"
              isComplete={isStartComplete}
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
                    mediaAssets={getBlock("start")?.mediaAssets ?? []}
                    onUploadMedia={(file) => handleMediaUpload("start", file)}
                    onUploadLargeMedia={(file) => handleLargeFileDetected("start", file)}
                    onRemoveMedia={(assetId) => removeMedia("start", assetId)}
                    onReorderMedia={(newAssets) => handleReorderMedia("start", newAssets)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ButtonInput
                    label={paymentMode === "hybrid" ? "Кнопка 1 (Покупка)" : "Текст кнопки"}
                    value={getBlock("start")?.buttonText || ""}
                    onChange={(v) => updateBlock("start", "buttonText", v)}
                    placeholder={paymentMode === "hybrid" ? "Купить сейчас" : "Начать"}
                  />
                  {paymentMode === "hybrid" && (
                    <ButtonInput
                      label="Кнопка 2 (Консультация)"
                      value={getBlock("start")?.buttonText2 || ""}
                      onChange={(v) => updateBlock("start", "buttonText2", v)}
                      placeholder="Записаться"
                    />
                  )}
                </div>
              </div>
            </FunnelCard>

            {reminderBlocks.map((block, idx) => (
              <div key={block.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-center my-0.5 py-1 relative">
                  <div className="absolute w-[2px] h-full bg-[var(--color-border)] left-1/2 -translate-x-1/2" />
                  <div className="relative z-10 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-foreground-secondary)] flex items-center gap-1.5 shadow-sm">
                    <Clock size={12} className="text-[var(--color-primary)]" />
                    <span>Через {block.delay || (idx === 0 ? "1ч" : "24ч")}</span>
                  </div>
                </div>

                <FunnelCard
                  stepId={block.id}
                  title={block.step || `Дожим ${idx + 1}`}
                  isComplete={isReminderComplete(block)}
                  onDelete={() => handleDeleteDozhim(block.id)}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div onClick={() => setSelectedBlockId(block.id)}>
                      <label className="text-label" style={{ display: "block", marginBottom: "8px" }}>
                        Текст дожима
                      </label>
                      <RichTextEditor
                        value={block.content || ""}
                        onChange={(v) => updateBlock(block.id, "content", v)}
                        placeholder="Напомните о себе. Добавьте причину принять решение сейчас."
                        hasMedia={!!block.media}
                        botId={appState.activeBot!.id}
                        mediaFileId={block.mediaFileId}
                        mediaAssetId={block.mediaAssetId}
                        mediaType={block.mediaType}
                        mediaAssets={block.mediaAssets ?? []}
                        onUploadMedia={(file) => handleMediaUpload(block.id, file)}
                        onUploadLargeMedia={(file) => handleLargeFileDetected(block.id, file)}
                        onRemoveMedia={(assetId) => removeMedia(block.id, assetId)}
                        onReorderMedia={(newAssets) => handleReorderMedia(block.id, newAssets)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ButtonInput
                        label={paymentMode === "hybrid" ? "Кнопка 1 (Покупка)" : "Текст кнопки"}
                        value={block.buttonText || ""}
                        onChange={(v) => updateBlock(block.id, "buttonText", v)}
                        placeholder={paymentMode === "hybrid" ? "Купить сейчас" : "Перейти"}
                      />
                      {paymentMode === "hybrid" && (
                        <ButtonInput
                          label="Кнопка 2 (Консультация)"
                          value={block.buttonText2 || ""}
                          onChange={(v) => updateBlock(block.id, "buttonText2", v)}
                          placeholder="Записаться на консультацию"
                        />
                      )}
                    </div>
                    {/* Delay selector — at bottom, secondary control */}
                    <div className="-mx-5 -mb-6 px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] rounded-b-[var(--radius-lg)]">
                      <TimerPresets
                        value={block.delay || (idx === 0 ? "1ч" : "24ч")}
                        onChange={(val) => updateBlock(block.id, "delay", val)}
                        presets={["1ч", "6ч", "12ч", "24ч", "48ч"]}
                      />
                    </div>
                  </div>
                </FunnelCard>
              </div>
            ))}

            {/* Кнопка добавления дожима */}
            <div className="flex flex-col items-center justify-center my-2 relative">
              {reminderBlocks.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddDozhim}
                  className="group relative z-10 inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-soft)]/20 px-4 py-2 text-xs font-bold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary-soft)]/40 hover:scale-[1.01] active:scale-[0.98] shadow-2xs"
                >
                  <Plus size={14} className="transition-transform group-hover:rotate-90" />
                  <span>Добавить дожим</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-center my-0.5 py-1 relative">
              <div className="absolute w-[2px] h-full bg-[var(--color-border)] left-1/2 -translate-x-1/2" />
              <div className="relative z-10 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-foreground-secondary)] flex items-center gap-1.5 shadow-sm">
                <CreditCard size={12} className="text-[var(--color-primary)]" />
                <span>Переход к оплате / выдаче</span>
              </div>
            </div>

            <FunnelCard
              stepId="payment"
              title="Продажа и выдача"
              isComplete={isPaymentComplete}
            >
              <div onClick={() => setSelectedBlockId("payment")}>
                <PaymentBlockEditor
                  node={getBlock("payment")}
                  botId={appState.activeBot.id}
                  onChange={(field, value) => updateBlock("payment", field, value)}
                  paymentMode={paymentMode as 'auto' | 'application' | 'hybrid'}
                  onPaymentModeChange={(mode) => updateBlock("payment", "paymentMode", mode)}
                  managerUrl={paymentBlock?.managerUrl || ""}
                  managerText={paymentBlock?.managerText || ""}
                  onManagerUrlChange={(v) => updateBlock("payment", "managerUrl", v)}
                  onManagerTextChange={(v) => updateBlock("payment", "managerText", v)}
                  onUploadPaymentMedia={(file) => handleMediaUpload("payment", file)}
                  onRemovePaymentMedia={() => removeMedia("payment")}
                  onUploadTariffMedia={handleTariffMediaUpload}
                  onUploadLargeTariffMedia={(tariffId, file) => handleLargeFileDetected(`payment:tariff:${tariffId}`, file)}
                  onRemoveTariffMedia={removeTariffMedia}
                  onNavigateToCreateTariff={onNavigateToCreateTariff}
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
                  border: "8px solid #18181b",
                  boxShadow:
                    theme === "dark"
                      ? "0 25px 50px -12px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.05)"
                      : "0 20px 40px -12px rgba(13,20,30,0.22), 0 0 0 1px rgba(13,20,30,0.08)",
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
                    background: "#18181b",
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
                      {funnelSteps.map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-2">
                          {step.complete ? (
                            <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" />
                          ) : (
                            <XCircle size={15} className="text-[var(--color-warning)] shrink-0" />
                          )}
                          <span className={step.complete ? "text-[var(--color-foreground)] font-medium" : "text-[var(--color-warning)] font-semibold"}>
                            Шаг {idx + 1}: {step.label}
                          </span>
                        </div>
                      ))}
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
                    <div className="flex bg-[var(--color-surface-2)] p-1 rounded-xl shrink-0 gap-1 text-[11px] border border-[var(--color-border)] overflow-x-auto scrollbar-none">
                      <button
                        onClick={() => setPreviewScreen("start")}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap ${previewScreen === "start" ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                      >
                        <MessageSquare size={12} />
                        <span>Старт</span>
                      </button>
                      {reminderBlocks.map((r, idx) => (
                        <button
                          key={r.id}
                          onClick={() => setPreviewScreen(r.id)}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap ${previewScreen === r.id ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}
                        >
                          <Clock size={12} />
                          <span>{r.step || `Дожим ${idx + 1}`}</span>
                        </button>
                      ))}
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
                            mediaAssetId={getBlock("start")?.mediaAssetId}
                            mediaType={getBlock("start")?.mediaType}
                    mediaAssets={getBlock("start")?.mediaAssets ?? []}
                            botId={appState.activeBot.id}
                            theme={theme}
                            onButtonClick={handlePreviewButtonClick}
                          />
                        </motion.div>
                      )}

                      {/* Dynamic Screens: Reminders */}
                      {reminderBlocks.map((r, rIdx) =>
                        previewScreen === r.id ? (
                          <motion.div
                            key={r.id}
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
                              <span>Через {r.delay || (rIdx === 0 ? "1ч" : "24ч")} (если не купил)</span>
                            </div>
                            <MessageBubble
                              text={r.content}
                              button={r.buttonText}
                              button2={
                                paymentMode === "hybrid"
                                  ? r.buttonText2
                                  : undefined
                              }
                              mediaAssetId={r.mediaAssetId}
                              mediaType={r.mediaType}
                              mediaAssets={r.mediaAssets ?? []}
                              botId={appState.activeBot!.id}
                              theme={theme}
                              onButtonClick={handlePreviewButtonClick}
                            />
                          </motion.div>
                        ) : null
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
