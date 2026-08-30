import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Check, Plus, Rocket, X } from 'lucide-react';
import type { PaymentProvider } from '../../types';
import { useViewportHeight } from '../../hooks';
import { PlatformGlyph } from '../common/platform';

interface BotCreateSheetProps {
  onClose: () => void;
  onCreate: (botData: BotCreateData) => Promise<void>;
  onError?: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

type BotCreateData = {
  displayName: string;
  token?: string;
  paymentProvider?: PaymentProvider;
  paymentCreds: Record<string, string>;
  offerUrl: string;
};

type TelegramWebApp = {
  BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void };
  HapticFeedback?: { notificationOccurred: (type: 'success' | 'error' | 'warning') => void };
};

const scenarios = [
  { title: 'Воронка продаж', description: 'Подойдёт для товаров и услуг: знакомит, отвечает и ведёт к оплате.', image: '/visuals/scenarios/sales-funnel-card.png', available: true },
  { title: 'Приём заявок', description: 'Для обращений клиентов и первичной квалификации.', image: '/visuals/scenarios/applications-card.png', available: false },
  { title: 'Mini App', description: 'Для каталога, витрины и заказов. Дороже базового сценария — цена при запуске.', image: '/visuals/scenarios/mini-app-card.png', available: false },
];

/** Создаёт черновик с готовой основой; детали настраиваются в рабочем пространстве бота. */
export const BotCreateSheet = ({ onClose, onCreate, onError, onBusyChange }: BotCreateSheetProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const viewportHeight = useViewportHeight();

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    window.setTimeout(() => event.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  };

  useEffect(() => {
    const backButton = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp?.BackButton;
    if (!backButton) return;
    backButton.show();
    backButton.onClick(onClose);
    return () => {
      backButton.offClick(onClose);
      backButton.hide();
    };
  }, [onClose]);

  const createBot = async () => {
    if (!navigator.onLine) {
      onError?.('Отсутствует подключение к интернету. Проверьте сеть.');
      return;
    }
    setIsCreating(true);
    onBusyChange?.(true);
    try {
      await onCreate({ displayName: name.trim(), paymentCreds: {}, offerUrl: '' });
      (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Не удалось создать бота.');
    } finally {
      setIsCreating(false);
      onBusyChange?.(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={isCreating ? undefined : onClose} className="fixed inset-0 z-[100] bg-[color:var(--overlay)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[101] flex h-full items-end justify-center lg:items-center lg:p-4" style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="bot-create-title" initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 240 }} className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-card lg:h-auto lg:max-h-[min(720px,calc(100dvh-32px))] lg:max-w-[640px] lg:rounded-[var(--radius-sheet)] lg:border lg:border-border lg:shadow-float">
          <header className="relative shrink-0 border-b border-border bg-card px-5 pb-4 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:px-6 lg:pt-5">
            <div className="pr-11"><p className="text-meta font-medium text-fg-secondary">Новый бот</p><h2 id="bot-create-title" className="mt-1 text-title font-semibold">Создайте основу</h2></div>
            <button type="button" onClick={onClose} disabled={isCreating} aria-label="Закрыть создание бота" className="absolute right-4 top-[max(16px,calc(env(safe-area-inset-top,0px)+12px))] inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-fg-secondary transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:right-5 lg:top-4"><X className="size-5" aria-hidden="true" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-xl p-5 pb-8 sm:p-6">
              <span className="flex size-11 items-center justify-center rounded-[var(--radius-card)] bg-accent text-accent-foreground"><Bot className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-4 text-title font-semibold">Как назовём бота?</h3>
              <p className="mt-2 text-body-sm leading-relaxed text-fg-secondary">Выберите готовый сценарий. После создания откроется редактор, где вы настроите сообщения, площадку и оплату.</p>

              <label className="mt-5 block"><span className="text-body-sm font-medium text-foreground">Название</span><input type="text" autoFocus placeholder="Например, Магазин одежды" value={name} onChange={(event) => setName(event.target.value)} onFocus={handleFocus} className="input mt-2 w-full" /></label>

              <fieldset className="mt-6"><legend className="text-body-sm font-medium text-foreground">Сценарий</legend><div className="mt-3 grid grid-cols-3 gap-3">
                {scenarios.map(({ title, description, image, available }) => (
                  <article key={title} aria-disabled={!available} className={`flex min-h-44 flex-col rounded-[var(--radius-card)] border p-3 ${available ? 'border-primary/30 bg-accent' : 'border-dashed border-border bg-muted text-fg-tertiary'}`}>
                    <img src={image} alt="" className="aspect-[4/3] w-full rounded-[var(--radius-control)] bg-white object-contain p-1.5 dark:bg-white/10" />
                    <p className={`mt-3 text-body-sm font-semibold ${available ? 'text-foreground' : ''}`}>{title}</p>
                    <p className="mt-1 text-micro leading-relaxed">{description}</p>
                    {!available && <span className="mt-auto pt-2 text-micro font-medium">Скоро добавим</span>}
                  </article>
                ))}
              </div></fieldset>

              <fieldset className="mt-6">
                <legend className="text-body-sm font-medium text-foreground">Платформа</legend>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-primary/30 bg-accent px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card">
                      <PlatformGlyph platform="telegram" size={22} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-foreground">Telegram</p>
                      <p className="text-meta text-fg-tertiary">Подключится перед публикацией</p>
                    </div>
                    <Check className="ml-auto size-4 shrink-0 text-success" aria-hidden="true" />
                  </div>
                  {([['vk', 'VK'], ['max', 'MAX']] as const).map(([id, label]) => (
                    <div key={id} aria-disabled className="flex items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-border bg-muted px-4 py-3 text-fg-tertiary">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card">
                        <PlatformGlyph platform={id} size={22} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-body-sm font-semibold">{label}</p>
                        <p className="text-meta">Скоро — уведомим при запуске</p>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="mt-6 rounded-[var(--radius-card)] border border-border bg-muted p-4" role="img" aria-label="Сейчас черновик — 0 рублей; после публикации подписка бота — от 990 рублей в месяц, каждая дополнительная платформа плюс 500 рублей в месяц, без лимитов">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-fg-secondary">Сейчас (черновик)</span>
                  <b className="money-sm text-foreground">0 ₽</b>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="text-body-sm text-fg-secondary">После публикации</span>
                  <b className="money-sm text-success">от 990 ₽/мес</b>
                </div>
                <ul className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-meta leading-relaxed text-fg-tertiary">
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
                    Воронка продаж + Telegram — 990 ₽/мес
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Plus className="size-3 shrink-0" aria-hidden="true" />
                    Каждая доп. платформа (VK, MAX) — +500 ₽/мес
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
                    Без лимитов сообщений — цена не меняется
                  </li>
                </ul>
                <p className="mt-3 border-t border-border/70 pt-3 text-meta leading-relaxed text-fg-tertiary">
                  Создание — бесплатно. Оплатить можно сразу после настройки или
                  позже — черновик никуда не денется.
                </p>
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-card px-5 pb-[max(20px,calc(env(safe-area-inset-bottom,0px)+12px))] pt-4 lg:px-6 lg:pb-5">
            <button type="button" onClick={createBot} disabled={!name.trim() || isCreating} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {isCreating ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" aria-label="Создаём бота" /> : <><Rocket className="size-4" aria-hidden="true" />Создать и настроить</>}
            </button>
            <p className="mt-3 text-center text-meta text-fg-secondary">Черновик бесплатен. Подключение платформы и оплата — позже, перед публикацией.</p>
          </footer>
        </motion.section>
      </div>
    </>
  );
};
