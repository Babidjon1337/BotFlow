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
  ArrowUp,
  ArrowDown,
  Layers,
  GripVertical,
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

function pluralizeBuyers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'покупателей';
  if (mod10 === 1) return 'покупатель';
  if (mod10 >= 2 && mod10 <= 4) return 'покупателя';
  return 'покупателей';
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

  const handleMoveTariff = (currentIndex: number, direction: -1 | 1) => {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= selectedTariffs.length) return;

    const nextTariffs = [...selectedTariffs];
    const temp = nextTariffs[currentIndex];
    nextTariffs[currentIndex] = nextTariffs[targetIndex];
    nextTariffs[targetIndex] = temp;

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
        {/* Header row with Title and solid "+ Создать тариф" button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              className="text-[14px] font-bold text-foreground"
              style={{ display: 'block', marginBottom: 0 }}
            >
              Тарифы на шаге продажи
            </label>
            <InfoTooltip
              title="Тарифы воронки"
              text="Отметьте тарифы, которые будут предложены клиенту на этом шаге. Порядок кнопок в боте соответствует порядку карточек (Кнопка #1, Кнопка #2 и т.д.)."
            />
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-fg-secondary">
              Выбрано: {selectedCount}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onNavigateToCreateTariff) {
                onNavigateToCreateTariff();
              } else {
                handleOpenCreateModal();
              }
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus size={15} />
            Создать тариф
          </button>
        </div>

        {/* Reordering helper banner */}
        {selectedCount >= 2 && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-fg-secondary">
            <span className="font-semibold text-foreground">💡 Очередность кнопок:</span>
            <span>
              Кнопка #1 будет верхней в сообщении. Перетаскивайте карточки вверх-вниз (как картинки) или используйте стрелки ↑ ↓.
            </span>
          </div>
        )}

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
            onReorder={(newOrder) => {
              onChange('tariffs', newOrder);
            }}
            className="flex flex-col gap-3.5"
          >
            {selectedTariffs.map((tariff, index) => {
              const catalogItem =
                catalogTariffs.find((c) => c.id === tariff.id) || tariffToTariffItem(tariff, index);
              const isSubscription = catalogItem.paymentType === 'subscription';

              return (
                <Reorder.Item
                  key={tariff.id}
                  value={tariff}
                  drag="y"
                  dragListener={selectedCount > 1}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.05}
                  whileDrag={{
                    scale: 1.02,
                    zIndex: 50,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
                    cursor: 'grabbing',
                  }}
                  className={`group relative flex flex-col rounded-2xl border p-5 shadow-xs transition-all select-none border-primary/50 bg-card ring-1 ring-primary/20 ${
                    selectedCount > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  <div className="flex flex-1 flex-col space-y-3.5 pointer-events-auto">
                    {/* Top Row: Drag Handle + Order badge + Status pill & Sales mode badge */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {selectedCount > 1 && (
                            <div
                              className="flex items-center gap-1 text-fg-tertiary group-hover:text-primary transition-colors"
                              title="Потяните вверх или вниз для смены очередности в боте"
                            >
                              <GripVertical size={16} />
                            </div>
                          )}

                          <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            Кнопка #{index + 1}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTariff(catalogItem);
                            }}
                            className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success hover:opacity-80 transition-opacity"
                            title="Нажмите, чтобы исключить из шага продажи"
                          >
                            <span className="size-1.5 rounded-full bg-success" />
                            В воронке
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {catalogItem.salesMode === 'auto' && (
                            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                              Автопродажа
                            </span>
                          )}
                          {catalogItem.salesMode === 'application' && (
                            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-secondary">
                              По заявкам
                            </span>
                          )}
                          {catalogItem.salesMode === 'hybrid' && (
                            <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                              Гибрид
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-lg font-bold leading-snug text-foreground">
                        {catalogItem.name || 'Без названия'}
                      </h3>

                      {/* Description preview */}
                      <p className="text-xs text-fg-secondary line-clamp-2 leading-relaxed min-h-[32px]">
                        {stripTelegramHtml(catalogItem.description) || (
                          <span className="italic text-fg-tertiary">Без описания</span>
                        )}
                      </p>
                    </div>

                    {/* Price Section */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-accent tabular-nums text-2xl font-bold text-foreground">
                          {catalogItem.price ? `${formatNumber(catalogItem.price)} ₽` : 'Бесплатно'}
                        </span>
                        {isSubscription && (
                          <span className="text-sm text-fg-secondary">
                            {getPeriodSuffix(catalogItem.billingPeriod)}
                          </span>
                        )}
                        {Boolean(catalogItem.oldPrice) && (
                          <span className="font-accent tabular-nums text-sm text-fg-tertiary line-through">
                            {formatNumber(catalogItem.oldPrice)} ₽
                          </span>
                        )}
                      </div>
                      <div className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                        {isSubscription ? 'Подписка' : 'Разовый платёж'}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-1 h-px w-full bg-border" />

                    {/* Deliverables Section */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-fg-tertiary">
                        Выдача доступа
                      </div>

                      {catalogItem.deliverables && catalogItem.deliverables.length > 0 ? (
                        catalogItem.deliverables.map((del) => {
                          const formattedSize =
                            del.fileSizeFormatted ||
                            (del.fileSize ? formatNumber(Math.round(del.fileSize / 1024)) + ' КБ' : undefined);

                          return (
                            <div
                              key={del.id}
                              className="flex items-center gap-2.5 text-xs text-fg-secondary"
                            >
                              {del.type === 'channel' && (
                                <Megaphone className="size-3.5 shrink-0 text-fg-tertiary" />
                              )}
                              {del.type === 'group' && (
                                <Users className="size-3.5 shrink-0 text-fg-tertiary" />
                              )}
                              {del.type === 'file' && (
                                <FileText className="size-3.5 shrink-0 text-fg-tertiary" />
                              )}
                              {del.type === 'link' && (
                                <Link2 className="size-3.5 shrink-0 text-fg-tertiary" />
                              )}

                              <span className="truncate">
                                {del.title}
                                {del.accessNote && (
                                  <span className="text-fg-tertiary"> · 1 вход</span>
                                )}
                                {del.type === 'file' && formattedSize && (
                                  <span className="text-fg-tertiary"> ({formattedSize})</span>
                                )}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs italic text-fg-tertiary">
                          Доступ не настроен
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="my-3 h-px w-full bg-border" />

                  {/* Footer: Buyers count & actions */}
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-fg-secondary">
                      <Users className="size-3.5 text-fg-tertiary" />
                      <span>
                        {formatNumber(catalogItem.buyersCount || 0)} {pluralizeBuyers(catalogItem.buyersCount || 0)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Up / Down buttons */}
                      {selectedCount > 1 && (
                        <div className="flex items-center gap-0.5 mr-1 bg-muted/60 p-0.5 rounded-lg border border-border">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveTariff(index, -1)}
                            className="p-1 rounded text-fg-secondary hover:text-foreground hover:bg-card disabled:opacity-25 disabled:pointer-events-none transition-colors"
                            title="Переместить выше в меню Telegram-бота"
                            aria-label="Переместить выше"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={index === selectedCount - 1}
                            onClick={() => handleMoveTariff(index, 1)}
                            className="p-1 rounded text-fg-secondary hover:text-foreground hover:bg-card disabled:opacity-25 disabled:pointer-events-none transition-colors"
                            title="Переместить ниже в меню Telegram-бота"
                            aria-label="Переместить ниже"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      )}

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(catalogItem)}
                        className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-foreground hover:bg-muted transition-colors"
                        title="Редактировать тариф"
                        aria-label="Редактировать тариф"
                      >
                        <Pencil size={13} />
                      </button>

                      {/* Delete button */}
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
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}

        {/* Inactive tariffs outside the funnel */}
        {!isLoading && unselectedTariffs.length > 0 && (
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">
                Тарифы вне воронки ({unselectedTariffs.length})
              </span>
              <span className="text-[11px] text-fg-tertiary">
                Нажмите «Добавить в воронку», чтобы включить в шаг продажи
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              {unselectedTariffs.map((item) => {
                const isSubscription = item.paymentType === 'subscription';

                return (
                  <div
                    key={item.id}
                    className="group relative flex flex-col rounded-2xl border border-border bg-card/60 p-5 shadow-xs transition-all opacity-85 hover:opacity-100 hover:border-border-strong hover:bg-card"
                  >
                    <div className="flex flex-1 flex-col space-y-3.5">
                      {/* Top Row: Status button & Sales mode badge */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleTariff(item)}
                            className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-secondary hover:bg-primary hover:text-white transition-all"
                            title="Нажмите, чтобы добавить тариф в этот шаг воронки"
                          >
                            <Plus size={12} />
                            Добавить в воронку
                          </button>

                          <div className="flex items-center gap-1.5">
                            {item.salesMode === 'auto' && (
                              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                                Автопродажа
                              </span>
                            )}
                            {item.salesMode === 'application' && (
                              <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-secondary">
                                По заявкам
                              </span>
                            )}
                            {item.salesMode === 'hybrid' && (
                              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                Гибрид
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-lg font-bold leading-snug text-foreground">
                          {item.name || 'Без названия'}
                        </h3>

                        {/* Description preview */}
                        <p className="text-xs text-fg-secondary line-clamp-2 leading-relaxed min-h-[32px]">
                          {stripTelegramHtml(item.description) || (
                            <span className="italic text-fg-tertiary">Без описания</span>
                          )}
                        </p>
                      </div>

                      {/* Price Section */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-accent tabular-nums text-2xl font-bold text-foreground">
                            {item.price ? `${formatNumber(item.price)} ₽` : 'Бесплатно'}
                          </span>
                          {isSubscription && (
                            <span className="text-sm text-fg-secondary">
                              {getPeriodSuffix(item.billingPeriod)}
                            </span>
                          )}
                          {Boolean(item.oldPrice) && (
                            <span className="font-accent tabular-nums text-sm text-fg-tertiary line-through">
                              {formatNumber(item.oldPrice)} ₽
                            </span>
                          )}
                        </div>
                        <div className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                          {isSubscription ? 'Подписка' : 'Разовый платёж'}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="my-1 h-px w-full bg-border" />

                      {/* Deliverables Section */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-fg-tertiary">
                          Выдача доступа
                        </div>

                        {item.deliverables && item.deliverables.length > 0 ? (
                          item.deliverables.map((del) => {
                            const formattedSize =
                              del.fileSizeFormatted ||
                              (del.fileSize ? formatNumber(Math.round(del.fileSize / 1024)) + ' КБ' : undefined);

                            return (
                              <div
                                key={del.id}
                                className="flex items-center gap-2.5 text-xs text-fg-secondary"
                              >
                                {del.type === 'channel' && (
                                  <Megaphone className="size-3.5 shrink-0 text-fg-tertiary" />
                                )}
                                {del.type === 'group' && (
                                  <Users className="size-3.5 shrink-0 text-fg-tertiary" />
                                )}
                                {del.type === 'file' && (
                                  <FileText className="size-3.5 shrink-0 text-fg-tertiary" />
                                )}
                                {del.type === 'link' && (
                                  <Link2 className="size-3.5 shrink-0 text-fg-tertiary" />
                                )}

                                <span className="truncate">
                                  {del.title}
                                  {del.accessNote && (
                                    <span className="text-fg-tertiary"> · 1 вход</span>
                                  )}
                                  {del.type === 'file' && formattedSize && (
                                    <span className="text-fg-tertiary"> ({formattedSize})</span>
                                  )}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-xs italic text-fg-tertiary">
                            Доступ не настроен
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-3 h-px w-full bg-border" />

                    {/* Footer: Buyers count & actions */}
                    <div className="flex shrink-0 items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-fg-secondary">
                        <Users className="size-3.5 text-fg-tertiary" />
                        <span>
                          {formatNumber(item.buyersCount || 0)} {pluralizeBuyers(item.buyersCount || 0)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Edit button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1.5 rounded-lg border border-border text-fg-secondary hover:text-foreground hover:bg-muted transition-colors"
                          title="Редактировать тариф"
                          aria-label="Редактировать тариф"
                        >
                          <Pencil size={13} />
                        </button>

                        {/* Delete button */}
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
