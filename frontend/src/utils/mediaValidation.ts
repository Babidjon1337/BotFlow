/**
 * Media file validation and allowed formats.
 * Supports Photos, Videos, Audios, and safe Documents (PDF, Word, Excel, Archives, Text).
 */

export const ALLOWED_MEDIA_EXTENSIONS = new Set([
  // Images
  "jpg", "jpeg", "png", "webp", "gif", "heic",
  // Videos
  "mp4", "mov", "webm", "avi", "mkv",
  // Audio
  "mp3", "ogg", "wav", "m4a", "aac", "flac",
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "odt", "ods", "odp",
  // Archives
  "zip", "rar", "7z", "tar", "gz",
]);

export const BLOCKED_MEDIA_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "php", "js", "mjs", "py", "vbs", "msi",
  "dll", "com", "scr", "jar", "apk", "bin", "iso", "dmg", "svg", "html", "htm",
]);

export const ALLOWED_MEDIA_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  "audio/*",
].join(",");

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  isDocument: boolean;
  mediaType: "photo" | "video" | "document";
}

export function validateMediaFile(file: File): MediaValidationResult {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  const mime = (file.type || "").toLowerCase();

  // 1. Check dangerous/blocked extensions
  if (BLOCKED_MEDIA_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Загрузка файлов формата .${ext} запрещена в целях безопасности.`,
      isDocument: true,
      mediaType: "document",
    };
  }

  // 2. Check if file is in allowed whitelist
  const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext);
  const isVideo = mime.startsWith("video/") || ["mp4", "mov", "webm", "avi", "mkv"].includes(ext);
  const isAudio = mime.startsWith("audio/") || ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext);
  const isDoc =
    mime.includes("pdf") ||
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("presentation") ||
    mime.includes("text") ||
    mime.includes("zip") ||
    ALLOWED_MEDIA_EXTENSIONS.has(ext);

  if (!isImage && !isVideo && !isAudio && !isDoc) {
    return {
      valid: false,
      error: "Неподдерживаемый формат файла. Разрешены фото, видео, аудио и документы (PDF, Word, Excel, TXT, ZIP).",
      isDocument: true,
      mediaType: "document",
    };
  }

  const determinedType: "photo" | "video" | "document" = isImage ? "photo" : isVideo ? "video" : "document";

  return {
    valid: true,
    isDocument: determinedType === "document",
    mediaType: determinedType,
  };
}
