import { cn } from '../../lib/utils';

export type PageTone = 'blue' | 'cyan' | 'green' | 'orange' | 'indigo' | 'violet' | 'neutral';

const kickerTone: Record<PageTone, string> = {
  blue: 'text-primary',
  cyan: 'text-cyan',
  green: 'text-success',
  orange: 'text-warning',
  indigo: 'text-indigo',
  violet: 'text-v-600',
  neutral: 'text-fg-tertiary',
};

interface PageHeaderProps {
  /** Акцидентная надстрока Unbounded — название раздела (DS §10). */
  kicker?: string;
  tone?: PageTone;
  title: string;
  /** Однострочная подсказка: что здесь происходит. */
  hint?: string;
  /** Primary-действие экрана (одно, справа). */
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  kicker,
  tone = 'blue',
  title,
  hint,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {kicker && (
            <>
              <span className={cn('kicker text-micro font-bold uppercase tracking-wider', kickerTone[tone])}>
                {kicker}
              </span>
              <span className="text-fg-tertiary select-none text-meta">·</span>
            </>
          )}
          <h1 className="text-body-lg font-bold text-foreground sm:text-title">{title}</h1>
        </div>
        {hint && <p className="mt-0.5 text-meta text-fg-secondary">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
