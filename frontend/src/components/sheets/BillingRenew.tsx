import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Crown, Calendar, CreditCard, AlertCircle } from 'lucide-react';

import { useAlert } from '../AlertProvider';

interface BillingRenewProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const BillingRenew = ({ onClose, onSuccess }: BillingRenewProps) => {
  const [isPaying, setIsPaying] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const { showAlert } = useAlert();

  const handlePay = async () => {
    setIsPaying(true);
    try {
      const { apiService } = await import('../../services/api');
      const checkout = await apiService.createBillingCheckout('pro');
      const telegram = (window as Window & { Telegram?: { WebApp?: { openLink?: (url: string) => void } } }).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(checkout.confirmationUrl);
      else window.location.assign(checkout.confirmationUrl);
      onSuccess();
    } catch (error) {
      showAlert({
        title: 'Не удалось создать платёж',
        message: error instanceof Error ? error.message : 'Попробуйте ещё раз позже.',
        type: 'danger',
        confirmText: 'Закрыть',
        cancelText: '',
      });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40, backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--color-surface)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid var(--color-border)',
          padding: '24px',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          boxShadow: 'var(--shadow-sheet)',
          maxWidth: '500px',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 className="text-xl font-bold" style={{ color: 'var(--color-foreground)' }}>Управление подпиской</h3>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} style={{ color: 'var(--color-foreground-secondary)' }} />
          </button>
        </div>

        {showCancel ? (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-red-500" />
            </div>
            <h4 className="text-lg font-bold text-[var(--color-foreground)] mb-2">Отменить подписку?</h4>
            <p className="text-[14px] text-[var(--color-foreground-secondary)] mb-6">
              Вы потеряете доступ к расширенным функциям PRO, а 9 из 10 ваших ботов будут остановлены после окончания оплаченного периода (25 июля 2026).
            </p>
            <div className="flex flex-col w-full gap-3">
              <button 
                onClick={() => {
                  void (async () => {
                    try {
                      const { apiService } = await import('../../services/api');
                      await apiService.cancelBilling();
                      showAlert({ title: 'Автопродление отключено', message: 'Доступ сохранится до конца оплаченного периода.', type: 'success' });
                      onClose();
                    } catch (error) {
                      showAlert({ title: 'Не удалось отменить подписку', message: error instanceof Error ? error.message : 'Попробуйте ещё раз позже.', type: 'danger', confirmText: 'Закрыть', cancelText: '' });
                    }
                  })();
                }}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors"
              >
                Да, отменить подписку
              </button>
              <button 
                onClick={() => setShowCancel(false)}
                className="w-full py-3 bg-[var(--color-surface-2)] text-[var(--color-foreground)] rounded-xl font-bold transition-colors"
              >
                Вернуться назад
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Plan Info Card */}
            <div className="bg-gradient-to-br from-[#4F46E5]/10 to-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#7C3AED]/10 rounded-full blur-2xl" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white dark:bg-black rounded-full flex items-center justify-center shadow-sm">
                    <Crown size={24} className="text-[#7C3AED]" />
                  </div>
                  <div>
                    <div className="text-[16px] font-bold text-[var(--color-foreground)]">PRO Подписка</div>
                    <div className="text-[13px] text-[var(--color-foreground-secondary)]">3 000 ₽ в месяц</div>
                  </div>
                </div>
                <div className="px-2.5 py-1 bg-[#10B981]/10 text-[#10B981] text-[12px] font-bold rounded-full border border-[#10B981]/20">
                  Активна
                </div>
              </div>
              
              <div className="flex items-center gap-6 mt-6 relative z-10">
                <div>
                  <div className="text-[12px] text-[var(--color-foreground-secondary)] mb-1 flex items-center gap-1.5"><Calendar size={14}/> Следующая оплата</div>
                  <div className="text-[14px] font-bold text-[var(--color-foreground)]">25 июля 2026</div>
                </div>
                <div>
                  <div className="text-[12px] text-[var(--color-foreground-secondary)] mb-1 flex items-center gap-1.5"><CreditCard size={14}/> Карта</div>
                  <div className="text-[14px] font-bold text-[var(--color-foreground)]">•••• 4242</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handlePay}
                disabled={isPaying}
                className="bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]/80 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors border border-[var(--color-border)]"
              >
                {isPaying ? (
                  <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Calendar size={20} className="text-[var(--color-primary)]" />
                )}
                <span className="text-[13px] font-medium text-[var(--color-foreground)]">Оплатить заранее</span>
              </button>
              <button 
                className="bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]/80 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors border border-[var(--color-border)]"
              >
                <CreditCard size={20} className="text-[var(--color-foreground-secondary)]" />
                <span className="text-[13px] font-medium text-[var(--color-foreground)]">Сменить карту</span>
              </button>
            </div>

            {/* Danger Zone */}
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <button 
                onClick={() => setShowCancel(true)}
                className="text-[14px] text-red-500 hover:text-red-600 font-medium w-full text-center py-2 transition-colors"
              >
                Отменить подписку
              </button>
            </div>

          </div>
        )}
      </motion.div>
    </>
  );
};
