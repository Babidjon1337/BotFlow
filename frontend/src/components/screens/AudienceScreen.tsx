import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  ReceiptText,
  Send,
  ExternalLink,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  X,
  ShoppingBag,
} from 'lucide-react';
import type { BotConfig } from '../../types';
import { apiService } from '../../services/api';
import type {
  AudienceFilter,
  AudienceLead,
  AudienceSummary,
} from '../../services/api';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { PageHeader } from '../common/PageHeader';
import { StoryEmptyState } from '../common/StoryEmptyState';
import { LeadDetailModal } from '../sheets/LeadDetailModal';

const SEGMENTS: { value: AudienceFilter; label: string; description: string }[] = [
  { value: 'all', label: 'Все подписчики', description: 'Вся база пользователей' },
  { value: 'paid', label: 'Купившие', description: 'Совершили хотя бы одну оплату' },
  { value: 'unpaid', label: 'Без оплаты', description: 'Пока не совершали покупок' },
];

const PAGE_SIZE = 20;

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(num?: number | null): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toLocaleString('ru-RU');
}

interface AudienceScreenProps {
  bot: BotConfig;
  onNavigateToBroadcasts?: () => void;
}

export const AudienceScreen: React.FC<AudienceScreenProps> = ({
  bot,
  onNavigateToBroadcasts,
}) => {
  const [segment, setSegment] = useState<AudienceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [leads, setLeads] = useState<AudienceLead[] | null>(null);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected lead for detail modal
  const [selectedLead, setSelectedLead] = useState<AudienceLead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Load audience summary counts
  const loadSummary = useCallback(() => {
    setSummaryLoading(true);
    apiService
      .getAudienceSummary(bot.id)
      .then((data) => setSummary(data))
      .catch(() => setSummary({ all: 0, paid: 0, unpaid: 0 }))
      .finally(() => setSummaryLoading(false));
  }, [bot.id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Load leads list
  const loadLeads = useCallback(
    (target: AudienceFilter, targetPage: number, append: boolean, query?: string) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setIsRefreshing(true);
      }
      return apiService
        .getAudience(bot.id, target, targetPage, PAGE_SIZE, query)
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
        })
        .finally(() => {
          setLoadingMore(false);
          setIsRefreshing(false);
        });
    },
    [bot.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLeads(segment, 1, false, searchQuery.trim() || undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [segment, searchQuery, loadLeads]);

  const handleLeadClick = (lead: AudienceLead) => {
    setSelectedLead(lead);
    setIsDetailOpen(true);
  };

  const handleLeadUpdated = () => {
    loadSummary();
    void loadLeads(segment, 1, false, searchQuery.trim() || undefined);
  };

  const initialLoading = leads === null && isRefreshing;
  const hasMore = page * PAGE_SIZE < leadsTotal;
  const isAudienceEmpty = !summaryLoading && summary !== null && summary.all === 0;

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 pb-20">
      {/* Page Header */}
      <PageHeader
        kicker="Аудитория"
        tone="indigo"
        title="Аудитория"
        hint={`${bot.name} · Подписчики бота, история покупок, возвраты и счета`}
      />

      {/* Segment Cards */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        {SEGMENTS.map((item) => {
          const isSelected = segment === item.value;
          const count = summary ? summary[item.value] : 0;

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setSegment(item.value);
                setPage(1);
              }}
              className={`relative flex flex-col items-start justify-between rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary/60 bg-card shadow-xs ring-2 ring-primary/20'
                  : 'border-border bg-card/60 hover:border-fg-tertiary/40 hover:bg-card'
              }`}
            >
              <div className="w-full flex items-center justify-between">
                <span className={`text-[11px] sm:text-xs font-semibold truncate ${isSelected ? 'text-primary' : 'text-fg-secondary'}`}>
                  {item.label}
                </span>
                {item.value === 'paid' && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={10} />
                    Покупки
                  </span>
                )}
              </div>

              <div className="mt-1 sm:mt-2 flex items-baseline gap-1 sm:gap-2">
                <span className="font-accent tabular-nums text-lg sm:text-2xl font-bold text-foreground">
                  {summaryLoading ? <Skeleton className="h-6 sm:h-8 w-12 sm:w-16" /> : formatNumber(count)}
                </span>
                <span className="text-[10px] sm:text-xs text-fg-tertiary">чел.</span>
              </div>

              <p className="hidden sm:block mt-1 text-[11px] text-fg-secondary">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Search & Broadcast CTA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-secondary pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, @username или Telegram ID..."
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-8 text-xs text-foreground placeholder:text-fg-secondary/70 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-secondary hover:text-foreground p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadLeads(segment, 1, false, searchQuery.trim() || undefined)}
            disabled={isRefreshing}
            className="h-10 text-xs"
            title="Обновить список"
          >
            <RefreshCw
              data-icon="inline-start"
              className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Обновить
          </Button>

          {onNavigateToBroadcasts && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onNavigateToBroadcasts}
              className="h-10 text-xs font-semibold"
            >
              <Send data-icon="inline-start" className="size-3.5" />
              Рассылка
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-2xs">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="text-xs font-semibold text-fg-secondary">
            Найдено: <strong className="text-foreground">{formatNumber(leadsTotal)}</strong> пользователей
          </span>
          <span className="text-[11px] text-fg-tertiary">
            Нажмите на пользователя для деталей и счёта
          </span>
        </div>

        {/* Global Empty State */}
        {isAudienceEmpty ? (
          <div className="p-8">
            <StoryEmptyState
              icon={Users}
              title="Аудитория пока пуста"
              description="Здесь появятся все клиенты, запустившие вашего бота в Telegram. Вы сможете видеть их покупки, управлять подписками, возвратами и счетами."
            />
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center">
            <p className="text-xs font-medium text-danger">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-9 text-xs"
              onClick={() => void loadLeads(segment, 1, false, searchQuery.trim() || undefined)}
            >
              Повторить
            </Button>
          </div>
        ) : initialLoading ? (
          <div className="space-y-4 p-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ) : leads && leads.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <Users className="mx-auto size-9 text-fg-tertiary/60 mb-2" />
            <p className="text-sm font-semibold text-foreground">Пользователи не найдены</p>
            <p className="mt-1 text-xs text-fg-secondary">
              {searchQuery
                ? 'По вашему поисковому запросу ничего не найдено.'
                : 'В выбранном сегменте пока нет подписчиков.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {leads?.map((lead, index) => {
              const hasPurchases = lead.hasPurchased || (lead.purchasedTariffs && lead.purchasedTariffs.length > 0);
              const rawTariffs = lead.purchasedTariffs || [];
              const tariffs = Array.from(
                new Map(rawTariffs.map((t) => [t.name || t.tariffId, t])).values()
              );
              const totalPaid = lead.totalPaid || rawTariffs.reduce((sum, t) => sum + t.amount, 0);

              return (
                <motion.li
                  key={lead.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(index, 10) * 0.025 }}
                  onClick={() => handleLeadClick(lead)}
                  className="group flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4 transition-colors hover:bg-muted/40 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Left: User Identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs sm:text-sm select-none">
                      {(lead.firstName || lead.username || '?').slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate text-xs sm:text-sm font-bold text-foreground">
                          {lead.firstName || lead.username || `ID ${lead.telegramId}`}
                        </span>

                        {lead.username && (
                          <a
                            href={`https://t.me/${lead.username}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-[11px] sm:text-xs text-primary hover:underline font-normal"
                          >
                            @{lead.username}
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-fg-secondary">
                        <span className="font-mono text-[10px] sm:text-[11px] text-fg-tertiary">ID: {lead.telegramId}</span>
                        <span>В боте с {formatDate(lead.createdAt)}</span>
                        {lead.currentStep && (
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-fg-tertiary">
                            {lead.currentStep}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Purchased Tariffs Display */}
                  <div className="flex flex-1 flex-col justify-center sm:items-end sm:px-4">
                    {hasPurchases ? (
                      <div className="flex flex-col items-start sm:items-end gap-1">
                        {/* Tariff Badges (deduplicated by name) */}
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 sm:justify-end">
                          {tariffs.length > 0 ? (
                            tariffs.map((t, tIdx) => (
                              <span
                                key={t.paymentId || t.name || tIdx}
                                className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-emerald-700 dark:text-emerald-300 shadow-2xs"
                              >
                                <ShoppingBag size={10} className="text-emerald-500 sm:size-[11px]" />
                                <span>{t.name}</span>
                                <span className="font-accent tabular-nums text-emerald-600 dark:text-emerald-400">
                                  {formatNumber(t.amount)} ₽
                                </span>
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={10} /> Оплачен
                            </span>
                          )}
                        </div>

                        {/* Total Paid */}
                        {totalPaid > 0 && (
                          <span className="text-[10px] sm:text-[11px] font-medium text-fg-secondary">
                            Всего оплат: <strong className="font-accent tabular-nums text-foreground">{formatNumber(totalPaid)} ₽</strong>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-fg-tertiary">
                          Без покупок
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 border-t border-border/60 sm:pt-0 sm:border-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeadClick(lead);
                      }}
                      className="h-8 px-2.5 text-[11px] sm:h-9 sm:px-3 sm:text-xs font-semibold"
                    >
                      <ReceiptText data-icon="inline-start" className="size-3.5" />
                      Счёт / Возврат
                    </Button>

                    <button
                      type="button"
                      aria-label="Подробнее"
                      className="flex size-7 sm:size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors group-hover:text-foreground group-hover:bg-muted"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}

        {/* Pagination: Load More */}
        {hasMore && (
          <div className="border-t border-border p-3.5 text-center">
            <Button
              variant="ghost"
              disabled={loadingMore}
              onClick={() => {
                void loadLeads(segment, page + 1, true, searchQuery.trim() || undefined);
              }}
              className="w-full h-9 text-xs font-semibold"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                  Загружаем следующую страницу...
                </>
              ) : (
                'Показать ещё'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Lead Detail Modal (Handles Purchases, Refund, Cancel Auto-Renew, and Invoicing) */}
      <AnimatePresence>
        {isDetailOpen && selectedLead && (
          <LeadDetailModal
            isOpen={isDetailOpen}
            lead={selectedLead}
            botId={bot.id}
            onClose={() => {
              setIsDetailOpen(false);
              setSelectedLead(null);
            }}
            onLeadUpdated={handleLeadUpdated}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
