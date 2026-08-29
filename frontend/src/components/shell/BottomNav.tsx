import { ACCOUNT_TABS } from '../../routes';
import type { AccountTab } from '../../routes';
import { ACCOUNT_TAB_ICONS } from './navModel';
import { cn } from '../../lib/utils';

interface BottomNavProps {
  activeTab: AccountTab;
  onAccountTab: (tab: AccountTab) => void;
  hidden?: boolean;
}

/** Локальные тона разделов (DS v2 §5) — совпадают с Sidebar. */
const ACCOUNT_TAB_TONES: Record<string, string> = {
  bots: 'nav-tone-blue',
  gateways: 'nav-tone-green',
  billing: 'nav-tone-violet',
  profile: 'nav-tone',
};

export function BottomNav({ activeTab, onAccountTab, hidden }: BottomNavProps) {
  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),var(--tg-content-safe-area-inset-bottom,0px))] transition-transform duration-200 lg:hidden',
        hidden ? 'translate-y-full' : 'translate-y-0',
      )}
    >
      <div className="grid h-14 grid-cols-4">
        {ACCOUNT_TABS.filter(tab => tab.id !== 'admin').map(tab => {
          const Icon = ACCOUNT_TAB_ICONS[tab.id];
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onAccountTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'nav-tone flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 text-micro font-semibold transition-colors',
                ACCOUNT_TAB_TONES[tab.id] ?? 'nav-tone',
                active
                  ? '[&]:text-[var(--nav-tone-text)]'
                  : 'text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              <Icon className="size-5" />
              {tab.short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
