import { Link2, MailPlus, FileBox, Info } from 'lucide-react';
import type { DeliveryType } from '../types';

interface DeliverySelectorProps {
  value: DeliveryType;
  onChange: (type: DeliveryType) => void;
  deliveryValue: string;
  onDeliveryValueChange: (val: string) => void;
}

const OPTIONS: { id: DeliveryType; icon: React.FC<any>; label: string }[] = [
  { id: 'link',   icon: Link2,   label: 'Ссылка' },
  { id: 'invite', icon: MailPlus, label: 'Инвайт' },
  { id: 'file',   icon: FileBox,  label: 'Файл' },
];

export const DeliverySelector = ({ value, onChange, deliveryValue, onDeliveryValueChange }: DeliverySelectorProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <label className="text-label">Тип выдачи</label>

      {/* Segmented control */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          padding: '4px',
          background: 'var(--color-surface-2)',
          borderRadius: '10px',
        }}
      >
        {OPTIONS.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              height: '34px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: value === opt.id ? 600 : 400,
              cursor: 'pointer',
              border: 'none',
              background: value === opt.id ? 'var(--color-surface)' : 'transparent',
              color: value === opt.id ? 'var(--color-foreground)' : 'var(--color-foreground-secondary)',
              boxShadow: value === opt.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            <opt.icon size={14} strokeWidth={1.75} />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Type-specific input */}
      <div>
        {value === 'link' && (
          <input
            type="url"
            placeholder="https://t.me/+"
            value={deliveryValue}
            onChange={(e) => onDeliveryValueChange(e.target.value)}
            onFocus={(e) => {
              if (window.innerWidth <= 768) { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }
            }}
            className="input w-full"
          />
        )}
        {value === 'invite' && (
          <div className="flex flex-col gap-2.5">
            <input
              type="text"
              placeholder="ID или @username канала/группы (напр. @my_closed_club)"
              value={deliveryValue}
              onChange={(e) => onDeliveryValueChange(e.target.value)}
              onFocus={(e) => {
                if (window.innerWidth <= 768) { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }
              }}
              className="input w-full font-medium"
            />
            <div
              className="flex flex-col gap-2 p-3 bg-[var(--color-primary-soft)] rounded-xl text-[12px] text-[var(--color-primary)] leading-relaxed border border-[var(--color-primary)]/10"
            >
              <div className="flex items-center gap-1.5 font-bold text-[13px]">
                <Info size={16} className="shrink-0" />
                <span>Что нужно сделать для выдачи инвайта:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[var(--color-foreground)] font-normal opacity-90">
                <li><strong>Шаг 1 (Что сделать):</strong> Добавьте вашего бота в закрытый канал или группу как <b>Администратора</b> и обязательно включите ему право <i>«Пригласительные ссылки»</i>.</li>
                <li><strong>Шаг 2 (Что будет):</strong> После оплаты бот автоматически создаст <b>персональную одноразовую ссылку</b> и отправит её покупателю. Как только клиент войдёт в канал, ссылка сгорит, поэтому её нельзя передать третьим лицам!</li>
              </ul>
            </div>
          </div>
        )}
        {value === 'file' && (
          <div
            style={{
              padding: '20px',
              border: '1.5px dashed var(--color-border-strong)',
              borderRadius: '12px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            className="hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '3px' }}>
              Загрузить файл
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-foreground-tertiary)' }}>
              PDF, DOCX, ZIP · до 50 МБ
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
