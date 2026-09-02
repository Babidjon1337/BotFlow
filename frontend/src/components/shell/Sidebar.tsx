import { motion } from 'framer-motion';
import { Bot, Moon, ShieldCheck, Sun } from 'lucide-react';
import { ACCOUNT_TABS } from '../../routes';
import type { AppRoute, AccountTab } from '../../routes';
import { ACCOUNT_TAB_ICONS } from './navModel';
import { cn } from '../../lib/utils';

interface SidebarProps {
  route: AppRoute;
  onAccountTab: (tab: AccountTab) => void;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

/** Локальные тона разделов (DS v2 §5): окрашивают только пункт меню. Профиль выделен розовым. */
const ACCOUNT_TAB_TONES: Record<string, string> = {
  bots: 'nav-tone-blue',
  billing: 'nav-tone-violet',
  profile: 'nav-tone-rose',
  admin: 'nav-tone',
};

export function Sidebar({
  route,
  onAccountTab,
  isAdmin,
  theme,
  toggleTheme,
}: SidebarProps) {
  const dark = theme === 'dark';

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
                'nav-item nav-press relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors',
                ACCOUNT_TAB_TONES[tab.id] ?? 'nav-tone',
                active
                  ? 'on'
                  : 'text-fg-secondary hover:bg-muted hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-pill"
                  className="absolute inset-0 rounded-md"
                  style={{ backgroundColor: 'var(--nav-tone-soft)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  aria-hidden
                >
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                    style={{ backgroundColor: 'var(--nav-tone)' }}
                  />
                </motion.span>
              )}
              <Icon className="relative z-10 size-5" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-4">
        {isAdmin && (
          <button
            type="button"
            onClick={() => onAccountTab('admin')}
            aria-current={route.level === 'account' && route.tab === 'admin' ? 'page' : undefined}
            className={cn(
              'nav-press flex w-full cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-body-sm font-semibold transition-colors',
              route.level === 'account' && route.tab === 'admin'
                ? 'bg-accent text-accent-foreground'
                : 'text-fg-secondary hover:bg-muted hover:text-foreground',
            )}
          >
            <ShieldCheck className="size-5 shrink-0" />
            Управление сервисом
          </button>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={dark ? 'Светлая тема' : 'Тёмная тема'}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
        >
          {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
      </div>
    </aside>
  );
}
