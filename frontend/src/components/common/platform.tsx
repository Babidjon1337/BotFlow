import { cn } from '@/lib/utils'

export type PlatformId = 'telegram' | 'vk' | 'max'

export type ConnectionMark = 'connected' | 'none' | 'soon'

/**
 * Монохромные brand-глифы платформ (design.md §6.2 Brand-глифы).
 * Lucide не содержит VK/MAX — рисуем упрощённые глифы в цвете текста.
 * Статус подключения передаётся соседним success-dot, не цветом глифа.
 */
export function PlatformGlyph({
  platform,
  connected = false,
  size = 20,
  className,
}: {
  platform: PlatformId
  connected?: boolean
  size?: number
  className?: string
}) {
  const colorClass = connected ? 'text-fg-secondary' : 'text-fg-tertiary'
  return (
    <span
      role="img"
      aria-label={PLATFORM_LABEL[platform]}
      title={PLATFORM_LABEL[platform]}
      className={cn('inline-flex shrink-0', colorClass, className)}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {platform === 'telegram' && (
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        )}
        {platform === 'vk' && (
          <path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.565-1.765-1.602-.313-3.486 1.801-2.339 4.157-5.336 2.073-5.336h-3.981c-.772 0-.828.435-1.103 1.083-.995 2.347-2.886 5.387-3.604 4.922-.751-.485-.407-2.406-.35-5.261.015-.754.011-1.271-1.141-1.539-.629-.145-1.241-.205-1.809-.205-2.273 0-3.841.953-2.95 1.119 1.571.293 1.42 3.692 1.054 5.16-.638 2.556-3.036-2.024-4.035-4.305-.241-.548-.315-.974-1.175-.974H.972c-.492 0-.787.16-.787.516 0 .602 2.96 6.72 5.786 9.77 2.756 2.975 5.48 2.708 7.191 2.708z" />
        )}
        {platform === 'max' && (
          <>
            <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M7.5 16V8.8c0-.44.354-.8.794-.8h.62c.26 0 .503.125.652.336L13.4 13.5V8.8c0-.44.354-.8.794-.8h.512c.44 0 .794.36.794.8V16h-1.9l-3.6-4.85V16H7.5z" />
          </>
        )}
      </svg>
    </span>
  )
}

const PLATFORM_LABEL: Record<PlatformId, string> = {
  telegram: 'Telegram',
  vk: 'VK',
  max: 'MAX',
}

/** Ряд «где работает бот»: Telegram ✓ · VK — · MAX — (blueprint #2). */
export function PlatformRow({
  marks,
  className,
}: {
  /** Подключённость каждой из трёх платформ. */
  marks: Record<PlatformId, ConnectionMark>
  className?: string
}) {
  const order: PlatformId[] = ['telegram', 'vk', 'max']
  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-label="Платформы">
      {order.map(id => {
        const mark = marks[id]
        return (
          <span key={id} className="inline-flex items-center gap-1">
            <PlatformGlyph platform={id} connected={mark !== 'soon'} />
            {mark === 'connected' ? (
              <CheckIcon />
            ) : mark === 'soon' ? (
              <SoonTag />
            ) : (
              <DashIcon />
            )}
          </span>
        )
      })}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-success">
      <path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden className="text-fg-tertiary">
      <rect x="1" y="5.25" width="8" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  )
}

function SoonTag() {
  return (
    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] leading-4 font-medium text-fg-tertiary">
      скоро
    </span>
  )
}
