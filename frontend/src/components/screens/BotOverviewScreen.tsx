import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  FileText,
  Plug,
  Rocket,
} from 'lucide-react';
import type { BotConfig } from '../../types';
import type { BotView } from '../../routes';
import { formatMoney } from '../shell/navModel';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { EntityTile } from '../common/EntityTile';
import { StatusBadge } from '../common/StatusBadge';
import { DeltaBadge } from '../common/DeltaBadge';
import { CheckStepList, type CheckStepItem } from '../common/CheckStep';
import { Overline, SectionHeader } from '../common/SectionHeader';
import { setIntegrationTarget } from '../../lib/integrationNav';

interface BotOverviewScreenProps {
  bot: BotConfig;
  subscriptionStatus: 'none' | 'active' | 'expired';
  onNavigate: (view: BotView) => void;
  onPublish: () => Promise<void>;
}

type Stats = {
  views: number;
  clicks: number;
  sales: number;
  revenue: number;
};

/**
 * Обзор бота:
 * 1. Интерактивный чеклист запуска со сквозным переходом в нужные блоки (Сценарий, Платформа, Касса).
 * 2. Сбалансированный desktop dashboard: очевидные следующие действия, отсутствие пустоты,
 *    быстрый доступ ко всем компонентам воронки.
 */
export function BotOverviewScreen({
  bot,
  subscriptionStatus,
  onNavigate,
  onPublish,
}: BotOverviewScreenProps) {
  const launched = bot.status === 'active' && bot.funnelComplete;
  return launched ? (
    <LaunchedOverview bot={bot} onNavigate={onNavigate} />
  ) : (
    <LaunchChecklist
      bot={bot}
      subscriptionStatus={subscriptionStatus}
      onNavigate={onNavigate}
      onPublish={onPublish}
    />
  );
}

/* ── До запуска (Чеклист и состояние компонентов) ───────────── */

function LaunchChecklist({
  bot,
  subscriptionStatus,
  onNavigate,
  onPublish,
}: {
  bot: BotConfig;
  subscriptionStatus: 'none' | 'active' | 'expired';
  onNavigate: (view: BotView) => void;
  onPublish: () => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const platformDone = Boolean(bot.username && bot.username !== '@unknown');
  const paymentDone = Boolean(bot.hasPaymentCredentials);
  const publishReady = Boolean(bot.funnelComplete && platformDone && bot.status !== 'active');

  const steps: CheckStepItem[] = useMemo(() => {
    return [
      {
        id: 'scenario',
        label: 'Сценарий',
        hint: bot.funnelComplete ? undefined : 'Стартовое сообщение, дожимы и кнопки воронки',
        state: bot.funnelComplete ? ('done' as const) : ('current' as const),
        onClick: () => onNavigate('scenario'),
      },
      {
        id: 'platform',
        label: 'Платформа',
        hint: platformDone
          ? (bot.username ? `@${bot.username.replace(/^@/, '')}` : undefined)
          : 'Токен от @BotFather — покажем, где взять',
        state: platformDone
          ? ('done' as const)
          : bot.funnelComplete
            ? ('current' as const)
            : ('available' as const),
        onClick: () => {
          setIntegrationTarget('platform');
          onNavigate('integrations');
        },
      },
      {
        id: 'payment',
        label: 'Касса',
        hint: paymentDone
          ? 'Приём платежей настроен'
          : 'Можно пропустить — бот соберёт заявки и без оплаты',
        state: paymentDone ? ('done' as const) : ('available' as const),
        onClick: () => {
          setIntegrationTarget('cashier');
          onNavigate('integrations');
        },
      },
      {
        id: 'publish',
        label: 'Публикация',
        hint:
          bot.status === 'active'
            ? 'Бот запущен и отвечает клиентам'
            : subscriptionStatus === 'active' || Boolean(bot.offerUrl)
              ? 'Бот начнёт отвечать клиентам сразу'
              : 'Перед публикацией проверьте подписку этого бота.',
        state:
          bot.status === 'active'
            ? ('done' as const)
            : !bot.funnelComplete || !platformDone
              ? ('locked' as const)
              : ('current' as const),
        onClick:
          !bot.funnelComplete || !platformDone || bot.status === 'active'
            ? undefined
            : async () => {
                setPublishing(true);
                try {
                  await onPublish();
                } finally {
                  setPublishing(false);
                }
              },
      },
    ];
  }, [bot, platformDone, paymentDone, subscriptionStatus, onNavigate, onPublish]);

  const completedStepsCount =
    (bot.funnelComplete ? 1 : 0) +
    (platformDone ? 1 : 0) +
    (paymentDone ? 1 : 0) +
    (bot.status === 'active' ? 1 : 0);
  const progressPercent = Math.round((completedStepsCount / 4) * 100);

  const nextStepConfig = useMemo(() => {
    if (!bot.funnelComplete) {
      return {
        badge: 'Шаг 1 из 4',
        title: 'Настройте сценарий воронки',
        description: 'Заполните стартовое сообщение, дожимы и кнопки воронки. Без сценария бот не знает, как общаться с клиентом.',
        buttonLabel: 'Перейти к сценарию',
        buttonIcon: ArrowRight,
        onAction: () => onNavigate('scenario'),
        secondaryAction: null,
      };
    }
    if (!platformDone) {
      return {
        badge: 'Шаг 2 из 4',
        title: 'Подключите Telegram-бота',
        description: 'Вставьте токен от @BotFather в разделе «Интеграции». Мы сразу привяжем бота к настроенной воронке.',
        buttonLabel: 'Подключить Telegram',
        buttonIcon: ArrowRight,
        onAction: () => {
          setIntegrationTarget('platform');
          onNavigate('integrations');
        },
        secondaryAction: null,
      };
    }
    if (publishReady) {
      return {
        badge: 'Готово к запуску',
        title: 'Опубликовать бота',
        description: paymentDone
          ? 'Сценарий, платформа и касса настроены. Бот готов принимать клиентов и проводить оплату.'
          : 'Сценарий и Telegram готовы. Вы можете запустить бота сейчас (заявки будут сохраняться) или сначала подключить кассу.',
        buttonLabel: publishing ? 'Публикуем…' : 'Опубликовать бота',
        buttonIcon: Rocket,
        onAction: async () => {
          setPublishing(true);
          try {
            await onPublish();
          } finally {
            setPublishing(false);
          }
        },
        secondaryAction: !paymentDone
          ? {
              label: 'Подключить кассу перед публикацией',
              onClick: () => {
                setIntegrationTarget('cashier');
                onNavigate('integrations');
              },
            }
          : null,
      };
    }
    return {
      badge: 'Бот активен',
      title: 'Воронка работает',
      description: 'Бот запущен и принимает сообщения. Вы можете редактировать сценарий или управлять интеграциями.',
      buttonLabel: 'Открыть сценарий',
      buttonIcon: ArrowRight,
      onAction: () => onNavigate('scenario'),
      secondaryAction: null,
    };
  }, [bot.funnelComplete, platformDone, publishReady, paymentDone, publishing, onNavigate, onPublish]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Top Banner / Progress overview for desktop & mobile */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-display font-bold tracking-tight">Запуск бота</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-micro font-bold text-primary">
              {progressPercent}% готово
            </span>
          </div>
          <p className="mt-1 text-body-sm text-fg-secondary">
            {bot.funnelComplete
              ? 'Основные шаги почти завершены — осталось совсем немного до первого клиента'
              : 'Четыре шага от черновика до работающей воронки продаж'}
          </p>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="h-2.5 w-full min-w-[140px] overflow-hidden rounded-full bg-muted sm:w-48">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-body-sm font-semibold text-fg-secondary">
            {completedStepsCount}/4
          </span>
        </div>
      </div>

      {/* Main 2-Column Dashboard on Desktop */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Column (7 cols on lg, 8 on xl): Interactive Stepper + Component Hub */}
        <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
          {/* Stepper Card */}
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <Overline>Чеклист готовности</Overline>
              <span className="text-micro text-fg-tertiary">Нажмите на любой шаг для перехода</span>
            </div>
            <CheckStepList items={steps} />
          </section>

          {/* Component Quick Status Grid (Fills desktop empty space productively) */}
          <section className="flex flex-col gap-3">
            <Overline>Компоненты бота</Overline>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Сценарий */}
              <button
                type="button"
                onClick={() => onNavigate('scenario')}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </span>
                    <div>
                      <p className="text-body-sm font-bold text-fg-primary group-hover:text-primary">
                        Сценарий
                      </p>
                      <p className="text-micro text-fg-tertiary">
                        {bot.funnelComplete ? 'Воронка настроена' : 'Требует заполнения'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={bot.funnelComplete ? 'success' : 'warning'}
                    label={bot.funnelComplete ? 'Готов' : 'В работе'}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-micro text-fg-secondary">
                  <span>Редактор сообщений и тарифов</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              {/* Платформа (Telegram) */}
              <button
                type="button"
                onClick={() => {
                  setIntegrationTarget('platform');
                  onNavigate('integrations');
                }}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#229ED9]/10 text-[#229ED9]">
                      <Plug className="size-4" />
                    </span>
                    <div>
                      <p className="text-body-sm font-bold text-fg-primary group-hover:text-primary">
                        Telegram
                      </p>
                      <p className="text-micro text-fg-tertiary">
                        {platformDone ? (bot.username ? `@${bot.username.replace(/^@/, '')}` : 'Токен сохранён') : 'Токен не задан'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={platformDone ? 'success' : 'neutral'}
                    label={platformDone ? 'Подключён' : 'Ожидает'}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-micro text-fg-secondary">
                  <span>Связка через @BotFather</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              {/* Касса */}
              <button
                type="button"
                onClick={() => {
                  setIntegrationTarget('cashier');
                  onNavigate('integrations');
                }}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                      <CreditCard className="size-4" />
                    </span>
                    <div>
                      <p className="text-body-sm font-bold text-fg-primary group-hover:text-primary">
                        Оплата
                      </p>
                      <p className="text-micro text-fg-tertiary">
                        {paymentDone ? (bot.paymentProvider ? `Касса: ${bot.paymentProvider}` : 'Подключена') : 'Опционально'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={paymentDone ? 'success' : 'neutral'}
                    label={paymentDone ? 'Активна' : 'Без оплаты'}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-micro text-fg-secondary">
                  <span>ЮKassa, Robokassa, Prodamus</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              {/* Оферта */}
              <button
                type="button"
                onClick={() => {
                  onNavigate('integrations');
                }}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-fg-secondary">
                      <FileText className="size-4" />
                    </span>
                    <div>
                      <p className="text-body-sm font-bold text-fg-primary group-hover:text-primary">
                        Оферта
                      </p>
                      <p className="text-micro text-fg-tertiary">
                        {bot.offerUrl ? 'Ссылка указана' : 'Не требуется'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={bot.offerUrl ? 'success' : 'neutral'}
                    label={bot.offerUrl ? 'Указана' : 'Не задана'}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-micro text-fg-secondary">
                  <span>Юридические условия для клиентов</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            </div>
          </section>
        </div>

        {/* Right Column (5 cols on lg, 4 on xl): Identity Card + Next Step Action + Guide */}
        <aside className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
          <IdentityCard bot={bot} />

          {/* Obvious Next Step Card */}
          <article className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
            <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/10" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <Overline>Следующее действие</Overline>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-micro font-bold text-primary">
                {nextStepConfig.badge}
              </span>
            </div>

            <h2 className="mt-2 text-body-lg font-bold text-fg-primary">
              {nextStepConfig.title}
            </h2>
            <p className="mt-1.5 text-body-sm leading-relaxed text-fg-secondary">
              {nextStepConfig.description}
            </p>

            <Button
              className="mt-4 w-full justify-center"
              size="lg"
              disabled={nextStepConfig.buttonLabel === 'Публикуем…'}
              onClick={() => void nextStepConfig.onAction()}
            >
              <nextStepConfig.buttonIcon className="size-4" data-icon="inline-start" />
              {nextStepConfig.buttonLabel}
            </Button>

            {nextStepConfig.secondaryAction && (
              <button
                type="button"
                onClick={nextStepConfig.secondaryAction.onClick}
                className="mt-2.5 inline-flex w-full items-center justify-center text-meta font-semibold text-fg-secondary transition-colors hover:text-primary"
              >
                {nextStepConfig.secondaryAction.label} →
              </button>
            )}
          </article>

          {/* Helpful context card for desktop */}
          <article className="rounded-2xl border border-border bg-card p-5">
            <Overline>Как работает запуск</Overline>
            <ul className="mt-3 space-y-2.5 text-body-sm text-fg-secondary">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-micro font-bold text-primary">
                  1
                </span>
                <span>Настройте тексты и кнопки приветствия в «Сценарии»</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-micro font-bold text-primary">
                  2
                </span>
                <span>Привяжите токен от @BotFather в «Интеграциях»</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-micro font-bold text-primary">
                  3
                </span>
                <span>Опубликуйте — клиенты смогут переходить и покупать</span>
              </li>
            </ul>
          </article>
        </aside>
      </div>
    </div>
  );
}

/* ── После запуска ──────────────────────────────────────────── */

function LaunchedOverview({
  bot,
  onNavigate,
}: {
  bot: BotConfig;
  onNavigate: (view: BotView) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<Array<{ date: string; sales: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { apiService } = await import('../../services/api');
        const [statsRes, chartRes] = await Promise.all([
          apiService.getStats(bot.id),
          apiService.getBotChartData(bot.id, 'week'),
        ]);
        if (cancelled) return;
        setStats({
          views: statsRes.views,
          clicks: statsRes.clicks,
          sales: statsRes.sales,
          revenue: statsRes.revenue,
        });
        setChart(chartRes.points ?? []);
      } catch {
        // Спокойно показываем нули — экран не должен падать из-за статистики
        if (!cancelled) {
          setStats({ views: 0, clicks: 0, sales: 0, revenue: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bot.id]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <SectionHeader title={bot.name} meta={`@${(bot.username ?? '').replace(/^@/, '')} · результаты за неделю`} />

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:p-6 lg:col-span-7 xl:col-span-8">
          <Overline>Выручка · 7 дней</Overline>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-display-xl font-bold tracking-tight tnum">
              {stats ? formatMoney(stats.revenue) : <Skeleton className="h-10 w-40" />}
            </p>
            {/* Дельта появится вместе с MetricDaily — сейчас честное «—» */}
            <DeltaBadge deltaPercent={null} className="mb-1.5" />
          </div>
          <Sparkline points={chart.map((p) => p.sales)} />
        </section>

        <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
          <IdentityCard bot={bot} />
          <dl className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-card p-5">
            <Kpi label="Подписчики" value={bot.usersCount} />
            <Kpi label="Заявки" value={stats?.clicks} />
            <Kpi label="Продажи" value={stats?.sales} />
          </dl>
        </div>
      </div>

      <QuickLinks hasPayment={Boolean(bot.hasPaymentCredentials)} onNavigate={onNavigate} />
    </div>
  );
}

function QuickLinks({
  hasPayment,
  onNavigate,
}: {
  hasPayment: boolean;
  onNavigate: (view: BotView) => void;
}) {
  const links = [
    {
      icon: FileText,
      label: 'Развить сценарий',
      hint: 'Дожимы и тарифы',
      onClick: () => onNavigate('scenario'),
    },
    {
      icon: hasPayment ? BadgeCheck : CreditCard,
      label: hasPayment ? 'Оплата работает' : 'Подключить оплату',
      hint: hasPayment ? 'Ключи проверены' : 'Принимайте платежи в диалоге',
      onClick: () => {
        setIntegrationTarget('cashier');
        onNavigate('integrations');
      },
    },
    {
      icon: Plug,
      label: 'Платформы',
      hint: 'Telegram подключён',
      onClick: () => {
        setIntegrationTarget('platform');
        onNavigate('integrations');
      },
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {links.map((link) => (
        <button
          key={link.label}
          type="button"
          onClick={link.onClick}
          className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <link.icon className="size-5 shrink-0 text-fg-secondary group-hover:text-primary transition-colors" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold group-hover:text-primary transition-colors">{link.label}</p>
            <p className="truncate text-meta text-fg-tertiary">{link.hint}</p>
          </div>
          <ArrowRight className="ml-auto size-4 shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        </button>
      ))}
    </section>
  );
}

function IdentityCard({ bot }: { bot: BotConfig }) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <EntityTile name={bot.name} />
      <div className="min-w-0">
        <p className="truncate text-body-lg font-semibold">{bot.name}</p>
        <p className="truncate text-meta text-fg-tertiary">@{(bot.username ?? '').replace(/^@/, '') || 'без username'}</p>
        <p className="mt-1 text-micro font-medium text-fg-secondary">Воронка продаж · Telegram</p>
      </div>
      <StatusBadge
        tone={bot.status === 'active' ? 'success' : 'warning'}
        label={bot.status === 'active' ? 'Работает' : 'Черновик'}
        className="ml-auto"
      />
    </article>
  );
}

function Kpi({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <dt className="text-micro font-medium uppercase tracking-wide text-fg-tertiary">{label}</dt>
      <dd className="tnum mt-1 text-display font-bold">
        {value === undefined ? <Skeleton className="h-7 w-12" /> : value.toLocaleString('ru-RU')}
      </dd>
    </div>
  );
}

/** Плоская area-линия продаж (§6.2 Charts): p100 заливка, primary линия. */
function Sparkline({ points }: { points: number[] }) {
  const width = 720;
  const height = 160;
  if (points.length < 2) {
    return (
      <div
        role="img"
        aria-label="Нет данных за период"
        className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-border-strong text-meta text-fg-tertiary sm:h-[160px]"
      >
        Пока нет данных за период
      </div>
    );
  }
  const max = Math.max(...points, 1);
  const stepX = width / (points.length - 1);
  const coords = points.map((value, index) => [
    index * stepX,
    height - (value / max) * (height - 12) - 6,
  ] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Продажи по дням"
      className="h-[120px] w-full sm:h-[160px]"
    >
      <path d={area} fill="var(--p-100)" stroke="none" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
