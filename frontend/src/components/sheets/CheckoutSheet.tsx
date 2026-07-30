import { useState } from 'react';
import { X, Mail, ShieldCheck, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';
import { useViewportHeight } from '../../hooks';

interface CheckoutSheetProps {
  tariffId: 'basic' | 'pro';
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export function CheckoutSheet({ tariffId, onClose, onSuccess }: CheckoutSheetProps) {
  const vh = useViewportHeight();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  };

  const tariffDetails = {
    basic: { name: 'Базовый бот', price: '2 000 ₽', icon: '⭐' },
    pro: { name: 'PRO Подписка', price: '3 000 ₽ / мес', icon: '👑' }
  };

  const currentTariff = tariffDetails[tariffId];

  const handlePay = async () => {
    if (!email.includes('@') || !email.includes('.')) {
      setError('Пожалуйста, введите корректный email');
      return;
    }
    if (!navigator.onLine) {
      setError('Отсутствует подключение к интернету. Проверьте сеть.');
      return;
    }
    
    setError('');
    setIsLoading(true);

    try {
      const { apiService } = await import('../../services/api');
      const checkout = await apiService.createBillingCheckout(tariffId);
      setIsLoading(false);
      onSuccess(email);
      const telegram = (window as any).Telegram?.WebApp;
      if (telegram?.openLink) {
        telegram.openLink(checkout.confirmationUrl);
      } else {
        window.location.assign(checkout.confirmationUrl);
      }
    } catch (paymentError) {
      setIsLoading(false);
      setError(paymentError instanceof Error ? paymentError.message : 'Не удалось создать платёж');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      <div 
        className="fixed inset-x-0 top-0 z-50 flex items-end justify-center pointer-events-none"
        style={{ height: vh ? `${vh}px` : '100dvh' }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full bg-[var(--color-surface)] rounded-t-3xl border-t border-[var(--color-border)] shadow-2xl flex flex-col pointer-events-auto"
          style={{ maxHeight: vh ? `${vh - 20}px` : '90vh' }}
        >
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-bold text-[var(--color-foreground)]">Оформление подписки</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Order Summary */}
          <div className="bg-[var(--color-surface-2)] rounded-2xl p-4 mb-6 flex items-center justify-between border border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-xl shadow-sm border border-[var(--color-border)]">
                {currentTariff.icon}
              </div>
              <div>
                <div className="text-[14px] text-[var(--color-foreground-secondary)]">Выбранный тариф</div>
                <div className="text-[16px] font-bold text-[var(--color-foreground)]">{currentTariff.name}</div>
              </div>
            </div>
            <div className="text-[18px] font-bold text-[var(--color-foreground)] whitespace-nowrap">
              {currentTariff.price}
            </div>
          </div>

          {/* Email Input */}
          <div className="mb-6">
            <label className="block text-[14px] font-medium text-[var(--color-foreground)] mb-2">
              Куда отправить чек?
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--color-foreground-secondary)]">
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={handleFocus}
                placeholder="your@email.com"
                className={`w-full bg-[var(--color-surface)] border ${error ? 'border-red-500' : 'border-[var(--color-border)]'} rounded-xl py-3 pl-10 pr-4 text-[16px] text-[var(--color-foreground)] placeholder-[var(--color-foreground-secondary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-shadow`}
              />
            </div>
            {error && <p className="text-red-500 text-[13px] mt-1.5">{error}</p>}
            <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-2 leading-snug">
              Мы пришлем электронный чек на этот email сразу после успешной оплаты.
            </p>
          </div>

          {/* Trust badges */}
          <div className="border border-[var(--color-border)] rounded-xl p-4 mb-6" style={{ background: 'var(--color-primary-soft)' }}>
            <div className="flex items-start gap-3">
              <ShieldCheck style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} size={20} />
              <div>
                <h4 className="text-[14px] font-bold mb-1" style={{ color: 'var(--color-foreground)' }}>
                  Безопасная оплата через ЮKassa
                </h4>
                <p className="text-[13px] leading-snug" style={{ color: 'var(--color-foreground-secondary)' }}>
                  Мы используем защищенное соединение. Ваши данные обрабатываются на стороне банка и не передаются нам.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handlePay}
            disabled={isLoading}
            className="w-full relative py-3.5 px-4 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white rounded-xl text-[16px] font-bold shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CreditCard size={20} />
                Оплатить {currentTariff.price.split('/')[0]}
              </>
            )}
            
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent hover:animate-[shine_1.5s_ease-in-out_infinite]" />
          </button>
        </div>
        </motion.div>
      </div>
    </>
  );
}
