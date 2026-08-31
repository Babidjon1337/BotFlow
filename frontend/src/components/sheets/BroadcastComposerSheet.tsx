import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useViewportHeight } from '../../hooks';
import { BroadcastComposerForm } from '../common/BroadcastComposerForm';
import type { AudienceSummary } from '../../services/api';

interface BroadcastComposerSheetProps {
  botId: string;
  counts: AudienceSummary | null;
  /** Готов ли бот к загрузке медиа (токен + START выполнены). */
  mediaReady: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/** Bottom-sheet обёртка формы создания рассылки (mobile-first). */
export const BroadcastComposerSheet = ({
  botId,
  counts,
  mediaReady,
  onClose,
  onCreated,
}: BroadcastComposerSheetProps) => {
  const vh = useViewportHeight();

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-composer-title"
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.5 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-3xl"
        style={{ maxHeight: vh ? vh - 48 : '92vh' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="broadcast-composer-title"
              className="text-title-lg font-semibold tracking-tight"
            >
              Новая рассылка
            </h2>
            <p className="mt-0.5 text-meta text-fg-tertiary">
              Одно сообщение выбранному сегменту
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-fg-primary"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <BroadcastComposerForm botId={botId} counts={counts} onCreated={onCreated} mediaReady={mediaReady} />
        </div>
      </motion.div>
    </div>
  );
};
