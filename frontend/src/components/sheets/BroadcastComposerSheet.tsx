import { motion } from 'framer-motion';
import { X, ArrowLeft } from 'lucide-react';
import { BroadcastComposerForm, type BroadcastTariffOption } from '../common/BroadcastComposerForm';
import type { AudienceSummary } from '../../services/api';

interface BroadcastComposerSheetProps {
  botId: string;
  counts: AudienceSummary | null;
  /** Готов ли бот к загрузке медиа (токен + START выполнены). */
  mediaReady: boolean;
  /** Тарифы воронки для кнопок под сообщением. */
  tariffs?: BroadcastTariffOption[];
  onClose: () => void;
  onCreated: (scheduledAt: string | null) => void;
}

/** Полноэкранное окно создания рассылки на телефоне с кнопкой Назад */
export const BroadcastComposerSheet = ({
  botId,
  counts,
  mediaReady,
  tariffs = [],
  onClose,
  onCreated,
}: BroadcastComposerSheetProps) => {
  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col bg-background sm:bg-black/60 sm:items-center sm:justify-center sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-composer-title"
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 25 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative flex h-full w-full flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-[20px] sm:border sm:border-border sm:shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 text-sm font-medium text-fg-secondary hover:text-foreground sm:hidden -ml-1 pr-1.5"
            >
              <ArrowLeft className="size-5" />
              <span>Назад</span>
            </button>
            <div className="min-w-0">
              <h2
                id="broadcast-composer-title"
                className="text-base sm:text-lg font-bold text-foreground truncate"
              >
                Новая рассылка
              </h2>
              <p className="text-xs text-fg-tertiary hidden sm:block">
                Одно сообщение выбранному сегменту аудитории
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="hidden sm:flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
          <BroadcastComposerForm
            botId={botId}
            counts={counts}
            onCreated={onCreated}
            mediaReady={mediaReady}
            tariffs={tariffs}
            idPrefix="broadcast-sheet-composer"
          />
        </div>
      </motion.div>
    </div>
  );
};

