import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAppState } from '../providers/AppStateProvider';

export function FunnelLoadStateView() {
  const { funnelLoadState, retryFunnelLoad } = useAppState();

  if (funnelLoadState.status === 'loading' || funnelLoadState.status === 'idle') {
    return (
      <section
        className="m-auto w-full max-w-2xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6"
        role="status"
        aria-busy="true"
        aria-label="Загрузка воронки"
      >
        <div className="mb-5 flex items-center gap-3 text-[var(--color-foreground-secondary)]">
          <RefreshCw className="animate-spin text-[var(--color-primary)]" size={20} aria-hidden="true" />
          <span className="text-sm font-medium">Загружаем воронку…</span>
        </div>
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2, 3].map(item => (
            <div
              key={item}
              className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-2)]"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="m-auto w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center"
      role="alert"
    >
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
        <AlertCircle size={22} aria-hidden="true" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-[var(--color-foreground)]">
        Не удалось загрузить воронку
      </h2>
      <p className="mx-auto mb-5 max-w-sm text-sm leading-6 text-[var(--color-foreground-secondary)]">
        Настройки бота не изменены. {funnelLoadState.error || 'Проверьте подключение и попробуйте снова.'}
      </p>
      <div className="flex justify-center">
        <button
          type="button"
          className="btn btn-primary min-h-11 px-5"
          onClick={() => void retryFunnelLoad()}
        >
          Повторить
        </button>
      </div>
    </section>
  );
}
