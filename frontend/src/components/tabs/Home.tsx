import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Users,
  Clock,
  ArrowRight,
  Plus,
  GitMerge,
  X,
  CheckCircle2,
  Send,
  Check,
  ArrowLeft,
  Search,
  AlertCircle,
  RefreshCw,
  Settings,
  Copy,
  LineChart,
  Play,
  CalendarDays,
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";

/** The editor stores HTML for Telegram; selection cards need a safe, readable preview. */
const toPlainPreviewText = (value: string | null | undefined) => {
  if (!value) return "";

  const withLineBreaks = value.replace(
    /<\/?(?:p|div|li|h[1-6])\b[^>]*>|<br\s*\/?\s*>/gi,
    "\n",
  );
  const element = document.createElement("textarea");
  element.innerHTML = withLineBreaks.replace(/<[^>]*>/g, "");
  return element.value.replace(/\n{3,}/g, "\n\n").trim();
};


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

type LeadView = {
  telegramId: number;
  username: string;
  firstName?: string;
  createdAt?: string;
  hasPurchased?: boolean;
  name: string;
  time: string;
  paid: boolean;
};

type LoadStatus = "idle" | "loading" | "ready" | "refreshing" | "error";

type ResourceState<T> = {
  botId: string | number | null;
  status: LoadStatus;
  data: T | null;
  error: string | null;
  fetchedAt: Date | null;
};

type LeadsData = { items: LeadView[]; total: number };

const emptyResource = <T,>(): ResourceState<T> => ({
  botId: null,
  status: "idle",
  data: null,
  error: null,
  fetchedAt: null,
});

const formatUpdatedAt = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value) + " ₽";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [showAllClients, setShowAllClients] = useState(false);
  const [selectedClientForInvoice, setSelectedClientForInvoice] = useState<LeadView | null>(null);
  const [selectedTariffs, setSelectedTariffs] = useState<string[]>([]);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [isInvoiceSent, setIsInvoiceSent] = useState(false);
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
    setIsLoadingChart(true);
    void import("../../services/api")
      .then(({ apiService }) => apiService.getBotChartData(botId, chartPeriod))
      .then((data) => { if (!cancelled) setChartData(data.points); })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setIsLoadingChart(false); });
    return () => { cancelled = true; };
  }, [appState.activeBot?.id, chartPeriod]);

  useEffect(() => {
    if (!showAllClients) return;
    const tg = (window as Window & { Telegram?: { WebApp?: { BackButton?: { show: () => void; hide: () => void; onClick: (handler: () => void) => void; offClick: (handler: () => void) => void } } } }).Telegram?.WebApp;
    const backButton = tg?.BackButton;
    if (backButton) {
      backButton.show();
      const handleBack = () => {
        if (selectedClientForInvoice) {
          setSelectedClientForInvoice(null);
          setSelectedTariffs([]);
          setIsInvoiceSent(false);
        } else {
          setShowAllClients(false);
          setSelectedClientForInvoice(null);
          setSelectedTariffs([]);
          setIsInvoiceSent(false);
          setModalSearchQuery("");
        }
      };
      backButton.onClick(handleBack);
      return () => {
        backButton.hide();
        backButton.offClick(handleBack);
      };
    }
  }, [showAllClients, selectedClientForInvoice]);

  const AVATAR_COLORS = [
    "from-red-500 to-rose-600",
    "from-orange-500 to-amber-600",
    "from-amber-500 to-yellow-600",
    "from-lime-500 to-green-600",
    "from-green-500 to-emerald-600",
    "from-teal-500 to-cyan-600",
    "from-cyan-500 to-sky-600",
    "from-sky-500 to-blue-600",
    "from-blue-500 to-indigo-600",
    "from-indigo-500 to-violet-600",
    "from-violet-500 to-purple-600",
    "from-fuchsia-500 to-pink-600",
    "from-rose-400 to-red-500",
    "from-orange-400 to-amber-500",
    "from-amber-400 to-yellow-500",
    "from-lime-400 to-green-500",
    "from-emerald-400 to-teal-500",
    "from-cyan-400 to-sky-500",
    "from-blue-400 to-indigo-500",
    "from-violet-400 to-fuchsia-500",
    "from-pink-400 to-rose-500",
    "from-red-600 to-red-800",
    "from-green-600 to-emerald-800",
    "from-blue-600 to-indigo-800",
    "from-purple-600 to-fuchsia-800",
    "from-orange-600 to-red-800",
    "from-teal-600 to-cyan-800",
    "from-yellow-500 to-orange-600",
    "from-sky-600 to-blue-800",
    "from-pink-600 to-rose-800",
  ];

  const getAvatarColor = (username: string) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  const [leadsState, setLeadsState] = useState<ResourceState<LeadsData>>(emptyResource);
  const [leadsRefreshKey, setLeadsRefreshKey] = useState(0);

  useEffect(() => {
    const botId = appState.activeBot?.id;
    if (!botId) return;
    let cancelled = false;
    void import("../../services/api")
      .then(({ apiService }) => {
        if (!cancelled) {
          setLeadsState((previous) => {
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
        return apiService.getLeads(botId, "", 1, 50);
      })
      .then((res) => {
        if (!cancelled) {
            const mappedLeads = (res.leads || []).map((lead) => {
              const l = lead as { telegramId?: number; username?: string; firstName?: string; createdAt?: string; hasPurchased?: boolean };
              return {
              ...l,
              telegramId: l.telegramId ?? 0,
              name: l.firstName || "Без имени",
              time: l.createdAt
                ? new Date(l.createdAt).toLocaleDateString()
                : "",
              username: l.username ?? "",
              paid: l.hasPurchased === true,
              };
            });
          setLeadsState({
            botId,
            status: "ready",
            data: { items: mappedLeads, total: res.total },
            error: null,
            fetchedAt: new Date(),
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Leads err", error);
          setLeadsState((previous) => ({
            botId,
            status: "error",
            data: previous.botId === botId ? previous.data : null,
            error: getDashboardError(error, "список клиентов"),
            fetchedAt: previous.botId === botId ? previous.fetchedAt : null,
          }));
        }
      });
    return () => { cancelled = true; };
  }, [appState.activeBot?.id, leadsRefreshKey]);

  const stats = statsState.data;
  const leads = leadsState.data?.items ?? [];
  const leadsTotal = leadsState.data?.total ?? 0;
  const isDashboardRefreshing =
    statsState.status === "refreshing" || leadsState.status === "refreshing";
  const refreshDashboard = () => {
    setStatsRefreshKey((key) => key + 1);
    setLeadsRefreshKey((key) => key + 1);
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

  const sendInvoice = async () => {
    if (!appState.activeBot || !selectedClientForInvoice || selectedTariffs.length === 0) return;
    setIsSendingInvoice(true);
    try {
      const { apiService } = await import("../../services/api");
      await apiService.sendInvoice(appState.activeBot.id, selectedClientForInvoice.telegramId, selectedTariffs);
      setIsInvoiceSent(true);
      setTimeout(() => {
        setSelectedClientForInvoice(null);
        setSelectedTariffs([]);
        setIsInvoiceSent(false);
      }, 1800);
    } catch (error) {
      console.error("Invoice err", error);
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const filteredClients = leads.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.username?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const modalFilteredClients = leads.filter(
    (c) =>
      c.name?.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
      c.username?.toLowerCase().includes(modalSearchQuery.toLowerCase()),
  );

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
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-tight text-[var(--color-foreground)]">Обзор бота</h1>
          <p className="mt-0.5 truncate text-[12px] text-[var(--color-foreground-secondary)]">{appState.activeBot?.name}</p>
        </div>
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
              <div className="text-[32px] font-extrabold leading-none tracking-tight text-[var(--color-foreground)] sm:text-[36px]">
                {formatCurrency(stats.revenue)}
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
          {stats.funnel_data && stats.funnel_data.length > 0 && stats.funnel_data.some((d: any) => d.value > 0) ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {stats.funnel_data.map((step: any, idx: number) => {
                const maxFunnelValue = Math.max(...stats.funnel_data.map((d: any) => d.value), 1);
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

      {/* Latest leads and their payment status */}
      <div className="p-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
              <Users size={18} />
            </div>
            <span className="text-[17px] font-bold text-[var(--color-foreground)] tracking-tight">
              Последние клиенты
            </span>
          </div>
          <div className="flex items-center gap-2">
            {leadsState.fetchedAt && (
              <span className="hidden sm:inline text-[12px] text-[var(--color-foreground-tertiary)]">
                {formatUpdatedAt(leadsState.fetchedAt)}
              </span>
            )}
            <span className="text-[12px] font-bold px-2.5 py-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-foreground-secondary)] rounded-full">
              {leadsState.data ? `Всего: ${leadsTotal}` : "Всего: —"}
            </span>
          </div>
        </div>

        <p className="-mt-2 mb-4 text-[12px] text-[var(--color-foreground-secondary)]">Новые лиды и состояние их оплаты.</p>

        {leadsState.status === "error" && leadsState.data && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--color-warning-soft)] text-[13px] text-[var(--color-foreground-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2" role="status">
            <span>Список не обновился. Показаны данные на {leadsState.fetchedAt ? formatUpdatedAt(leadsState.fetchedAt) : "момент последней загрузки"}.</span>
            <button type="button" onClick={refreshDashboard} className="font-bold text-[var(--color-primary)] shrink-0">Повторить</button>
          </div>
        )}

        {leadsState.status === "loading" || leadsState.status === "idle" ? (
          <div className="space-y-3 animate-pulse" aria-label="Загрузка списка клиентов">
            <div className="h-10 rounded-xl bg-[var(--color-surface-2)]" />
            {[0, 1, 2].map((item) => <div key={item} className="h-16 rounded-xl bg-[var(--color-surface-2)]" />)}
          </div>
        ) : leadsState.status === "error" && !leadsState.data ? (
          <div className="py-6 flex flex-col items-center text-center" role="alert">
            <AlertCircle size={24} className="text-[var(--color-danger)] mb-3" />
            <div className="text-[15px] font-bold text-[var(--color-foreground)]">Клиенты временно недоступны</div>
            <div className="text-[13px] text-[var(--color-foreground-secondary)] mt-1 max-w-[440px]">{leadsState.error}</div>
            <button type="button" onClick={refreshDashboard} className="mt-4 h-10 px-4 rounded-xl bg-[var(--color-primary)] text-white text-[13px] font-bold flex items-center gap-2">
              <RefreshCw size={15} /> Повторить
            </button>
          </div>
        ) : leadsState.data ? <>
        <div className="mb-3.5">
          <div className="relative flex items-center">
            <Search
              size={16}
              className="absolute left-3.5 text-[var(--color-foreground-tertiary)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Поиск по имени или @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl text-[14px] text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] transition-all placeholder-[var(--color-foreground-tertiary)]"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="divide-y divide-[var(--color-border)]/50 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] overflow-hidden">
            {filteredClients.slice(0, 3).length > 0 ? (
              filteredClients.slice(0, 3).map((client, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3.5 hover:bg-[var(--color-surface-2)]/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(client.username)} text-white flex items-center justify-center font-bold text-[14px] shrink-0 shadow-xs`}
                    >
                      {client.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-[var(--color-foreground)] truncate">
                          {client.name}
                        </span>
                        <span className="text-[12px] text-[var(--color-foreground-tertiary)] shrink-0">
                          {client.time ? `Пришёл ${client.time}` : ""}
                        </span>
                      </div>
                      <div className="text-[12px] text-[var(--color-foreground-secondary)] truncate flex items-center gap-1.5 mt-0.5">
                        <span>{client.username}</span>
                        <span className="w-1 h-1 rounded-full bg-[var(--color-border)] shrink-0" />
                        {client.paid ? (
                          <span className="text-[var(--color-success)] font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} className="shrink-0" />
                            <span>Оплата подтверждена</span>
                          </span>
                        ) : (
                          <span className="text-[var(--color-warning)] font-medium flex items-center gap-1">
                            <Clock size={13} className="shrink-0" />
                            <span>Ожидает оплату</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!client.paid && (
                    <button
                      onClick={() => {
                        setSelectedClientForInvoice(client);
                        setSelectedTariffs([]);
                        setShowAllClients(true);
                        document.body.style.overflow = "hidden";
                      }}
                      className="shrink-0 px-3.5 py-1.5 ml-3 rounded-xl text-[13px] font-bold transition-all bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white shadow-2xs active:scale-95"
                    >
                      Выставить счет
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 px-4 text-[13px] text-[var(--color-foreground-tertiary)]">
                <div>
                  {leadsTotal === 0
                    ? "Клиентов пока нет. Они появятся после первого запуска бота."
                    : "По вашему запросу ничего не найдено."}
                </div>
                {searchQuery && leadsTotal > 0 && (
                  <button type="button" onClick={() => setSearchQuery("")} className="mt-3 font-bold text-[var(--color-primary)]">
                    Сбросить поиск
                  </button>
                )}
              </div>
            )}
          </div>

          {(searchQuery ? filteredClients.length > 3 : leadsTotal > 3) && (
            <button
              onClick={() => {
                setSelectedClientForInvoice(null);
                setSelectedTariffs([]);
                setIsInvoiceSent(false);
                setModalSearchQuery("");
                setShowAllClients(true);
                document.body.style.overflow = "hidden";
              }}
              className="w-full py-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] font-bold text-[var(--color-foreground)] hover:bg-[var(--color-surface-3)] transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>
                {searchQuery
                  ? `Показать результаты (${filteredClients.length})`
                  : `Открыть список (${Math.min(leads.length, leadsTotal)} из ${leadsTotal})`}
              </span>
              <ArrowRight size={15} className="opacity-70" />
            </button>
          )}
          {leadsTotal > leads.length && (
            <div className="text-[12px] text-[var(--color-foreground-tertiary)] text-center px-3">
              Показаны первые {leads.length} клиентов. Поиск работает по загруженному списку.
            </div>
          )}
        </div>
        </> : null}
      </div>

      {!isSubscribed && (
        <section className="card-saas flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="dashboard-plan-title">
          <div className="min-w-0">
            <h2 id="dashboard-plan-title" className="text-[15px] font-semibold text-[var(--color-foreground)]">
              {appState.subscriptionStatus === "expired" ? "PRO-подписка истекла" : "Нужно больше возможностей?"}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground-secondary)]">
              {appState.subscriptionStatus === "expired"
                ? "Продлите подписку, чтобы снова использовать возможности PRO."
                : "PRO открывает одновременную работу нескольких ботов и расширенные возможности."}
            </p>
          </div>
          <button type="button" onClick={() => setActiveTab("subscription")} className="btn btn-secondary h-10 shrink-0 px-4 text-[13px]">
            {appState.subscriptionStatus === "expired" ? "Продлить" : "Посмотреть PRO"}
          </button>
        </section>
      )}

      {/* Full Screen / Modal Clients Sheet via Portal */}
      {createPortal(
        <AnimatePresence>
          {showAllClients && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-[var(--color-surface)] md:bg-transparent"
            >
              {/* Dark blur overlay for PC only - covers ENTIRE screen */}
              <div
                onClick={() => {
                  setShowAllClients(false);
                  setSelectedClientForInvoice(null);
                  setSelectedTariffs([]);
                  setIsInvoiceSent(false);
                  setModalSearchQuery("");
                  document.body.style.overflow = "unset";
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm hidden md:block transition-all"
              />

              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 220 }}
                className="bg-[var(--color-surface)] flex flex-col w-full h-[100dvh] md:w-[580px] md:h-[620px] md:max-h-[85vh] md:rounded-[24px] md:border md:border-[var(--color-border)] pointer-events-auto md:shadow-[0_24px_80px_rgba(0,0,0,0.5)] relative overflow-hidden z-10"
              >
                {/* Modal Header */}
                <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10 pt-[max(20px,calc(env(safe-area-inset-top,0px)+16px))] md:pt-5">
                  <div className="flex items-center gap-3">
                    {selectedClientForInvoice && (
                      <button
                        onClick={() => {
                          setSelectedClientForInvoice(null);
                          setSelectedTariffs([]);
                          setIsInvoiceSent(false);
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors active:scale-95"
                        title="Назад к списку клиентов"
                      >
                        <ArrowLeft size={18} />
                      </button>
                    )}
                    <div>
                      <h2 className="text-[18px] font-bold text-[var(--color-foreground)] leading-tight">
                        {selectedClientForInvoice
                          ? `Выставить счет`
                          : `Клиенты (${leadsTotal})`}
                      </h2>
                      {selectedClientForInvoice && (
                        <div className="text-[13px] text-[var(--color-foreground-secondary)] mt-0.5">
                          {selectedClientForInvoice.name}{" "}
                          <span className="opacity-60">
                            {selectedClientForInvoice.username}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowAllClients(false);
                      setSelectedClientForInvoice(null);
                      setSelectedTariffs([]);
                      setIsInvoiceSent(false);
                      setModalSearchQuery("");
                      document.body.style.overflow = "unset";
                    }}
                    className="hidden md:flex w-9 h-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] transition-colors active:scale-95"
                  >
                    <X size={18} />
                  </button>
                </div>

                {selectedClientForInvoice ? (
                  <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col justify-between custom-scrollbar">
                    {isInvoiceSent ? (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center h-full text-center py-16"
                      >
                        <div className="w-16 h-16 bg-[var(--color-success-soft)] text-[var(--color-success)] rounded-full flex items-center justify-center mb-5 shadow-inner">
                          <CheckCircle2 size={36} />
                        </div>
                        <h3 className="text-[20px] font-bold text-[var(--color-foreground)] mb-2">
                          Счет успешно отправлен!
                        </h3>
                        <p className="text-[14px] text-[var(--color-foreground-secondary)] max-w-[280px]">
                          {selectedClientForInvoice.name} получит сообщение с
                          кнопкой на оплату.
                        </p>
                      </motion.div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <div className="mb-1">
                            <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">
                              Выберите тариф
                            </h3>
                            <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-1">
                              Отметьте один или несколько тарифов для
                              выставления счета клиенту.
                            </p>
                          </div>

                          <div className="flex flex-col gap-3">
                            {paymentTariffs.map((tariff) => {
                              const isSelected = selectedTariffs.includes(
                                tariff.id,
                              );
                              return (
                                <div
                                  key={tariff.id}
                                  onClick={() =>
                                    setSelectedTariffs((prev) =>
                                      prev.includes(tariff.id)
                                        ? prev.filter((t) => t !== tariff.id)
                                        : [...prev, tariff.id],
                                    )
                                  }
                                  className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                                    isSelected
                                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40"
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[15px] font-bold text-[var(--color-foreground)] mb-1">
                                      {toPlainPreviewText(tariff.name)}
                                    </div>
                                    <div className="text-[13px] text-[var(--color-foreground-secondary)] leading-snug pr-2">
                                      {toPlainPreviewText(tariff.description)}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-[15px] font-extrabold text-[var(--color-foreground)] whitespace-nowrap">
                                      {tariff.price}
                                    </div>
                                    <div
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                        isSelected
                                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                                          : "border-[var(--color-border)]"
                                      }`}
                                    >
                                      {isSelected && (
                                        <Check
                                          size={12}
                                          className="text-white"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-5 mt-5 border-t border-[var(--color-border)]">
                          <button
                            onClick={() => void sendInvoice()}
                            disabled={
                              selectedTariffs.length === 0 || isSendingInvoice
                            }
                            className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold transition-all ${
                              selectedTariffs.length === 0 ||
                              isSendingInvoice ||
                              isInvoiceSent
                                ? "bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)] cursor-not-allowed"
                                : "bg-[var(--color-primary)] text-white hover:bg-[#4338CA] shadow-lg shadow-[var(--color-primary)]/25 active:scale-[0.98]"
                            }`}
                          >
                            {isSendingInvoice ? (
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <>
                                <Send size={18} />
                                <span>Отправить счет клиенту</span>
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
                      <div className="relative flex items-center">
                        <Search
                          size={16}
                          className="absolute left-3.5 text-[var(--color-foreground-tertiary)] pointer-events-none"
                        />
                        <input
                          type="text"
                          placeholder="Поиск по имени или @username..."
                          value={modalSearchQuery}
                          onChange={(e) => setModalSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl text-[14px] text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] transition-all placeholder-[var(--color-foreground-tertiary)]"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 p-2 pr-1.5 flex flex-col divide-y divide-[var(--color-border)]/50 custom-scrollbar">
                      {modalFilteredClients.length > 0 ? (
                        modalFilteredClients.map((client, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3.5 rounded-xl hover:bg-[var(--color-surface-2)]/60 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(client.username)} text-white flex items-center justify-center font-bold text-[14px] shrink-0 shadow-xs`}
                              >
                                {client.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px] font-bold text-[var(--color-foreground)] truncate">
                                    {client.name}
                                  </span>
                                  <span className="text-[12px] text-[var(--color-foreground-tertiary)] shrink-0">
                                    {client.time}
                                  </span>
                                </div>
                                <div className="text-[12px] text-[var(--color-foreground-secondary)] truncate flex items-center gap-1.5 mt-0.5">
                                  <span>{client.username}</span>
                                  <span className="w-1 h-1 rounded-full bg-[var(--color-border)] shrink-0" />
                                  {client.paid ? (
                                    <span className="text-[var(--color-success)] font-semibold flex items-center gap-1">
                                      <CheckCircle2
                                        size={13}
                                        className="shrink-0"
                                      />
                                      <span>Оплата подтверждена</span>
                                    </span>
                                  ) : (
                                    <span className="text-[var(--color-warning)] font-medium flex items-center gap-1">
                                      <Clock size={13} className="shrink-0" />
                                      <span>Ожидает оплату</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!client.paid && (
                              <button
                                onClick={() => {
                                  setSelectedClientForInvoice(client);
                                  setSelectedTariffs([]);
                                  setIsInvoiceSent(false);
                                }}
                                className="shrink-0 px-3.5 py-1.5 ml-3 rounded-xl text-[13px] font-bold transition-all bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white shadow-2xs active:scale-95"
                              >
                                Выставить счет
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-[13px] text-[var(--color-foreground-tertiary)]">
                          {leadsTotal === 0
                            ? "Клиентов пока нет"
                            : "По вашему запросу ничего не найдено"}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </motion.div>
  );
};
