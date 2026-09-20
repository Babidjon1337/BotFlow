import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Megaphone,
  Users,
  FileText,
  Link2,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import type { BotConfig } from '../../types';
import type { TariffItem, TariffMetrics, TariffDeliverable, DeliverableType } from '../../types/tariff';
import { apiService } from '../../services/api';
import { useAppState } from '../../providers/AppStateProvider';
import { TariffEditorModal } from '../sheets/TariffEditorModal';

interface BotTariffsScreenProps {
  bot: BotConfig;
}

function formatNumber(num: number | undefined | null): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toLocaleString('ru-RU');
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 КБ';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
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

function toBackendPayload(item: TariffItem) {
  const isSubscription = item.paymentType === 'subscription';
  let recurringPeriod: string | undefined = undefined;
  if (isSubscription) {
    if (item.billingPeriod === 'week') recurringPeriod = '1_week';
    else if (item.billingPeriod === '3months') recurringPeriod = '3_months';
    else if (item.billingPeriod === 'year') recurringPeriod = '1_year';
    else recurringPeriod = '1_month';
  }

  return {
    name: item.name,
    description: item.description || undefined,
    price: item.price,
    paymentType: isSubscription ? 'recurring' : 'one_time',
    recurringPeriod,
    salesMode: item.salesMode === 'application' ? 'manual' : item.salesMode,
    isActive: item.isActiveInFunnel,
    deliverables: item.deliverables.map((d) => ({
      type: d.type,
      chatId: d.chatId,
      title: d.title,
      accessMode: 'member',
      filePath: d.fileUrl || d.fileName,
      url: d.url || d.fileUrl,
      filename: d.fileName || d.title,
      sizeBytes: d.fileSize || 0,
    })),
  };
}

interface BackendStats {
  totalTariffs?: number;
  activeCount?: number;
  totalBuyers?: number;
  totalRevenue?: number;
}

function mapBackendTariff(raw: Record<string, unknown>, idx = 0): TariffItem {
  const isRecurring =
    raw.payment_type === 'recurring' ||
    raw.paymentType === 'recurring' ||
    raw.paymentType === 'subscription';

  const recPeriod = String(raw.recurring_period || raw.recurringPeriod || '');
  let billingPeriod: 'week' | 'month' | '3months' | 'year' = 'month';
  if (recPeriod === '1_week' || recPeriod === 'week') billingPeriod = 'week';
  else if (recPeriod === '3_months' || recPeriod === '3months') billingPeriod = '3months';
  else if (recPeriod === '1_year' || recPeriod === 'year') billingPeriod = 'year';

  const rawSales = String(raw.sales_mode || raw.salesMode || 'auto');
  const salesMode: 'auto' | 'application' | 'hybrid' =
    rawSales === 'manual' ? 'application' : rawSales === 'hybrid' ? 'hybrid' : 'auto';

  const rawDeliverables = (Array.isArray(raw.deliverables) ? raw.deliverables : []) as Array<Record<string, unknown>>;
  const deliverables: TariffDeliverable[] = rawDeliverables.map((d, dIdx) => {
    const isFile = d.type === 'file';
    const isChat = d.type === 'channel' || d.type === 'group';
    const size =
      typeof d.sizeBytes === 'number'
        ? d.sizeBytes
        : typeof d.size_bytes === 'number'
        ? d.size_bytes
        : typeof d.size === 'number'
        ? d.size
        : undefined;

    return {
      id: String(d.id || `del_${raw.id || idx}_${dIdx}`),
      type: (d.type as DeliverableType) || 'link',
      title: String(d.title || (isFile ? d.filename || d.originalName || 'Файл' : isChat ? 'Чат / Канал' : 'Ссылка')),
      chatId: d.chatId ? String(d.chatId) : d.chat_id ? String(d.chat_id) : undefined,
      chatType: (d.chatType as 'channel' | 'group' | 'supergroup') || (d.type === 'channel' ? 'channel' : 'group'),
      accessNote: isChat ? 'Персональная ссылка (1 вход)' : undefined,
      fileName: d.filename ? String(d.filename) : d.originalName ? String(d.originalName) : d.fileName ? String(d.fileName) : undefined,
      fileSize: size,
      fileSizeFormatted: size ? formatFileSize(size) : undefined,
      fileUrl: d.url ? String(d.url) : d.filePath ? String(d.filePath) : d.file_path ? String(d.file_path) : undefined,
      url: d.url ? String(d.url) : undefined,
    };
  });

  return {
    id: String(raw.id || `t_${idx}`),
    name: String(raw.name || 'Тариф'),
    price: Number(raw.price) || 0,
    oldPrice: raw.oldPrice ? Number(raw.oldPrice) : null,
    paymentType: isRecurring ? 'subscription' : 'one_time',
    billingPeriod: isRecurring ? billingPeriod : undefined,
    salesMode,
    isActiveInFunnel:
      raw.is_active !== undefined
        ? Boolean(raw.is_active)
        : raw.isActive !== undefined
        ? Boolean(raw.isActive)
        : true,
    buyersCount: Number(raw.total_buyers ?? raw.totalBuyers ?? raw.buyersCount) || 0,
    revenue: Number(raw.total_revenue ?? raw.totalRevenue ?? raw.revenue) || 0,
    deliverables,
    createdAt: raw.created_at ? String(raw.created_at) : raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
    updatedAt: raw.updated_at ? String(raw.updated_at) : raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

export function BotTariffsScreen({ bot }: BotTariffsScreenProps) {
  const { setToastMessage, setToastType } = useAppState();

  const [tariffs, setTariffs] = useState<TariffItem[]>([]);
  const [metrics, setMetrics] = useState<TariffMetrics>({
    totalCount: 0,
    activeInFunnelCount: 0,
    buyersCount: 0,
    totalRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState<TariffItem | null>(null);

  // Delete Dialog State
  const [tariffToDelete, setTariffToDelete] = useState<TariffItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calculate or reconcile metrics
  const calculatedMetrics = useMemo(() => {
    const totalCount = tariffs.length;
    const activeInFunnelCount = tariffs.filter((t) => t.isActiveInFunnel).length;
    const buyersCount = tariffs.reduce((sum, t) => sum + (t.buyersCount || 0), 0);
    const totalRevenue = tariffs.reduce((sum, t) => sum + (t.revenue || 0), 0);

    return {
      totalCount: metrics.totalCount > totalCount ? metrics.totalCount : totalCount,
      activeInFunnelCount:
        metrics.activeInFunnelCount > activeInFunnelCount
          ? metrics.activeInFunnelCount
          : activeInFunnelCount,
      buyersCount: metrics.buyersCount > buyersCount ? metrics.buyersCount : buyersCount,
      totalRevenue: metrics.totalRevenue > totalRevenue ? metrics.totalRevenue : totalRevenue,
    };
  }, [tariffs, metrics]);

  // Load tariffs with graceful fallback
  useEffect(() => {
    let cancelled = false;

    const fetchTariffs = async () => {
      try {
        // 1. Try dedicated API
        try {
          const res = await apiService.getTariffs(bot.id);
          if (cancelled) return;
          const rawList = Array.isArray(res) ? res : res.tariffs;
          if (Array.isArray(rawList)) {
            const mapped = rawList.map((t, i) =>
              mapBackendTariff(t as unknown as Record<string, unknown>, i)
            );
            setTariffs(mapped);
            if (!Array.isArray(res)) {
              const obj = res as { stats?: BackendStats };
              if (obj.stats) {
                const s = obj.stats;
                setMetrics({
                  totalCount: s.totalTariffs ?? mapped.length,
                  activeInFunnelCount: s.activeCount ?? 0,
                  buyersCount: s.totalBuyers ?? 0,
                  totalRevenue: s.totalRevenue ?? 0,
                });
              }
            }
            setIsLoading(false);
            return;
          }
        } catch {
          // Dedicated endpoint not yet available, fallback to funnel schema
        }

        // 2. Fallback to reading funnel schema
        const funnel = await apiService.getFunnel(bot.id);
        if (cancelled) return;
        const nodes = Array.isArray(funnel) ? funnel : (funnel?.nodes as unknown as unknown[]);
        if (Array.isArray(nodes)) {
          const paymentNode = nodes.find(
            (n) => typeof n === 'object' && n !== null && (n as { id?: string }).id === 'payment'
          ) as { tariffs?: Array<Record<string, unknown>> } | undefined;

          if (paymentNode?.tariffs && Array.isArray(paymentNode.tariffs)) {
            const mappedTariffs: TariffItem[] = paymentNode.tariffs.map((t, idx) =>
              mapBackendTariff(t, idx)
            );
            setTariffs(mappedTariffs);
          } else {
            setTariffs([]);
          }
        }
      } catch (err) {
        console.error('Failed to load tariffs:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchTariffs();

    return () => {
      cancelled = true;
    };
  }, [bot.id]);

  // Handle Save (Create or Update)
  const handleSaveTariff = async (tariffItem: TariffItem) => {
    try {
      const exists = tariffs.some((t) => t.id === tariffItem.id);
      const backendPayload = toBackendPayload(tariffItem);

      // Try dedicated API first
      let savedItem = tariffItem;
      let savedSuccessfully = false;
      try {
        if (exists) {
          const res = await apiService.updateTariff(
            bot.id,
            tariffItem.id,
            backendPayload as unknown as Partial<TariffItem>
          );
          if (res) savedItem = mapBackendTariff(res as unknown as Record<string, unknown>);
        } else {
          const res = await apiService.createTariff(
            bot.id,
            backendPayload as unknown as Partial<TariffItem>
          );
          if (res) savedItem = mapBackendTariff(res as unknown as Record<string, unknown>);
        }
        savedSuccessfully = true;
      } catch {
        // Fallback: update via funnel
      }

      // Sync state locally
      const updatedTariffs = exists
        ? tariffs.map((t) => (t.id === tariffItem.id ? savedItem : t))
        : [...tariffs, savedItem];

      setTariffs(updatedTariffs);

      // If dedicated API wasn't available, sync funnel payment node
      if (!savedSuccessfully) {
        try {
          const funnel = await apiService.getFunnel(bot.id);
          const nodes = Array.isArray(funnel) ? [...funnel] : [];
          const paymentIdx = nodes.findIndex((n) => n.id === 'payment');
          if (paymentIdx >= 0) {
            const paymentNode = { ...nodes[paymentIdx] };
            paymentNode.tariffs = updatedTariffs.map((t) => ({
              id: t.id,
              name: t.name,
              price: t.price,
              oldPrice: t.oldPrice,
              paymentType: t.paymentType,
              billingPeriod: t.billingPeriod,
              salesMode: t.salesMode,
              isActiveInFunnel: t.isActiveInFunnel,
              deliverables: t.deliverables,
              description: t.description || '',
              actionType: t.deliverables[0]?.type === 'file' ? 'file' : t.deliverables[0]?.type === 'link' ? 'link' : 'group',
              actionData: t.deliverables[0]?.title || '',
            }));
            nodes[paymentIdx] = paymentNode;
            await apiService.saveFunnel(bot.id, nodes, false);
          }
        } catch (e) {
          console.warn('Funnel sync fallback error:', e);
        }
      }

      setToastType?.('success');
      setToastMessage(exists ? 'Тариф успешно обновлён' : 'Тариф успешно создан');
    } catch (err) {
      setToastType?.('error');
      setToastMessage(err instanceof Error ? err.message : 'Ошибка при сохранении тарифа');
      throw err;
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!tariffToDelete) return;
    setIsDeleting(true);
    try {
      try {
        await apiService.deleteTariff(bot.id, tariffToDelete.id);
      } catch {
        // fallback
      }

      const updated = tariffs.filter((t) => t.id !== tariffToDelete.id);
      setTariffs(updated);

      // Funnel sync fallback
      try {
        const funnel = await apiService.getFunnel(bot.id);
        const nodes = Array.isArray(funnel) ? [...funnel] : [];
        const paymentIdx = nodes.findIndex((n) => n.id === 'payment');
        if (paymentIdx >= 0) {
          const paymentNode = { ...nodes[paymentIdx] };
          paymentNode.tariffs = updated;
          nodes[paymentIdx] = paymentNode;
          await apiService.saveFunnel(bot.id, nodes, false);
        }
      } catch (e) {
        console.warn('Funnel sync error on delete:', e);
      }

      setToastType?.('success');
      setToastMessage('Тариф удалён');
      setTariffToDelete(null);
    } catch (err) {
      setToastType?.('error');
      setToastMessage(err instanceof Error ? err.message : 'Не удалось удалить тариф');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCreate = () => {
    setSelectedTariff(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (tariff: TariffItem) => {
    setSelectedTariff(tariff);
    setIsEditorOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="font-accent mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">
            МОНЕТИЗАЦИЯ БОТА
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight text-foreground">
            Тарифы и продукты
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Управляйте продуктами, ценами и правами доступа в закрытые чаты
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="size-4" />
          Создать тариф
        </button>
      </div>

      {/* 2. Top Summary Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Metric 1 */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-1 text-xs font-medium text-fg-secondary">Всего тарифов</div>
          <div className="font-accent text-2xl font-bold text-foreground">
            {calculatedMetrics.totalCount}
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-1 text-xs font-medium text-fg-secondary">Активны в воронке</div>
          <div className="font-accent text-2xl font-bold text-foreground">
            {calculatedMetrics.activeInFunnelCount}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-1 text-xs font-medium text-fg-secondary">Покупателей</div>
          <div className="flex items-end gap-2">
            <div className="font-accent text-2xl font-bold text-foreground">
              {calculatedMetrics.buyersCount}
            </div>
            <div className="pb-0.5 text-xs font-medium text-success">
              <span className="font-accent">
                +{formatNumber(calculatedMetrics.totalRevenue)} ₽
              </span>{' '}
              выручка
            </div>
          </div>
        </div>
      </div>

      {/* 3. Catalog Grid or Loading / Empty state */}
      {isLoading ? (
        <div className="flex min-h-[300px] w-full items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : tariffs.length === 0 ? (
        /* Empty State */
        <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Layers className="size-7" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Нет созданных тарифов</h3>
          <p className="mt-1.5 max-w-md text-sm text-fg-secondary">
            Создайте первый тариф, чтобы настроить платную подписку или разовую оплату за доступ к
            материалам и закрытым Telegram-сообществам.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-4" />
            Создать тариф
          </button>
        </div>
      ) : (
        /* Responsive 3-column Catalog Grid */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {tariffs.map((tariff) => {
            const isSubscription = tariff.paymentType === 'subscription';

            return (
              <div
                key={tariff.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-xs transition-all hover:border-primary hover:shadow-lg"
              >
                <div className="flex flex-1 flex-col space-y-4">
                  {/* Top Row: Status pill & Sales mode badge */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      {tariff.isActiveInFunnel ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
                          <span className="size-1.5 rounded-full bg-success" />В воронке
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-secondary">
                          <span className="size-1.5 rounded-full bg-fg-tertiary" />
                          Не используется
                        </span>
                      )}

                      {tariff.salesMode === 'auto' && (
                        <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          Автопродажа
                        </span>
                      )}
                      {tariff.salesMode === 'application' && (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-secondary">
                          По заявкам
                        </span>
                      )}
                      {tariff.salesMode === 'hybrid' && (
                        <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                          Гибрид
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold leading-snug text-foreground">
                      {tariff.name}
                    </h3>
                  </div>

                  {/* Price Section */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-accent text-2xl font-bold text-foreground">
                        {formatNumber(tariff.price)} ₽
                      </span>
                      {isSubscription && (
                        <span className="text-sm text-fg-secondary">
                          {getPeriodSuffix(tariff.billingPeriod)}
                        </span>
                      )}
                      {Boolean(tariff.oldPrice) && (
                        <span className="font-accent text-sm text-fg-tertiary line-through">
                          {formatNumber(tariff.oldPrice)} ₽
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
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-fg-tertiary">
                      Выдача доступа
                    </div>

                    {tariff.deliverables && tariff.deliverables.length > 0 ? (
                      tariff.deliverables.map((del) => (
                        <div
                          key={del.id}
                          className="flex items-center gap-2.5 text-xs text-fg-secondary"
                        >
                          {del.type === 'channel' && (
                            <Megaphone className="size-4 shrink-0 text-fg-tertiary" />
                          )}
                          {del.type === 'group' && (
                            <Users className="size-4 shrink-0 text-fg-tertiary" />
                          )}
                          {del.type === 'file' && (
                            <FileText className="size-4 shrink-0 text-fg-tertiary" />
                          )}
                          {del.type === 'link' && (
                            <Link2 className="size-4 shrink-0 text-fg-tertiary" />
                          )}

                          <span className="truncate">
                            {del.title}
                            {del.accessNote && (
                              <span className="text-fg-tertiary"> · 1 вход</span>
                            )}
                            {del.type === 'file' && del.fileSizeFormatted && (
                              <span className="text-fg-tertiary">
                                {' '}
                                ({del.fileSizeFormatted})
                              </span>
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs italic text-fg-tertiary">
                        Доступ не настроен
                      </div>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="my-4 h-px w-full bg-border" />

                {/* Footer: Buyers count & actions */}
                <div className="flex shrink-0 items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-fg-secondary">
                    <span className="font-accent font-bold text-foreground">
                      {tariff.buyersCount || 0}
                    </span>{' '}
                    {pluralizeBuyers(tariff.buyersCount || 0)}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(tariff)}
                      className="flex size-9 items-center justify-center rounded-xl border border-border text-fg-secondary transition-all hover:border-primary hover:bg-muted hover:text-primary"
                      title="Редактировать"
                    >
                      <Pencil className="size-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTariffToDelete(tariff)}
                      className="flex size-9 items-center justify-center rounded-xl border border-border text-danger transition-all hover:border-danger hover:bg-danger-soft"
                      title="Удалить"
                    >
                      <Trash2 className="size-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <TariffEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveTariff}
        tariff={selectedTariff}
        botId={bot.id}
      />

      {/* Delete Confirmation Dialog */}
      {tariffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl text-foreground">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <AlertTriangle className="size-6" />
            </div>
            <h3 className="text-lg font-bold">Удалить тариф?</h3>
            <p className="mt-2 text-sm text-fg-secondary">
              Вы уверены, что хотите удалить тариф «{tariffToDelete.name}»? Это действие нельзя отменить.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTariffToDelete(null)}
                disabled={isDeleting}
                className="h-10 rounded-xl px-4 text-sm font-medium text-fg-secondary hover:bg-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
