import { useState } from 'react';
import { CalendarClock, Send } from 'lucide-react';
import { useAlert } from '../AlertProvider';
import { apiService } from '../../services/api';
import type {
  AudienceFilter,
  AudienceSummary,
} from '../../services/api';

const MAX_LENGTH = 4096;
// Минимальный запас до запланированного момента — минута, как на бэкенде.
const MIN_SCHEDULE_LEAD_MS = 60_000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

const AUDIENCE_OPTIONS: {
  value: AudienceFilter;
  title: string;
  desc: string;
}[] = [
  { value: 'all', title: 'Все подписчики', desc: 'Каждый, кто писал боту' },
  { value: 'paid', title: 'Только оплатившие', desc: 'Клиенты с покупкой' },
  { value: 'unpaid', title: 'Без оплаты', desc: 'Дошли по воронке, но не купили' },
];

interface BroadcastComposerFormProps {
  botId: string;
  counts: AudienceSummary | null;
  onCreated: () => void;
  /** id-префикс, чтобы sheet и inline-вариант не конфликтовали по label/for. */
  idPrefix?: string;
}

/** datetime-local (локальная зона) → ISO с таймзоной или null. */
function toIsoOrNull(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Форма создания рассылки: сегмент, текст, планирование.
 * Используется в bottom-sheet (mobile) и в inline-карточке (desktop, R7.4).
 */
export function BroadcastComposerForm({
  botId,
  counts,
  onCreated,
  idPrefix = 'broadcast',
}: BroadcastComposerFormProps) {
  const { showConfirm, showAlert } = useAlert();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = text.trim();
  const scheduledIso = scheduleMode === 'later' ? toIsoOrNull(scheduleAt) : null;
  const scheduleEmpty = scheduleMode === 'later' && !scheduleAt;
  const isValid =
    trimmed.length > 0 &&
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
      await apiService.createBroadcast(botId, trimmed, audience, scheduledIso ?? undefined);
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
    if (!isValid) return;
    const audienceLabel = recipients === null ? '—' : recipients.toLocaleString('ru-RU');
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
        message: `Сообщение получат ${audienceLabel} подписчиков — ${local}. До отправки рассылку можно отменить.`,
        confirmText: 'Запланировать',
        onConfirm: submit,
      });
      return;
    }
    showConfirm({
      type: 'info',
      title: 'Отправить рассылку?',
      message: `Сообщение получат ${audienceLabel} подписчиков. Отменить отправку после запуска нельзя.`,
      confirmText: 'Отправить',
      onConfirm: submit,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor={`${idPrefix}-text`}
          className="text-micro font-medium uppercase tracking-wide text-fg-tertiary"
        >
          Сообщение
        </label>
        <textarea
          id={`${idPrefix}-text`}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
          rows={5}
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

      <div>
        <p className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">
          Кому отправить
        </p>
        <div
          role="radiogroup"
          aria-label="Сегмент аудитории"
          className="mt-2 space-y-2"
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
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                  selected
                    ? 'border-primary/60 bg-accent/5 ring-2 ring-ring/20'
                    : 'border-border hover:border-fg-tertiary/50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-body font-medium text-fg-primary">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-meta text-fg-tertiary">
                    {option.desc}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-micro font-semibold tabular-nums ${
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-fg-secondary'
                  }`}
                >
                  {countFor(option.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
