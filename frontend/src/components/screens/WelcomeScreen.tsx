import { motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  Check,
  CreditCard,
  Link2,
  MessageCircleMore,
  Send,
  UserRound,
} from 'lucide-react';
import { PlatformGlyph } from '../common/platform';

interface WelcomeScreenProps {
  onCreateBot: () => void;
}

const scrollToHow = () => {
  document.getElementById('welcome-how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const scenarios = [
  {
    img: '/visuals/welcome/scenario-courses.jpg',
    alt: 'Бот отправил ключ доступа — оплата курса прошла, доступ открыт',
    title: 'Курсы и каналы',
    hook: 'Продаёте курс, доступ в закрытый канал или гайд — бот примет оплату и выдаст доступ сам.',
    self: 'оплатили → вот ссылка на урок',
  },
  {
    img: '/visuals/welcome/scenario-booking.jpg',
    alt: 'Календарь с выбранной датой — бот записал клиента на слот',
    title: 'Запись и консультации',
    hook: 'Репетиторы, психологи, юристы: бот расскажет про услугу, запишет на слот и напомнит.',
    self: 'записал на вторник, 18:00',
  },
  {
    img: '/visuals/welcome/scenario-shop.jpg',
    alt: 'Телефон с каталогом, пакет и карта — заказ и оплата в боте',
    title: 'Магазины и каталог',
    hook: 'Покажите товары карточками и принимайте оплату на свою кассу — без сайта и маркетплейсов.',
    self: 'заказ принят, счёт отправлен',
  },
  {
    img: '/visuals/welcome/scenario-brief.jpg',
    alt: 'Чек-лист брифа с отметками и бумажный самолётик — заявка собрана',
    title: 'Заявки и брифинг',
    hook: 'Ателье, студии, подрядчики: бот задаст нужные вопросы и соберёт готовую заявку с контактами.',
    self: 'заявка №42 у вас в BotFlow',
  },
];

const includedItems = [
  'Готовые сценарии продаж',
  'Без лимита сообщений',
  'Оплата на вашу кассу',
  'Рассылки по аудитории',
  'Заявки и выдача результата',
  'Статистика и аналитика',
];

const platformItems = [
  { id: 'telegram' as const, name: 'Telegram', state: 'on' as const },
  { id: 'vk' as const, name: 'VK', state: 'soon' as const },
  { id: 'max' as const, name: 'MAX', state: 'soon' as const },
];

/** Полноэкранный первый вход: ценность продукта, путь клиента и деньги — до создания бота. */
export function WelcomeScreen({ onCreateBot }: WelcomeScreenProps) {
  const reduce = useReducedMotion();

  return (
    <section className="relative flex min-h-full w-full flex-col overflow-hidden bg-background">
      <div aria-hidden className="w-atmo" />

      <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-border px-5 sm:px-8">
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

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-8">
        {/* ── Hero ── */}
        <div className="mx-auto max-w-3xl pt-10 text-center sm:pt-14">
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-fg-secondary shadow-[var(--shadow-xs)]"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--success-soft)]" />
            Готовые боты для продаж в Telegram
          </motion.span>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.05 }}
            className="mt-6 text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-[56px]"
          >
            Готовый бот, который{' '}
            <span className="text-gradient">продаёт за&nbsp;вас</span>
          </motion.h1>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.08 }}
            className="mt-4 flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--v-100)] px-4 py-2 text-sm font-bold text-[var(--v-600)]">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--v-500)]" />
              Черновик — 0 ₽
            </span>
          </motion.div>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-body-lg leading-relaxed text-fg-secondary"
          >
            Не нужно рисовать схемы, разбираться в конструкторах или кодить.
            Выберите готовый сценарий, ответьте на вопросы — и бот примет оплату
            в Telegram. Без лимитов на сообщения.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.15 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <button
              type="button"
              onClick={onCreateBot}
              className="bg-ink text-ink inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-body font-bold shadow-[var(--shadow-card)] transition-all hover:opacity-90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              Создать бота бесплатно
              <Send className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={scrollToHow}
              className="inline-flex min-h-14 w-full items-center justify-center rounded-full border border-border bg-card px-7 text-body font-bold text-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              Как это работает
            </button>
          </motion.div>

          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-meta text-fg-tertiary">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            <span>Настройка за пару минут · <b className="font-semibold text-fg-secondary">платёж только перед публикацией</b></span>
          </p>
        </div>

        {/* ── Сцена: телефон + орбита + UI-стейты ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-stage"
          role="img"
          aria-label="Сцена продукта: телефон с чатом продажи — бот получил оплату 1 500 рублей; вокруг карточки событий и панели конструктора и статистики"
        >
          <div aria-hidden className="w-glow" />

          <div aria-hidden className="w-ring w-ring-1">
            <svg viewBox="0 0 620 620" fill="none">
              <circle cx="310" cy="310" r="308" stroke="var(--p-300)" strokeWidth="2" strokeDasharray="1 13" strokeLinecap="round" opacity="0.55" />
            </svg>
            <span className="w-sat" style={{ '--a': '40deg' } as React.CSSProperties} />
            <span className="w-sat w-sat-sm" style={{ '--a': '205deg' } as React.CSSProperties} />
          </div>
          <div aria-hidden className="w-ring w-ring-2">
            <svg viewBox="0 0 525 525" fill="none">
              <circle cx="262.5" cy="262.5" r="261" stroke="var(--v-300)" strokeWidth="2" strokeDasharray="1 11" strokeLinecap="round" opacity="0.5" />
            </svg>
            <span className="w-sat w-sat-violet" style={{ '--a': '130deg' } as React.CSSProperties} />
          </div>

          <div aria-hidden className="w-link-line w-link-l" />
          <div aria-hidden className="w-link-line w-link-r" />

          {/* UI-стейт: конструктор */}
          <div className="w-side w-side-l" aria-hidden="true">
            <span className="w-side-bob block -rotate-3 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-float)]">
              <span className="flex items-center gap-2 font-accent text-[10px] font-medium uppercase tracking-[0.12em] text-fg-tertiary">
                <span className="size-2 rounded-full bg-gradient-to-r from-[var(--p-500)] to-[var(--v-500)]" />
                BotFlow · Конструктор
              </span>
              {[
                ['Сценарий:', 'консультация'],
                ['Цена:', '1 500 ₽'],
                ['Касса:', 'ЮKassa'],
              ].map(([label, value]) => (
                <span key={label} className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-fg-secondary">
                  <span className="flex size-4.5 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="size-2.5" aria-hidden="true" />
                  </span>
                  {label} <b className="font-bold text-foreground">{value}</b>
                </span>
              ))}
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">
                <Check className="size-2.5" aria-hidden="true" />
                Бот готов — публикуйте
              </span>
            </span>
          </div>

          {/* UI-стейт: статистика */}
          <div className="w-side w-side-r" aria-hidden="true">
            <span className="w-side-bob block rotate-2 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-float)]">
              <span className="flex items-center gap-2 font-accent text-[10px] font-medium uppercase tracking-[0.12em] text-fg-tertiary">
                <span className="size-2 rounded-full bg-gradient-to-r from-[var(--p-500)] to-[var(--v-500)]" />
                Продажи · 7 дней
              </span>
              <span className="mt-2 block font-accent text-[26px] font-semibold leading-none tabular-nums text-foreground">
                18 000 ₽ <small className="font-sans text-[12px] font-medium text-fg-tertiary">выручка</small>
              </span>
              <span className="mt-2 inline-flex rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">
                +12 продаж
              </span>
              <span className="mt-3 flex items-end gap-1.5" style={{ height: 44 }}>
                {[30, 45, 38, 60, 52, 78, 100].map((h, i) => (
                  <i
                    key={i}
                    className={`flex-1 rounded-md ${i === 6 ? 'bg-gradient-to-b from-[var(--p-500)] to-[var(--v-500)]' : 'bg-[var(--p-300)] opacity-50'}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </span>
            </span>
          </div>

          {/* Телефон с чатом продажи */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-phone"
            aria-hidden="true"
          >
            <div className="w-screen">
              <div className="flex items-center justify-between px-5 pb-1.5 pt-3 text-[12.5px] font-bold text-[#10141c] dark:text-[#e8ecf4]">
                <span>9:41</span>
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <i className="block h-2.5 w-3.5 rounded-[3px] bg-current opacity-80" />
                  <i className="block h-2.5 w-4 rounded-[3px] border border-current opacity-50" />
                </span>
              </div>
              <div className="flex items-center gap-2.5 border-b border-black/5 px-4 pb-2.5 pt-1.5 dark:border-white/10">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--p-500)] to-[var(--v-500)] text-white">
                  <Bot className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[13px] font-bold leading-tight text-[#10141c] dark:text-[#e8ecf4]">Бот продаж</p>
                  <p className="text-[10.5px] text-[#8a94a6]">бот</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 pb-2 pt-3">
                <p className="max-w-[84%] self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[12.3px] leading-snug text-[#10141c] shadow-[0_1px_2px_rgb(16_24_40/0.08)] dark:bg-[#1c232f] dark:text-[#e8ecf4]">
                  Здравствуйте! Хочу записаться на консультацию
                  <span className="float-right ml-2 mt-1.5 text-[9px] text-[#98a2b3]">09:41</span>
                </p>
                <p className="max-w-[84%] self-end rounded-2xl rounded-br-sm bg-[#4a8df8] px-3 py-2 text-[12.3px] leading-snug text-white shadow-[0_2px_6px_rgb(37_99_235/0.28)]">
                  Консультация — 1 500 ₽. Оформляю?
                  <span className="float-right ml-2 mt-1.5 text-[9px] text-white/80">09:41</span>
                </p>
                <p className="max-w-[84%] self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[12.3px] leading-snug text-[#10141c] shadow-[0_1px_2px_rgb(16_24_40/0.08)] dark:bg-[#1c232f] dark:text-[#e8ecf4]">
                  Да, давайте!
                  <span className="float-right ml-2 mt-1.5 text-[9px] text-[#98a2b3]">09:41 ✓✓</span>
                </p>
                <div className="flex items-center gap-2.5 self-stretch rounded-2xl border border-[#c4ead2] bg-[#e9f9ee] px-3 py-2.5 dark:border-[rgb(60_203_127/0.3)] dark:bg-[rgb(60_203_127/0.12)]">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#22a05c] text-white">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-extrabold leading-tight text-[#12683b] dark:text-[#3ccb7f]">Оплата прошла</p>
                    <p className="text-[11px] text-[#4e8b68] dark:text-[rgb(60_203_127/0.75)]">Чек отправлен вам</p>
                  </div>
                  <span className="font-accent ml-auto whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-[#168a55] dark:text-[#3ccb7f]">
                    +1 500 ₽
                  </span>
                </div>
              </div>
              <div className="mx-3 mb-3.5 flex items-center justify-between rounded-full bg-white px-3.5 py-2 text-[12px] text-[#93a0b4] shadow-[0_1px_2px_rgb(16_24_40/0.08)] dark:bg-[#1c232f]">
                <span>Сообщение…</span>
                <MessageCircleMore className="size-3.5" aria-hidden="true" />
              </div>
            </div>
          </motion.div>

          {/* Орбитальные карточки */}
          <OrbCard className="w-orb-a" tone="green" dur="7s" delay="0.9s"
            icon={<Check className="size-3.5" aria-hidden="true" />}
            title="Оплата прошла" sub="деньги на вашей кассе" num="+1 500 ₽" />
          <OrbCard className="w-orb-r2 w-orb-b" tone="blue" dur="8s" delay="1.05s"
            icon={<UserRound className="size-3.5" aria-hidden="true" />}
            title="Новая заявка" sub="бот собрал контакты" />
          <OrbCard className="w-orb-c" tone="violet" dur="6.5s" delay="1.2s"
            icon={<CalendarGlyph />}
            title="Запись подтверждена" sub="вторник, 18:00" />
          <OrbCard className="w-orb-r2 w-orb-d" tone="pink" dur="7.5s" delay="1.35s"
            icon={<Link2 className="size-3.5" aria-hidden="true" />}
            title="Доступ выдан" sub="автоматически" />
        </motion.div>

        {/* ── Путь клиента ── */}
        <div
          className="flex flex-wrap items-center justify-center gap-2.5 pb-14 pt-2"
          aria-label="Путь клиента"
        >
          <FlowPill icon={<UserRound className="size-4" aria-hidden="true" />}>Клиент пишет</FlowPill>
          <FlowArrow />
          <FlowPill icon={<Bot className="size-4" aria-hidden="true" />}>Бот отвечает и продаёт</FlowPill>
          <FlowArrow />
          <FlowPill icon={<CreditCard className="size-4" aria-hidden="true" />}>Оплата на вашей кассе</FlowPill>
          <FlowArrow />
          <FlowPill result icon={<Check className="size-4" aria-hidden="true" />}>
            Заявка и выдача — сами
          </FlowPill>
        </div>

        {/* ── Сценарии ── */}
        <section className="pb-20" aria-labelledby="welcome-scenarios-title">
          <SectionHead
            kicker="Это про вас"
            title={
              <>
                Готовые сценарии <span className="text-gradient">под вашу задачу</span>
              </>
            }
            sub="Не конструктор «нарисуй сам» — а собранное решение: выберите сценарий, добавьте свои цены и тексты. Всё остальное бот делает сам."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {scenarios.map((item) => (
              <article
                key={item.title}
                className="flex flex-col rounded-[20px] border border-border bg-card p-3 pb-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-float)]"
              >
                <img
                  src={item.img}
                  alt={item.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-2xl object-cover dark:brightness-95"
                />
                <h3 className="mt-4 px-2 text-body font-bold tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-2 px-2 text-body-sm leading-relaxed text-fg-secondary">{item.hook}</p>
                <p className="mt-auto px-2 pt-4 text-meta text-fg-tertiary">
                  <b className="font-semibold text-success">Бот сам:</b> «{item.self}»
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Как это работает ── */}
        <section
          id="welcome-how"
          className="scroll-mt-6 rounded-[var(--radius-sheet)] border border-border bg-muted px-5 py-10 sm:px-8 sm:py-12"
          aria-labelledby="welcome-how-title"
        >
          <div className="mx-auto max-w-xl text-center">
            <p className="font-accent text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Как это работает
            </p>
            <h2 id="welcome-how-title" className="mt-4 text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
              От идеи до бота — <span className="text-gradient">три шага</span>
            </h2>
            <p className="mt-4 text-body leading-relaxed text-fg-secondary">
              Никакого кода, серверов и API. Всё настраивается в браузере, а бот работает в Telegram уже сегодня.
            </p>
          </div>

          <ol className="mt-10 grid gap-8 lg:grid-cols-3">
            <HowStep num={1} title="Выберите готовый сценарий">
              Продажа курса, запись, каталог или заявки — собранное решение, а не пустая схема «придумай сам».
            </HowStep>
            <HowStep num={2} title="Ответьте на вопросы">
              Свои цены, тексты и касса — в понятном редакторе. Черновик можно тестировать бесплатно.
            </HowStep>
            <HowStep num={3} title="Опубликуйте в Telegram" price="Черновик — 0 ₽">
              Подключите бота — и он начнёт работать с клиентами. Подписка бота — 990 ₽/мес после публикации.
            </HowStep>
          </ol>
        </section>

        {/* ── Цена ── */}
        <section className="pt-20" aria-labelledby="welcome-price-title">
          <SectionHead
            kicker="Цена"
            title={
              <>
                Платите за бота, <span className="text-gradient">а не за продажи</span>
              </>
            }
            sub="Одна подписка. Сколько бы клиентов ни пришло и сколько бы сообщений бот ни отправил — цена не меняется. Лимитов нет."
          />

          <div className="mx-auto mt-12 grid max-w-4xl overflow-hidden rounded-[24px] border border-[color-mix(in_srgb,var(--p-300)_45%,transparent)] shadow-[var(--shadow-float)] lg:grid-cols-[1.12fr_1fr]">
            <div
              className="p-7 sm:p-10"
              style={{
                background:
                  'linear-gradient(135deg, var(--p-100), var(--v-100) 55%, var(--pk-100, #fdf2f8))',
              }}
            >
              <p className="font-accent text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                Подписка бота
              </p>
              <p className="mt-3 font-accent text-[44px] font-bold leading-none tracking-[-0.01em] tabular-nums text-foreground sm:text-[56px]">
                990 ₽ <span className="align-baseline font-sans text-base font-semibold tracking-normal text-fg-secondary">/ мес</span>
              </p>
              <p className="mt-4 max-w-sm text-body-sm leading-relaxed text-fg-secondary">
                Фиксированная цена публикации. Растёт бизнес — растут продажи, а счёт остаётся тем же.
              </p>
              <div className="mt-6" role="img" aria-label="При 5 продажах — 990 рублей в месяц, при 500 — тоже 990, доплаты за сообщения нет">
                <PriceRow label="Первые 5 продаж" value="990 ₽/мес" />
                <PriceRow label="500 продаж в месяц" value="990 ₽/мес" same />
                <PriceRow label="Доплата за сообщения и клиентов" value="0 ₽" same />
              </div>
            </div>

            <div className="border-t border-border bg-card p-7 sm:p-10 lg:border-l lg:border-t-0">
              <p className="font-accent text-[11px] font-medium uppercase tracking-[0.14em] text-fg-tertiary">
                Всё включено
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {includedItems.map((item) => (
                  <li key={item} className="inline-flex items-center gap-2 text-body-sm font-medium text-fg-secondary">
                    <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {['ЮKassa', 'Robokassa', 'Prodamus'].map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1.5 text-micro font-semibold text-fg-secondary"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={onCreateBot}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-body-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Создать бота бесплатно
                <Send className="size-4" aria-hidden="true" />
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-meta text-fg-tertiary">
                <Check className="size-3.5 text-success" aria-hidden="true" />
                Черновик — 0 ₽ · платёж только перед публикацией
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {platformItems.map((item) => (
              <span
                key={item.id}
                className={`inline-flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-body-sm font-semibold shadow-[var(--shadow-xs)] ${
                  item.state === 'on'
                    ? 'border-border bg-card text-fg-secondary'
                    : 'border-border bg-card text-fg-tertiary opacity-75'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex size-7 items-center justify-center rounded-full ${
                    item.state === 'on' ? 'bg-accent text-accent-foreground' : 'bg-muted text-fg-tertiary'
                  }`}
                >
                  <PlatformGlyph platform={item.id} size={14} />
                </span>
                {item.name}
                {item.state === 'on' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-micro font-semibold text-success">
                    <Check className="size-2.5" aria-hidden="true" />
                    Доступен
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-semibold text-fg-tertiary">
                    Скоро
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section
          className="mt-20 rounded-[var(--radius-sheet)] border border-[color-mix(in_srgb,var(--p-300)_40%,transparent)] px-6 py-14 text-center shadow-[var(--shadow-float)] sm:px-12"
          style={{
            background:
              'radial-gradient(560px 320px at 82% 0%, rgb(37 99 235 / 0.12), transparent 70%), radial-gradient(520px 300px at 12% 100%, rgb(124 58 237 / 0.10), transparent 72%), linear-gradient(135deg, var(--p-100), var(--v-100) 55%, var(--pk-100, #fdf2f8))',
          }}
        >
          <h2 className="mx-auto max-w-xl text-2xl font-extrabold leading-tight tracking-[-0.03em] text-foreground sm:text-4xl">
            Готовый бот — за пару минут, <span className="text-gradient">без схем и кода</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-fg-secondary">
            Выберите сценарий и добавьте свои цены. Черновик бесплатен — публикация только когда бот готов.
          </p>
          <button
            type="button"
            onClick={onCreateBot}
            className="bg-ink text-ink mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-body font-bold shadow-[var(--shadow-card)] transition-all hover:opacity-90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
          >
            Создать бота бесплатно
            <Send className="size-4" aria-hidden="true" />
          </button>
          <p className="mt-4 inline-flex items-center gap-2 text-meta text-fg-tertiary">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            Настройка, тесты и сценарий — 0 ₽
          </p>
        </section>
      </main>
    </section>
  );
}

/* ── Вспомогательные блоки ─────────────────────────────────── */

function SectionHead({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-accent text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
        {kicker}
      </p>
      <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-[-0.03em] text-foreground sm:text-[32px]">
        {title}
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-body leading-relaxed text-fg-secondary">{sub}</p>
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

const orbTone: Record<'green' | 'blue' | 'violet' | 'pink', string> = {
  green: 'bg-success-soft text-success',
  blue: 'bg-accent text-accent-foreground',
  violet: 'bg-[var(--v-100)] text-[var(--v-600)]',
  pink: 'bg-warning-soft text-warning',
};

function OrbCard({
  className,
  tone,
  dur,
  delay,
  icon,
  title,
  sub,
  num,
}: {
  className: string;
  tone: 'green' | 'blue' | 'violet' | 'pink';
  dur: string;
  delay: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  num?: string;
}) {
  return (
    <div className={`w-orb ${className}`} aria-hidden="true">
      <span className="w-orb-bob" style={{ '--dur': dur, '--delay': delay } as React.CSSProperties}>
        <span className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-[var(--shadow-chip)] whitespace-nowrap">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${orbTone[tone]}`}>
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold leading-tight text-foreground">{title}</span>
            <span className="block text-[11px] font-medium text-fg-tertiary">{sub}</span>
          </span>
          {num && <span className="font-accent ml-1 text-[12px] font-semibold tabular-nums text-success">{num}</span>}
        </span>
      </span>
    </div>
  );
}

function PriceRow({ label, value, same }: { label: string; value: string; same?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t-2 border-dashed border-[color-mix(in_srgb,var(--border-strong)_80%,transparent)] py-2.5 text-body-sm text-fg-secondary first:border-t-0 first:pt-0">
      <span>{label}</span>
      <b className={`font-accent shrink-0 whitespace-nowrap text-[13.5px] font-semibold tabular-nums ${same ? 'text-success' : 'text-foreground'}`}>
        {value}
      </b>
    </div>
  );
}

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
    <li className="relative lg:pt-0">
      <span
        aria-hidden
        className="font-accent bg-ink text-ink relative z-[1] flex size-10 items-center justify-center rounded-full text-[14px] font-semibold shadow-[var(--shadow-card)]"
      >
        {num}
      </span>
      <h3 className="mt-4 text-body font-bold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-xs text-body-sm leading-relaxed text-fg-secondary lg:max-w-none">{children}</p>
      {price && (
        <span className="mt-3 inline-flex rounded-full bg-success-soft px-3 py-1 text-micro font-semibold text-success">
          {price}
        </span>
      )}
    </li>
  );
}
