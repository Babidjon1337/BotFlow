import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, CheckCircle2, CreditCard, Crown, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

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

/**
 * Подписка — оплата за каждого опубликованного бота (990 ₽/мес).
 * Черновики бесплатны, бот со спец-лицензией бесплатен навсегда.
 * Автосписание отключается по аккаунту: доступ доживает до конца периода,
 * затем бот можно подключить заново оплатой.
 */
export const Subscription = () => {
  const { appState, setAppState, setActiveTab, setToastMessage, isAdmin } = useAppState();
  const { showConfirm } = useAlert();
  const [busy, setBusy] = useState(false);

  const bots = appState.bots;
  const published = bots.filter((bot) => bot.status === "active");
  const freeBots = published.filter((bot) => bot.hasLifetimeLicense);
  const paidBots = published.filter((bot) => !bot.hasLifetimeLicense);
  const monthlyTotal = isAdmin ? 0 : paidBots.length * MONTH_PRICE;

  const status = isAdmin ? "active" : appState.subscriptionStatus;
  const autoRenew = Boolean(appState.subscriptionAutoRenew);

  useEffect(() => {
    let cancelled = false;
    void import("../../services/api")
      .then(({ apiService }) => apiService.getBillingStatus())
      .then((billing) => {
        if (cancelled) return;
        setAppState((prev) => ({
          ...prev,
          subscriptionStatus: billing.subscription_status,
          subscriptionUntil: billing.subscription_until,
          subscriptionAutoRenew: billing.subscription_auto_renew,
        }));
      })
      .catch(() => {
        // Статус придёт при следующем открытии — экран остаётся рабочим.
      });
    return () => {
      cancelled = true;
    };
  }, [setAppState]);

  const payForBot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { apiService } = await import("../../services/api");
      const checkout = await apiService.createBillingCheckout("pro", appState.userEmail || undefined);
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

  const cancelAutoRenew = () => {
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
            const billing = await apiService.cancelBilling();
            setAppState((prev) => ({
              ...prev,
              subscriptionStatus: billing.subscription_status,
              subscriptionUntil: billing.subscription_until,
              subscriptionAutoRenew: billing.subscription_auto_renew,
            }));
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
        title="Подписка"
        hint="Оплата за каждого опубликованного бота — 990 ₽/мес. Черновики бесплатны."
      />

      {/* Сводка: сумма в месяц + состояние продления */}
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
                  ? `${paidBots.length} ${paidBots.length === 1 ? "бот" : "бота"} × ${MONTH_PRICE} ₽`
                  : "Нет платных ботов — опубликуйте бота, чтобы начать"}
            </p>
          </div>
          <StatusBadge
            tone={status === "active" ? "success" : status === "expired" ? "warning" : "neutral"}
            label={status === "active" ? "Активна" : status === "expired" ? "Истекла" : "Не подключена"}
          />
        </div>

        {!isAdmin && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-border bg-muted/40 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">
                <RefreshCcw className="size-3" aria-hidden /> Следующее списание
              </p>
              <p className="mt-1 text-body font-semibold text-fg-primary">
                {status === "active" ? formatDate(appState.subscriptionUntil) : "—"}
              </p>
            </div>
            <div className="rounded-[14px] border border-border bg-muted/40 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg-tertiary">Автосписание</p>
              {autoRenew ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-body font-semibold text-success">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden /> Включено
                  </span>
                  <button
                    type="button"
                    onClick={cancelAutoRenew}
                    disabled={busy}
                    className="text-meta font-semibold text-danger hover:underline disabled:opacity-60"
                  >
                    Отключить
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-body-sm text-fg-secondary">
                  Выключено — боты работают до конца периода
                </p>
              )}
            </div>
          </div>
        )}

        {!isAdmin && (status !== "active" || !autoRenew) && (
          <Button className="mt-4 w-full" disabled={busy} onClick={() => void payForBot()}>
            <CreditCard data-icon="inline-start" aria-hidden />
            {status === "active" ? "Продлить подписку" : "Оплатить 990 ₽ / мес"}
          </Button>
        )}
      </section>

      {/* Боты: за что платим */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-body-lg font-bold text-fg-primary">Ваши боты</h2>
          <span className="text-meta text-fg-tertiary">
            {published.length} из {bots.length} опубликовано
          </span>
        </div>

        {bots.length === 0 ? (
          <p className="mt-4 rounded-[14px] border border-dashed border-border-strong px-4 py-6 text-center text-body-sm text-fg-tertiary">
            Ботов пока нет. Создайте первого — черновик бесплатен.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {bots.map((bot) => {
              const isPublished = bot.status === "active";
              const isFree = Boolean(bot.hasLifetimeLicense);
              return (
                <li key={bot.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-fg-secondary">
                    <Bot className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg-primary">
                    {bot.name}
                  </span>
                  {isFree ? (
                    <StatusBadge tone="success" label="Бесплатно навсегда" />
                  ) : (
                    <StatusBadge
                      tone={isPublished ? "success" : "neutral"}
                      label={isPublished ? "Опубликован" : "Черновик"}
                    />
                  )}
                  <span className="ml-auto shrink-0 text-meta tabular-nums text-fg-secondary">
                    {isFree || isAdmin ? (
                      <span className="text-success">0 ₽</span>
                    ) : isPublished ? (
                      <span className="font-accent font-semibold text-fg-primary">{MONTH_PRICE} ₽/мес</span>
                    ) : (
                      "0 ₽"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="outline" className="mt-4 w-full" onClick={() => setActiveTab("manage")}>
          К моим ботам
        </Button>
      </section>

      {/* Что входит — коротко, без маркетинга */}
      <section className="rounded-[20px] border border-border bg-card p-5">
        <h2 className="text-body-lg font-bold text-fg-primary">Что входит в 990 ₽</h2>
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
      </section>

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
              {freeBots.length === 1 ? "Один бот работает бесплатно" : `${freeBots.length} бота работают бесплатно`}
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
