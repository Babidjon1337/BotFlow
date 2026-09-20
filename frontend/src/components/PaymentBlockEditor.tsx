import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  Megaphone,
  Users,
  FileText,
  Link2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAlert } from './AlertProvider';
import { InfoTooltip } from './InfoTooltip';
import { TariffDescriptionEditor } from './TariffDescriptionEditor';
import { TariffEditorModal } from './sheets/TariffEditorModal';
import { apiService } from '../services/api';
import type { FunnelNode, Tariff } from '../types';
import type { TariffItem, TariffDeliverable } from '../types/tariff';
import {
  mapBackendTariff,
  toBackendPayload,
  tariffItemToTariff,
  tariffToTariffItem,
} from '../utils/tariffMappers';

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
  onUploadTariffMedia?: (tariffId: string, file: File) => Promise<void>;
  onUploadLargeTariffMedia?: (tariffId: string, file?: File) => void;
  onRemoveTariffMedia?: (tariffId: string) => void;
}

const MAX_TARIFF_SELECTION_CHARACTERS = 4096;

function getPeriodSuffix(period?: string): string {
  switch (period) {
    case 'week':
      return '/ нед';
    case '3months':
      return '/ 3 мес';
    case 'year':
      return '/ год';
    case 'month':
    default:
      return '/ мес';
  }
}

function renderDeliverableBadges(deliverables: TariffDeliverable[]) {
  if (!deliverables || deliverables.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)]">
        Без выдачи
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      {deliverables.map((d) => {
        if (d.type === 'channel') {
          return (
            <span
              key={d.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              title={d.title}
            >
              <Megaphone size={11} className="shrink-0" />
              <span className="truncate max-w-[130px]">{d.title || 'Канал'}</span>
            </span>
          );
        }
        if (d.type === 'group') {
          return (
            <span
              key={d.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
              title={d.title}
            >
              <Users size={11} className="shrink-0" />
              <span className="truncate max-w-[130px]">{d.title || 'Чат'}</span>
            </span>
          );
        }
        if (d.type === 'file') {
          return (
            <span
              key={d.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
              title={d.title}
            >
              <FileText size={11} className="shrink-0" />
              <span className="truncate max-w-[130px]">{d.fileName || d.title || 'Файл'}</span>
            </span>
          );
        }
        return (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            title={d.title}
          >
            <Link2 size={11} className="shrink-0" />
            <span className="truncate max-w-[130px]">{d.title || 'Ссылка'}</span>
          </span>
        );
      })}
    </div>
  );
}

export const PaymentBlockEditor: React.FC<PaymentBlockEditorProps> = ({
  node,
  botId,
  onChange,
  paymentMode,
  onPaymentModeChange,
  managerUrl,
  managerText,
  onManagerUrlChange,
  onManagerTextChange,
  onUploadPaymentMedia,
  onRemovePaymentMedia,
}) => {
  const { showConfirm } = useAlert();

  const [catalogTariffs, setCatalogTariffs] = useState<TariffItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal editor state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTariff, setEditingTariff] = useState<TariffItem | null>(null);

  // Load catalog tariffs
  useEffect(() => {
    let cancelled = false;

    const loadTariffs = async () => {
      if (!botId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      try {
        let loaded: TariffItem[] = [];
        try {
          const res = await apiService.getTariffs(botId);
          const rawList = Array.isArray(res) ? res : res?.tariffs;
          if (Array.isArray(rawList)) {
            loaded = rawList.map((t, idx) =>
              mapBackendTariff(t as unknown as Record<string, unknown>, idx)
            );
          }
        } catch (err) {
          console.warn('Dedicated getTariffs failed, falling back to node tariffs:', err);
        }

        // Merge existing tariffs from node if not present in catalog
        const nodeTariffs = node?.tariffs || [];
        const mappedNodeTariffs = nodeTariffs.map((t, idx) => tariffToTariffItem(t, idx));

        const merged = [...loaded];
        for (const item of mappedNodeTariffs) {
          if (!merged.some((m) => m.id === item.id)) {
            merged.push(item);
          }
        }

        if (!cancelled) {
          setCatalogTariffs(merged);
        }
      } catch (err) {
        console.error('Failed to load catalog tariffs:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadTariffs();

    return () => {
      cancelled = true;
    };
  }, [botId]);

  const selectedTariffs: Tariff[] = node?.tariffs || [];
  const selectedIds = new Set(selectedTariffs.map((t) => t.id));
  const selectedCount = selectedTariffs.length;

  const handleToggleTariff = (item: TariffItem) => {
    const isChecked = selectedIds.has(item.id);
    let nextTariffs: Tariff[];

    if (isChecked) {
      nextTariffs = selectedTariffs.filter((t) => t.id !== item.id);
    } else {
      nextTariffs = [...selectedTariffs, tariffItemToTariff(item)];
      if (nextTariffs.length >= 2 && !node?.tariffSelectionText?.trim()) {
        onChange('tariffSelectionText', 'Выберите подходящий тариф:');
      }
    }

    onChange('tariffs', nextTariffs);
  };

  const handleOpenCreateModal = () => {
    setEditingTariff(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: TariffItem) => {
    setEditingTariff(item);
    setIsModalOpen(true);
  };

  const handleSaveModalTariff = async (savedItem: TariffItem) => {
    if (!botId) return;
    const isEdit = catalogTariffs.some((t) => t.id === savedItem.id);
    const payload = toBackendPayload(savedItem);

    let finalItem = savedItem;
    try {
      if (isEdit) {
        const res = await apiService.updateTariff(
          botId,
          savedItem.id,
          payload as unknown as Partial<TariffItem>
        );
        if (res) {
          finalItem = mapBackendTariff(res as unknown as Record<string, unknown>);
        }
      } else {
        const res = await apiService.createTariff(
          botId,
          payload as unknown as Partial<TariffItem>
        );
        if (res) {
          finalItem = mapBackendTariff(res as unknown as Record<string, unknown>);
        }
      }
    } catch (err) {
      console.error('Error saving tariff via API:', err);
    }

    setCatalogTariffs((prev) => {
      const exists = prev.some((t) => t.id === finalItem.id);
      if (exists) {
        return prev.map((t) => (t.id === finalItem.id ? finalItem : t));
      }
      return [...prev, finalItem];
    });

    const isCurrentlySelected = selectedIds.has(finalItem.id);
    const converted = tariffItemToTariff(finalItem);

    if (!isEdit) {
      // Auto-select newly created tariff into the funnel step
      const next = [...selectedTariffs, converted];
      onChange('tariffs', next);
      if (next.length >= 2 && !node?.tariffSelectionText?.trim()) {
        onChange('tariffSelectionText', 'Выберите подходящий тариф:');
      }
    } else if (isCurrentlySelected) {
      // Update selected tariff data
      const next = selectedTariffs.map((t) => (t.id === finalItem.id ? converted : t));
      onChange('tariffs', next);
    }
  };

  const handleDeleteTariff = (item: TariffItem) => {
    showConfirm({
      title: 'Удалить тариф?',
      message: `Вы уверены, что хотите удалить тариф «${item.name || 'Без названия'}»? Он будет удалён из каталога и этого шага воронки.`,
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      onConfirm: async () => {
        if (botId) {
          try {
            await apiService.deleteTariff(botId, item.id);
          } catch (err) {
            console.error('Failed to delete tariff:', err);
          }
        }
        setCatalogTariffs((prev) => prev.filter((t) => t.id !== item.id));
        if (selectedIds.has(item.id)) {
          const next = selectedTariffs.filter((t) => t.id !== item.id);
          onChange('tariffs', next);
        }
      },
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
            text={
              <>
                <strong>Автопродажа:</strong> онлайн-оплата, доступ автоматически.
                <br />
                <strong>По заявкам:</strong> кнопка → ЛС менеджера, счёт вручную.
                <br />
                <strong>Гибрид:</strong> две кнопки — оплата и связь с менеджером.
              </>
            }
          />
        </div>
        <div
          className="flex bg-[var(--color-surface-2)] p-1 rounded-xl gap-1"
          role="radiogroup"
          aria-label="Режим работы воронки"
        >
          {(['auto', 'application', 'hybrid'] as const).map((mode) => {
            const labels = {
              auto: 'Автопродажа',
              application: 'По заявкам',
              hybrid: 'Гибрид',
            };
            const mobileLabels = { auto: 'Авто', application: 'Заявки', hybrid: 'Гибрид' };
            const colors = {
              auto: 'var(--color-success)',
              application: '#3b82f6',
              hybrid: '#a855f7',
            };
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onPaymentModeChange(mode)}
                role="radio"
                aria-checked={paymentMode === mode}
                className={`flex-1 min-w-0 whitespace-nowrap py-2 px-1 text-[12px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  paymentMode === mode
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-foreground)]'
                    : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ background: colors[mode] }}
                />
                <span className="sm:hidden">{mobileLabels[mode]}</span>
                <span className="hidden sm:inline">{labels[mode]}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {(paymentMode === 'application' || paymentMode === 'hybrid') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-2 border-t border-[var(--color-border)]"
            >
              <label
                htmlFor="manager-url"
                className="text-[12px] font-semibold text-[var(--color-foreground-secondary)] block mb-1.5"
              >
                Ссылка на Telegram менеджера
              </label>
              <input
                id="manager-url"
                type="text"
                className="input w-full text-[13px] h-9 mb-3"
                value={managerUrl}
                placeholder="@manager или https://t.me/manager"
                onChange={(e) => onManagerUrlChange(e.target.value)}
              />
              <label
                htmlFor="manager-text"
                className="text-[12px] font-semibold text-[var(--color-foreground-secondary)] block mb-1.5"
              >
                Текст для связи
              </label>
              <input
                id="manager-text"
                type="text"
                className="input w-full text-[13px] h-9"
                value={managerText}
                placeholder="Хочу узнать подробнее / записаться..."
                onChange={(e) => onManagerTextChange(e.target.value)}
              />
              <p className="text-[11px] text-[var(--color-foreground-tertiary)] mt-1.5">
                Telegram подставит этот текст в поле ввода клиента при нажатии кнопки связи.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <hr className="border-[var(--color-border)] my-1" />

      {/* ─── Выбор тарифов из каталога ─── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <label
              className="text-[13px] font-semibold text-[var(--color-foreground)]"
              style={{ display: 'block', marginBottom: 0 }}
            >
              Тарифы на шаге продажи
            </label>
            <InfoTooltip
              title="Тарифы воронки"
              text="Отметьте галочками тарифы, которые будут предложены клиенту на этом шаге. При выборе 2 и более тарифов бот предложит меню выбора."
            />
          </div>
          <span className="text-[11px] font-medium text-[var(--color-foreground-tertiary)]">
            Выбрано: {selectedCount}
          </span>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-[var(--color-foreground-secondary)] gap-2">
            <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
            <span className="text-xs">Загрузка тарифов...</span>
          </div>
        )}

        {/* Empty Catalog Notice */}
        {!isLoading && catalogTariffs.length === 0 && (
          <div className="flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50">
            <p className="text-[13px] font-medium text-[var(--color-foreground)] mb-1">
              У вас пока нет созданных тарифов
            </p>
            <p className="text-[11px] text-[var(--color-foreground-tertiary)] max-w-xs mb-3">
              Создайте первый тариф с ценой и автоматической выдачей доступа (канал, чат, файл или ссылка).
            </p>
          </div>
        )}

        {/* Catalog Tariffs Checkbox List */}
        {!isLoading && catalogTariffs.length > 0 && (
          <div className="flex flex-col gap-2">
            {catalogTariffs.map((item) => {
              const isChecked = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleTariff(item)}
                  className={`group relative flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]/25 shadow-2xs'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/50'
                  }`}
                >
                  {/* Custom Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isChecked
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-2xs'
                          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] group-hover:border-[var(--color-primary)]'
                      }`}
                    >
                      {isChecked && <Check size={13} strokeWidth={3} />}
                    </div>
                  </div>

                  {/* Tariff Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)] truncate leading-snug">
                        {item.name || 'Без названия'}
                      </p>
                      <span className="font-accent text-[13px] font-bold tabular-nums text-[var(--color-primary)] shrink-0">
                        {item.price ? `${item.price.toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                        {item.paymentType === 'subscription' && (
                          <span className="text-[11px] font-medium text-[var(--color-foreground-tertiary)] ml-1">
                            {getPeriodSuffix(item.billingPeriod)}
                          </span>
                        )}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-[var(--color-foreground-secondary)] line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    )}

                    {/* Deliverable Badges */}
                    {renderDeliverableBadges(item.deliverables)}
                  </div>

                  {/* Actions (Pencil & Trash) */}
                  <div className="flex items-center gap-1 shrink-0 ml-1 pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      className="p-1.5 rounded-lg text-[var(--color-foreground-tertiary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors"
                      title="Редактировать тариф"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTariff(item)}
                      className="p-1.5 rounded-lg text-[var(--color-foreground-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors"
                      title="Удалить тариф"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 0 Tariffs Selected Warning */}
        {selectedCount === 0 && !isLoading && catalogTariffs.length > 0 && (
          <div className="p-3 rounded-xl border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)]/40 text-[12px] text-[var(--color-warning)] flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Отметьте хотя бы один тариф, который будет предложен на этом шаге воронки.</span>
          </div>
        )}

        {/* Single Tariff Selected Note */}
        {selectedCount === 1 && (
          <p className="text-[11px] text-[var(--color-foreground-tertiary)] px-1">
            Выбран 1 тариф. Клиент сразу получит сообщение с кнопкой покупки без промежуточного меню.
          </p>
        )}

        {/* "+ Создать новый тариф" Button */}
        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="flex items-center justify-center gap-2 w-full h-10 border border-dashed border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-soft)] rounded-xl text-xs font-semibold hover:opacity-90 active:scale-[0.99] transition-all shadow-2xs mt-1"
        >
          <Plus size={15} /> Создать новый тариф
        </button>
      </div>

      {/* ─── Динамический блок: Сообщение перед кнопками (только если >= 2 тарифов) ─── */}
      <AnimatePresence>
        {selectedCount >= 2 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs overflow-hidden mt-1"
          >
            <div className="flex items-center gap-1.5">
              <label
                className="text-[13px] font-semibold text-[var(--color-foreground)]"
                style={{ display: 'block', marginBottom: 0 }}
              >
                Сообщение перед кнопками тарифов
              </label>
              <InfoTooltip
                title="Меню выбора тарифа"
                text={`Клиент увидит этот текст и инлайн-кнопки с тарифами (${selectedCount} шт.).`}
              />
            </div>
            <p className="text-[11px] text-[var(--color-foreground-tertiary)] -mt-1">
              Текст и медиа над кнопками выбора тарифа в Telegram.
            </p>
            <TariffDescriptionEditor
              value={node?.tariffSelectionText || 'Выберите подходящий тариф:'}
              placeholder="Выберите подходящий тариф:"
              helperText="Сообщение для клиента"
              maxCharacters={MAX_TARIFF_SELECTION_CHARACTERS}
              onChange={(value) => onChange('tariffSelectionText', value)}
              botId={botId}
              mediaFileId={node?.mediaFileId}
              mediaAssetId={node?.mediaAssetId}
              mediaType={
                node?.mediaType === 'photo' || node?.mediaType === 'video'
                  ? node.mediaType
                  : null
              }
              onUploadMedia={onUploadPaymentMedia}
              onRemoveMedia={onRemovePaymentMedia}
              mediaHint="Фото или видео над текстом выбора тарифа · до 20 МБ"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tariff Editor Modal ─── */}
      {isModalOpen && (
        <TariffEditorModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTariff(null);
          }}
          onSave={handleSaveModalTariff}
          tariff={editingTariff}
          botId={botId || ''}
        />
      )}
    </div>
  );
};
