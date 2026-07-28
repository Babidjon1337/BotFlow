import React, { useState, useEffect } from "react";
import {
  Users,
  Bot,
  DollarSign,
  TrendingUp,
  Activity,
  ShieldCheck,
  RefreshCw,
  Clock,
  Database,
  CheckCircle2,
  Server,
  Sparkles,
  ArrowUpRight,
  Send,
  Trash2,
  Bell,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "../../providers/AppStateProvider";
import { useAlert } from "../../components/AlertProvider";

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  icon: React.FC<any>;
  gradient: string;
  subtitle: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  gradient,
  subtitle,
}) => (
  <motion.div
    whileHover={{ y: -4, scale: 1.01 }}
    transition={{ duration: 0.2 }}
    className="relative overflow-hidden rounded-[24px] p-6 border border-white/10 shadow-xl"
    style={{
      background: "var(--color-surface)",
      boxShadow: "0 10px 30px -10px rgba(0,0,0,0.15)",
    }}
  >
    <div
      className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none -mr-10 -mt-10"
      style={{ background: gradient }}
    />
    <div className="relative z-10 flex items-start justify-between mb-4">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg text-white"
        style={{ background: gradient }}
      >
        <Icon size={24} />
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[12px]">
        <ArrowUpRight size={14} />
        {change}
      </div>
    </div>
    <div className="text-[28px] md:text-[32px] font-black text-[var(--color-foreground)] tracking-tight mb-1">
      {value}
    </div>
    <div className="text-[14px] font-bold text-[var(--color-foreground)] mb-0.5">
      {title}
    </div>
    <div className="text-[12px] text-[var(--color-foreground-secondary)] font-medium">
      {subtitle}
    </div>
  </motion.div>
);

export const AdminStats: React.FC = () => {
  const { appState, setToastMessage } = useAppState();
  const { showAlert } = useAlert();
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "pay" | "bot" | "user">("all");

  const handleRefresh = () => {
    setIsRefreshing(true);
    setToastMessage("Обновление метрик Bot Father...");
    setTimeout(() => {
      setIsRefreshing(false);
      setToastMessage("Данные актуальны! ⚡");
    }, 800);
  };

  const [statsData, setStatsData] = useState({
    totalUsers: 1482,
    totalBots: 3104,
    revenue: "842 500 ₽",
    leads: 48290,
  });

  // Dynamically scale mockup data based on range
  useEffect(() => {
    if (timeRange === "24h") {
      setStatsData({ totalUsers: 34, totalBots: 82, revenue: "24 900 ₽", leads: 1420 });
    } else if (timeRange === "7d") {
      setStatsData({ totalUsers: 218, totalBots: 512, revenue: "184 000 ₽", leads: 9840 });
    } else if (timeRange === "30d") {
      setStatsData({ totalUsers: 840, totalBots: 1890, revenue: "492 500 ₽", leads: 28400 });
    } else {
      setStatsData({ totalUsers: 1482, totalBots: 3104, revenue: "842 500 ₽", leads: 48290 });
    }
  }, [timeRange]);

  const liveEvents = [
    { id: 1, type: "pay", text: "Успешная оплата тарифа PRO (990 ₽)", user: "@alex_tg", time: "2 мин назад" },
    { id: 2, type: "bot", text: "Создан новый бот: Осенняя распродажа", user: "@valeria_pro", time: "5 мин назад" },
    { id: 3, type: "user", text: "Новая регистрация в платформе", user: "@biz_owner99", time: "12 мин назад" },
    { id: 4, type: "pay", text: "Покупка слота бота (+190 ₽)", user: "@maxim_bot", time: "18 мин назад" },
    { id: 5, type: "bot", text: "Запущена воронка из 5 шагов", user: "@agency_lead", time: "25 мин назад" },
  ];

  const filteredEvents = eventFilter === "all" ? liveEvents : liveEvents.filter(e => e.type === eventFilter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.25 }}
      className="w-full pb-16 flex flex-col gap-6"
    >
      {/* ── HEADER SECTION ── */}
      <div className="relative overflow-hidden rounded-[28px] p-6 md:p-8 border border-[#c084fc]/30 shadow-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(192, 38, 211, 0.2) 50%, rgba(236, 72, 153, 0.15) 100%)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#c084fc]/15 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#C026D3] flex items-center justify-center shadow-lg text-white shrink-0">
              <ShieldCheck size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-black text-[var(--color-foreground)] tracking-tight">
                  Аналитика Bot Father
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-[#c084fc]/20 text-[#c084fc] font-extrabold text-[11px] uppercase tracking-wider border border-[#c084fc]/30">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-[13px] md:text-[14px] text-[var(--color-foreground-secondary)] mt-1 max-w-xl">
                Панель управления SaaS-конструктором. Полная статистика экосистемы, платежей и нагрузки серверов.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-foreground)] hover:border-[#c084fc] font-bold text-[13px] flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin text-[#c084fc]" : "text-[#c084fc]"} />
              <span>Обновить</span>
            </button>
          </div>
        </div>

        {/* Time Filters */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-border)]">
            {[
              { id: "24h", label: "24 часа" },
              { id: "7d", label: "7 дней" },
              { id: "30d", label: "30 дней" },
              { id: "all", label: "За всё время" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                  timeRange === tab.id
                    ? "bg-gradient-to-r from-[#4F46E5] to-[#C026D3] text-white shadow-md"
                    : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-foreground-secondary)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Система онлайн · ID: 932050484, 1186592191</span>
          </div>
        </div>
      </div>

      {/* ── 4 KEY GROWTH METRICS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <MetricCard
          title="Владельцев ботов"
          value={statsData.totalUsers.toLocaleString()}
          change="+14.2%"
          icon={Users}
          gradient="linear-gradient(135deg, #3B82F6, #1D4ED8)"
          subtitle="Активных авторов за период"
        />
        <MetricCard
          title="Создано ботов"
          value={statsData.totalBots.toLocaleString()}
          change="+22.5%"
          icon={Bot}
          gradient="linear-gradient(135deg, #8B5CF6, #6D28D9)"
          subtitle="2 750 ботов сейчас в сети"
        />
        <MetricCard
          title="Выручка (MRR/GMV)"
          value={statsData.revenue}
          change="+31.8%"
          icon={DollarSign}
          gradient="linear-gradient(135deg, #10B981, #047857)"
          subtitle="Средний чек: 1 240 ₽"
        />
        <MetricCard
          title="Лидов в воронках"
          value={statsData.leads.toLocaleString()}
          change="+18.4%"
          icon={TrendingUp}
          gradient="linear-gradient(135deg, #EC4899, #BE185D)"
          subtitle="Конверсия в оплату: 6.8%"
        />
      </div>

      {/* ── ANALYTICAL BREAKDOWN ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Revenue Sources */}
        <div className="lg:col-span-2 rounded-[24px] p-6 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-foreground)] flex items-center gap-2">
                  <Activity size={20} className="text-[#c084fc]" />
                  <span>Структура выручки платформы</span>
                </h3>
                <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-0.5">
                  Распределение поступлений от подписок и покупок дополнительных слотов
                </p>
              </div>
              <span className="badge badge-success text-[12px]">Рост +28%</span>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <div className="flex justify-between text-[14px] font-bold mb-1.5">
                  <span className="text-[var(--color-foreground)]">Подписки PRO (990 ₽/мес)</span>
                  <span className="text-emerald-500 font-extrabold">642 000 ₽ (76%)</span>
                </div>
                <div className="h-3 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{ width: "76%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[14px] font-bold mb-1.5">
                  <span className="text-[var(--color-foreground)]">Доп. слоты ботов (+190 ₽)</span>
                  <span className="text-purple-500 font-extrabold">148 200 ₽ (18%)</span>
                </div>
                <div className="h-3 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" style={{ width: "18%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[14px] font-bold mb-1.5">
                  <span className="text-[var(--color-foreground)]">Интеграции под ключ</span>
                  <span className="text-pink-500 font-extrabold">52 300 ₽ (6%)</span>
                </div>
                <div className="h-3 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full" style={{ width: "6%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2.5 text-[var(--color-foreground-secondary)]">
              <Sparkles size={16} className="text-[#c084fc] shrink-0" />
              <span>Прогнозируемый MRR в следующем месяце: <strong className="text-[var(--color-foreground)]">1 150 000 ₽</strong></span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Payment Gateways */}
        <div className="rounded-[24px] p-6 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-[18px] font-bold text-[var(--color-foreground)] mb-1 flex items-center gap-2">
              <DollarSign size={20} className="text-emerald-500" />
              <span>Шлюзы в воронках</span>
            </h3>
            <p className="text-[13px] text-[var(--color-foreground-secondary)] mb-6">
              Популярность платежных систем среди создателей ботов
            </p>

            <div className="space-y-4">
              {[
                { name: "ЮKassa (API v3)", percent: "48%", count: "23 179 оплат", color: "#3B82F6" },
                { name: "Robokassa (MD5)", percent: "32%", count: "15 452 оплат", color: "#8B5CF6" },
                { name: "Prodamus (HMAC)", percent: "15%", count: "7 243 оплат", color: "#EC4899" },
                { name: "Telegram Stars", percent: "5%", count: "2 416 оплат", color: "#F59E0B" },
              ].map((gw) => (
                <div key={gw.name} className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ background: gw.color }} />
                    <div>
                      <div className="text-[14px] font-bold text-[var(--color-foreground)]">{gw.name}</div>
                      <div className="text-[11px] text-[var(--color-foreground-secondary)]">{gw.count}</div>
                    </div>
                  </div>
                  <span className="text-[14px] font-extrabold text-[var(--color-foreground)]">{gw.percent}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ECOSYSTEM & APSCHEDULER HEALTH MONITOR ── */}
      <div className="rounded-[24px] p-6 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <h3 className="text-[18px] font-bold text-[var(--color-foreground)] mb-1 flex items-center gap-2">
          <Server size={20} className="text-blue-500" />
          <span>Системный мониторинг и здоровье серверов</span>
        </h3>
        <p className="text-[13px] text-[var(--color-foreground-secondary)] mb-6">
          Состояние фоновых планировщиков, очередей дожимов (APScheduler) и телеграм-шлюзов
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* APScheduler Status */}
          <div className="p-5 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-foreground)]">
                <Clock size={18} className="text-purple-500" />
                <span>APScheduler (Дожимы)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-extrabold flex items-center gap-1">
                <CheckCircle2 size={12} /> Работает
              </span>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">В очереди задач:</span>
                <span className="font-bold text-[var(--color-foreground)]">142 дожима</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Отправлено сегодня:</span>
                <span className="font-bold text-[var(--color-foreground)]">12 480 сообщ.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Средняя задержка:</span>
                <span className="font-bold text-emerald-500">0.2 сек</span>
              </div>
            </div>
          </div>

          {/* Telegram Webhook Status */}
          <div className="p-5 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-foreground)]">
                <Zap size={18} className="text-blue-500" />
                <span>Telegram API Webhooks</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-extrabold flex items-center gap-1">
                <CheckCircle2 size={12} /> 99.99%
              </span>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Пинг шлюза:</span>
                <span className="font-bold text-emerald-500">38 мс</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Успешных запросов:</span>
                <span className="font-bold text-[var(--color-foreground)]">99.98%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Шифрование Fernet:</span>
                <span className="font-bold text-purple-500">Активно</span>
              </div>
            </div>
          </div>

          {/* Database PostgreSQL */}
          <div className="p-5 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-foreground)]">
                <Database size={18} className="text-pink-500" />
                <span>PostgreSQL (Asyncpg)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-extrabold flex items-center gap-1">
                <CheckCircle2 size={12} /> Online
              </span>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Пул соединений:</span>
                <span className="font-bold text-[var(--color-foreground)]">14 / 100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Размер базы:</span>
                <span className="font-bold text-[var(--color-foreground)]">412 МБ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-foreground-secondary)]">Кэш воронки:</span>
                <span className="font-bold text-emerald-500">98.4% Hit</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LIVE ACTIVITY FEED & ADMIN TOOLS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Feed */}
        <div className="lg:col-span-2 rounded-[24px] p-6 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-[18px] font-bold text-[var(--color-foreground)] flex items-center gap-2">
                <Bell size={20} className="text-[#c084fc]" />
                <span>События в реальном времени</span>
              </h3>
              <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-0.5">
                Лента активностей авторов и оплат в воронках
              </p>
            </div>
            
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
              {[
                { id: "all", label: "Все" },
                { id: "pay", label: "Оплаты" },
                { id: "bot", label: "Боты" },
                { id: "user", label: "Юзеры" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setEventFilter(f.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold transition-all ${
                    eventFilter === f.id
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredEvents.map((ev) => (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="p-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        background: ev.type === "pay" ? "#10B981" : ev.type === "bot" ? "#8B5CF6" : "#3B82F6",
                        boxShadow: ev.type === "pay" ? "0 0 8px #10B981" : undefined,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[var(--color-foreground)] truncate">{ev.text}</div>
                      <div className="text-[11px] text-[var(--color-foreground-secondary)]">{ev.user}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--color-foreground-tertiary)] shrink-0">{ev.time}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right 1 Col: Quick Admin Tools */}
        <div className="rounded-[24px] p-6 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-[18px] font-bold text-[var(--color-foreground)] mb-1 flex items-center gap-2">
              <Sparkles size={20} className="text-amber-500" />
              <span>Инструменты SaaS</span>
            </h3>
            <p className="text-[13px] text-[var(--color-foreground-secondary)] mb-6">
              Управление сервисом и обслуживание очередей
            </p>

            <div className="space-y-3">
              <button
                onClick={() => showAlert({
                  title: "📢 Рассылка по авторам",
                  message: "Функция отправки глобального уведомления всем владельцам ботов в Telegram.",
                })}
                className="w-full py-3 px-4 rounded-xl bg-[var(--color-surface-2)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 transition-all flex items-center justify-between group text-left"
              >
                <div className="flex items-center gap-3">
                  <Send size={18} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-[13px] font-bold text-[var(--color-foreground)]">Рассылка авторам</div>
                    <div className="text-[11px] text-[var(--color-foreground-secondary)]">Уведомить об обновлении</div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-[var(--color-foreground-tertiary)]" />
              </button>

              <button
                onClick={() => {
                  setToastMessage("🧹 Кэш и старые логи очищены!");
                }}
                className="w-full py-3 px-4 rounded-xl bg-[var(--color-surface-2)] hover:bg-emerald-500/10 border border-[var(--color-border)] hover:border-emerald-500/40 transition-all flex items-center justify-between group text-left"
              >
                <div className="flex items-center gap-3">
                  <Trash2 size={18} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-[13px] font-bold text-[var(--color-foreground)]">Очистка логов БД</div>
                    <div className="text-[11px] text-[var(--color-foreground-secondary)]">Освободить память</div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-[var(--color-foreground-tertiary)]" />
              </button>

              <button
                onClick={() => {
                  setToastMessage("⚡ Вебхуки всех ботов синхронизированы!");
                }}
                className="w-full py-3 px-4 rounded-xl bg-[var(--color-surface-2)] hover:bg-purple-500/10 border border-[var(--color-border)] hover:border-purple-500/40 transition-all flex items-center justify-between group text-left"
              >
                <div className="flex items-center gap-3">
                  <RefreshCw size={18} className="text-purple-500 group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-[13px] font-bold text-[var(--color-foreground)]">Синхрон вебхуков</div>
                    <div className="text-[11px] text-[var(--color-foreground-secondary)]">Переподключить Aiogram</div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-[var(--color-foreground-tertiary)]" />
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--color-border)] text-[11px] text-[var(--color-foreground-tertiary)] text-center">
            Версия Bot Father Core v2.4 (Asyncpg + APScheduler)
          </div>
        </div>
      </div>
    </motion.div>
  );
};
