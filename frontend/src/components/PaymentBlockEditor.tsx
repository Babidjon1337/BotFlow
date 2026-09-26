import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  Megaphone,
  Users,
  FileText,
  Link2,
  AlertCircle,
  Loader2,
  Layers,
  GripVertical,
  X,
} from 'lucide-react';
import { useAlert } from './AlertProvider';
import { InfoTooltip } from './InfoTooltip';
import { TariffDescriptionEditor } from './TariffDescriptionEditor';
import { TariffEditorModal } from './sheets/TariffEditorModal';
import { apiService } from '../services/api';
import type { FunnelNode, Tariff } from '../types';
import type { TariffItem } from '../types/tariff';
import {
  mapBackendTariff,
  toBackendPayload,
  tariffItemToTariff,
  tariffToTariffItem,
  stripTelegramHtml,
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
  onNavigateToCreateTariff?: () => void;
}

const MAX_TARIFF_SELECTION_CHARACTERS = 4096;

function formatNumber(num: number | undefined | null): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toLocaleString('ru-RU');
}

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


export const PaymentBlockEditor: React.FC<PaymentBlockEditorProps> = ({
  node,
  botId,
  onChange,
  paymentMode,
  onPaymentModeChange: _onPaymentModeChange,
  managerUrl,
  managerText,
  onManagerUrlChange,
  onManagerTextChange,
  onUploadPaymentMedia,
  onRemovePaymentMedia,
  onNavigateToCreateTariff,
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

  const nodeTariffs = useMemo(() => node?.tariffs || [], [node?.tariffs]);
  const [localTariffs, setLocalTariffs] = useState<Tariff[]>(nodeTariffs);

  useEffect(() => {
    setLocalTariffs(nodeTariffs);
  }, [nodeTariffs]);

  const selectedTariffs = localTariffs;
  const selectedIds = useMemo(() => new Set(selectedTariffs.map((t) => t.id)), [selectedTariffs]);
  const selectedCount = selectedTariffs.length;

  const handleReorder = (newOrder: Tariff[]) => {
    setLocalTariffs(newOrder);
    onChange('tariffs', newOrder);
  };

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

    setLocalTariffs(nextTariffs);
    onChange('tariffs', nextTariffs);
  };


  const unselectedTariffs = useMemo(() => {
    return catalogTariffs.filter((ct) => !selectedIds.has(ct.id));
  }, [catalogTariffs, selectedIds]);

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
      {/* ─── Ссылка на менеджера (для режимов "По заявкам" и "Гибрид") ─── */}
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

      <hr className="border-[var(--color-border)] my-1" />

      {/* ─── Динамический блок: Сообщение перед кнопками (если >= 2 тарифов) ─── */}
      <AnimatePresence>
        {selectedCount >= 2 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs overflow-hidden mb-1"
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

      {/* ─── Выбор тарифов из каталога ─── */}
      <div className="flex flex-col gap-3">
        {/* Header row with Title */}
        <div className="flex items-center gap-2">
          <label
            className="text-[14px] font-bold text-foreground"
            style={{ display: 'block', marginBottom: 0 }}
          >
            Тарифы на шаге продажи
          </label>
          <InfoTooltip
            title="Тарифы воронки"
            text="Отметьте тарифы, которые будут предложены клиенту на этом шаге. Порядок карточек определяет очередность кнопок в боте. Вы можете перетаскивать карточки мышкой вверх и вниз."
          />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-fg-secondary">
            Выбрано: {selectedCount}
          </span>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-fg-secondary gap-2">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span className="text-xs">Загрузка тарифов...</span>
          </div>
        )}

        {/* Empty Catalog Notice */}
        {!isLoading && catalogTariffs.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-border bg-card/50">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Layers className="size-6" />
            </div>
            <h4 className="text-sm font-bold text-foreground">Нет созданных тарифов</h4>
            <p className="mt-1 max-w-sm text-xs text-fg-secondary">
              Создайте первый тариф с ценой и автоматической выдачей доступа (канал, чат, файл или ссылка).
            </p>
            <button
              type="button"
              onClick={() => {
                if (onNavigateToCreateTariff) {
                  onNavigateToCreateTariff();
                } else {
                  handleOpenCreateModal();
                }
              }}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover"
            >
              <Plus size={14} />
              Создать тариф
            </button>
          </div>
        )}

        {/* Reorderable Active Funnel Tariffs (Drag & Drop Up/Down) */}
        {!isLoading && selectedTariffs.length > 0 && (
          <Reorder.Group
            axis="y"
            values={selectedTariffs}
            onReorder={handleReorder}
            className="flex flex-col gap-2.5"
          >
            {selectedTariffs.map((tariff, index) => {
              const catalogItem =
                catalogTariffs.find((c) => c.id === tariff.id) || tariffToTariffItem(tariff, index);
              const isSubscription = catalogItem.paymentType === 'subscription';

              return (
                <Reorder.Item
                  key={tariff.id}
                  value={tariff}
                  layout
                  transition={{ type: "spring", damping: 30, stiffness: 400 }}
                  drag="y"
                  dragListener={selectedCount > 1}
                  whileDrag={{
                    scale: 1.015,
                    zIndex: 40,
                    boxShadow: '0 12px 28px -6px rgba(0, 0, 0, 0.35)',
                    cursor: 'grabbing',
                  }}
                  className={`group relative flex flex-col gap-2 p-3 sm:p-3.5 rounded-2xl border border-border bg-card hover:border-border-strong shadow-2xs select-none ${
                    selectedCount > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  {/* Top Row: Badges (Left) & Price + Actions (Right) */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {selectedCount > 1 && (
                        <div
                          className="flex items-center text-fg-tertiary group-hover:text-primary transition-colors cursor-grab active:cursor-grabbing shrink-0"
                          title="Потяните для смены порядка в боте"
                        >
                          <GripVertical size={16} />
                        </div>
                      )}

                      {/* Status indicator */}
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        В воронке
                      </span>

                      {/* Explicit button to remove from funnel */}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTariff(catalogItem);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500 dark:text-rose-400 transition-colors cursor-pointer shrink-0"
                        title="Убрать тариф из шага воронки"
                      >
                        <X size={12} />
                        <span>Убрать из воронки</span>
                      </button>

                      {catalogItem.salesMode === 'auto' && (
                        <span className="hidden sm:inline-flex rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary shrink-0">
                          Автопродажа
                        </span>
                      )}
                      {catalogItem.salesMode === 'application' && (
                        <span className="hidden sm:inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-secondary shrink-0">
                          По заявкам
                        </span>
                      )}
                      {catalogItem.salesMode === 'hybrid' && (
                        <span className="hidden sm:inline-flex rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 shrink-0">
                          Гибрид
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-baseline gap-1.5 text-right">
                        {Boolean(catalogItem.oldPrice) && (
                          <span className="font-accent tabular-nums text-xs text-fg-tertiary line-through">
                            {formatNumber(catalogItem.oldPrice)} ₽
                          </span>
                        )}
                        <span className="font-accent tabular-nums text-sm font-bold text-foreground">
                          {catalogItem.price ? `${formatNumber(catalogItem.price)} ₽` : 'Бесплатно'}
                        </span>
                        {isSubscription ? (
                          <span className="text-xs text-fg-secondary">
                            {getPeriodSuffix(catalogItem.billingPeriod)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-fg-tertiary">разово</span>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(catalogItem)}
                          className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-foreground hover:bg-muted transition-colors"
                          title="Редактировать тариф"
                          aria-label="Редактировать тариф"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTariff(catalogItem)}
                          className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-danger hover:border-danger/30 hover:bg-danger/10 transition-colors"
                          title="Удалить тариф"
                          aria-label="Удалить тариф"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Title & optional description preview */}
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-[13px] font-bold text-foreground truncate">
                      {catalogItem.name || 'Без названия'}
                    </h4>
                    {catalogItem.description && stripTelegramHtml(catalogItem.description) && (
                      <span className="text-[11px] text-fg-secondary truncate max-w-[280px]">
                        {stripTelegramHtml(catalogItem.description)}
                      </span>
                    )}
                  </div>

                  {/* Bottom: Deliverables */}
                  {catalogItem.deliverables && catalogItem.deliverables.length > 0 && (
                    <div className="pt-2 border-t border-border/60 flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-fg-tertiary">
                        Выдача:
                      </span>
                      {catalogItem.deliverables.map((del) => {
                        const formattedSize =
                          del.fileSizeFormatted ||
                          (del.fileSize ? formatNumber(Math.round(del.fileSize / 1024)) + ' КБ' : undefined);

                        return (
                          <div key={del.id} className="flex items-center gap-1.5 text-xs text-fg-secondary">
                            {del.type === 'channel' && <Megaphone className="size-3.5 shrink-0 text-emerald-500" />}
                            {del.type === 'group' && <Users className="size-3.5 shrink-0 text-sky-500" />}
                            {del.type === 'file' && <FileText className="size-3.5 shrink-0 text-purple-500" />}
                            {del.type === 'link' && <Link2 className="size-3.5 shrink-0 text-amber-500" />}
                            <span className="truncate max-w-[220px] font-medium text-foreground">
                              {del.title || 'Доступ'}
                              {del.accessNote && <span className="text-fg-tertiary font-normal"> · 1 вход</span>}
                              {del.type === 'file' && formattedSize && (
                                <span className="text-fg-tertiary font-normal"> ({formattedSize})</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}

        {/* Inactive tariffs outside the funnel */}
        {!isLoading && unselectedTariffs.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">
                Тарифы вне воронки ({unselectedTariffs.length})
              </span>
              <span className="text-[11px] text-fg-tertiary">
                Нажмите «+ В воронку», чтобы предложить на этом шаге
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {unselectedTariffs.map((item) => {
                const isSubscription = item.paymentType === 'subscription';

                return (
                  <div
                    key={item.id}
                    className="group relative flex flex-col gap-2 p-3 sm:p-3.5 rounded-2xl border border-border bg-card/60 hover:bg-card hover:border-border-strong transition-all select-none opacity-85 hover:opacity-100"
                  >
                    {/* Top Row: Status (Left) & Price + Actions (Right) */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-secondary shrink-0">
                          <span className="size-1.5 rounded-full bg-fg-tertiary" />
                          Вне воронки
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleTariff(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-2xs transition-colors cursor-pointer shrink-0"
                          title="Добавить тариф в этот шаг воронки"
                        >
                          <Plus size={12} />
                          <span>Добавить в воронку</span>
                        </button>

                        {item.salesMode === 'auto' && (
                          <span className="hidden sm:inline-flex rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary shrink-0">
                            Автопродажа
                          </span>
                        )}
                        {item.salesMode === 'application' && (
                          <span className="hidden sm:inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-secondary shrink-0">
                            По заявкам
                          </span>
                        )}
                        {item.salesMode === 'hybrid' && (
                          <span className="hidden sm:inline-flex rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 shrink-0">
                            Гибрид
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-baseline gap-1.5 text-right">
                          {Boolean(item.oldPrice) && (
                            <span className="font-accent tabular-nums text-xs text-fg-tertiary line-through">
                              {formatNumber(item.oldPrice)} ₽
                            </span>
                          )}
                          <span className="font-accent tabular-nums text-sm font-bold text-foreground">
                            {item.price ? `${formatNumber(item.price)} ₽` : 'Бесплатно'}
                          </span>
                          {isSubscription ? (
                            <span className="text-xs text-fg-secondary">
                              {getPeriodSuffix(item.billingPeriod)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-fg-tertiary">разово</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-foreground hover:bg-muted transition-colors"
                            title="Редактировать тариф"
                            aria-label="Редактировать тариф"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTariff(item)}
                            className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-danger hover:border-danger/30 hover:bg-danger/10 transition-colors"
                            title="Удалить тариф"
                            aria-label="Удалить тариф"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Title & optional description */}
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-[13px] font-bold text-foreground truncate">
                        {item.name || 'Без названия'}
                      </h4>
                      {item.description && stripTelegramHtml(item.description) && (
                        <span className="text-[11px] text-fg-secondary truncate max-w-[280px]">
                          {stripTelegramHtml(item.description)}
                        </span>
                      )}
                    </div>

                    {/* Bottom: Deliverables */}
                    {item.deliverables && item.deliverables.length > 0 && (
                      <div className="pt-2 border-t border-border/60 flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-fg-tertiary">
                          Выдача:
                        </span>
                        {item.deliverables.map((del) => {
                          const formattedSize =
                            del.fileSizeFormatted ||
                            (del.fileSize ? formatNumber(Math.round(del.fileSize / 1024)) + ' КБ' : undefined);

                          return (
                            <div key={del.id} className="flex items-center gap-1.5 text-xs text-fg-secondary">
                              {del.type === 'channel' && <Megaphone className="size-3.5 shrink-0 text-emerald-500" />}
                              {del.type === 'group' && <Users className="size-3.5 shrink-0 text-sky-500" />}
                              {del.type === 'file' && <FileText className="size-3.5 shrink-0 text-purple-500" />}
                              {del.type === 'link' && <Link2 className="size-3.5 shrink-0 text-amber-500" />}
                              <span className="truncate max-w-[220px] font-medium text-foreground">
                                {del.title || 'Доступ'}
                                {del.accessNote && <span className="text-fg-tertiary font-normal"> · 1 вход</span>}
                                {del.type === 'file' && formattedSize && (
                                  <span className="text-fg-tertiary font-normal"> ({formattedSize})</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 0 Tariffs Selected Warning */}
        {selectedCount === 0 && !isLoading && catalogTariffs.length > 0 && (
          <div className="p-3 rounded-xl border border-dashed border-warning bg-warning-soft/40 text-xs text-warning flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Отметьте хотя бы один тариф, который будет предложен на этом шаге воронки.</span>
          </div>
        )}

        {/* Single Tariff Selected Note */}
        {selectedCount === 1 && (
          <p className="text-[11px] text-fg-tertiary px-1">
            Выбран 1 тариф. Клиент сразу получит сообщение с кнопкой покупки без промежуточного меню.
          </p>
        )}

        {/* Compact "+ Создать тариф" button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              if (onNavigateToCreateTariff) {
                onNavigateToCreateTariff();
              } else {
                handleOpenCreateModal();
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus size={15} />
            Создать тариф
          </button>
        </div>
      </div>

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
