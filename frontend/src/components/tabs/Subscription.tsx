import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, CheckCircle2, ChevronDown, CreditCard, Crown, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

import { useAppState } from "../../providers/AppStateProvider";
import { PageHeader } from "../common/PageHeader";
import { StatusBadge } from "../common/StatusBadge";
import { useAlert } from "../AlertProvider";
import { Button } from "../ui/button";

const MONTH_PRICE = 990;

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : "—";

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const formatPrice = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

/**
 * Подписка — оплата за каждого опубликованного бота (от 990 ₽/мес).
 * Черновики бесплатны, бот со спец-лицензией бесплатен навсегда.
 * До подключения per-bot оплаты активный аккаунтный доступ (тестовые granting
 * «3 месяца») покрывает опубликованных ботов — это legacy-ветка.
 */
export const Subscription = () => {
  const { appState, setAppState, setActiveTab, setToastMessage, isAdmin } = useAppState();
  const { showConfirm } = useAlert();
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const bots = appState.bots;
  const published = bots.filter((bot) => bot.status === "active");
  const freeBots = published.filter((bot) => bot.hasLifetimeLicense);
  const paidBots = published.filter((bot) => !bot.hasLifetimeLicense);
  const monthlyTotal = isAdmin
    ? 0
    : paidBots.reduce(
        (sum, bot) => sum + (bot.subscriptionAmountRub ?? MONTH_PRICE),
        0
      );

  const status = isAdmin ? "active" : appState.subscriptionStatus;
  const autoRenew = Boolean(appState.subscriptionAutoRenew);
  // Рубильник: пока бэкенд не подтвердил оплату, кнопка не показывается.
  const billingEnabled = Boolean(appState.billingEnabled);

  const loadBilling = useCallback(async () => {
    setRefreshing(true);
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
        bots: botsRes.bots.map(mapApiBot),
      }));
    } catch {
      // Статус придёт при следующем открытии — экран остаётся рабочим.
    } finally {
      setRefreshing(false);
    }
  }, [setAppState]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  // Возврат из внешнего браузера после оплаты: обновляем статус, не полагаясь на remount.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadBilling();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadBilling]);

  const payForBot = async (botId?: string) => {
    if (busy || !billingEnabled) return;
    setBusy(true);
    try {
      const { apiService } = await import("../../services/api");
      const checkout = await apiService.createBillingCheckout(
        "pro",
        appState.userEmail || undefined,
        botId
      );
      const telegram = (window as Window & {
        Telegram?: { WebApp?: { openLink?: (url: string) => void } };
      }).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(checkout.confirmationUrl);
      else window.location.assign(checkout.confirmationUrl);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : "Не удалось создать платёж.");
    } finally {
      setBusy(false);
    }
  };

  const cancelAutoRenew = (botId?: string) => {
    showConfirm({
      type: "warning",
      title: "Отключить автосписание?",
      message: `Опубликованные боты продолжат работать до ${formatDate(appState.subscriptionUntil)}. После этой даты они остановятся, но настройки и клиенты сохранятся — подключить снова можно в любой момент.`,
      confirmText: "Отключить",
      cancelText: "Оставить",
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const { apiService } = await import("../../services/api");
            await apiService.cancelBilling(botId);
            await loadBilling();
            setToastMessage("Автосписание отключено");
          } catch (error) {
            setToastMessage(error instanceof Error ? error.message : "Не удалось отключить автосписание.");
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  // Покрытие бота: per-bot подписка → legacy аккаунтный доступ → нет доступа.
  const coverage = (bot: (typeof bots)[number]) => {
    if (bot.hasLifetimeLicense) return { kind: "free" as const };
    if (bot.status !== "active") return { kind: "draft" as const };
    if (bot.subscriptionStatus === "active" && bot.subscriptionEndsAt) {
      return { kind: "sub" as const, endsAt: bot.subscriptionEndsAt, autoRenew: Boolean(bot.subscriptionAutoRenew) };
    }
    if (bot.subscriptionStatus === "expired") return { kind: "unpaid" as const };
    if (status === "active") {
      return { kind: "legacy" as const, endsAt: appState.subscriptionUntil };
    }
    return { kind: "unpaid" as const };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-8"
    >
      <PageHeader
        kicker="Подписка"
        tone="violet"
        title="Управление подписками"
        hint="Каждый опубликованный бот оплачивается отдельно — от 990 ₽/мес. Черновики и спец-доступ бесплатны."
      />

      {/* Сводка: итог по активным подпискам + один CTA */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-accent text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-tertiary">
              К оплате в месяц
            </p>
            <p className="mt-1 font-accent text-[34px] font-bold leading-none tabular-nums text-fg-primary">
              {monthlyTotal.toLocaleString("ru-RU")} ₽
            </p>
            <p className="mt-1.5 text-body-sm text-fg-secondary">
              {isAdmin
                ? "Администратор платформы — публикация бесплатна"
                : paidBots.length > 0
                  ? `${paidBots.length} ${plural(paidBots.length, "оплаченный бот", "оплаченных бота", "оплаченных ботов")} · ${plural(published.length, "опубликован", "опубликовано", "опубликовано")} ${published.length}`
                  : "Оплаченных ботов пока нет — опубликуйте бота, чтобы подключить подписку"}
            </p>
          </div>
          <StatusBadge
            tone={status === "active" ? "success" : status === "expired" ? "warning" : "neutral"}
            label={status === "active" ? "Доступ активен" : status === "expired" ? "Доступ истёк" : "Доступ не подключён"}
          />
        </div>

        {!isAdmin && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-border bg-muted/40 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">
                <RefreshCcw className="size-3" aria-hidden /> Следующее списание
              </p>
              <p className="mt-1 text-body font-semibold text-fg-primary">
                {paidBots.some((bot) => bot.subscriptionStatus === "active") || status === "active"
                  ? formatDate(appState.subscriptionUntil ?? paidBots.find((b) => b.subscriptionEndsAt)?.subscriptionEndsAt ?? null)
                  : "—"}
              </p>
            </div>
            <div className="rounded-[14px] border border-border bg-muted/40 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">Автосписание</p>
              <p className="mt-1 text-body-sm text-fg-secondary">
                {autoRenew
                  ? "Включено — боты продлеваются автоматически"
                  : "Выключено — боты работают до конца периода"}
              </p>
            </div>
          </div>
        )}

        {!isAdmin && (status !== "active" || !autoRenew) && (
          billingEnabled ? (
            <Button className="mt-4 w-full" disabled={busy} onClick={() => void payForBot()}>
              <CreditCard data-icon="inline-start" aria-hidden />
              {status === "active" ? "Продлить подписку" : `Оплатить ${formatPrice(MONTH_PRICE)} / мес`}
            </Button>
          ) : (
            <p className="mt-4 rounded-[14px] border border-dashed border-border-strong px-4 py-3 text-center text-body-sm text-fg-tertiary">
              Приложение на тесте — оплата откроется позже. Доступ уже выдан вручную.
            </p>
          )
        )}
      </section>

      {/* Боты: покрытие и цена каждого */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-body-lg font-bold text-fg-primary">Ваши боты</h2>
          <button
            type="button"
            onClick={() => void loadBilling()}
            disabled={refreshing}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-full px-3 text-meta font-semibold text-fg-secondary hover:text-fg-primary disabled:opacity-60"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Обновить
          </button>
        </div>

        {bots.length === 0 ? (
          <p className="mt-4 rounded-[14px] border border-dashed border-border-strong px-4 py-6 text-center text-body-sm text-fg-tertiary">
            Ботов пока нет. Создайте первого — черновик бесплатен.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {bots.map((bot) => {
              const cov = coverage(bot);
              return (
                <li key={bot.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-fg-secondary">
                    <Bot className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg-primary">
                    {bot.name}
                  </span>
                  {cov.kind === "free" ? (
                    <StatusBadge tone="success" label="Бесплатно навсегда" />
                  ) : cov.kind === "draft" ? (
                    <StatusBadge tone="neutral" label="Черновик" />
                  ) : cov.kind === "sub" ? (
                    <StatusBadge tone="success" label={`До ${formatDate(cov.endsAt)}`} />
                  ) : cov.kind === "legacy" ? (
                    <StatusBadge tone="success" label={`Доступ до ${formatDate(cov.endsAt)}`} />
                  ) : (
                    <StatusBadge tone="warning" label="Нужна оплата" />
                  )}
                  <span className="ml-auto shrink-0 text-meta tabular-nums text-fg-secondary">
                    {cov.kind === "free" || cov.kind === "draft" || isAdmin ? (
                      <span className="text-success">0 ₽</span>
                    ) : cov.kind === "sub" ? (
                      <span className="font-accent font-semibold text-fg-primary">
                        {formatPrice(bot.subscriptionAmountRub ?? MONTH_PRICE)}/мес
                      </span>
                    ) : cov.kind === "legacy" ? (
                      <span className="text-success">0 ₽</span>
                    ) : (
                      <span className="font-accent font-semibold text-fg-primary">
                        {formatPrice(MONTH_PRICE)}/мес
                      </span>
                    )}
                  </span>
                  {billingEnabled && !isAdmin && cov.kind === "unpaid" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void payForBot(bot.id)}
                    >
                      Оплатить
                    </Button>
                  )}
                  {billingEnabled && !isAdmin && (cov.kind === "sub" || cov.kind === "legacy") && autoRenew && (
                    <button
                      type="button"
                      onClick={() => cancelAutoRenew(cov.kind === "sub" ? bot.id : undefined)}
                      disabled={busy}
                      className="min-h-11 rounded-full px-3 text-meta font-semibold text-danger hover:underline disabled:opacity-60"
                    >
                      Отключить авто
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="ghost" className="mt-4 w-full" onClick={() => setActiveTab("manage")}>
          Управлять ботами
        </Button>
      </section>

      {/* Что входит — свёрнуто, чтобы не толкать страницу управления */}
      <details className="group rounded-[20px] border border-border bg-card p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-body-lg font-bold text-fg-primary [&::-webkit-details-marker]:hidden">
          Что входит в {formatPrice(MONTH_PRICE)}
          <ChevronDown className="size-4 text-fg-tertiary transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "Публикация бота в Telegram",
            "Без лимитов сообщений и аудитории",
            "Приём оплаты на вашу кассу",
            "Рассылки и сегменты аудитории",
            "Статистика и воронка",
            "Смена токена в любое время",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-body-sm text-fg-secondary">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      </details>

      {isAdmin && (
        <section className="flex items-start gap-3 rounded-[20px] border border-success/40 bg-success-soft/50 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="text-body font-bold text-fg-primary">Администратор платформы</p>
            <p className="mt-0.5 text-body-sm text-fg-secondary">
              Боты создаются и публикуются бесплатно, без лимитов и списаний.
            </p>
          </div>
        </section>
      )}

      {freeBots.length > 0 && !isAdmin && (
        <section className="flex items-start gap-3 rounded-[20px] border border-primary/30 bg-accent/40 p-5">
          <Crown className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-body font-bold text-fg-primary">
              {freeBots.length === 1
                ? "Один бот работает бесплатно"
                : `${freeBots.length} ${plural(freeBots.length, "бот", "бота", "ботов")} работают бесплатно`}
            </p>
            <p className="mt-0.5 text-body-sm text-fg-secondary">
              Спец-доступ по ссылке: {freeBots.map((bot) => bot.name).join(", ")}. Подписка на них не нужна.
            </p>
          </div>
        </section>
      )}

      {status === "expired" && !isAdmin && (
        <section className="flex items-start gap-3 rounded-[20px] border border-warning/40 bg-warning-soft/50 p-5">
          <XCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-body font-bold text-fg-primary">Подписка закончилась</p>
            <p className="mt-0.5 text-body-sm text-fg-secondary">
              Боты остановлены, но настройки, клиенты и статистика сохранены. Оплатите — публикация вернётся сразу.
            </p>
          </div>
        </section>
      )}
    </motion.div>
  );
};
