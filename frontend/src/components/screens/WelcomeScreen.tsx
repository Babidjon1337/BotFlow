import { motion } from 'framer-motion';
import { ArrowRight, Check, MessageCircleMore, RadioTower, Rocket } from 'lucide-react';

interface WelcomeScreenProps {
  onCreateBot: () => void;
}

const availableNow = [
  {
    icon: MessageCircleMore,
    title: 'Воронка продаж',
    description: 'Сообщения, заявки и предложения в одном сценарии.',
  },
  {
    icon: RadioTower,
    title: 'Telegram',
    description: 'Единственная доступная платформа в первой версии.',
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
          <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-body-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" />
            Доступно сейчас
          </span>
          <h2 className="mt-5 max-w-xl text-title-lg font-semibold tracking-tight sm:text-title-xl">
            Соберите первую воронку продаж
          </h2>
          <p className="mt-3 max-w-xl text-body leading-relaxed text-fg-secondary">
            Начните с Telegram-бота: настройте сценарий, подготовьте сообщения и подключите оплату, когда будете готовы к публикации.
          </p>

          <div className="mt-6 w-full divide-y divide-border rounded-[var(--radius-card)] border border-border bg-muted">
            {availableNow.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3 px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-accent-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-body-sm font-semibold text-foreground">{title}</span>
                  <span className="mt-0.5 block text-meta leading-relaxed text-fg-secondary">{description}</span>
                </span>
              </div>
            ))}
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

      <p className="px-1 text-meta leading-relaxed text-fg-tertiary">
        VK, MAX, приём заявок как отдельный сценарий и Mini App появятся позже.
      </p>
    </section>
  );
}
