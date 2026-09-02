import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Users,
  XCircle,
  ReceiptText,
  X,
} from 'lucide-react';
import type { BotConfig } from '../../types';
import { apiService } from '../../services/api';
import type {
  AudienceFilter,
  AudienceLead,
  AudienceSummary,
  Broadcast,
  BroadcastStatus,
} from '../../services/api';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { StatusBadge, type StatusTone } from '../common/StatusBadge';
import { StoryEmptyState } from '../common/StoryEmptyState';
import type { BroadcastTariffOption } from '../common/BroadcastComposerForm';
import { PageHeader } from '../common/PageHeader';
import { BroadcastComposerForm } from '../common/BroadcastComposerForm';
import { useAlert } from '../AlertProvider';
import { useAppState } from '../../providers/AppStateProvider';
import { BroadcastComposerSheet } from '../sheets/BroadcastComposerSheet';

type BroadcastsTab = 'audience' | 'broadcasts';

const SEGMENTS: { value: AudienceFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'paid', label: 'Оплатившие' },
  { value: 'unpaid', label: 'Без оплаты' },
];

const PAGE_SIZE = 20;

const statusMeta: Record<BroadcastStatus, { tone: StatusTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Черновик' },
  queued: { tone: 'info', label: 'В очереди' },
  scheduled: { tone: 'warning', label: 'Запланирована' },
  sending: { tone: 'primary', label: 'Отправляется' },
  sent: { tone: 'success', label: 'Отправлено' },
  failed: { tone: 'danger', label: 'Ошибка' },
  cancelled: { tone: 'neutral', label: 'Отменена' },
};

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const formatNumber = (value: number) => value.toLocaleString('ru-RU');

/** Тарифы воронки → опции кнопок рассылки/счёта (ссылка оплаты генерируется ботом). */
function collectTariffOptions(nodes: unknown[]): BroadcastTariffOption[] {
  const options: BroadcastTariffOption[] = [];
  for (const node of nodes) {
    for (const tariff of (node as { tariffs?: unknown[] }).tariffs ?? []) {
      const t = tariff as {
        id?: string; name?: string; price?: string; actionType?: string; actionData?: string;
      };
      if (!t.id) continue;
      options.push({
        id: t.id,
        name: t.name || 'Тариф',
        price: t.price || '',
        isLink: true,
      });
    }
  }
  return options;
}

export function BroadcastsScreen({ bot, initialTab = 'audience' }: { bot: BotConfig; initialTab?: BroadcastsTab }) {
  const [tab, setTab] = useState<BroadcastsTab>(initialTab);
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sheetTariffs, setSheetTariffs] = useState<BroadcastTariffOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getAudienceSummary(bot.id)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary({ all: 0, paid: 0, unpaid: 0 });
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bot.id]);

  // Тарифы для кнопок рассылки — нужны и мобильному шиту, и счёту в Аудитории.
  useEffect(() => {
    let cancelled = false;
    apiService
      .getFunnel(bot.id)
      .then((funnel) => {
        if (cancelled) return;
        setSheetTariffs(collectTariffOptions(funnel.nodes ?? []));
      })
      .catch(() => {
        if (!cancelled) setSheetTariffs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bot.id]);

  const { setToastMessage } = useAppState();

  /** После создания: тост + прокрутка наверх, чтобы scheduled был виден первым. */
  const notifyCreated = (scheduledAt: string | null) => {
    document
      .querySelector('[data-app-scroll-container]')
      ?.scrollTo({ top: 0, behavior: 'smooth' });
    if (scheduledAt) {
      const when = new Date(scheduledAt).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      setToastMessage(`Рассылка запланирована на ${when} — она вверху истории`);
    } else {
      setToastMessage('Рассылка создана — отправляем');
    }
  };

  const handleCreated = (scheduledAt: string | null) => {
    setComposerOpen(false);
    setTab('broadcasts');
    notifyCreated(scheduledAt);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6">
      <PageHeader
        kicker={tab === 'audience' ? 'Аудитория' : 'Рассылки'}
        tone={tab === 'audience' ? 'indigo' : 'orange'}
        title={tab === 'audience' ? 'Аудитория' : 'Рассылки'}
        hint={tab === 'audience'
          ? `${bot.name} · Кто пишет боту и кто оплатил`
          : `${bot.name} · Сегменты аудитории и рассылки по ним`}
      />

      <div className="mt-6">
        {tab === 'audience' ? (
          <AudienceTab
            botId={bot.id}
            summary={summary}
            summaryLoading={summaryLoading}
            onCompose={() => setComposerOpen(true)}
          />
        ) : (
          <BroadcastsTabContent botId={bot.id} counts={summary} mediaReady={Boolean(bot.mediaSyncDone)} onCompose={() => setComposerOpen(true)} onCreated={notifyCreated} />
        )}
      </div>

      {/* Композер-шит нужен только на мобиле: на desktop форма уже в левой колонке */}
      <AnimatePresence>
        {composerOpen && (
          <BroadcastComposerSheet
            botId={bot.id}
            counts={summary}
            mediaReady={Boolean(bot.mediaSyncDone)}
            tariffs={sheetTariffs}
            onClose={() => setComposerOpen(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Аудитория ──────────────────────────────────────────────── */

function AudienceTab({
  botId,
  summary,
  summaryLoading,
  onCompose,
}: {
  botId: string;
  summary: AudienceSummary | null;
  summaryLoading: boolean;
  onCompose: () => void;
}) {
  const [segment, setSegment] = useState<AudienceFilter>('all');
  const [leads, setLeads] = useState<AudienceLead[] | null>(null);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceLead, setInvoiceLead] = useState<AudienceLead | null>(null);
  const [tariffs, setTariffs] = useState<BroadcastTariffOption[]>([]);

  // Тарифы воронки — для выставления счёта (нужны actionType link у оплаты).
  useEffect(() => {
    let cancelled = false;
    apiService
      .getFunnel(botId)
      .then((funnel) => {
        if (cancelled) return;
        setTariffs(collectTariffOptions(funnel.nodes ?? []));
      })
      .catch(() => {
        if (!cancelled) setTariffs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [botId]);
  const invoiceReady = tariffs.length > 0;

  const loadLeads = useCallback(
    (target: AudienceFilter, targetPage: number, append: boolean) =>
      apiService
        .getAudience(botId, target, targetPage, PAGE_SIZE)
        .then((data) => {
          setLeads((prev) => (append ? [...(prev ?? []), ...data.leads] : data.leads));
          setLeadsTotal(data.total);
          setPage(targetPage);
          setError(null);
        })
        .catch((loadError) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Не удалось загрузить аудиторию'
          );
        }),
    [botId]
  );

  useEffect(() => {
    void loadLeads(segment, 1, false);
  }, [segment, loadLeads]);

  const initialLoading = leads === null;
  const hasMore = page * PAGE_SIZE < leadsTotal;
  const empty = !summaryLoading && summary !== null && summary.all === 0;

  if (empty) {
    return (
      <div className="rounded-3xl border border-border bg-card">
        <StoryEmptyState
          icon={Users}
          title="Аудитория пока пуста"
          description="Здесь появятся все, кто напишет вашему боту. Опубликуйте бота — и подписчики подтянутся."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {SEGMENTS.map((item) => {
          const selected = segment === item.value;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setSegment(item.value)}
              className={`rounded-2xl border bg-card p-4 text-left transition-all ${
                selected
                  ? 'border-primary/60 ring-2 ring-ring/20'
                  : 'border-border hover:border-fg-tertiary/50'
              }`}
            >
              <span className="block text-title-lg font-bold tabular-nums">
                {summaryLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  formatNumber(summary ? summary[item.value] : 0)
                )}
              </span>
              <span className="mt-1 block text-meta text-fg-secondary">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-meta font-medium text-fg-secondary">
            {formatNumber(leadsTotal)} в сегменте «
            {SEGMENTS.find((s) => s.value === segment)?.label}»
          </p>
          <Button size="sm" variant="secondary" onClick={onCompose}>
            <Send data-icon="inline-start" aria-hidden />
            Рассылка
          </Button>
        </div>

        {error ? (
          <div className="px-4 py-10 text-center">
            <p className="text-body text-danger">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void loadLeads(segment, 1, false)}
            >
              Повторить
            </Button>
          </div>
        ) : initialLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-fg-tertiary">
            В этом сегменте пока никого нет
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead, index) => (
              <motion.li
                key={lead.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: Math.min(index, 12) * 0.03 }}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-fg-secondary"
                >
                  {(lead.firstName || lead.username || '?')
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-fg-primary">
                    {lead.firstName || lead.username || `ID ${lead.telegramId}`}
                    {lead.username && lead.firstName ? (
                      <span className="ml-1.5 font-normal text-fg-tertiary">
                        @{lead.username}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-meta text-fg-tertiary">
                    {formatDate(lead.createdAt)}
                  </p>
                </div>
                {lead.hasPurchased ? (
                  <StatusBadge tone="success" label="Оплатил" />
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!invoiceReady}
                    onClick={() => setInvoiceLead(lead)}
                    title={invoiceReady ? 'Выставить счёт' : 'Тарифы недоступны'}
                  >
                    <ReceiptText data-icon="inline-start" aria-hidden />
                    Счёт
                  </Button>
                )}
              </motion.li>
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="border-t border-border p-3">
            <Button
              variant="ghost"
              className="w-full"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void loadLeads(segment, page + 1, true).finally(() =>
                  setLoadingMore(false)
                );
              }}
            >
              {loadingMore ? 'Загружаем…' : 'Показать ещё'}
            </Button>
          </div>
        )}
      </div>

      <InvoiceSheet
        botId={botId}
        lead={invoiceLead}
        tariffs={tariffs}
        onClose={() => setInvoiceLead(null)}
        onSent={() => {
          setInvoiceLead(null);
          void loadLeads(segment, 1, false);
        }}
      />
    </div>
  );
}

/* ── Выставление счёта лида ─────────────────────────────────── */

function InvoiceSheet({
  botId,
  lead,
  tariffs,
  onClose,
  onSent,
}: {
  botId: string;
  lead: AudienceLead | null;
  tariffs: BroadcastTariffOption[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [leadKey, setLeadKey] = useState<string | null>(null);
  const { showAlert } = useAlert();

  // Сброс выбора при смене лида — синхронизация в рендере (без эффекта).
  const currentKey = lead ? String(lead.telegramId) : null;
  if (currentKey !== leadKey) {
    setLeadKey(currentKey);
    setSelected([]);
  }

  const send = () => {
    if (!lead || selected.length === 0 || sending) return;
    setSending(true);
    apiService
      .sendInvoice(botId, lead.telegramId, selected)
      .then(() => {
        showAlert({
          type: 'success',
          title: 'Счёт отправлен',
          message: `${lead.firstName || lead.username || 'Клиент'} получит сообщение с кнопкой оплаты.`,
          confirmText: 'Готово',
        });
        onSent();
      })
      .catch((error) => {
        showAlert({
          type: 'danger',
          title: 'Не удалось выставить счёт',
          message:
            error instanceof Error ? error.message : 'Попробуйте ещё раз позже',
        });
      })
      .finally(() => setSending(false));
  };

  if (!lead) return null;
  return (
    <div className="fixed inset-0 z-[130] flex items-end bg-black/50 backdrop-blur-sm sm:items-center sm:justify-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Выставить счёт"
        className="flex h-[100dvh] w-full flex-col border border-border bg-card p-5 sm:h-auto sm:max-h-[88dvh] sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-title-lg font-bold">Выставить счёт</p>
            <p className="mt-0.5 truncate text-meta text-fg-secondary">
              {lead.firstName || lead.username || `ID ${lead.telegramId}`}
              {lead.username ? ` · @${lead.username}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-tertiary transition-colors hover:bg-muted hover:text-fg-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {tariffs.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-border bg-muted/40 px-4 py-6 text-center text-body-sm text-fg-secondary">
            Тарифов нет. Добавьте их в сценарии — блок «Оплата».
          </p>
        ) : (
          <>
            <p className="mt-4 text-meta text-fg-secondary">
              Отметьте один или несколько тарифов — клиент получит сообщение с кнопками оплаты.
            </p>
            <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
              {tariffs.map((tariff) => {
                const checked = selected.includes(tariff.id);
                return (
                  <li key={tariff.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                        checked
                          ? 'border-primary/60 bg-accent/5'
                          : 'border-border hover:border-fg-tertiary/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((prev) =>
                            checked
                              ? prev.filter((id) => id !== tariff.id)
                              : [...prev, tariff.id],
                          )
                        }
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg-primary">
                        {tariff.name}
                      </span>
                      {tariff.price && (
                        <span className="shrink-0 text-body-sm font-bold tabular-nums text-fg-secondary">
                          {tariff.price} ₽
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button className="mt-4 w-full" disabled={selected.length === 0 || sending} onClick={send}>
              {sending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
              ) : (
                <Send data-icon="inline-start" aria-hidden />
              )}
              {sending ? 'Отправляем…' : 'Отправить счёт'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── История рассылок ───────────────────────────────────────── */

function BroadcastsTabContent({
  botId,
  counts,
  mediaReady,
  onCompose,
  onCreated,
}: {
  botId: string;
  counts: AudienceSummary | null;
  mediaReady: boolean;
  /** Открыть шит-композер (нужно пустому состоянию на мобиле). */
  onCompose: () => void;
  /** После создания: обновить ленту + тост/прокрутка наверх. */
  onCreated: (scheduledAt: string | null) => void;
}) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [tariffs, setTariffs] = useState<BroadcastTariffOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Тарифы воронки — для кнопок рассылки (только actionType link).
  useEffect(() => {
    let cancelled = false;
    apiService
      .getFunnel(botId)
      .then((funnel) => {
        if (cancelled) return;
        setTariffs(collectTariffOptions(funnel.nodes ?? []));
      })
      .catch(() => {
        if (!cancelled) setTariffs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [botId]);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { showConfirm, showAlert } = useAlert();

  const load = useCallback(
    () =>
      apiService
        .getBroadcasts(botId)
        .then((data) => {
          setBroadcasts(data.broadcasts);
          setError(null);
        })
        .catch((loadError) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Не удалось загрузить рассылки'
          );
        }),
    [botId]
  );

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const hasActive = (broadcasts ?? []).some(
    (item) =>
      item.status === 'queued' ||
      item.status === 'sending' ||
      item.status === 'scheduled'
  );

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => {
      void load();
    }, 2500);
    return () => clearInterval(timer);
  }, [hasActive, load]);

  const handleRetry = async (broadcast: Broadcast) => {
    setRetryingId(broadcast.id);
    try {
      const updated = await apiService.retryBroadcast(broadcast.id);
      setBroadcasts((prev) =>
        (prev ?? []).map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'Не удалось перезапустить рассылку'
      );
    } finally {
      setRetryingId(null);
    }
  };

  const handleCancel = (broadcast: Broadcast) => {
    showConfirm({
      type: 'warning',
      title: 'Отменить рассылку?',
      message: 'Сообщение не будет отправлено. Действие нельзя отменить.',
      confirmText: 'Отменить рассылку',
      onConfirm: () => {
        setCancellingId(broadcast.id);
        apiService
          .cancelBroadcast(broadcast.id)
          .then((updated) => {
            setBroadcasts((prev) =>
              (prev ?? []).map((item) =>
                item.id === updated.id ? updated : item
              )
            );
          })
          .catch((cancelError) => {
            showAlert({
              type: 'danger',
              title: 'Не удалось отменить рассылку',
              message:
                cancelError instanceof Error
                  ? cancelError.message
                  : 'Попробуйте ещё раз позже',
            });
          })
          .finally(() => setCancellingId(null));
      },
    });
  };

  if (broadcasts === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  // Сводка по текущему месяцу — только из реально загруженных рассылок.
  const now = new Date();
  const monthBroadcasts = broadcasts.filter((item) => {
    if (!item.createdAt) return false;
    const created = new Date(item.createdAt);
    return (
      created.getMonth() === now.getMonth() &&
      created.getFullYear() === now.getFullYear()
    );
  });
  const monthDelivered = monthBroadcasts.reduce((sum, item) => sum + item.sentCount, 0);

  if (broadcasts.length === 0) {    return (
      <div className="rounded-3xl border border-border bg-card">
        <StoryEmptyState
          icon={Megaphone}
          title="Рассылок ещё нет"
          description="Выберите сегмент аудитории и отправьте первое сообщение — история появится здесь."
          action={
            <Button onClick={onCompose}>
              <Plus data-icon="inline-start" aria-hidden />
              Новая рассылка
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Конструктор — закреплённая карточка (desktop), скроллится внутри себя */}
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto" aria-label="Создание рассылки">
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Send className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-body-sm font-bold text-fg-primary">Новая рассылка</p>
              <p className="text-meta text-fg-tertiary">Одно сообщение выбранному сегменту</p>
            </div>
          </div>
          {counts && counts.all > 0 ? (
            <BroadcastComposerForm
              botId={botId}
              counts={counts}
              // После отправки обновляем ленту и показываем тост с прокруткой наверх.
              onCreated={(scheduledAt) => {
                setReloadKey((k) => k + 1);
                onCreated(scheduledAt);
              }}
              mediaReady={mediaReady}
              tariffs={tariffs}
              idPrefix="broadcast-inline"
            />
          ) : (
            <p className="py-4 text-center text-body-sm text-fg-tertiary">
              Аудитория пока пуста — рассылать некому.
            </p>
          )}
        </div>
      </aside>

      {/* Лента кампаний */}
      <div className="space-y-3" aria-label="История рассылок">
        <p className="px-1 text-meta font-medium text-fg-secondary tabular-nums">
          В этом месяце: {monthBroadcasts.length}{' '}
          {pluralBroadcasts(monthBroadcasts.length)} ·{' '}
          {monthDelivered.toLocaleString('ru-RU')} доставлено
        </p>
        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-body text-danger">
            {error}
          </div>
        )}
      {broadcasts.map((broadcast) => {
        const meta = statusMeta[broadcast.status];
        const total = broadcast.totalRecipients;
        const delivered = broadcast.sentCount;
        const progress =
          total > 0 ? Math.min(100, Math.round((delivered / total) * 100)) : 0;
        const inFlight =
          broadcast.status === 'queued' || broadcast.status === 'sending';

        return (
          <motion.article
            key={broadcast.id}
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="rounded-3xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <StatusBadge tone={meta.tone} label={meta.label} />
              <time className="text-meta text-fg-tertiary">
                {formatDate(broadcast.createdAt)}
              </time>
            </div>

            <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-body text-fg-primary">
              {broadcast.text}
            </p>

            {broadcast.status === 'scheduled' && broadcast.scheduledAt && (
              <p className="mt-2 flex items-center gap-1.5 text-meta font-medium text-warning">
                <CalendarClock className="size-3.5" aria-hidden />
                Отправка: {formatDate(broadcast.scheduledAt)}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <StatusBadge
                tone={
                  broadcast.audience === 'paid'
                    ? 'success'
                    : broadcast.audience === 'unpaid'
                      ? 'warning'
                      : 'neutral'
                }
                label={
                  broadcast.audience === 'paid'
                    ? 'Оплатившие'
                    : broadcast.audience === 'unpaid'
                      ? 'Без оплаты'
                      : 'Все'
                }
              />
            </div>

            {inFlight && total > 0 && (
              <div
                className="mt-3"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогресс отправки"
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-meta text-fg-secondary tabular-nums">
                {formatNumber(delivered)} / {formatNumber(total)} доставлено
                {broadcast.failedCount > 0
                  ? ` · ${formatNumber(broadcast.failedCount)} с ошибкой`
                  : ''}
              </p>
              <div className="flex items-center gap-2">
                {(broadcast.status === 'queued' ||
                  broadcast.status === 'scheduled') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancellingId === broadcast.id}
                    onClick={() => handleCancel(broadcast)}
                  >
                    <XCircle data-icon="inline-start" aria-hidden />
                    Отменить
                  </Button>
                )}
                {broadcast.status === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retryingId === broadcast.id}
                    onClick={() => void handleRetry(broadcast)}
                  >
                    <RefreshCw data-icon="inline-start" aria-hidden />
                    Повторить
                  </Button>
                )}
              </div>
            </div>

            {broadcast.lastError && broadcast.status === 'failed' && (
              <p className="mt-2 text-meta text-danger">
                {broadcast.lastError}
              </p>
            )}
          </motion.article>
        );
      })}
      </div>
    </div>
  );
}

/** «1 рассылка / 2 рассылки / 5 рассылок». */
function pluralBroadcasts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'рассылка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'рассылки';
  return 'рассылок';
}
