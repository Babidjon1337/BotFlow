import { BadgeCheck, CreditCard, FileText, Settings2, Wallet } from 'lucide-react';
import type { BotConfig } from '../../types';
import { Button } from '../ui/button';
import { IconChip } from '../common/IconChip';
import { Overline, SectionHeader } from '../common/SectionHeader';
import { StoryEmptyState } from '../common/StoryEmptyState';
import { PageHeader } from '../common/PageHeader';

const PROVIDER_LABEL: Record<string, string> = {
  yookassa: 'ЮKassa',
  robokassa: 'Robokassa',
  prodamus: 'Prodamus',
};

interface BotMonetizationScreenProps {
  bot: BotConfig;
  onOpenSettings: () => void;
  /** Переход в библиотеку касс аккаунта (аккаунт-вкладка «Кассы»). */
  onOpenGatewayLibrary?: () => void;
}

/**
 * Монетизация бота — центр денег: касса бота, статус приёма оплаты, оферта.
 * Пока касса настраивается в параметрах конкретного бота; библиотека — в аккаунте.
 */
export function BotMonetizationScreen({
  bot,
  onOpenSettings,
  onOpenGatewayLibrary,
}: BotMonetizationScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Монетизация"
        tone="green"
        title="Продажи и оплата"
        hint="Касса и оферта — деньги приходят сразу на ваш счёт"
      />

      <section className="flex flex-col gap-4">
        <SectionHeader title="Оплата" meta="Как клиенты платят этому боту" />
        {bot.hasPaymentCredentials ? (
          <article className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex min-w-0 items-center gap-3">
              <IconChip icon={BadgeCheck} tone="success" />
              <div className="min-w-0">
                <p className="text-body-lg font-semibold">
                  Подключено через {bot.paymentProvider ? PROVIDER_LABEL[bot.paymentProvider] ?? bot.paymentProvider : 'кассу'}
                </p>
                <p className="text-meta text-fg-secondary">
                  Ключи проверены при сохранении. Webhook адресуется этому боту.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-1.5">
              <Settings2 className="size-3.5" data-icon="inline-start" />
              Изменить ключи
            </Button>
          </article>
        ) : (
          <StoryEmptyState
            icon={CreditCard}
            title="Приём оплаты не подключён"
            description="Без кассы бот собирает заявки и контакты. Подключите ключи — и клиенты смогут платить прямо в диалоге."
            action={
              <Button onClick={onOpenSettings}>
                <CreditCard className="size-4" data-icon="inline-start" />
                Подключить оплату
              </Button>
            }
            className="py-10"
          />
        )}
        {onOpenGatewayLibrary && (
          <button
            type="button"
            onClick={onOpenGatewayLibrary}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted"
          >
            <IconChip icon={Wallet} tone="info" />
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold">Библиотека касс аккаунта</span>
              <span className="block text-meta text-fg-tertiary">
                Сохранённые подключения ЮKassa, Robokassa и Prodamus — переиспользуйте их в ботах
              </span>
            </span>
            <span className="shrink-0 text-body-sm font-semibold text-primary">Открыть →</span>
          </button>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <Overline>Оферты</Overline>
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex min-w-0 items-start gap-3">
            <IconChip icon={FileText} tone="info" />
            <div className="min-w-0 flex-1">
              <p className="text-body-lg font-semibold">Оферта для клиентов</p>
              {bot.offerUrl ? (
                <>
                  <p className="mt-0.5 break-all text-meta text-fg-secondary">{bot.offerUrl}</p>
                  <p className="mt-1 text-meta text-fg-tertiary">
                    Лид соглашается с этим документом перед покупкой.
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-meta text-warning">
                  Ссылка не указана — платёжные системы рекомендуют публиковать условия.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-1.5">
              <Settings2 className="size-3.5" data-icon="inline-start" />
              Указать ссылку
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}
