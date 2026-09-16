import type { ReactNode } from "react";
import { TelegramTextEditor } from "./TelegramTextEditor";

export interface TariffDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxCharacters?: number;
  placeholder?: string;
  helperText?: string;
  toolbarAccessory?: ReactNode;
  attachment?: ReactNode;
  botId?: string;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaType?: "photo" | "video" | "document" | null;
  mediaAssets?: import("../types").NodeMediaAsset[];
  onUploadMedia?: (file: File) => Promise<void>;
  onUploadLargeMedia?: (file?: File) => void;
  onRemoveMedia?: () => void;
  mediaHint?: string;
}

const DEFAULT_MAX_CHARACTERS = 3000;

/**
 * Unified rich-text field for the tariff description and payment blocks.
 * Unified with step messages: media row at top, formatting toolbar at bottom.
 */
export function TariffDescriptionEditor({
  value,
  onChange,
  maxCharacters = DEFAULT_MAX_CHARACTERS,
  placeholder = "Опишите, что входит в тариф...",
  toolbarAccessory,
  attachment,
  botId,
  mediaFileId,
  mediaAssetId,
  mediaType,
  mediaAssets,
  onUploadMedia,
  onUploadLargeMedia,
  onRemoveMedia,
  mediaHint = "Клиент увидит фото или видео над описанием тарифа · до 20 МБ",
}: TariffDescriptionEditorProps) {
  return (
    <TelegramTextEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxCharacters={maxCharacters}
      toolbarAccessory={toolbarAccessory}
      attachment={attachment}
      botId={botId}
      mediaFileId={mediaFileId}
      mediaAssetId={mediaAssetId}
      mediaType={mediaType}
      mediaAssets={mediaAssets}
      onUploadMedia={onUploadMedia}
      onUploadLargeMedia={onUploadLargeMedia}
      onRemoveMedia={onRemoveMedia}
      mediaHint={mediaHint}
      minHeight="min-h-[88px]"
      maxHeight="max-h-[300px]"
    />
  );
}
