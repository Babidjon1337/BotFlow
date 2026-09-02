import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BOT_VIEWS } from '../../routes';
import type { AccountTab, AppRoute, BotView } from '../../routes';
import { cn } from '../../lib/utils';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import type { BotConfig } from '../../types';

/** Локальные тона разделов бота (DS v2 §5): Обзор blue, Сценарий cyan, Продажи green, Рассылки orange. Legacy clients/analytics алиасятся на overview. */
const BOT_VIEW_TONES: Record<BotView, string> = {
  overview: 'nav-tone-blue',
  scenario: 'nav-tone-cyan',
  integrations: 'nav-tone-green',
  audience: 'nav-tone-indigo',
  broadcasts: 'nav-tone-orange',
  clients: 'nav-tone-blue',
  analytics: 'nav-tone-indigo',
};

interface AppShellProps {
  route: AppRoute;
  onAccountTab: (tab: AccountTab) => void;
  onBotView: (view: BotView) => void;
  onBackToBots: () => void;
  onOpenBotSettings: () => void;
  onOpenBotSwitcher: () => void;
  activeBot: BotConfig | null;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  bottomNavHidden?: boolean;
  isFirstEntry?: boolean;
  children: ReactNode;
}

export function AppShell({
  route,
  onAccountTab,
  onBotView,
  onBackToBots,
  onOpenBotSettings,
  onOpenBotSwitcher,
  activeBot,
  isAdmin,
  theme,
  toggleTheme,
  bottomNavHidden,
  isFirstEntry = false,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {!isFirstEntry && (
        <Sidebar
          route={route}
          onAccountTab={onAccountTab}
          isAdmin={isAdmin}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}

      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', !isFirstEntry && 'lg:ml-[248px]')}>
        {!isFirstEntry && (
          <TopBar
            route={route}
            activeBot={activeBot}
            onBackToBots={onBackToBots}
              onOpenBotSettings={onOpenBotSettings}
            onOpenBotSwitcher={onOpenBotSwitcher}
          />
        )}

        {route.level === 'bot' && (
          <nav
            aria-label="Разделы бота"
            className="flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:px-8"
          >
            {BOT_VIEWS.map(view => {
              const active = route.view === view.id;
              const disabled = Boolean(view.comingSoon);
              return (
                <button
                  key={view.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onBotView(view.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'nav-tone tab-item tab-press relative shrink-0 rounded-lg px-3 py-1.5 text-body-sm font-medium transition-colors',
                    BOT_VIEW_TONES[view.id] ?? 'nav-tone',
                    active
                      ? 'on'
                      : 'text-fg-secondary hover:bg-muted hover:text-foreground',
                    disabled && 'cursor-not-allowed text-fg-tertiary hover:bg-transparent',
                  )}
                >
                  <span className="relative z-10">
                    {view.label}
                    {disabled && (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-micro">скоро</span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        <main
          data-app-scroll-container
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route.level === 'account' ? `acc-${route.tab}` : `bot-${activeBot?.id ?? ''}-${route.view}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn(
                isFirstEntry
                  ? 'min-h-full w-full'
                  : 'mx-auto w-full px-4 pb-24 pt-4 lg:px-8 lg:pb-10 lg:pt-6',
                !isFirstEntry && (route.level === 'account' && route.tab === 'admin' ? 'max-w-[1440px]' : 'max-w-[1120px]'),
              )}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!isFirstEntry && (
        <BottomNav
          activeTab={route.level === 'account' ? route.tab : 'bots'}
          onAccountTab={onAccountTab}
          hidden={bottomNavHidden}
        />
      )}
    </div>
  );
}
