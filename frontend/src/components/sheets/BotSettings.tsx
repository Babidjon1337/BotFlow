import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, X, Info } from 'lucide-react';
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
  const { setSheet, setActiveTab, isAdmin } = useAppState();
  const vh = useViewportHeight();
  
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  };
  
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.BackButton) {
      tg.BackButton.show();
      tg.BackButton.onClick(onClose);
      return () => {
        tg.BackButton.hide();
        tg.BackButton.offClick(onClose);
      };
    }
  }, [onClose]);

  const activeBot = appState.activeBot;
  
  const [name, setName] = useState(activeBot?.name || '');
  const [token, setToken] = useState(activeBot?.token || '');
  const [offerUrl, setOfferUrl] = useState(activeBot?.offerUrl || '');
  const [offerInstallments, setOfferInstallments] = useState(activeBot?.offerInstallments || false);
  const [provider, setProvider] = useState<PaymentProvider>((activeBot?.paymentProvider as PaymentProvider) || 'yookassa');
  const [keys, setKeys] = useState<Record<string, string>>(activeBot?.paymentKeys || { shopId: '', secretKey: '' });

  const isPro = appState.subscriptionStatus === 'active' || isAdmin;
  const hasManyUsers = (activeBot?.usersCount || 0) > 10;

  // Токен блокируется только если нет PRO подписки И юзеров больше 10
  const isTokenLocked = !isPro && hasManyUsers;

  const canEditToken = !isTokenLocked;
  const canEditPayment = true;

  const [isSaving, setIsSaving] = useState(false);
  const { showAlert } = useAlert();
  const { setToastMessage } = useAppState();

  const handleSave = async () => {
    if (!activeBot) return;
    setIsSaving(true);
    try {
      const { apiService } = await import('../../services/api');
      await apiService.updateBot(activeBot.id, {
        name,
        token,
        offerUrl,
        offerInstallments,
        paymentProvider: provider,
        paymentCreds: keys
      });
      activeBot.name = name;
      activeBot.token = token;
      activeBot.offerUrl = offerUrl;
      activeBot.offerInstallments = offerInstallments;
      activeBot.paymentProvider = provider;
      activeBot.paymentKeys = keys;
      setToastMessage("Настройки успешно сохранены!");
      onSave();
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      showAlert({
        title: "Ошибка сохранения",
        message: e.message || "Произошла ошибка при сохранении настроек.",
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
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onFocus={handleFocus}
                disabled={!canEditToken}
                placeholder="Например: 1234567890:AAH_..."
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
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
            <div className="pr-3">
              <span className="text-[14px] font-medium text-[var(--color-foreground)] block">Предлагать рассрочку от банка</span>
              <span className="text-[12px] text-[var(--color-foreground-secondary)] leading-tight block mt-0.5">Включает опцию оплаты частями в платёжной системе при оплате тарифа</span>
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
          </div>

          {/* Payment provider */}
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: '12px' }}>Платёжная система</label>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map(p => {
                const info = PROVIDER_INFO[p];
                const isSelected = provider === p;
                
                return (
                  <button
                    key={p}
                    onClick={() => { setProvider(p); setKeys({}); }}
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
                        type="text"
                        placeholder={field.hint}
                        value={keys[field.key] || ''}
                        onChange={(e) => setKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
                        onFocus={handleFocus}
                        disabled={!canEditPayment}
                        className="input w-full"
                        style={{ opacity: !canEditPayment ? 0.6 : 1, cursor: !canEditPayment ? 'not-allowed' : 'text' }}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </AnimatePresence>
          </div>
        </div>

        <div className="p-5 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={handleSave}
            className="btn btn-action w-full h-[48px] text-[15px]"
          >
            Сохранить изменения
          </button>
        </div>
        </motion.div>
      </div>
    </>
  );
};
