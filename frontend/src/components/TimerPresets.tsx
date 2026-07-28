import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

interface TimerPresetsProps {
  value: string;
  onChange: (value: string) => void;
  presets: string[];
}

export const TimerPresets = ({ value, onChange, presets }: TimerPresetsProps) => {
  const isCustom = !presets.includes(value) && value !== '';
  const [showCustom, setShowCustom] = useState(isCustom);

  const numericVal = parseInt(value) || '';

  const btnBase: React.CSSProperties = {
    height: '32px',
    padding: '0 12px',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    border: '1px solid',
    transition: 'all 150ms ease',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  const activeBtn: React.CSSProperties = {
    ...btnBase,
    borderColor: 'var(--color-primary)',
    background: 'var(--color-primary-soft)',
    color: 'var(--color-primary)',
    fontWeight: 600,
  };

  const inactiveBtn: React.CSSProperties = {
    ...btnBase,
    borderColor: 'var(--color-border)',
    background: 'transparent',
    color: 'var(--color-foreground-secondary)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="flex items-center gap-1">
        <label className="text-label">Отправить через</label>
        <InfoTooltip
          title="Задержка отправки"
          text="Время (в часах) через которое бот автоматически отправит это сообщение пользователю, если он не купил после предыдущего шага."
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {presets.map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => { setShowCustom(false); onChange(preset); }}
            style={value === preset && !showCustom ? activeBtn : inactiveBtn}
          >
            {preset}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowCustom(true);
            if (!isCustom) onChange('2ч');
          }}
          style={showCustom ? activeBtn : inactiveBtn}
        >
          Своё
        </button>
      </div>
      {showCustom && (
        <div className="relative mt-0.5" style={{ width: '140px' }}>
          <input
            type="number"
            min="1"
            max="720"
            placeholder="Кол-во часов"
            value={numericVal}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val ? `${val}ч` : '');
            }}
            className="input w-full pr-8 text-[13px] font-medium"
            style={{ height: '34px' }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold pointer-events-none" style={{ color: 'var(--color-primary)' }}>
            ч
          </span>
        </div>
      )}
    </div>
  );
};
