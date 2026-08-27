import { cn } from '@/lib/utils'

export type StatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'primary'

const toneDotClass: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-fg-tertiary',
  primary: 'bg-primary',
}

const toneBadgeClass: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-fg-secondary',
  primary: 'bg-accent text-accent-foreground',
}

/** Бейдж со статус-dot для состояний процессов (design.md §6 Badge). */
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium whitespace-nowrap',
        toneBadgeClass[tone],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', toneDotClass[tone])} />
      {label}
    </span>
  )
}
