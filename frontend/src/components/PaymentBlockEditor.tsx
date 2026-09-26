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
  CheckCircle2,
  Circle,
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

function renderDeliverableBadges(deliverables?: TariffDeliverable[]) {
  if (!deliverables || deliverables.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {deliverables.map((del) => {
        const formattedSize =
          del.fileSizeFormatted ||
          (del.fileSize ? formatNumber(Math.round(del.fileSize / 1024)) + ' КБ' : undefined);

        return (
          <span
            key={del.id}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[150px] ${
              del.type === 'channel'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : del.type === 'group'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                : del.type === 'file'
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
            title={`${del.title}${del.accessNote ? ' · 1 вход' : ''}`}
          >
            {del.type === 'channel' && <Megaphone size={10} className="shrink-0" />}
            {del.type === 'group' && <Users size={10} className="shrink-0" />}
            {del.type === 'file' && <FileText size={10} className="shrink-0" />}
            {del.type === 'link' && <Link2 size={10} className="shrink-0" />}
            <span className="truncate">{del.title || 'Доступ'}</span>
            {del.type === 'file' && formattedSize && (
              <span className="text-fg-tertiary">({formattedSize})</span>
            )}
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
            className="flex flex-col gap-2"
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
                    scale: 1.01,
                    zIndex: 50,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                    cursor: 'grabbing',
                  }}
                  className={`group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-primary/40 bg-card ring-1 ring-primary/20 shadow-2xs transition-all select-none ${
                    selectedCount > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  {/* Left Section: Drag Handle + Checkbox + # badge + Title & Deliverables */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Drag Handle */}
                    {selectedCount > 1 && (
                      <div
                        className="flex items-center text-fg-tertiary group-hover:text-primary transition-colors shrink-0"
                        title="Потяните вверх или вниз для смены очередности в боте"
                      >
                        <GripVertical size={16} />
                      </div>
                    )}

                    {/* Checkbox toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTariff(catalogItem);
                      }}
                      className="shrink-0 text-primary hover:opacity-80 transition-opacity"
                      title="Нажмите, чтобы исключить из шага продажи"
                    >
                      <CheckCircle2 size={18} className="fill-primary text-white dark:text-card" />
                    </button>

                    {/* Order badge */}
                    <span
                      className="shrink-0 rounded bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                      title={`Кнопка #${index + 1} в Telegram`}
                    >
                      #{index + 1}
                    </span>

                    {/* Title, Badges & Deliverables */}
                    <div className="flex flex-col min-w-0 flex-1 justify-center">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[13px] font-bold text-foreground truncate leading-snug"
                          title={catalogItem.description ? stripTelegramHtml(catalogItem.description) : undefined}
                        >
                          {catalogItem.name || 'Без названия'}
                        </span>

                        {isSubscription && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary shrink-0 leading-none">
                            {getPeriodSuffix(catalogItem.billingPeriod).replace('/', '').trim()}
                          </span>
                        )}

                        {/* Status pill (from image copy 2.png) */}
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">
                          <span className="size-1.5 rounded-full bg-emerald-400" />
                          В воронке
                        </span>

                        {/* Sales mode badge (from image copy 2.png) */}
                        {catalogItem.salesMode === 'auto' && (
                          <span className="hidden sm:inline-flex rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400 shrink-0">
                            Автопродажа
                          </span>
                        )}
                        {catalogItem.salesMode === 'application' && (
                          <span className="hidden sm:inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-secondary shrink-0">
                            По заявкам
                          </span>
                        )}
                        {catalogItem.salesMode === 'hybrid' && (
                          <span className="hidden sm:inline-flex rounded-full border border-purple-500/25 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-400 shrink-0">
                            Гибрид
                          </span>
                        )}
                      </div>

                      {/* Deliverable badges (Channel, Chat, File, Link) */}
                      {catalogItem.deliverables && catalogItem.deliverables.length > 0 && (
                        <div className="mt-0.5">
                          {renderDeliverableBadges(catalogItem.deliverables)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Section: Price + Reorder arrows + Edit/Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-baseline gap-1.5 text-right">
                      {Boolean(catalogItem.oldPrice) && (
                        <span className="font-accent tabular-nums text-[11px] text-fg-tertiary line-through">
                          {formatNumber(catalogItem.oldPrice)} ₽
                        </span>
                      )}
                      <span className="font-accent tabular-nums text-[13px] font-bold text-foreground">
                        {catalogItem.price ? `${formatNumber(catalogItem.price)} ₽` : 'Бесплатно'}
                      </span>
                      {isSubscription && (
                        <span className="text-[11px] text-fg-secondary">
                          {getPeriodSuffix(catalogItem.billingPeriod)}
                        </span>
                      )}
                    </div>

                    {/* Up / Down reorder arrows */}
                    {selectedCount > 1 && (
                      <div
                        className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border"
                        onClick={(e) => e.stopPropagation()}
                      >
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

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}

        {/* Inactive tariffs outside the funnel */}
        {!isLoading && unselectedTariffs.length > 0 && (
          <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">
                Тарифы вне воронки ({unselectedTariffs.length})
              </span>
              <span className="text-[11px] text-fg-tertiary">
                Нажмите, чтобы добавить в этот шаг воронки
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {unselectedTariffs.map((item) => {
                const isSubscription = item.paymentType === 'subscription';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleTariff(item)}
                    className="group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border bg-card/60 hover:bg-card hover:border-border-strong transition-all cursor-pointer select-none opacity-85 hover:opacity-100"
                  >
                    {/* Left: Unchecked circle + Name & Deliverables */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="shrink-0 text-fg-tertiary group-hover:text-primary transition-colors"
                        title="Нажмите, чтобы добавить в воронку"
                      >
                        <Circle size={18} />
                      </div>

                      <div className="flex flex-col min-w-0 flex-1 justify-center">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[13px] font-semibold text-foreground truncate leading-snug"
                            title={item.description ? stripTelegramHtml(item.description) : undefined}
                          >
                            {item.name || 'Без названия'}
                          </span>

                          {isSubscription && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary shrink-0 leading-none">
                              {getPeriodSuffix(item.billingPeriod).replace('/', '').trim()}
                            </span>
                          )}

                          {item.salesMode === 'auto' && (
                            <span className="hidden sm:inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400 shrink-0">
                              Автопродажа
                            </span>
                          )}
                          {item.salesMode === 'application' && (
                            <span className="hidden sm:inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-secondary shrink-0">
                              По заявкам
                            </span>
                          )}
                          {item.salesMode === 'hybrid' && (
                            <span className="hidden sm:inline-flex rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-400 shrink-0">
                              Гибрид
                            </span>
                          )}
                        </div>

                        {item.deliverables && item.deliverables.length > 0 && (
                          <div className="mt-0.5">
                            {renderDeliverableBadges(item.deliverables)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Price + Edit/Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-baseline gap-1.5 text-right">
                        {Boolean(item.oldPrice) && (
                          <span className="font-accent tabular-nums text-[11px] text-fg-tertiary line-through">
                            {formatNumber(item.oldPrice)} ₽
                          </span>
                        )}
                        <span className="font-accent tabular-nums text-[13px] font-bold text-foreground">
                          {item.price ? `${formatNumber(item.price)} ₽` : 'Бесплатно'}
                        </span>
                        {isSubscription && (
                          <span className="text-[11px] text-fg-secondary">
                            {getPeriodSuffix(item.billingPeriod)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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

        {/* "+ Создать новый тариф" dashed button at bottom */}
        <button
          type="button"
          onClick={() => {
            if (onNavigateToCreateTariff) {
              onNavigateToCreateTariff();
            } else {
              handleOpenCreateModal();
            }
          }}
          className="flex items-center justify-center gap-2 w-full h-10 border border-dashed border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 rounded-xl text-xs font-semibold hover:border-primary active:scale-[0.99] transition-all shadow-2xs mt-1 cursor-pointer"
        >
          <Plus size={15} /> Создать новый тариф
        </button>
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
