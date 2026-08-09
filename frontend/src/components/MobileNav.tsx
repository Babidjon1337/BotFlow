import { Home, Layers, User, Bot, Crown, type LucideIcon } from 'lucide-react';
import type { TabType } from '../types';
import { useAppState } from '../providers/AppStateProvider';

interface MobileNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  hidden?: boolean;
}

type TelegramWebApp = { HapticFeedback?: { selectionChanged: () => void } };

const TABS: { id: TabType; icon: LucideIcon; label: string; activeColor: string }[] = [
  { id: 'home',    icon: Home,   label: 'Главная',  activeColor: 'var(--color-primary)' },
  { id: 'build',   icon: Layers, label: 'Воронка',  activeColor: 'var(--color-accent)' },
  { id: 'manage',  icon: Bot,    label: 'Боты',     activeColor: 'var(--color-warning)' },
  { id: 'profile', icon: User,   label: 'Профиль',  activeColor: 'var(--color-success)' },
];

export const MobileNav = ({ activeTab, setActiveTab, hidden = false }: MobileNavProps) => {
  const { isAdmin } = useAppState();
  const navTabs = [
    ...TABS,
    ...(isAdmin ? [{ id: 'admin_stats' as TabType, icon: Crown, label: 'Админ', activeColor: '#a855f7' }] : []),
  ];

  return (
    <nav
      className={`fixed bottom-0 left-0 w-full z-50 lg:hidden transition-transform duration-150 ${hidden ? "translate-y-full pointer-events-none" : "translate-y-0"}`}
      aria-label="Мобильная навигация"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-background) 80%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex justify-around items-stretch h-[56px] px-2 pt-1">
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
                tg?.HapticFeedback?.selectionChanged();
                setActiveTab(tab.id);
              }}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-[2px] flex-1 h-full transition-colors duration-200"
              style={{
                color: isActive ? tab.activeColor : 'var(--color-foreground-tertiary)',
              }}
            >
              <div
                data-tour={tab.id === 'home' ? 'tour-nav-stats' : tab.id === 'profile' ? 'tour-nav-profile' : tab.id === 'build' ? 'tour-funnel-tab' : undefined}
                className="flex flex-col items-center justify-center relative z-10"
              >
                <tab.icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{
                    color: isActive ? tab.activeColor : 'var(--color-foreground-tertiary)',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.2s ease-out'
                  }}
                />
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: isActive ? 700 : 500,
                    marginTop: '2px',
                    color: isActive ? tab.activeColor : 'var(--color-foreground-tertiary)',
                    opacity: isActive ? 1 : 0.8,
                    transition: 'all 0.2s ease-out'
                  }}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
