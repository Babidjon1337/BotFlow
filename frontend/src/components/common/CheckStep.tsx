import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CheckStepState = 'done' | 'current' | 'available' | 'locked'

export interface CheckStepItem {
  id: string
  label: string
  hint?: string
  state: CheckStepState
  onClick?: () => void
}

/**
 * Чеклист запуска (design.md §6.1 CheckStep):
 * done — залитый primary круг + галочка; current — ring p-soft вокруг контура;
 * available — outline; locked — dashed + fg-tertiary. Соединитель — пунктир,
 * активное ребро primary dashed. Вертикальный вариант для mobile/desktop.
 */
export function CheckStepList({
  items,
  className,
}: {
  items: CheckStepItem[]
  className?: string
}) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const nextEdgeActive =
          !isLast &&
          (item.state === 'done' || item.state === 'current') &&
          items[index + 1].state !== 'locked'
        const interactive = Boolean(item.onClick) && item.state !== 'locked'
        const Tag = interactive ? 'button' : 'div'
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepCircle state={item.state} />
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    'my-1 w-px flex-1 border-l-2 border-dashed',
                    nextEdgeActive ? 'border-primary/60' : 'border-border-strong',
                  )}
                />
              )}
            </div>
            <Tag
              {...(interactive
                ? { type: 'button' as const, onClick: item.onClick }
                : {})}
              className={cn(
                '-mt-0.5 min-w-0 flex-1 pb-6 text-left last:pb-0',
                interactive && 'cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-ring',
              )}
            >
              <p
                className={cn(
                  'text-body font-semibold leading-tight',
                  item.state === 'locked' ? 'text-fg-tertiary' : 'text-foreground',
                )}
              >
                {item.label}
              </p>
              {item.hint && item.state !== 'done' && (
                <p className="mt-0.5 text-meta text-fg-secondary">{item.hint}</p>
              )}
            </Tag>
          </li>
        )
      })}
    </ol>
  )
}

function StepCircle({ state }: { state: CheckStepState }) {
  if (state === 'done') {
    return (
      <span className="z-[1] flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span className="z-[1] flex size-7 items-center justify-center rounded-full border-2 border-primary shadow-[0_0_0_3px_var(--accent)]">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
      </span>
    )
  }
  if (state === 'locked') {
    return (
      <span className="z-[1] size-7 rounded-full border-2 border-dashed border-border-strong" aria-hidden />
    )
  }
  return <span className="z-[1] size-7 rounded-full border-2 border-border-strong" aria-hidden />
}
