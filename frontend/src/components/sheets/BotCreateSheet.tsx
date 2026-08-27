import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, KeyRound, ExternalLink, ArrowRight, ArrowLeft, CheckCircle2, Info, CreditCard, AlertTriangle, LockKeyhole } from 'lucide-react';
import { PAYMENT_PROVIDERS } from '../../constants';
import type { PaymentProvider } from '../../types';
import { useViewportHeight } from '../../hooks';

interface BotCreateSheetProps {
  onClose: () => void;
  onCreate: (botData: BotCreateData) => Promise<void>;
  onError?: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

type BotCreateData = {
  displayName: string;
  token: string;
  paymentProvider?: PaymentProvider;
  paymentCreds: Record<string, string>;
  offerUrl: string;
};

type TelegramWebApp = {
  BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void };
  HapticFeedback?: { notificationOccurred: (type: 'success' | 'error' | 'warning') => void };
};

const previousStep = (current: 1 | 2 | 3): 1 | 2 | 3 => current === 1 ? 1 : current === 2 ? 1 : 2;
const nextStep = (current: 1 | 2 | 3): 1 | 2 | 3 => current === 3 ? 3 : current === 1 ? 2 : 3;

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

export const BotCreateSheet = ({ onClose, onCreate, onError, onBusyChange }: BotCreateSheetProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isCreating, setIsCreating] = useState(false);
  const vh = useViewportHeight();

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Wait for the keyboard to slide up and layout to resize
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  };

  // Step 1: Basic
  const [name, setName] = useState('');
  const [token, setToken] = useState('');

  // Step 2: Payment
  const [skipPayment, setSkipPayment] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>('yookassa');
  const [keys, setKeys] = useState<Record<string, string>>({});

  // Step 3: Offer
  const [offerUrl, setOfferUrl] = useState('');

  // TG BackButton wiring
  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    const backButton = tg?.BackButton;
    if (!backButton) return;
    backButton.show();
    const handler = () => {
      if (isCreating) return;
      if (step > 1) setStep(previousStep);
      else onClose();
    };
    backButton.onClick(handler);
    return () => {
      backButton.offClick(handler);
      backButton.hide();
    };
  }, [isCreating, step, onClose]);



  const canGoNext1 = name.trim().length > 0;
  
  const currentFields = useMemo(() => PAYMENT_PROVIDERS[provider], [provider]);
  
  const canGoNext2 = skipPayment || currentFields.every(f => (keys[f.key] || '').trim() !== '');
  
  const handleCreate = async () => {
    if (!navigator.onLine) {
      onError?.('Отсутствует подключение к интернету. Проверьте сеть.');
      return;
    }

    setIsCreating(true);
    onBusyChange?.(true);
    try {
      await onCreate({
        displayName: name.trim(),
        token: token.trim(),
        paymentProvider: skipPayment ? undefined : provider,
        paymentCreds: skipPayment ? {} : keys,
        offerUrl: offerUrl.trim(),
      });
      const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Ошибка при создании бота');
    } finally {
      setIsCreating(false);
      onBusyChange?.(false);
    }
  };

  return (
    <>
      {/* Dim backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={isCreating ? undefined : onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
      />
      
      {/* Centering wrapper */}
      <div 
        className="fixed inset-x-0 top-0 z-[101] flex flex-col justify-end lg:justify-center items-center pointer-events-none p-0 lg:p-4"
        style={{ height: vh ? `${vh}px` : '100dvh' }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 200 }}
          className="w-full h-full lg:h-auto lg:max-w-[500px] bg-[var(--color-surface)] lg:rounded-[32px] shadow-2xl pointer-events-auto flex flex-col border border-transparent lg:border-[var(--color-border)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex flex-col items-center justify-center px-6 pb-4 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)] relative z-10 gap-2 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:pt-5">
            <h2 className="text-[18px] md:text-[20px] font-bold text-[var(--color-foreground)] tracking-tight">Создание бота</h2>
            <div className="flex items-center gap-1.5 mt-1">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s} 
                  className="h-1.5 rounded-full transition-all duration-300" 
                  style={{ 
                    width: s === step ? '24px' : '12px', 
                    background: s <= step ? 'var(--color-primary)' : 'var(--color-border)' 
                  }} 
                />
              ))}
            </div>
            {/* Desktop Close Button (hidden on mobile) */}
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              disabled={isCreating}
              className="absolute right-4 top-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:top-1/2 lg:-translate-y-1/2 w-8 h-8 hidden lg:flex items-center justify-center rounded-full hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Content Container */}
          <div className="overflow-y-auto flex-1 relative bg-[var(--color-surface)] hide-scrollbar">
            <div className="p-5 md:p-8 pb-10 min-h-full flex flex-col justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col gap-5"
              >
                <div className="text-center mb-2">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--color-primary-soft)] flex items-center justify-center mb-4">
                    <Bot size={32} className="text-[var(--color-primary)]" />
                  </div>
                  <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed">Выберите сценарий и назовите будущего бота. Токен понадобится только на следующем шаге.</p>
                </div>

                <div>
                  <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-1.5">
                    Внутреннее название (для себя)
                  </label>
                  <input
                    type="text"
                    placeholder="Например: Мой магазин"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={handleFocus}
                    className="input w-full"
                  />
                </div>
                <div className="rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)] p-3 text-left">
                  <div className="flex gap-3"><img src="/visuals/scenarios/sales-funnel-card.png" alt="Воронка продаж" className="size-14 rounded-xl object-cover" /><div><p className="text-sm font-semibold text-[var(--color-foreground)]">Воронка продаж</p><p className="mt-1 text-xs leading-5 text-[var(--color-foreground-secondary)]">Сообщения, заявки и рассылки в Telegram. 990 ₽ в месяц после публикации.</p></div></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-foreground-tertiary)]"><span className="flex items-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] p-3"><LockKeyhole size={14} />Запись · скоро</span><span className="flex items-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] p-3"><LockKeyhole size={14} />Mini App · скоро</span></div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col gap-5"
              >
                <div className="text-center mb-2">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--color-success-soft)] flex items-center justify-center mb-4">
                    <CreditCard size={32} className="text-[var(--color-success)]" />
                  </div>
                  <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed">
                    Как вы хотите принимать оплату от пользователей?
                  </p>
                </div>

                <div>
                  <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-1.5">Telegram Token <span className="text-[var(--color-danger)]">*</span></label>
                  <div className="relative"><KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" /><input type="text" placeholder="1234567890:AAH..." value={token} onChange={(e) => setToken(e.target.value)} onFocus={handleFocus} className="input w-full" style={{ paddingLeft: '40px' }} /></div>
                  {token && !token.includes(':') ? <p className="mt-1.5 text-[12px] text-[var(--color-danger)]">Некорректный формат токена</p> : <p className="mt-1.5 text-[12px] text-[var(--color-foreground-tertiary)]">Telegram доступен сейчас. VK и MAX появятся позже.</p>}
                </div>

                <label className="flex items-center justify-between cursor-pointer bg-[var(--color-surface-2)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border-strong)] transition-all">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-medium text-[var(--color-foreground)]">Пропустить настройку платежей</span>
                    <span className="text-[12px] text-[var(--color-foreground-secondary)] mt-0.5">Вы сможете настроить кассу позже</span>
                  </div>
                  <div 
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300" 
                    style={{ backgroundColor: skipPayment ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
                  >
                    <span 
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${skipPayment ? 'translate-x-6' : 'translate-x-1'}`} 
                    />
                  </div>
                  {/* Скрытый инпут для логики */}
                  <input 
                    type="checkbox" 
                    checked={skipPayment} 
                    onChange={(e) => setSkipPayment(e.target.checked)}
                    className="hidden"
                  />
                </label>

                <div 
                  className={`flex flex-col gap-5 transition-all duration-300 ${skipPayment ? 'opacity-30 pointer-events-none grayscale select-none' : ''}`}
                >
                  <div>
                    <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-2.5">Выберите провайдера</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map(p => {
                        const info = PROVIDER_INFO[p];
                        const isSelected = provider === p;
                        
                        return (
                          <motion.button
                            key={p}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setProvider(p); setKeys({}); }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors cursor-pointer hover:bg-[var(--color-surface-2)]`}
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
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <Info size={16} className="mt-0.5" style={{ color: PROVIDER_INFO[provider].color, flexShrink: 0 }} />
                    <p className="text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
                      {PROVIDER_INSTRUCTIONS[provider]}
                    </p>
                  </motion.div>

                  <div className="space-y-4">
                    {currentFields.map((f) => (
                      <div key={f.key}>
                        <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-1.5">{f.label}</label>
                        <input
                          type="text"
                          placeholder={f.hint}
                          value={keys[f.key] || ''}
                          onChange={(e) => setKeys(prev => ({ ...prev, [f.key]: e.target.value }))}
                          onFocus={handleFocus}
                          className="input w-full"
                          disabled={skipPayment}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col gap-5"
              >
                {skipPayment ? (
                  <div className="text-center mb-2 flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--color-warning-soft)] flex items-center justify-center mb-4">
                      <AlertTriangle size={32} className="text-[var(--color-warning)]" />
                    </div>
                    <h3 className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">Без платежной системы</h3>
                    <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed">
                      Вы пропустили настройку платежей. Пользователи не смогут оплачивать доступ. Вы можете настроить кассу позже в разделе "Настройки бота".
                    </p>
                    <div className="mt-6 bg-[var(--color-primary-soft)] p-4 rounded-2xl border border-[var(--color-primary)]/20 w-full text-left">
                      <h4 className="text-[14px] font-semibold text-[var(--color-primary)] flex items-center gap-2 mb-2">
                        <CheckCircle2 size={16} />
                        Всё готово!
                      </h4>
                      <p className="text-[13px] text-[var(--color-primary)]/80 leading-relaxed">
                        Нажмите кнопку ниже, чтобы завершить настройку и перейти к визуальному редактору сообщений.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-2">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--color-success-soft)] flex items-center justify-center mb-4">
                        <ExternalLink size={32} className="text-[var(--color-success)]" />
                      </div>
                      <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed">
                        Последний шаг: укажите ссылку на публичную оферту или условия использования, чтобы соблюдать правила платёжных систем.
                      </p>
                    </div>

                    <div>
                      <label className="text-[13px] font-medium text-[var(--color-foreground-secondary)] block mb-1.5">
                        Ссылка на оферту
                      </label>
                      <input
                        type="url"
                        placeholder="https://mysite.com/offer"
                        value={offerUrl}
                        onChange={(e) => setOfferUrl(e.target.value)}
                        onFocus={handleFocus}
                        className="input w-full"
                      />
                      <p className="text-[12px] text-[var(--color-foreground-tertiary)] mt-2">
                        Можно настроить позже в разделе "Главные настройки".
                      </p>
                    </div>

                    <div className="mt-4 bg-[var(--color-primary-soft)] p-4 rounded-2xl border border-[var(--color-primary)]/20">
                      <h4 className="text-[14px] font-semibold text-[var(--color-primary)] flex items-center gap-2 mb-2">
                        <CheckCircle2 size={16} />
                        Всё готово!
                      </h4>
                      <p className="text-[13px] text-[var(--color-primary)]/80 leading-relaxed">
                        Нажмите кнопку ниже, чтобы завершить настройку и перейти к визуальному редактору сообщений.
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            )}
            </AnimatePresence>
            </div>
          </div>

        {/* Footer */}
        <div className="p-5 border-t border-[var(--color-border)] flex gap-3 shrink-0 bg-[var(--color-surface)] relative z-10">
          {step > 1 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setStep(previousStep)}
              className="h-[52px] px-6 rounded-2xl flex items-center justify-center font-semibold transition-colors flex-[1]"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-foreground)', border: '1px solid var(--color-border)' }}
            >
              <ArrowLeft size={20} />
            </motion.button>
          )}

          {step < 3 ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setStep(nextStep)}
              disabled={(step === 1 && !canGoNext1) || (step === 2 && (!token.includes(':') || !canGoNext2))}
              className="h-[52px] rounded-2xl flex items-center justify-center font-semibold transition-colors flex-[2] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', boxShadow: '0 8px 16px -6px rgba(99,102,241,0.4)' }}
            >
              Далее
              <ArrowRight size={18} className="ml-2" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleCreate}
              disabled={isCreating}
              className="h-[52px] rounded-2xl flex items-center justify-center font-semibold transition-colors flex-[2] text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--color-success), #10B981)', boxShadow: '0 8px 16px -6px rgba(16,185,129,0.4)' }}
            >
              {isCreating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Создать бота
                  <CheckCircle2 size={18} className="ml-2" />
                </>
              )}
            </motion.button>
          )}
        </div>
      </motion.div>
      </div>
    </>
  );
};

