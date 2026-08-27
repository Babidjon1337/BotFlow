import { ExternalLink, KeyRound, Plug, RefreshCw } from 'lucide-react';
import type { BotConfig } from '../../types';
import { formatBotUsername } from '../shell/navModel';
import { Button } from '../ui/button';
import { PlatformGlyph } from '../common/platform';
import { StatusBadge } from '../common/StatusBadge';
import { Overline, SectionHeader } from '../common/SectionHeader';

interface BotPlatformsScreenProps {
  bot: BotConfig;
  onOpenSettings: () => void;
}

/**
 * Платформы бота (blueprint #4): конкретные подключения, а не тумблеры.
 * v1: Telegram подключён токеном; VK/MAX — «скоро».
 */
export function BotPlatformsScreen({ bot, onOpenSettings }: BotPlatformsScreenProps) {
  const hasPublicUsername = Boolean(bot.username && bot.username !== '@unknown');

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Платформы"
        meta="Этот бот работает в подключённых мессенджерах — сценарий один для всех"
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PlatformGlyph platform="telegram" connected={hasPublicUsername} size={28} />
            <div className="min-w-0">
              <p className="text-body-lg font-semibold">Telegram</p>
              <p className="truncate text-meta text-fg-tertiary">
                {formatBotUsername(bot.username)}
              </p>
            </div>
          </div>
          <StatusBadge tone={hasPublicUsername ? 'success' : 'warning'} label={hasPublicUsername ? 'Добавлен' : 'Требует настройки'} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-1.5">
            <RefreshCw className="size-3.5" data-icon="inline-start" />
            Управление токеном
          </Button>
          {bot.botUrl && (
            <a
              href={bot.botUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-medium text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
            >
              Открыть в Telegram
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Overline>Другие платформы</Overline>
        {(['vk', 'max'] as const).map(platform => (
          <article
            key={platform}
            aria-disabled
            className="flex items-center justify-between rounded-xl border border-dashed border-border-strong bg-card p-4 sm:p-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-fg-tertiary">
                <Plug className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-body-lg font-semibold text-fg-tertiary">
                  {{ vk: 'VK', max: 'MAX' }[platform]}
                </p>
                <p className="text-meta text-fg-tertiary">
                  Сообщество подключается отдельно — со своими ключами
                </p>
              </div>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-fg-tertiary">
              скоро
            </span>
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
