import { motion } from 'framer-motion';
import { ArrowRight, Bot, CheckCircle2, Megaphone, Rocket } from 'lucide-react';
import { PlatformGlyph, type PlatformId } from '../common/platform';

interface WelcomeScreenProps {
  onCreateBot: () => void;
}

const platforms: Array<{ id: PlatformId; label: string }> = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'vk', label: 'VK' },
  { id: 'max', label: 'MAX' },
];

const benefits = [
  { icon: Bot, title: 'Воронка продаж', text: 'Ведите клиента от первого сообщения до оплаты.' },
  { icon: Megaphone, title: 'Рассылки включены', text: 'Общайтесь с аудиторией без отдельного модуля.' },
  { icon: CheckCircle2, title: 'Начните с черновика', text: 'Соберите сценарий и публикуйте, когда будете готовы.' },
];

/** Полноэкранный первый вход: объясняет ценность продукта до перехода к созданию бота. */
export function WelcomeScreen({ onCreateBot }: WelcomeScreenProps) {
  return (
    <section className="flex min-h-full w-full flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between border-b border-border px-5 sm:px-8 lg:px-12">
        <div className="inline-flex items-center gap-2 text-body-sm font-semibold text-foreground">
          <span className="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-primary text-primary-foreground">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          BotFlow
        </div>
        <span className="text-meta text-fg-secondary">Продажи в мессенджерах</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:gap-16 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="max-w-2xl">
          <p className="text-body-sm font-medium text-primary">Конструктор ботов для бизнеса</p>
          <h1 className="mt-4 text-display font-semibold tracking-tight text-foreground sm:text-display-xl">
            Продавайте в мессенджерах — без сложной настройки
          </h1>
          <p className="mt-5 max-w-xl text-body leading-relaxed text-fg-secondary">
            BotFlow помогает собрать воронку, вести диалог с клиентом и принимать оплату в одном рабочем пространстве.
          </p>

          <button type="button" onClick={onCreateBot} className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto">
            <Rocket className="size-4" aria-hidden="true" />
            Создать бота бесплатно
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <p className="mt-3 text-meta text-fg-secondary">Создание черновика бесплатно. Оплата — перед публикацией.</p>

          <div className="mt-9 flex flex-wrap gap-3" aria-label="Платформы BotFlow">
            {platforms.map(({ id, label }) => (
              <span key={id} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 text-body-sm font-medium text-foreground">
                <PlatformGlyph platform={id} size={18} className="text-fg-secondary" />
                {label}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.24, delay: 0.04 }} className="flex min-h-72 items-center justify-center rounded-[var(--radius-sheet)] border border-border bg-muted p-7 sm:min-h-80">
          <img src="/visuals/scenarios/sales-funnel-card.png" alt="Иллюстрация пути клиента по воронке продаж" className="h-64 w-full max-w-sm object-contain sm:h-72" />
        </motion.div>
      </main>

      <div className="border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl px-5 sm:grid-cols-3 sm:px-8 lg:px-12">
          {benefits.map(({ icon: Icon, title, text }) => (
            <article key={title} className="flex gap-3 border-b border-border py-5 last:border-b-0 sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div><h2 className="text-body-sm font-semibold text-foreground">{title}</h2><p className="mt-1 text-meta leading-relaxed text-fg-secondary">{text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
