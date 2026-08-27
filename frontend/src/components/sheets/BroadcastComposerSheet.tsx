import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { useViewportHeight } from '../../hooks';
import { useAlert } from '../AlertProvider';
import { apiService } from '../../services/api';
import type {
  AudienceFilter,
  AudienceSummary,
} from '../../services/api';

const MAX_LENGTH = 4096;

const AUDIENCE_OPTIONS: {
  value: AudienceFilter;
  title: string;
  desc: string;
}[] = [
  { value: 'all', title: 'Все подписчики', desc: 'Каждый, кто писал боту' },
  { value: 'paid', title: 'Только оплатившие', desc: 'Клиенты с покупкой' },
  { value: 'unpaid', title: 'Без оплаты', desc: 'Дошли по воронке, но не купили' },
];

interface BroadcastComposerSheetProps {
  botId: string;
  counts: AudienceSummary | null;
  onClose: () => void;
  onCreated: () => void;
}

export function BroadcastComposerSheet({
  botId,
  counts,
  onClose,
  onCreated,
}: BroadcastComposerSheetProps) {
  const vh = useViewportHeight();
  const { showConfirm, showAlert } = useAlert();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = text.trim();
  const isValid = trimmed.length > 0 && text.length <= MAX_LENGTH;
  const recipients = counts ? counts[audience] : null;

  const countFor = (value: AudienceFilter) =>
    counts ? counts[value].toLocaleString('ru-RU') : '—';

  const submit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await apiService.createBroadcast(botId, trimmed, audience);
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
    if (!isValid) return;
    showConfirm({
      type: 'info',
      title: 'Отправить рассылку?',
      message: `Сообщение получат ${recipients === null ? '—' : recipients.toLocaleString('ru-RU')} подписчиков. Отменить отправку после запуска нельзя.`,
      confirmText: 'Отправить',
      onConfirm: submit,
    });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-composer-title"
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.5 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-3xl"
        style={{ maxHeight: vh ? vh - 48 : '92vh' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="broadcast-composer-title"
              className="text-title-lg font-semibold tracking-tight"
            >
              Новая рассылка
            </h2>
            <p className="mt-0.5 text-meta text-fg-tertiary">
              Одно сообщение выбранному сегменту
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-fg-primary"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label
              htmlFor="broadcast-text"
              className="text-micro font-medium uppercase tracking-wide text-fg-tertiary"
            >
              Сообщение
            </label>
            <textarea
              id="broadcast-text"
              value={text}
              onChange={(event) =>
                setText(event.target.value.slice(0, MAX_LENGTH))
              }
              rows={5}
              autoFocus
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
        </div>

        <div className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleSendClick}
            disabled={!isValid || isSubmitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-semibold text-primary-foreground transition-all hover:bg-primary/85 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {isSubmitting
              ? 'Запускаем…'
              : `Отправить ${
                  recipients === null ? '' : `${recipients.toLocaleString('ru-RU')} `
                }подписчикам`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
