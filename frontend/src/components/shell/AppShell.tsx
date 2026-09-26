import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BOT_VIEWS } from '../../routes';
import type { AccountTab, AppRoute, BotView } from '../../routes';
import { cn } from '../../lib/utils';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { BOT_VIEW_ICONS } from './navModel';
import type { BotConfig } from '../../types';

/** Локальные тона разделов бота (DS v2 §5): Обзор blue, Сценарий cyan, Продажи green, Рассылки orange. Legacy clients/analytics алиасятся на overview. */
const BOT_VIEW_TONES: Record<BotView, string> = {
  overview: 'nav-tone-blue',
  integrations: 'nav-tone-green',
  scenario: 'nav-tone-cyan',
  tariffs: 'nav-tone-blue',
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
  adminOrigin?: boolean;
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
  adminOrigin,
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
            adminOrigin={adminOrigin}
            onBackToBots={onBackToBots}
            onOpenBotSettings={onOpenBotSettings}
            onOpenBotSwitcher={onOpenBotSwitcher}
          />
        )}

        {route.level === 'bot' && (
          <nav
            aria-label="Разделы бота"
            className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-border bg-card px-3 py-2 lg:px-8"
          >
            {BOT_VIEWS.map(view => {
              const active = route.view === view.id;
              const disabled = Boolean(view.comingSoon);
              const Icon = BOT_VIEW_ICONS[view.id];

              return (
                <button
                  key={view.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onBotView(view.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group nav-tone relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm select-none transition-all duration-200',
                    BOT_VIEW_TONES[view.id] ?? 'nav-tone',
                    active
                      ? 'scale-[1.05] font-bold text-foreground shadow-2xs'
                      : 'font-medium text-fg-secondary hover:bg-muted/60 hover:text-foreground active:scale-[0.98]',
                    disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="bot-nav-active-pill"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        backgroundColor: 'var(--nav-tone-soft)',
                        border: '1.5px solid var(--nav-tone)',
                      }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      aria-hidden
                    />
                  )}

                  {Icon && (
                    <Icon
                      className={cn(
                        'relative z-10 size-4 shrink-0 transition-transform duration-200',
                        active ? 'scale-110' : 'opacity-70 group-hover:opacity-100 group-hover:scale-105'
                      )}
                      style={active ? { color: 'var(--nav-tone)' } : undefined}
                    />
                  )}

                  <span className="relative z-10 whitespace-nowrap">
                    {view.label}
                    {disabled && (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] text-fg-tertiary">
                        скоро
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {(() => {
          const isBroadcasts = route.level === 'bot' && route.view === 'broadcasts';
          return (
            <main
              data-app-scroll-container
              className={cn(
                'min-h-0 min-w-0 flex-1',
                isBroadcasts ? 'overflow-y-auto lg:overflow-hidden lg:flex lg:flex-col' : 'overflow-y-auto',
              )}
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
                      : isBroadcasts
                        ? 'mx-auto w-full px-4 pt-3 lg:px-8 lg:pt-4 max-w-6xl pb-24 lg:pb-3 lg:flex-1 lg:flex lg:flex-col lg:min-h-0'
                        : 'mx-auto w-full px-4 pb-24 pt-3 lg:px-8 lg:pb-10 lg:pt-4',
                    !isFirstEntry && (route.level === 'account' && route.tab === 'admin' ? 'max-w-[1440px]' : 'max-w-6xl'),
                  )}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          );
        })()}
      </div>

      {!isFirstEntry && (
        <BottomNav
          activeTab={route.level === 'account' ? route.tab : 'bots'}
          onAccountTab={onAccountTab}
          hidden={bottomNavHidden}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
