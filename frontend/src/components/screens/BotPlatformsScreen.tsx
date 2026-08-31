import { ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import type { BotConfig } from '../../types';
import { formatBotUsername } from '../shell/navModel';
import { Button } from '../ui/button';
import { PlatformGlyph } from '../common/platform';
import { StatusBadge } from '../common/StatusBadge';
import { PageHeader } from '../common/PageHeader';

interface BotPlatformsScreenProps {
  bot: BotConfig;
  onOpenSettings: () => void;
}

/**
 * Платформы бота: три равных блока (Telegram / VK / MAX) с брендовыми иконками.
 * v1: Telegram подключается токеном; VK/MAX — «скоро».
 */
export function BotPlatformsScreen({ bot, onOpenSettings }: BotPlatformsScreenProps) {
  const hasPublicUsername = Boolean(bot.username && bot.username !== '@unknown');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Платформы"
        tone="neutral"
        title="Платформы"
        hint="Этот бот работает в подключённых мессенджерах — сценарий один для всех"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Платформы">
        {/* Telegram — активная платформа */}
        <article className="flex flex-col rounded-[16px] border border-primary/30 bg-accent p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-[#229ED9] shadow-xs">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </span>
            <StatusBadge tone={hasPublicUsername ? 'success' : 'warning'} label={hasPublicUsername ? 'Добавлен' : 'Настроить'} />
          </div>
          <h3 className="mt-3.5 text-body-lg font-bold">Telegram</h3>
          <p className="mt-0.5 truncate text-meta text-fg-secondary">
            {formatBotUsername(bot.username)}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3.5">
            <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-1.5">
              <RefreshCw className="size-3.5" data-icon="inline-start" />
              Токен
            </Button>
            {bot.botUrl && (
              <a
                href={bot.botUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-medium text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
              >
                Открыть
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </article>

        {/* VK и MAX — скоро */}
        {(['vk', 'max'] as const).map(platform => (
          <article
            key={platform}
            aria-disabled
            className="flex flex-col rounded-[16px] border border-dashed border-border-strong bg-card p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-muted">
                <PlatformGlyph platform={platform} size={30} className="opacity-50" />
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-fg-tertiary">
                скоро
              </span>
            </div>
            <h3 className="mt-3.5 text-body-lg font-bold text-fg-tertiary">
              {{ vk: 'VK', max: 'MAX' }[platform]}
            </h3>
            <p className="mt-0.5 text-meta text-fg-tertiary">
              Сообщество подключается отдельно — со своими ключами
            </p>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3.5">
              <span className="inline-flex h-7 items-center rounded-lg px-2.5 text-[0.8rem] font-medium text-fg-tertiary">
                Уведомим при запуске
              </span>
            </div>
          </article>
        ))}
      </section>

      <aside className="flex items-start gap-3 rounded-xl bg-info-soft p-4 text-info">
        <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-meta leading-relaxed">
          Нужен новый бот или другой токен? Токен меняется в настройках бота —
          сценарий и клиенты сохранятся.
        </p>
      </aside>
    </div>
  );
}
