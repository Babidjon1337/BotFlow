import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { DeliverySelector } from './DeliverySelector';
import { InfoTooltip } from './InfoTooltip';
import type { FunnelNode, Tariff } from '../types';

interface PaymentBlockEditorProps {
  node?: FunnelNode;
  onChange: (field: keyof FunnelNode, value: any) => void;
}

export const PaymentBlockEditor: React.FC<PaymentBlockEditorProps> = ({ node, onChange }) => {
  const tariffs: Tariff[] = node?.tariffs || [];

  const updateTariffs = (newTariffs: Tariff[]) => onChange('tariffs', newTariffs);

  const addTariff = () => {
    updateTariffs([
      ...tariffs,
      {
        id: `t_${Date.now()}`,
        name: '',
        price: 0,
        description: '',
        hasDelivery: true,
        actionType: 'link',
        actionData: ''
      }
    ]);
  };

  const removeTariff = (id: string) => {
    updateTariffs(tariffs.filter(t => t.id !== id));
  };

  const updateTariff = (id: string, field: keyof Tariff, value: any) => {
    updateTariffs(tariffs.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tariff selection message — only when multiple tariffs */}
      {tariffs.length > 1 && (
        <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs">
          <div className="flex items-center gap-1.5">
            <label className="text-label" style={{ display: 'block', marginBottom: 0 }}>
              Сообщение перед выбором тарифа
            </label>
            <InfoTooltip
              title="Меню выбора тарифа"
              text={`Показывается клиенту при нажатии кнопки покупки, чтобы он выбрал один из ${tariffs.length} тарифов.`}
            />
          </div>
          <textarea
            className="textarea w-full font-normal"
            style={{
              minHeight: '60px',
              padding: '10px 14px',
              borderRadius: '10px',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              resize: 'none',
              overflow: 'hidden',
            }}
            value={node?.tariffSelectionText || ''}
            placeholder="Выберите подходящий тариф ниже:"
            onChange={e => onChange('tariffSelectionText', e.target.value)}
            onInput={(e) => {
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
            }}
            onFocus={(e) => {
              if (window.innerWidth <= 768) {
                setTimeout(() => {
                  e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
              }
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center gap-1.5">
          <label className="text-label" style={{ display: 'block', marginBottom: 0 }}>
            Тарифы и стоимость
          </label>
          <InfoTooltip
            title="Настройка тарифов"
            text="Укажите стоимость и что именно клиент получит после оплаты — ссылку на канал, инвайт или файл."
          />
        </div>

        <AnimatePresence>
          {tariffs.map((tariff, index) => (
            <motion.div
              key={tariff.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-4 p-4 md:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs relative"
            >
              {/* Tariff header */}
              <div className="flex justify-between items-center pb-2 border-b border-[var(--color-border)]">
                <span className="text-[12px] font-bold text-[var(--color-primary)] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block" />
                  Тариф {index + 1}
                </span>
                {tariffs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTariff(tariff.id)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-lg hover:opacity-80 transition-opacity"
                    title="Удалить тариф"
                  >
                    <Trash2 size={13} />
                    <span>Удалить</span>
                  </button>
                )}
              </div>

              {/* Name + Price row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Название тарифа
                  </label>
                  <input
                    type="text"
                    className="input w-full font-medium"
                    style={{ height: '40px' }}
                    value={tariff.name}
                    placeholder="VIP доступ"
                    onChange={e => updateTariff(tariff.id, 'name', e.target.value)}
                    onFocus={(e) => {
                      if (window.innerWidth <= 768) {
                        setTimeout(() => {
                          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Стоимость (руб.)
                  </label>
                  <input
                    type="number"
                    className="input w-full font-bold"
                    style={{ height: '40px', color: 'var(--color-primary)' }}
                    value={tariff.price || ''}
                    placeholder="1990"
                    onChange={e => updateTariff(tariff.id, 'price', e.target.value)}
                    onFocus={(e) => {
                      if (window.innerWidth <= 768) {
                        setTimeout(() => {
                          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>
                  Что входит в тариф (описание для клиента)
                </label>
                <textarea
                  className="textarea w-full font-normal"
                  style={{
                    minHeight: '68px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                    resize: 'none',
                    overflow: 'hidden',
                  }}
                  value={tariff.description}
                  placeholder="Опишите, что входит в тариф..."
                  onChange={e => updateTariff(tariff.id, 'description', e.target.value)}
                  onInput={(e) => {
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                  }}
                  onFocus={(e) => {
                    if (window.innerWidth <= 768) {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 300);
                    }
                  }}
                />
              </div>

              {/* Delivery block */}
              <div className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] overflow-hidden mt-1">
                <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-1.5">
                    <label
                      className="text-[13px] font-semibold text-[var(--color-foreground)] cursor-pointer"
                      onClick={() => updateTariff(tariff.id, 'hasDelivery', tariff.hasDelivery === false ? true : false)}
                    >
                      Выдача доступа после оплаты
                    </label>
                    <InfoTooltip
                      title="Автоматическая выдача"
                      text="После успешной оплаты бот сам выдаст пользователю доступ — ссылку, инвайт в канал или файл."
                    />
                  </div>
                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={tariff.hasDelivery !== false}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${tariff.hasDelivery !== false ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
                    onClick={() => updateTariff(tariff.id, 'hasDelivery', tariff.hasDelivery === false ? true : false)}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${tariff.hasDelivery !== false ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
                <AnimatePresence>
                  {tariff.hasDelivery !== false && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3.5">
                        <DeliverySelector
                          value={tariff.actionType as any}
                          onChange={(type) => updateTariff(tariff.id, 'actionType', type)}
                          deliveryValue={tariff.actionData}
                          onDeliveryValueChange={(val) => updateTariff(tariff.id, 'actionData', val)}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          type="button"
          onClick={addTariff}
          className="flex items-center justify-center gap-2 w-full h-11 border border-dashed border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-soft)] rounded-xl text-[13px] font-bold hover:opacity-90 active:scale-[0.99] transition-all shadow-2xs mt-1"
        >
          <Plus size={16} /> Добавить еще один тариф
        </button>
      </div>
    </div>
  );
};
