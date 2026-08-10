
import { ChevronDown, Bot } from 'lucide-react';
import type { TabType, AppState, SheetType } from '../types';

interface HeaderProps {
  activeTab: TabType;
  appState: AppState;
  setSheet: (sheet: SheetType) => void;
  onCreateBot: () => void;
}

const TAB_TITLES: Record<TabType, string> = {
  home:    'Главная',
  build:   'Воронка',
  flow:    'Схема логики',
  profile: 'Профиль',
  subscription: 'Подписка',
  manage: 'Ваши боты',
  admin_stats: 'Управление сервисом'
};

export const Header = ({ activeTab, appState, setSheet }: HeaderProps) => {
  return (
    <header
      className="shrink-0 flex items-center justify-between px-4 lg:px-8 h-[56px] lg:h-[74px] glass-panel"
      style={{
        borderBottom: '1px solid var(--color-border)',
        zIndex: 40,
        position: 'sticky',
        top: 0
      }}
    >
      {/* Mobile Header (Centered Bot Switcher or Title) */}
      <div className="absolute inset-0 flex items-center justify-center lg:hidden z-10 pointer-events-auto">
        {appState.activeBot ? (
          <button 
            onClick={() => setSheet('bot_switcher')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] active:bg-[var(--color-border)] transition-colors border border-[var(--color-border)]"
          >
            <Bot size={14} className="text-[var(--color-primary)] shrink-0" />
            <span className="text-[14px] font-semibold text-[var(--color-foreground)] truncate max-w-[140px]">
              {appState.activeBot.name}
            </span>
            <ChevronDown size={14} className="text-[var(--color-foreground-secondary)] shrink-0" />
          </button>
        ) : (
          <h1 className="text-[17px] font-bold text-[var(--color-foreground)] pointer-events-none" style={{ letterSpacing: '-0.01em' }}>
            {TAB_TITLES[activeTab]}
          </h1>
        )}
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center gap-3 w-auto relative z-10">
        <h1 className="text-screen-title">{TAB_TITLES[activeTab]}</h1>
      </div>

      {/* Right side for desktop actions if any */}
      <div className="hidden lg:flex items-center gap-2 relative z-10" />
    </header>
  );
};
