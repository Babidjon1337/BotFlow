import { useState } from 'react';
import { useAppState } from '../providers/AppStateProvider';
import { useAlert } from '../components/AlertProvider';
import type { BotConfig } from '../types';
import { mapApiBot } from '../services/botMapper';

export const useBotToggle = () => {
  const { appState, setAppState, setToastMessage, setToastType } = useAppState();
  const { showAlert } = useAlert();
  const [isToggling, setIsToggling] = useState<Record<string, boolean>>({});

  const toggleBot = async (bot: BotConfig) => {
    if (isToggling[bot.id]) return; // Prevent double clicks
    const newStatus = bot.status === 'active' ? 'inactive' : 'active';
    
    if (newStatus === 'active' && appState.activeBot?.id === bot.id && appState.isDirty) {
      showAlert({
        title: 'Сначала сохраните воронку',
        message: 'У бота есть несохранённые изменения. Сохраните их перед запуском, чтобы бот использовал актуальный сценарий.',
        type: 'warning',
        confirmText: 'Понятно',
      });
      return;
    }


    setIsToggling(prev => ({ ...prev, [bot.id]: true }));
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.toggleBot(bot.id, newStatus === 'active' ? 'start' : 'stop');
      const actualStatus = result.botStatus === 'active' ? 'active' : 'inactive';
      let refreshedBots: BotConfig[] | null = null;
      try {
        const response = await apiService.getBots();
        refreshedBots = response.bots.map(mapApiBot);
      } catch (refreshError) {
        console.warn('Bot list refresh after toggle failed', refreshError);
      }

      const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred: (type: 'success') => void } } } }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred('success');

      setAppState(prev => ({
        ...prev,
        bots: refreshedBots ?? prev.bots.map(item => item.id === bot.id ? { ...item, status: actualStatus } : item),
        activeBot: refreshedBots
          ? refreshedBots.find(item => item.id === prev.activeBot?.id) ?? prev.activeBot
          : prev.activeBot?.id === bot.id
            ? { ...prev.activeBot, status: actualStatus }
            : prev.activeBot,
      }));

      setToastType('success');
      setToastMessage(newStatus === 'active' ? 'Бот успешно запущен' : 'Бот остановлен');
    } catch (error: unknown) {
      setToastType('error');
      setToastMessage(
        error instanceof Error
          ? error.message
          : (newStatus === 'active' ? 'Не удалось запустить бота' : 'Не удалось остановить бота'),
      );
    } finally {
      setIsToggling(prev => ({ ...prev, [bot.id]: false }));
    }
  };

  return { toggleBot, isToggling };
};
