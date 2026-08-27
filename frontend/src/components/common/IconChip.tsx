import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StatusTone } from './StatusBadge'

const chipClass: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-fg-secondary',
  primary: 'bg-accent text-primary',
}

/** Круг с иконкой категории на мягкой заливке (design.md §6.1 IconChip). */
export function IconChip({
  icon: Icon,
  tone = 'primary',
  size = 'md',
  className,
}: {
  icon: LucideIcon
  tone?: StatusTone
  size?: 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-12',
        chipClass[tone],
        className,
      )}
    >
      <Icon className={size === 'md' ? 'size-5' : 'size-6'} />
    </span>
  )
}
