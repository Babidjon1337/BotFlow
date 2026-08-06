import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Star,
  CheckCircle2,
  XCircle,
  Bot,
  Users,
  CreditCard,
  LineChart,
  RefreshCcw,
  ChevronLeft,
  Lock,
  KeyRound,
  Headphones,
} from "lucide-react";

import { useAppState } from "../../providers/AppStateProvider";

type PlanKey = "basic" | "pro";

const plans: Record<
  PlanKey,
  {
    key: PlanKey;
    name: string;
    period: string;
    tagline: string;
    image: string;
    accentFrom: string;
    accentTo: string;
    bgLight: string;
    bgDark: string;
    features: { icon: React.ReactNode; text: string; included: boolean }[];
    ctaLabel: string;
    ctaGradient: string;
  }
> = {
  basic: {
    key: "basic",
    name: "Базовый бот",
    period: "навсегда",
    tagline: "1 бот без абонентской платы",
    image: "/single_bot.png",
    accentFrom: "#3B82F6",
    accentTo: "#2563EB",
    bgLight: "linear-gradient(160deg, #EFF6FF 0%, #DBEAFE 80%)",
    bgDark: "linear-gradient(160deg, #1e2d42 0%, #162236 80%)",
    features: [
      { icon: <Bot size={16} />, text: "1 активный бот", included: true },
      {
        icon: <LineChart size={16} />,
        text: "Аналитика и воронки",
        included: true,
      },
      {
        icon: <CreditCard size={16} />,
        text: "Приём платежей",
        included: true,
      },
      {
        icon: <RefreshCcw size={16} />,
        text: "Редактирование бота",
        included: true,
      },
      {
        icon: <KeyRound size={16} />,
        text: "Смена токена (при >10 юзеров — нельзя)",
        included: false,
      },
      { icon: <Users size={16} />, text: "Несколько ботов", included: false },
    ],
    ctaLabel: "Купить за 2 000 ₽",
    ctaGradient: "linear-gradient(135deg, #3B82F6, #2563EB)",
  },
  pro: {
    key: "pro",
    name: "PRO Подписка",
    period: "/ мес",
    tagline: "До 10 ботов с полным контролем",
    image: "/pro_sub.png",
    accentFrom: "#9333EA",
    accentTo: "#6366F1",
    bgLight: "linear-gradient(160deg, #F5F3FF 0%, #EDE9FE 80%)",
    bgDark: "linear-gradient(160deg, #221a35 0%, #1a1528 80%)",
    features: [
      { icon: <Bot size={16} />, text: "До 10 активных ботов", included: true },
      {
        icon: <Users size={16} />,
        text: "Неограниченная аудитория",
        included: true,
      },
      {
        icon: <CreditCard size={16} />,
        text: "Приём платежей",
        included: true,
      },
      {
        icon: <LineChart size={16} />,
        text: "Аналитика и воронки",
        included: true,
      },
      {
        icon: <KeyRound size={16} />,
        text: "Смена токена в любое время",
        included: true,
      },
      {
        icon: <Headphones size={16} />,
        text: "Приоритетная поддержка",
        included: true,
      },
    ],
    ctaLabel: "Выбрать PRO",
    ctaGradient: "linear-gradient(135deg, #9333EA, #6366F1)",
  },
};

export const Subscription = () => {
  const {
    appState,
    setActiveTab,
    setAppState,
    setToastMessage,
    isAdmin,
  } = useAppState();
  const onGoToBots = () => setActiveTab("home");
  const [step, setStep] = useState<"select" | "confirm" | "success">("select");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [email, setEmail] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [prices, setPrices] = useState<Partial<Record<PlanKey, number>>>({});
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelledUntil, setCancelledUntil] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [confetti, setConfetti] = useState<
    { id: number; x: number; color: string; delay: number }[]
  >([]);

  useEffect(() => {
    import("../../services/api").then(({ apiService }) => apiService.getBillingCatalog())
      .then(({ products }) => setPrices(Object.fromEntries(products.map((product) => [product.id, product.price]))))
      .catch((error) => setPaymentError(error instanceof Error ? error.message : "Не удалось загрузить тарифы."));
  }, []);

  useEffect(() => {
    if (step === "success") {
      const colors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
      const newConfetti = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.5,
      }));
      const startTimer = window.setTimeout(() => setConfetti(newConfetti), 0);
      const finishTimer = window.setTimeout(() => {
        setStep("select");
      }, 3500);
      return () => { window.clearTimeout(startTimer); window.clearTimeout(finishTimer); };
    }
  }, [step]);

  const handleSelectPlan = (planKey: PlanKey) => {
    setSelectedPlan(planKey);
    setStep("confirm");
  };

  const handlePay = async () => {
    if (!selectedPlan) return;
    setIsPaying(true);
    setPaymentError("");
    try {
      const { apiService } = await import("../../services/api");
      const checkout = await apiService.createBillingCheckout(selectedPlan, email || undefined);
      const telegram = (window as Window & { Telegram?: { WebApp?: { openLink?: (url: string) => void } } }).Telegram?.WebApp;
      if (telegram?.openLink) telegram.openLink(checkout.confirmationUrl);
      else window.location.assign(checkout.confirmationUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Не удалось создать платёж.");
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancel = async () => {
    try {
      const { apiService } = await import("../../services/api");
      const billing = await apiService.cancelBilling();
      setAppState((prev) => ({
        ...prev,
        subscriptionStatus: billing.subscription_status,
        subscriptionUntil: billing.subscription_until,
        subscriptionAutoRenew: billing.subscription_auto_renew,
      }));
      setCancelledUntil(billing.subscription_until);
      setShowCancelModal(false);
      setToastMessage("Автопродление отключено. Доступ сохранится до конца периода.");
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Не удалось отменить автопродление.");
      setShowCancelModal(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col">
      <style>{`
        @keyframes slow-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .plans-scroll::-webkit-scrollbar { display: none; }
        .plans-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @media (max-width: 767px) {
          .plans-container { overflow-x: auto !important; overflow-y: hidden; touch-action: pan-x; }
        }
      `}</style>

      {/* ===== ACTIVE SUBSCRIPTION VIEW ===== */}
      {(appState.subscriptionStatus === "active" || isAdmin) && step !== "success" ? (
        <motion.div
          key="active-sub"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="flex flex-col gap-6">
            {/* Main Hero Card */}
            <div
              className="relative overflow-hidden rounded-[24px] md:rounded-[32px] p-6 md:p-10 border border-[var(--color-primary)]/20 shadow-lg shadow-[var(--color-primary)]/5"
              style={{
                background:
                  "linear-gradient(145deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
              }}
            >
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--color-primary)]/10 rounded-full blur-[80px] pointer-events-none -mr-20 -mt-20" />
              <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[var(--color-accent)]/10 rounded-full blur-[60px] pointer-events-none -ml-20 -mb-20" />

              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 w-full">
                  <div className="w-16 h-16 md:w-24 md:h-24 rounded-[20px] md:rounded-[28px] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] shadow-xl shadow-[var(--color-primary)]/20 flex items-center justify-center shrink-0 border-4 border-[var(--color-surface)]">
                    <Crown
                      size={32}
                      className="text-white drop-shadow-md md:w-10 md:h-10"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1.5 md:mb-2">
                      <h2 className="text-2xl md:text-4xl font-black text-[var(--color-foreground)] tracking-tight">
                        {isAdmin ? "👑 Тариф: Админ (SaaS Owner)" : "PRO Подписка"}
                      </h2>
                      <div className="px-2.5 py-1 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-[var(--color-success)] text-[11px] md:text-[13px] font-bold rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]" />
                        Активна
                      </div>
                    </div>
                    <p className="text-[14px] md:text-[16px] text-[var(--color-foreground-secondary)] font-medium">
                      {isAdmin ? "Безлимитный доступ ко всем функциям и аналитике BotFlow" : "Разблокированы все возможности платформы"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end p-4 md:p-6 rounded-[20px] md:rounded-[24px] bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-border)] w-full md:w-auto shrink-0">
                  <div className="flex items-center gap-2 text-[12px] md:text-[13px] font-bold text-[var(--color-primary)] uppercase tracking-wider mb-1.5 md:mb-2">
                    {isAdmin ? <Crown size={14} /> : <RefreshCcw size={14} />} {isAdmin ? "VIP Статус" : "Автопродление"}
                  </div>
                  <div className="text-2xl font-black text-[var(--color-foreground)] mb-1">
                    {isAdmin ? "Навсегда" : "25 июля"}
                  </div>
                  <div className="text-[14px] text-[var(--color-foreground-secondary)] font-medium">
                    Списание{" "}
                    <span className="text-[var(--color-foreground)] font-bold">
                      {isAdmin ? "0 ₽ (Безлимит)" : "3 000 ₽"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Management & Limits Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card-saas p-6 md:p-8 rounded-[28px]">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-[16px] bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-foreground)] border border-[var(--color-border)]">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">
                      Лимиты ботов
                    </h3>
                    <p className="text-[14px] text-[var(--color-foreground-secondary)] font-medium">
                      Используется {appState.bots.length} {isAdmin ? "(Безлимитный тариф)" : "из 10"}
                    </p>
                  </div>
                </div>
                <div className="h-3 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] rounded-full transition-all duration-1000"
                    style={{ width: isAdmin ? "100%" : `${(appState.bots.length / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[13px] font-semibold text-[var(--color-foreground-tertiary)]">
                  <span>{appState.bots.length} активных</span>
                  <span>{isAdmin ? "Осталось: Безлимитно" : `Осталось ${10 - appState.bots.length}`}</span>
                </div>
              </div>

              <div className="card-saas p-6 md:p-8 rounded-[28px] flex flex-col justify-between">
                <div>
                  <h3 className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">
                    Управление
                  </h3>
                  <p className="text-[14px] text-[var(--color-foreground-secondary)] leading-relaxed mb-6">
                    Настройте ваших ботов, подключите платежные системы или
                    управляйте статусом подписки.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => onGoToBots()}
                    className="btn-primary-saas w-full py-3.5 rounded-[16px] text-[15px] font-bold flex items-center justify-center gap-2"
                  >
                    К моим ботам
                  </button>
                  {cancelledUntil ? (
                    <button
                      onClick={() => setStep("select")}
                      className="w-full py-3.5 rounded-[16px] text-[15px] font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCcw size={18} />
                      Оформить подписку снова
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="w-full py-3.5 rounded-[16px] text-[14px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors flex items-center justify-center"
                    >
                      Отменить подписку
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ===== STEP 1: SELECT PLAN ===== */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full pt-1 md:pt-8"
            >
              {/* Header */}
              <div className="text-center mb-3 md:mb-10 px-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold text-[12px] mb-2 md:mb-4">
                  <Crown size={13} /> Тарифы
                </div>
                <h1 className="text-[18px] md:text-4xl font-black text-[var(--color-foreground)] tracking-tight mb-0.5">
                  Выберите тариф
                </h1>
                <p className="text-[13px] md:text-[16px] text-[var(--color-foreground-secondary)]">
                  Запустите своего бота уже сегодня
                </p>
              </div>

              {/* Cards: mobile horizontal scroll-snap, desktop side-by-side */}
              <div
                ref={scrollRef}
                onScroll={() => {
                  if (scrollRef.current) {
                    const scrollLeft = scrollRef.current.scrollLeft;
                    const width = scrollRef.current.offsetWidth;
                    const newIndex = Math.round(scrollLeft / width);
                    if (newIndex !== activeIndex) {
                      setActiveIndex(newIndex);
                    }
                  }
                }}
                className="plans-scroll plans-container flex md:grid md:grid-cols-2 gap-4 md:gap-6 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none pl-4 pr-4 md:px-0 pb-1 md:pb-0"
                style={{ scrollPaddingLeft: "1rem" }}
              >
                {(Object.values(plans) as (typeof plans)[PlanKey][]).map(
                  (plan) => (
                    <div
                      key={plan.key}
                      onClick={() => handleSelectPlan(plan.key)}
                      className="snap-center shrink-0 w-[82vw] md:w-auto flex flex-col rounded-[28px] overflow-hidden border border-transparent cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-lg hover:shadow-xl"
                      style={{ background: plan.bgLight }}
                    >
                      <PlanCard plan={plan} price={prices[plan.key]} />
                    </div>
                  ),
                )}
              </div>

              {/* Mobile scroll dots */}
              <div className="flex md:hidden justify-center gap-2 mt-3">
                {Object.keys(plans).map((key, index) => (
                  <div
                    key={key}
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                      index === activeIndex
                        ? "bg-[var(--color-primary)]"
                        : "bg-[var(--color-foreground-tertiary)]/40"
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ===== STEP 2: CONFIRM ===== */}
          {step === "confirm" && selectedPlan && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-md mx-auto w-full pt-4 md:pt-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <motion.button
                  whileHover={{ x: -2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setStep("select")}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-foreground)] shadow-sm"
                >
                  <ChevronLeft size={20} />
                </motion.button>

                {paymentError && (
                  <p role="alert" className="mt-3 text-center text-[13px] text-[var(--color-danger)]">
                    {paymentError}
                  </p>
                )}
                <h2 className="text-[20px] md:text-[22px] font-bold text-[var(--color-foreground)]">
                  Подтвердите выбор
                </h2>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[24px] p-5 md:p-6 shadow-sm mb-6 relative overflow-hidden">
                <div
                  className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none opacity-60"
                  style={{
                    background: `radial-gradient(circle, ${plans[selectedPlan].accentFrom}33, transparent)`,
                  }}
                />

                {/* Plan summary */}
                <div className="flex items-center gap-4 p-4 bg-[var(--color-surface-2)] rounded-2xl mb-6 relative z-10 border border-[var(--color-border)]">
                  <div className="w-14 h-14 md:w-16 md:h-16 shrink-0 flex items-center justify-center rounded-xl overflow-hidden shadow-sm">
                    <img
                      src={plans[selectedPlan].image}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="text-[15px] md:text-[16px] font-bold text-[var(--color-foreground)] mb-0.5">
                      {plans[selectedPlan].name}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[18px] font-black text-[var(--color-foreground)]">
                        {formatPrice(prices[selectedPlan])}
                      </span>
                      <span className="text-[13px] text-[var(--color-foreground-secondary)]">
                        {plans[selectedPlan].period}
                      </span>
                    </div>
                    <div className="text-[12px] text-[var(--color-foreground-secondary)] mt-0.5">
                      {plans[selectedPlan].tagline}
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-6 pl-1 relative z-10">
                  {plans[selectedPlan].features.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-[13px] md:text-[14px]"
                    >
                      <div
                        className={
                          f.included
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-foreground-tertiary)]"
                        }
                      >
                        {f.included ? (
                          <CheckCircle2 size={17} />
                        ) : (
                          <XCircle size={17} />
                        )}
                      </div>
                      <span
                        className={
                          f.included
                            ? "text-[var(--color-foreground)]"
                            : "text-[var(--color-foreground-secondary)] line-through decoration-[var(--color-foreground-tertiary)]"
                        }
                      >
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Email */}
                <div className="mb-6 relative z-10">
                  <label className="block text-[13px] font-medium text-[var(--color-foreground-secondary)] mb-1.5">
                    Email для чека (необязательно)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@mail.com"
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl py-3 px-4 text-[14px] md:text-[15px] text-[var(--color-foreground)] placeholder-[var(--color-foreground-secondary)] focus:outline-none focus:border-[#8B5CF6] transition-colors"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: isPaying ? 1 : 1.01 }}
                  whileTap={{ scale: isPaying ? 1 : 0.98 }}
                  onClick={handlePay}
                  disabled={isPaying}
                  className="w-full py-4 rounded-[16px] text-[16px] font-bold text-white flex items-center justify-center gap-2 shadow-lg relative z-10"
                  style={{
                    background: plans[selectedPlan].ctaGradient,
                    opacity: isPaying ? 0.7 : 1,
                  }}
                >
                  {isPaying ? (
                    <>
                      <div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                      Обработка...
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      Перейти к оплате
                    </>
                  )}
                </motion.button>

                <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] md:text-[12px] text-[var(--color-foreground-secondary)] relative z-10">
                  <Lock size={13} />
                  <span>Безопасная оплата через ЮKassa</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== STEP 3: SUCCESS ===== */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="flex-1 flex flex-col items-center justify-center py-12 md:py-16 relative h-[60vh] md:h-[70vh]"
            >
              {confetti.map((c) => (
                <div
                  key={c.id}
                  className="absolute w-2 h-2 rounded-sm z-0 pointer-events-none"
                  style={{
                    left: `${c.x}%`,
                    top: "-10px",
                    backgroundColor: c.color,
                    animation: `fall 3s linear ${c.delay}s forwards`,
                  }}
                />
              ))}

              <div
                className="card-saas p-8 md:p-12 text-center max-w-md w-full relative overflow-hidden shadow-2xl shadow-[var(--color-success)]/10"
                style={{ borderRadius: 32 }}
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-success)]/10 rounded-full blur-[60px] pointer-events-none -mr-20 -mt-20" />

                <div className="relative z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 15, delay: 0.1 }}
                    className="w-20 h-20 md:w-24 md:h-24 mx-auto bg-gradient-to-br from-[var(--color-success)] to-green-400 text-white rounded-[24px] flex items-center justify-center mb-6 shadow-lg shadow-[var(--color-success)]/30"
                  >
                    <CheckCircle2
                      size={40}
                      className="md:w-12 md:h-12 drop-shadow-md"
                      strokeWidth={2.5}
                    />
                  </motion.div>

                  <h2 className="text-[26px] md:text-3xl font-black text-[var(--color-foreground)] tracking-tight mb-2">
                    Оплата успешна!
                  </h2>
                  <h3 className="text-[16px] md:text-lg font-bold text-[var(--color-success)] mb-3">
                    {selectedPlan === "pro"
                      ? "Тариф PRO активирован"
                      : "Базовый бот приобретён"}
                  </h3>
                  <p className="text-[14px] md:text-[15px] text-[var(--color-foreground-secondary)] leading-relaxed max-w-sm mx-auto mb-8">
                    Средства зачислены, новые возможности уже доступны для ваших
                    ботов.
                  </p>

                  <button
                    onClick={() => {
                      setStep("select");
                      onGoToBots();
                    }}
                    className="w-full py-3.5 px-6 bg-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/90 text-[var(--color-surface)] rounded-2xl text-[15px] font-bold shadow-md transition-all active:scale-[0.98]"
                  >
                    Вернуться к ботам
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Cancel subscription modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <XCircle size={28} />
              </div>

              <h3 className="text-xl font-bold text-[var(--color-foreground)] mb-2">
                Отменить подписку?
              </h3>
              <p className="text-[14px] text-[var(--color-foreground-secondary)] mb-8">
                Вы сможете пользоваться тарифом до конца оплаченного периода (25
                июля 2025).
                <br />
                <br />
                <span className="font-semibold text-[var(--color-foreground)]">
                  Деньги больше не спишутся.
                </span>{" "}
                После окончания срока ваши боты сверх лимита будут
                приостановлены.
              </p>

              <div className="flex flex-col gap-3 relative z-10">
                <button
                  onClick={handleCancel}
                  className="w-full py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-sm"
                >
                  Да, отменить
                </button>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="w-full py-3 px-4 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground)] font-semibold rounded-xl transition-colors border border-[var(--color-border)]"
                >
                  Не отменять
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Separate component so dark/light background works via CSS class ──
const formatPrice = (price?: number) => price === undefined ? "—" : `${price.toLocaleString("ru-RU")} ₽`;

const PlanCard = ({ plan, price }: { plan: (typeof plans)[PlanKey]; price?: number }) => {
  const isPro = plan.key === "pro";

  return (
    <div
      className={`relative flex flex-col h-full rounded-[28px] overflow-hidden ${isPro ? "plan-card-pro" : "plan-card-basic"}`}
      style={{
        background: isPro
          ? "var(--plan-bg-pro, linear-gradient(160deg, #F5F3FF 0%, #EDE9FE 80%))"
          : "var(--plan-bg-basic, linear-gradient(160deg, #EFF6FF 0%, #DBEAFE 80%))",
      }}
    >
      <style>{`
        .dark .plan-card-pro { background: linear-gradient(160deg, #221a35 0%, #1a1528 80%) !important; }
        .dark .plan-card-basic { background: linear-gradient(160deg, #1e2d42 0%, #162236 80%) !important; }
      `}</style>

      {/* PRO badge — absolute so it doesn't push other elements */}
      {isPro && (
        <div className="absolute top-4 right-4 z-10">
          <div className="px-3 py-1 bg-gradient-to-r from-[#9333EA] to-[#6366F1] text-white text-[11px] font-black rounded-full shadow">
            PRO
          </div>
        </div>
      )}

      {/* Illustration — fixed height */}
      <div className="flex justify-center items-center px-4 pt-4 shrink-0 md:h-[240px] h-[150px]">
        <img
          src={plan.image}
          alt={plan.name}
          className="w-full h-full object-contain drop-shadow-lg"
        />
      </div>

      {/* Divider with icon */}
      <div className="flex items-center gap-3 px-5 pt-2 pb-0">
        <div
          className="flex-1 h-px"
          style={{ background: `${plan.accentFrom}40` }}
        />
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm"
          style={{ background: plan.accentFrom }}
        >
          {isPro ? <Crown size={12} /> : <Star size={12} />}
        </div>
        <div
          className="flex-1 h-px"
          style={{ background: `${plan.accentFrom}40` }}
        />
      </div>

      {/* Plan info */}
      <div className="px-5 pt-2 pb-1">
        <h2 className="text-[17px] font-black text-[var(--color-foreground)] text-center mb-0.5">
          {plan.name}
        </h2>
        <p className="text-[12px] text-center text-[var(--color-foreground-secondary)] mb-2">
          {plan.tagline}
        </p>

        {/* Price */}
        <div className="flex items-baseline justify-center gap-1 mb-3">
          <span className="text-[22px] font-black text-[var(--color-foreground)]">
            {formatPrice(price)}
          </span>
          <span className="text-[12px] text-[var(--color-foreground-secondary)] font-medium">
            {plan.period}
          </span>
        </div>

        {/* Feature list */}
        <div className="space-y-1.5 mb-3">
          {plan.features.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <div
                className={`shrink-0 ${f.included ? "text-[var(--color-success)]" : "text-[var(--color-foreground-tertiary)]"}`}
              >
                {f.included ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <XCircle size={14} />
                )}
              </div>
              <span
                className={
                  f.included
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-foreground-secondary)] line-through decoration-[var(--color-foreground-tertiary)]/50"
                }
              >
                {f.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <div className="px-4 pb-4">
        <button
          className="w-full py-3 rounded-xl text-[14px] font-bold text-white shadow-lg transition-all active:scale-[0.97]"
          style={{ background: plan.ctaGradient }}
        >
          {plan.ctaLabel}
        </button>
      </div>
    </div>
  );
};
