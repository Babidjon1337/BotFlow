import { motion } from 'framer-motion';
import { ArrowRight, Megaphone, MessageCircleMore, Rocket, Store } from 'lucide-react';
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
  { icon: MessageCircleMore, title: 'Воронка продаж', text: 'Знакомит с предложением и ведёт клиента к оплате.' },
  { icon: Megaphone, title: 'Приём заявок', text: 'Собирает обращения и помогает не потерять клиента.' },
  { icon: Store, title: 'Mini App', text: 'Показывает каталог и помогает оформить заказ.' },
];

/** Полноэкранный первый вход: объясняет ценность продукта до перехода к созданию бота. */
export function WelcomeScreen({ onCreateBot }: WelcomeScreenProps) {
  return (
    <section className="flex min-h-full w-full flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-5 sm:px-8 lg:px-12">
        <div className="inline-flex items-center gap-2.5 text-body-sm font-semibold text-foreground">
          <img src="/logo_BotFlow.png" alt="Логотип BotFlow" className="size-9 rounded-[var(--radius-control)] object-cover" />
          BotFlow
        </div>
        <span className="hidden text-meta text-fg-secondary sm:inline">Продажи в мессенджерах</span>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:gap-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="max-w-2xl">
            <p className="text-body-sm font-medium text-primary">BotFlow для бизнеса</p>
            <h1 className="mt-4 text-display font-semibold tracking-tight text-foreground sm:text-display-xl">
              Диалоги, которые приводят к заявке и оплате
            </h1>
            <p className="mt-5 max-w-xl text-body leading-relaxed text-fg-secondary">
              Создайте бота для продаж без кода: он познакомит с предложением, проведёт клиента по сценарию и поможет не терять обращения.
            </p>
            <p className="mt-3 max-w-xl text-body-sm leading-relaxed text-fg-secondary">
              Начните с готовой основы, а затем спокойно настройте сообщения, площадку и оплату в рабочем пространстве.
            </p>

            <button type="button" onClick={onCreateBot} className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto">
              <Rocket className="size-4" aria-hidden="true" />
              Создать бота бесплатно
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <p className="mt-3 text-meta text-fg-secondary">Черновик бесплатен. Оплата потребуется только перед публикацией.</p>

            <div className="mt-8 flex flex-wrap gap-3" aria-label="Платформы BotFlow">
              {platforms.map(({ id, label }) => (
                <span key={id} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 text-body-sm font-medium text-foreground">
                  <PlatformGlyph platform={id} size={18} className="text-fg-secondary" />
                  {label}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.24, delay: 0.04 }} className="flex min-h-64 items-center justify-center rounded-[var(--radius-sheet)] border border-border bg-muted p-5 sm:min-h-80 sm:p-8">
            <img src="/visuals/welcome/sales-journey-hero.png" alt="Путь клиента от сообщения к подтверждённой оплате" className="w-full max-w-xl object-contain" />
          </motion.div>
        </div>

        <section className="mt-12 border-t border-border pt-8 sm:mt-16" aria-labelledby="welcome-scenarios-title">
          <div className="max-w-xl"><p className="text-body-sm font-medium text-primary">Сценарии</p><h2 id="welcome-scenarios-title" className="mt-2 text-title-lg font-semibold text-foreground">Выберите путь под вашу задачу</h2></div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {scenarios.map(({ icon: Icon, title, text }) => (
              <article key={title} className="min-h-32 rounded-[var(--radius-card)] border border-border bg-card p-5">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-body-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-meta leading-relaxed text-fg-secondary">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </section>
  );
}
