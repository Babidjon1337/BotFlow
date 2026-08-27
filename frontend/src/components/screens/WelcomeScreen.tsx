import { motion } from 'framer-motion';
import { ArrowRight, ClipboardList, MessageCircleMore, Rocket, Store } from 'lucide-react';
import { PlatformGlyph, type PlatformId } from '../common/platform';

interface WelcomeScreenProps {
  onCreateBot: () => void;
}

const platforms: Array<{ id: PlatformId; label: string }> = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'vk', label: 'VK' },
  { id: 'max', label: 'MAX' },
];

const scenarios = [
  {
    icon: MessageCircleMore,
    title: 'Воронка продаж',
    description: 'Сообщения, предложения и оплата.',
  },
  {
    icon: ClipboardList,
    title: 'Приём заявок',
    description: 'Заявки от клиентов в одном потоке.',
  },
  {
    icon: Store,
    title: 'Mini App',
    description: 'Витрина и интернет-магазин в мессенджере.',
  },
];

/** Первый экран Account Workspace, когда у аккаунта ещё нет ни одного бота. */
export function WelcomeScreen({ onCreateBot }: WelcomeScreenProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid overflow-hidden rounded-[var(--radius-sheet)] border border-border bg-card shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]"
      >
        <div className="flex flex-col items-start p-6 sm:p-8 lg:p-10">
          <h2 className="mt-5 max-w-xl text-title-lg font-semibold tracking-tight sm:text-title-xl">
            Соберите бота под свою задачу
          </h2>
          <p className="mt-3 max-w-xl text-body leading-relaxed text-fg-secondary">
            Выберите сценарий, подключите нужные площадки и подготовьте общение с клиентами в одном рабочем пространстве.
          </p>

          <div className="mt-6 w-full space-y-5">
            <div>
              <p className="text-meta font-medium text-fg-secondary">Площадки</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {platforms.map(({ id, label }) => (
                  <span key={id} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-muted px-3 text-body-sm font-medium text-foreground">
                    <PlatformGlyph platform={id} size={17} className="text-fg-secondary" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-meta font-medium text-fg-secondary">Сценарии</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {scenarios.map(({ icon: Icon, title, description }) => (
                  <article key={title} className="rounded-[var(--radius-card)] border border-border bg-muted p-3">
                    <span className="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-accent text-accent-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-body-sm font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-micro leading-relaxed text-fg-secondary">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onCreateBot}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              <Rocket className="size-4" aria-hidden="true" />
              Создать первого бота
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <p className="text-meta text-fg-secondary">Черновик создаётся бесплатно</p>
          </div>
        </div>

        <div className="flex min-h-64 items-center justify-center border-t border-border bg-muted p-6 lg:min-h-full lg:border-l lg:border-t-0">
          <img
            src="/visuals/scenarios/sales-funnel-card.png"
            alt="Иллюстрация воронки продаж"
            className="h-52 w-full max-w-72 object-contain sm:h-60"
          />
        </div>
      </motion.div>

    </section>
  );
}
