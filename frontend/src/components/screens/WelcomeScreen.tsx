import { motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  Check,
  CreditCard,
  Link2,
  MessageCircleMore,
  Plus,
  Rocket,
  Send,
  Tag,
  UserRound,
} from 'lucide-react';
import { PlatformGlyph } from '../common/platform';

interface WelcomeScreenProps {
  onCreateBot: () => void;
}

const scrollToHow = () => {
  document.getElementById('welcome-how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Полноэкранный первый вход: ценность продукта, путь клиента и деньги — до создания бота. */
export function WelcomeScreen({ onCreateBot }: WelcomeScreenProps) {
  return (
    <section className="flex min-h-full w-full flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-5 sm:px-8 lg:px-12">
        <div className="inline-flex items-center gap-2.5 text-body-sm font-semibold text-foreground">
          <img
            src="/logo_BotFlow.png"
            alt="Логотип BotFlow"
            className="size-9 rounded-[var(--radius-control)] object-cover"
          />
          BotFlow
        </div>
        <span className="hidden text-meta text-fg-secondary sm:inline">
          Продажи в мессенджерах
        </span>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 sm:px-8 lg:px-12">
        {/* ── Hero ── */}
        <div className="grid items-center gap-14 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-16 lg:py-20 lg:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-micro font-semibold uppercase tracking-wide text-accent-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              Конструктор ботов для бизнеса
            </span>
            <h1 className="mt-5 text-display font-bold tracking-tight text-foreground sm:text-display-xl">
              Ваш бот, который <span className="text-primary">принимает заявки и продаёт</span> — без разработчика
            </h1>
            <p className="mt-4 max-w-xl text-body leading-relaxed text-fg-secondary">
              BotFlow — это место, где вы сами собираете рабочего бота: он отвечает клиентам,
              показывает предложение, принимает оплату и выдаёт результат. Настройка — в пару кликов.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onCreateBot}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Rocket className="size-4" aria-hidden="true" />
                Создать бота
              </button>
              <button
                type="button"
                onClick={scrollToHow}
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border bg-card px-5 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Посмотреть возможности
              </button>
            </div>
            <p className="mt-4 inline-flex items-center gap-2 text-meta text-fg-tertiary">
              <Check className="size-3.5 text-success" aria-hidden="true" />
              Черновик бота бесплатен · платите только за публикацию
            </p>
          </motion.div>

          <HeroVisual />
        </div>

        {/* ── Путь клиента ── */}
        <div
          className="flex flex-wrap items-center gap-2.5 pb-12 lg:justify-center"
          aria-label="Путь клиента"
        >
          <FlowPill icon={<UserRound className="size-4" aria-hidden="true" />}>Клиент пишет</FlowPill>
          <FlowArrow />
          <FlowPill icon={<Bot className="size-4" aria-hidden="true" />}>Бот отвечает</FlowPill>
          <FlowArrow />
          <FlowPill icon={<CreditCard className="size-4" aria-hidden="true" />}>Оплата на вашей кассе</FlowPill>
          <FlowArrow />
          <FlowPill result icon={<Check className="size-4" aria-hidden="true" />}>
            Заявка и выдача — автоматически
          </FlowPill>
        </div>

        {/* ── Как это работает ── */}
        <section
          id="welcome-how"
          className="scroll-mt-6 rounded-[var(--radius-sheet)] border border-border bg-muted px-5 py-10 sm:px-8 sm:py-12"
          aria-labelledby="welcome-how-title"
        >
          <div className="max-w-xl">
            <p className="text-micro font-semibold uppercase tracking-wide text-accent-foreground">
              Как это работает
            </p>
            <h2 id="welcome-how-title" className="mt-3 text-title-lg font-bold tracking-tight text-foreground">
              От идеи до работающего бота — три шага
            </h2>
            <p className="mt-3 text-body leading-relaxed text-fg-secondary">
              Никакого кода, серверов и API. Всё настраивается в браузере, а бот работает в Telegram уже сегодня.
            </p>
          </div>

          <ol className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-8">
            <HowStep num={1} title="Опишите задачу">
              Выберите сценарий и назовите бота. Например: «магазин одежды», «запись в студию», «консультации».
            </HowStep>
            <HowStep num={2} title="Настройте сценарий">
              Сообщения, предложение, цены, касса и выдача — в понятном редакторе. Черновик можно тестировать бесплатно.
            </HowStep>
            <HowStep num={3} title="Опубликуйте в Telegram" price="Черновик — 0 ₽">
              Подключите бота — и он начнёт работать с клиентами. Подписка бота — 990 ₽/мес после публикации.
            </HowStep>
          </ol>
        </section>

        {/* ── Почему BotFlow ── */}
        <section className="mt-16 sm:mt-20" aria-labelledby="welcome-why-title">
          <div className="max-w-xl">
            <p className="text-micro font-semibold uppercase tracking-wide text-accent-foreground">
              Почему BotFlow
            </p>
            <h2 id="welcome-why-title" className="mt-3 text-title-lg font-bold tracking-tight text-foreground">
              Одна понятная подписка вместо растущих счетов
            </h2>
            <p className="mt-3 text-body leading-relaxed text-fg-secondary">
              Вы платите за бота, а не за то, сколько клиентов к нему пришло и сколько сообщений он отправил.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PriceCard />
            <DraftCard />
            <GatewaysCard />
            <PlatformsCard />
            <IncludedCard />
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section
          className="mt-16 rounded-[var(--radius-sheet)] border border-border px-6 py-12 text-center sm:mt-20 sm:px-12 sm:py-16"
          style={{
            background:
              'radial-gradient(520px 300px at 85% 0%, var(--accent), transparent 70%), var(--muted)',
          }}
        >
          <h2 className="text-title-lg font-bold tracking-tight text-foreground sm:text-display">
            Соберите первого бота за пару минут
          </h2>
          <p className="mx-auto mt-3 max-w-md text-body leading-relaxed text-fg-secondary">
            Черновик бесплатен. Опубликуете, когда бот будет готов принимать клиентов.
          </p>
          <div className="mt-8">
            <button
              type="button"
              onClick={onCreateBot}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              <Plus className="size-4" aria-hidden="true" />
              Создать бота
            </button>
          </div>
        </section>
      </main>
    </section>
  );
}

/* ── Hero: карточка бота + живое Telegram-превью ───────────── */

function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, delay: 0.06 }}
      className="relative pb-24 sm:pb-16 lg:min-h-[480px] lg:pb-0"
      aria-label="Пример бота: сценарий воронки продаж в Telegram"
    >
      <span className="absolute -top-4 left-0 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-micro font-semibold text-foreground shadow-[var(--shadow-float)]">
        <Check className="size-3.5 text-success" aria-hidden="true" />
        Заявка и оплата прошли
      </span>

      <article className="relative z-[2] w-full overflow-hidden rounded-[var(--radius-sheet)] border border-border bg-card shadow-[var(--shadow-float)] lg:ml-auto lg:mb-32 lg:w-[420px]">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-body-sm font-bold text-accent-foreground"
          >
            АЛ
          </span>
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-foreground">Ателье «Линия»</p>
            <p className="mt-0.5 text-meta text-fg-tertiary">Воронка продаж · Telegram</p>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-micro font-semibold text-fg-secondary">
            <span aria-hidden className="size-1.5 rounded-full bg-fg-tertiary" />
            Черновик
          </span>
        </header>

        <div className="p-2">
          <BotStep tone="accent" icon={<MessageCircleMore className="size-4" aria-hidden="true" />} name="Приветствие" hint="Первое сообщение новому клиенту" state="Готово" done />
          <BotStep tone="success" icon={<Tag className="size-4" aria-hidden="true" />} name="Предложение" hint="Консультация 30 мин — 1 500 ₽" state="Готово" done />
          <BotStep tone="primary" icon={<CreditCard className="size-4" aria-hidden="true" />} name="Оплата" hint="Касса: ЮKassa · подключена" state="Готово" done />
          <BotStep tone="warning" icon={<Link2 className="size-4" aria-hidden="true" />} name="Выдача" hint="Ссылка на запись после оплаты" state="1 шаг" />
        </div>

        <footer className="border-t border-border px-5 py-3 text-right text-meta text-fg-secondary">
          Публикация — <strong className="font-semibold text-foreground">990 ₽/мес</strong>
        </footer>
      </article>

      <ChatPreview />
    </motion.div>
  );
}

const stepTone: Record<'accent' | 'success' | 'primary' | 'warning', string> = {
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success-soft text-success',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning-soft text-warning',
};

function BotStep({
  tone,
  icon,
  name,
  hint,
  state,
  done,
}: {
  tone: 'accent' | 'success' | 'primary' | 'warning';
  icon: React.ReactNode;
  name: string;
  hint: string;
  state: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 transition-colors hover:bg-muted">
      <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] ${stepTone[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-foreground">{name}</p>
        <p className="mt-px text-meta text-fg-tertiary">{hint}</p>
      </div>
      <span className={`ml-auto shrink-0 text-micro font-semibold ${done ? 'text-success' : 'text-fg-tertiary'}`}>
        {state}
      </span>
    </div>
  );
}

function ChatPreview() {
  const reduce = useReducedMotion();
  const base = reduce
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.aside
      initial={false}
      className="relative z-[3] -mt-14 ml-4 w-[min(330px,92%)] overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-float)] sm:-mt-10 lg:-bottom-20 lg:-left-2 lg:absolute lg:mt-0"
      aria-label="Как выглядит бот для клиента в Telegram"
    >
      <header className="flex items-center gap-2 border-b border-border bg-muted px-3.5 py-2.5 text-micro font-semibold text-fg-secondary">
        <Send className="size-3.5 text-accent-foreground" aria-hidden="true" />
        Превью в Telegram
      </header>
      <div className="flex flex-col gap-2.5 p-3.5">
        <motion.p
          {...base}
          transition={{ duration: 0.35, delay: reduce ? 0 : 0.5 }}
          className="max-w-[86%] self-start rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-body-sm leading-snug text-foreground shadow-[var(--shadow-xs)]"
        >
          Здравствуйте! Хочу записаться на консультацию
        </motion.p>
        <motion.p
          {...base}
          transition={{ duration: 0.35, delay: reduce ? 0 : 1.1 }}
          className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-body-sm leading-snug text-primary-foreground shadow-[var(--shadow-xs)]"
        >
          Отлично! Консультация — 30 минут, 1 500 ₽. Оформить запись?
        </motion.p>
        <motion.p
          {...base}
          transition={{ duration: 0.35, delay: reduce ? 0 : 1.7 }}
          className="flex items-center gap-2 self-end rounded-[var(--radius-control)] border border-success/25 bg-success-soft px-3 py-2 text-micro font-semibold text-success"
        >
          <Check className="size-3.5" aria-hidden="true" />
          Оплата прошла · ссылка отправлена
          <span className="ml-auto tabular-nums">+1 500 ₽</span>
        </motion.p>
      </div>
    </motion.aside>
  );
}

/* ── Путь клиента ──────────────────────────────────────────── */

function FlowPill({
  icon,
  result,
  children,
}: {
  icon: React.ReactNode;
  result?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-body-sm font-semibold shadow-[var(--shadow-xs)] ${
        result
          ? 'border-primary/25 bg-accent text-accent-foreground'
          : 'border-border bg-card text-fg-secondary'
      }`}
    >
      <span className={result ? '' : 'text-primary'}>{icon}</span>
      {children}
    </span>
  );
}

function FlowArrow() {
  return (
    <svg
      className="hidden size-4 shrink-0 text-fg-tertiary sm:block"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

/* ── Три шага ──────────────────────────────────────────────── */

function HowStep({
  num,
  title,
  price,
  children,
}: {
  num: number;
  title: string;
  price?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative border-t border-border pt-5 lg:border-t-0 lg:pt-0">
      <span
        aria-hidden
        className="relative z-[1] flex size-9 items-center justify-center rounded-full bg-primary text-body-sm font-bold text-primary-foreground shadow-[var(--shadow-float)]"
      >
        {num}
      </span>
      <h3 className="mt-4 text-body font-semibold tracking-tight text-foreground lg:mt-4">{title}</h3>
      <p className="mt-2 max-w-xs text-body-sm leading-relaxed text-fg-secondary lg:max-w-none">{children}</p>
      {price && (
        <span className="mt-3 inline-flex rounded-full bg-accent px-2.5 py-1 text-micro font-semibold text-accent-foreground">
          {price}
        </span>
      )}
    </li>
  );
}

/* ── Bento: почему BotFlow ─────────────────────────────────── */

function PriceCard() {
  return (
    <article className="flex flex-col rounded-[20px] border border-primary/25 bg-accent p-6 shadow-[var(--shadow-card)] sm:col-span-2 sm:row-span-2">
      <p className="text-micro font-semibold uppercase tracking-wide text-accent-foreground">
        Подписка бота
      </p>
      <p className="mt-2.5 text-[40px] font-bold leading-none tracking-tight tabular-nums text-accent-foreground sm:text-display-xl">
        990 ₽<span className="ml-1 align-baseline text-base font-semibold tracking-normal text-fg-secondary">/мес</span>
      </p>
      <p className="mt-3 text-body-sm leading-relaxed text-fg-secondary">
        Фиксированная цена публикации. Сколько бы клиентов ни пришло и сколько бы сообщений бот ни отправил — счёт не меняется.
      </p>

      <div
        className="mt-5 rounded-xl border border-primary/15 bg-background/60 p-4"
        role="img"
        aria-label="Схема: при обычной тарификации счёт растёт вместе с числом клиентов, подписка BotFlow остаётся на одном уровне"
      >
        <svg viewBox="0 0 320 88" fill="none" aria-hidden="true" className="w-full">
          <path d="M10 74 C 90 68, 150 52, 200 36 S 296 10, 310 8" stroke="var(--fg-tertiary)" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" />
          <path d="M10 40 H 310" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="310" cy="40" r="4" fill="var(--primary)" />
          <circle cx="310" cy="8" r="3" fill="var(--fg-tertiary)" />
        </svg>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-micro font-medium text-fg-secondary">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-fg-tertiary" />
            Оплата за клиентов и сообщения
          </span>
          <span className="inline-flex items-center gap-1.5 text-micro font-medium text-fg-secondary">
            <span aria-hidden className="h-0 w-4 border-t-2 border-primary" />
            Подписка BotFlow
          </span>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <PriceRow label="Первые клиенты и первые продажи" value="990 ₽/мес" />
        <PriceRow label="Сотни диалогов и заявок" value="990 ₽/мес" same />
        <PriceRow label="Доплата за сообщения или лидов" value="0 ₽" same />
      </div>
    </article>
  );
}

function PriceRow({ label, value, same }: { label: string; value: string; same?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/70 py-2.5 text-body-sm text-fg-secondary first:border-t-0">
      <span>{label}</span>
      <b className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${same ? 'text-success' : 'text-foreground'}`}>
        {value}
      </b>
    </div>
  );
}

function DraftCard() {
  return (
    <article className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
        <Rocket className="size-5" />
      </span>
      <p className="mt-3.5 text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Черновик</p>
      <h3 className="mt-1.5 text-body font-semibold tracking-tight text-foreground">
        Сначала попробуйте, потом платите
      </h3>
      <p className="mt-2 text-body-sm leading-relaxed text-fg-secondary">
        Настройте сценарий, кассу и выдачу бесплатно. Оплата нужна, только когда бот готов к публикации.
      </p>
    </article>
  );
}

function GatewaysCard() {
  return (
    <article className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <CreditCard className="size-5" />
      </span>
      <p className="mt-3.5 text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Приём оплаты</p>
      <h3 className="mt-1.5 text-body font-semibold tracking-tight text-foreground">
        Деньги приходят на вашу кассу
      </h3>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {['ЮKassa', 'Robokassa', 'Prodamus'].map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-micro font-semibold text-fg-secondary"
          >
            <Check className="size-3 text-success" aria-hidden="true" />
            {name}
          </span>
        ))}
      </div>
    </article>
  );
}

const platformItems: Array<{
  id: 'telegram' | 'vk' | 'max';
  name: string;
  desc: string;
  state: 'on' | 'soon';
}> = [
  { id: 'telegram', name: 'Telegram', desc: 'Воронка продаж: сообщения, оплата и выдача', state: 'on' },
  { id: 'vk', name: 'VK', desc: 'Те же сценарии для аудитории ВКонтакте', state: 'soon' },
  { id: 'max', name: 'MAX', desc: 'Публикация ботов на новой платформе', state: 'soon' },
];

function PlatformsCard() {
  return (
    <article className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:col-span-2">
      <p className="text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Платформы</p>
      <div className="mt-3.5">
        {platformItems.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 py-2.5 ${index > 0 ? 'border-t border-border/70' : ''}`}
          >
            <span
              aria-hidden
              className={`flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] ${
                item.state === 'on'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-fg-tertiary'
              }`}
            >
              <PlatformGlyph platform={item.id} size={16} />
            </span>
            <div className="min-w-0">
              <p className={`text-body-sm font-semibold ${item.state === 'on' ? 'text-foreground' : 'text-fg-secondary'}`}>
                {item.name}
              </p>
              <p className="mt-px text-meta text-fg-tertiary">{item.desc}</p>
            </div>
            <span className="ml-auto shrink-0">
              {item.state === 'on' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-micro font-semibold text-success">
                  <Check className="size-2.5" aria-hidden="true" />
                  Доступен
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-micro font-semibold text-fg-tertiary">
                  Скоро
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

const includedItems = [
  'Сообщения сценария',
  'Приём заявок',
  'Рассылки по аудитории',
  'Приём оплаты',
  'Статистика и аналитика',
  'Выдача результата',
];

function IncludedCard() {
  return (
    <article className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:col-span-2 lg:col-span-4 lg:flex lg:items-center lg:gap-8">
      <div className="lg:shrink-0 lg:max-w-[260px]">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Check className="size-5" />
        </span>
        <p className="mt-3.5 text-micro font-semibold uppercase tracking-wide text-fg-tertiary">Уже включено</p>
        <h3 className="mt-1.5 text-body font-semibold tracking-tight text-foreground">
          Всё для работы с клиентами — без доплат
        </h3>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:mt-0 lg:flex-1 lg:grid-cols-3">
        {includedItems.map((item) => (
          <li key={item} className="inline-flex items-center gap-2 text-body-sm font-medium text-fg-secondary">
            <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
