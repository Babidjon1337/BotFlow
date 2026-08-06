import { Home, Layers, User, GitBranch, Crown, Moon, Sun, ChevronDown, Star, Bot, type LucideIcon } from 'lucide-react';
import { cn } from '../utils';
import type { TabType, AppState, SheetType } from '../types';
import { useAppState } from '../providers/AppStateProvider';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  appState: AppState;
  setSheet: (sheet: SheetType) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onCreateBot: () => void;
}

const MAIN_NAV: { id: TabType; icon: LucideIcon; label: string; activeColor: string }[] = [
  { id: 'home',    icon: Home,      label: 'Главная', activeColor: 'var(--color-primary)'  },
  { id: 'build',   icon: Layers,    label: 'Воронка', activeColor: 'var(--color-accent)'  },
  { id: 'manage',  icon: Bot,       label: 'Мои боты', activeColor: 'var(--color-warning)'  },
  { id: 'flow',    icon: GitBranch, label: 'Схема логики', activeColor: '#ec4899' },
];

export const Sidebar = ({ activeTab, setActiveTab, appState, setSheet, theme, toggleTheme, onCreateBot }: SidebarProps) => {
  const { activeBot, subscriptionStatus } = appState;
  const { isAdmin } = useAppState();
  const isSubscribed = subscriptionStatus === 'active' || isAdmin;

  const navItems = [
    ...MAIN_NAV,
    ...(isAdmin ? [{ id: 'admin_stats' as TabType, icon: Crown, label: 'Аналитика SaaS', activeColor: '#a855f7' }] : []),
  ];

  return (
    <aside
      className="hidden lg:flex flex-col w-[260px] shrink-0 fixed top-0 left-0 bottom-0 z-50 transition-colors"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div 
        className="px-6 flex items-center shrink-0" 
        style={{ height: '80px' }}
      >
        <div className="flex items-center gap-3.5">
          <img src="/logo_BotFlow.png" alt="BotFlow" className="w-11 h-11 rounded-[14px] object-cover shadow-sm" />
          <span
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--color-foreground)',
              letterSpacing: '-0.03em',
              lineHeight: '1',
              paddingTop: '2px', // Slight visual adjustment to perfectly align baselines
            }}
          >
            BotFlow
          </span>
        </div>
      </div>

      {/* Bot switcher */}
      <div className="px-4 mb-2">
        <button
          onClick={() => activeBot ? setSheet('bot_switcher') : onCreateBot()}
          className="w-full flex items-center justify-between p-2 rounded-xl transition-all duration-200 hover:bg-[var(--color-surface-2)] border border-transparent hover:border-[var(--color-border)] group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)] font-bold text-[13px]">
              {activeBot ? activeBot.name.substring(0, 2).toUpperCase() : <Bot size={16} />}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[14px] font-semibold text-[var(--color-foreground)] leading-tight truncate max-w-[120px]">
                {activeBot ? activeBot.name : 'Выберите бота'}
              </span>
              <span className="text-[11px] text-[var(--color-foreground-tertiary)] mt-[2px]">
                {activeBot ? (activeBot.status === 'active' ? 'В работе' : 'Выключен') : 'Нет активного бота'}
              </span>
            </div>
          </div>
          <ChevronDown size={16} className="text-[var(--color-foreground-tertiary)] transition-transform group-hover:translate-y-0.5" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Основная навигация" className="flex-1 min-h-0 px-4 pt-4 pb-4 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="px-3 mb-1" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-foreground-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Меню</div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-300 group relative text-left'
              )}
              style={{
                color: isActive ? 'var(--color-foreground)' : 'var(--color-foreground-secondary)',
                background: isActive ? 'var(--color-surface-2)' : 'transparent',
              }}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full" style={{ background: item.activeColor }} />
              )}
              <div
                className={cn("flex items-center justify-center w-8 h-8 rounded-[10px] transition-transform duration-300", isActive ? "scale-105 shadow-sm" : "group-hover:scale-110")}
                style={{
                  background: isActive ? 'var(--color-surface)' : 'transparent',
                  color: isActive ? item.activeColor : 'var(--color-foreground-tertiary)',
                }}
              >
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
            </button>
          );
        })}

      </nav>

      {/* Bottom controls */}
      <div className="mt-auto flex flex-col gap-3 p-4 shrink-0 border-t border-[var(--color-border)]">
        
        {/* Profile Button */}
        <button
          onClick={() => setActiveTab('profile')}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-300 group relative text-left'
          )}
          style={{
            color: activeTab === 'profile' ? 'var(--color-foreground)' : 'var(--color-foreground-secondary)',
            background: activeTab === 'profile' ? 'var(--color-surface-2)' : 'transparent',
          }}
        >
          {activeTab === 'profile' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full" style={{ background: 'var(--color-success)' }} />
          )}
          <div
            className={cn("flex items-center justify-center w-8 h-8 rounded-[10px] transition-transform duration-300", activeTab === 'profile' ? "scale-105 shadow-sm" : "group-hover:scale-110")}
            style={{
              background: activeTab === 'profile' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'profile' ? 'var(--color-success)' : 'var(--color-foreground-tertiary)',
            }}
          >
            <User size={18} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: activeTab === 'profile' ? 700 : 500 }}>Профиль</span>
        </button>

        {/* Tariff Card */}
        {isSubscribed ? (
          <div className="bg-[var(--color-surface-2)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-tertiary)', textTransform: 'uppercase' }}>Ваш тариф</div>
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[var(--color-success-soft)] text-[var(--color-success)] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                Активен
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#C026D3] flex items-center justify-center shrink-0 shadow-md">
                <Crown size={20} className="text-white" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: isAdmin ? '#c084fc' : 'var(--color-foreground)' }}>{isAdmin ? 'АДМИН' : 'PRO'}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-foreground-secondary)' }}>
                  <span style={{ color: 'var(--color-foreground)', fontWeight: 700 }}>{appState.bots.length}</span> {isAdmin ? 'ботов (Безлимитно)' : 'из 10 ботов'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveTab(isAdmin ? 'admin_stats' : 'subscription')}
              className="w-full flex items-center justify-center py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-soft)] hover:text-[var(--color-primary)] transition-all duration-300 shadow-sm group"
            >
              <span style={{ fontSize: '13px', fontWeight: 600 }} className="transition-colors">{isAdmin ? '📊 Дашборд' : 'Управление'}</span>
            </button>
          </div>
        ) : (
          <div 
            className="bg-[var(--color-surface)] border-2 border-[var(--color-primary-soft)] rounded-[16px] p-3 transition-colors relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-soft)] to-transparent opacity-50 pointer-events-none" />
            <div className="relative z-10">
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Ваш тариф</div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center shrink-0 border border-[var(--color-border)] group-hover:scale-105 transition-transform duration-300">
                  <Star size={18} className="text-[var(--color-primary)]" />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-foreground)' }}>{appState.bots.length > 0 ? 'Базовый' : 'Бесплатный'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-foreground-secondary)' }}>
                    Ботов: <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{appState.bots.length}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('subscription')}
                className="w-full flex items-center justify-center py-2 rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity shadow-md"
              >
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Улучшить тариф</span>
              </button>
            </div>
          </div>
        )}

        <button
          onClick={toggleTheme}
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-[14px] bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon size={16} className="text-[var(--color-foreground-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
            ) : (
              <Sun size={16} className="text-[var(--color-foreground-secondary)] group-hover:text-[var(--color-primary)] transition-colors" />
            )}
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-foreground)' }}>Тема</span>
          </div>
          <div 
            className="w-7 h-4 rounded-full relative transition-colors duration-300"
            style={{ background: theme === 'dark' ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
          >
            <div 
              className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all duration-300 shadow-sm"
              style={{ left: theme === 'dark' ? 'calc(100% - 14px)' : '2px' }}
            />
          </div>
        </button>
      </div>
    </aside>
  );
};
