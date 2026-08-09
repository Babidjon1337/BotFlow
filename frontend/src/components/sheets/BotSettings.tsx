import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useId, useState, useRef } from 'react';
import {
  X, Copy, Bot, FileText, CreditCard, Key, Shield, Link as LinkIcon, CheckCircle2, AlertCircle, Edit2, Check
} from 'lucide-react';
import { PAYMENT_PROVIDERS } from '../../constants';
import type { PaymentProvider, AppState } from '../../types';
import { useViewportHeight } from '../../hooks';
import { useAppState } from '../../providers/AppStateProvider';
import { useAlert } from '../AlertProvider';

function useHeight() {
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const el = entry.target as HTMLDivElement;
      setHeight(el.offsetHeight);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  
  return [ref, height] as const;
}

interface BotSettingsProps {
  appState: AppState;
  onClose: () => void;
  onSave: () => void;
}

const PROVIDER_INFO: Record<PaymentProvider, { label: string, logo: string, color: string }> = {
  yookassa: { label: 'ЮKassa', logo: '/yookassa.png', color: '#3390ec' },
  robokassa: { label: 'Robokassa', logo: '/robokassa.png', color: '#af52de' },
  prodamus: { label: 'Prodamus', logo: '/prodamus.png', color: '#ff9500' }
};

const PROVIDER_INSTRUCTIONS: Record<PaymentProvider, string> = {
  yookassa: "Ключи API находятся в кабинете ЮKassa: раздел Интеграция -> Ключи API.",
  robokassa: "Технические данные (логин и пароли) находятся в настройках магазина Robokassa.",
  prodamus: "Секретный токен выдается технической поддержкой Продамуса при интеграции."
};

const WEBHOOK_INSTRUCTIONS: Record<PaymentProvider, string> = {
  yookassa: "Добавьте этот URL в настройки ЮKassa (События: `payment.succeeded`) для автоматической выдачи доступа.",
  robokassa: "Добавьте этот URL в настройки магазина Robokassa (как Result URL) для автоматической выдачи доступа.",
  prodamus: "Добавьте этот URL в настройки Продамуса (URL для уведомлений) для автоматической выдачи доступа."
};

export const BotSettings = ({ appState, onClose, onSave }: BotSettingsProps) => {
  const { isAdmin, setAppState, setToastMessage, blocks, funnelLoadState, getFunnelRevision, replaceFunnelWorkspace, markFunnelSaved } = useAppState();
  const vh = useViewportHeight();
  const formId = useId();
  const [contentRef, contentHeight] = useHeight();
  
  const activeBot = appState.activeBot;
  
  const [activeTabLocal, setActiveTabLocal] = useState<'bot' | 'docs' | 'payments'>('bot');

  const [name, setName] = useState(activeBot?.name || '');
  const [token, setToken] = useState('');
  const [tokenChanged, setTokenChanged] = useState(false);
  const [editingToken, setEditingToken] = useState(false);

  const [offerUrl, setOfferUrl] = useState(activeBot?.offerUrl || '');
  
  const [provider, setProvider] = useState<PaymentProvider>((activeBot?.paymentProvider as PaymentProvider) || 'yookassa');
  const initialProvider = (activeBot?.paymentProvider as PaymentProvider) || 'yookassa';
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [paymentCredsChanged, setPaymentCredsChanged] = useState(false);
  const [changedCredentialFields, setChangedCredentialFields] = useState<Set<string>>(new Set());
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({});
  const [providerChanged, setProviderChanged] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  
  const showsStoredToken = Boolean(activeBot?.tokenPreview) && !tokenChanged;
  const showsStoredCredentials = provider === initialProvider && !providerChanged;

  const dynamicWebhookUrl = activeBot?.paymentWebhookUrl
    ? activeBot.paymentWebhookUrl.replace(/\/payments\/(yookassa|robokassa|prodamus)\//, `/payments/${provider}/`)
    : '';

  const isPro = appState.subscriptionStatus === 'active' || isAdmin;
  const isTokenLocked = !isPro && activeBot?.isTokenLocked === true;
  const canEditToken = !isTokenLocked;

  const { showAlert } = useAlert();
  const isFunnelReady = Boolean(
    activeBot &&
    funnelLoadState.status === 'ready' &&
    funnelLoadState.botId === activeBot.id,
  );
  
  const hasUnsavedChanges =
    name !== (activeBot?.name || '') ||
    (token.trim().length > 0) ||
    offerUrl !== (activeBot?.offerUrl || '') ||
    provider !== initialProvider ||
    Object.values(keys).some(val => val.trim().length > 0);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    onClose();
  }, [isSaving, onClose]);

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: { BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void } } } }).Telegram?.WebApp;
    const backButton = tg?.BackButton;
    if (backButton) {
      backButton.show();
      backButton.onClick(requestClose);
      return () => {
        backButton.hide();
        backButton.offClick(requestClose);
      };
    }
  }, [requestClose]);

  const handleSave = async () => {
    if (!activeBot) return;
    if (!isFunnelReady) {
      showAlert({
        title: 'Воронка ещё не загружена',
        message: 'Настройки не сохранены. Дождитесь загрузки.',
        type: 'warning',
        confirmText: 'Понятно',
      });
      return;
    }
    let revisionAtSave = getFunnelRevision();
    const changedCredentials = Object.fromEntries(
      Object.entries(keys).filter(([key, value]) => changedCredentialFields.has(key) && value.trim())
    );
    const requiredCredentialKeys = PAYMENT_PROVIDERS[provider].map((field) => field.key);
    const needsAllCredentials = providerChanged || !activeBot.hasPaymentCredentials;
    if (needsAllCredentials && requiredCredentialKeys.some((key) => !changedCredentials[key])) {
      showAlert({
        title: "Заполните ключи",
        message: "Для новой платёжной системы укажите все ключи.",
        type: "warning",
        confirmText: "Понятно",
      });
      return;
    }
    setIsSaving(true);
    try {
      const { apiService } = await import('../../services/api');
      const updated = await apiService.updateBot(activeBot.id, {
        displayName: name,
        token: tokenChanged && token ? token : undefined,
        offerUrl,
        paymentProvider: provider,
        paymentCreds: paymentCredsChanged ? changedCredentials : undefined,
      });
      const didTokenChange = updated.token_changed === true;
      const blocksForSave = didTokenChange
        ? blocks.map(block => ({
            ...block,
            media: false,
            mediaFileId: null,
            mediaAssetId: null,
            mediaType: null,
          }))
        : blocks;
      if (didTokenChange) {
        revisionAtSave = replaceFunnelWorkspace(blocksForSave);
      }
      const savedFunnel = await apiService.saveFunnel(activeBot.id, blocksForSave, false);
      markFunnelSaved(revisionAtSave);
      setAppState(prev => {
        const nextBot = {
          ...activeBot,
          name: updated.displayName || name,
          token: activeBot.token,
          offerUrl: updated.offerUrl ?? offerUrl,
          paymentProvider: updated.paymentProvider ?? provider,
          paymentKeys: activeBot.paymentKeys,
          hasPaymentCredentials: updated.hasPaymentCredentials ?? activeBot.hasPaymentCredentials,
          tokenPreview: updated.tokenPreview ?? activeBot.tokenPreview,
          paymentCredentialsPreview: updated.paymentCredentialsPreview ?? activeBot.paymentCredentialsPreview,
          paymentWebhookUrl: updated.paymentWebhookUrl ?? activeBot.paymentWebhookUrl,
          username: updated.username || activeBot.username,
          mediaSyncDone: updated.mediaSyncDone ?? activeBot.mediaSyncDone,
          botUrl: updated.botUrl ?? activeBot.botUrl,
        };
        return {
          ...prev,
          bots: prev.bots.map(bot => bot.id === activeBot.id ? {
            ...nextBot,
            funnelComplete: savedFunnel.funnelComplete,
            status: savedFunnel.botStatus === 'active' ? 'active' : 'inactive',
          } : bot),
          activeBot: prev.activeBot?.id === activeBot.id ? {
            ...nextBot,
            funnelComplete: savedFunnel.funnelComplete,
            status: savedFunnel.botStatus === 'active' ? 'active' : 'inactive',
          } : prev.activeBot,
        };
      });
      setToastMessage(savedFunnel.stopped
        ? "Настройки сохранены: бот остановлен"
        : savedFunnel.funnelComplete
          ? "Настройки сохранены"
          : `Настройки сохранены: ${savedFunnel.readinessReasons[0] || 'завершите воронку'}`);
      onSave();
      onClose();
    } catch (error) {
      showAlert({
        title: "Ошибка",
        message: error instanceof Error ? error.message : "Не удалось сохранить.",
        type: "danger",
        confirmText: "Закрыть",
        cancelText: ""
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyWebhook = async () => {
    if (!dynamicWebhookUrl) return;
    try {
      await navigator.clipboard?.writeText(dynamicWebhookUrl);
      setToastMessage('Webhook URL скопирован');
    } catch {
      // Fallback silently
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={requestClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[100]"
      />
      
      <div 
        className="fixed inset-0 z-[101] flex items-start justify-center p-4 pt-[10vh] lg:p-8 lg:pt-[10vh] pointer-events-none"
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.96 }} 
          animate={{ y: 0, opacity: 1, scale: 1 }} 
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-[600px] bg-[var(--color-surface)] rounded-2xl shadow-2xl pointer-events-auto flex flex-col border border-[var(--color-border)] overflow-hidden"
          style={{ maxHeight: vh ? `calc(${vh}px - 64px)` : 'calc(100dvh - 64px)' }}
        >
          <div className="shrink-0 bg-[var(--color-surface)] z-10 border-b border-[var(--color-border)]">
            <div className="flex items-center justify-between p-5 pb-4">
              <div className="min-w-0 pr-4">
                <h3 className="text-[18px] font-semibold tracking-tight text-[var(--color-foreground)]">Настройки бота</h3>
                <p className="mt-1 truncate text-[13px] text-[var(--color-foreground-secondary)]">{activeBot?.name || 'Бот'}</p>
              </div>
              <button 
                type="button" 
                onClick={requestClose} 
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-foreground-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex px-2 gap-1 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveTabLocal('bot')}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTabLocal === 'bot' ? 'border-[var(--color-foreground)] text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'}`}
              >
                <Bot size={15} />
                Основное
              </button>
              <button 
                onClick={() => setActiveTabLocal('docs')}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTabLocal === 'docs' ? 'border-[var(--color-foreground)] text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'}`}
              >
                <FileText size={15} />
                Документы
              </button>
              <button 
                onClick={() => setActiveTabLocal('payments')}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTabLocal === 'payments' ? 'border-[var(--color-foreground)] text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'}`}
              >
                <CreditCard size={15} />
                Оплата
              </button>
            </div>
          </div>

          <motion.div 
            className="overflow-x-hidden overflow-y-auto relative w-full"
            animate={{ height: contentHeight }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            <div ref={contentRef} className="w-full">
              <fieldset disabled={isSaving} aria-busy={isSaving} className="border-0 m-0 p-5 flex flex-col disabled:opacity-70 w-full">
                
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={activeTabLocal}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-6 w-full"
                  >
              {activeTabLocal === 'bot' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-name`} className="text-label" style={{ display: 'block' }}>
                      Имя бота
                    </label>
                    <input
                      id={`${formId}-name`}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Мой Супер Бот"
                      className="input w-full"
                    />
                    <p className="text-[12px] text-[var(--color-foreground-secondary)]">
                      Внутреннее имя, видно только вам.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor={`${formId}-token`} className="text-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={14} className="text-[var(--color-foreground-tertiary)]" />
                      Токен Telegram
                    </label>
                    {showsStoredToken && !editingToken ? (
                      <div className="relative group">
                        <input
                          type="text"
                          value="••••••••••••••••••••••••••••••••••••"
                          readOnly
                          className="input w-full cursor-default pr-10 text-[var(--color-foreground-secondary)] bg-[var(--color-surface-2)]"
                        />
                        <button 
                          type="button"
                          disabled={!canEditToken}
                          onClick={() => { setEditingToken(true); setTokenChanged(true); setToken(''); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--color-foreground-tertiary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
                          title="Редактировать токен"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <input
                        id={`${formId}-token`}
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={!canEditToken}
                        placeholder="123456789:AA..."
                        className="input w-full"
                        autoComplete="new-password"
                      />
                    )}
                    {isTokenLocked ? (
                      <p className="flex items-start gap-1.5 text-[12px] text-orange-500 mt-1.5 leading-tight">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>Токен заблокирован (более 10 юзеров). Нужна PRO-подписка.</span>
                      </p>
                    ) : (
                      <p className="text-[12px] text-[var(--color-foreground-secondary)] mt-1">
                        Выдается в @BotFather. Меняйте только в случае компрометации.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTabLocal === 'docs' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-offer-url`} className="text-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <LinkIcon size={14} className="text-[var(--color-foreground-tertiary)]" />
                      Ссылка на оферту
                    </label>
                    <input
                      id={`${formId}-offer-url`}
                      type="url"
                      value={offerUrl}
                      onChange={(e) => setOfferUrl(e.target.value)}
                      placeholder="https://example.com/terms"
                      className="input w-full"
                    />
                    <p className="text-[12px] text-[var(--color-foreground-secondary)]">
                      Пользователь должен принять условия перед запуском воронки.
                    </p>
                  </div>
                </div>
              )}

              {activeTabLocal === 'payments' && (
                  <div className="space-y-6">
                  {activeBot?.hasPaymentCredentials && !paymentCredsChanged && (
                    <div className="flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2.5 rounded-lg">
                      <CheckCircle2 size={16} className="text-[var(--color-success)] shrink-0" />
                      <p className="text-[13px] text-[var(--color-foreground)] font-medium">
                        API ключи сохранены
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Shield size={14} className="text-[var(--color-foreground-tertiary)]" />
                      Провайдер
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map(p => {
                        const info = PROVIDER_INFO[p];
                        const isSelected = provider === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setProvider(p);
                              setProviderChanged(p !== initialProvider);
                              setKeys({});
                              setChangedCredentialFields(new Set());
                              setPaymentCredsChanged(p !== provider);
                              setEditingKeys({});
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${isSelected ? 'bg-[var(--color-surface)] shadow-sm' : 'bg-[var(--color-surface-2)] border-transparent hover:border-[var(--color-border)] text-[var(--color-foreground-secondary)]'}`}
                            style={{ borderColor: isSelected ? info.color : undefined }}
                          >
                            <img src={info.logo} alt={info.label} className={`w-6 h-6 object-contain mb-1.5 ${!isSelected && 'grayscale opacity-60'}`} />
                            <span className="text-[12px] font-medium">{info.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-[var(--color-foreground-secondary)] mt-1.5">
                      {PROVIDER_INSTRUCTIONS[provider]}
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    {PAYMENT_PROVIDERS[provider].map(field => {
                      const isStored = showsStoredCredentials && activeBot?.paymentCredentialsPreview?.[field.key] && !changedCredentialFields.has(field.key);
                      const isEditing = editingKeys[field.key];
                      
                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label htmlFor={`${formId}-payment-${field.key}`} className="text-[13px] font-medium text-[var(--color-foreground-secondary)]">
                            {field.label}
                          </label>
                          {isStored && !isEditing ? (
                            <div className="relative group">
                              <input
                                type="text"
                                value={activeBot.paymentCredentialsPreview?.[field.key] || '••••••••'}
                                readOnly
                                className="input w-full cursor-default pr-10 text-[var(--color-foreground-secondary)] bg-[var(--color-surface-2)] font-mono text-sm"
                              />
                              <button 
                                type="button"
                                onClick={() => { 
                                  setEditingKeys(prev => ({ ...prev, [field.key]: true }));
                                  setPaymentCredsChanged(true);
                                  setChangedCredentialFields(prev => new Set(prev).add(field.key));
                                  setKeys(prev => ({ ...prev, [field.key]: '' }));
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--color-foreground-tertiary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          ) : (
                            <input
                              id={`${formId}-payment-${field.key}`}
                              type="password"
                              placeholder={field.hint}
                              value={keys[field.key] || ''}
                              onChange={(e) => {
                                setPaymentCredsChanged(true);
                                setChangedCredentialFields(prev => new Set(prev).add(field.key));
                                setKeys(prev => ({ ...prev, [field.key]: e.target.value }));
                              }}
                              className="input w-full font-mono text-sm tracking-wide"
                              autoComplete="new-password"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {dynamicWebhookUrl && (
                    <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                      <div className="bg-[var(--color-surface-2)] px-4 py-2.5 border-b border-[var(--color-border)] flex items-center gap-2">
                        <LinkIcon size={14} className="text-[var(--color-foreground)]" />
                        <span className="text-[13px] font-medium text-[var(--color-foreground)]">Webhook URL</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="text-[12px] text-[var(--color-foreground-secondary)] leading-relaxed">
                          {WEBHOOK_INSTRUCTIONS[provider]}
                        </p>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={dynamicWebhookUrl}
                            className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md px-3 py-1.5 text-[12px] font-mono text-[var(--color-foreground-secondary)] outline-none"
                          />
                          <button
                            type="button"
                            onClick={copyWebhook}
                            className="flex items-center justify-center shrink-0 w-8 h-8 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  </div>
              )}

                  </motion.div>
                </AnimatePresence>
              </fieldset>
            </div>
          </motion.div>

          <AnimatePresence>
            {hasUnsavedChanges && (
              <motion.div
                key="save-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="shrink-0 overflow-hidden"
              >
                <div className="bg-[var(--color-surface)] border-t border-[var(--color-border)] p-4 lg:p-5">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isFunnelReady || isSaving}
                    className="btn btn-action w-full h-[48px] text-[15px]"
                  >
                    {isSaving ? (
                      'Сохраняем...'
                    ) : funnelLoadState.status === 'loading' ? (
                      'Загрузка...'
                    ) : (
                      <>
                        <Check size={16} />
                        Сохранить настройки
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </div>
    </>
  );
};
