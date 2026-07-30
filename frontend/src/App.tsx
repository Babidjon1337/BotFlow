import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';

import { Home } from './components/tabs/Home';
import { Build } from './components/tabs/Build';
import { Flow } from './components/tabs/Flow';
import { BotManagement } from './components/tabs/BotManagement';
import { Profile } from './components/tabs/Profile';
import { Subscription } from './components/tabs/Subscription';
import { AdminStats } from './components/tabs/AdminStats';

import { BotSettings } from './components/sheets/BotSettings';
import { CheckoutSheet } from './components/sheets/CheckoutSheet';
import { BotCreateSheet } from './components/sheets/BotCreateSheet';
import { BotSwitcher } from './components/sheets/BotSwitcher';
import { BillingRenew } from './components/sheets/BillingRenew';

import { Toast } from './components/Toast';
import { useAppState } from './providers/AppStateProvider';
import { mapApiBot } from './services/botMapper';
import { useBotToggle } from './hooks/useBotToggle';

export default function App() {
  const {
    appState,
    setAppState,
    activeTab,
    setActiveTab,
    toastMessage,
    setToastMessage,
    theme,
    toggleTheme,
    setSheet,
    handleCreateBotClick,
    authError,
  } = useAppState();
  const { toggleBot } = useBotToggle();

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.enableClosingConfirmation();
      if (tg.requestFullscreen) {
        try {
          tg.requestFullscreen();
        } catch (e) {
          console.warn('requestFullscreen not supported:', e);
        }
      }
      // Official TG API to disable swipe-to-close gesture
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      // Set TG colors to match our exact theme to prevent black lines/bars at the bottom
      const bgColor = theme === 'dark' ? '#09090b' : '#ffffff';
      if (tg.setHeaderColor) tg.setHeaderColor(bgColor);
      if (tg.setBackgroundColor) tg.setBackgroundColor(bgColor);
      if (tg.setBottomBarColor) tg.setBottomBarColor(bgColor);
    }
  }, [theme]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const [previousTab, setPreviousTab] = useState<typeof activeTab>('home');
  useEffect(() => {
    if (activeTab !== 'subscription') {
      setPreviousTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    if (appState.activeSheet) {
      tg.BackButton.show();
      const handleBack = () => {
        setSheet(null);
      };
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton.offClick(handleBack);
      };
    } else if (activeTab === 'subscription') {
      tg.BackButton.show();
      const handleBack = () => {
        setActiveTab(previousTab);
      };
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton.offClick(handleBack);
      };
    } else {
      tg.BackButton.hide();
    }
  }, [appState.activeSheet, setSheet, activeTab, setActiveTab]);

  useEffect(() => {

    // Prevent swipe-to-close ONLY when no scrollable parent is being scrolled.
    // This allows content inside overflow-y-auto containers to scroll normally.
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY ?? 0;
      const swipingDown = currentY > startY;

      // Walk up the DOM to check if any ancestor is scrollable
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body) {
        const overflowY = window.getComputedStyle(el).overflowY;
        const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
        if (isScrollable) {
          // Allow scroll if we're not at the very top (can scroll up more)
          if (!swipingDown || el.scrollTop > 0) return;
          break;
        }
        el = el.parentElement;
      }

      // Block only at root level and swiping down (prevents TG collapse)
      if (swipingDown) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (appState.activeBot && appState.activeBot.mediaSyncDone === false) {
      interval = setInterval(async () => {
        try {
          const { apiService } = await import('./services/api');
          const data = await apiService.getBots();
          if (data && data.bots) {
            setAppState(prev => {
              const mappedBots = data.bots.map(mapApiBot);
              const updatedBot = mappedBots.find((b: any) => String(b.id) === String(prev.activeBot?.id));
              if (updatedBot && updatedBot.mediaSyncDone) {
                return {
                  ...prev,
                  bots: mappedBots,
                  activeBot: updatedBot
                };
              }
              return prev;
            });
          }
        } catch (e) {
          console.error("Polling sync status failed", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [appState.activeBot?.id, appState.activeBot?.mediaSyncDone]);

  if (appState.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-background)]" style={{ color: 'var(--color-foreground)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center" style={{ color: 'var(--color-foreground)' }}>
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold mb-3">Ошибка авторизации</h2>
        <p className="text-[var(--color-foreground-secondary)] mb-8 max-w-sm">
          Мы не смогли распознать ваш аккаунт. Пожалуйста, запустите главного бота (Bot Father) и нажмите кнопку "Открыть приложение".
        </p>
        <button
          onClick={() => {
            const tg = (window as any).Telegram?.WebApp;
            if (tg) tg.close();
          }}
          className="px-6 py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl active:scale-95 transition-transform"
        >
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full overflow-hidden w-full"
      style={{ color: 'var(--color-foreground)', position: 'relative' }}
    >
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '40vh', background: 'linear-gradient(180deg, rgba(46,154,219,0.06) 0%, rgba(242,241,236,0) 100%)', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: '-100px', right: '-100px', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(168,85,247,0.06) 0%, rgba(255,255,255,0) 70%)', zIndex: 0, pointerEvents: 'none', borderRadius: '50%' }} />

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
            appState={appState}
            setSheet={setSheet}
            theme={theme}
            toggleTheme={toggleTheme}
            onCreateBot={handleCreateBotClick}
          />


      <main
        className="flex-1 flex flex-col relative lg:ml-[240px] overflow-hidden h-full"
      >
        <Header activeTab={activeTab} appState={appState} setSheet={setSheet} onCreateBot={handleCreateBotClick} />

        {/* Content Area with its own scroll */}
        <div className={`flex-1 flex flex-col relative ${activeTab === 'flow' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          
          {/* Mobile Navigation Spacer */}
          <style>{`
            @media (max-width: 1023px) {
              /* Bottom: nav bar height (56) + 16px breathing room + safe area */
              .mobile-padding { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }
              .action-bar-mobile { bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 12px) !important; }
              /* Top: TG header bar (Close + Minimize buttons) — use env(safe-area-inset-top) + 44px */
              .tg-header-safe { padding-top: max(54px, calc(env(safe-area-inset-top, 0px) + 44px)) !important; }
              .flow-padding { padding-bottom: 0; }
            }
          `}</style>

          <div 
            className={`flex-1 flex flex-col ${activeTab === 'flow' ? 'flow-padding' : activeTab === 'subscription' ? 'px-3 lg:px-4 py-4 lg:py-8 mobile-padding' : 'px-4 pt-3 pb-4 lg:p-8 mobile-padding'}`} 
            style={{ maxWidth: activeTab === 'flow' ? '100%' : '900px', margin: '0 auto', width: '100%' }}
          >
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <Home key="home" />
            )}
            {activeTab === 'build' && (
              <Build key="build" />
            )}
            {activeTab === 'flow' && (
              <Flow key="flow" />
            )}
            {activeTab === 'profile' && (
              <Profile key="profile" />
            )}
            {activeTab === 'subscription' && (
              <Subscription key="subscription" />
            )}
            {activeTab === 'manage' && (
              <BotManagement key="manage" />
            )}
            {activeTab === 'admin_stats' && (
              <AdminStats key="admin_stats" />
            )}
          </AnimatePresence>
        </div>
        </div>
      </main>

      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Sheets */}
      <AnimatePresence>
        {appState.activeSheet === 'bot_settings' && (
          <BotSettings
            key="bot_settings"
            appState={appState}
            onClose={() => setSheet(null)}
            onSave={() => {
              setAppState(prev => ({ ...prev }));
            }}
          />
        )}
        {(appState.activeSheet === 'billing_renew' || appState.activeSheet === 'billing_first') && (
          <BillingRenew
            key="billing_renew"
            onClose={() => setSheet(null)}
            onSuccess={() => {
              setSheet(null);
              setToastMessage('Платёж создан. Завершите оплату в ЮKassa.');
            }}
          />
        )}
        {appState.activeSheet === 'checkout' && appState.sheetData && 'tariff' in appState.sheetData && (
          <CheckoutSheet
            key="checkout"
            tariffId={appState.sheetData.tariff}
            onClose={() => setSheet(null)}
            onSuccess={(email) => {
              const tariff = appState.sheetData && 'tariff' in appState.sheetData ? appState.sheetData.tariff : 'basic';
              setAppState(prev => ({ ...prev, userEmail: email }));
              setSheet(null);
              setToastMessage(`Счёт на ${tariff === 'pro' ? 'PRO' : 'лицензию'} создан. Завершите оплату в ЮKassa.`);
            }}
          />
        )}
        {appState.activeSheet === 'bot_create' && (
          <BotCreateSheet
            key="bot_create"
            onClose={() => setSheet(null)}
            onCreate={async (botData) => {
              const { apiService } = await import('./services/api');
              const createdBot = await apiService.createBot(botData);
              const newBot = {
                id: String(createdBot.id),
                name: createdBot.displayName || 'Без имени',
                username: createdBot.username || '@unknown',
                status: 'inactive' as const,
                usersCount: 0,
                isTokenLocked: false,
                paymentProvider: createdBot.paymentProvider,
                hasPaymentCredentials: createdBot.hasPaymentCredentials === true,
                tokenPreview: createdBot.tokenPreview,
                paymentCredentialsPreview: createdBot.paymentCredentialsPreview,
                offerUrl: createdBot.offerUrl,
                offerInstallments: createdBot.offerInstallments,
                funnelComplete: false,
                mediaSyncDone: false,
                botUrl: createdBot.botUrl,
              };
              setAppState(prev => ({
                ...prev,
                activeBot: newBot,
                bots: [...prev.bots, newBot as any],
              }));
              setSheet(null);
              setActiveTab('build');
              setToastMessage('Бот успешно создан! 🎉');
            }}
          />
        )}
        {appState.activeSheet === 'bot_switcher' && (
          <BotSwitcher
            key="bot_switcher"
            bots={appState.bots}
            activeBotId={appState.activeBot?.id}
            subscriptionStatus={appState.subscriptionStatus}
            onClose={() => setSheet(null)}
            onAddBot={handleCreateBotClick}
            onSelect={(id) => {
              const bot = appState.bots.find(b => String(b.id) === String(id));
              if (bot) setAppState(prev => ({ ...prev, activeBot: bot }));
              setSheet(null);
            }}
            onToggleStatus={async (id) => {
              const bot = appState.bots.find(item => item.id === id);
              if (bot) {
                await toggleBot(bot);
              }
            }}
          />
        )}

      </AnimatePresence>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

    </div>
  );
}
