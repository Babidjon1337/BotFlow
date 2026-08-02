import { useCallback } from 'react';
import type { BotConfig } from '../types';
import { useAlert } from '../components/AlertProvider';
import { useAppState } from '../providers/AppStateProvider';

type BotSelectionOptions = {
  onSelected?: () => void;
};

export function useBotSelectionGuard() {
  const { appState, selectBot, setToastMessage } = useAppState();
  const { showAlert, showConfirm } = useAlert();

  const requestBotSelection = useCallback((
    targetBot: BotConfig,
    options: BotSelectionOptions = {},
  ) => {
    const runSelection = async (discardDirty: boolean) => {
      const result = await selectBot(targetBot.id, discardDirty);

      if (result.status === 'selected' || result.status === 'same') {
        options.onSelected?.();
        return;
      }

      if (result.status === 'dirty') {
        const currentName = appState.activeBot?.name || 'текущего бота';
        showConfirm({
          title: 'Есть несохранённые изменения',
          message: `Изменения в воронке «${currentName}» не сохранены. При переходе к «${targetBot.name}» они будут потеряны.`,
          type: 'danger',
          confirmText: 'Перейти без сохранения',
          cancelText: 'Не переключаться',
          onConfirm: () => {
            void runSelection(true);
          },
        });
        return;
      }

      if (result.status === 'busy') {
        setToastMessage('Дождитесь завершения текущей загрузки.');
        return;
      }

      if (result.status === 'error') {
        showAlert({
          title: 'Не удалось открыть бота',
          message: `${result.message} Текущий бот и несохранённые изменения не затронуты.`,
          type: 'danger',
          confirmText: 'Понятно',
        });
      }
    };

    void runSelection(false);
  }, [appState.activeBot?.name, selectBot, setToastMessage, showAlert, showConfirm]);

  return { requestBotSelection };
}
