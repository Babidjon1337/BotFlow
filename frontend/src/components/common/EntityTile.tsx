import { cn } from '@/lib/utils'

/** Сквиркл с первой буквой имени бота/сущности (design.md §6.1 EntityTile). */
export function EntityTile({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const letter = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-[10px] bg-accent font-semibold text-primary',
        size === 'sm' && 'size-8 text-meta',
        size === 'md' && 'size-10 text-title',
        size === 'lg' && 'size-12 text-title-lg',
        className,
      )}
    >
      {letter}
    </div>
  )
}
