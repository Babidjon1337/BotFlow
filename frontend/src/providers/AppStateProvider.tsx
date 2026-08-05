/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FunnelNode, TabType, AppState, SheetType } from '../types';
import { INITIAL_BLOCKS } from '../constants';
import { mapApiBot } from '../services/botMapper';
import { normalizeFunnelNodes } from '../services/funnelNormalizer';

interface AppContextType {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  activeTab: TabType;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  blocks: FunnelNode[];
  setBlocks: React.Dispatch<React.SetStateAction<FunnelNode[]>>;
  selectedBlockId: string;
  setSelectedBlockId: React.Dispatch<React.SetStateAction<string>>;
  toastMessage: string | null;
  setToastMessage: React.Dispatch<React.SetStateAction<string | null>>;
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  setSheet: (sheet: SheetType | null, data?: AppState['sheetData']) => void;
  toggleTheme: () => void;
  updateBlock: <K extends keyof FunnelNode>(id: string, field: K, value: FunnelNode[K]) => void;
  handleCreateBotClick: () => void;
  handlePurchaseSuccess: (plan: 'basic' | 'pro') => void;
  isAdmin: boolean;
  authError: string | null;
  funnelLoadState: FunnelLoadState;
  switchingBotId: string | null;
  retryFunnelLoad: () => Promise<void>;
  selectBot: (botId: string, discardDirty?: boolean) => Promise<BotSelectionResult>;
  getFunnelRevision: () => number;
  getFunnelWorkspaceGeneration: () => number;
  replaceFunnelWorkspace: (nodes: FunnelNode[]) => number;
}

export type FunnelLoadState = {
  botId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
};

export type BotSelectionResult =
  | { status: 'selected' | 'same' }
  | { status: 'dirty' }
  | { status: 'busy' }
  | { status: 'error'; message: string };

const AppContext = createContext<AppContextType | undefined>(undefined);

function getFunnelErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.';
  }
  const normalized = error.message.toLowerCase();
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed')
  ) {
    return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.';
  }
  return error.message;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>({
    activeBot: null,
    bots: [],
    subscriptionStatus: 'none',
    subscriptionUntil: null,
    slotsBought: 0,
    userEmail: '',
    activeSheet: null,
    isDirty: false,
    isLoading: true,
  });

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem('bot_father_activeTab') as TabType) || 'home';
  });
  const [blocks, setBlocks] = useState<FunnelNode[]>(INITIAL_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(() => {
    return localStorage.getItem('bot_father_selectedBlockId') || 'start';
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [funnelLoadState, setFunnelLoadState] = useState<FunnelLoadState>({
    botId: null,
    status: 'idle',
    error: null,
  });
  const [switchingBotId, setSwitchingBotId] = useState<string | null>(null);
  const funnelRequestIdRef = useRef(0);
  const loadedFunnelBotIdRef = useRef<string | null>(null);
  const botSelectionInProgressRef = useRef(false);
  const funnelRevisionRef = useRef(0);
  const funnelWorkspaceGenerationRef = useRef(0);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('bot_father_theme') as 'light' | 'dark') || 'light';
  });

  const isAdmin = appState.isAdmin === true;

  useEffect(() => {
    let cancelled = false;
    void import('../services/api').then(({ apiService }) => apiService.auth()).then(res => {
      if (!cancelled) {
        const mappedBots = res.bots.map(mapApiBot);
        
        const savedBotId = localStorage.getItem('bot_father_activeBotId');
        const restoredBot = mappedBots.find(b => b.id === savedBotId) || (mappedBots.length > 0 ? mappedBots[0] : null);
        
        setAppState(prev => ({
          ...prev,
          bots: mappedBots,
          activeBot: restoredBot,
          subscriptionStatus: res.user.subscription_status,
          subscriptionUntil: res.user.subscription_until,
          slotsBought: res.user.slots_bought,
          isAdmin: res.user.is_admin,
          subscriptionAutoRenew: res.user.subscription_auto_renew,
          subscriptionRetryCount: res.user.subscription_retry_count,
          userEmail: res.user.email || '',
          emailReceiptsEnabled: res.user.email_receipts_enabled,
          emailBillingNotificationsEnabled: res.user.email_billing_notifications_enabled,
          isLoading: false,
        }));
      }
    }).catch(err => {
      if (!cancelled) {
        console.error("Auth err", err);
        setAuthError(err.message || "Failed to authenticate");
        setAppState(prev => ({ ...prev, isLoading: false }));
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem('bot_father_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('bot_father_selectedBlockId', selectedBlockId);
  }, [selectedBlockId]);

  useEffect(() => {
    if (appState.activeBot?.id) {
      localStorage.setItem('bot_father_activeBotId', appState.activeBot.id);
    }
  }, [appState.activeBot?.id]);

  const fetchFunnelNodes = useCallback(async (botId: string) => {
    const { apiService } = await import('../services/api');
    const response = await apiService.getFunnel(botId);
    return response.nodes?.length
      ? normalizeFunnelNodes(response.nodes)
      : INITIAL_BLOCKS;
  }, []);

  const loadActiveBotFunnel = useCallback(async (botId: string) => {
    const requestId = ++funnelRequestIdRef.current;
    setFunnelLoadState({ botId, status: 'loading', error: null });

    try {
      const nextBlocks = await fetchFunnelNodes(botId);
      if (requestId !== funnelRequestIdRef.current) return;

      loadedFunnelBotIdRef.current = botId;
      funnelRevisionRef.current += 1;
      funnelWorkspaceGenerationRef.current += 1;
      setBlocks(nextBlocks);
      setSelectedBlockId('start');
      setFunnelLoadState({ botId, status: 'ready', error: null });
      setAppState(prev => prev.activeBot?.id === botId
        ? { ...prev, isDirty: false }
        : prev);
    } catch (error) {
      if (requestId !== funnelRequestIdRef.current) return;

      const message = getFunnelErrorMessage(error);
      console.error('Funnel load err', error);
      setFunnelLoadState({ botId, status: 'error', error: message });
    }
  }, [fetchFunnelNodes]);

  useEffect(() => {
    const activeBotId = appState.activeBot?.id ?? null;
    if (!activeBotId) {
      funnelRequestIdRef.current += 1;
      loadedFunnelBotIdRef.current = null;
      return;
    }

    if (loadedFunnelBotIdRef.current === activeBotId) {
      return;
    }

    void loadActiveBotFunnel(activeBotId);
  }, [appState.activeBot?.id, loadActiveBotFunnel]);

  const retryFunnelLoad = useCallback(async () => {
    const activeBotId = appState.activeBot?.id;
    if (!activeBotId) return;
    await loadActiveBotFunnel(activeBotId);
  }, [appState.activeBot?.id, loadActiveBotFunnel]);

  const selectBot = useCallback(async (
    botId: string,
    discardDirty = false,
  ): Promise<BotSelectionResult> => {
    const currentBotId = appState.activeBot?.id;
    if (currentBotId === botId) return { status: 'same' };
    if (appState.isDirty && !discardDirty) return { status: 'dirty' };
    if (funnelLoadState.botId === currentBotId && funnelLoadState.status === 'loading') {
      return { status: 'busy' };
    }
    if (botSelectionInProgressRef.current) return { status: 'busy' };

    const targetBot = appState.bots.find(bot => bot.id === botId);
    if (!targetBot) {
      return { status: 'error', message: 'Выбранный бот больше недоступен.' };
    }

    botSelectionInProgressRef.current = true;
    setSwitchingBotId(botId);
    const sourceRevision = funnelRevisionRef.current;
    try {
      const nextBlocks = await fetchFunnelNodes(botId);
      if (funnelRevisionRef.current !== sourceRevision) {
        return {
          status: 'error',
          message: 'Воронка была изменена во время перехода. Переключение отменено, изменения сохранены в редакторе.',
        };
      }
      loadedFunnelBotIdRef.current = botId;
      funnelRevisionRef.current += 1;
      funnelWorkspaceGenerationRef.current += 1;
      setBlocks(nextBlocks);
      setSelectedBlockId('start');
      setFunnelLoadState({ botId, status: 'ready', error: null });
      setAppState(prev => ({
        ...prev,
        activeBot: prev.bots.find(bot => bot.id === botId) ?? targetBot,
        isDirty: false,
      }));
      return { status: 'selected' };
    } catch (error) {
      console.error('Bot selection funnel load err', error);
      return {
        status: 'error',
        message: getFunnelErrorMessage(error),
      };
    } finally {
      botSelectionInProgressRef.current = false;
      setSwitchingBotId(null);
    }
  }, [appState.activeBot?.id, appState.bots, appState.isDirty, fetchFunnelNodes, funnelLoadState.botId, funnelLoadState.status]);

  useEffect(() => {
    localStorage.setItem('bot_father_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setSheet = (sheet: SheetType | null, data?: AppState['sheetData']) =>
    setAppState(prev => ({ ...prev, activeSheet: sheet, sheetData: data }));

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const updateBlock = <K extends keyof FunnelNode>(id: string, field: K, value: FunnelNode[K]) => {
    funnelRevisionRef.current += 1;
    setBlocks(prev => {
      const existingBlock = prev.find(block => block.id === id);
      if (existingBlock) {
        if (Object.is(existingBlock[field], value)) {
          return prev;
        }
        return prev.map(block => block.id === id ? { ...block, [field]: value } : block);
      }

      const defaultBlock = INITIAL_BLOCKS.find(block => block.id === id);
      return defaultBlock ? [...prev, { ...defaultBlock, [field]: value }] : prev;
    });
    setAppState(prev => ({ ...prev, isDirty: true }));
  };

  const getFunnelRevision = useCallback(() => funnelRevisionRef.current, []);
  const getFunnelWorkspaceGeneration = useCallback(
    () => funnelWorkspaceGenerationRef.current,
    [],
  );
  const replaceFunnelWorkspace = useCallback((nodes: FunnelNode[]) => {
    funnelRevisionRef.current += 1;
    funnelWorkspaceGenerationRef.current += 1;
    setBlocks(nodes);
    return funnelRevisionRef.current;
  }, []);

  const handleCreateBotClick = () => {
    if (appState.isDirty) {
      setActiveTab('build');
      setToastMessage('Сохраните изменения воронки перед созданием нового бота.');
      return;
    }
    if (
      appState.activeBot &&
      funnelLoadState.status !== 'error' &&
      (funnelLoadState.status !== 'ready' || funnelLoadState.botId !== appState.activeBot.id)
    ) {
      setToastMessage('Дождитесь загрузки текущей воронки.');
      return;
    }
    if (isAdmin) {
      setSheet('bot_create');
      return;
    }
    const isPro = appState.subscriptionStatus === 'active';
    const hasSlots = isPro ? appState.bots.length < 10 : appState.bots.length < 1;
    if (!hasSlots) {
      setActiveTab('subscription');
      return;
    }
    setSheet('bot_create');
  };

  const handlePurchaseSuccess = () => {
    // Entitlements are granted only by the YooKassa webhook. Refresh instead of
    // presenting a local success state.
    window.location.reload();
  };

  return (
    <AppContext.Provider
      value={{
        appState,
        setAppState,
        activeTab,
        setActiveTab,
        blocks,
        setBlocks,
        selectedBlockId,
        setSelectedBlockId,
        toastMessage,
        setToastMessage,
        theme,
        setTheme,
        setSheet,
        toggleTheme,
        updateBlock,
        handleCreateBotClick,
        handlePurchaseSuccess,
        isAdmin,
        authError,
        funnelLoadState,
        switchingBotId,
        retryFunnelLoad,
        selectBot,
        getFunnelRevision,
        getFunnelWorkspaceGeneration,
        replaceFunnelWorkspace,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
