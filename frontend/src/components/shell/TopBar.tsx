import { ChevronLeft, ChevronsUpDown, Settings2 } from 'lucide-react';
import type { AppRoute } from '../../routes';
import { ACCOUNT_TABS } from '../../routes';
import type { BotConfig } from '../../types';
import { formatBotUsername } from './navModel';

interface TopBarProps {
  route: AppRoute;
  activeBot: BotConfig | null;
  adminOrigin?: boolean;
  onBackToBots: () => void;
  onOpenBotSettings: () => void;
  onOpenBotSwitcher: () => void;
}

function BotStatusBadge({ status }: { status: BotConfig['status'] }) {
  const map = {
    active: { label: 'Работает', className: 'bg-success-soft text-success' },
    inactive: { label: 'Черновик', className: 'bg-muted text-fg-secondary' },
  } as const;
  const view = map[status] ?? map.inactive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium ${view.className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {view.label}
    </span>
  );
}

export function TopBar({
  route,
  activeBot,
  adminOrigin,
  onBackToBots,
  onOpenBotSettings,
  onOpenBotSwitcher,
}: TopBarProps) {
  const title =
    route.level === 'bot'
      ? null
      : ACCOUNT_TABS.find(t => t.id === route.tab)?.label ?? '';

  return (
    <header className="flex min-h-[calc(3.5rem+max(env(safe-area-inset-top),var(--tg-content-safe-area-inset-top,0px)))] shrink-0 items-center gap-2 border-b border-border bg-card px-4 pt-[max(env(safe-area-inset-top),var(--tg-content-safe-area-inset-top,0px))] lg:min-h-[calc(4rem+max(env(safe-area-inset-top),var(--tg-content-safe-area-inset-top,0px)))] lg:px-8">
      {route.level === 'bot' ? (
        <>
          <button
            type="button"
            onClick={onBackToBots}
            aria-label={adminOrigin ? "Вернуться в админку" : "К списку ботов"}
            title={adminOrigin ? "Вернуться в админку" : "К списку ботов"}
            className="-ml-2 flex size-9 cursor-pointer items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={onOpenBotSwitcher}
            aria-label="Выбрать другого бота"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
          >
            <span className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-title font-semibold leading-tight">
                {activeBot?.name ?? 'Бот'}
              </p>
              {adminOrigin && (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Режим админа
                </span>
              )}
            </div>
            <p className="truncate text-meta text-fg-tertiary">
              {formatBotUsername(activeBot?.username)}
            </p>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" />
          </button>
          {activeBot && <BotStatusBadge status={activeBot.status} />}
          {adminOrigin && (
            <button
              type="button"
              onClick={onBackToBots}
              className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
              title="Вернуться в админку"
            >
              В админку
            </button>
          )}
          <button
            type="button"
            onClick={onOpenBotSettings}
            aria-label="Настройки бота"
            className="ml-1 flex size-9 cursor-pointer items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-5" />
          </button>
        </>
      ) : (
        <h1 className="flex-1 truncate text-title font-semibold">{title}</h1>
      )}
    </header>
  );
}
