import { useEffect, useRef, useState } from "react";
import { FileImage, ImagePlus, Trash2, Video } from "lucide-react";
import { apiService } from "../services/api";

type MediaType = "photo" | "video" | null | undefined;

interface MediaAttachmentPickerProps {
  botId?: string;
  assetId?: string | null;
  fileId?: string | null;
  mediaType?: MediaType;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  label: string;
  hint: string;
  triggerOnly?: boolean;
  embedded?: boolean;
}

/** Compact, reusable attachment control for payment messages. */
export function MediaAttachmentPicker({
  botId,
  assetId,
  fileId,
  mediaType,
  onUpload,
  onRemove,
  label,
  hint,
  triggerOnly = false,
  embedded = false,
}: MediaAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!botId || !assetId || !mediaType) {
      setPreviewUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void apiService.getBotMediaPreview(botId, assetId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setPreviewUrl(null); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, botId, mediaType]);

  const openPicker = () => inputRef.current?.click();
  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      await onUpload(file);
    } catch {
      // The parent shows the contextual upload error.
    } finally {
      setIsUploading(false);
    }
  };

  const hasMedia = Boolean(fileId && mediaType);
  const attachmentContent = hasMedia ? (
    <div className="flex items-center gap-3">
      <div className="size-[72px] shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {previewUrl && mediaType === "photo" ? <img src={previewUrl} alt="Предпросмотр вложения" className="size-full object-cover" />
          : previewUrl && mediaType === "video" ? <video src={previewUrl} muted className="size-full object-cover" />
          : mediaType === "video" ? <Video className="m-5 text-[var(--color-primary)]" size={28} />
          : <FileImage className="m-5 text-[var(--color-primary)]" size={28} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{mediaType === "video" ? "Видео" : "Фото"}</p>
        {isUploading && <p className="mt-0.5 text-[11px] text-[var(--color-foreground-tertiary)]">Загружаем…</p>}
      </div>
      <button type="button" onClick={openPicker} disabled={isUploading} className="rounded-xl bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">Заменить</button>
      <button type="button" onClick={onRemove} disabled={isUploading} aria-label="Удалить медиа" className="flex size-8 items-center justify-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)] hover:text-white disabled:opacity-50"><Trash2 size={15} /></button>
    </div>
  ) : null;

  return (
    <div className={triggerOnly ? "contents" : embedded ? "border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2" : "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"}>
      <input ref={inputRef} type="file" accept="image/*,video/*" className="sr-only" onChange={handleChange} />
      {hasMedia ? (
        attachmentContent
      ) : (
        <button type="button" onClick={openPicker} disabled={isUploading} title={hint} className={triggerOnly
          ? "flex items-center gap-1.5 rounded-md bg-[var(--color-primary-soft)] px-3 py-1 text-[12px] font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50"
          : "flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] font-medium text-[var(--color-foreground)] disabled:opacity-50"}>
          <span className={triggerOnly ? "" : "flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]"}><ImagePlus size={triggerOnly ? 14 : 16} /></span>
          <span>{triggerOnly ? (isUploading ? "Загружаем…" : "Медиа") : <><span className="block">{isUploading ? "Загружаем…" : label}</span><span className="block text-[11px] font-normal text-[var(--color-foreground-tertiary)]">{hint}</span></>}</span>
        </button>
      )}
    </div>
  );
}
