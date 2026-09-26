import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  Check,
  ImagePlus,
  Link2,
  Play,
  Send,
  X,
  Ban,
  CreditCard,
  MessageSquare,
  Users,
  CheckCircle2,
  UserX,
  Zap,
} from 'lucide-react';
import { useAlert } from '../AlertProvider';
import { DateTimePicker } from './DateTimePicker';
import { TelegramTextEditor } from '../TelegramTextEditor';
import { getPlainTextLength } from '../../lib/telegramHtml';
import { apiService } from '../../services/api';
import type { BroadcastButton } from '../../services/api';
import type {
  AudienceFilter,
  AudienceSummary,
} from '../../services/api';

const MAX_MEDIA = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Минимальный запас до запланированного момента — минута, как на бэкенде.
const MIN_SCHEDULE_LEAD_MS = 60_000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export type PendingMedia = {
  /** Локальный object-url для превью. */
  url: string;
  file: File;
  type: 'photo' | 'video';
};

interface BroadcastComposerFormProps {
  botId: string;
  counts: AudienceSummary | null;
  /** null — отправлена сразу, ISO-строка — запланирована на это время. */
  onCreated: (scheduledAt: string | null) => void;
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
  const hasMediaAttached = assetIds.length > 0 || pendingFiles.length > 0;
  const maxLimit = hasMediaAttached ? 1024 : 4096;
  const plainLength = getPlainTextLength(text);
  const isOverLimit = plainLength > maxLimit;

  const isValid =
    (trimmed.length > 0 || assetIds.length > 0 || (mediaPendingLocal && mediaReady)) &&
    !isOverLimit &&
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
      onCreated(scheduledIso);
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
    if (isOverLimit) {
      showAlert({
        type: 'danger',
        title: 'Превышен лимит текста',
        message: hasMediaAttached
          ? `При наличии медиа длина текста в Telegram не может превышать 1 024 символа (сейчас ${plainLength}).`
          : `Длина сообщения в Telegram не может превышать 4 096 символов (сейчас ${plainLength}).`,
      });
      return;
    }
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
    <div className="flex flex-col min-h-full flex-1">
      <div className="space-y-4 flex-1">
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
          <AnimatePresence mode="popLayout">
            {assetIds.map((id) => (
              <motion.li
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="group relative flex size-16 items-center justify-center rounded-xl border border-border bg-muted"
              >
                <Check className="size-5 text-fg-tertiary" aria-hidden />
                <button
                  type="button"
                  onClick={() => removeAsset(id)}
                  aria-label="Убрать медиа"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-danger-soft text-danger hover:bg-danger hover:text-white"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </motion.li>
            ))}
            {pendingFiles.map((item, index) => (
              <motion.li
                key={item.url}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
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
              </motion.li>
            ))}
          </AnimatePresence>
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

      {/* ── Текст с форматированием Telegram ── */}
      <div>
        <label
          className="text-micro font-bold uppercase tracking-wide text-fg-tertiary mb-1.5 block"
        >
          Текст сообщения
        </label>
        <TelegramTextEditor
          value={text}
          onChange={setText}
          placeholder="Например: скидка 20% на курс до конца недели…"
          hasMedia={hasMediaAttached}
          minHeight="min-h-[110px]"
          maxHeight="max-h-[300px]"
        />
      </div>

      {/* ── Кнопка под сообщением ── */}
      <div>
        <p className="text-micro font-bold uppercase tracking-wide text-fg-tertiary">
          Кнопка под сообщением
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/50 w-fit">
          {[
            { value: 'none' as const, label: 'Нет', icon: Ban },
            { value: 'tariffs' as const, label: 'Тарифы', icon: CreditCard },
            { value: 'consult' as const, label: 'Консультация', icon: MessageSquare },
          ].map((option) => {
            const Icon = option.icon;
            const isSelected = buttonMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setButtonMode(option.value)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-card text-foreground shadow-2xs font-bold'
                    : 'text-fg-secondary hover:text-foreground hover:bg-card/50'
                }`}
              >
                <Icon className={`size-3.5 ${isSelected ? 'text-primary' : 'text-fg-tertiary'}`} />
                <span>{option.label}</span>
              </button>
            );
          })}
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

      {/* ── Аудитория: компактный переключатель с иконками ── */}
      <div>
        <p className="text-micro font-bold uppercase tracking-wide text-fg-tertiary">
          Кому отправить
        </p>
        <div
          role="radiogroup"
          aria-label="Сегмент аудитории"
          className="mt-2 flex flex-wrap gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/50 w-fit"
        >
          {[
            { value: 'all' as const, label: 'Все', icon: Users },
            { value: 'paid' as const, label: 'Оплатившие', icon: CheckCircle2 },
            { value: 'unpaid' as const, label: 'Без оплаты', icon: UserX },
          ].map((option) => {
            const Icon = option.icon;
            const selected = audience === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAudience(option.value)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-card text-foreground shadow-2xs font-bold'
                    : 'text-fg-secondary hover:text-foreground hover:bg-card/50'
                }`}
              >
                <Icon className={`size-3.5 ${selected ? 'text-primary' : 'text-fg-tertiary'}`} />
                <span>{option.label}</span>
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                    selected ? 'bg-primary/15 text-primary' : 'bg-muted text-fg-tertiary'
                  }`}
                >
                  {countFor(option.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Планирование: компактный переключатель с иконками ── */}
      <div>
        <p className="text-micro font-bold uppercase tracking-wide text-fg-tertiary">
          Когда отправить
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/50 w-fit">
          {[
            { value: 'now' as const, label: 'Сейчас', icon: Zap },
            { value: 'later' as const, label: 'Запланировать', icon: CalendarClock },
          ].map((option) => {
            const Icon = option.icon;
            const isSelected = scheduleMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setScheduleMode(option.value)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-card text-foreground shadow-2xs font-bold'
                    : 'text-fg-secondary hover:text-foreground hover:bg-card/50'
                }`}
              >
                <Icon className={`size-3.5 ${isSelected ? 'text-primary' : 'text-fg-tertiary'}`} />
                <span>{option.label}</span>
              </button>
            );
          })}
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
            <DateTimePicker
              value={scheduleAt}
              min={minScheduleValue}
              onChange={handleScheduleChange}
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
      </div>

      {/* Кнопка отправки закреплена внизу блока */}
      <div className="mt-auto shrink-0 pt-4">
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!isValid || isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-semibold text-primary-foreground transition-all hover:bg-primary/85 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 shadow-xs"
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
