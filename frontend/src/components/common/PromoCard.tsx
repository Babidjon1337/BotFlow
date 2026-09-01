import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Тёмный контрастный блок для апсейла (design.md §6.1 PromoCard).
 * Light: фон n900 + border-strong; Dark: surface-raised.
 * Максимум одна на экран. Только для тарифа / лимитов / gift-контекста.
 */
export function PromoCard({
  title,
  description,
  action,
  className,
}: {
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-strong bg-n-900 p-5 text-n-0 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-border dark:bg-surface-raised',
        className,
      )}
    >
      <img
        src="/visuals/promo-subscription.png"
        alt=""
        width={96}
        height={96}
        className="pointer-events-none absolute -right-3 -top-3 select-none opacity-90 sm:static sm:order-2 sm:-mr-2 sm:size-20"
        loading="lazy"
        aria-hidden
      />
      <div className="min-w-0">
        <h3 className="text-title font-semibold">{title}</h3>
        <p className="mt-1 text-meta text-n-300 dark:text-fg-secondary">{description}</p>
      </div>
      {action && <div className="shrink-0 sm:order-3">{action}</div>}
    </section>
  )
}
