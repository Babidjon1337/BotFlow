import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Check,
} from 'lucide-react';

export interface DateTimePickerProps {
  value: string; // ISO or "YYYY-MM-DDTHH:mm"
  min?: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:mm" → Date или null */
const parseLocal = (v: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const QUICK_HOURS = [
  { label: '09:00', h: 9, m: 0 },
  { label: '12:00', h: 12, m: 0 },
  { label: '15:00', h: 15, m: 0 },
  { label: '18:00', h: 18, m: 0 },
  { label: '21:00', h: 21, m: 0 },
];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getInitialDate = (value: string): Date => {
  const parsed = parseLocal(value);
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  // По умолчанию: через 1 час, округлённое до 5 минут
  const next = new Date(Date.now() + 60 * 60 * 1000);
  const m = next.getMinutes();
  const rounded = Math.ceil(m / 5) * 5;
  next.setMinutes(rounded, 0, 0);
  return next;
};

/**
 * Всплывающее модальное окно выбора даты и времени (Календарь + Удобный ввод времени).
 */
export function DateTimePicker({
  value,
  min,
  onChange,
  ariaLabel = 'Дата и время отправки',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = parseLocal(value);

  // Локальное состояние модалки (применяется только по клику «Подтвердить»)
  const [tempDate, setTempDate] = useState<Date>(() => getInitialDate(value));
  const [hourInput, setHourInput] = useState(() => pad(tempDate.getHours()));
  const [minuteInput, setMinuteInput] = useState(() => pad(tempDate.getMinutes()));

  // Текущий просматриваемый месяц в календаре
  const [viewMonth, setViewMonth] = useState(() => new Date(tempDate.getFullYear(), tempDate.getMonth(), 1));

  const minDate = parseLocal(min ?? '');
  const [maxDate] = useState(() => new Date(Date.now() + 90 * 86_400_000));

  // Синхронизация при открытии
  const handleOpenModal = () => {
    const d = getInitialDate(value);
    setTempDate(d);
    setHourInput(pad(d.getHours()));
    setMinuteInput(pad(d.getMinutes()));
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setOpen(true);
  };

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Дни текущего месяца календаря
  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Пн = 0, Вс = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const list: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      list.push(new Date(year, month, day));
    }
    return list;
  }, [viewMonth]);

  // Проверка: отключён ли день (прошедшие дни)
  const isDayDisabled = (day: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (dayStart < today) return true;
    if (minDate) {
      const minDayStart = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
      if (dayStart < minDayStart) return true;
    }
    if (dayStart > maxDate) return true;
    return false;
  };

  // Выбор дня в календаре
  const pickDay = (day: Date) => {
    const currentH = parseInt(hourInput, 10) || 0;
    const currentM = parseInt(minuteInput, 10) || 0;
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), currentH, currentM);
    // Если выбрали сегодня и время в прошлом, сдвигаем на текущее + 10 минут
    if (sameDay(next, new Date()) && next.getTime() <= Date.now() + 60_000) {
      const autoNext = new Date(Date.now() + 15 * 60 * 1000);
      setHourInput(pad(autoNext.getHours()));
      setMinuteInput(pad(autoNext.getMinutes()));
      next.setHours(autoNext.getHours(), autoNext.getMinutes());
    }
    setTempDate(next);
  };

  // Обновление часов
  const updateHours = (newH: number) => {
    const clamped = Math.max(0, Math.min(23, (newH + 24) % 24));
    setHourInput(pad(clamped));
    const next = new Date(tempDate);
    next.setHours(clamped);
    setTempDate(next);
  };

  // Обновление минут
  const updateMinutes = (newM: number) => {
    const clamped = Math.max(0, Math.min(59, (newM + 60) % 60));
    setMinuteInput(pad(clamped));
    const next = new Date(tempDate);
    next.setMinutes(clamped);
    setTempDate(next);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setHourInput(raw);
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val >= 0 && val <= 23) {
      const next = new Date(tempDate);
      next.setHours(val);
      setTempDate(next);
    }
  };

  const handleHourBlur = () => {
    let val = parseInt(hourInput, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 23) val = 23;
    setHourInput(pad(val));
    const next = new Date(tempDate);
    next.setHours(val);
    setTempDate(next);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMinuteInput(raw);
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val >= 0 && val <= 59) {
      const next = new Date(tempDate);
      next.setMinutes(val);
      setTempDate(next);
    }
  };

  const handleMinuteBlur = () => {
    let val = parseInt(minuteInput, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 59) val = 59;
    setMinuteInput(pad(val));
    const next = new Date(tempDate);
    next.setMinutes(val);
    setTempDate(next);
  };

  // Быстрые пресеты
  const applyPreset = (presetType: 'plus1h' | 'today19' | 'tomorrow10' | 'tomorrow18') => {
    const now = new Date();
    let target = new Date();

    if (presetType === 'plus1h') {
      target = new Date(now.getTime() + 60 * 60 * 1000);
      const m = Math.ceil(target.getMinutes() / 5) * 5;
      target.setMinutes(m, 0, 0);
    } else if (presetType === 'today19') {
      target.setHours(19, 0, 0, 0);
      if (target.getTime() <= now.getTime() + 60_000) {
        // если сегодня 19:00 уже прошло — завтра в 19:00
        target.setDate(target.getDate() + 1);
      }
    } else if (presetType === 'tomorrow10') {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    } else if (presetType === 'tomorrow18') {
      target.setDate(target.getDate() + 1);
      target.setHours(18, 0, 0, 0);
    }

    setTempDate(target);
    setHourInput(pad(target.getHours()));
    setMinuteInput(pad(target.getMinutes()));
    setViewMonth(new Date(target.getFullYear(), target.getMonth(), 1));
  };

  // Проверка валидности выбранного момента времени
  const currentSelectedTimestamp = useMemo(() => {
    const h = parseInt(hourInput, 10) || 0;
    const m = parseInt(minuteInput, 10) || 0;
    const d = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), h, m);
    return d.getTime();
  }, [tempDate, hourInput, minuteInput]);

  const isPast = currentSelectedTimestamp <= Date.now() + 60_000;

  // Навигация по месяцам
  const prevMonthDisabled = useMemo(() => {
    const today = new Date();
    return viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() <= today.getMonth();
  }, [viewMonth]);

  const handlePrevMonth = () => {
    if (prevMonthDisabled) return;
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  // Подтверждение выбора
  const handleConfirm = () => {
    if (isPast) return;
    const h = parseInt(hourInput, 10) || 0;
    const m = parseInt(minuteInput, 10) || 0;
    const finalDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), h, m);
    onChange(toInputValue(finalDate));
    setOpen(false);
  };

  // Текстовое представление выбранной даты на кнопке триггера
  const formattedTrigger = useMemo(() => {
    if (!selectedDate) return null;
    return selectedDate.toLocaleString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [selectedDate]);

  // Заголовок текущего временного выбора в модалке
  const tempFormattedHeader = useMemo(() => {
    const h = parseInt(hourInput, 10) || 0;
    const m = parseInt(minuteInput, 10) || 0;
    const d = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), h, m);
    return d.toLocaleString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [tempDate, hourInput, minuteInput]);

  return (
    <div className="w-full">
      {/* Кнопка открытия всплывающего окна */}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={handleOpenModal}
        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:border-primary/60 hover:bg-card/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <CalendarClock className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-micro font-bold uppercase tracking-wider text-fg-tertiary">
              Запланированная дата
            </p>
            <p className="text-body-sm font-semibold text-foreground truncate">
              {formattedTrigger || 'Нажмите, чтобы выбрать дату и время'}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-fg-secondary transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          {selectedDate ? 'Изменить' : 'Выбрать'}
        </span>
      </button>

      {/* Всплывающее окно (Popup Modal) */}
      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm cursor-pointer"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl max-h-[92dvh] cursor-default"
              role="dialog"
              aria-modal="true"
              aria-label="Выбор даты и времени отправки"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Шапка модалки */}
              <div className="flex items-start justify-between border-b border-border p-4 sm:p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-5 text-primary shrink-0" />
                    <h3 className="text-base font-bold text-foreground">
                      Запланировать отправку
                    </h3>
                  </div>
                  <p className="mt-1 text-xs font-medium text-fg-secondary capitalize">
                    {tempFormattedHeader}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-tertiary transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Тело модалки */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Быстрые пресеты */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-fg-tertiary mb-1.5">
                    Быстрый выбор
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset('plus1h')}
                      className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-fg-secondary transition-colors hover:border-primary hover:bg-card hover:text-primary text-center"
                    >
                      +1 час
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('today19')}
                      className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-fg-secondary transition-colors hover:border-primary hover:bg-card hover:text-primary text-center"
                    >
                      Сегодня 19:00
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('tomorrow10')}
                      className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-fg-secondary transition-colors hover:border-primary hover:bg-card hover:text-primary text-center"
                    >
                      Завтра 10:00
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('tomorrow18')}
                      className="rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-fg-secondary transition-colors hover:border-primary hover:bg-card hover:text-primary text-center"
                    >
                      Завтра 18:00
                    </button>
                  </div>
                </div>

                {/* Календарь */}
                <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
                  {/* Переключение месяца */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      disabled={prevMonthDisabled}
                      onClick={handlePrevMonth}
                      aria-label="Предыдущий месяц"
                      className="flex size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                    </button>

                    <p className="text-sm font-bold text-foreground">
                      {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                    </p>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      aria-label="Следующий месяц"
                      className="flex size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-card hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>

                  {/* Дни недели */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {WEEKDAYS.map((w) => (
                      <span
                        key={w}
                        className="py-1 text-[11px] font-bold text-fg-tertiary"
                      >
                        {w}
                      </span>
                    ))}
                  </div>

                  {/* Сетка дней */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((day, idx) => {
                      if (!day) return <span key={`blank-${idx}`} className="size-8" />;
                      const isSelected = sameDay(day, tempDate);
                      const isToday = sameDay(day, new Date());
                      const disabled = isDayDisabled(day);

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          disabled={disabled}
                          onClick={() => pickDay(day)}
                          className={`flex size-8 sm:size-9 mx-auto items-center justify-center rounded-xl text-xs sm:text-sm font-semibold tabular-nums transition-all ${
                            isSelected
                              ? 'bg-primary text-white shadow-sm font-bold'
                              : isToday
                                ? 'border border-primary/50 bg-primary/10 text-primary font-bold'
                                : 'text-foreground hover:bg-card'
                          } disabled:pointer-events-none disabled:opacity-25`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Удобный ввод времени */}
                <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-fg-secondary flex items-center gap-1.5">
                      <Clock className="size-3.5 text-primary" />
                      Точное время
                    </p>
                    <span className="text-[11px] text-fg-tertiary">24-часовой формат</span>
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    {/* Часы */}
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        onClick={() => updateHours((parseInt(hourInput, 10) || 0) + 1)}
                        className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-card hover:text-foreground transition-colors"
                        aria-label="Прибавить час"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={hourInput}
                        onChange={handleHourChange}
                        onBlur={handleHourBlur}
                        onFocus={(e) => e.target.select()}
                        maxLength={2}
                        className="w-16 h-12 text-center text-2xl font-bold rounded-xl border border-border bg-card text-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        aria-label="Часы"
                      />
                      <button
                        type="button"
                        onClick={() => updateHours((parseInt(hourInput, 10) || 0) - 1)}
                        className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-card hover:text-foreground transition-colors"
                        aria-label="Убавить час"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>

                    <span className="text-2xl font-bold text-fg-tertiary -mt-2">:</span>

                    {/* Минуты */}
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        onClick={() => updateMinutes((parseInt(minuteInput, 10) || 0) + 5)}
                        className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-card hover:text-foreground transition-colors"
                        aria-label="Прибавить 5 минут"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={minuteInput}
                        onChange={handleMinuteChange}
                        onBlur={handleMinuteBlur}
                        onFocus={(e) => e.target.select()}
                        maxLength={2}
                        className="w-16 h-12 text-center text-2xl font-bold rounded-xl border border-border bg-card text-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        aria-label="Минуты"
                      />
                      <button
                        type="button"
                        onClick={() => updateMinutes((parseInt(minuteInput, 10) || 0) - 5)}
                        className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-card hover:text-foreground transition-colors"
                        aria-label="Убавить 5 минут"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Быстрые фишки часов */}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-border/60">
                    {QUICK_HOURS.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => {
                          updateHours(q.h);
                          updateMinutes(q.m);
                        }}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors ${
                          parseInt(hourInput, 10) === q.h && parseInt(minuteInput, 10) === q.m
                            ? 'bg-primary text-white font-bold'
                            : 'bg-card border border-border text-fg-secondary hover:border-primary hover:text-foreground'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Предупреждение о времени в прошлом */}
                {isPast && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Выбранное время уже прошло. Укажите время хотя бы на 1 минуту позже текущего.</span>
                  </div>
                )}
              </div>

              {/* Подвал действий */}
              <div className="flex items-center justify-end gap-2 border-t border-border bg-card p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isPast}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Check className="size-4" />
                  Подтвердить время
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
