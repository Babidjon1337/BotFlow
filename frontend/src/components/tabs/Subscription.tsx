import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  CreditCard,
  RefreshCcw,
  ShieldCheck,
  PowerOff,
  Zap,
  Lock,
  BarChart3,
  GitBranch,
  Send,
  Mail,
  Check,
  ChevronRight,
  ExternalLink,
  Sparkles,
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

interface FeatureItem {
  icon: typeof Send;
  color: string;
  bgColor: string;
  title: string;
  description: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: Send,
    color: "#229ED9",
    bgColor: "bg-[#229ED9]/15 border-[#229ED9]/30",
    title: "Публикация в Telegram",
    description: "Бот работает 24/7 без ограничений на число пользователей, переписок и сообщений воронки.",
  },
  {
    icon: CreditCard,
    color: "#10B981",
    bgColor: "bg-emerald-500/15 border-emerald-500/30",
    title: "0% комиссии платформы",
    description: "Прямой приём денег через ЮKassa, Robokassa или Prodamus прямо на ваш расчётный счёт.",
  },
  {
    icon: Lock,
    color: "#8B5CF6",
    bgColor: "bg-violet-500/15 border-violet-500/30",
    title: "Автовыдача доступов",
    description: "Мгновенная отправка материалов, выдача файлов и авто-добавление покупателей в закрытые каналы.",
  },
  {
    icon: GitBranch,
    color: "#F59E0B",
    bgColor: "bg-amber-500/15 border-amber-500/30",
    title: "Воронки и автодожимы",
    description: "Умные цепочки сообщений, таймеры задержек и повторные касания для максимальной конверсии.",
  },
  {
    icon: BarChart3,
    color: "#06B6D4",
    bgColor: "bg-cyan-500/15 border-cyan-500/30",
    title: "CRM и статистика",
    description: "Учёт каждого клиента, конверсии шагов сценария, средний чек и аналитика выручки в реальном времени.",
  },
  {
    icon: Zap,
    color: "#EC4899",
    bgColor: "bg-pink-500/15 border-pink-500/30",
    title: "Рассылки по базе",
    description: "Точечные рассылки по сегментам покупателей, прогрев лидов и повторные продажи в один клик.",
  },
];

/**
 * Подписка — обновлённый премиальный экран управления флотом ботов и биллингом.
 * Соответствует дизайн-системе: тонкие бордеры, squircle-тайлы, ambient glow,
 * раздельное управление автопродлением и оплатой для каждого бота.
 */
export const Subscription = () => {
  const { appState, setAppState, setActiveTab, setToastMessage, setToastType, isAdmin, selectBot } =
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
      // Игнорируем ошибки сети при фоновом обновлении
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
      message: `Бот продолжит полноценно работать до ${formatDate(botEndsAt)}. После этой даты автосписание не произойдёт, и бот перейдёт в черновик. Все сценарии, клиенты и статистика останутся в сохранности.`,
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

  // Определение покрытия подпиской
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

  // Ищем ботов, требующих оплаты для callout-баннера
  const unpaidBot = bots.find((b) => {
    const cov = getBotCoverage(b);
    return cov.kind === "unpaid";
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-20"
    >
      <PageHeader
        kicker="Подписка"
        tone="violet"
        title="Управление подписками"
        hint="Оплата за каждого опубликованного бота — 990 ₽/мес. Черновики всегда бесплатны."
      />

      {/* ── 1. Премиальная карточка сводки тарифа и баланса ── */}
      <section className="relative overflow-hidden rounded-[22px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-accent text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-tertiary">
              Итого к оплате в месяц
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-accent text-[34px] font-bold leading-none tracking-tight tabular-nums text-fg-primary sm:text-[42px]">
                {monthlyTotal.toLocaleString("ru-RU")} ₽
              </span>
              <span className="text-body-sm font-medium text-fg-tertiary">/ мес</span>
            </div>
            <p className="mt-2 text-body-sm text-fg-secondary">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success">
                  <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                  Администратор платформы — полный доступ без списаний
                </span>
              ) : paidBots.length > 0 ? (
                `${paidBots.length} ${plural(paidBots.length, "оплаченный бот", "оплаченных бота", "оплаченных ботов")} · ${bots.length} ${plural(bots.length, "бот", "бота", "ботов")} всего`
              ) : (
                "Все ваши боты сейчас в бесплатном режиме черновика"
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
                  ? "Админ-доступ: Безлимитно"
                  : status === "active"
                    ? "Подписка активна"
                    : status === "expired"
                      ? "Доступ истёк"
                      : "Бесплатный режим"
              }
            />
            {appState.subscriptionUntil && !isAdmin && (
              <span className="text-micro font-medium text-fg-tertiary">
                Действует до {formatDate(appState.subscriptionUntil)}
              </span>
            )}
          </div>
        </div>

        {/* Информационные плашки */}
        {!isAdmin && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[16px] border border-border/80 bg-muted/40 p-3.5 transition-colors">
              <p className="flex items-center gap-2 font-accent text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                <RefreshCcw className="size-3.5 text-primary" aria-hidden="true" />
                Следующее списание
              </p>
              <p className="mt-1 font-accent text-body font-semibold text-fg-primary tabular-nums">
                {paidBots.some((bot) => bot.subscriptionStatus === "active") || status === "active"
                  ? formatDate(
                      appState.subscriptionUntil ??
                        paidBots.find((b) => b.subscriptionEndsAt)?.subscriptionEndsAt ??
                        null
                    )
                  : "Платежей не запланировано"}
              </p>
            </div>

            <div className="rounded-[16px] border border-border/80 bg-muted/40 p-3.5 transition-colors">
              <p className="flex items-center gap-2 font-accent text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                <Zap className="size-3.5 text-amber-500" aria-hidden="true" />
                Автопродление
              </p>
              <p className="mt-1 text-body-sm font-medium text-fg-secondary">
                {autoRenew
                  ? "Включено — боты продлеваются автоматически без остановки"
                  : "Выключено — боты остановятся по окончании оплаченного срока"}
              </p>
            </div>
          </div>
        )}

        {/* Общая кнопка оплаты (если подписка на аккаунте не активна) */}
        {!isAdmin && (status !== "active" || !autoRenew) && (
          <div className="mt-5 pt-4 border-t border-border">
            {billingEnabled ? (
              <Button
                className="w-full h-11 rounded-xl shadow-sm text-body-sm font-semibold"
                disabled={busy}
                onClick={() => void payForBot()}
              >
                <CreditCard data-icon="inline-start" aria-hidden="true" />
                {status === "active" ? "Продлить подписку" : `Оплатить подписку ${formatPrice(MONTH_PRICE)} / мес`}
              </Button>
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-center text-body-sm text-fg-tertiary">
                Приложение в режиме тестирования — платежи временно отключены администратором.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 2. Callout Баннеры в стиле референса ── */}
      {isAdmin && (
        <section className="relative overflow-hidden rounded-[20px] border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-emerald-900/15 to-transparent p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-body font-bold text-fg-primary">
                    Тариф «Администратор платформы» активен
                  </h3>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-micro font-medium text-emerald-400 border border-emerald-500/30">
                    Неограниченно
                  </span>
                </div>
                <p className="mt-1 text-body-sm text-fg-secondary leading-relaxed">
                  Боты создаются и публикуются бесплатно, без ограничений по клиентам, сценариям и списаниям.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("admin_stats")}
              className="shrink-0 h-10 px-4 rounded-xl border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 gap-1.5"
            >
              Панель администратора
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {!isAdmin && unpaidBot && (
        <section className="relative overflow-hidden rounded-[20px] border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-amber-900/15 to-transparent p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Sparkles className="size-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-body font-bold text-fg-primary">
                    Остался один шаг: активируйте бота «{unpaidBot.name}»
                  </h3>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-micro font-medium text-amber-400 border border-amber-500/30">
                    Требуется оплата
                  </span>
                </div>
                <p className="mt-1 text-body-sm text-fg-secondary leading-relaxed max-w-xl">
                  Чтобы бот начал общаться с пользователями и принимать платежи в Telegram, подключите подписку за {formatPrice(MONTH_PRICE)} / мес.
                </p>
              </div>
            </div>
            {billingEnabled && (
              <button
                type="button"
                onClick={() => void payForBot(unpaidBot.id)}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#229ED9] hover:bg-[#1f8ec4] px-4 text-body-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] shrink-0"
              >
                <CreditCard className="size-4" aria-hidden="true" />
                Оплатить и запустить
                <ExternalLink className="size-3.5 opacity-80" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── 3. Ваши боты — управление флотом ботов и индивидуальными подписками ── */}
      <section className="rounded-[22px] border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-body-lg font-bold text-fg-primary">Ваши боты</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-accent text-micro font-semibold text-fg-secondary">
                {bots.length}
              </span>
            </div>
            <p className="mt-0.5 text-body-sm text-fg-secondary">
              Управление подпиской, автопродлением и запуском каждого бота
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadBilling(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 text-meta font-medium text-fg-secondary hover:text-fg-primary hover:bg-muted transition-colors disabled:opacity-60"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} aria-hidden="true" />
            Обновить статус
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="mt-5 rounded-[18px] border border-dashed border-border-strong p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-fg-tertiary">
              <Bot className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-body font-bold text-fg-primary">У вас пока нет ботов</h3>
            <p className="mt-1 text-body-sm text-fg-secondary max-w-sm mx-auto">
              Создайте своего первого бота — проектирование воронки и черновик абсолютно бесплатны.
            </p>
            <Button
              className="mt-4 rounded-xl"
              onClick={() => setActiveTab("build")}
            >
              Создать первого бота
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3.5">
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
                  className={`group relative rounded-[18px] border p-4 sm:p-5 transition-all duration-200 ${
                    cov.kind === "unpaid"
                      ? "border-warning/40 bg-warning/5"
                      : isSubActive
                        ? "border-primary/30 bg-card shadow-sm hover:border-primary/50"
                        : "border-border bg-card hover:border-border-strong"
                  }`}
                >
                  {/* Верхняя строка: Сквиркл-иконка + Инфо о боте + Статус-бейдж */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 ${
                          isSubActive
                            ? "bg-[#229ED9]/15 text-[#229ED9] border border-[#229ED9]/30"
                            : cov.kind === "unpaid"
                              ? "bg-warning/15 text-warning border border-warning/30"
                              : "bg-muted text-fg-secondary border border-border"
                        }`}
                      >
                        <Bot className="size-6" aria-hidden="true" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-body font-bold text-fg-primary">
                            {bot.name}
                          </h3>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-micro text-fg-secondary">
                          {bot.username && bot.username !== "@unknown" ? (
                            <a
                              href={`https://t.me/${bot.username.replace("@", "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {bot.username}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="text-fg-tertiary">Токен не привязан</span>
                          )}
                          <span className="text-fg-tertiary">·</span>
                          <span>Воронка продаж</span>
                        </div>
                      </div>
                    </div>

                    {/* Статус-бейдж и цена */}
                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-accent text-body font-bold tabular-nums text-fg-primary">
                          {isAdmin || cov.kind === "free" || cov.kind === "draft" ? (
                            <span className="text-success">0 ₽</span>
                          ) : (
                            `${formatPrice(bot.subscriptionAmountRub ?? MONTH_PRICE)} / мес`
                          )}
                        </div>
                        <div className="text-micro text-fg-tertiary">
                          {cov.kind === "draft"
                            ? "Бесплатно в черновике"
                            : isSubActive
                              ? `До ${formatDate(endsDate)}`
                              : cov.kind === "free"
                                ? "Спец-лицензия"
                                : "Оплата не внесена"}
                        </div>
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
                            ? "Бесплатно навсегда"
                            : cov.kind === "draft"
                              ? "Черновик"
                              : cov.kind === "unpaid"
                                ? "Нужна оплата"
                                : isAutoRenewOn
                                  ? "Активен с автопродлением"
                                  : "Активен (автопродление выкл)"
                        }
                      />
                    </div>
                  </div>

                  {/* Нижняя панель действий для конкретного бота */}
                  <div className="mt-4 pt-3.5 border-t border-border/80 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-micro text-fg-secondary">
                      {isSubActive ? (
                        isAutoRenewOn ? (
                          <span className="inline-flex items-center gap-1.5 text-success">
                            <span className="size-1.5 rounded-full bg-success" />
                            Автосписание активно — бот продлевается автоматически
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-warning">
                            <span className="size-1.5 rounded-full bg-warning" />
                            Автосписание выключено — бот остановится {formatDate(endsDate)}
                          </span>
                        )
                      ) : cov.kind === "unpaid" ? (
                        <span className="inline-flex items-center gap-1.5 text-danger font-medium">
                          <span className="size-1.5 rounded-full bg-danger" />
                          Бот приостановлен — оплатите подписку для возобновления
                        </span>
                      ) : (
                        <span className="text-fg-tertiary">
                          Черновик бесплатен — оплата потребуется только при публикации
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                      {/* Управление автопродлением конкретного бота */}
                      {!isAdmin && isSubActive && isAutoRenewOn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => cancelBotSubscription(bot)}
                          className="h-9 px-3 text-meta text-danger hover:bg-danger-soft hover:text-danger rounded-xl gap-1.5"
                        >
                          <PowerOff className="size-3.5" aria-hidden="true" />
                          Отключить автопродление
                        </Button>
                      )}

                      {!isAdmin && isSubActive && !isAutoRenewOn && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void enableBotAutoRenew(bot)}
                          className="h-9 px-3 text-meta text-fg-primary rounded-xl gap-1.5"
                        >
                          <RefreshCcw className="size-3.5 text-primary" aria-hidden="true" />
                          Включить автопродление
                        </Button>
                      )}

                      {/* Оплата подписки конкретного бота */}
                      {!isAdmin && billingEnabled && (cov.kind === "unpaid" || (cov.kind === "draft" && bot.status === "inactive")) && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void payForBot(bot.id)}
                          className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-meta font-semibold gap-1.5"
                        >
                          <CreditCard className="size-3.5" aria-hidden="true" />
                          Оплатить {formatPrice(bot.subscriptionAmountRub ?? MONTH_PRICE)}
                        </Button>
                      )}

                      {/* Быстрый переход в сценарий бота */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          selectBot(bot.id);
                          setActiveTab("build");
                        }}
                        className="h-9 px-3 text-meta font-semibold rounded-xl gap-1"
                      >
                        Перейти к воронке
                        <ChevronRight className="size-3.5 text-fg-tertiary" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-4 pt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            className="w-full h-10 rounded-xl text-body-sm font-semibold text-fg-secondary hover:text-fg-primary"
            onClick={() => setActiveTab("manage")}
          >
            Все настройки и управление ботами
            <ChevronRight className="size-4 ml-1" aria-hidden="true" />
          </Button>
        </div>
      </section>

      {/* ── 4. Что входит в 990 ₽/мес — Премиальная сетка возможностей (в стиле референса) ── */}
      <section className="rounded-[22px] border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div>
          <h2 className="text-body-lg font-bold text-fg-primary">
            Что входит в подписку за {formatPrice(MONTH_PRICE)} / мес
          </h2>
          <p className="mt-0.5 text-body-sm text-fg-secondary">
            Фиксированная стоимость за каждого активного бота. Никаких скрытых платежей и комиссий с продаж.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-start gap-3.5 rounded-[18px] border border-border/80 bg-muted/30 p-4 transition-all hover:border-border hover:bg-muted/60"
              >
                <div
                  className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border ${item.bgColor}`}
                  style={{ color: item.color }}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-body-sm font-bold text-fg-primary">{item.title}</h3>
                  <p className="mt-1 text-micro text-fg-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5. Чеки и квитанции об оплате (в стиле формы оферты из референса) ── */}
      <section className="rounded-[22px] border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <Mail className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-body font-bold text-fg-primary">Чеки и квитанции об оплате</h2>
              <p className="text-micro text-fg-secondary">
                Отправляем электронные чеки 54-ФЗ и напоминания об автосписании
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
              className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-10 pr-4 text-body-sm text-fg-primary placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <Button
            disabled={savingEmail || email === appState.userEmail}
            onClick={() => void handleSaveEmail()}
            className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold shrink-0 gap-1.5"
          >
            {savingEmail ? (
              <RefreshCcw className="size-4 animate-spin" aria-hidden="true" />
            ) : emailSaved ? (
              <Check className="size-4 text-white" aria-hidden="true" />
            ) : null}
            {emailSaved ? "Сохранено" : "Сохранить email"}
          </Button>
        </div>

        {emailError && (
          <p className="mt-2 text-micro text-danger">{emailError}</p>
        )}

        <p className="mt-2 text-micro text-fg-tertiary">
          Электронные чеки формируются платёжным шлюзом и имеют юридическую силу. Оставьте пустым, если чеки на email не требуются.
        </p>
      </section>
    </motion.div>
  );
};
