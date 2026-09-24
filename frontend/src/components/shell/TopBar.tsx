import { ChevronLeft, ChevronsUpDown } from 'lucide-react';
import type { AppRoute } from '../../routes';
import { ACCOUNT_TABS } from '../../routes';
import type { BotConfig } from '../../types';
import { formatBotUsername } from './navModel';

interface TopBarProps {
  route: AppRoute;
  activeBot: BotConfig | null;
  adminOrigin?: boolean;
  onBackToBots: () => void;
  onOpenBotSettings?: () => void;
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${view.className}`}
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
  onOpenBotSwitcher,
}: TopBarProps) {
  const title =
    route.level === 'bot'
      ? null
      : ACCOUNT_TABS.find(t => t.id === route.tab)?.label ?? '';

  return (
    <header
      className="flex h-[calc(3.25rem+var(--tg-content-safe-area-inset-top,0px))] shrink-0 items-center justify-between gap-2 border-b border-border bg-card pl-3 sm:pl-4 lg:pl-6"
      style={{
        paddingTop: 'var(--tg-content-safe-area-inset-top, 0px)',
        paddingRight: 'calc(var(--tg-content-safe-area-inset-right, 0px) + 1.25rem)',
      }}
    >
      {route.level === 'bot' ? (
        <>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onBackToBots}
              aria-label={adminOrigin ? "Вернуться в админку" : "К списку ботов"}
              title={adminOrigin ? "Вернуться в админку" : "К списку ботов"}
              className="-ml-1 flex size-8 cursor-pointer items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={onOpenBotSwitcher}
              aria-label="Выбрать другого бота"
              className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-muted"
            >
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                <span className="truncate text-base sm:text-[17px] font-bold text-foreground leading-none">
                  {activeBot?.name ?? 'Бот'}
                </span>
                <span className="truncate text-xs sm:text-[13px] font-medium text-fg-secondary leading-none">
                  {formatBotUsername(activeBot?.username)}
                </span>
                {activeBot && <BotStatusBadge status={activeBot.status} />}
                <ChevronsUpDown className="size-3.5 shrink-0 text-fg-tertiary transition-colors group-hover:text-foreground" />
                {adminOrigin && (
                  <span className="hidden sm:inline-flex shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    Режим админа
                  </span>
                )}
              </div>
            </button>
          </div>
        </>
      ) : (
        <h1 className="flex-1 truncate text-base font-bold text-foreground sm:text-lg">{title}</h1>
      )}
    </header>
  );
}
