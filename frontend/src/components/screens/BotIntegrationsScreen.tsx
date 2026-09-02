import { useState } from 'react';
import { BadgeCheck, Check, ExternalLink, FileText, KeyRound, Play, Settings2 } from 'lucide-react';
import type { BotConfig, PaymentProvider } from '../../types';
import { Button } from '../ui/button';
import { PageHeader } from '../common/PageHeader';
import { StatusBadge } from '../common/StatusBadge';
import { PlatformGlyph } from '../common/platform';

const PROVIDERS: {
  id: PaymentProvider;
  name: string;
  logo: string;
  desc: string;
  fields: { key: string; label: string; placeholder: string; help: string }[];
}[] = [
  {
    id: 'yookassa',
    name: 'ЮKassa',
    logo: '/yookassa.png',
    desc: 'Самый популярный способ. Подходит ИП и самозанятым.',
    fields: [
      { key: 'shopId', label: 'shopId (идентификатор магазина)', placeholder: '230456', help: 'Личный кабинет ЮKassa → Настройки → Магазин.' },
      { key: 'secretKey', label: 'Секретный ключ', placeholder: 'live_… или test_…', help: 'Настройки → API-ключи → Создать секретный ключ.' },
    ],
  },
  {
    id: 'robokassa',
    name: 'Robokassa',
    logo: '/robokassa.png',
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
    logo: '/prodamus.png',
    desc: 'Продажи в мессенджерах, гибкие способы оплаты.',
    fields: [
      { key: 'shop_id', label: 'ID магазина (shop_id)', placeholder: 'demo', help: 'Личный кабинет Prodamus → Интеграции → shop_id.' },
      { key: 'secret', label: 'Секретный токен', placeholder: '••••••••', help: 'Выдаёт поддержка Продамуса при интеграции.' },
    ],
  },
];

interface BotIntegrationsScreenProps {
  bot: BotConfig;
}

function TelegramGlyph({ active }: { active: boolean }) {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill={active ? '#ffffff' : 'currentColor'} aria-hidden="true" className={active ? '' : 'text-fg-tertiary'}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/**
 * Интеграции бота — единый центр подключений:
 * 1. Платформы: Telegram (токен) + VK/MAX «скоро».
 * 2. Касса: ЮKassa / Robokassa / Prodamus с инструкцией по ключам и webhook.
 * 3. Подключение: после сохранения токена/кассы — кнопка «Открыть бота → START».
 * 4. Оферта.
 */
export function BotIntegrationsScreen({ bot }: BotIntegrationsScreenProps) {
  const hasToken = Boolean(bot.username && bot.username !== '@unknown');
  const hasCashier = Boolean(bot.hasPaymentCredentials);
  const cashierName = bot.paymentProvider
    ? PROVIDERS.find((p) => p.id === bot.paymentProvider)?.name ?? bot.paymentProvider
    : '';

  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isSavingToken, setIsSavingToken] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [isSavingCashier, setIsSavingCashier] = useState(false);
  const [cashierError, setCashierError] = useState<string | null>(null);
  const [cashierSaved, setCashierSaved] = useState(false);

  const [offerUrl, setOfferUrl] = useState(bot.offerUrl ?? '');
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSaved, setOfferSaved] = useState(false);

  const activeProvider = PROVIDERS.find((p) => p.id === selectedProvider);
  const allFilled = activeProvider ? activeProvider.fields.every((f) => (keys[f.key] || '').trim()) : false;

  const saveToken = async () => {
    if (!token.trim() || isSavingToken) return;
    setIsSavingToken(true);
    setTokenError(null);
    try {
      const { apiService: api } = await import('../../services/api');
      await api.updateBot(bot.id, { token: token.trim() });
      window.location.reload();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : 'Не удалось сохранить токен.');
      setIsSavingToken(false);
    }
  };

  /** Открывает бота в Telegram, не закрывая Mini App (openTelegramLink). */
  const openBotInTelegram = () => {
    const username = (bot.username || '').replace(/^@/, '');
    const url = bot.botUrl || (username ? `https://t.me/${username}?start=start` : '');
    if (!url) return;
    const tg = (window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void; openLink?: (url: string) => void } };
    }).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noreferrer');
  };

  const saveOffer = async () => {
    if (isSavingOffer) return;
    const value = offerUrl.trim();
    if (value && !/^https?:\/\/\S+\.\S+/.test(value)) {
      setOfferError('Ссылка должна начинаться с https:// и вести на страницу с условиями.');
      return;
    }
    setIsSavingOffer(true);
    setOfferError(null);
    try {
      const { apiService: api } = await import('../../services/api');
      await api.updateBot(bot.id, { offerUrl: value });
      setOfferSaved(true);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setOfferError(error instanceof Error ? error.message : 'Не удалось сохранить ссылку.');
    } finally {
      setIsSavingOffer(false);
    }
  };

  const saveCashier = async () => {
    if (!activeProvider || !allFilled || isSavingCashier) return;
    setIsSavingCashier(true);
    setCashierError(null);
    try {
      const { apiService: api } = await import('../../services/api');
      await api.updateBot(bot.id, { paymentProvider: activeProvider.id, paymentCreds: keys });
      setCashierSaved(true);
      setSelectedProvider(null);
      setKeys({});
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setCashierError(error instanceof Error ? error.message : 'Не удалось сохранить ключи.');
    } finally {
      setIsSavingCashier(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="Интеграции"
        tone="green"
        title="Интеграции"
        hint="Платформы, касса и оферта — всё, что связывает бота с клиентами"
      />

      {/* ── 1. Платформы: три карточки в одну строку ── */}
      <section className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="Платформы">
        <article className={`flex flex-col items-center rounded-[16px] border p-3 text-center sm:p-4 ${hasToken ? 'border-primary/30 bg-accent' : 'border-border bg-card'}`}>
          <span className={`flex size-[72px] shrink-0 items-center justify-center rounded-[18px] sm:size-[84px] ${hasToken ? 'bg-[#229ED9] shadow-sm' : 'bg-muted'}`}>
            <TelegramGlyph active={hasToken} />
          </span>
          <h3 className={`mt-2.5 text-body font-bold ${hasToken ? '' : 'text-fg-tertiary'}`}>Telegram</h3>
          {hasToken ? (
            <p className="mt-0.5 w-full truncate text-micro text-fg-secondary">{bot.username}</p>
          ) : (
            <p className="mt-0.5 text-micro text-fg-tertiary">Токен @BotFather</p>
          )}
          <div className="mt-2">
            <StatusBadge
              tone={bot.mediaSyncDone ? 'success' : hasToken ? 'warning' : 'neutral'}
              label={bot.mediaSyncDone ? 'Готов' : hasToken ? 'Нужен START' : 'Не подключён'}
            />
          </div>
          <button
            type="button"
            onClick={() => { setTokenFormOpen((open) => !open); setToken(''); setTokenError(null); }}
            className="mt-2.5 inline-flex items-center gap-1 text-micro font-semibold text-primary hover:underline"
          >
            <KeyRound className="size-3" aria-hidden="true" />
            {hasToken ? 'Изменить токен' : 'Вставить токен'}
          </button>
        </article>

        {(['vk', 'max'] as const).map(platform => (
          <article
            key={platform}
            aria-disabled
            className="flex flex-col items-center rounded-[16px] border border-dashed border-border-strong bg-card p-3 text-center sm:p-4"
          >
            <span className="flex size-[72px] shrink-0 items-center justify-center rounded-[18px] bg-muted sm:size-[84px]">
              <PlatformGlyph platform={platform} size={64} className="opacity-60" />
            </span>
            <h3 className="mt-2.5 text-body font-bold text-fg-tertiary">
              {{ vk: 'VK', max: 'MAX' }[platform]}
            </h3>
            <p className="mt-0.5 text-micro text-fg-tertiary">Свои ключи</p>
            <div className="mt-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-fg-tertiary">скоро</span>
            </div>
          </article>
        ))}
      </section>

      {/* Форма токена — под рядом платформ, чтобы не растягивать карточки */}
      {tokenFormOpen && (
        <div className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
          <label htmlFor="tg-token" className="block text-body-sm font-medium text-fg-primary">
            {hasToken ? 'Новый токен от @BotFather' : 'Токен от @BotFather'}
          </label>
          <input
            id="tg-token"
            type="password"
            value={token}
            onChange={(event) => { setToken(event.target.value); setTokenError(null); }}
            placeholder="123456789:AA…"
            autoComplete="off"
            className="input mt-2 w-full"
          />
          {hasToken && (
            <p className="mt-2 text-meta text-warning">
              При смене токена медиа воронки сбросятся — их нужно будет загрузить заново.
            </p>
          )}
          {tokenError && (
            <p className="mt-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-meta text-danger">
              {tokenError}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2.5">
            <Button size="sm" disabled={!token.trim() || isSavingToken} onClick={() => void saveToken()}>
              {isSavingToken ? (
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
              ) : null}
              {isSavingToken ? 'Подключаем…' : hasToken ? 'Сохранить токен' : 'Подключить бота'}
            </Button>
            <button
              type="button"
              onClick={() => { setTokenFormOpen(false); setToken(''); setTokenError(null); }}
              className="text-body-sm font-semibold text-fg-tertiary hover:text-fg-secondary"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Шаг START — заметный блок с пульсацией, пока бот не синхронизирован */}
      {hasToken && !bot.mediaSyncDone && (
        <div className="relative overflow-hidden rounded-[16px] border border-warning/40 bg-warning-soft/50 p-4 sm:p-5">
          <span className="pointer-events-none absolute -right-6 -top-6 size-24 animate-pulse rounded-full bg-warning/20" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-body font-bold text-fg-primary">
                <span className="flex size-6 animate-pulse items-center justify-center rounded-full bg-warning text-white">
                  <Play className="size-3" aria-hidden />
                </span>
                Остался один шаг: нажмите START
              </p>
              <p className="mt-1.5 max-w-lg text-body-sm leading-relaxed text-fg-secondary">
                Откройте своего бота и отправьте команду <b className="text-fg-primary">/start</b> —
                мы синхронизируем сценарий и медиа. Mini App останется открытым.
              </p>
            </div>
            <button
              type="button"
              onClick={openBotInTelegram}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-[#229ED9] px-5 text-body-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:translate-y-px"
            >
              Открыть бота и нажать /start
              <ExternalLink className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Касса: всегда раскрыта, лого платёжек видны сразу ── */}
      <section className="flex flex-col gap-3" aria-label="Касса">
        {hasCashier && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-success/40 bg-success-soft/60 px-4 py-3.5 dark:bg-success-soft/40">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-body font-bold">Касса подключена: {cashierName}</p>
                <p className="text-meta text-fg-secondary">Webhook адресуется этому боту.</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const current = PROVIDERS.find((p) => p.id === bot.paymentProvider)?.id ?? null;
                setSelectedProvider(current);
                setKeys({});
                setCashierError(null);
                setCashierSaved(false);
              }}
              className="gap-1.5"
            >
              <Settings2 className="size-3.5" data-icon="inline-start" />
              Изменить ключи
            </Button>
          </div>
        )}

        {!hasCashier && (
          <p className="px-1 text-body-sm text-fg-secondary">
            Можно работать без кассы — бот соберёт заявки. Чтобы принимать оплату, выберите одну из трёх:
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {PROVIDERS.map((provider) => {
            const isActiveCashier = hasCashier && bot.paymentProvider === provider.id;
            const isSelected = selectedProvider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedProvider(isSelected ? null : provider.id);
                  setKeys({});
                  setCashierError(null);
                  setCashierSaved(false);
                }}
                className={`flex flex-col items-center rounded-[16px] border p-3 text-center transition-all sm:p-4 ${
                  isActiveCashier
                    ? 'border-success/60 bg-success-soft/40'
                    : isSelected
                      ? 'border-primary/60 ring-2 ring-ring/20'
                      : 'border-border bg-card hover:border-fg-tertiary/50'
                } ${hasCashier && !isActiveCashier && !isSelected ? 'opacity-60' : ''}`}
              >
                <span className="relative flex size-[72px] items-center justify-center rounded-[18px] bg-white shadow-xs dark:bg-white/95 sm:size-[84px]">
                  <img src={provider.logo} alt={provider.name} className="size-[56px] object-contain sm:size-[64px]" />
                  {isActiveCashier ? (
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-success text-white ring-2 ring-[var(--color-surface)]">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : isSelected ? (
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-[var(--color-surface)]">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="mt-2.5 block text-body font-bold">{provider.name}</span>
                <span className="mt-0.5 block text-micro leading-snug text-fg-tertiary">
                  {isActiveCashier ? 'Подключена' : provider.desc.split('.')[0]}
                </span>
              </button>
            );
          })}
        </div>

        {activeProvider && (
          <div className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
            {hasCashier && bot.paymentProvider === activeProvider.id && (
              <p className="mb-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-meta text-warning">
                Введите ключи заново — сохранённые значения не показываются.
              </p>
            )}
            <div className="space-y-4">
              {activeProvider.fields.map((field) => (
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
                      setCashierError(null);
                      setCashierSaved(false);
                    }}
                    placeholder={field.placeholder}
                    className="input w-full"
                  />
                  <p className="text-meta text-fg-tertiary">Где взять: {field.help}</p>
                </div>
              ))}
              {cashierError && (
                <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-body-sm text-danger">
                  {cashierError}
                </p>
              )}
              {cashierSaved && (
                <p className="flex items-center gap-1.5 text-body-sm text-success">
                  <Check className="size-4" aria-hidden="true" /> Касса подключена
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button size="md" disabled={!allFilled || isSavingCashier} onClick={() => void saveCashier()}>
                  {isSavingCashier ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
                  ) : cashierSaved ? (
                    <Check className="size-4" data-icon="inline-start" aria-hidden />
                  ) : null}
                  {isSavingCashier ? 'Сохраняем…' : cashierSaved ? 'Подключено' : hasCashier ? 'Сохранить ключи' : 'Подключить кассу'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setKeys({});
                  }}
                  className="text-body-sm font-semibold text-fg-tertiary hover:text-fg-secondary"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Оферта: инлайн-поле ссылки, без модала ── */}
      <section className="flex flex-col gap-3" aria-label="Оферта">
        <div className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-fg-secondary">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-body font-bold">Оферта</p>
                <p className="text-meta text-fg-tertiary">Клиент принимает условия перед покупкой</p>
              </div>
            </div>
            {bot.offerUrl ? (
              <StatusBadge tone="success" label="Указана" />
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-micro font-medium text-fg-tertiary">Не указана</span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={offerUrl}
              onChange={(event) => { setOfferUrl(event.target.value); setOfferError(null); setOfferSaved(false); }}
              placeholder="https://example.com/oferta"
              className="input w-full flex-1"
              aria-label="Ссылка на оферту"
            />
            <Button
              size="md"
              disabled={isSavingOffer || offerUrl.trim() === (bot.offerUrl ?? '').trim()}
              onClick={() => void saveOffer()}
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
          {offerError && (
            <p className="mt-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-meta text-danger">
              {offerError}
            </p>
          )}
          <p className="mt-2 text-meta text-fg-tertiary">
            Ссылка на документ с условиями. Оставьте пустым — согласие спрашиваться не будет.
          </p>
        </div>
      </section>
    </div>
  );
}
