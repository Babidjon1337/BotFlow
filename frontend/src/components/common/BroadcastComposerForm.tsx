import { useCallback, useState } from 'react';
import { CalendarClock, Check, ImagePlus, Link2, Play, Send, X } from 'lucide-react';
import { useAlert } from '../AlertProvider';
import { apiService } from '../../services/api';
import type { BroadcastButton } from '../../services/api';
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
  /** Тарифы воронки для кнопок рассылки: id → {name, price, actionType, actionData}. */
  tariffs?: BroadcastTariffOption[];
  /** id-префикс, чтобы sheet и inline-вариант не конфликтовали по label/for. */
  idPrefix?: string;
}

export interface BroadcastTariffOption {
  id: string;
  name: string;
  price: string;
  isLink: boolean;
}

/** datetime-local (локальная зона) → ISO с таймзоной или null. */
function toIsoOrNull(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Date → значение для input[type=datetime-local] в локальной зоне. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Быстрый выбор времени отправки — без ручного ввода даты. */
const SCHEDULE_PRESETS: { label: string; at: () => Date }[] = [
  { label: 'Через час', at: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    label: 'Сегодня 19:00',
    at: () => {
      const date = new Date();
      date.setHours(19, 0, 0, 0);
      if (date.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) date.setDate(date.getDate() + 1);
      return date;
    },
  },
  {
    label: 'Завтра 12:00',
    at: () => {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      date.setHours(12, 0, 0, 0);
      return date;
    },
  },
  {
    label: 'Через неделю',
    at: () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(12, 0, 0, 0);
      return date;
    },
  },
];

export function BroadcastComposerForm({
  botId,
  counts,
  onCreated,
  mediaReady,
  tariffs = [],
  idPrefix = 'broadcast',
}: BroadcastComposerFormProps) {
  const { showAlert } = useAlert();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Медиа: привязанные asset id (загружены) или локальные файлы (ждут привязки).
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingMedia[]>([]);
  // Кнопка под сообщением: нет | ссылка-консультация | выбранные тарифы.
  const [buttonMode, setButtonMode] = useState<'none' | 'consult' | 'tariffs'>('none');
  const [consultUrl, setConsultUrl] = useState('');
  const [consultText, setConsultText] = useState('Записаться на консультацию');
  const [tariffIds, setTariffIds] = useState<string[]>([]);

  const trimmed = text.trim();
  const scheduledIso = scheduleMode === 'later' ? toIsoOrNull(scheduleAt) : null;
  const scheduleEmpty = scheduleMode === 'later' && !scheduleAt;
  const mediaPendingLocal = pendingFiles.length > 0;
  const isValid =
    (trimmed.length > 0 || assetIds.length > 0 || (mediaPendingLocal && mediaReady)) &&
    text.length <= MAX_LENGTH &&
    (scheduleMode === 'now' || (!scheduleEmpty && scheduleError === null)) &&
    (buttonMode === 'none'
      ? true
      : buttonMode === 'tariffs'
        ? tariffIds.length > 0
        : /^https:\/\/\S+\.\S+/.test(consultUrl.trim()));
  const recipients = counts ? counts[audience] : null;

  const buildButton = (): BroadcastButton | undefined => {
    if (buttonMode === 'consult') {
      return { type: 'consult', text: consultText.trim() || 'Написать автору', url: consultUrl.trim() };
    }
    if (buttonMode === 'tariffs') {
      return { type: 'tariffs', tariffIds };
    }
    return undefined;
  };

  const countFor = (value: AudienceFilter) =>
    counts ? counts[value].toLocaleString('ru-RU') : '—';

  // Минимум для datetime-local считаем один раз на монтирование (Date.now — вне рендера).
  const [minScheduleValue] = useState(() =>
    toLocalInputValue(new Date(Date.now() + MIN_SCHEDULE_LEAD_MS)),
  );

  /** Валидация даты — вызывается только из обработчиков (Date.now вне рендера). */
  const validateSchedule = useCallback((value: string): string | null => {
    if (!value) return 'Выберите дату и время';
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return 'Выберите дату и время';
    const now = Date.now();
    if (time < now + MIN_SCHEDULE_LEAD_MS)
      return 'Время должно быть хотя бы на минуту в будущем';
    if (time > now + MAX_SCHEDULE_AHEAD_MS)
      return 'Отложить можно не больше чем на 90 дней';
    return null;
  }, []);

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
        button: buildButton(),
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

  // Отправка сразу без окна подтверждения: ошибки показываются как alert.
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
    void submit();
  };

  return (
    <div className="space-y-4">
      {/* ── Медиа: компактные чипы 64px + плитка «+» ── */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
            Фото и видео
          </p>
          <span className="text-micro text-fg-tertiary tabular-nums">
            {assetIds.length + pendingFiles.length} / {MAX_MEDIA}
          </span>
        </div>

        <ul className="mt-2 flex flex-wrap items-center gap-2">
          {assetIds.map((id) => (
            <li
              key={id}
              className="group relative flex size-16 items-center justify-center rounded-xl border border-border bg-muted"
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
              className="group relative flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
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
          {assetIds.length + pendingFiles.length < MAX_MEDIA && (
            <li>
              <label
                htmlFor={`${idPrefix}-media`}
                title="Добавить фото или видео"
                className="flex size-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border-strong text-fg-tertiary transition-colors hover:border-primary hover:text-primary"
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-[10px] font-semibold">фото</span>
              </label>
            </li>
          )}
        </ul>
        <p className="mt-1.5 text-micro text-fg-tertiary">
          {mediaPendingLocal
            ? 'Прикрепится при отправке · до 10 файлов по 20 МБ'
            : 'Медиа уйдёт одним сообщением, текст — следующим · до 10 файлов по 20 МБ'}
        </p>
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
          rows={4}
          placeholder="Например: скидка 20% на курс до конца недели…"
          className="mt-1.5 w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-body leading-relaxed text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-ring focus:ring-3 focus:ring-ring/30"
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

      {/* ── Кнопка под сообщением ── */}
      <div>
        <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
          Кнопка под сообщением
        </p>
        <div className="mt-2 flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { value: 'none', label: 'Нет' },
              { value: 'tariffs', label: 'Тарифы' },
              { value: 'consult', label: 'Консультация' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={buttonMode === option.value}
              onClick={() => setButtonMode(option.value)}
              className={`flex h-9 flex-1 items-center justify-center rounded-lg text-body-sm font-semibold transition-colors ${
                buttonMode === option.value
                  ? 'bg-card text-fg-primary shadow-xs'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {buttonMode === 'consult' && (
          <div className="mt-2.5 space-y-2.5">
            <div>
              <label htmlFor={`${idPrefix}-btn-text`} className="block text-body-sm font-medium text-fg-primary">
                Надпись на кнопке
              </label>
              <input
                id={`${idPrefix}-btn-text`}
                type="text"
                value={consultText}
                maxLength={64}
                onChange={(event) => setConsultText(event.target.value.slice(0, 64))}
                placeholder="Записаться на консультацию"
                className="input mt-1 w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-btn-url`} className="block text-body-sm font-medium text-fg-primary">
                Ссылка (Telegram или сайт)
              </label>
              <input
                id={`${idPrefix}-btn-url`}
                type="url"
                value={consultUrl}
                onChange={(event) => setConsultUrl(event.target.value)}
                placeholder="https://t.me/ваш_юзернейм"
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-meta text-fg-tertiary">
                Ссылка на ваш Telegram-профиль или чат — клиент напишет напрямую.
              </p>
            </div>
          </div>
        )}

        {buttonMode === 'tariffs' && (
          <div className="mt-2.5">
            {tariffs.length === 0 ? (
              <p className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-meta text-fg-tertiary">
                Тарифов с ссылкой оплаты нет. Добавьте их в сценарии — блок «Оплата».
              </p>
            ) : (
              <ul className="space-y-2">
                {tariffs.map((tariff) => {
                  const checked = tariffIds.includes(tariff.id);
                  const disabled = !tariff.isLink;
                  return (
                    <li key={tariff.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={disabled}
                        onClick={() =>
                          setTariffIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== tariff.id)
                              : [...prev, tariff.id],
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all ${
                          disabled
                            ? 'cursor-not-allowed border-border opacity-55'
                            : checked
                              ? 'border-primary/60 bg-accent/5 ring-2 ring-ring/20'
                              : 'border-border hover:border-fg-tertiary/50'
                        }`}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'
                          }`}
                        >
                          {checked ? <Check className="size-3" aria-hidden /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm font-semibold text-fg-primary">
                            {tariff.name}
                          </span>
                          {disabled ? (
                            <span className="mt-0.5 block text-micro text-warning">
                              нет ссылки оплаты — добавьте в сценарии
                            </span>
                          ) : null}
                        </span>
                        {tariff.price && (
                          <span className="shrink-0 font-accent text-body-sm font-semibold tabular-nums text-fg-primary">
                            {tariff.price} ₽
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 flex items-start gap-1 text-micro text-fg-tertiary">
              <Link2 className="mt-px size-3.5 shrink-0" aria-hidden />
              Кнопки появятся под текстом рассылки и ведут на оплату тарифа.
            </p>
          </div>
        )}
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
          <div className="mt-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleScheduleChange(toLocalInputValue(preset.at()))}
                  className="rounded-full border border-border px-3 py-1.5 text-micro font-semibold text-fg-secondary transition-colors hover:border-primary hover:text-primary"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={scheduleAt}
              min={minScheduleValue}
              onChange={(event) => handleScheduleChange(event.target.value)}
              aria-label="Дата и время отправки"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-body tabular-nums text-fg-primary outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
            {scheduleAt && !scheduleError ? (
              <p className="text-micro text-fg-secondary">
                Отправим {new Date(scheduleAt).toLocaleString('ru-RU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            ) : null}
            {scheduleError && (
              <p className="text-meta text-warning">{scheduleError}</p>
            )}
          </div>
        )}
      </div>

      {/* Кнопка отправки закреплена внизу формы — видна без прокрутки истории */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-card px-4 pb-1 pt-3 sm:-mx-5 sm:px-5">
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
    </div>
  );
}
