import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Pill ▲▼ изменения метрики (design.md §6.1 DeltaBadge). null → нейтральное «—». */
export function DeltaBadge({
  deltaPercent,
  className,
}: {
  deltaPercent: number | null
  className?: string
}) {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) {
    return (
      <span className={cn('tnum inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-semibold text-fg-secondary', className)}>
        <Minus className="size-3" aria-hidden />
        —
      </span>
    )
  }
  const flat = Math.abs(deltaPercent) < 0.5
  const up = deltaPercent >= 0
  const digits = Math.abs(deltaPercent) >= 10 ? 0 : 1
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold',
        flat && 'bg-muted text-fg-secondary',
        !flat && up && 'bg-success-soft text-success',
        !flat && !up && 'bg-danger-soft text-danger',
        className,
      )}
    >
      {!flat && (up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />)}
      {up && !flat ? '+' : ''}
      {deltaPercent.toFixed(digits)}%
    </span>
  )
}
