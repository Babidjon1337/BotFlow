import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';

import { BillingRenew } from './components/sheets/BillingRenew';
import { CheckoutSheet } from './components/sheets/CheckoutSheet';
import { BotCreateSheet } from './components/sheets/BotCreateSheet';
import { BotSwitcher } from './components/sheets/BotSwitcher';
import { BotSettings } from './components/sheets/BotSettings';
import { FunnelLoadStateView } from './components/FunnelLoadStateView';

import { Toast } from './components/Toast';
import { useAppState } from './providers/AppStateProvider';
import { mapApiBot } from './services/botMapper';
import { useBotToggle } from './hooks/useBotToggle';
import { useBotSelectionGuard } from './hooks/useBotSelectionGuard';

import {
  loadStoredRoute,
  persistRoute,
  resolveRoute,
} from './routes';
import type { AccountTab, AppRoute } from './routes';
import { AppShell } from './components/shell/AppShell';
import { BotPlatformsScreen } from './components/screens/BotPlatformsScreen';
import { BotMonetizationScreen } from './components/screens/BotMonetizationScreen';
import { BotOverviewScreen } from './components/screens/BotOverviewScreen';

type TelegramWebApp = {
  ready?: () => void; expand?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  requestFullscreen?: () => void; disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void; setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
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
const Profile = lazy(() => import('./components/tabs/Profile').then(({ Profile: Component }) => ({ default: Component })));
const Subscription = lazy(() => import('./components/tabs/Subscription').then(({ Subscription: Component }) => ({ default: Component })));
const Home = lazy(() => import('./components/tabs/Home').then(({ Home: Component }) => ({ default: Component })));
const BotManagement = lazy(() => import('./components/tabs/BotManagement').then(({ BotManagement: Component }) => ({ default: Component })));
const AdminStats = lazy(() => import('./components/tabs/AdminStats').then(({ AdminStats: Component }) => ({ default: Component })));
const GatewayLibrary = lazy(() => import('./components/screens/GatewayLibraryScreen').then(({ GatewayLibraryScreen: Component }) => ({ default: Component })));

const TabLoading = () => (
  <div className="flex min-h-[240px] w-full items-center justify-center" role="status" aria-label="Загрузка раздела">
    <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-primary" />
  </div>
);

export default function App() {
  const {
    appState,
    setAppState,
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
    activeTab,
    setActiveTab,
  } = useAppState();
  const { toggleBot } = useBotToggle();
  const { requestBotSelection } = useBotSelectionGuard();

  const [route, setRoute] = useState<AppRoute>(() => loadStoredRoute());
  const [isBotCreating, setIsBotCreating] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [hasFocusedTextField, setHasFocusedTextField] = useState(false);

  const resolvedRoute = appState.isLoading
    ? route
    : resolveRoute(route, Boolean(appState.activeBot), Boolean(appState.isAdmin));
  const previousLegacyTab = useRef(activeTab);
  const routeDrivenLegacyTab = useRef<typeof activeTab | null>(null);

  const goAccountTab = (tab: AccountTab) => setRoute({ level: 'account', tab });
  const goBackToBots = () => setRoute({ level: 'account', tab: 'bots' });

  useEffect(() => {
    if (!appState.isLoading) persistRoute(resolvedRoute);
  }, [appState.isLoading, resolvedRoute]);

  useEffect(() => {
    if (routeDrivenLegacyTab.current === activeTab) {
      routeDrivenLegacyTab.current = null;
      previousLegacyTab.current = activeTab;
      return;
    }
    if (previousLegacyTab.current === activeTab) return;
    previousLegacyTab.current = activeTab;
    const legacyRoutes = {
      home: { level: 'bot', view: 'overview' },
      build: { level: 'bot', view: 'scenario' },
      flow: { level: 'bot', view: 'scenario' },
      profile: { level: 'account', tab: 'profile' },
      subscription: { level: 'account', tab: 'billing' },
      manage: { level: 'account', tab: 'bots' },
      admin_stats: { level: 'account', tab: 'admin' },
    } as const;
    setRoute(legacyRoutes[activeTab]);
  }, [activeTab]);

  useEffect(() => {
    const legacyTab = resolvedRoute.level === 'account'
      ? ({ bots: 'manage', billing: 'subscription', profile: 'profile', admin: 'admin_stats' } as const)[resolvedRoute.tab as 'bots' | 'billing' | 'profile' | 'admin']
      : ({ overview: 'home', scenario: 'build' } as const)[resolvedRoute.view as 'overview' | 'scenario'];
    if (!legacyTab || legacyTab === activeTab) return;
    routeDrivenLegacyTab.current = legacyTab;
    setActiveTab(legacyTab);
  }, [activeTab, resolvedRoute, setActiveTab]);

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
      if (tg.requestFullscreen && tg.isVersionAtLeast?.('8.0')) {
        try {
          tg.requestFullscreen();
        } catch (error) {
          console.warn('requestFullscreen not supported:', error);
        }
      }
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      const bgColor = theme === 'dark' ? '#0d0e12' : '#fcfcfd';
      tg.setHeaderColor?.(bgColor);
      tg.setBackgroundColor?.(bgColor);
      tg.setBottomBarColor?.(bgColor);
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
    }

    if (resolvedRoute.level === 'bot') {
      backButton.show();
      const handleBack = goBackToBots;
      backButton.onClick(handleBack);
      return () => {
        backButton.offClick(handleBack);
      };
    }

    backButton.hide();
  }, [appState.activeSheet, appState.activeBot, setSheet, resolvedRoute, switchingBotId, isBotCreating]);

  useEffect(() => {
    const activeBotId = appState.activeBot?.id;
    const needsMediaSync = appState.activeBot?.mediaSyncDone === false;
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
  }, [appState.activeBot?.id, appState.activeBot?.mediaSyncDone, setAppState]);

  const funnelWorkspaceReady = !appState.activeBot || (
    funnelLoadState.status === 'ready' &&
    funnelLoadState.botId === appState.activeBot.id
  );

  if (appState.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-primary" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="flex max-w-[400px] flex-col items-center rounded-2xl border border-border bg-card p-8 shadow-card">
          <div className="mb-5 flex size-16 items-center justify-center rounded-xl bg-danger-soft">
            <ShieldAlert className="size-8 text-danger" />
          </div>
          <h2 className="text-title-lg font-semibold">Ошибка авторизации</h2>
          <p className="mt-2 text-meta leading-relaxed text-fg-secondary">
            Мы не смогли распознать ваш аккаунт. Откройте главного бота BotFlow и
            нажмите кнопку «Открыть приложение».
          </p>
          <button
            onClick={() => {
              getTelegramWebApp()?.close?.();
            }}
            className="mt-6 h-11 w-full cursor-pointer rounded-md bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Закрыть окно
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 1023px) {
          .action-bar-mobile { bottom: calc(56px + max(env(safe-area-inset-bottom, 0px), var(--tg-content-safe-area-inset-bottom, 0px)) + 12px) !important; }
          .flow-padding { padding-bottom: 0; }
          .app-keyboard-open .action-bar-fixed {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateY(140%) !important;
          }
        }
      `}</style>

      <AppShell
        route={resolvedRoute}
        onAccountTab={goAccountTab}
        onBotView={(view) => setRoute({ level: 'bot', view })}
        onBackToBots={goBackToBots}
        onCreateBot={handleCreateBotClick}
        onOpenBotSettings={() => setSheet('bot_settings')}
        onOpenBotSwitcher={() => setSheet('bot_switcher')}
        activeBot={appState.activeBot}
        isAdmin={Boolean(appState.isAdmin)}
        subscriptionStatus={appState.subscriptionStatus}
        subscriptionUntil={appState.subscriptionUntil}
        theme={theme}
        toggleTheme={toggleTheme}
        bottomNavHidden={isKeyboardOpen || hasFocusedTextField}
        isFirstEntry={resolvedRoute.level === 'account' && resolvedRoute.tab === 'bots' && appState.bots.length === 0}
      >
        <Suspense fallback={<TabLoading />}>
          <AnimatePresence mode="wait">
            {resolvedRoute.level === 'account' && resolvedRoute.tab === 'bots' && (
              <BotManagement key="bots" />
            )}
            {resolvedRoute.level === 'account' && resolvedRoute.tab === 'billing' && (
              <Subscription key="billing" />
            )}
            {resolvedRoute.level === 'account' && resolvedRoute.tab === 'gateways' && (
              <GatewayLibrary key="gateways" />
            )}
            {resolvedRoute.level === 'account' && resolvedRoute.tab === 'profile' && (
              <Profile key="profile" />
            )}
            {resolvedRoute.level === 'account' && resolvedRoute.tab === 'admin' && appState.isAdmin && (
              <AdminStats key="admin" />
            )}
            {resolvedRoute.level === 'bot' && resolvedRoute.view === 'overview' && appState.activeBot && (
              funnelWorkspaceReady ? (
                appState.activeBot.status === 'active'
                  ? <Home key="overview" />
                  : <BotOverviewScreen
                      key="overview"
                      bot={appState.activeBot}
                      subscriptionStatus={appState.subscriptionStatus}
                      onNavigate={(view) => setRoute({ level: 'bot', view })}
                      onPublish={async () => {
                        if (appState.activeBot) await toggleBot(appState.activeBot);
                      }}
                    />
              ) : (
                <FunnelLoadStateView key="overview-state" />
              )
            )}
            {resolvedRoute.level === 'bot' && resolvedRoute.view === 'scenario' && (
              funnelWorkspaceReady ? <Build key="scenario" /> : <FunnelLoadStateView key="scenario-state" />
            )}
            {resolvedRoute.level === 'bot' && resolvedRoute.view === 'platforms' && appState.activeBot && (
              <BotPlatformsScreen
                key="platforms"
                bot={appState.activeBot}
                onOpenSettings={() => setSheet('bot_settings')}
              />
            )}
            {resolvedRoute.level === 'bot' && resolvedRoute.view === 'monetization' && appState.activeBot && (
              <BotMonetizationScreen
                key="monetization"
                bot={appState.activeBot}
                onOpenSettings={() => setSheet('bot_settings')}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </AppShell>

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
              setAppState(prev => ({ ...prev, userEmail: email }));
              setSheet(null);
              setToastMessage('Счёт создан. Завершите оплату в ЮKassa.');
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
                setRoute({ level: 'bot', view: 'scenario' });
                setToastMessage('Бот создан. Подключите платформу и заполните сценарий.');
              } else {
                setToastMessage('Бот создан и добавлен в список.');
              }
            }}
          />
        )}
        {appState.activeSheet === 'bot_switcher' && (
          <BotSwitcher
            key="bot_switcher"
            bots={appState.bots}
            activeBotId={appState.activeBot?.id}
            switchingBotId={switchingBotId}
            selectionDisabled={Boolean(
              appState.activeBot &&
              !funnelWorkspaceReady &&
              funnelLoadState.status !== 'error'
            )}
            onClose={() => setSheet(null)}
            onAddBot={handleCreateBotClick}
            onSelect={(id) => {
              const targetBot = appState.bots.find(bot => String(bot.id) === String(id));
              if (!targetBot) return;
              requestBotSelection(targetBot, {
                onSelected: () => {
                  setSheet(null);
                  setRoute({ level: 'bot', view: 'overview' });
                },
              });
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

    </>
  );
}
