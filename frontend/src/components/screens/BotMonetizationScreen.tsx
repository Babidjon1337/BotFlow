import { useState } from 'react';
import { BadgeCheck, Check, CreditCard, FileText, Settings2, Wallet } from 'lucide-react';
import type { BotConfig } from '../../types';
import { Button } from '../ui/button';
import { IconChip } from '../common/IconChip';
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
 * Касса подключается ключами (настройки/библиотека), оферта — поле прямо здесь.
 */
export function BotMonetizationScreen({
  bot,
  onOpenSettings,
  onOpenGatewayLibrary,
}: BotMonetizationScreenProps) {
  // Локальная копия перезаполняется при смене бота через key на компоненте (App.tsx remount).
  const [offerUrl, setOfferUrl] = useState(bot.offerUrl || '');
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [offerSaved, setOfferSaved] = useState(false);

  const saveOffer = async () => {
    if (isSavingOffer) return;
    setIsSavingOffer(true);
    setOfferSaved(false);
    try {
      const { apiService: api } = await import('../../services/api');
      const updated = await api.updateBot(bot.id, { offerUrl: offerUrl.trim() });
      setOfferUrl(updated.offerUrl ?? offerUrl.trim());
      setOfferSaved(true);
      window.setTimeout(() => setOfferSaved(false), 2500);
    } finally {
      setIsSavingOffer(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Монетизация"
        tone="green"
        title="Продажи и оплата"
        hint="Выберите кассу и добавьте оферту — деньги приходят сразу на ваш счёт"
      />

      <section className="flex flex-col gap-4" aria-label="Касса">
        {bot.hasPaymentCredentials ? (
          <article className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex min-w-0 items-center gap-3">
              <IconChip icon={BadgeCheck} tone="success" />
              <div className="min-w-0">
                <p className="text-body-lg font-semibold">
                  Касса: {bot.paymentProvider ? PROVIDER_LABEL[bot.paymentProvider] ?? bot.paymentProvider : 'подключена'}
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
            title="Касса не выбрана"
            description="Можно работать без неё — бот соберёт заявки. Подключите ЮKassa, Robokassa или Prodamus, чтобы принимать оплату в диалоге."
            action={
              <Button onClick={onOpenSettings}>
                <CreditCard className="size-4" data-icon="inline-start" />
                Выбрать кассу
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
                Сохранённые подключения — переиспользуйте их в этом и других ботах
              </span>
            </span>
            <span className="shrink-0 text-body-sm font-semibold text-primary">Открыть →</span>
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Оферта">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex min-w-0 items-start gap-3">
            <IconChip icon={FileText} tone="info" />
            <div className="min-w-0 flex-1">
              <p className="text-body-lg font-semibold">Оферта для клиентов</p>
              <p className="mt-0.5 text-meta text-fg-secondary">
                Вставьте ссылку на условия — лид должен принять их перед оплатой.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              value={offerUrl}
              onChange={(event) => setOfferUrl(event.target.value)}
              placeholder="https://yoursite.com/oferta"
              aria-label="Ссылка на оферту"
              className="input h-11 flex-1"
            />
            <Button
              size="md"
              onClick={() => void saveOffer()}
              disabled={isSavingOffer || offerUrl.trim() === (bot.offerUrl || '')}
              className="shrink-0"
            >
              {isSavingOffer ? (
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
              ) : offerSaved ? (
                <Check className="size-4" data-icon="inline-start" aria-hidden />
              ) : null}
              {isSavingOffer ? 'Сохраняем…' : offerSaved ? 'Сохранено' : 'Сохранить'}
            </Button>
          </div>
          {offerSaved && (
            <p className="mt-2 flex items-center gap-1.5 text-meta text-success">
              <Check className="size-3.5" aria-hidden="true" />
              Оферта сохранена — клиент увидит её перед покупкой
            </p>
          )}
          {!offerUrl.trim() && (
            <p className="mt-2 text-meta text-warning">
              Ссылка не указана — платёжные системы рекомендуют публиковать условия.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
