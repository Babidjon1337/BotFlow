/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [blocks, setBlocks] = useState<FunnelNode[]>(INITIAL_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('start');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('bot_father_theme') as 'light' | 'dark') || 'light';
  });

  const isAdmin = appState.isAdmin === true;

  useEffect(() => {
    let cancelled = false;
    void import('../services/api').then(({ apiService }) => apiService.auth()).then(res => {
      if (!cancelled) {
        const mappedBots = res.bots.map(mapApiBot);
        
        setAppState(prev => ({
          ...prev,
          bots: mappedBots,
          activeBot: mappedBots.length > 0 ? mappedBots[0] : null,
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
    const activeBotId = appState.activeBot?.id;
    if (!activeBotId) return;
    let cancelled = false;
    void import('../services/api').then(({ apiService }) => apiService.getFunnel(activeBotId)).then(res => {
      if (!cancelled) {
          if (res.nodes && res.nodes.length > 0) {
            setBlocks(normalizeFunnelNodes(res.nodes));
          } else {
            setBlocks(INITIAL_BLOCKS);
          }
      }
    }).catch(err => {
      if (!cancelled) {
          console.error("Funnel load err", err);
          setBlocks(INITIAL_BLOCKS);
      }
    });
    return () => { cancelled = true; };
  }, [appState.activeBot?.id]);

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

  const handleCreateBotClick = () => {
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
