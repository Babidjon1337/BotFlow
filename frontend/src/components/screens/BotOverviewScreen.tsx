import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  FileText,
  Plug,
  Rocket,
  Send,
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
import { StoryEmptyState } from '../common/StoryEmptyState';

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

type LeadItem = {
  name: string;
  time: string;
  paid: boolean;
};

/**
 * Обзор бота (blueprint #3): до запуска focal — CheckStep запуска,
 * после — hero-KPI и развитие. Онбординг сворачивается после публикации.
 */
export function BotOverviewScreen({
  bot,
  subscriptionStatus,
  onNavigate,
  onPublish,
}: BotOverviewScreenProps) {
  const launched = bot.status === 'active' && bot.funnelComplete;
  return launched ? (
    <LaunchedOverview bot={bot} />
  ) : (
    <LaunchChecklist
      bot={bot}
      subscriptionStatus={subscriptionStatus}
      onNavigate={onNavigate}
      onPublish={onPublish}
    />
  );
}

/* ── До запуска ─────────────────────────────────────────────── */

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

  const steps: CheckStepItem[] = useMemo(() => {
    const scenarioState = bot.funnelComplete ? ('done' as const) : ('current' as const);
    return [
      {
        id: 'scenario',
        label: 'Сценарий',
        hint: 'Стартовое сообщение, дожимы и оплата',
        state: scenarioState,
        onClick: () => onNavigate('scenario'),
      },
      {
        id: 'platform',
        label: 'Платформа',
        hint: platformDone ? undefined : 'Токен от @BotFather — покажем, где взять',
        state: bot.funnelComplete ? (platformDone ? ('done' as const) : ('current' as const)) : 'locked',
        onClick: () => onNavigate('integrations'),
      },
      {
        id: 'payment',
        label: 'Касса',
        hint: paymentDone ? undefined : 'Можно пропустить — бот соберёт заявки и без оплаты',
        state:
          !bot.funnelComplete || !platformDone
            ? 'locked'
            : paymentDone
              ? ('done' as const)
              : ('available' as const),
        onClick: () => onNavigate('integrations'),
      },
      {
        id: 'publish',
        label: 'Публикация',
        hint:
          bot.status === 'active'
            ? undefined
            : subscriptionStatus === 'active' || Boolean(bot.offerUrl)
              ? 'Бот начнёт отвечать клиентам сразу'
              : 'Перед публикацией проверьте подписку этого бота.',
        state:
          !bot.funnelComplete || !platformDone
            ? 'locked'
            : bot.status === 'active'
              ? ('done' as const)
              : ('available' as const),
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

  const publishReady =
    bot.funnelComplete &&
    platformDone &&
    bot.status !== 'active';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex flex-col gap-6">
        <SectionHeader
          title="Запуск бота"
          meta={
            bot.funnelComplete
              ? 'Осталось несколько шагов — бот почти готов'
              : 'Четыре шага от черновика до работающей воронки'
          }
        />
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <CheckStepList items={steps} />
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <IdentityCard bot={bot} />
        <article className="rounded-xl border border-border bg-card p-5">
          <Overline>Следующий шаг</Overline>
          <p className="mt-2 text-body text-fg-secondary">
            {!bot.funnelComplete
              ? 'Заполните сценарий: приветствие, дожимы и тарифы.'
              : !platformDone
                ? 'Подключите Telegram — вставьте токен от @BotFather.'
                : publishReady
                  ? 'Всё готово к публикации.'
                  : 'Проверьте подключение оплаты или публикуйте без неё.'}
          </p>
          <Button
            className="mt-4 w-full"
            disabled={!publishReady || publishing}
            onClick={() => void onPublish()}
          >
            <Rocket className="size-4" data-icon="inline-start" />
            {publishing ? 'Публикуем…' : 'Опубликовать бота'}
          </Button>
        </article>
      </aside>
    </div>
  );
}

/* ── После запуска ──────────────────────────────────────────── */

function LaunchedOverview({ bot }: { bot: BotConfig }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<Array<{ date: string; sales: number }>>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { apiService } = await import('../../services/api');
        const [statsRes, chartRes, leadsRes] = await Promise.all([
          apiService.getStats(bot.id),
          apiService.getBotChartData(bot.id, 'week'),
          apiService.getLeads(bot.id, '', 1, 5),
        ]);
        if (cancelled) return;
        setStats({
          views: statsRes.views,
          clicks: statsRes.clicks,
          sales: statsRes.sales,
          revenue: statsRes.revenue,
        });
        setChart(chartRes.points ?? []);
        setLeads(
          (leadsRes.leads ?? []).slice(0, 5).map(lead => ({
            name:
              (lead.first_name as string) ||
              (lead.username as string) ||
              `id${lead.telegram_id}`,
            time: formatDate((lead.created_at as string) ?? ''),
            paid: Boolean(lead.has_purchased),
          })),
        );
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
    <div className="flex flex-col gap-8">
      <SectionHeader title={bot.name} meta={`@${(bot.username ?? '').replace(/^@/, '')} · результаты за неделю`} />

      <section className="flex flex-col gap-2">
        <Overline>Выручка · 7 дней</Overline>
        <div className="flex flex-wrap items-end gap-3">
          <p className="text-display-xl font-bold tracking-tight tnum">
            {stats ? formatMoney(stats.revenue) : <Skeleton className="h-10 w-40" />}
          </p>
          {/* Дельта появится вместе с MetricDaily — сейчас честное «—» */}
          <DeltaBadge deltaPercent={null} className="mb-1.5" />
        </div>
        <Sparkline points={chart.map(p => p.sales)} />
      </section>

      <dl className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-card p-5 sm:max-w-md">
        <Kpi label="Подписчики" value={bot.usersCount} />
        <Kpi label="Заявки" value={stats?.clicks} />
        <Kpi label="Продажи" value={stats?.sales} />
      </dl>

      <section className="flex flex-col gap-3">
        <Overline>Последняя активность</Overline>
        {leads.length === 0 ? (
          <StoryEmptyState
            icon={Send}
            image={{ src: '/visuals/empty/empty-bots.png', alt: '', size: 140 }}
            title="Пока тихо"
            description="Как только клиенты напишут боту, их заявки появятся здесь."
            className="rounded-xl border border-dashed border-border-strong py-10"
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-5">
            {leads.map((lead, index) => (
              <li key={`${lead.name}-${index}`} className="flex items-center justify-between py-3 first:pt-4 last:pb-4">
                <span className="truncate text-body font-medium">{lead.name}</span>
                <span className="ml-4 flex shrink-0 items-center gap-3">
                  {lead.paid && <StatusBadge tone="success" label="Оплата" />}
                  <span className="text-meta text-fg-tertiary tnum">{lead.time}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QuickLinks hasPayment={Boolean(bot.hasPaymentCredentials)} />
    </div>
  );
}

function QuickLinks({ hasPayment }: { hasPayment: boolean }) {
  const links = [
    { icon: FileText, label: 'Развить сценарий', hint: 'Дожимы и тарифы' },
    hasPayment
      ? { icon: BadgeCheck, label: 'Оплата работает', hint: 'Ключи проверены' }
      : { icon: CreditCard, label: 'Подключить оплату', hint: 'Принимайте платежи в диалоге' },
    { icon: Plug, label: 'Платформы', hint: 'Telegram подключён' },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {links.map(link => (
        <article key={link.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <link.icon className="size-5 shrink-0 text-fg-secondary" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{link.label}</p>
            <p className="truncate text-meta text-fg-tertiary">{link.hint}</p>
          </div>
          <ArrowRight className="ml-auto size-4 shrink-0 text-fg-tertiary" aria-hidden />
        </article>
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

function formatDate(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
