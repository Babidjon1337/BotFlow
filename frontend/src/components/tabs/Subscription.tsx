import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  CreditCard,
  RefreshCcw,
  ShieldCheck,
  PowerOff,
  Lock,
  GitBranch,
  Send,
  Mail,
  Check,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  FileText,
  Download,
} from "lucide-react";

import { useAppState } from "../../providers/AppStateProvider";
import { PageHeader } from "../common/PageHeader";
import { StatusBadge } from "../common/StatusBadge";
import { useAlert } from "../AlertProvider";
import { Button } from "../ui/button";
import type { BotConfig } from "../../types";

const MONTH_PRICE = 990;

const formatDate = (iso: string | null | undefined) =>
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

export const Subscription = () => {
  const { appState, setAppState, setActiveTab, setToastMessage, setToastType, isAdmin, selectBot, handleCreateBotClick } =
    useAppState();
  const { showConfirm } = useAlert();

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Email для чеков и квитанций
  const [email, setEmail] = useState(appState.userEmail || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(appState.userEmail || "");
  }, [appState.userEmail]);

  const bots = appState.bots;
  const published = bots.filter((bot) => bot.status === "active");
  const paidBots = published.filter((bot) => !bot.hasLifetimeLicense);
  const monthlyTotal = isAdmin
    ? 0
    : paidBots.reduce(
        (sum, bot) => sum + (bot.subscriptionAmountRub ?? MONTH_PRICE),
        0
      );

  const status = isAdmin ? "active" : appState.subscriptionStatus;
  const autoRenew = Boolean(appState.subscriptionAutoRenew);
  const billingEnabled = Boolean(appState.billingEnabled);

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
        userEmail: billing.email || prev.userEmail,
        bots: botsRes.bots.map(mapApiBot),
      }));
    } catch {
      // Игнорируем сетевые сбои при тихом обновлении
    } finally {
      setRefreshing(false);
    }
  }, [setAppState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBilling();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBilling]);

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
        email.trim() || appState.userEmail || undefined,
        botId
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
      setBusy(false);
    }
  };

  const cancelBotSubscription = (bot: BotConfig) => {
    const botEndsAt = bot.subscriptionEndsAt || appState.subscriptionUntil;
    showConfirm({
      type: "warning",
      title: `Отключить подписку бота «${bot.name}»?`,
      message: `Бот продолжит полноценно работать до ${formatDate(botEndsAt)}. После этой даты автосписание не произойдёт, и бот перейдёт в черновик. Все сценарии, клиенты и статистика сохранятся.`,
      confirmText: "Отключить автопродление",
      cancelText: "Оставить активной",
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const { apiService } = await import("../../services/api");
            await apiService.cancelBilling(bot.id);
            await loadBilling(true);
            setToastType("success");
            setToastMessage(`Автопродление для бота «${bot.name}» отключено`);
          } catch (error) {
            setToastType("error");
            setToastMessage(error instanceof Error ? error.message : "Не удалось отключить автопродление.");
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  const enableBotAutoRenew = async (bot: BotConfig) => {
    if (busy) return;
    setBusy(true);
    try {
      const { apiService } = await import("../../services/api");
      await apiService.setBillingAutoRenew(bot.id, true);
      await loadBilling(true);
      setToastType("success");
      setToastMessage(`Автопродление для бота «${bot.name}» успешно включено`);
    } catch (error) {
      setToastType("error");
      setToastMessage(error instanceof Error ? error.message : "Не удалось включить автопродление.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEmail = async () => {
    if (savingEmail) return;
    const value = email.trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Введите корректный адрес электронной почты");
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
      setEmailSaved(true);
      setToastType("success");
      setToastMessage("Email для чеков сохранён");
      window.setTimeout(() => setEmailSaved(false), 2500);
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Не удалось сохранить email");
    } finally {
      setSavingEmail(false);
    }
  };

  const getBotCoverage = (bot: BotConfig) => {
    if (bot.hasLifetimeLicense) return { kind: "free" as const };
    if (bot.status !== "active") return { kind: "draft" as const };
    if (bot.subscriptionStatus === "active" && bot.subscriptionEndsAt) {
      return {
        kind: "sub" as const,
        endsAt: bot.subscriptionEndsAt,
        autoRenew: bot.subscriptionAutoRenew !== false,
      };
    }
    if (bot.subscriptionStatus === "expired") return { kind: "unpaid" as const };
    if (status === "active") {
      return {
        kind: "legacy" as const,
        endsAt: appState.subscriptionUntil,
        autoRenew: autoRenew,
      };
    }
    return { kind: "unpaid" as const };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-20"
    >
      <PageHeader
        kicker="Подписка"
        tone="violet"
        title="Подписки и боты"
        hint="Стоимость каждого активного бота — 990 ₽/мес. Черновики всегда бесплатны."
      />

      {/* ── 1. Сводка по расходам и состоянию аккаунта ── */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
              Текущие расходы
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[32px] font-bold leading-none tracking-tight tabular-nums text-fg-primary sm:text-[38px]">
                {monthlyTotal.toLocaleString("ru-RU")} ₽
              </span>
              <span className="text-body-sm font-medium text-fg-tertiary">/ мес</span>
            </div>
            <p className="mt-2 text-body-sm text-fg-secondary">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success">
                  <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                  Администратор платформы — безлимитный доступ ко всем ботам
                </span>
              ) : paidBots.length > 0 ? (
                `${paidBots.length} ${plural(paidBots.length, "активный бот", "активных бота", "активных ботов")} на подписке · ${bots.length} ${plural(bots.length, "бот", "бота", "ботов")} всего`
              ) : (
                "Все ваши боты находятся в бесплатном режиме черновика"
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StatusBadge
              tone={
                isAdmin
                  ? "success"
                  : status === "active"
                    ? "success"
                    : status === "expired"
                      ? "warning"
                      : "neutral"
              }
              label={
                isAdmin
                  ? "Админ: Безлимит"
                  : status === "active"
                    ? "Подписка активна"
                    : status === "expired"
                      ? "Доступ истёк"
                      : "Бесплатный режим"
              }
            />
            <button
              type="button"
              onClick={() => void loadBilling(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-micro font-medium text-fg-tertiary hover:text-fg-secondary transition-colors"
            >
              <RefreshCcw className={`size-3 ${refreshing ? "animate-spin text-primary" : ""}`} aria-hidden="true" />
              Обновить статус
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. Список ботов: управление каждой подпиской и возможностями ── */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h2 className="text-body font-bold text-fg-primary">Ваши Telegram-боты</h2>
            <p className="text-micro text-fg-secondary">
              Включение и отключение подписки для каждого бота по отдельности
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin && billingEnabled && (
              <Button
                size="sm"
                onClick={() => void payForBot()}
                disabled={busy}
                className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-micro font-semibold gap-1.5 shadow-xs"
              >
                <CreditCard className="size-3.5" aria-hidden="true" />
                Подключить нового бота (990 ₽/мес)
              </Button>
            )}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-micro font-semibold text-fg-secondary">
              {bots.length}
            </span>
          </div>
        </div>

        {bots.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-fg-tertiary">
              <Bot className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-body font-bold text-fg-primary">У вас пока нет созданных ботов</h3>
            <p className="mt-1 text-body-sm text-fg-secondary max-w-sm mx-auto">
              Создайте первого бота: проектирование воронки в черновике бесплатно.
            </p>
            <Button className="mt-4 rounded-xl" onClick={handleCreateBotClick}>
              Создать бота
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3.5">
            {bots.map((bot) => {
              const cov = getBotCoverage(bot);
              const isSubActive = cov.kind === "sub" || cov.kind === "legacy";
              const isAutoRenewOn = cov.kind === "sub" ? cov.autoRenew : autoRenew;
              const endsDate =
                cov.kind === "sub"
                  ? cov.endsAt
                  : cov.kind === "legacy"
                    ? cov.endsAt
                    : bot.subscriptionEndsAt;

              return (
                <article
                  key={bot.id}
                  className={`rounded-[16px] border p-4 transition-all ${
                    cov.kind === "unpaid"
                      ? "border-warning/40 bg-warning/5"
                      : isSubActive
                        ? "border-border bg-card hover:border-primary/40 shadow-2xs"
                        : "border-border bg-card/60"
                  }`}
                >
                  {/* Заголовок карточки бота */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                          isSubActive
                            ? "bg-[#229ED9]/15 text-[#229ED9] border border-[#229ED9]/30"
                            : cov.kind === "unpaid"
                              ? "bg-warning/15 text-warning border border-warning/30"
                              : "bg-muted text-fg-secondary border border-border"
                        }`}
                      >
                        <Bot className="size-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="truncate text-body font-bold text-fg-primary">
                            {bot.name}
                          </h3>
                          {bot.username && bot.username !== "@unknown" && (
                            <a
                              href={`https://t.me/${bot.username.replace("@", "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-micro font-medium text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {bot.username}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                        <p className="text-micro text-fg-secondary mt-0.5">
                          {cov.kind === "draft"
                            ? "Черновик — бесплатно до момента публикации"
                            : isSubActive
                              ? `Подписка активна до ${formatDate(endsDate)}`
                              : cov.kind === "free"
                                ? "Бесплатная спец-лицензия"
                                : "Оплата не внесена — бот приостановлен"}
                        </p>
                      </div>
                    </div>

                    {/* Статус и стоимость */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="font-bold text-body text-fg-primary tabular-nums">
                          {isAdmin || cov.kind === "free" || cov.kind === "draft" ? (
                            <span className="text-success">0 ₽</span>
                          ) : (
                            `${formatPrice(bot.subscriptionAmountRub ?? MONTH_PRICE)} / мес`
                          )}
                        </span>
                      </div>
                      <StatusBadge
                        tone={
                          cov.kind === "free"
                            ? "success"
                            : cov.kind === "draft"
                              ? "neutral"
                              : cov.kind === "unpaid"
                                ? "danger"
                                : isAutoRenewOn
                                  ? "success"
                                  : "warning"
                        }
                        label={
                          cov.kind === "free"
                            ? "Бесплатно"
                            : cov.kind === "draft"
                              ? "Черновик"
                              : cov.kind === "unpaid"
                                ? "Нужна оплата"
                                : isAutoRenewOn
                                  ? "Автопродление вкл"
                                  : "Автопродление выкл"
                        }
                      />
                    </div>
                  </div>

                  {/* Блок «Что включено в бота» (Telegram + воронка продаж) */}
                  <div className="mt-3.5 rounded-xl border border-border/70 bg-muted/30 p-2.5 sm:p-3">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">
                      Возможности этого бота:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-micro font-medium text-fg-secondary">
                      <div className="flex items-center gap-1.5 truncate">
                        <GitBranch className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">Воронка продаж</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <CreditCard className="size-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">Приём оплаты</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Lock className="size-3.5 text-violet-500 shrink-0" />
                        <span className="truncate">Автовыдача доступа</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Send className="size-3.5 text-cyan-500 shrink-0" />
                        <span className="truncate">База без лимитов</span>
                      </div>
                    </div>
                  </div>

                  {/* Нижняя строка: управление автопродлением и редактирование */}
                  <div className="mt-3.5 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2.5">
                    {/* Статус автосписания */}
                    <div className="text-micro text-fg-secondary">
                      {isSubActive ? (
                        isAutoRenewOn ? (
                          <span className="inline-flex items-center gap-1.5 text-success">
                            <span className="size-1.5 rounded-full bg-success" />
                            Автосписание активно — бот продлевается автоматически
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-warning">
                            <span className="size-1.5 rounded-full bg-warning" />
                            Автосписание выключено — остановится {formatDate(endsDate)}
                          </span>
                        )
                      ) : cov.kind === "unpaid" ? (
                        <span className="inline-flex items-center gap-1.5 text-danger font-medium">
                          <AlertCircle className="size-3.5 text-danger" />
                          Оплатите подписку для возобновления работы бота
                        </span>
                      ) : (
                        <span className="text-fg-tertiary">
                          В режиме черновика плата не взимается
                        </span>
                      )}
                    </div>

                    {/* Кнопки действий */}
                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                      {/* Отключение автопродления */}
                      {!isAdmin && isSubActive && isAutoRenewOn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => cancelBotSubscription(bot)}
                          className="h-8 px-2.5 text-micro text-danger hover:bg-danger-soft hover:text-danger rounded-lg gap-1"
                          title="Отключить автоматическое продление подписки"
                        >
                          <PowerOff className="size-3.5" aria-hidden="true" />
                          Отключить автопродление
                        </Button>
                      )}

                      {/* Включение автопродления */}
                      {!isAdmin && isSubActive && !isAutoRenewOn && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void enableBotAutoRenew(bot)}
                          className="h-8 px-2.5 text-micro text-fg-primary rounded-lg gap-1"
                        >
                          <RefreshCcw className="size-3.5 text-primary" aria-hidden="true" />
                          Включить автопродление
                        </Button>
                      )}

                      {/* Оплата для неактивного бота */}
                      {!isAdmin && billingEnabled && (cov.kind === "unpaid" || (cov.kind === "draft" && bot.status === "inactive")) && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void payForBot(bot.id)}
                          className="h-8 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-micro font-semibold gap-1.5"
                        >
                          <CreditCard className="size-3.5" aria-hidden="true" />
                          Оплатить {formatPrice(bot.subscriptionAmountRub ?? MONTH_PRICE)}
                        </Button>
                      )}

                      {/* Редактировать возможности / сценарий бота */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          selectBot(bot.id);
                          setActiveTab("build");
                        }}
                        className="h-8 px-2.5 text-micro font-semibold rounded-lg gap-1"
                      >
                        Редактировать воронку
                        <ChevronRight className="size-3.5 text-fg-tertiary" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 3. Чеки об оплате платформы (54-ФЗ) ── */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Mail className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-body font-bold text-fg-primary">Электронные чеки платформы</h2>
              <p className="text-micro text-fg-secondary">
                На эту почту будут приходить чеки об оплате подписки BotFlow (по 54-ФЗ)
              </p>
            </div>
          </div>

          <StatusBadge
            tone={appState.userEmail ? "success" : "neutral"}
            label={appState.userEmail ? "Email привязан" : "Не указан"}
          />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden="true" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-border bg-muted/40 py-2 pl-10 pr-4 text-body-sm text-fg-primary placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <Button
            disabled={savingEmail || email === appState.userEmail}
            onClick={() => void handleSaveEmail()}
            className="h-9 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold shrink-0 gap-1.5"
          >
            {savingEmail ? (
              <RefreshCcw className="size-3.5 animate-spin" aria-hidden="true" />
            ) : emailSaved ? (
              <Check className="size-3.5 text-white" aria-hidden="true" />
            ) : null}
            {emailSaved ? "Сохранено" : "Сохранить email"}
          </Button>
        </div>

        {emailError && <p className="mt-2 text-micro text-danger">{emailError}</p>}
      </section>

      {/* ── 4. Официальная оферта платформы (ИП Медоян А.Г.) ── */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-body font-bold text-fg-primary">Публичная оферта сервиса BotFlow</h2>
            </div>
            <p className="text-micro text-fg-secondary leading-relaxed">
              Официальный договор-оферта на предоставление доступа к платформе создания и обслуживания ботов.
              Исполнитель: Индивидуальный предприниматель Медоян Арам Гагикович (ИНН 613302383615, ОГРНИП 321619600251571).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <a
              href="/legal/offer"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 hover:bg-muted px-3.5 py-2 text-micro font-semibold text-fg-primary transition"
            >
              <span>Читать оферту</span>
              <ExternalLink className="size-3 text-fg-tertiary" aria-hidden="true" />
            </a>
            <a
              href="/api/legal/offer?download=1"
              download="Оферта_сервиса_ботов_ИП_Медоян.docx"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 text-micro font-semibold text-primary transition"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>Скачать .DOCX</span>
            </a>
          </div>
        </div>
        <p className="mt-3 border-t border-border/60 pt-3 text-micro text-fg-tertiary leading-relaxed">
          Оплачивая подписку или подключая бота, вы подтверждаете акцепт публичной оферты и согласие на обработку персональных данных (152-ФЗ).
          Периодические списания за подписку производятся каждые 30 дней и могут быть отключены в любой момент.
        </p>
      </section>
    </motion.div>
  );
};
