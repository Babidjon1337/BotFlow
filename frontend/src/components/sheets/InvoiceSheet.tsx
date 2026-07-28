import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, CheckCircle2, Check } from 'lucide-react';

interface InvoiceSheetProps {
  onClose: () => void;
  clientName?: string;
  username?: string;
}

const MOCK_TARIFFS = [
  { id: 't1', name: 'Тариф "Базовый"', price: '9 900 ₽', desc: 'Доступ к материалам на 1 месяц' },
  { id: 't2', name: 'Тариф "Продвинутый"', price: '29 900 ₽', desc: 'Доступ навсегда + закрытый чат' },
  { id: 't3', name: 'Личное Наставничество', price: '150 000 ₽', desc: 'Индивидуальная работа с автором' },
];

export const InvoiceSheet = ({ onClose, clientName = "Клиент", username = "" }: InvoiceSheetProps) => {
  const [selectedTariffs, setSelectedTariffs] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

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

  const handleSend = () => {
    if (selectedTariffs.length === 0) return;
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setIsSent(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    }, 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[100]"
    >
      {/* Overlay with blur for PC */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm md:block hidden"
      />
      
      <div className="absolute inset-0 flex items-end md:items-center justify-center pointer-events-none">
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-[var(--color-surface)] flex flex-col w-full h-[100dvh] md:w-[480px] md:h-auto md:max-h-[85vh] md:rounded-[24px] pointer-events-auto shadow-[0_-8px_40px_rgba(0,0,0,0.15)] md:shadow-[0_20px_60px_rgba(0,0,0,0.3)] relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pb-4 pt-[max(60px,calc(env(safe-area-inset-top,0px)+24px))] md:pt-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10">
            <div>
              <h2 className="text-[20px] font-bold text-[var(--color-foreground)] leading-tight">
                Выставить счет
              </h2>
              <div className="text-[14px] text-[var(--color-foreground-secondary)] mt-1">
                {clientName} <span className="opacity-60">{username}</span>
              </div>
            </div>
            {/* X button only on PC, since mobile uses TG Back Button */}
            <button
              onClick={onClose}
              className="hidden md:flex w-8 h-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)] hover:text-[var(--color-foreground)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 hide-scrollbar relative">
            <AnimatePresence mode="wait">
              {isSent ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center py-20"
                >
                  <div className="w-20 h-20 bg-[var(--color-success-soft)] text-[var(--color-success)] rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={40} />
                  </div>
                  <h3 className="text-[22px] font-bold text-[var(--color-foreground)] mb-3">
                    Счет отправлен!
                  </h3>
                  <p className="text-[15px] text-[var(--color-foreground-secondary)] max-w-[280px]">
                    Клиент получит сообщение с кнопкой на оплату. Бот сам выдаст доступ после оплаты.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <div className="mb-2">
                    <h3 className="text-[16px] font-bold text-[var(--color-foreground)]">Выберите тариф</h3>
                    <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-1">
                      Тарифы настраиваются в редакторе воронки (блок "Оплата"). Выберите, что именно покупает клиент.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {MOCK_TARIFFS.map((tariff) => {
                      const isSelected = selectedTariffs.includes(tariff.id);
                      return (
                        <div
                          key={tariff.id}
                          onClick={() => setSelectedTariffs(prev => prev.includes(tariff.id) ? prev.filter(t => t !== tariff.id) : [...prev, tariff.id])}
                          className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[16px] font-bold text-[var(--color-foreground)] mb-1">
                              {tariff.name}
                            </div>
                            <div className="text-[13px] text-[var(--color-foreground-secondary)] leading-snug pr-2">
                              {tariff.desc}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-[16px] font-extrabold text-[var(--color-foreground)] whitespace-nowrap">
                              {tariff.price}
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border)]'
                            }`}>
                              {isSelected && <Check size={12} className="text-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

            <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] z-10 shrink-0">
              <button
                onClick={handleSend}
                disabled={selectedTariffs.length === 0 || isSending}
                className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold transition-all ${
                  selectedTariffs.length === 0 || isSending || isSent
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)] cursor-not-allowed'
                  : 'bg-[var(--color-primary)] text-white hover:bg-[#4338CA] shadow-lg shadow-[var(--color-primary)]/25 active:scale-[0.98]'
              }`}
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSent ? (
                'Отправлено'
              ) : (
                <>
                  <Send size={18} />
                  Отправить счет клиенту
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
