import { cn } from '@/lib/utils'

export type PlatformId = 'telegram' | 'vk' | 'max'

export type ConnectionMark = 'connected' | 'none' | 'soon'

/**
 * Brand-глифы платформ (design.md §6.2).
 * Telegram — фирменный SVG (монохромный, красится токеном).
 * VK и MAX — официальные PNG-логотипы (/brand/vk.png, /brand/max.png).
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
      {platform === 'vk' ? (
        <img
          src="/brand/vk.png"
          alt=""
          width={size}
          height={size}
          className="rounded-[22%] object-cover"
          aria-hidden
        />
      ) : platform === 'max' ? (
        <img
          src="/brand/max.png"
          alt=""
          width={size}
          height={size}
          className="rounded-[22%] object-cover"
          aria-hidden
        />
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      )}
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
