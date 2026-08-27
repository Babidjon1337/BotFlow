import { ACCOUNT_TABS } from '../../routes';
import type { AccountTab } from '../../routes';
import { ACCOUNT_TAB_ICONS } from './navModel';
import { cn } from '../../lib/utils';

interface BottomNavProps {
  activeTab: AccountTab;
  onAccountTab: (tab: AccountTab) => void;
  hidden?: boolean;
}

export function BottomNav({ activeTab, onAccountTab, hidden }: BottomNavProps) {
  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),var(--tg-content-safe-area-inset-bottom,0px))] transition-transform duration-200 lg:hidden',
        hidden ? 'translate-y-full' : 'translate-y-0',
      )}
    >
      <div className="grid h-14 grid-cols-3">
        {ACCOUNT_TABS.filter(tab => tab.id !== 'admin' && tab.id !== 'gateways').map(tab => {
          const Icon = ACCOUNT_TAB_ICONS[tab.id];
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onAccountTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 text-micro font-medium transition-colors',
                active ? 'text-primary' : 'text-fg-tertiary hover:text-fg-secondary',
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
