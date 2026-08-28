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

/** Заголовок экрана по паттерну DS v2 §10: kicker → title 26/800 → hint → action. */
export function PageHeader({
  kicker,
  tone = 'blue',
  title,
  hint,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {kicker && (
          <p className={cn('kicker', kickerTone[tone])}>{kicker}</p>
        )}
        <h1 className="mt-2 text-page-title font-extrabold text-foreground">{title}</h1>
        {hint && <p className="mt-1 text-body-sm text-fg-secondary">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
