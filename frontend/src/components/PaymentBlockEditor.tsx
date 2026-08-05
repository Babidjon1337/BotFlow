import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { DeliverySelector } from './DeliverySelector';
import { useAlert } from './AlertProvider';
import { InfoTooltip } from './InfoTooltip';
import { TariffDescriptionEditor } from './TariffDescriptionEditor';
import type { FunnelNode, Tariff } from '../types';

interface PaymentBlockEditorProps {
  node?: FunnelNode;
  botId?: string;
  onChange: <K extends keyof FunnelNode>(field: K, value: FunnelNode[K]) => void;
}

const MAX_TARIFF_SELECTION_CHARACTERS = 4096;

// Simple toggle switch
const Toggle = ({ checked, onToggle }: { checked: boolean; onToggle: () => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`}
    />
  </button>
);

export const PaymentBlockEditor: React.FC<PaymentBlockEditorProps> = ({ node, botId, onChange }) => {
  const { showConfirm } = useAlert();
  const tariffs: Tariff[] = node?.tariffs || [];
  // Track which tariffs are collapsed (by tariff id)
  const [collapsedTariffs, setCollapsedTariffs] = useState<Set<string>>(new Set());

  const updateTariffs = (newTariffs: Tariff[]) => onChange('tariffs', newTariffs);

  const addTariff = () => {
    const newId = `t_${Date.now()}`;
    updateTariffs([
      ...tariffs,
      {
        id: newId,
        name: '',
        price: 0,
        description: '',
        hasDelivery: true,
        actionType: 'link',
        actionData: '',
      },
    ]);
  };

  const removeTariff = (id: string) => {
    updateTariffs(tariffs.filter((t) => t.id !== id));
    setCollapsedTariffs((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const updateTariff = <K extends keyof Tariff>(id: string, field: K, value: Tariff[K]) => {
    updateTariffs(tariffs.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const updateTariffFields = (id: string, updates: Partial<Tariff>) => {
    updateTariffs(tariffs.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const toggleCollapse = (id: string) => {
    setCollapsedTariffs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
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
          <TariffDescriptionEditor
            value={node?.tariffSelectionText || ''}
            placeholder="Выберите подходящий тариф ниже:"
            helperText="Сообщение для клиента"
            maxCharacters={MAX_TARIFF_SELECTION_CHARACTERS}
            onChange={(value) => onChange('tariffSelectionText', value)}
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
            text="Укажите стоимость и что именно клиент получит после оплаты — ссылку, инвайт в канал или файл."
          />
        </div>

        <AnimatePresence>
          {tariffs.map((tariff, index) => {
            const isCollapsed = collapsedTariffs.has(tariff.id);
            const tariffLabel = tariff.name
              ? tariff.name
              : `Тариф ${index + 1}`;
            const priceLabel = tariff.price
              ? ` · ${Number(tariff.price).toLocaleString('ru-RU')} ₽`
              : '';

            return (
              <motion.div
                key={tariff.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs overflow-hidden"
              >
                {/* ── Tariff header (click to collapse) ── */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors"
                  onClick={() => toggleCollapse(tariff.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0" />
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)] truncate">
                      {tariffLabel}
                      <span className="text-[var(--color-primary)]">{priceLabel}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tariffs.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirm({
                            title: 'Удалить тариф?',
                            message: `Вы уверены, что хотите удалить тариф "${tariff.name || 'Без названия'}"? Это действие нельзя отменить.`,
                            confirmText: 'Удалить',
                            cancelText: 'Отмена',
                            onConfirm: () => removeTariff(tariff.id)
                          });
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-lg hover:opacity-80 transition-opacity"
                        title="Удалить тариф"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                      <ChevronDown size={16} className="text-[var(--color-foreground-tertiary)]" />
                    </motion.div>
                  </div>
                </div>

                {/* ── Tariff body ── */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="flex flex-col gap-4 p-4 md:p-5">
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
                              maxLength={128}
                              placeholder="VIP доступ"
                              onChange={(e) => updateTariff(tariff.id, 'name', e.target.value)}
                              onFocus={(e) => {
                                if (window.innerWidth <= 768) {
                                  setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
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
                              onChange={(e) => updateTariff(tariff.id, 'price', e.target.value)}
                              onFocus={(e) => {
                                if (window.innerWidth <= 768) {
                                  setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
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
                          <TariffDescriptionEditor
                            value={tariff.description}
                            onChange={(value) => updateTariff(tariff.id, 'description', value)}
                          />
                        </div>



                        {/* ── Delivery block ── */}
                        <div className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] overflow-hidden">
                          <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--color-border)]">
                            <div className="flex items-center gap-1.5">
                              <label
                                className="text-[13px] font-semibold text-[var(--color-foreground)] cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); updateTariff(tariff.id, 'hasDelivery', tariff.hasDelivery === false ? true : false); }}
                              >
                                Выдача доступа после оплаты
                              </label>
                              <InfoTooltip
                                title="Автоматическая выдача"
                                text="После успешной оплаты бот сам выдаст пользователю доступ — ссылку, инвайт в канал или файл."
                              />
                            </div>
                            <Toggle
                              checked={tariff.hasDelivery !== false}
                              onToggle={() => updateTariff(tariff.id, 'hasDelivery', tariff.hasDelivery === false ? true : false)}
                            />
                          </div>
                          <AnimatePresence>
                            {tariff.hasDelivery !== false && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="p-3.5">
                                  <DeliverySelector
                                    value={tariff.actionType === 'group' ? 'invite' : tariff.actionType === 'text' ? 'link' : tariff.actionType}
                                    onChange={(type, clearValue) => {
                                      const newType = type === 'invite' ? 'group' : type;
                                      if (clearValue) {
                                        updateTariffFields(tariff.id, { actionType: newType, actionData: '' });
                                      } else {
                                        updateTariff(tariff.id, 'actionType', newType);
                                      }
                                    }}
                                    deliveryValue={tariff.actionData}
                                    onDeliveryValueChange={(val) => updateTariff(tariff.id, 'actionData', val)}
                                    chatAccessMode={tariff.chatAccessMode}
                                    onChatAccessModeChange={(value) => updateTariff(tariff.id, 'chatAccessMode', value)}

                                    onBatchUpdate={(actionData, chatType) => updateTariffFields(tariff.id, { actionData, chatType })}
                                    botId={botId}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <button
          type="button"
          onClick={addTariff}
          className="flex items-center justify-center gap-2 w-full h-11 border border-dashed border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-soft)] rounded-xl text-[13px] font-bold hover:opacity-90 active:scale-[0.99] transition-all shadow-2xs mt-1"
        >
          <Plus size={16} /> Добавить ещё один тариф
        </button>
      </div>
    </div>
  );
};
