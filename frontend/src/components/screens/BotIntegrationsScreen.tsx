import { useState } from 'react';
import { BadgeCheck, Check, ExternalLink, FileText, KeyRound, Settings2 } from 'lucide-react';
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
  onOpenSettings: () => void;
}

function AccordionRow({
  icon,
  title,
  badge,
  subtitle,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  badge: React.ReactNode;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-fg-secondary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-body-lg font-bold text-fg-primary">{title}</span>
          {badge}
        </span>
        <span className="mt-0.5 block truncate text-meta text-fg-tertiary">{subtitle}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`size-4 shrink-0 text-fg-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function TelegramGlyph({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill={active ? '#ffffff' : 'currentColor'} aria-hidden="true" className={active ? '' : 'text-fg-tertiary'}>
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
export function BotIntegrationsScreen({ bot, onOpenSettings }: BotIntegrationsScreenProps) {
  const hasToken = Boolean(bot.username && bot.username !== '@unknown');
  const hasCashier = Boolean(bot.hasPaymentCredentials);
  const cashierName = bot.paymentProvider
    ? PROVIDERS.find((p) => p.id === bot.paymentProvider)?.name ?? bot.paymentProvider
    : '';

  const [connectOpen, setConnectOpen] = useState(!bot.mediaSyncDone);
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isSavingToken, setIsSavingToken] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [isSavingCashier, setIsSavingCashier] = useState(false);
  const [cashierError, setCashierError] = useState<string | null>(null);
  const [cashierSaved, setCashierSaved] = useState(false);

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

      {/* ── 1. Платформы ── */}
      <section className="flex flex-col gap-3" aria-label="Платформы">
        <article className={`flex flex-col rounded-[16px] border p-4 sm:p-5 ${hasToken ? 'border-primary/30 bg-accent' : 'border-border bg-card'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className={`flex size-14 shrink-0 items-center justify-center rounded-[16px] ${hasToken ? 'bg-[#229ED9] shadow-xs' : 'bg-muted'}`}>
              <TelegramGlyph active={hasToken} />
            </span>
            <StatusBadge tone={hasToken ? 'success' : 'warning'} label={hasToken ? 'Добавлен' : 'Не подключён'} />
          </div>
          <h3 className={`mt-3.5 text-body-lg font-bold ${hasToken ? '' : 'text-fg-tertiary'}`}>Telegram</h3>

          {hasToken ? (
            <p className="mt-0.5 truncate text-meta text-fg-secondary">{bot.username}</p>
          ) : tokenFormOpen ? (
            <div className="mt-3 space-y-2.5">
              <label htmlFor="tg-token" className="block text-body-sm font-medium text-fg-primary">
                Токен от @BotFather
              </label>
              <input
                id="tg-token"
                type="password"
                value={token}
                onChange={(event) => { setToken(event.target.value); setTokenError(null); }}
                placeholder="123456789:AA…"
                autoComplete="off"
                className="input w-full"
              />
              {tokenError && (
                <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-meta text-danger">
                  {tokenError}
                </p>
              )}
              <div className="flex items-center gap-2.5">
                <Button
                  size="sm"
                  disabled={!token.trim() || isSavingToken}
                  onClick={() => void saveToken()}
                >
                  {isSavingToken ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
                  ) : null}
                  {isSavingToken ? 'Подключаем…' : 'Подключить бота'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setTokenFormOpen(false); setToken(''); setTokenError(null); }}
                  className="text-body-sm font-semibold text-fg-tertiary hover:text-fg-secondary"
                >
                  Позже
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-meta text-fg-tertiary">Токен от @BotFather</p>
              <div className="mt-auto pt-3.5">
                <Button size="sm" onClick={() => setTokenFormOpen(true)}>
                  <KeyRound className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                  Вставить токен
                </Button>
              </div>
            </>
          )}
        </article>

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
              Подключение отдельно — со своими ключами
            </p>
          </article>
        ))}
      </section>

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
            <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-1.5">
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

        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${hasCashier ? 'opacity-55' : ''}`}>
          {PROVIDERS.map((provider) => {
            const isActiveCashier = hasCashier && bot.paymentProvider === provider.id;
            const isSelected = selectedProvider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                aria-pressed={isSelected}
                disabled={hasCashier && !isActiveCashier}
                onClick={() => {
                  setSelectedProvider(isSelected ? null : provider.id);
                  setKeys({});
                  setCashierError(null);
                  setCashierSaved(false);
                }}
                className={`flex flex-col rounded-[16px] border p-4 text-left transition-all ${
                  isActiveCashier
                    ? 'border-success/60 bg-success-soft/40'
                    : isSelected
                      ? 'border-primary/60 ring-2 ring-ring/20'
                      : 'border-border bg-card hover:border-fg-tertiary/50'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex size-12 items-center justify-center rounded-[14px] bg-white shadow-xs dark:bg-white/95">
                    <img src={provider.logo} alt={provider.name} className="size-8 object-contain" />
                  </span>
                  {isActiveCashier ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-success text-white">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : isSelected ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 block text-body font-bold">{provider.name}</span>
                <span className="mt-1 block text-meta leading-relaxed text-fg-secondary">{provider.desc}</span>
              </button>
            );
          })}
        </div>

        {!hasCashier && activeProvider && (
          <div className="rounded-[16px] border border-border bg-card p-5">
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
                  {isSavingCashier ? 'Сохраняем…' : cashierSaved ? 'Подключено' : 'Подключить кассу'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setKeys({});
                  }}
                  className="text-body-sm font-semibold text-fg-tertiary hover:text-fg-secondary"
                >
                  Позже
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Подключение бота (после токена/кассы) ── */}
      <section className="flex flex-col gap-3" aria-label="Подключение">
        <AccordionRow
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          title="Подключение бота"
          badge={
            bot.mediaSyncDone
              ? <StatusBadge tone="success" label="Синхронизирован" />
              : <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-micro font-bold text-warning">Нажмите START в боте</span>
          }
          subtitle="Последний шаг: синхронизируйте бота с платформой"
          open={connectOpen}
          onToggle={() => setConnectOpen((v) => !v)}
        />
        {connectOpen && (
          <div className="rounded-[16px] border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-md text-body-sm leading-relaxed text-fg-secondary">
                Откройте своего бота в Telegram и нажмите <b className="text-fg-primary">START</b> —
                мы синхронизируем сценарий, медиа и подключим webhook.
              </p>
              {bot.botUrl && (
                <a
                  href={bot.botUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-[#229ED9] px-5 text-body-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:translate-y-px"
                >
                  Открыть бота в Telegram
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 4. Оферта ── */}
      <section className="flex flex-col gap-3" aria-label="Оферта">
        <AccordionRow
          icon={<FileText className="size-4" aria-hidden="true" />}
          title="Оферта"
          badge={
            bot.offerUrl
              ? <StatusBadge tone="success" label="Заполнена" />
              : <span className="rounded-full bg-muted px-2.5 py-0.5 text-micro font-medium text-fg-tertiary">Не указана</span>
          }
          subtitle="Ссылка на условия — клиент принимает их перед покупкой"
          open={false}
          onToggle={() => onOpenSettings()}
        />
      </section>
    </div>
  );
}
