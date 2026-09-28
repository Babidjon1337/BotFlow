import { useState, useEffect } from 'react';
import { InfoTooltip } from './InfoTooltip';

interface TimerPresetsProps {
  value: string;
  onChange: (value: string) => void;
  presets?: string[];
}

export function parseDelayString(val: string): { hours: number; minutes: number } {
  if (!val) return { hours: 0, minutes: 0 };
  const str = val.trim().toLowerCase();

  const hMatch = str.match(/(\d+)\s*(?:ч|час|часа|часов|h)/i);
  const mMatch = str.match(/(\d+)\s*(?:мин|минут|минуты|минута|м|m)/i);

  let hours = hMatch ? parseInt(hMatch[1], 10) : 0;
  let minutes = mMatch ? parseInt(mMatch[1], 10) : 0;

  if (!hMatch && !mMatch) {
    const num = parseInt(str, 10);
    if (!isNaN(num)) {
      hours = num;
    }
  }

  return {
    hours: isNaN(hours) ? 0 : Math.max(0, hours),
    minutes: isNaN(minutes) ? 0 : Math.max(0, Math.min(59, minutes)),
  };
}

export function buildDelayString(hours: number, minutes: number): string {
  const h = Math.max(0, hours || 0);
  const m = Math.max(0, Math.min(59, minutes || 0));
  if (h > 0 && m > 0) {
    return `${h}ч ${m} мин`;
  }
  if (h > 0) {
    return `${h}ч`;
  }
  if (m > 0) {
    return `${m} мин`;
  }
  return '0 мин';
}

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs >= 11 && abs <= 19) return `${n} ${many}`;
  if (rem === 1) return `${n} ${one}`;
  if (rem >= 2 && rem <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function formatDelayDescription(val: string): string {
  const { hours, minutes } = parseDelayString(val);
  if (hours > 0 && minutes > 0) {
    return `через ${pluralizeRu(hours, 'час', 'часа', 'часов')} ${pluralizeRu(minutes, 'минуту', 'минуты', 'минут')}`;
  }
  if (hours > 0) {
    return `через ${pluralizeRu(hours, 'час', 'часа', 'часов')}`;
  }
  if (minutes > 0) {
    return `через ${pluralizeRu(minutes, 'минуту', 'минуты', 'минут')}`;
  }
  return 'сразу';
}

export function formatDelayLabel(val?: string | null): string {
  if (!val) return '1ч';
  const trimmed = val.trim();
  const { hours, minutes } = parseDelayString(trimmed);
  if (hours === 0 && minutes === 0) {
    if (/^0\s*(?:м|мин|m)?$/i.test(trimmed)) return '0 мин';
    return trimmed;
  }
  return buildDelayString(hours, minutes);
}

export const DEFAULT_TIMER_PRESETS = ['1 мин', '15 мин', '30 мин', '1ч', '6ч', '12ч', '24ч'];

export const TimerPresets = ({
  value,
  onChange,
  presets = DEFAULT_TIMER_PRESETS,
}: TimerPresetsProps) => {
  const normalizedValue = formatDelayLabel(value);
  const isCustom = !presets.includes(value) && !presets.includes(normalizedValue) && Boolean(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  const parsed = parseDelayString(value);
  const [inputHours, setInputHours] = useState<number | ''>(
    parsed.hours || (parsed.minutes === 0 && !isCustom ? 1 : 0)
  );
  const [inputMinutes, setInputMinutes] = useState<number | ''>(parsed.minutes || 0);

  useEffect(() => {
    const p = parseDelayString(value);
    const norm = formatDelayLabel(value);
    const custom = !presets.includes(value) && !presets.includes(norm) && Boolean(value);
    setInputHours(p.hours || (p.minutes === 0 && !custom ? 0 : p.hours));
    setInputMinutes(p.minutes || 0);
    if (custom) {
      setShowCustom(true);
    }
  }, [value, presets]);

  const handleHoursChange = (hVal: string) => {
    const num = parseInt(hVal, 10);
    const safeH = isNaN(num) ? '' : Math.max(0, Math.min(720, num));
    setInputHours(safeH);
    const h = typeof safeH === 'number' ? safeH : 0;
    const m = typeof inputMinutes === 'number' ? inputMinutes : 0;
    onChange(buildDelayString(h, m));
  };

  const handleMinutesChange = (mVal: string) => {
    const num = parseInt(mVal, 10);
    const safeM = isNaN(num) ? '' : Math.max(0, Math.min(59, num));
    setInputMinutes(safeM);
    const h = typeof inputHours === 'number' ? inputHours : 0;
    const m = typeof safeM === 'number' ? safeM : 0;
    onChange(buildDelayString(h, m));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-foreground">Отправить через</label>
          <InfoTooltip
            title="Задержка отправки"
            text="Время (в часах и минутах), через которое бот автоматически отправит это сообщение пользователю, если он не купил после предыдущего шага."
          />
        </div>
        <span className="text-[11px] font-medium text-primary">
          {formatDelayDescription(value || (presets[0] || '1ч'))}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const isSelected = (value === preset || normalizedValue === preset) && !showCustom;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setShowCustom(false);
                onChange(preset);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-card border border-border text-fg-secondary hover:text-foreground hover:border-border-strong'
              }`}
            >
              {preset}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setShowCustom(true);
            if (!isCustom) {
              const h = typeof inputHours === 'number' ? inputHours : 1;
              const m = typeof inputMinutes === 'number' ? inputMinutes : 30;
              onChange(buildDelayString(h, m));
            }
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            showCustom
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
              : 'bg-card border border-border text-fg-secondary hover:text-foreground hover:border-border-strong'
          }`}
        >
          Своё
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-xs">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="720"
              placeholder="0"
              value={inputHours}
              onChange={(e) => handleHoursChange(e.target.value)}
              className="h-8 w-14 rounded-lg border border-border bg-card text-center font-bold text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-fg-secondary font-medium">ч</span>
          </div>

          <span className="text-fg-tertiary font-bold">+</span>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="59"
              placeholder="0"
              value={inputMinutes}
              onChange={(e) => handleMinutesChange(e.target.value)}
              className="h-8 w-14 rounded-lg border border-border bg-card text-center font-bold text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-fg-secondary font-medium">мин</span>
          </div>

          <span className="text-[11px] text-fg-tertiary ml-1.5 font-normal">
            (укажите часы и минуты)
          </span>
        </div>
      )}
    </div>
  );
};
