import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, KeyRound, LockKeyhole, MessageCircleMore, WalletCards, X } from 'lucide-react';
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
  token: string;
  paymentCreds: Record<string, string>;
  offerUrl: string;
};

type TelegramWebApp = {
  BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void };
  HapticFeedback?: { notificationOccurred: (type: 'success' | 'error' | 'warning') => void };
};

type Step = 1 | 2 | 3;

const stepLabels = ['Сценарий', 'Площадки', 'Черновик'];
const previousStep = (current: Step): Step => current === 1 ? 1 : current === 2 ? 1 : 2;
const nextStep = (current: Step): Step => current === 3 ? 3 : current === 1 ? 2 : 3;

/** Последовательное создание черновика. Оплата и публикация остаются отдельными действиями. */
export const BotCreateSheet = ({ onClose, onCreate, onError, onBusyChange }: BotCreateSheetProps) => {
  const [step, setStep] = useState<Step>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const viewportHeight = useViewportHeight();

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    window.setTimeout(() => event.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  };

  useEffect(() => {
    const backButton = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp?.BackButton;
    if (!backButton) return;
    backButton.show();
    const handler = () => {
      if (isCreating) return;
      if (step > 1) setStep(previousStep);
      else onClose();
    };
    backButton.onClick(handler);
    return () => {
      backButton.offClick(handler);
      backButton.hide();
    };
  }, [isCreating, onClose, step]);

  const createBot = async () => {
    if (!navigator.onLine) {
      onError?.('Отсутствует подключение к интернету. Проверьте сеть.');
      return;
    }
    setIsCreating(true);
    onBusyChange?.(true);
    try {
      await onCreate({ displayName: name.trim(), token: token.trim(), paymentCreds: {}, offerUrl: '' });
      (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Не удалось создать бота.');
    } finally {
      setIsCreating(false);
      onBusyChange?.(false);
    }
  };

  const nextDisabled = step === 1 && !name.trim();
  const createDisabled = !token.includes(':') || isCreating;

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={isCreating ? undefined : onClose} className="fixed inset-0 z-[100] bg-[color:var(--overlay)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[101] flex h-full items-end justify-center lg:items-center lg:p-4" style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}>
        <motion.section
          role="dialog" aria-modal="true" aria-labelledby="bot-create-title"
          initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 240 }}
          className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-card lg:h-auto lg:max-h-[min(760px,calc(100dvh-32px))] lg:max-w-[560px] lg:rounded-[var(--radius-sheet)] lg:border lg:border-border lg:shadow-float"
        >
          <header className="relative shrink-0 border-b border-border bg-card px-5 pb-4 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] lg:px-6 lg:pt-5">
            <div className="pr-11"><p className="text-meta font-medium text-fg-secondary">Новый бот</p><h2 id="bot-create-title" className="mt-1 text-title font-semibold">Создание бота</h2></div>
            <button type="button" onClick={onClose} disabled={isCreating} aria-label="Закрыть создание бота" className="absolute right-4 top-[max(16px,calc(env(safe-area-inset-top,0px)+12px))] inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-fg-secondary transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:right-5 lg:top-4"><X className="size-5" aria-hidden="true" /></button>
            <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Шаги создания бота">
              {stepLabels.map((label, index) => {
                const number = index + 1;
                const current = step === number;
                const done = step > number;
                return <li key={label} className="min-w-0"><div className="flex items-center gap-2"><span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${done || current ? 'bg-primary text-primary-foreground' : 'bg-muted text-fg-tertiary'}`}>{done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : number}</span><span className={`truncate text-micro font-medium ${current ? 'text-foreground' : 'text-fg-tertiary'}`}>{label}</span></div></li>;
              })}
            </ol>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center p-5 pb-8 sm:p-6">
              <AnimatePresence mode="wait" initial={false}>
                {step === 1 && <motion.div key="scenario" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-5">
                  <div><span className="flex size-11 items-center justify-center rounded-[var(--radius-card)] bg-accent text-accent-foreground"><Bot className="size-5" aria-hidden="true" /></span><h3 className="mt-4 text-title font-semibold">Название и сценарий</h3><p className="mt-2 text-body-sm leading-relaxed text-fg-secondary">Сначала создайте основу. Сценарий можно будет настроить подробнее в редакторе.</p></div>
                  <label className="block"><span className="text-body-sm font-medium text-foreground">Название бота</span><span className="mt-1 block text-meta text-fg-secondary">Его видите только вы в BotFlow.</span><input type="text" autoFocus placeholder="Например, Магазин одежды" value={name} onChange={(event) => setName(event.target.value)} onFocus={handleFocus} className="input mt-3 w-full" /></label>
                  <article className="rounded-[var(--radius-card)] border border-primary/20 bg-accent p-4"><div className="flex gap-3"><img src="/visuals/scenarios/sales-funnel-card.png" alt="Воронка продаж" className="size-14 shrink-0 rounded-[var(--radius-control)] object-cover" /><div className="min-w-0"><p className="text-body-sm font-semibold text-foreground">Воронка продаж</p><p className="mt-1 text-meta leading-relaxed text-fg-secondary">Сообщения, заявки и рассылки для общения с клиентами.</p></div></div></article>
                  <div className="grid grid-cols-2 gap-3"><article aria-disabled="true" className="rounded-[var(--radius-card)] border border-dashed border-border bg-muted p-3 text-fg-tertiary"><LockKeyhole className="size-4" aria-hidden="true" /><p className="mt-2 text-meta font-medium">Приём заявок</p><p className="mt-1 text-micro">Скоро добавим</p></article><article aria-disabled="true" className="rounded-[var(--radius-card)] border border-dashed border-border bg-muted p-3 text-fg-tertiary"><LockKeyhole className="size-4" aria-hidden="true" /><p className="mt-2 text-meta font-medium">Mini App</p><p className="mt-1 text-micro">Скоро добавим</p></article></div>
                </motion.div>}

                {step === 2 && <motion.div key="platforms" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-5">
                  <div><span className="flex size-11 items-center justify-center rounded-[var(--radius-card)] bg-accent text-accent-foreground"><MessageCircleMore className="size-5" aria-hidden="true" /></span><h3 className="mt-4 text-title font-semibold">Где будет работать бот</h3><p className="mt-2 text-body-sm leading-relaxed text-fg-secondary">Одна площадка включена в базовую подписку. Вы сможете расширить конфигурацию, когда это появится в BotFlow.</p></div>
                  <article className="flex items-center gap-3 rounded-[var(--radius-card)] border border-primary/20 bg-accent p-4"><PlatformGlyph platform="telegram" size={22} className="text-accent-foreground" /><div className="min-w-0 flex-1"><p className="text-body-sm font-semibold text-foreground">Telegram</p><p className="mt-0.5 text-meta text-fg-secondary">Включён в базовую подписку</p></div><CheckCircle2 className="size-5 text-primary" aria-label="Выбрано" /></article>
                  <div className="grid grid-cols-2 gap-3">{(['vk', 'max'] as const).map(platform => <article key={platform} aria-disabled="true" className="rounded-[var(--radius-card)] border border-dashed border-border bg-muted p-4 text-fg-tertiary"><PlatformGlyph platform={platform} size={20} className="text-fg-tertiary" /><p className="mt-3 text-body-sm font-medium">{platform === 'vk' ? 'VK' : 'MAX'}</p><p className="mt-1 text-meta">Скоро добавим</p></article>)}</div>
                  <div className="rounded-[var(--radius-card)] border border-border bg-muted p-4"><p className="text-body-sm font-semibold text-foreground">Рассылки и заявки включены</p><p className="mt-1 text-meta leading-relaxed text-fg-secondary">Отдельных доплат за сообщения, заявки или количество лидов нет.</p></div>
                </motion.div>}

                {step === 3 && <motion.div key="draft" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-5">
                  <div><span className="flex size-11 items-center justify-center rounded-[var(--radius-card)] bg-success-soft text-success"><WalletCards className="size-5" aria-hidden="true" /></span><h3 className="mt-4 text-title font-semibold">Черновик и публикация</h3><p className="mt-2 text-body-sm leading-relaxed text-fg-secondary">Создание черновика бесплатно. Подписка потребуется, когда бот будет готов к публикации.</p></div>
                  <article className="rounded-[var(--radius-card)] border border-border bg-muted p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-body-sm font-semibold text-foreground">Воронка продаж · Telegram</p><p className="mt-1 text-meta text-fg-secondary">Базовая подписка бота</p></div><p className="shrink-0 text-title font-semibold text-foreground">990 ₽<span className="text-body-sm font-medium text-fg-secondary">/мес</span></p></div><p className="mt-3 border-t border-border pt-3 text-meta leading-relaxed text-fg-secondary">Оплата не потребуется сейчас. Кассу, оферту и детали сценария можно настроить после создания.</p></article>
                  <label className="block"><span className="text-body-sm font-medium text-foreground">Токен Telegram</span><span className="mt-1 block text-meta text-fg-secondary">Нужен, чтобы безопасно привязать бота к вашему аккаунту.</span><span className="relative mt-3 block"><KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden="true" /><input type="password" autoComplete="off" placeholder="1234567890:AAH…" value={token} onChange={(event) => setToken(event.target.value)} onFocus={handleFocus} className="input w-full pl-10" /></span>{token && !token.includes(':') && <p className="mt-2 text-meta text-danger">Проверьте формат токена из @BotFather.</p>}</label>
                  <div className="flex gap-3 rounded-[var(--radius-card)] border border-border bg-muted p-4"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><p className="text-meta leading-relaxed text-fg-secondary">После создания вы перейдёте к редактору сценария. Бот не будет опубликован автоматически.</p></div>
                </motion.div>}
              </AnimatePresence>
            </div>
          </div>

          <footer className="flex shrink-0 gap-3 border-t border-border bg-card px-5 pb-[max(20px,calc(env(safe-area-inset-bottom,0px)+12px))] pt-4 lg:px-6 lg:pb-5">
            {step > 1 && <button type="button" onClick={() => setStep(previousStep)} disabled={isCreating} aria-label="Назад" className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-border bg-muted px-4 text-fg-secondary transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"><ArrowLeft className="size-5" aria-hidden="true" /></button>}
            {step < 3 ? <button type="button" onClick={() => setStep(nextStep)} disabled={nextDisabled} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Далее<ArrowRight className="size-4" aria-hidden="true" /></button> : <button type="button" onClick={createBot} disabled={createDisabled} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{isCreating ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" aria-label="Создаём бота" /> : <><Bot className="size-4" aria-hidden="true" />Создать черновик</>}</button>}
          </footer>
        </motion.section>
      </div>
    </>
  );
};
