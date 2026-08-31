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
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-card shadow-xs">
              <PlatformGlyph platform="telegram" size={30} />
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
