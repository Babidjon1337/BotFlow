import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Editorial-шапка секции: типографика вместо рамок (design.md §14.3).
 * Заголовок display + опциональная строка-сводка и действия справа.
 */
export function SectionHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="text-display font-bold tracking-tight">{title}</h2>
        {meta && <p className="mt-1 text-meta text-fg-secondary">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Overline-метка секции (micro uppercase, §4). */
export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-micro font-medium uppercase tracking-wide text-fg-tertiary', className)}>
      {children}
    </p>
  )
}
