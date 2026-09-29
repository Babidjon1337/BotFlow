import React from "react";
import {
  FileText,
  FileSpreadsheet,
  FileArchive,
  FileAudio,
  FileCode,
  File,
} from "lucide-react";

export interface FileTypeInfo {
  category: "pdf" | "doc" | "xls" | "ppt" | "zip" | "audio" | "code" | "text" | "file";
  extension: string;
  label: string;
  badgeBg: string;
  badgeText: string;
  cardBg: string;
  borderColor: string;
  iconColor: string;
}

export function getFileTypeInfo(fileName?: string, mimeType?: string): FileTypeInfo {
  const ext = (fileName?.split(".").pop() || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  // 1. PDF Documents
  if (ext === "pdf" || mime.includes("pdf")) {
    return {
      category: "pdf",
      extension: "PDF",
      label: "PDF документ",
      badgeBg: "bg-red-500",
      badgeText: "text-white",
      cardBg: "bg-red-500/10 dark:bg-red-950/40",
      borderColor: "border-red-500/30",
      iconColor: "text-red-500",
    };
  }

  // 2. Word Documents
  if (
    ["doc", "docx", "rtf", "odt"].includes(ext) ||
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml")
  ) {
    return {
      category: "doc",
      extension: ext ? ext.toUpperCase() : "DOC",
      label: "Документ Word",
      badgeBg: "bg-blue-600",
      badgeText: "text-white",
      cardBg: "bg-blue-500/10 dark:bg-blue-950/40",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-500",
    };
  }

  // 3. Excel Spreadsheets
  if (
    ["xls", "xlsx", "csv", "ods"].includes(ext) ||
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    mime.includes("csv")
  ) {
    return {
      category: "xls",
      extension: ext ? ext.toUpperCase() : "XLS",
      label: "Таблица Excel",
      badgeBg: "bg-emerald-600",
      badgeText: "text-white",
      cardBg: "bg-emerald-500/10 dark:bg-emerald-950/40",
      borderColor: "border-emerald-500/30",
      iconColor: "text-emerald-500",
    };
  }

  // 4. Presentations
  if (
    ["ppt", "pptx", "odp"].includes(ext) ||
    mime.includes("powerpoint") ||
    mime.includes("presentation")
  ) {
    return {
      category: "ppt",
      extension: ext ? ext.toUpperCase() : "PPT",
      label: "Презентация",
      badgeBg: "bg-orange-600",
      badgeText: "text-white",
      cardBg: "bg-orange-500/10 dark:bg-orange-950/40",
      borderColor: "border-orange-500/30",
      iconColor: "text-orange-500",
    };
  }

  // 5. Archives
  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext) ||
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("archive") ||
    mime.includes("tar")
  ) {
    return {
      category: "zip",
      extension: ext ? ext.toUpperCase() : "ZIP",
      label: "Архив файлов",
      badgeBg: "bg-amber-600",
      badgeText: "text-white",
      cardBg: "bg-amber-500/10 dark:bg-amber-950/40",
      borderColor: "border-amber-500/30",
      iconColor: "text-amber-500",
    };
  }

  // 6. Audio
  if (
    ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext) ||
    mime.startsWith("audio/")
  ) {
    return {
      category: "audio",
      extension: ext ? ext.toUpperCase() : "AUDIO",
      label: "Аудиозапись",
      badgeBg: "bg-violet-600",
      badgeText: "text-white",
      cardBg: "bg-violet-500/10 dark:bg-violet-950/40",
      borderColor: "border-violet-500/30",
      iconColor: "text-violet-500",
    };
  }

  // 7. Code / Config
  if (
    ["json", "xml", "yaml", "yml", "html", "css", "sql"].includes(ext) ||
    mime.includes("json") ||
    mime.includes("xml")
  ) {
    return {
      category: "code",
      extension: ext ? ext.toUpperCase() : "CODE",
      label: "Файл данных",
      badgeBg: "bg-indigo-600",
      badgeText: "text-white",
      cardBg: "bg-indigo-500/10 dark:bg-indigo-950/40",
      borderColor: "border-indigo-500/30",
      iconColor: "text-indigo-400",
    };
  }

  // 8. Plain Text
  if (ext === "txt" || mime.includes("text/plain")) {
    return {
      category: "text",
      extension: "TXT",
      label: "Текстовый файл",
      badgeBg: "bg-sky-600",
      badgeText: "text-white",
      cardBg: "bg-sky-500/10 dark:bg-sky-950/40",
      borderColor: "border-sky-500/30",
      iconColor: "text-sky-400",
    };
  }

  // 9. Generic File
  return {
    category: "file",
    extension: ext ? ext.toUpperCase().slice(0, 4) : "FILE",
    label: "Документ",
    badgeBg: "bg-[var(--color-primary)]",
    badgeText: "text-white",
    cardBg: "bg-[var(--color-surface-2)]",
    borderColor: "border-[var(--color-border)]",
    iconColor: "text-[var(--color-primary)]",
  };
}

function getFileIcon(category: FileTypeInfo["category"]) {
  switch (category) {
    case "pdf":
    case "doc":
    case "ppt":
    case "text":
      return FileText;
    case "xls":
      return FileSpreadsheet;
    case "zip":
      return FileArchive;
    case "audio":
      return FileAudio;
    case "code":
      return FileCode;
    default:
      return File;
  }
}

interface DocumentThumbnailProps {
  fileName?: string;
  mimeType?: string;
  compact?: boolean;
  className?: string;
}

export const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  fileName,
  mimeType,
  compact = true,
  className = "",
}) => {
  const info = getFileTypeInfo(fileName, mimeType);
  const IconComponent = getFileIcon(info.category);

  if (compact) {
    return (
      <div
        className={`relative flex size-full select-none flex-col items-center justify-between p-1 overflow-hidden pointer-events-none ${info.cardBg} ${className}`}
        title={fileName || info.label}
      >
        <div className="flex flex-1 items-center justify-center pt-1">
          <IconComponent className={`size-5 stroke-[2] ${info.iconColor}`} />
        </div>
        <div className="flex w-full items-center justify-center pb-0.5">
          <span
            className={`rounded-[3px] px-1 py-0.5 text-[8px] font-bold tracking-wider leading-none shadow-2xs ${info.badgeBg} ${info.badgeText}`}
          >
            {info.extension}
          </span>
        </div>
        {fileName && (
          <span
            className="w-full truncate text-center text-[7.5px] leading-tight text-[var(--color-foreground-secondary)] px-0.5"
            title={fileName}
          >
            {fileName}
          </span>
        )}
      </div>
    );
  }

  // Non-compact view: Telegram-style document card
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border p-2.5 select-none ${info.borderColor} ${info.cardBg} ${className}`}
      title={fileName || info.label}
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg shadow-xs ${info.badgeBg} ${info.badgeText}`}
      >
        <IconComponent className="size-5 stroke-[2.2]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--color-foreground)]">
          {fileName || info.label}
        </p>
        <p className="truncate text-[10px] text-[var(--color-foreground-secondary)]">
          {info.label} {info.extension ? `· ${info.extension}` : ""}
        </p>
      </div>
    </div>
  );
};
