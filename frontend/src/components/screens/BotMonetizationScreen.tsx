import { useState } from 'react';
import { BadgeCheck, Check, CreditCard, FileText, Settings2 } from 'lucide-react';
import type { BotConfig, PaymentProvider } from '../../types';
import { Button } from '../ui/button';
import { PageHeader } from '../common/PageHeader';

const PROVIDERS: {
  id: PaymentProvider;
  name: string;
  desc: string;
  fields: { key: string; label: string; placeholder: string; help: string }[];
}[] = [
  {
    id: 'yookassa',
    name: 'ЮKassa',
    desc: 'Самый популярный способ. Подходит ИП и самозанятым.',
    fields: [
      { key: 'shopId', label: 'shopId (идентификатор магазина)', placeholder: '230456', help: 'Личный кабинет ЮKassa → Настройки → Магазин.' },
      { key: 'secretKey', label: 'Секретный ключ', placeholder: 'live_… или test_…', help: 'Настройки → API-ключи → Создать секретный ключ.' },
    ],
  },
  {
    id: 'robokassa',
    name: 'Robokassa',
    desc: 'Приём платежей для ИП и юрлиц.',
    fields: [
      { key: 'login', label: 'Логин магазина', placeholder: 'myshop', help: 'Личный кабинет Robokassa → Тех. настройки → Логин.' },
      { key: 'password1', label: 'Пароль #1', placeholder: '••••••••', help: 'Тех. настройки → Пароли → Пароль #1.' },
      { key: 'password2', label: 'Пароль #2', placeholder: '••••••••', help: 'Тех. настройки → Пароли → Пароль #2.' },
    ],
  },
  {
    id: 'prodamus',
    name: 'Prodamus',
    desc: 'Продажи в мессенджерах, гибкие способы оплаты.',
    fields: [
      { key: 'shop_id', label: 'ID магазина (shop_id)', placeholder: 'demo', help: 'Личный кабинет Prodamus → Интеграции → shop_id.' },
      { key: 'secret', label: 'Секретный токен', placeholder: '••••••••', help: 'Выдаёт поддержка Продамуса при интеграции.' },
    ],
  },
];

interface BotMonetizationScreenProps {
  bot: BotConfig;
  onOpenSettings: () => void;
}

/**
 * Монетизация бота — центр денег: выбор кассы из трёх с инструкцией,
 * статус подключения и оферта. Касса необязательна для работы бота.
 */
export function BotMonetizationScreen({ bot, onOpenSettings }: BotMonetizationScreenProps) {
  const [selected, setSelected] = useState<PaymentProvider | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Оферта
  const [offerUrl, setOfferUrl] = useState(bot.offerUrl || '');
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [offerSaved, setOfferSaved] = useState(false);

  const active = PROVIDERS.find((p) => p.id === selected);
  const allFilled = active ? active.fields.every((f) => (keys[f.key] || '').trim()) : false;

  const saveCashier = async () => {
    if (!active || !allFilled || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const { apiService: api } = await import('../../services/api');
      await api.updateBot(bot.id, { paymentProvider: active.id, paymentCreds: keys });
      setSaved(true);
      setSelected(null);
      setKeys({});
      window.setTimeout(() => {
        // Перезагружаем статус бота — провайдер и флаг credentials придут с сервера.
        window.location.reload();
      }, 900);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить ключи.');
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* ── Касса ── */}
      <section className="flex flex-col gap-3" aria-label="Касса">
        {bot.hasPaymentCredentials ? (
          <article className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-body-lg font-semibold">
                  Касса: {bot.paymentProvider ? PROVIDERS.find((p) => p.id === bot.paymentProvider)?.name ?? bot.paymentProvider : 'подключена'}
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
          <p className="text-body-sm text-fg-secondary">
            Можно работать без кассы — бот соберёт заявки. Чтобы принимать оплату, выберите одну из трёх:
          </p>
        )}

        {!bot.hasPaymentCredentials && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PROVIDERS.map((provider) => {
              const isSelected = selected === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelected(isSelected ? null : provider.id);
                    setKeys({});
                    setSaveError(null);
                    setSaved(false);
                  }}
                  className={`flex flex-col rounded-[16px] border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-primary/60 ring-2 ring-ring/20'
                      : 'border-border bg-card hover:border-fg-tertiary/50'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
                      <CreditCard className="size-5 text-fg-secondary" aria-hidden />
                    </span>
                    {isSelected && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block text-body font-bold">{provider.name}</span>
                  <span className="mt-1 block text-meta leading-relaxed text-fg-secondary">{provider.desc}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Форма ключей выбранной кассы */}
        {selected && active && !bot.hasPaymentCredentials && (
          <div className="rounded-[16px] border border-border bg-card p-5">
            <p className="text-body font-bold">Ключи {active.name}</p>
            <div className="mt-4 space-y-4">
              {active.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label htmlFor={`cashier-${field.key}`} className="block text-body-sm font-medium text-fg-primary">
                    {field.label}
                  </label>
                  <input
                    id={`cashier-${field.key}`}
                    type="text"
                    value={keys[field.key] || ''}
                    onChange={(event) => {
                      setKeys((prev) => ({ ...prev, [field.key]: event.target.value }));
                      setSaveError(null);
                      setSaved(false);
                    }}
                    placeholder={field.placeholder}
                    className="input w-full"
                  />
                  <p className="text-meta text-fg-tertiary">Где взять: {field.help}</p>
                </div>
              ))}
            </div>
            {saveError && (
              <p className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-body-sm text-danger">
                {saveError}
              </p>
            )}
            {saved && (
              <p className="mt-3 flex items-center gap-1.5 text-body-sm text-success">
                <Check className="size-4" aria-hidden="true" /> Касса подключена
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <Button size="md" disabled={!allFilled || isSaving} onClick={() => void saveCashier()}>
                {isSaving ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
                ) : saved ? (
                  <Check className="size-4" data-icon="inline-start" aria-hidden />
                ) : null}
                {isSaving ? 'Сохраняем…' : saved ? 'Подключено' : 'Подключить кассу'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setKeys({});
                }}
                className="text-body-sm font-semibold text-fg-tertiary hover:text-fg-secondary"
              >
                Позже
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Оферта ── */}
      <section className="flex flex-col gap-3" aria-label="Оферта">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
              <FileText className="size-5" aria-hidden />
            </span>
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
