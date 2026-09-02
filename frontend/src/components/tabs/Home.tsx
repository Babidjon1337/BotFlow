import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Bot,
  CreditCard,
  BarChart2,
  User,
  Clock,
  ArrowRight,
  Plus,
  GitMerge,
  Send,
  AlertCircle,
  RefreshCw,
  Settings,
  Copy,
  LineChart,
  Play,
  CalendarDays,
} from "lucide-react";
 import { useAppState } from "../../providers/AppStateProvider";
import { PageHeader } from "../common/PageHeader";
import { AnimatedNumber } from "../common/AnimatedNumber";



// Features list (honest, explaining why it is great)
const FEATURES = [
  {
    title: "Визуальный конструктор воронок",
    desc: "Проектируйте путь клиента в наглядном редакторе. Соединяйте блоки приветствия, предложений и выдачи контента без программирования.",
    icon: <GitMerge size={22} />,
    color: "var(--color-primary)",
    colorSoft: "var(--color-primary-soft)",
  },
  {
    title: "Автоматические дожимы (Follow-ups)",
    desc: "Возвращайте пользователей, которые остановились на полпути. Система автоматически отправит напоминание или спецпредложение через заданное время.",
    icon: <Clock size={22} />,
    color: "var(--color-success)",
    colorSoft: "var(--color-success-soft)",
  },
  {
    title: "Приём платежей прямо в боте",
    desc: "Интегрируйте ЮKassa, Robokassa или Prodamus в 2 клика. Продавайте цифровые товары, подписки или услуги с мгновенной фиксацией оплаты.",
    icon: <CreditCard size={22} />,
    color: "var(--color-accent)",
    colorSoft: "var(--color-accent-soft)",
  },
  {
    title: "Аналитика продаж",
    desc: "Следите за подтверждёнными показателями: пользователями, переходами, продажами и выручкой.",
    icon: <BarChart2 size={22} />,
    color: "#F59E0B",
    colorSoft: "rgba(245,158,11,0.1)",
  },
];

// Start steps
const START_STEPS = [
  {
    num: "1",
    title: "Создайте бота в Telegram",
    desc: "Откройте официального @BotFather, нажмите /newbot и скопируйте выданный API-токен. Это займёт меньше минуты.",
    icon: <Bot size={20} />,
    color: "#3B82F6",
    gradient: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    darkGradient:
      "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.05) 100%)",
  },
  {
    num: "2",
    title: "Подключите к платформе",
    desc: "Вставьте токен в нашей панели. Бот моментально оживёт и будет готов к настройке логики и воронок.",
    icon: <GitMerge size={20} />,
    color: "#8B5CF6",
    gradient: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
    darkGradient:
      "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.05) 100%)",
  },
  {
    num: "3",
    title: "Настройте воронку продаж",
    desc: "Соберите цепочку сообщений: добавьте текст, медиа и кнопки. Настройте таймеры для автоматических дожимов.",
    icon: <User size={20} />,
    color: "#EC4899",
    gradient: "linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)",
    darkGradient:
      "linear-gradient(135deg, rgba(236,72,153,0.1) 0%, rgba(236,72,153,0.05) 100%)",
  },
  {
    num: "4",
    title: "Начните принимать оплаты",
    desc: "Подключите ЮKassa или Robokassa в пару кликов и получайте деньги напрямую на ваш счёт. Готово к запуску трафика!",
    icon: <CreditCard size={20} />,
    color: "#10B981",
    gradient: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
    darkGradient:
      "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.05) 100%)",
  },
];

type FunnelStats = {
  views: number;
  clicks: number;
  sales: number;
  conversion: number;
  revenue: number;
  funnel_data: Array<{ name: string; value: number }>;
};

type LoadStatus = "idle" | "loading" | "ready" | "refreshing" | "error";

type ResourceState<T> = {
  botId: string | number | null;
  status: LoadStatus;
  data: T | null;
  error: string | null;
  fetchedAt: Date | null;
};


const emptyResource = <T,>(): ResourceState<T> => ({
  botId: null,
  status: "idle",
  data: null,
  error: null,
  fetchedAt: null,
});

const formatUpdatedAt = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);

const getDashboardError = (error: unknown, subject: string) => {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail && detail !== "Failed to fetch"
    ? detail
    : `Не удалось получить ${subject}. Проверьте подключение и повторите запрос.`;
};

export const Home = () => {
  const {
    appState,
    setActiveTab,
    handleCreateBotClick: onCreateBot,
    isAdmin,
    blocks,
    setSheet,
    setToastMessage,
  } = useAppState();
  const hasBot = appState.activeBot !== null;
  const isSubscribed = appState.subscriptionStatus === "active" || isAdmin;
  const paymentTariffs = blocks.find((block) => block.id === "payment")?.tariffs ?? [];

  const [statsState, setStatsState] = useState<ResourceState<FunnelStats>>(emptyResource);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month'>('week');
  const [chartData, setChartData] = useState<Array<{ date: string; sales: number; users: number }>>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);

  useEffect(() => {
    const botId = appState.activeBot?.id;
    if (!botId) return;
    let cancelled = false;
    void import("../../services/api")
      .then(({ apiService }) => {
        if (!cancelled) {
          setStatsState((previous) => {
            const canKeepData = previous.botId === botId && previous.data !== null;
            return {
              botId,
              status: canKeepData ? "refreshing" : "loading",
              data: canKeepData ? previous.data : null,
              error: null,
              fetchedAt: canKeepData ? previous.fetchedAt : null,
            };
          });
        }
        return apiService.getStats(botId);
      })
      .then((result) => {
        if (!cancelled) {
          setStatsState({
            botId,
            status: "ready",
            data: result,
            error: null,
            fetchedAt: new Date(),
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Stats err", error);
          setStatsState((previous) => ({
            botId,
            status: "error",
            data: previous.botId === botId ? previous.data : null,
            error: getDashboardError(error, "статистику"),
            fetchedAt: previous.botId === botId ? previous.fetchedAt : null,
          }));
        }
      });
    return () => { cancelled = true; };
  }, [appState.activeBot?.id, statsRefreshKey]);

  // Load chart data (daily dynamics)
  useEffect(() => {
    const botId = appState.activeBot?.id;
    if (!botId) return;
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => setIsLoadingChart(true), 0);
    void import("../../services/api")
      .then(({ apiService }) => apiService.getBotChartData(botId, chartPeriod))
      .then((data) => { if (!cancelled) setChartData(data.points); })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setIsLoadingChart(false); });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [appState.activeBot?.id, chartPeriod]);




  const stats = statsState.data;
  const isDashboardRefreshing = statsState.status === "refreshing";
  const refreshDashboard = () => {
    setStatsRefreshKey((key) => key + 1);
  };
  const copyBotLink = async () => {
    const botUrl = appState.activeBot?.botUrl
      || (appState.activeBot?.username
        ? `https://t.me/${appState.activeBot.username.replace("@", "")}`
        : "");
    if (!botUrl) {
      setToastMessage("Ссылка появится после подключения Telegram-бота");
      return;
    }
    try {
      await navigator.clipboard.writeText(botUrl);
      setToastMessage("Ссылка на бота скопирована");
    } catch {
      setToastMessage("Не удалось скопировать ссылку");
    }
  };




  // --- WELCOME SCREEN (no bot yet) ---
  if (!hasBot) {
    return (
      <motion.div
        key="home-welcome"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        className="w-full space-y-8 md:space-y-12 pb-6"
      >
        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>

        {/* Purchased Slots Banner */}
        {!isSubscribed && (appState.slotsBought || 0) > 0 && (
          <div
            className="rounded-[24px] p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border"
            style={{
              background:
                "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
              borderColor: "var(--color-primary-soft)",
              boxShadow:
                "0 8px 24px -12px rgba(var(--color-primary-rgb), 0.15)",
            }}
          >
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                style={{
                  background: "var(--color-primary-soft)",
                  color: "var(--color-primary)",
                }}
              >
                <Bot size={24} />
              </div>
              <div>
                <div className="font-bold text-[16px] text-[var(--color-foreground)] tracking-tight">
                  Доступно для создания: {appState.slotsBought}{" "}
                  {appState.slotsBought === 1
                    ? "бот"
                    : appState.slotsBought! > 1 && appState.slotsBought! < 5
                      ? "бота"
                      : "ботов"}
                </div>
                <div className="text-[13px] text-[var(--color-foreground-secondary)] mt-0.5">
                  Вы приобрели слоты для ботов. Создайте своего первого бота!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HERO SECTION (Adaptive for Mobile and PC) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden p-6 md:p-12 flex flex-col-reverse md:flex-row items-center justify-between gap-8 group"
          style={{
            borderRadius: 24,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            minHeight: "clamp(300px, 45vh, 450px)",
            boxShadow: "0 8px 30px -10px rgba(0,0,0,0.05)",
          }}
        >
          {/* Decorative accents */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-3xl hidden md:block opacity-80 transition-opacity group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(180deg, var(--color-primary), var(--color-accent), #EC4899)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-50 transition-opacity duration-700 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(ellipse at 70% 50%, rgba(99,102,241,0.08) 0%, transparent 65%)",
            }}
          />

          {/* Text and Actions */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full"
              style={{
                background: "var(--color-primary-soft)",
                color: "var(--color-primary)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Bot size={14} />
              Конструктор Telegram ботов
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[var(--color-foreground)] leading-[1.1] mb-5 tracking-tight"
            >
              Создай Telegram-бота
              <br className="hidden md:block" />{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                без кода за 5 минут
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="text-[15px] md:text-base text-[var(--color-foreground-secondary)] max-w-[480px] leading-relaxed mb-8"
            >
              Создавайте умные воронки продаж, принимайте оплаты через ЮKassa,
              Robokassa или Prodamus и возвращайте клиентов автоматическими
              дожимами.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
            >
              <button
                onClick={onCreateBot}
                className="btn-primary-saas flex items-center justify-center gap-2 w-full sm:w-auto whitespace-nowrap active:scale-95 transition-transform"
                style={{
                  height: 52,
                  padding: "0 32px",
                  fontSize: 16,
                  borderRadius: 16,
                  boxShadow: "0 10px 24px -6px rgba(99,102,241,0.4)",
                }}
              >
                <Plus size={18} />
                Создать бота
              </button>
              <button
                onClick={() => setActiveTab("subscription")}
                className="btn btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto whitespace-nowrap active:scale-95 transition-transform"
                style={{
                  height: 52,
                  padding: "0 24px",
                  fontSize: 15,
                  borderRadius: 16,
                }}
              >
                Тарифы
                <ArrowRight size={15} />
              </button>
            </motion.div>
          </div>

          {/* Large Robot Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{
              delay: 0.2,
              duration: 0.5,
              type: "spring",
              bounce: 0.4,
            }}
            className="relative z-10 shrink-0 flex items-center justify-center w-[280px] md:w-[360px] lg:w-[420px] mb-4 md:mb-0 mt-4 md:mt-0"
          >
            <div
              className="absolute w-[240px] h-[240px] md:w-[340px] md:h-[340px] rounded-full blur-3xl opacity-50 pointer-events-none transition-opacity duration-700 group-hover:opacity-80"
              style={{
                background:
                  "radial-gradient(circle, var(--color-primary-soft) 0%, transparent 70%)",
              }}
            />
            <motion.img
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              src="/welcome_robot.png"
              alt="BotFlow Welcome Robot"
              className="w-full h-auto object-contain select-none transition-transform duration-500 group-hover:scale-105 group-hover:rotate-1"
              style={{
                maxHeight: "clamp(240px, 45vh, 400px)",
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.12))",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </motion.div>
        </motion.div>

        {/* WHY BOT FATHER SECTION / FEATURES */}
        <div className="space-y-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-bold text-[var(--color-foreground)] tracking-tight">
              Возможности платформы
            </h2>
            <p className="text-xs md:text-sm text-[var(--color-foreground-secondary)] mt-1">
              Все необходимые инструменты для автоматизации вашего бизнеса в
              одном месте
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {FEATURES.map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
                whileHover={{
                  y: -4,
                  boxShadow: "0 12px 24px -8px rgba(0,0,0,0.08)",
                }}
                className="p-5 md:p-6 flex gap-4 items-start border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors group cursor-default"
                style={{ borderRadius: 20 }}
              >
                <div
                  className="w-10 h-10 md:w-12 md:h-12 rounded-[14px] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: feat.colorSoft, color: feat.color }}
                >
                  {feat.icon}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-[15px] font-bold text-[var(--color-foreground)] leading-tight">
                    {feat.title}
                  </h3>
                  <p className="text-[13px] md:text-sm text-[var(--color-foreground-secondary)] leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* HOW TO START STEPS */}
        <div className="space-y-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-bold text-[var(--color-foreground)] tracking-tight">
              Как начать работу?
            </h2>
            <p className="text-xs md:text-sm text-[var(--color-foreground-secondary)] mt-1">
              Четыре простых шага до запуска вашего первого автоматизированного
              Telegram-бота
            </p>
          </div>
          <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-6 -mx-4 px-4 md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0 gap-4 md:gap-6">
            {START_STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }}
                whileHover={{
                  y: -6,
                  boxShadow: "0 16px 32px -12px rgba(0,0,0,0.1)",
                }}
                className="p-6 relative overflow-hidden shrink-0 w-[280px] md:w-auto snap-center group transition-colors cursor-default md:bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)]"
                style={{
                  borderRadius: 24,
                  background: "var(--color-surface)", // fallback
                  border: "1px solid var(--color-border)",
                }}
              >
                {/* Decorative large background number */}
                <div
                  className="absolute -right-2 -bottom-4 font-black select-none pointer-events-none opacity-[0.08] group-hover:opacity-[0.15] transition-all duration-500 group-hover:scale-110"
                  style={{ fontSize: 140, lineHeight: 1, color: step.color }}
                >
                  {step.num}
                </div>

                {/* Glow effect */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-20 group-hover:opacity-50 transition-opacity duration-500"
                  style={{ background: step.color }}
                />

                <div className="flex items-center gap-4 mb-5 relative z-10">
                  <div
                    className="w-12 h-12 shrink-0 rounded-[14px] flex items-center justify-center font-bold text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `linear-gradient(135deg, ${step.color}, ${step.color}dd)`,
                    }}
                  >
                    {step.icon}
                  </div>
                  <h3 className="text-[15px] font-bold text-[var(--color-foreground)] leading-tight">
                    {step.title}
                  </h3>
                </div>
                <p className="text-[13px] md:text-sm text-[var(--color-foreground-secondary)] leading-relaxed relative z-10">
                  {step.desc}
                </p>

                {/* Step connector for desktop */}
                {i < START_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-12 -right-3 w-6 border-t-[2.5px] border-dotted border-[var(--color-border)] z-0 opacity-50" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // --- DASHBOARD SCREEN (has bot) ---
  return (
    <motion.div
      key="home-dashboard"
      initial={{ opacity: 0, filter: "blur(4px)", y: 8 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      exit={{ opacity: 0, filter: "blur(4px)" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6 pb-8"
    >
      <div className="flex items-center justify-between gap-3">
        <PageHeader kicker="Обзор" tone="blue" title="Обзор бота" hint={appState.activeBot?.name} />
        <button
          type="button"
          onClick={refreshDashboard}
          disabled={isDashboardRefreshing}
          className="btn btn-secondary h-10 shrink-0 px-3 text-[13px]"
          aria-busy={isDashboardRefreshing || undefined}
        >
          <RefreshCw size={15} className={isDashboardRefreshing ? "animate-spin" : ""} />
          {isDashboardRefreshing ? "Обновляем" : "Обновить"}
        </button>
      </div>

      {/* Bot Revenue Dashboard Header */}
      <div className="card-saas flex w-full flex-col p-5 sm:p-6">
        {statsState.status === "loading" || statsState.status === "idle" ? (
          <div className="animate-pulse" aria-label="Загрузка статистики">
            <div className="h-3 w-36 rounded bg-[var(--color-surface-3)] mb-4" />
            <div className="h-10 w-48 rounded-lg bg-[var(--color-surface-3)] mb-3" />
            <div className="h-3 w-28 rounded bg-[var(--color-surface-3)]" />
          </div>
        ) : statsState.status === "error" && !stats ? (
          <div className="flex flex-col items-start gap-3" role="alert">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] flex items-center justify-center">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-[16px] font-bold text-[var(--color-foreground)]">Статистика временно недоступна</div>
              <div className="text-[13px] text-[var(--color-foreground-secondary)] mt-1 max-w-[520px]">{statsState.error}</div>
            </div>
            <button
              type="button"
              onClick={refreshDashboard}
              className="h-10 px-4 rounded-xl bg-[var(--color-primary)] text-white text-[13px] font-bold flex items-center gap-2"
            >
              <RefreshCw size={15} /> Повторить
            </button>
          </div>
        ) : stats ? (
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--color-foreground-secondary)]">Выручка</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--color-foreground-secondary)]" title="Период будет доступен после подключения истории аналитики">
                  <CalendarDays size={12} aria-hidden="true" /> За всё время
                </span>
              </div>
              <div
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${appState.activeBot?.status === "active" ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" : "bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)]"}`}
              >
                {appState.activeBot?.status === "active" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                )}
                {appState.activeBot?.status === "active" ? "Бот работает" : "Черновик"}
              </div>
            </div>
            <div>
              <div className="money-lg text-foreground">
                <AnimatedNumber
                  value={stats.revenue}
                  format={(n) =>
                    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽"
                  }
                />
              </div>
              <div className="mt-2 text-[12px] font-medium text-[var(--color-foreground-tertiary)]">
                {statsState.fetchedAt ? `Обновлено в ${formatUpdatedAt(statsState.fetchedAt)}` : ""}
              </div>
            </div>
          </div>
        ) : null}

        {statsState.status === "error" && stats && (
          <div className="mt-4 p-3 rounded-xl bg-[var(--color-warning-soft)] text-[var(--color-foreground-secondary)] text-[13px] flex flex-col sm:flex-row sm:items-center gap-2 justify-between" role="status">
            <span>Не удалось обновить данные. Показана версия на {statsState.fetchedAt ? formatUpdatedAt(statsState.fetchedAt) : "момент последней загрузки"}.</span>
            <button type="button" onClick={refreshDashboard} className="font-bold text-[var(--color-primary)] shrink-0">Повторить</button>
          </div>
        )}
      </div>

      {stats && appState.activeBot?.status !== "active" && (
        <section className="card-saas flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="dashboard-next-step">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
              <Play size={19} aria-hidden="true" />
            </div>
            <div>
              <h2 id="dashboard-next-step" className="text-[15px] font-semibold text-[var(--color-foreground)]">Бот не принимает новых клиентов</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">Проверьте готовность воронки и запустите бота, когда всё будет настроено.</p>
            </div>
          </div>
          <button type="button" onClick={() => setActiveTab("build")} className="btn btn-primary h-10 shrink-0 px-4 text-[13px]">Перейти к запуску</button>
        </section>
      )}

      {stats && appState.activeBot?.status === "active" && paymentTariffs.length > 0 && !appState.activeBot.hasPaymentCredentials && (
        <section className="card-saas flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="dashboard-next-step">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
              <CreditCard size={19} aria-hidden="true" />
            </div>
            <div>
              <h2 id="dashboard-next-step" className="text-[15px] font-semibold text-[var(--color-foreground)]">Приём оплаты не настроен</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">Добавьте реквизиты кассы, чтобы клиенты могли оплачивать выбранные тарифы.</p>
            </div>
          </div>
          <button type="button" onClick={() => setSheet("bot_settings")} className="btn btn-primary h-10 shrink-0 px-4 text-[13px]"><Settings size={15} /> Настроить кассу</button>
        </section>
      )}

      {stats && appState.activeBot?.status === "active" && (paymentTariffs.length === 0 || appState.activeBot.hasPaymentCredentials) && stats.views === 0 && (
        <section className="card-saas flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="dashboard-next-step">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <Send size={19} aria-hidden="true" />
            </div>
            <div>
              <h2 id="dashboard-next-step" className="text-[15px] font-semibold text-[var(--color-foreground)]">Пригласите первых посетителей</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">Скопируйте ссылку на бота и отправьте её аудитории. Первый запуск появится в статистике.</p>
            </div>
          </div>
          <button type="button" onClick={() => void copyBotLink()} className="btn btn-primary h-10 shrink-0 px-4 text-[13px]"><Copy size={15} /> Скопировать ссылку</button>
        </section>
      )}

      {/* KPI row */}
      {stats && <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        {[
          {
            label: "Посетители",
            value: stats.views,
          },
          {
            label: "Продажи",
            value: stats.sales,
          },
          {
            label: "Конверсия",
            value: `${stats.conversion}%`,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="card-saas flex min-w-0 flex-col items-center px-2 py-3 sm:px-4 sm:py-4"
          >
            <div
              style={{
                fontSize: "clamp(20px, 6vw, 24px)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "var(--color-foreground)",
                marginBottom: "2px",
              }}
            >
              {stat.value}
            </div>
            <div
              className="text-center text-[11px] font-medium leading-tight text-[var(--color-foreground-secondary)] sm:text-[12px]"
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>}

      {stats && (
        <section className="card-saas p-4 sm:p-5" aria-labelledby="timeline-chart-title">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 id="timeline-chart-title" className="text-[15px] font-semibold text-[var(--color-foreground)]">Динамика бизнеса</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Продажи и новые пользователи по дням.</p>
            </div>
            {/* Period switcher */}
            <div className="flex shrink-0 rounded-lg bg-[var(--color-surface-2)] p-0.5 border border-[var(--color-border)]">
              {(['week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                    chartPeriod === p
                      ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm'
                      : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  {p === 'week' ? 'Неделя' : 'Месяц'}
                </button>
              ))}
            </div>
          </div>

          {isLoadingChart ? (
            <div className="mt-3 flex min-h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : chartData.length > 0 && chartData.some((d) => d.sales > 0 || d.users > 0) ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--color-foreground-secondary)', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      fontSize: '12px',
                      color: 'var(--color-foreground)',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    formatter={(value) => value === 'sales' ? 'Оплата' : 'Пользователи'}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="var(--color-success)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-success)' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 5 }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-2 flex min-h-36 flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-4 text-center">
              <LineChart size={20} className="text-[var(--color-foreground-tertiary)]" aria-hidden="true" />
              <p className="mt-2 text-[13px] font-medium text-[var(--color-foreground)]">История по дням появится здесь</p>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Данные начнут накапливаться автоматически после первых событий.</p>
            </div>
          )}
        </section>
      )}

      {stats && (
        <section className="card-saas p-4 sm:p-5" aria-labelledby="sales-funnel-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="sales-funnel-title" className="text-[15px] font-semibold text-[var(--color-foreground)]">Воронка продаж</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Покажет, на каком этапе пользователи перестают двигаться к оплате.</p>
            </div>
            <BarChart2 size={18} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
          </div>
          {stats.funnel_data && stats.funnel_data.length > 0 && stats.funnel_data.some(d => d.value > 0) ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {stats.funnel_data.map((step, idx: number) => {
                const maxFunnelValue = Math.max(...stats.funnel_data.map(d => d.value), 1);
                const percentage = Math.max((step.value / maxFunnelValue) * 100, 2); // min 2% for visibility
                const prevValue = idx > 0 ? stats.funnel_data[idx - 1].value : null;
                const conversionFromPrev = prevValue ? Math.round((step.value / prevValue) * 100) : (idx === 0 ? 100 : 0);
                
                return (
                  <div key={step.name} className="group relative flex flex-col gap-3 rounded-[14px] bg-[var(--color-surface)] p-4 border border-[var(--color-border)] shadow-sm hover:border-[var(--color-border-strong)] transition-all">
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] shadow-xs text-[12px] font-bold text-[var(--color-foreground-tertiary)] group-hover:text-[var(--color-primary)] transition-colors">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="block text-[14px] font-semibold text-[var(--color-foreground)]">{step.name}</span>
                          {idx > 0 && (
                            <span className="block text-[11px] font-medium text-[var(--color-foreground-secondary)] mt-0.5">
                              Конверсия: <span className={conversionFromPrev > 50 ? 'text-[var(--color-success)] font-medium' : 'text-[var(--color-foreground)] font-medium'}>{conversionFromPrev}%</span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end text-right">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[20px] font-bold tracking-tight text-[var(--color-foreground)] tabular-nums">
                            {step.value}
                          </span>
                          <span className="text-[12px] font-medium text-[var(--color-foreground-secondary)]">
                            {step.value === 1 ? 'чел' : 'чел'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div 
                        className="absolute bottom-0 left-0 top-0 rounded-full bg-[var(--color-primary)] transition-all duration-1000 ease-out"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 flex min-h-32 flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-4 text-center">
              <GitMerge size={20} className="text-[var(--color-foreground-tertiary)]" aria-hidden="true" />
              <p className="mt-2 text-[13px] font-medium text-[var(--color-foreground)]">Детальная воронка пока недоступна</p>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Переходы между этапами ещё не сохраняются в истории, поэтому мы не подменяем их текущим положением клиентов.</p>
              <button type="button" onClick={() => setActiveTab("flow")} className="mt-3 text-[13px] font-semibold text-[var(--color-primary)] hover:underline">Открыть воронку</button>
            </div>
          )}
        </section>
      )}

      {!isSubscribed && (
        <section className="card-saas flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="dashboard-plan-title">
          <div className="min-w-0">
            <h2 id="dashboard-plan-title" className="text-[15px] font-semibold text-[var(--color-foreground)]">
              {appState.subscriptionStatus === "expired" ? "Подписка бота истекла" : "Подписка бота — 990 ₽/мес"}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
              {appState.subscriptionStatus === "expired"
                ? "Продлите подписку, чтобы опубликованные боты снова работали."
                : "Публикуйте бота, принимайте оплату и рассылайте — без лимитов на сообщения."}
            </p>
          </div>
          <button type="button" onClick={() => setActiveTab("subscription")} className="btn btn-secondary h-10 shrink-0 px-4 text-[13px]">
            {appState.subscriptionStatus === "expired" ? "Продлить" : "Оформить"}
          </button>
        </section>
      )}
    </motion.div>
  );
};
