import { useState } from 'react';
import { CalendarClock, ImagePlus, Play, Send, X } from 'lucide-react';
import { useAlert } from '../AlertProvider';
import { apiService } from '../../services/api';
import type {
  AudienceFilter,
  AudienceSummary,
} from '../../services/api';

const MAX_LENGTH = 4096;
const MAX_MEDIA = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Минимальный запас до запланированного момента — минута, как на бэкенде.
const MIN_SCHEDULE_LEAD_MS = 60_000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

const AUDIENCE_OPTIONS: {
  value: AudienceFilter;
  label: string;
}[] = [
  { value: 'all', label: 'Все' },
  { value: 'paid', label: 'Оплатившие' },
  { value: 'unpaid', label: 'Без оплаты' },
];

export type PendingMedia = {
  /** Локальный object-url для превью. */
  url: string;
  file: File;
  type: 'photo' | 'video';
};

interface BroadcastComposerFormProps {
  botId: string;
  counts: AudienceSummary | null;
  onCreated: () => void;
  /** Готов ли бот к медиа (токен + синхронизация выполнены). */
  mediaReady: boolean;
  /** id-префикс, чтобы sheet и inline-вариант не конфликтовали по label/for. */
  idPrefix?: string;
}

/** datetime-local (локальная зона) → ISO с таймзоной или null. */
function toIsoOrNull(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function BroadcastComposerForm({
  botId,
  counts,
  onCreated,
  mediaReady,
  idPrefix = 'broadcast',
}: BroadcastComposerFormProps) {
  const { showConfirm, showAlert } = useAlert();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Медиа: привязанные asset id (загружены) или локальные файлы (ждут привязки).
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingMedia[]>([]);

  const trimmed = text.trim();
  const scheduledIso = scheduleMode === 'later' ? toIsoOrNull(scheduleAt) : null;
  const scheduleEmpty = scheduleMode === 'later' && !scheduleAt;
  const mediaPendingLocal = pendingFiles.length > 0;
  const isValid =
    (trimmed.length > 0 || assetIds.length > 0 || (mediaPendingLocal && mediaReady)) &&
    text.length <= MAX_LENGTH &&
    (scheduleMode === 'now' || (!scheduleEmpty && scheduleError === null));
  const recipients = counts ? counts[audience] : null;

  const countFor = (value: AudienceFilter) =>
    counts ? counts[value].toLocaleString('ru-RU') : '—';

  /** Валидация даты — вызывается только из обработчиков (Date.now). */
  const validateSchedule = (value: string): string | null => {
    if (!value) return 'Выберите дату и время';
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return 'Выберите дату и время';
    if (time < Date.now() + MIN_SCHEDULE_LEAD_MS)
      return 'Время должно быть хотя бы на минуту в будущем';
    if (time > Date.now() + MAX_SCHEDULE_AHEAD_MS)
      return 'Отложить можно не больше чем на 90 дней';
    return null;
  };

  const handleScheduleChange = (value: string) => {
    setScheduleAt(value);
    setScheduleError(value ? validateSchedule(value) : null);
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted: PendingMedia[] = [];
    for (const file of Array.from(files)) {
      if (assetIds.length + pendingFiles.length + accepted.length >= MAX_MEDIA) break;
      if (file.size > MAX_FILE_BYTES) continue;
      const isPhoto = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isPhoto && !isVideo) continue;
      accepted.push({
        url: URL.createObjectURL(file),
        file,
        type: isPhoto ? 'photo' : 'video',
      });
    }
    setPendingFiles((prev) => [...prev, ...accepted]);
  };

  const removePending = (index: number) => {
    setPendingFiles((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return copy;
    });
  };

  const removeAsset = (assetId: string) => {
    setAssetIds((prev) => prev.filter((id) => id !== assetId));
  };

  const submit = async () => {
    if (isSubmitting) return;
    if (scheduleMode === 'later') {
      const scheduleIssue = validateSchedule(scheduleAt);
      if (scheduleIssue) {
        setScheduleError(scheduleIssue);
        return;
      }
    }
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const finalAssetIds = [...assetIds];
      // Локальные медиа — загружаем бесшумно при отправке (бот уже привязан).
      if (pendingFiles.length && mediaReady) {
        for (const item of pendingFiles) {
          const uploaded = await apiService.uploadBotMedia(botId, 'broadcast', item.file);
          finalAssetIds.push(uploaded.id);
        }
      }
      await apiService.createBroadcast(botId, trimmed, audience, {
        scheduledAt: scheduledIso ?? undefined,
        mediaAssetIds: finalAssetIds,
      });
      pendingFiles.forEach((item) => URL.revokeObjectURL(item.url));
      onCreated();
    } catch (error) {
      showAlert({
        type: 'danger',
        title: 'Не удалось создать рассылку',
        message:
          error instanceof Error ? error.message : 'Попробуйте ещё раз позже',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendClick = () => {
    if (scheduleMode === 'later') {
      const scheduleIssue = validateSchedule(scheduleAt);
      if (scheduleIssue) {
        setScheduleError(scheduleIssue);
        return;
      }
    }
    if (pendingFiles.length && !mediaReady) {
      showAlert({
        type: 'warning',
        title: 'Медиа прикрепится после привязки бота',
        message: 'Подключите Telegram-токен в разделе «Интеграции» и нажмите START в боте — медиа загрузятся автоматически.',
        confirmText: 'Понятно',
      });
      return;
    }
    if (!isValid) return;
    const audienceLabel = recipients === null ? '—' : recipients.toLocaleString('ru-RU');
    const mediaLabel =
      assetIds.length + pendingFiles.length > 0 ? ' С медиа.' : '';
    if (scheduleMode === 'later' && scheduledIso) {
      const local = new Date(scheduleAt).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      showConfirm({
        type: 'info',
        title: 'Запланировать рассылку?',
        message: `Сообщение получат ${audienceLabel} подписчиков — ${local}.${mediaLabel} До отправки рассылку можно отменить.`,
        confirmText: 'Запланировать',
        onConfirm: submit,
      });
      return;
    }
    showConfirm({
      type: 'info',
      title: 'Отправить рассылку?',
      message: `Сообщение получат ${audienceLabel} подписчиков.${mediaLabel} Отменить отправку после запуска нельзя.`,
      confirmText: 'Отправить',
      onConfirm: submit,
    });
  };

  return (
    <div className="space-y-5">
      {/* ── Медиа: одна крупная зона + превью-чипы ── */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
            Фото и видео
          </p>
          <span className="text-micro text-fg-tertiary tabular-nums">
            {assetIds.length + pendingFiles.length} / {MAX_MEDIA}
          </span>
        </div>

        {(assetIds.length > 0 || pendingFiles.length > 0) && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {assetIds.map((id) => (
              <li
                key={id}
                className="group relative flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted"
              >
                <span className="text-fg-tertiary">✓</span>
                <button
                  type="button"
                  onClick={() => removeAsset(id)}
                  aria-label="Убрать медиа"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-danger-soft text-danger hover:bg-danger hover:text-white"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
            {pendingFiles.map((item, index) => (
              <li
                key={item.url}
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
              >
                {item.type === 'photo' ? (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-0.5 text-fg-tertiary">
                    <Play className="size-5" aria-hidden />
                    <span className="text-[9px] font-semibold">видео</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePending(index)}
                  aria-label="Удалить медиа"
                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="size-2.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {assetIds.length + pendingFiles.length < MAX_MEDIA && (
          <label
            htmlFor={`${idPrefix}-media`}
            className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong bg-muted/40 px-4 py-6 text-center transition-colors hover:border-primary hover:text-primary"
          >
            <ImagePlus className="size-6" aria-hidden />
            <span className="text-body-sm font-semibold">
              {assetIds.length + pendingFiles.length === 0
                ? 'Добавить фото или видео'
                : 'Добавить ещё'}
            </span>
            <span className="text-meta text-fg-tertiary">
              уйдут одним сообщением, текст — следующим · до 10 файлов по 20 МБ
            </span>
            {mediaPendingLocal && (
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-micro font-bold text-warning">
                прикрепится после привязки бота
              </span>
            )}
          </label>
        )}
        <input
          id={`${idPrefix}-media`}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {/* ── Текст ── */}
      <div>
        <label
          htmlFor={`${idPrefix}-text`}
          className="text-micro font-medium uppercase tracking-wide text-fg-tertiary"
        >
          Текст сообщения
        </label>
        <textarea
          id={`${idPrefix}-text`}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
          rows={7}
          placeholder="Например: скидка 20% на курс до конца недели…"
          className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-body leading-relaxed text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-ring focus:ring-3 focus:ring-ring/30"
        />
        <p
          className={`mt-1.5 text-right text-meta ${
            text.length >= MAX_LENGTH ? 'text-warning' : 'text-fg-tertiary'
          }`}
        >
          {text.length.toLocaleString('ru-RU')} /{' '}
          {MAX_LENGTH.toLocaleString('ru-RU')}
        </p>
      </div>

      {/* ── Аудитория: мини-переключатель в одну строку ── */}
      <div>
        <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
          Кому отправить
        </p>
        <div
          role="radiogroup"
          aria-label="Сегмент аудитории"
          className="mt-2 flex gap-1 rounded-xl bg-muted p-1"
        >
          {AUDIENCE_OPTIONS.map((option) => {
            const selected = audience === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAudience(option.value)}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-body-sm font-semibold transition-colors ${
                  selected
                    ? 'bg-card text-fg-primary shadow-xs'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {option.label}
                <span
                  className={`rounded-full px-1.5 py-px text-micro font-bold tabular-nums ${
                    selected ? 'bg-primary/10 text-primary' : 'bg-card/70 text-fg-tertiary'
                  }`}
                >
                  {countFor(option.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Планирование ── */}
      <div>
        <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
          Когда отправить
        </p>
        <div className="mt-2 flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { value: 'now', label: 'Сейчас' },
              { value: 'later', label: 'Запланировать' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={scheduleMode === option.value}
              onClick={() => setScheduleMode(option.value)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-body-sm font-semibold transition-colors ${
                scheduleMode === option.value
                  ? 'bg-card text-fg-primary shadow-xs'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {option.value === 'later' && (
                <CalendarClock className="size-4" aria-hidden />
              )}
              {option.label}
            </button>
          ))}
        </div>
        {scheduleMode === 'later' && (
          <div className="mt-2">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => handleScheduleChange(event.target.value)}
              aria-label="Дата и время отправки"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-body text-fg-primary outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
            {scheduleError && (
              <p className="mt-1.5 text-meta text-warning">{scheduleError}</p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSendClick}
        disabled={!isValid || isSubmitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-semibold text-primary-foreground transition-all hover:bg-primary/85 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
        ) : scheduleMode === 'later' ? (
          <CalendarClock className="size-4" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {isSubmitting
          ? 'Запускаем…'
          : scheduleMode === 'later'
            ? 'Запланировать'
            : `Отправить ${
                recipients === null ? '' : `${recipients.toLocaleString('ru-RU')} `
              }подписчикам`}
      </button>
    </div>
  );
}
