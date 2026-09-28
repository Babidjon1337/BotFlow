/**
 * Utility for extracting and detecting images and videos from clipboard events.
 * Supports:
 * - Snipping tool / screenshots (Win+Shift+S, PrtScn)
 * - "Copy Image" from web browsers and Telegram Desktop
 * - Copied media files from OS file managers (Windows Explorer, macOS Finder)
 */

const MEDIA_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'heic',
  'heif',
  'avif',
  'mp4',
  'mov',
  'webm',
  'avi',
  'mkv',
  'm4v',
  '3gp',
]);

export function isMediaFile(file: File): boolean {
  if (file.type) {
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      return true;
    }
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

export function getMediaFilesFromClipboard(event: ClipboardEvent | React.ClipboardEvent): File[] {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return [];

  const mediaFiles: File[] = [];

  // 1. Check items (screenshots, copied images, browser clipboard)
  if (clipboardData.items) {
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && isMediaFile(file)) {
          const type = file.type || '';
          const isVideo = type.startsWith('video/');
          const defaultExt = isVideo ? 'mp4' : 'png';
          const ext = type ? type.split('/')[1]?.replace('jpeg', 'jpg') || defaultExt : defaultExt;
          const namedFile =
            file.name && file.name !== 'image.png' && file.name !== 'blob'
              ? file
              : new File([file], `clipboard_${Date.now()}.${ext}`, {
                  type: file.type || (isVideo ? `video/${ext}` : `image/${ext}`),
                });
          mediaFiles.push(namedFile);
        }
      }
    }
  }

  // 2. Check data.files if items didn't return any (e.g. copied files from Explorer / Finder)
  if (mediaFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (const file of Array.from(clipboardData.files)) {
      if (isMediaFile(file)) {
        mediaFiles.push(file);
      }
    }
  }

  return mediaFiles;
}
