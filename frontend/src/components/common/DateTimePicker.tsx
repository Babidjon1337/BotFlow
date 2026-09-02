import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';

/** "YYYY-MM-DDTHH:mm" (локальная зона) → Date или null. */
const parseLocal = (v: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad = (n: number) => String(n).padStart(2, '0');

const toInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Rounded-календарь даты/времени: открывается по тапу на поле,
 * сетка месяца + плитки часов и минут. Значение — формат datetime-local.
 */
export function DateTimePicker({
  value,
  min,
  onChange,
  ariaLabel = 'Дата и время отправки',
}: {
  value: string;
  min?: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseLocal(value);
  const minDate = parseLocal(min ?? '');
  // Чистые lazy-инициализаторы: Date.now() только при первом монтировании.
  const [maxDate] = useState(() => new Date(Date.now() + 90 * 86_400_000));
  const [view, setView] = useState(() => {
    const base = parseLocal(value) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // При открытии показываем месяц выбранной даты (без эффекта — в обработчике).
  const toggleOpen = () => {
    if (!open && selected) {
      setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const firstWeekday = (view.getDay() + 6) % 7; // Пн=0
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const list: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push(new Date(view.getFullYear(), view.getMonth(), day));
    }
    return list;
  }, [view]);

  const pickDay = (day: Date) => {
    const base = selected ?? new Date();
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes());
    if (next < new Date()) {
      // Если выбрали сегодня — минимум +1 час, чтобы валидация не падала.
      next.setHours(new Date().getHours() + 1, 0, 0, 0);
    }
    onChange(toInputValue(next));
  };

  const pickTime = (hour: number, minute: number) => {
    const base = selected ?? new Date();
    onChange(toInputValue(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute)));
    setOpen(false);
  };

  const isDayDisabled = (day: Date) => {
    const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59);
    if (minDate && endOfDay < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (day > maxDate) return true;
    return false;
  };

  const label = selected
    ? selected.toLocaleString('ru-RU', {
        weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : 'Выберите дату и время';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-body tabular-nums text-fg-primary outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <CalendarClock className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
        <span className={selected ? '' : 'text-fg-tertiary'}>{label}</span>
        <ChevronRight className={`ml-auto size-4 shrink-0 text-fg-tertiary transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-border bg-card p-3 shadow-xl"
            role="dialog"
            aria-label="Выбор даты и времени"
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-body-sm font-bold text-fg-primary">{MONTHS[view.getMonth()]} {view.getFullYear()}</p>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1 text-center text-micro font-semibold text-fg-tertiary">{w}</span>
              ))}
              {cells.map((day, index) =>
                day === null ? (
                  <span key={`gap-${index}`} />
                ) : (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={isDayDisabled(day)}
                    onClick={() => pickDay(day)}
                    className={`flex size-9 items-center justify-center rounded-lg text-body-sm font-medium tabular-nums transition-colors ${
                      selected && sameDay(day, selected)
                        ? 'bg-primary text-primary-foreground'
                        : sameDay(day, new Date())
                          ? 'bg-accent text-fg-primary'
                          : 'text-fg-secondary hover:bg-muted'
                    } disabled:pointer-events-none disabled:opacity-35`}
                  >
                    {day.getDate()}
                  </button>
                ),
              )}
            </div>

            <div className="mt-2 border-t border-border pt-2">
              <p className="text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Час</p>
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => pickTime(h, selected?.getMinutes() ?? 0)}
                    className={`size-9 shrink-0 rounded-lg text-body-sm font-semibold tabular-nums transition-colors ${
                      selected?.getHours() === h
                        ? 'bg-primary text-primary-foreground'
                        : 'text-fg-secondary hover:bg-muted'
                    }`}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Минута</p>
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickTime(selected?.getHours() ?? 9, m)}
                    className={`size-9 shrink-0 rounded-lg text-body-sm font-semibold tabular-nums transition-colors ${
                      selected?.getMinutes() === m
                        ? 'bg-primary text-primary-foreground'
                        : 'text-fg-secondary hover:bg-muted'
                    }`}
                  >
                    {pad(m)}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
