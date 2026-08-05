import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useId, useState } from 'react';
import { KeyRound, X, Info, Copy } from 'lucide-react';
import { PAYMENT_PROVIDERS } from '../../constants';
import type { PaymentProvider, AppState } from '../../types';
import { useViewportHeight } from '../../hooks';
import { useAppState } from '../../providers/AppStateProvider';
import { useAlert } from '../AlertProvider';

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

export const BotSettings = ({ appState, onClose, onSave }: BotSettingsProps) => {
  const { setSheet, setActiveTab, isAdmin, setAppState, setToastMessage, blocks, funnelLoadState, getFunnelRevision, replaceFunnelWorkspace } = useAppState();
  const vh = useViewportHeight();
  const formId = useId();
  
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  };
  
  const activeBot = appState.activeBot;
  
  const [name, setName] = useState(activeBot?.name || '');
  const [token, setToken] = useState('');
  const [tokenChanged, setTokenChanged] = useState(false);
  const [offerUrl, setOfferUrl] = useState(activeBot?.offerUrl || '');
  const [provider, setProvider] = useState<PaymentProvider>((activeBot?.paymentProvider as PaymentProvider) || 'yookassa');
  const initialProvider = (activeBot?.paymentProvider as PaymentProvider) || 'yookassa';
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [paymentCredsChanged, setPaymentCredsChanged] = useState(false);
  const [changedCredentialFields, setChangedCredentialFields] = useState<Set<string>>(new Set());
  const [providerChanged, setProviderChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const showsStoredToken = Boolean(activeBot?.tokenPreview) && !tokenChanged;
  const showsStoredCredentials = provider === initialProvider && !providerChanged;

  const isPro = appState.subscriptionStatus === 'active' || isAdmin;
  // The server keeps this flag after a database reset, so clearing leads cannot
  // be used to bypass the token-change restriction.
  const isTokenLocked = !isPro && activeBot?.isTokenLocked === true;

  const canEditToken = !isTokenLocked;
  const canEditPayment = true;

  const { showAlert, showConfirm } = useAlert();
  const isFunnelReady = Boolean(
    activeBot &&
    funnelLoadState.status === 'ready' &&
    funnelLoadState.botId === activeBot.id,
  );
  const hasUnsavedChanges =
    name !== (activeBot?.name || '') ||
    tokenChanged ||
    offerUrl !== (activeBot?.offerUrl || '') ||
    provider !== initialProvider ||
    paymentCredsChanged;

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    showConfirm({
      title: 'Закрыть без сохранения?',
      message: 'Несохранённые изменения в настройках бота будут потеряны.',
      type: 'warning',
      confirmText: 'Закрыть',
      cancelText: 'Остаться',
      onConfirm: onClose,
    });
  }, [hasUnsavedChanges, isSaving, onClose, showConfirm]);

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
        message: 'Настройки не сохранены, чтобы не перезаписать воронку неполными данными. Повторите после её загрузки.',
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
        title: "Заполните реквизиты кассы",
        message: "Для новой платёжной системы укажите все обязательные поля и повторите сохранение.",
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
          isDirty: prev.activeBot?.id === activeBot.id && getFunnelRevision() === revisionAtSave
            ? false
            : prev.isDirty,
        };
      });
      setToastMessage(savedFunnel.stopped
        ? "Настройки сохранены: бот остановлен до завершения воронки"
        : savedFunnel.funnelComplete
          ? "Настройки успешно сохранены!"
          : `Настройки сохранены: ${savedFunnel.readinessReasons[0] || 'завершите воронку перед запуском'}`);
      onSave();
      onClose();
    } catch (error) {
      showAlert({
        title: "Ошибка сохранения",
        message: error instanceof Error ? error.message : "Произошла ошибка при сохранении настроек.",
        type: "danger",
        confirmText: "Закрыть",
        cancelText: ""
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={requestClose}
        className="fixed inset-0 bg-black/40 z-[100]"
      />
      
      {/* Centering container */}
      <div 
        className="fixed inset-x-0 top-0 z-[101] flex items-end lg:items-center justify-center pointer-events-none p-0 lg:p-4"
        style={{ height: vh ? `${vh}px` : '100dvh' }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 1 }} 
          animate={{ y: 0, opacity: 1 }} 
          exit={{ y: '100%', opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full h-full lg:h-auto lg:max-w-[540px] bg-[var(--color-surface)] lg:rounded-[24px] shadow-2xl pointer-events-auto flex flex-col border border-transparent lg:border-[var(--color-border)] overflow-hidden"
          style={{ maxHeight: vh ? `${vh}px` : '100dvh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-5 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:pt-5 shrink-0">
            <div className="min-w-0">
              <h3 className="text-[18px] font-semibold text-[var(--color-foreground)]">Настройки бота</h3>
              <p className="mt-0.5 truncate text-[12px] text-[var(--color-foreground-secondary)]">{activeBot?.name || 'Бот'}</p>
            </div>
            <button type="button" onClick={requestClose} aria-label="Закрыть настройки" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-foreground)]">
              <X size={16} style={{ color: 'var(--color-foreground-secondary)' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
          <fieldset disabled={isSaving} aria-busy={isSaving || undefined} className="m-0 flex flex-col gap-6 border-0 px-5 py-6 pb-[max(24px,calc(env(safe-area-inset-bottom,0px)+16px))] disabled:opacity-70">

          <section aria-labelledby={`${formId}-telegram-title`} className="space-y-4">
            <div>
              <h4 id={`${formId}-telegram-title`} className="text-[14px] font-semibold text-[var(--color-foreground)]">Telegram-бот</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Имя видно только в Mini App. Токен меняйте, только если получили новый в BotFather.</p>
            </div>

          {/* Name */}
          <div>
            <label htmlFor={`${formId}-name`} className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Имя бота</label>
            <input
              id={`${formId}-name`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={handleFocus}
              placeholder="Мой Супер Бот"
              className="input w-full"
            />
          </div>

          {/* Token */}
          <div>
            <label htmlFor={`${formId}-token`} className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Токен Telegram бота</label>
            {showsStoredToken ? (
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" />
                  <input id={`${formId}-token`} type="text" value={activeBot?.tokenPreview || ''} readOnly className="input w-full cursor-default pl-10" aria-describedby={`${formId}-token-help`} />
                </div>
                <button type="button" disabled={!canEditToken} onClick={() => { setTokenChanged(true); setToken(''); }} className="btn btn-secondary h-11 shrink-0 px-3 text-[13px]">Заменить</button>
              </div>
            ) : (
              <div className="relative">
                <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" />
                <input id={`${formId}-token`} type="password" value={token} onChange={(e) => setToken(e.target.value)} onFocus={handleFocus} disabled={!canEditToken} placeholder="Введите новый токен" className="input w-full pl-10" autoComplete="new-password" />
              </div>
            )}
            {showsStoredToken && <p id={`${formId}-token-help`} className="mt-1.5 text-[12px] text-[var(--color-foreground-tertiary)]">Токен показан в безопасной маске. Для замены нажмите «Заменить».</p>}
            {isTokenLocked && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-warning)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>🔒</span>
                <span>
                  У вас более 10 пользователей. Токен заблокирован. Для смены нужна <button type="button" onClick={() => { setSheet(null); setActiveTab('subscription'); }} className="font-medium text-[var(--color-primary)] underline underline-offset-2">PRO-подписка</button> или новый слот.
                </span>
              </p>
            )}
          </div>
          </section>

          <section aria-labelledby={`${formId}-legal-title`} className="space-y-3">
            <div>
              <h4 id={`${formId}-legal-title`} className="text-[14px] font-semibold text-[var(--color-foreground)]">Юридические документы</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Ссылка показывается клиенту перед началом воронки.</p>
            </div>
          <div>
            <label htmlFor={`${formId}-offer-url`} className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Ссылка на оферту</label>
            <input
              id={`${formId}-offer-url`}
              type="text"
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value)}
              onFocus={handleFocus}
              placeholder="https://example.com/offer"
              className="input w-full"
            />
          </div>
          </section>

          <section aria-labelledby={`${formId}-payment-title`} className="space-y-4">
            <div>
              <h4 id={`${formId}-payment-title`} className="text-[14px] font-semibold text-[var(--color-foreground)]">Приём оплаты</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Реквизиты зашифрованы и проверяются сервером при сохранении.</p>
            </div>

          {/* Payment provider */}
          <div>
            <p className="text-label" style={{ display: 'block', marginBottom: '12px' }}>Платёжная система</p>
            {activeBot?.hasPaymentCredentials && !paymentCredsChanged && (
              <p className="mb-3 rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-[12px] font-medium text-[var(--color-success)]">
                Ключи API сохранены. В целях безопасности они не отображаются; заполните поля, только если хотите заменить ключи.
              </p>
            )}
            <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Платёжная система">
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
                      if (p !== 'yookassa') setOfferInstallments(false);
                      setKeys({});
                      setChangedCredentialFields(new Set());
                      setPaymentCredsChanged(p !== provider);
                    }}
                    disabled={!canEditPayment}
                    role="radio"
                    aria-checked={isSelected}
                    className={`flex min-h-24 flex-col items-center justify-center rounded-xl border-2 p-3 transition-colors ${!canEditPayment ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--color-surface-2)]'}`}
                    style={{
                      borderColor: isSelected ? info.color : 'var(--color-border)',
                      background: isSelected ? `${info.color}10` : 'var(--color-surface)',
                      boxShadow: isSelected ? `0 0 0 1px ${info.color}20, var(--shadow-card)` : 'none'
                    }}
                  >
                    <img src={info.logo} alt={info.label} className="w-8 h-8 rounded mb-2 object-contain" />
                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--color-foreground)' : 'var(--color-foreground-secondary)' }}>
                      {info.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="popLayout">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  <Info size={16} className="mt-0.5" style={{ color: PROVIDER_INFO[provider].color, flexShrink: 0 }} />
                  <p className="text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
                    {PROVIDER_INSTRUCTIONS[provider]}
                  </p>
                </motion.div>
                
                <div className="space-y-4">
                  {PAYMENT_PROVIDERS[provider].map(field => (
                    <motion.div
                      key={field.key}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <label htmlFor={`${formId}-payment-${field.key}`} className="mb-1.5 block text-[13px] font-medium text-[var(--color-foreground-secondary)]">{field.label}</label>
                      {showsStoredCredentials && activeBot?.paymentCredentialsPreview?.[field.key] && !changedCredentialFields.has(field.key) ? (
                        <div className="flex items-center gap-2">
                          <input id={`${formId}-payment-${field.key}`} type="text" value={activeBot.paymentCredentialsPreview[field.key]} readOnly className="input min-w-0 flex-1 cursor-default" aria-describedby={`${formId}-payment-${field.key}-help`} />
                          <button type="button" onClick={() => { setPaymentCredsChanged(true); setChangedCredentialFields((previous) => new Set(previous).add(field.key)); setKeys((previous) => ({ ...previous, [field.key]: '' })); }} className="btn btn-secondary h-11 shrink-0 px-3 text-[13px]">Заменить</button>
                        </div>
                      ) : (
                        <input
                          id={`${formId}-payment-${field.key}`}
                          type="password"
                          placeholder={field.hint}
                          value={keys[field.key] || ''}
                          onChange={(e) => {
                            setPaymentCredsChanged(true);
                            setChangedCredentialFields((previous) => new Set(previous).add(field.key));
                            setKeys(prev => ({ ...prev, [field.key]: e.target.value }));
                          }}
                          onFocus={handleFocus}
                          disabled={!canEditPayment}
                          className="input w-full"
                          autoComplete="new-password"
                          style={{ opacity: !canEditPayment ? 0.6 : 1, cursor: !canEditPayment ? 'not-allowed' : 'text' }}
                        />
                      )}
                      {showsStoredCredentials && activeBot?.paymentCredentialsPreview?.[field.key] && !changedCredentialFields.has(field.key) && (
                        <p id={`${formId}-payment-${field.key}-help`} className="mt-1.5 text-[12px] text-[var(--color-foreground-tertiary)]">
                          Значение показано в безопасной маске. Для замены нажмите «Заменить».
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
                {provider === 'yookassa' && activeBot?.paymentWebhookUrl && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Webhook об оплате ЮKassa</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">
                      В кабинете ЮKassa добавьте эту ссылку в HTTP-уведомления и включите событие успешной оплаты. По ней бот выдаёт доступ после подтверждения платежа.
                    </p>
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                      <code className="min-w-0 flex-1 break-all text-[11px] text-[var(--color-foreground-secondary)]">{activeBot.paymentWebhookUrl}</code>
                      <button
                        type="button"
                        aria-label="Скопировать ссылку webhook"
                        title="Скопировать"
                        onClick={async () => {
                          try {
                            await navigator.clipboard?.writeText(activeBot.paymentWebhookUrl!);
                            setToastMessage('Ссылка webhook скопирована');
                          } catch {
                            showAlert({
                              title: 'Не удалось скопировать ссылку',
                              message: 'Скопируйте webhook вручную из поля ниже.',
                              type: 'warning',
                              confirmText: 'Понятно',
                            });
                          }
                        }}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </AnimatePresence>
          </div>
          </section>
          </fieldset>
          </div>

        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 pt-4 pb-[max(20px,calc(env(safe-area-inset-bottom,0px)+12px))]">
          {!isFunnelReady && (
            <p className="mb-3 text-center text-xs leading-5 text-[var(--color-foreground-secondary)]" role="status">
              {funnelLoadState.status === 'error'
                ? 'Воронка недоступна. Закройте настройки и повторите её загрузку.'
                : 'Дождитесь загрузки воронки перед сохранением.'}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isFunnelReady || isSaving}
            className="btn btn-action w-full h-[48px] text-[15px]"
            aria-busy={isSaving || undefined}
          >
            {isSaving
              ? 'Сохраняем изменения…'
              : funnelLoadState.status === 'loading'
              ? 'Загружаем воронку…'
              : funnelLoadState.status === 'error'
                ? 'Воронка недоступна'
                : 'Сохранить изменения'}
          </button>
        </div>
        </motion.div>
      </div>
    </>
  );
};
