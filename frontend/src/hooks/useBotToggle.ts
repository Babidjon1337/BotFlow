import { useState } from 'react';
import { useAppState } from '../providers/AppStateProvider';
import { useAlert } from '../components/AlertProvider';
import type { BotConfig } from '../types';

export const useBotToggle = () => {
  const { appState, setAppState, blocks } = useAppState();
  const { showAlert } = useAlert();
  const [isToggling, setIsToggling] = useState<Record<string, boolean>>({});

  const toggleBot = async (bot: BotConfig) => {
    if (isToggling[bot.id]) return; // Prevent double clicks
    
    const newStatus = bot.status === 'active' ? 'inactive' : 'active';
    
    if (newStatus === 'active') {
      // 1. Payment configuration check
      if (!bot.paymentProvider) {
        showAlert({
          title: "Касса не подключена",
          message: "Чтобы включить бота, вам необходимо настроить платежного провайдера.",
          type: "warning",
          confirmText: "Закрыть",
          cancelText: ""
        });
        return;
      }
      
      // 2. Completeness check
      let isComplete = bot.funnelComplete;
      
      // If we are currently editing this bot in Build tab, we validate the active blocks
      if (bot.id === appState.activeBot?.id && blocks && blocks.length > 0) {
        const getBlock = (id: string) => blocks.find(b => b.id === id);
        const isStartComplete = !!(getBlock('start')?.content?.replace(/<[^>]*>/g, '').trim() && getBlock('start')?.buttonText?.trim());
        const isPush1Complete = !!(getBlock('push1')?.content?.replace(/<[^>]*>/g, '').trim() && getBlock('push1')?.buttonText?.trim());
        const isPush2Complete = !!(getBlock('push2')?.content?.replace(/<[^>]*>/g, '').trim() && getBlock('push2')?.buttonText?.trim());
        const isDeliveryComplete = !!(getBlock('delivery')?.content?.replace(/<[^>]*>/g, '').trim() && getBlock('delivery')?.buttonText?.trim());
        isComplete = isStartComplete && isPush1Complete && isPush2Complete && isDeliveryComplete;
      }
      
      if (!isComplete) {
        showAlert({
          title: "Воронка не заполнена",
          message: "Заполните все обязательные шаги воронки (тексты сообщений и кнопки).",
          type: "danger",
          confirmText: "Закрыть",
          cancelText: ""
        });
        return;
      }
    }
    
    setIsToggling(prev => ({ ...prev, [bot.id]: true }));
    
    import('../services/api').then(({ apiService }) => {
      apiService.toggleBot(bot.id, newStatus === 'active' ? 'start' : 'stop').then(() => {
        setIsToggling(prev => ({ ...prev, [bot.id]: false }));
        
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        
        setAppState(prev => ({
          ...prev,
          bots: prev.bots.map(b => b.id === bot.id ? { ...b, status: newStatus, funnelComplete: true } : b),
          activeBot: prev.activeBot?.id === bot.id ? { ...prev.activeBot, status: newStatus, funnelComplete: true } : prev.activeBot,
        }));
      }).catch(err => {
        setIsToggling(prev => ({ ...prev, [bot.id]: false }));
        showAlert({
          title: "Ошибка запуска",
          message: err.message || "Не удалось изменить статус бота.",
          type: "danger",
          confirmText: "Закрыть",
          cancelText: ""
        });
      });
    });
  };

  return { toggleBot, isToggling };
};
