import { Bot, Moon, Sun } from 'lucide-react';
import { ACCOUNT_TABS } from '../../routes';
import type { AppRoute, AccountTab } from '../../routes';
import { ACCOUNT_TAB_ICONS } from './navModel';
import { cn } from '../../lib/utils';

interface SidebarProps {
  route: AppRoute;
  onAccountTab: (tab: AccountTab) => void;
  isAdmin: boolean;
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionUntil: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

function subscriptionLabel(
  status: 'none' | 'active' | 'expired',
  until: string | null,
): { text: string; tone: string } {
  if (status === 'active') {
    const date = until ? new Date(until).toLocaleDateString('ru-RU') : null;
    return {
      text: date ? `Подписка до ${date}` : 'Подписка активна',
      tone: 'text-success bg-success-soft',
    };
  }
  if (status === 'expired') {
    return { text: 'Подписка истекла', tone: 'text-warning bg-warning-soft' };
  }
  return { text: 'Без подписки', tone: 'text-fg-secondary bg-muted' };
}

/** Локальные тона разделов (DS v2 §5): окрашивают только пункт меню. */
const ACCOUNT_TAB_TONES: Record<string, string> = {
  bots: 'nav-tone-blue',
  gateways: 'nav-tone-green',
  billing: 'nav-tone-violet',
  profile: 'nav-tone',
  admin: 'nav-tone',
};

export function Sidebar({
  route,
  onAccountTab,
  isAdmin,
  subscriptionStatus,
  subscriptionUntil,
  theme,
  toggleTheme,
}: SidebarProps) {
  const sub = subscriptionLabel(subscriptionStatus, subscriptionUntil);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary">
          <Bot className="size-[18px] text-primary-foreground" />
        </div>
        <span className="font-accent text-[14px] font-semibold tracking-tight">BotFlow</span>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Основная навигация">
        <p className="px-3 pb-1 pt-2 text-micro font-medium uppercase tracking-wide text-fg-tertiary">
          Аккаунт
        </p>
        {ACCOUNT_TABS.filter(tab => tab.id !== 'admin').map(tab => {
          const Icon = ACCOUNT_TAB_ICONS[tab.id];
          const active = route.level === 'account' && route.tab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onAccountTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'nav-item relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors',
                ACCOUNT_TAB_TONES[tab.id] ?? 'nav-tone',
                active
                  ? 'on'
                  : 'text-fg-secondary hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 px-3 pb-4">
        <div
          className={cn(
            'mx-1 mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-meta font-medium',
            sub.tone,
          )}
        >
          {sub.text}
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onAccountTab('admin')}
            aria-current={route.level === 'account' && route.tab === 'admin' ? 'page' : undefined}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors',
              route.level === 'account' && route.tab === 'admin'
                ? 'bg-accent text-accent-foreground'
                : 'text-fg-secondary hover:bg-muted hover:text-foreground',
            )}
          >
            {(() => {
              const Icon = ACCOUNT_TAB_ICONS.admin;
              return <Icon className="size-5" />;
            })()}
            Управление сервисом
          </button>
        )}
      </div>
    </aside>
  );
}
