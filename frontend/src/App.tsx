import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';

import { Home } from './components/tabs/Home';

import { BotSettings } from './components/sheets/BotSettings';
import { CheckoutSheet } from './components/sheets/CheckoutSheet';
import { BotCreateSheet } from './components/sheets/BotCreateSheet';
import { BotSwitcher } from './components/sheets/BotSwitcher';
import { BillingRenew } from './components/sheets/BillingRenew';
import { FunnelLoadStateView } from './components/FunnelLoadStateView';

import { Toast } from './components/Toast';
import { useAppState } from './providers/AppStateProvider';
import { mapApiBot } from './services/botMapper';
import { useBotToggle } from './hooks/useBotToggle';
import { useBotSelectionGuard } from './hooks/useBotSelectionGuard';

type TelegramWebApp = {
  ready?: () => void; expand?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  requestFullscreen?: () => void; disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void; setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  close?: () => void;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  onEvent?: (eventType: "safeAreaChanged" | "contentSafeAreaChanged", callback: () => void) => void;
  offEvent?: (eventType: "safeAreaChanged" | "contentSafeAreaChanged", callback: () => void) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void; };
};

const getTelegramWebApp = (): TelegramWebApp | undefined =>
  (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

const Build = lazy(() => import('./components/tabs/Build').then(({ Build: Component }) => ({ default: Component })));
const Flow = lazy(() => import('./components/tabs/Flow').then(({ Flow: Component }) => ({ default: Component })));
const BotManagement = lazy(() => import('./components/tabs/BotManagement').then(({ BotManagement: Component }) => ({ default: Component })));
const Profile = lazy(() => import('./components/tabs/Profile').then(({ Profile: Component }) => ({ default: Component })));
const Subscription = lazy(() => import('./components/tabs/Subscription').then(({ Subscription: Component }) => ({ default: Component })));
const AdminStats = lazy(() => import('./components/tabs/AdminStats').then(({ AdminStats: Component }) => ({ default: Component })));

const TabLoading = () => (
  <div className="flex min-h-[240px] w-full items-center justify-center" role="status" aria-label="Загрузка раздела">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
  </div>
);

export default function App() {
  const {
    appState,
    setAppState,
    activeTab,
    setActiveTab,
    toastMessage,
    setToastMessage,
    toastType,
    setToastType,
    theme,
    toggleTheme,
    setSheet,
    handleCreateBotClick,
    authError,
    funnelLoadState,
    switchingBotId,
    getFunnelWorkspaceGeneration,
  } = useAppState();
  const { toggleBot } = useBotToggle();
  const { requestBotSelection } = useBotSelectionGuard();
  const activeBotId = appState.activeBot?.id;
  const needsMediaSync = appState.activeBot?.mediaSyncDone === false;
  const funnelWorkspaceReady = !appState.activeBot || (
    funnelLoadState.status === 'ready' &&
    funnelLoadState.botId === appState.activeBot.id
  );
  const [isBotCreating, setIsBotCreating] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [hasFocusedTextField, setHasFocusedTextField] = useState(false);

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg) {
      tg.ready?.();
      tg.expand?.();
      if (appState.isDirty) {
        tg.enableClosingConfirmation?.();
      } else {
        tg.disableClosingConfirmation?.();
      }
      if (tg.requestFullscreen) {
        try {
          tg.requestFullscreen();
        } catch (error) {
          console.warn('requestFullscreen not supported:', error);
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
  }, [theme, appState.isDirty]);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const root = document.documentElement;
    const applyTelegramSafeArea = () => {
      const inset = tg?.contentSafeAreaInset ?? tg?.safeAreaInset;
      for (const side of ["top", "right", "bottom", "left"] as const) {
        root.style.setProperty(`--tg-content-safe-area-inset-${side}`, `${inset?.[side] ?? 0}px`);
      }
    };

    applyTelegramSafeArea();
    tg?.onEvent?.("safeAreaChanged", applyTelegramSafeArea);
    tg?.onEvent?.("contentSafeAreaChanged", applyTelegramSafeArea);
    return () => {
      tg?.offEvent?.("safeAreaChanged", applyTelegramSafeArea);
      tg?.offEvent?.("contentSafeAreaChanged", applyTelegramSafeArea);
    };
  }, []);

  useEffect(() => {
    const isTextField = (element: Element | null) =>
      element instanceof HTMLElement && Boolean(element.closest('input, textarea, [contenteditable="true"]'));
    const updateFocusState = () => setHasFocusedTextField(isTextField(document.activeElement));
    const deferFocusStateUpdate = () => window.setTimeout(updateFocusState, 0);
    document.addEventListener("focusin", updateFocusState);
    document.addEventListener("focusout", deferFocusStateUpdate);
    return () => {
      document.removeEventListener("focusin", updateFocusState);
      document.removeEventListener("focusout", deferFocusStateUpdate);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateKeyboardState = () => {
      setIsKeyboardOpen(window.innerWidth < 1024 && window.innerHeight - viewport.height > 120);
    };
    updateKeyboardState();
    viewport.addEventListener("resize", updateKeyboardState);
    return () => viewport.removeEventListener("resize", updateKeyboardState);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const previousTab = useRef<typeof activeTab>('home');
  useEffect(() => {
    if (activeTab !== 'subscription') {
      previousTab.current = activeTab;
    }
  }, [activeTab]);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;
    if (!backButton) return;

    if (appState.activeSheet) {
      backButton.show();
      const handleBack = () => {
        if (appState.activeSheet === 'bot_switcher' && switchingBotId) return;
        if (appState.activeSheet === 'bot_create' && isBotCreating) return;
        setSheet(null);
      };
      backButton.onClick(handleBack);
      return () => {
        backButton.offClick(handleBack);
      };
    } else if (activeTab === 'subscription') {
      backButton.show();
      const handleBack = () => {
        setActiveTab(previousTab.current);
      };
      backButton.onClick(handleBack);
      return () => {
        backButton.offClick(handleBack);
      };
    } else {
      backButton.hide();
    }
  }, [appState.activeSheet, setSheet, activeTab, setActiveTab, switchingBotId, isBotCreating]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (activeBotId && needsMediaSync) {
      interval = setInterval(async () => {
        try {
          const { apiService } = await import('./services/api');
          const data = await apiService.getBots();
          if (data && data.bots) {
            setAppState(prev => {
              const mappedBots = data.bots.map(mapApiBot);
              const updatedBot = mappedBots.find((bot) => String(bot.id) === String(prev.activeBot?.id));
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
        } catch (error) {
          console.error("Polling sync status failed", error);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeBotId, needsMediaSync, setAppState]);

  if (appState.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-background)]" style={{ color: 'var(--color-foreground)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center relative overflow-hidden bg-[var(--color-background)] px-6 text-center" style={{ color: 'var(--color-foreground)' }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '20%', left: '30%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, rgba(255,255,255,0) 70%)', zIndex: 0, borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '30%', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(245,158,11,0.05) 0%, rgba(255,255,255,0) 70%)', zIndex: 0, borderRadius: '50%' }} />
        
        <div className="relative z-10 flex flex-col items-center max-w-[400px] p-8 rounded-3xl border border-[var(--color-border)] shadow-xl" style={{ background: 'rgba(var(--color-surface-rgb), 0.7)', backdropFilter: 'blur(20px)' }}>
          <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-inner ring-1 ring-red-500/20">
            <ShieldAlert className="text-red-500/90 w-10 h-10 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black mb-3 tracking-tight">Ошибка авторизации</h2>
          <p className="text-[var(--color-foreground-secondary)] mb-8 leading-relaxed text-sm">
            Мы не смогли распознать ваш аккаунт. Пожалуйста, запустите главного бота (BotFlow) и нажмите кнопку <span className="font-semibold">«Открыть приложение»</span>.
          </p>
          <button
            onClick={() => {
              getTelegramWebApp()?.close?.();
            }}
            className="w-full py-3.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold rounded-xl active:scale-[0.98] transition-all shadow-md shadow-red-500/20"
          >
            Закрыть окно
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-root flex h-full w-full overflow-hidden ${isKeyboardOpen || hasFocusedTextField ? "app-keyboard-open" : ""}`}
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
        className="flex-1 min-h-0 flex flex-col relative lg:ml-[240px] overflow-hidden h-full"
      >
        <Header activeTab={activeTab} appState={appState} setSheet={setSheet} onCreateBot={handleCreateBotClick} />

        {/* Content Area with its own scroll */}
        <div data-app-scroll-container className={`flex-1 min-h-0 flex flex-col relative ${activeTab === 'flow' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          
          {/* Mobile Navigation Spacer */}
          <style>{`
            @media (max-width: 1023px) {
              /* Bottom: nav bar height (56) + 16px breathing room + safe area */
              .mobile-padding { padding-bottom: calc(72px + max(env(safe-area-inset-bottom, 0px), var(--tg-content-safe-area-inset-bottom, 0px))) !important; }
              .action-bar-mobile { bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 12px) !important; }
              /* Top: TG header bar (Close + Minimize buttons) — use env(safe-area-inset-top) + 44px */
              .tg-header-safe { padding-top: max(54px, calc(var(--tg-content-safe-area-inset-top, 0px) + 16px)) !important; }
              .flow-padding { padding-bottom: 0; }
              .app-keyboard-open .action-bar-fixed {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: translateY(140%) !important;
              }
            }
          `}</style>

          <div 
            className={`flex-1 flex flex-col ${activeTab === 'flow' ? 'flow-padding' : activeTab === 'subscription' ? 'px-3 lg:px-4 py-4 lg:py-8 mobile-padding' : 'px-4 pt-3 pb-4 lg:p-8 mobile-padding'}`} 
            style={{ maxWidth: activeTab === 'flow' ? '100%' : activeTab === 'build' ? '1240px' : '900px', margin: '0 auto', width: '100%' }}
          >
          <Suspense fallback={<TabLoading />}>
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <Home key="home" />
            )}
            {activeTab === 'build' && (
              funnelWorkspaceReady
                ? <Build key="build" />
                : <FunnelLoadStateView key="build-funnel-state" />
            )}
            {activeTab === 'flow' && (
              funnelWorkspaceReady
                ? <Flow key="flow" />
                : <FunnelLoadStateView key="flow-funnel-state" />
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
          </Suspense>
        </div>
        </div>
      </main>

      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} hidden={isKeyboardOpen || hasFocusedTextField} />

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
            onClose={() => {
              if (!isBotCreating) setSheet(null);
            }}
            onBusyChange={setIsBotCreating}
            onError={setToastMessage}
            onCreate={async (botData) => {
              const sourceWorkspaceGeneration = getFunnelWorkspaceGeneration();
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
              const canActivateCreatedBot = getFunnelWorkspaceGeneration() === sourceWorkspaceGeneration;
              setAppState(prev => ({
                ...prev,
                activeBot: canActivateCreatedBot ? newBot : prev.activeBot,
                bots: [...prev.bots, newBot],
                isDirty: canActivateCreatedBot ? false : prev.isDirty,
              }));
              setSheet(null);
              if (canActivateCreatedBot) {
                setActiveTab('build');
                setToastMessage('Бот успешно создан! 🎉');
              } else {
                setToastMessage('Бот создан и добавлен в список. Текущие изменения воронки сохранены.');
              }
            }}
          />
        )}
        {appState.activeSheet === 'bot_switcher' && (
          <BotSwitcher
            key="bot_switcher"
            bots={appState.bots}
            activeBotId={appState.activeBot?.id}
            subscriptionStatus={appState.subscriptionStatus}
            switchingBotId={switchingBotId}
            selectionDisabled={Boolean(
              appState.activeBot &&
              !funnelWorkspaceReady &&
              funnelLoadState.status !== 'error'
            )}
            onClose={() => setSheet(null)}
            onAddBot={handleCreateBotClick}
            onSelect={(id) => {
              const bot = appState.bots.find(b => String(b.id) === String(id));
              if (bot) {
                requestBotSelection(bot, {
                  onSelected: () => setSheet(null),
                });
              }
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
        <Toast message={toastMessage} type={toastType} onClose={() => { setToastMessage(null); setTimeout(() => setToastType('success'), 300); }} />
      )}

    </div>
  );
}
