/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

type AlertType = 'info' | 'success' | 'warning' | 'danger';

interface AlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showConfirm: (options: AlertOptions) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within an AlertProvider');
  return context;
};

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);
  const [isConfirm, setIsConfirm] = useState(false);

  const showAlert = (options: AlertOptions) => {
    setIsConfirm(false);
    setAlertConfig({ type: 'info', confirmText: 'ОК', ...options });
  };

  const showConfirm = (options: AlertOptions) => {
    setIsConfirm(true);
    setAlertConfig({ type: 'warning', confirmText: 'Подтвердить', cancelText: 'Отмена', ...options });
  };

  const closeAlert = () => {
    setAlertConfig(null);
  };

  const handleConfirm = () => {
    if (alertConfig?.onConfirm) alertConfig.onConfirm();
    closeAlert();
  };

  const handleCancel = () => {
    if (alertConfig?.onCancel) alertConfig.onCancel();
    closeAlert();
  };

  const getIcon = (type: AlertType) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={28} className="text-emerald-500" />;
      case 'warning': return <AlertTriangle size={28} className="text-amber-500" />;
      case 'danger': return <AlertCircle size={28} className="text-red-500" />;
      case 'info':
      default: return <Info size={28} className="text-blue-500" />;
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AnimatePresence>
        {alertConfig && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={handleCancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm bg-[var(--color-surface)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--color-border)] p-6"
            >
              <button 
                onClick={handleCancel}
                className="absolute top-4 right-4 text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-4 p-3 rounded-full bg-[var(--color-surface-2)]">
                  {getIcon(alertConfig.type || 'info')}
                </div>
                <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">
                  {alertConfig.title}
                </h3>
                <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed mb-6">
                  {alertConfig.message}
                </p>

                <div className="flex w-full gap-3">
                  {isConfirm && (
                    <button
                      onClick={handleCancel}
                      className="flex-1 py-2.5 rounded-xl font-medium text-[14px] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors"
                    >
                      {alertConfig.cancelText}
                    </button>
                  )}
                  <button
                    onClick={handleConfirm}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-[14px] text-white shadow-sm transition-all hover:opacity-90 active:scale-95 ${
                      alertConfig.type === 'danger' 
                        ? 'bg-red-500' 
                        : alertConfig.type === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                    }`}
                  >
                    {alertConfig.confirmText}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AlertContext.Provider>
  );
};
