import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { DeliverySelector } from './DeliverySelector';
import { useAlert } from './AlertProvider';
import { InfoTooltip } from './InfoTooltip';
import { TariffDescriptionEditor } from './TariffDescriptionEditor';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import type { FunnelNode, Tariff } from '../types';

interface PaymentBlockEditorProps {
  node?: FunnelNode;
  botId?: string;
  onChange: <K extends keyof FunnelNode>(field: K, value: FunnelNode[K]) => void;
  paymentMode: 'auto' | 'application' | 'hybrid';
  onPaymentModeChange: (mode: 'auto' | 'application' | 'hybrid') => void;
  managerUrl: string;
  managerText: string;
  onManagerUrlChange: (v: string) => void;
  onManagerTextChange: (v: string) => void;
  onUploadPaymentMedia: (file: File) => Promise<void>;
  onRemovePaymentMedia: () => void;
  onUploadTariffMedia: (tariffId: string, file: File) => Promise<void>;
  onRemoveTariffMedia: (tariffId: string) => void;
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

export const PaymentBlockEditor: React.FC<PaymentBlockEditorProps> = ({ 
  node, botId, onChange, paymentMode, onPaymentModeChange, managerUrl, managerText, onManagerUrlChange, onManagerTextChange,
  onUploadPaymentMedia, onRemovePaymentMedia, onUploadTariffMedia, onRemoveTariffMedia,
}) => {
  const { showConfirm } = useAlert();
  const tariffs: Tariff[] = node?.tariffs || [];
  // Track which tariffs are collapsed (by tariff id)
  const [collapsedTariffs, setCollapsedTariffs] = useState<Set<string>>(() => 
    new Set(tariffs.filter(t => t.name || t.price).map(t => t.id))
  );
  const [activeTab, setActiveTab] = useState<'tariffs' | 'message'>('tariffs');

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
      
      {/* ─── Режим продажи ─── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            Режим продажи
          </span>
          <InfoTooltip
            title="Логика работы воронки"
            text={<>
              <strong>Автопродажа:</strong> онлайн-оплата, доступ автоматически.<br />
              <strong>По заявкам:</strong> кнопка → ЛС менеджера, счёт вручную.<br />
              <strong>Гибрид:</strong> две кнопки — оплата и связь с менеджером.
            </>}
          />
        </div>
        <div className="flex bg-[var(--color-surface-2)] p-1 rounded-xl gap-1"
             role="radiogroup" aria-label="Режим работы воронки">
          {(['auto', 'application', 'hybrid'] as const).map((mode) => {
            const labels = { auto: 'Автопродажа', application: 'По заявкам', hybrid: 'Гибрид' };
            const colors = { auto: 'var(--color-success)', application: '#3b82f6', hybrid: '#a855f7' };
            return (
              <button key={mode} type="button"
                onClick={() => onPaymentModeChange(mode)}
                role="radio" aria-checked={paymentMode === mode}
                className={`flex-1 py-2 px-2 text-[12px] font-bold rounded-lg transition-all
                  flex items-center justify-center gap-1.5 ${
                  paymentMode === mode
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]'
                    : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      style={{ background: colors[mode] }} />
                <span>{labels[mode]}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {(paymentMode === 'application' || paymentMode === 'hybrid') && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="pt-2 border-t border-[var(--color-border)]">
              <label htmlFor="manager-url" className="text-[12px] font-semibold text-[var(--color-foreground-secondary)] block mb-1.5">
                Ссылка на Telegram менеджера
              </label>
              <input id="manager-url" type="text"
                className="input w-full text-[13px] h-9 mb-3"
                value={managerUrl}
                placeholder="@manager или https://t.me/manager"
                onChange={(e) => onManagerUrlChange(e.target.value)} />
              <label htmlFor="manager-text" className="text-[12px] font-semibold text-[var(--color-foreground-secondary)] block mb-1.5">
                Текст для связи
              </label>
              <input id="manager-text" type="text"
                className="input w-full text-[13px] h-9"
                value={managerText}
                placeholder="Хочу узнать подробнее / записаться..."
                onChange={(e) => onManagerTextChange(e.target.value)} />
              <p className="text-[11px] text-[var(--color-foreground-tertiary)] mt-1.5">
                Telegram подставит этот текст в поле ввода клиента при нажатии кнопки.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <hr className="border-[var(--color-border)] my-1" />

      {/* Tab bar — показывается только если тарифов > 1 */}
      {tariffs.length > 1 && (
        <div className="flex bg-[var(--color-surface-2)] p-1 rounded-xl gap-1 border border-[var(--color-border)]">
          {([
            { id: 'tariffs' as const, label: 'Тарифы', badge: tariffs.length },
            { id: 'message' as const, label: 'Перед выбором тарифа' },
          ]).map(tab => (
            <button key={tab.id} type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all
                flex items-center justify-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]'
                  : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'
              }`}
            >
              <span>{tab.label}</span>
              {'badge' in tab && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full font-bold
                                bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Таб: Сообщение (только если тарифов > 1 и активен этот таб) */}
      {tariffs.length > 1 && activeTab === 'message' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--color-surface)]
                     border border-[var(--color-border)] shadow-2xs"
        >
          <div className="flex items-center gap-1.5">
            <label className="text-[13px] font-semibold text-[var(--color-foreground)]" style={{ display: 'block', marginBottom: 0 }}>
              Текст перед выбором тарифа
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
            toolbarAccessory={!node?.mediaFileId ? <MediaAttachmentPicker
              botId={botId} onUpload={onUploadPaymentMedia} onRemove={onRemovePaymentMedia}
              label="Добавить фото или видео" hint="Фото или видео над текстом выбора тарифа. До 20 МБ." triggerOnly
            /> : undefined}
            attachment={node?.mediaFileId ? <MediaAttachmentPicker
              botId={botId}
              assetId={node?.mediaAssetId}
              fileId={node?.mediaFileId}
              mediaType={node?.mediaType === 'photo' || node?.mediaType === 'video' ? node.mediaType : null}
              onUpload={onUploadPaymentMedia}
              onRemove={onRemovePaymentMedia}
              label="Добавить фото или видео"
              hint="Будет показано над текстом выбора тарифа. До 20 МБ."
              embedded
            /> : undefined}
          />
        </motion.div>
      )}

      {/* Таб: Тарифы */}
      <div className={`flex flex-col gap-3 ${(tariffs.length > 1 && activeTab !== 'tariffs') ? 'hidden' : ''}`}>
        {/* Header row */}
        <div className="flex items-center gap-1.5">
          <label className="text-[13px] font-semibold text-[var(--color-foreground)]" style={{ display: 'block', marginBottom: 0 }}>
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
            // Unused variables removed for TS compliance

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
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-colors hover:bg-[var(--color-surface-2)] ${!isCollapsed ? 'border-b border-[var(--color-border)]' : ''}`}
                  onClick={() => toggleCollapse(tariff.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-soft)] flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-[var(--color-primary)]">{index + 1}</span>
                    </div>
                    <div className="min-w-0 flex flex-col justify-center">
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)] truncate leading-tight mb-0.5">
                        {tariff.name || 'Без названия'}
                      </p>
                      <p className="text-[12px] text-[var(--color-foreground-tertiary)] leading-tight">
                        {tariff.price ? `${Number(tariff.price).toLocaleString('ru-RU')} ₽` : 'Цена не задана'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status check if delivery is setup */}
                    {tariff.actionData && isCollapsed && (
                      <CheckCircle2 size={14} className="text-[var(--color-success)]" />
                    )}
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
                    <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.15 }}>
                      <ChevronDown size={15} className="text-[var(--color-foreground-tertiary)]" />
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
                            toolbarAccessory={!tariff.mediaFileId ? <MediaAttachmentPicker
                              botId={botId} onUpload={(file) => onUploadTariffMedia(tariff.id, file)} onRemove={() => onRemoveTariffMedia(tariff.id)}
                              label="Добавить фото или видео к счёту" hint="Фото или видео над описанием счёта. До 20 МБ." triggerOnly
                            /> : undefined}
                            attachment={tariff.mediaFileId ? <MediaAttachmentPicker
                              botId={botId}
                              assetId={tariff.mediaAssetId}
                              fileId={tariff.mediaFileId}
                              mediaType={tariff.mediaType}
                              onUpload={(file) => onUploadTariffMedia(tariff.id, file)}
                              onRemove={() => onRemoveTariffMedia(tariff.id)}
                              label="Добавить фото или видео к счёту"
                              hint="Клиент увидит его над описанием выбранного тарифа. До 20 МБ."
                              embedded
                            /> : undefined}
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
