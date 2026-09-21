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
  admin: 'nav-tone-orange',
};

export function Sidebar({
  route,
  onAccountTab,
  isAdmin,
  theme,
  toggleTheme,
}: SidebarProps) {
  const dark = theme === 'dark';
  const isAdminActive = route.level === 'account' && route.tab === 'admin';

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

      {/* Нижняя часть: кнопка Админка в стиле меню и переключатель темы слева снизу */}
      <div className="space-y-1 border-t border-border/50 p-3">
        {isAdmin && (
          <button
            type="button"
            onClick={() => onAccountTab('admin')}
            aria-current={isAdminActive ? 'page' : undefined}
            className={cn(
              'nav-item nav-press relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium transition-colors',
              ACCOUNT_TAB_TONES.admin ?? 'nav-tone-orange',
              isAdminActive
                ? 'on'
                : 'text-fg-secondary hover:bg-muted hover:text-foreground',
            )}
          >
            {isAdminActive && (
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
            <ShieldCheck className="relative z-10 size-5" />
            <span className="relative z-10">Админка</span>
          </button>
        )}

        <div className="flex items-center justify-start pt-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={dark ? 'Светлая тема' : 'Тёмная тема'}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
