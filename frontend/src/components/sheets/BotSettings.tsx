import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  };
  
  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: { BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void } } } }).Telegram?.WebApp;
    const backButton = tg?.BackButton;
    if (backButton) {
      backButton.show();
      backButton.onClick(onClose);
      return () => {
        backButton.hide();
        backButton.offClick(onClose);
      };
    }
  }, [onClose]);

  const activeBot = appState.activeBot;
  
  const [name, setName] = useState(activeBot?.name || '');
  const [token, setToken] = useState('');
  const [tokenChanged, setTokenChanged] = useState(false);
  const [offerUrl, setOfferUrl] = useState(activeBot?.offerUrl || '');
  const [offerInstallments, setOfferInstallments] = useState(activeBot?.offerInstallments || false);
  const [provider, setProvider] = useState<PaymentProvider>((activeBot?.paymentProvider as PaymentProvider) || 'yookassa');
  const initialProvider = (activeBot?.paymentProvider as PaymentProvider) || 'yookassa';
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [paymentCredsChanged, setPaymentCredsChanged] = useState(false);
  const [changedCredentialFields, setChangedCredentialFields] = useState<Set<string>>(new Set());
  const [providerChanged, setProviderChanged] = useState(false);

  const isPro = appState.subscriptionStatus === 'active' || isAdmin;
  // The server keeps this flag after a database reset, so clearing leads cannot
  // be used to bypass the token-change restriction.
  const isTokenLocked = !isPro && activeBot?.isTokenLocked === true;

  const canEditToken = !isTokenLocked;
  const canEditPayment = true;

  const { showAlert } = useAlert();
  const isFunnelReady = Boolean(
    activeBot &&
    funnelLoadState.status === 'ready' &&
    funnelLoadState.botId === activeBot.id,
  );

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
    try {
      const { apiService } = await import('../../services/api');
      const updated = await apiService.updateBot(activeBot.id, {
        displayName: name,
        token: tokenChanged && token ? token : undefined,
        offerUrl,
        offerInstallments: provider === 'yookassa' && offerInstallments,
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
          offerInstallments: updated.offerInstallments ?? (provider === 'yookassa' && offerInstallments),
          paymentProvider: updated.paymentProvider ?? provider,
          paymentKeys: activeBot.paymentKeys,
          hasPaymentCredentials: updated.hasPaymentCredentials ?? activeBot.hasPaymentCredentials,
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
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
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
          style={{ maxHeight: '100dvh' }}
        >
          {/* Header */}
          <div className="flex justify-center lg:justify-between items-center p-5 border-b border-[var(--color-border)] shrink-0 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:pt-5 relative">
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-foreground)' }}>Главные настройки</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] border-none cursor-pointer hidden lg:flex items-center justify-center hover:bg-[var(--color-border)] transition-colors absolute right-5 top-1/2 -translate-y-1/2 lg:static lg:translate-y-0">
              <X size={16} style={{ color: 'var(--color-foreground-secondary)' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-6">

          {/* Name */}
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Имя бота</label>
            <input
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
            <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Токен Telegram бота</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-foreground-tertiary)' }} />
              <input
                type="password"
                value={tokenChanged ? token : (activeBot?.tokenPreview || '')}
                onChange={(e) => { setTokenChanged(true); setToken(e.target.value); }}
                onFocus={(e) => {
                  if (!tokenChanged) {
                    e.currentTarget.value = '';
                    setTokenChanged(true);
                    setToken('');
                  }
                  handleFocus(e);
                }}
                disabled={!canEditToken}
                placeholder="Введите новый токен только для замены"
                className="input"
                style={{ paddingLeft: '40px', opacity: !canEditToken ? 0.6 : 1, cursor: !canEditToken ? 'not-allowed' : 'text', width: '100%' }}
              />
            </div>
            {isTokenLocked && (
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-warning)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>🔒</span>
                <span>
                  У вас более 10 пользователей. Токен заблокирован. (Для смены нужна <span onClick={() => { setSheet(null); setActiveTab('subscription'); }} style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}>PRO подписка</span> или новый слот).
                </span>
              </p>
            )}
          </div>

          {/* Offer */}
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Ссылка на оферту</label>
            <input
              type="text"
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value)}
              onFocus={handleFocus}
              placeholder="https://example.com/offer"
              className="input w-full"
            />
          </div>

          {/* Installments Toggle */}
          {provider === 'yookassa' && <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
            <div className="pr-3">
              <span className="text-[14px] font-medium text-[var(--color-foreground)] block">Предлагать рассрочку от банка</span>
              <span className="text-[12px] text-[var(--color-foreground-secondary)] leading-tight block mt-0.5">ЮKassa «Плати частями»: доступно для сумм от 1 000 до 50 000 ₽ при подключённой услуге в кассе.</span>
            </div>
            <button
              type="button"
              onClick={() => setOfferInstallments(!offerInstallments)}
              className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out shrink-0 relative ${
                offerInstallments ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                  offerInstallments ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>}

          {/* Payment provider */}
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: '12px' }}>Платёжная система</label>
            {activeBot?.hasPaymentCredentials && !paymentCredsChanged && (
              <p className="mb-3 rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-[12px] font-medium text-[var(--color-success)]">
                Ключи API сохранены. В целях безопасности они не отображаются; заполните поля, только если хотите заменить ключи.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map(p => {
                const info = PROVIDER_INFO[p];
                const isSelected = provider === p;
                
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setProvider(p);
                      setProviderChanged(p !== initialProvider);
                      if (p !== 'yookassa') setOfferInstallments(false);
                      setKeys({});
                      setChangedCredentialFields(new Set());
                      setPaymentCredsChanged(p !== provider);
                    }}
                    disabled={!canEditPayment}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${!canEditPayment ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--color-surface-2)]'}`}
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
                      <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-1.5">{field.label}</label>
                      <input
                        type="password"
                        placeholder={field.hint}
                        value={changedCredentialFields.has(field.key)
                          ? (keys[field.key] || '')
                          : (activeBot?.paymentCredentialsPreview?.[field.key] || '')}
                        onChange={(e) => {
                          setPaymentCredsChanged(true);
                          setChangedCredentialFields((previous) => new Set(previous).add(field.key));
                          setKeys(prev => ({ ...prev, [field.key]: e.target.value }));
                        }}
                        onFocus={(e) => {
                          if (!changedCredentialFields.has(field.key)) {
                            e.currentTarget.value = '';
                            setChangedCredentialFields((previous) => new Set(previous).add(field.key));
                            setKeys((previous) => ({ ...previous, [field.key]: '' }));
                          }
                          handleFocus(e);
                        }}
                        disabled={!canEditPayment}
                        className="input w-full"
                        style={{ opacity: !canEditPayment ? 0.6 : 1, cursor: !canEditPayment ? 'not-allowed' : 'text' }}
                      />
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
                          await navigator.clipboard?.writeText(activeBot.paymentWebhookUrl!);
                          setToastMessage('Ссылка webhook скопирована');
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
        </div>

        <div className="p-5 border-t border-[var(--color-border)] shrink-0">
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
            disabled={!isFunnelReady}
            className="btn btn-action w-full h-[48px] text-[15px]"
          >
            {funnelLoadState.status === 'loading'
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
