import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Storytelling empty state (design.md §14.7): что здесь появится → один CTA.
 * Иконка в muted-круге 64px, title, одно предложение, максимум одна кнопка.
 */
export function StoryEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Icon className="size-7 text-fg-tertiary" aria-hidden />
      </div>
      <h3 className="mt-4 text-title-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-[360px] text-body text-fg-secondary">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
