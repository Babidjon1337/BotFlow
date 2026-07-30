import { useState } from 'react';
import { useAppState } from '../providers/AppStateProvider';
import { useAlert } from '../components/AlertProvider';
import type { BotConfig } from '../types';

export const useBotToggle = () => {
  const { setAppState } = useAppState();
  const { showAlert } = useAlert();
  const [isToggling, setIsToggling] = useState<Record<string, boolean>>({});

  const toggleBot = async (bot: BotConfig) => {
    if (isToggling[bot.id]) return; // Prevent double clicks
    
    const newStatus = bot.status === 'active' ? 'inactive' : 'active';
    
    setIsToggling(prev => ({ ...prev, [bot.id]: true }));
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.toggleBot(bot.id, newStatus === 'active' ? 'start' : 'stop');
      const actualStatus = result.botStatus === 'active' ? 'active' : 'inactive';

      const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred: (type: 'success') => void } } } }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred('success');

      setAppState(prev => ({
        ...prev,
        bots: prev.bots.map(item => item.id === bot.id ? { ...item, status: actualStatus } : item),
        activeBot: prev.activeBot?.id === bot.id ? { ...prev.activeBot, status: actualStatus } : prev.activeBot,
      }));
    } catch (error) {
      showAlert({
        title: newStatus === 'active' ? 'Бот пока нельзя запустить' : 'Не удалось остановить бота',
        message: error instanceof Error ? error.message : 'Повторите попытку позже.',
        type: 'danger',
        confirmText: 'Закрыть',
        cancelText: '',
      });
    } finally {
      setIsToggling(prev => ({ ...prev, [bot.id]: false }));
    }
  };

  return { toggleBot, isToggling };
};
