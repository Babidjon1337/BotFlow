import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  GitBranch,
  Mail,
  MessageCircle,
  Power,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAppState } from "../../providers/AppStateProvider";
import { useAlert } from "../AlertProvider";
import { Button } from "../ui/button";
import type { BotConfig } from "../../types";

const MONTH_PRICE = 990;

const formatDate = (value?: string | null) => {
  if (!value) return "Дата уточняется";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата уточняется";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const formatPrice = (amount: number) => `${amount.toLocaleString("ru-RU")} ₽`;

type BotAccess =
  | { kind: "lifetime"; endsAt: null; autoRenew: false }
  | { kind: "draft"; endsAt: null; autoRenew: false }
  | { kind: "unpaid"; endsAt: null; autoRenew: false }
  | { kind: "active"; endsAt: string | null; autoRenew: boolean };

function getBotAccess(bot: BotConfig, accountStatus: string, accountUntil: string | null, accountAutoRenew: boolean): BotAccess {
  if (bot.hasLifetimeLicense) return { kind: "lifetime", endsAt: null, autoRenew: false };
  if (bot.subscriptionStatus === "active") {
    return {
      kind: "active",
      endsAt: bot.subscriptionEndsAt ?? null,
      autoRenew: bot.subscriptionAutoRenew !== false,
    };
  }
  if (bot.subscriptionStatus === "expired") return { kind: "unpaid", endsAt: null, autoRenew: false };
  if (bot.status === "active" && accountStatus === "active") {
    return { kind: "active", endsAt: accountUntil, autoRenew: accountAutoRenew };
  }
  return { kind: bot.status === "inactive" ? "draft" : "unpaid", endsAt: null, autoRenew: false };
}

export const Subscription = () => {
  const {
    appState,
    setAppState,
    setActiveTab,
    setToastMessage,
    setToastType,
    isAdmin,
    selectBot,
    handleCreateBotClick,
  } = useAppState();
  const { showConfirm } = useAlert();
  const [busyBotId, setBusyBotId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseBot, setPurchaseBot] = useState<BotConfig | null>(null);
  const [detailsBot, setDetailsBot] = useState<BotConfig | null>(null);
  const [email, setEmail] = useState(appState.userEmail || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => setEmail(appState.userEmail || ""), [appState.userEmail]);

  const loadBilling = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const { apiService } = await import("../../services/api");
      const { mapApiBot } = await import("../../services/botMapper");
      const [billing, botsRes] = await Promise.all([
        apiService.getBillingStatus(),
        apiService.getBots(),
      ]);
      setAppState((prev) => ({
        ...prev,
        subscriptionStatus: billing.subscription_status,
        subscriptionUntil: billing.subscription_until,
        subscriptionAutoRenew: billing.subscription_auto_renew,
        billingEnabled: billing.billing_enabled,
        userEmail: billing.email || "",
        emailReceiptsEnabled: billing.email_receipts_enabled,
        emailBillingNotificationsEnabled: billing.email_billing_notifications_enabled,
        bots: botsRes.bots.map(mapApiBot),
      }));
    } catch {
      if (showIndicator) {
        setToastType("error");
        setToastMessage("Не удалось обновить данные подписки.");
      }
    } finally {
      setRefreshing(false);
    }
  }, [setAppState, setToastMessage, setToastType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBilling(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBilling]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadBilling();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadBilling]);

  const accountStatus = isAdmin ? "active" : appState.subscriptionStatus;
  const accountAutoRenew = Boolean(appState.subscriptionAutoRenew);
  const accountPaidUntil = appState.subscriptionUntil;
  const billingEnabled = Boolean(appState.billingEnabled);
  const bots = appState.bots;
  const billableBots = bots.filter((bot) => {
    const access = getBotAccess(bot, accountStatus, accountPaidUntil, accountAutoRenew);
    return access.kind === "active" && !bot.hasLifetimeLicense;
  });
  const monthlyTotal = isAdmin
    ? 0
    : billableBots.reduce((total, bot) => total + (bot.subscriptionAmountRub ?? MONTH_PRICE), 0);

  const startCheckout = async (bot?: BotConfig) => {
    if (!billingEnabled || !offerAccepted) return;
    setBusyBotId(bot?.id ?? "new");
    try {
      const { apiService } = await import("../../services/api");
      const checkout = await apiService.createBillingCheckout(
        "pro",
        email.trim(),
        bot?.id,
        true,
      );
      const telegram = (window as Window & {
        Telegram?: { WebApp?: { openLink?: (url: string) => void } };
      }).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(checkout.confirmationUrl);
      else window.location.assign(checkout.confirmationUrl);
    } catch (error) {
      setToastType("error");
      setToastMessage(error instanceof Error ? error.message : "Не удалось создать платёж.");
    } finally {
      setBusyBotId(null);
    }
  };

  const toggleAutoRenew = async (bot: BotConfig, enabled: boolean) => {
    if (busyBotId) return;
    setBusyBotId(bot.id);
    try {
      const { apiService } = await import("../../services/api");
      if (enabled) await apiService.setBillingAutoRenew(bot.id, true);
      else await apiService.cancelBilling(bot.id);
      await loadBilling();
      setToastType("success");
      setToastMessage(enabled ? "Автопродление включено." : "Автопродление отключено.");
    } catch (error) {
      setToastType("error");
      setToastMessage(error instanceof Error ? error.message : "Не удалось изменить автопродление.");
    } finally {
      setBusyBotId(null);
    }
  };

  const requestCancel = (bot: BotConfig, endsAt: string | null) => {
    showConfirm({
      type: "warning",
      title: "Отключить автопродление?",
      message: `Новое списание за «${bot.name}» не пройдёт. Бот останется доступен до ${formatDate(endsAt)}.`,
      confirmText: "Отключить",
      cancelText: "Оставить",
      onConfirm: () => void toggleAutoRenew(bot, false),
    });
  };

  const saveEmail = async () => {
    if (savingEmail) return;
    const value = email.trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Проверьте адрес электронной почты.");
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { apiService } = await import("../../services/api");
      await apiService.updateNotificationSettings({
        email: value || undefined,
        emailReceiptsEnabled: true,
        emailBillingNotificationsEnabled: true,
      });
      setAppState((prev) => ({ ...prev, userEmail: value }));
      setToastType("success");
      setToastMessage(value ? "Email сохранён для следующих чеков." : "Настройки email сохранены.");
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Не удалось сохранить email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const openPurchase = (bot?: BotConfig) => {
    setOfferAccepted(false);
    setPurchaseBot(bot ?? null);
    setPurchaseOpen(true);
  };

  const purchasePrice = purchaseBot?.subscriptionAmountRub ?? MONTH_PRICE;

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-micro font-semibold uppercase tracking-[0.16em] text-primary">Аккаунт · подписка</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-fg-primary">Оплата и боты</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadBilling(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-micro font-semibold text-fg-secondary transition hover:bg-muted hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Обновить
        </button>
      </header>

      <section className="relative overflow-hidden rounded-[22px] border border-border bg-card p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-primary via-violet-400 to-cyan-400" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-micro font-semibold text-fg-secondary">
              {isAdmin ? <ShieldCheck className="size-4 text-success" /> : <CalendarClock className="size-4 text-primary" />}
              {isAdmin ? "Полный доступ" : "В месяц за активных ботов"}
            </div>
            <p className="mt-2 font-mono text-[clamp(2.5rem,8vw,4rem)] font-semibold leading-none tracking-[-0.07em] text-fg-primary">
              {isAdmin ? "∞" : formatPrice(monthlyTotal)}
              {!isAdmin && <span className="ml-2 font-sans text-base font-medium tracking-normal text-fg-tertiary">/ мес.</span>}
            </p>
          </div>
          <div className="max-w-xs border-l-2 border-primary/30 pl-3 text-micro leading-relaxed text-fg-secondary">
            {isAdmin
              ? "Подписка для аккаунта администратора не списывается."
              : billableBots.length
                ? `${billableBots.length} ${billableBots.length === 1 ? "бот на подписке" : "бота на подписке"}. Платите только за опубликованных ботов.`
                : "Пока нет ботов с регулярной оплатой."}
          </div>
        </div>
      </section>

      <section aria-labelledby="bots-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="bots-heading" className="text-lg font-bold tracking-tight text-fg-primary">Ваши боты</h2>
            <p className="mt-0.5 text-micro text-fg-tertiary">Срок, автопродление и состав тарифа</p>
          </div>
          {!isAdmin && billingEnabled && (
            <Button size="sm" onClick={() => openPurchase()} className="shrink-0 gap-1.5 rounded-xl">
              <CreditCard className="size-3.5" aria-hidden="true" />
              Купить бота
            </Button>
          )}
        </div>

        {bots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-9 text-center">
            <Bot className="mx-auto size-8 text-fg-tertiary" aria-hidden="true" />
            <h3 className="mt-3 font-semibold text-fg-primary">Сначала создайте бота</h3>
            <p className="mx-auto mt-1 max-w-sm text-micro leading-relaxed text-fg-secondary">Черновик можно настроить бесплатно. Оплата начнётся перед публикацией.</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={handleCreateBotClick}>Создать бота</Button>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {bots.map((bot) => {
              const access = getBotAccess(bot, accountStatus, accountPaidUntil, accountAutoRenew);
              const isActive = access.kind === "active";
              const dueDate = access.kind === "active" ? access.endsAt : null;
              const amount = bot.subscriptionAmountRub ?? MONTH_PRICE;
              return (
                <article key={bot.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-fg-secondary"}`}>
                        <Bot className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-fg-primary">{bot.name}</h3>
                        <p className="mt-0.5 text-micro text-fg-tertiary">
                          {access.kind === "lifetime" ? "Доступ навсегда" : access.kind === "draft" ? "Черновик · оплаты нет" : access.kind === "unpaid" ? "Подписка закончилась" : access.autoRenew ? `Следующее списание · ${formatDate(dueDate)}` : `Доступ до · ${formatDate(dueDate)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                      <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-fg-primary">
                        {access.kind === "lifetime" || access.kind === "draft" || isAdmin ? "0 ₽" : `${formatPrice(amount)} / мес`}
                      </span>
                      {isActive && (
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${access.autoRenew ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}>
                          {access.autoRenew ? "Автоплатёж" : "Отключён"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <button
                      type="button"
                      onClick={() => setDetailsBot(bot)}
                      className="inline-flex items-center gap-1.5 rounded-lg py-1.5 text-micro font-semibold text-fg-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <CircleHelp className="size-3.5" aria-hidden="true" />
                      Что входит в бота
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {isActive && !isAdmin && access.autoRenew && (
                        <Button variant="ghost" size="sm" disabled={busyBotId === bot.id} onClick={() => requestCancel(bot, dueDate)} className="h-8 gap-1.5 rounded-lg px-2.5 text-micro text-danger hover:bg-danger-soft hover:text-danger">
                          <Power className="size-3.5" aria-hidden="true" /> Отключить автопродление
                        </Button>
                      )}
                      {isActive && !isAdmin && !access.autoRenew && (
                        <Button variant="outline" size="sm" disabled={busyBotId === bot.id} onClick={() => void toggleAutoRenew(bot, true)} className="h-8 gap-1.5 rounded-lg px-2.5 text-micro">
                          <RefreshCw className="size-3.5" aria-hidden="true" /> Включить снова
                        </Button>
                      )}
                      {(access.kind === "unpaid" || access.kind === "draft") && !isAdmin && billingEnabled && (
                        <Button size="sm" disabled={busyBotId === bot.id} onClick={() => openPurchase(bot)} className="h-8 gap-1.5 rounded-lg px-2.5 text-micro">
                          Оплатить {formatPrice(amount)} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => { selectBot(bot.id); setActiveTab("build"); }} className="h-8 gap-1 rounded-lg px-2.5 text-micro">
                        Изменить воронку <ChevronRight className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="billing-email" className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
            <Mail className="size-4 text-primary" aria-hidden="true" /> Email для чека <span className="font-normal text-fg-tertiary">· необязательно</span>
          </label>
          <input
            id="billing-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setEmailError(null); }}
            placeholder="Можно оставить пустым"
            className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-fg-primary outline-none transition placeholder:text-fg-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <p className="mt-1.5 text-micro text-fg-tertiary">Сохраним адрес для следующих оплат. Без email чек останется у платёжной системы.</p>
          {emailError && <p className="mt-1 text-micro text-danger">{emailError}</p>}
        </div>
        <Button variant="outline" disabled={savingEmail || email.trim() === (appState.userEmail || "")} onClick={() => void saveEmail()} className="h-10 rounded-xl px-4">
          {savingEmail ? "Сохраняем…" : "Сохранить email"}
        </Button>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-micro text-fg-tertiary">
        <span>Подписку можно отключить до следующего списания.</span>
        <a href="/legal/offer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-fg-secondary underline decoration-border underline-offset-4 hover:text-primary">
          Публичная оферта <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </footer>

      {detailsBot && (
        <div className="fixed inset-0 z-[120] grid place-items-end bg-black/45 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsBot(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="bot-details-title" className="w-full max-w-md rounded-t-[24px] border border-border bg-card p-5 shadow-2xl sm:rounded-[24px] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-micro font-semibold uppercase tracking-widest text-primary">Состав тарифа</p>
                <h2 id="bot-details-title" className="mt-1 text-xl font-bold text-fg-primary">{detailsBot.name}</h2>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setDetailsBot(null)} className="rounded-lg p-2 text-fg-tertiary hover:bg-muted hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="size-4" /></button>
            </div>
            <div className="mt-5 divide-y divide-border rounded-2xl border border-border px-4">
              <div className="flex items-center gap-3 py-3.5">
                <MessageCircle className="size-4 text-[#229ED9]" aria-hidden="true" />
                <div><p className="text-sm font-semibold text-fg-primary">Telegram</p><p className="text-micro text-fg-tertiary">Платформа вашего бота</p></div>
                <Check className="ml-auto size-4 text-success" aria-label="Включено" />
              </div>
              <div className="flex items-center gap-3 py-3.5">
                <GitBranch className="size-4 text-primary" aria-hidden="true" />
                <div><p className="text-sm font-semibold text-fg-primary">Воронка продаж</p><p className="text-micro text-fg-tertiary">Сценарий можно редактировать</p></div>
                <Check className="ml-auto size-4 text-success" aria-label="Включено" />
              </div>
              <div className="flex items-center gap-3 py-3.5 text-fg-tertiary">
                <CircleHelp className="size-4" aria-hidden="true" />
                <p className="text-micro leading-relaxed">Другие платформы и типы ботов пока недоступны. Новые варианты появятся здесь, когда их можно будет подключить.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-3">
              <span className="text-micro text-fg-secondary">Стоимость при публикации</span>
              <strong className="font-mono text-sm tabular-nums text-fg-primary">{formatPrice(detailsBot.subscriptionAmountRub ?? MONTH_PRICE)} / мес</strong>
            </div>
            <Button className="mt-4 w-full rounded-xl" onClick={() => { selectBot(detailsBot.id); setActiveTab("build"); setDetailsBot(null); }}>Настроить воронку <ArrowDownRight className="size-4" aria-hidden="true" /></Button>
          </section>
        </div>
      )}

      {purchaseOpen && (
        <PurchaseDialog
          bot={purchaseBot}
          amount={purchasePrice}
          email={email}
          setEmail={(value) => { setEmail(value); setEmailError(null); }}
          offerAccepted={offerAccepted}
          setOfferAccepted={setOfferAccepted}
          busy={busyBotId !== null}
          onClose={() => setPurchaseOpen(false)}
          onPay={() => void startCheckout(purchaseBot ?? undefined)}
        />
      )}
    </motion.main>
  );
};

interface PurchaseDialogProps {
  bot: BotConfig | null;
  amount: number;
  email: string;
  setEmail: (value: string) => void;
  offerAccepted: boolean;
  setOfferAccepted: (accepted: boolean) => void;
  busy: boolean;
  onClose: () => void;
  onPay: () => void;
}

function PurchaseDialog({ bot, amount, email, setEmail, offerAccepted, setOfferAccepted, busy, onClose, onPay }: PurchaseDialogProps) {
  return (
    <div className="fixed inset-0 z-[130] grid place-items-end bg-black/50 p-0 backdrop-blur-[3px] sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="purchase-title" className="w-full max-w-md rounded-t-[24px] border border-border bg-card p-5 shadow-2xl sm:rounded-[24px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro font-semibold uppercase tracking-widest text-primary">Перед оплатой</p>
            <h2 id="purchase-title" className="mt-1 text-xl font-bold text-fg-primary">{bot ? `Подключить ${bot.name}` : "Подключить нового бота"}</h2>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="rounded-lg p-2 text-fg-tertiary hover:bg-muted hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="size-4" /></button>
        </div>
        <div className="mt-5 flex items-end justify-between rounded-2xl border border-border bg-muted/30 p-4">
          <div><p className="text-micro text-fg-secondary">Telegram · воронка продаж</p><p className="mt-1 text-micro text-fg-tertiary">Автопродление каждые 30 дней</p></div>
          <strong className="whitespace-nowrap font-mono text-lg tabular-nums text-fg-primary">{formatPrice(amount)}<span className="font-sans text-xs font-medium text-fg-tertiary"> / мес.</span></strong>
        </div>
        <label htmlFor="purchase-email" className="mt-4 block text-sm font-semibold text-fg-primary">Email для чека <span className="font-normal text-fg-tertiary">· можно пропустить</span></label>
        <input id="purchase-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15" />
        <p className="mt-1.5 text-micro leading-relaxed text-fg-tertiary">Укажете адрес — сохраним его для чеков по будущим оплатам. Оставите поле пустым — email не обязателен.</p>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-micro leading-relaxed text-fg-secondary">
          <input type="checkbox" checked={offerAccepted} onChange={(event) => setOfferAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
          <span>Принимаю <a href="/legal/offer" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">публичную оферту</a> и согласен на автоматическое списание раз в 30 дней. Автопродление можно отключить в любой момент.</span>
        </label>
        <Button disabled={!offerAccepted || busy} onClick={onPay} className="mt-4 h-11 w-full gap-2 rounded-xl text-sm font-semibold">
          {busy ? "Готовим оплату…" : <>Перейти к оплате <CreditCard className="size-4" aria-hidden="true" /></>}
        </Button>
      </section>
    </div>
  );
}
