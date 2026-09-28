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
    const botKey = String(bot.id);
    if (isToggling[botKey]) return; // Prevent double clicks
    const newStatus = bot.status === 'active' ? 'inactive' : 'active';
    
    if (newStatus === 'active' && String(appState.activeBot?.id) === botKey && appState.isDirty) {
      showAlert({
        title: 'Сначала сохраните воронку',
        message: 'У бота есть несохранённые изменения. Сохраните их перед запуском, чтобы бот использовал актуальный сценарий.',
        type: 'warning',
        confirmText: 'Понятно',
      });
      return;
    }

    setIsToggling(prev => ({ ...prev, [botKey]: true }));
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.toggleBot(bot.id, newStatus === 'active' ? 'start' : 'stop');
      const actualStatus: 'active' | 'inactive' = result.botStatus === 'active' ? 'active' : 'inactive';
      let refreshedBots: BotConfig[] | null = null;
      try {
        const response = await apiService.getBots();
        refreshedBots = response.bots.map(mapApiBot);
      } catch (refreshError) {
        console.warn('Bot list refresh after toggle failed', refreshError);
      }

      const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred: (type: 'success') => void } } } }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred('success');

      setAppState(prev => {
        const targetBotId = String(bot.id);
        const updatedBots: BotConfig[] = (refreshedBots ?? prev.bots).map(item =>
          String(item.id) === targetBotId ? { ...item, status: actualStatus } : item
        );
        let updatedActiveBot: BotConfig | null = prev.activeBot;
        if (prev.activeBot && String(prev.activeBot.id) === targetBotId) {
          const fresh = refreshedBots?.find(item => String(item.id) === targetBotId);
          updatedActiveBot = {
            ...prev.activeBot,
            ...(fresh || {}),
            id: targetBotId,
            status: actualStatus,
          };
        }
        return {
          ...prev,
          bots: updatedBots,
          activeBot: updatedActiveBot,
        };
      });

      setToastType('success');
      setToastMessage(newStatus === 'active' ? 'Бот успешно запущен' : 'Бот остановлен');
    } catch (error: unknown) {
      setToastType('error');
      const errorMsg = error instanceof Error
        ? error.message
        : (newStatus === 'active' ? 'Не удалось запустить бота' : 'Не удалось остановить бота');
      setToastMessage(errorMsg);
      showAlert({
        title: newStatus === 'active' ? 'Не удалось запустить бота' : 'Не удалось остановить бота',
        message: errorMsg,
        type: 'danger',
        confirmText: 'Понятно',
        cancelText: '',
      });
    } finally {
      setIsToggling(prev => ({ ...prev, [botKey]: false }));
    }
  };

  return { toggleBot, isToggling };
};
