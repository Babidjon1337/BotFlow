import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlert } from "../AlertProvider";
import {
  Plus,
  Settings,
  ArrowRight,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { StatusBadge } from "../common/StatusBadge";
import { AnimatedNumber } from "../common/AnimatedNumber";
import { Button } from "../ui/button";
import { useAppState } from "../../providers/AppStateProvider";
import { useBotToggle } from "../../hooks/useBotToggle";
import { useBotSelectionGuard } from "../../hooks/useBotSelectionGuard";
import { getBotAvatarColors } from "../../utils";

export const BotManagement = () => {
  const {
    appState,
    setAppState,
    setSheet,
    setActiveTab,
    handleCreateBotClick: onCreateBot,
  } = useAppState();
  const { bots } = appState;
  const { toggleBot, isToggling } = useBotToggle();
  const { requestBotSelection } = useBotSelectionGuard();
  const hasBots = bots.length > 0;

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { showConfirm, showAlert } = useAlert();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  const tg = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string } }; HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
  const userId = tg?.initDataUnsafe?.user?.id || 123456;
  const userName = tg?.initDataUnsafe?.user?.first_name || '';

  if (!hasBots) {
    return <WelcomeScreen onCreateBot={onCreateBot} />;
  }

  const activeBots = bots.filter((b) => b.status === "active").length;
  const totalUsers = bots.reduce((s, b) => s + (b.usersCount || 0), 0);
  const totalRevenue = bots.reduce((s, b) => s + (b.revenue || 0), 0);

  const onEditBot = (botId: string) => {
    const bot = bots.find((b) => b.id === botId);
    if (bot) {
      requestBotSelection(bot, {
        onSelected: () => setActiveTab("build"),
      });
    }
  };

  const onEditBotSettings = (botId: string) => {
    const bot = bots.find((b) => b.id === botId);
    if (bot) {
      requestBotSelection(bot, {
        onSelected: () => setSheet("bot_settings"),
      });
    }
  };

  const onDeleteBot = async (botId: string) => {
    tg?.HapticFeedback?.impactOccurred("medium");
    try {
      const { apiService } = await import('../../services/api');
      await apiService.deleteBot(botId);
      setAppState((prev) => {
        const botsAfterDeletion = prev.bots.filter((bot) => bot.id !== botId);
        return {
          ...prev,
          bots: botsAfterDeletion,
          activeBot: prev.activeBot?.id === botId ? botsAfterDeletion[0] ?? null : prev.activeBot,
          isDirty: prev.activeBot?.id === botId ? false : prev.isDirty,
        };
      });
    } catch (error) {
      showAlert({
        title: 'Не удалось удалить бота',
        message: error instanceof Error ? error.message : 'Повторите попытку позже.',
        type: 'danger',
        confirmText: 'Закрыть',
        cancelText: '',
      });
    }
  };

  const onResetLeads = async (botId: string) => {
    try {
      const { apiService } = await import('../../services/api');
      const result = await apiService.resetBotLeads(botId);
      setAppState(prev => ({
        ...prev,
        bots: prev.bots.map(bot => bot.id === botId ? { ...bot, usersCount: 0 } : bot),
        activeBot: prev.activeBot?.id === botId ? { ...prev.activeBot, usersCount: 0 } : prev.activeBot,
      }));
      showAlert({
        title: 'База лидов очищена',
        message: `Удалено записей: ${result.deletedCount}. Блокировка смены токена сохраняется.`,
        type: 'success',
        confirmText: 'Готово',
        cancelText: '',
      });
    } catch (error) {
      showAlert({
        title: 'Не удалось очистить базу',
        message: error instanceof Error ? error.message : 'Повторите попытку позже.',
        type: 'danger',
        confirmText: 'Закрыть',
        cancelText: '',
      });
    }
  };

  return (
    <div className="pb-24 w-full max-w-[1000px] mx-auto px-4 md:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Greeting + hero-выручка: страница отвечает на главный вопрос сразу */}
        <div className="mb-6 md:mb-8">
          <p className="text-body-sm font-medium text-fg-secondary">
            Добрый день{userName ? `, ${userName}` : ''} 👋
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="kicker font-accent text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-tertiary">
                Общая выручка
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-accent text-[34px] font-bold leading-none tracking-tight tabular-nums text-[var(--color-foreground)] md:text-[44px]">
                  {totalRevenue.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
            <Button onClick={onCreateBot} size="md" className="shrink-0">
              <Plus data-icon="inline-start" aria-hidden />
              Создать бота
            </Button>
          </div>
        </div>

        {/* KPI: Боты / Работают / Подписчики — лейбл всегда в одну строку */}
        <div className="mb-8 grid grid-cols-3 gap-2.5 sm:gap-3">
          {[
            { label: "Боты", value: bots.length },
            { label: "Работают", value: activeBots },
            { label: "Подписчики", value: totalUsers },
          ].map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3.5 sm:px-4 md:px-5 md:py-4"
            >
              <p className="truncate whitespace-nowrap font-accent text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-tertiary sm:text-[11px] sm:tracking-[0.12em]">
                {stat.label}
              </p>
              <p className="mt-1.5 font-accent text-[22px] font-bold leading-none tabular-nums text-[var(--color-foreground)] md:text-[26px]">
                <AnimatedNumber value={stat.value} />
              </p>
            </div>
          ))}
        </div>

        {/* Bots List */}
        <div className="space-y-4" ref={menuRef}>
          {bots.map((bot, index) => {
            const initials = bot.name.substring(0, 2).toUpperCase();
            const isActive = bot.status === "active";
            const isMenuOpen = openMenuId === bot.id;
            const [color1, color2] = getBotAvatarColors(userId, index);

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={!isActive ? "pt-2 md:pt-2.5" : ""}
              >
                <div className="relative group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[18px] p-4 md:p-5 flex flex-col gap-3 md:gap-3.5 transition-all hover:shadow-lg hover:border-[var(--color-primary)]/30">
                  {/* --- HEADER --- */}
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Avatar + Info */}
                    <div className="flex items-start gap-4 min-w-0">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className="w-[44px] h-[44px] md:w-[48px] md:h-[48px] rounded-[13px] md:rounded-[14px] text-white flex items-center justify-center text-[16px] font-black shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${color1}, ${color2})` }}
                        >
                          {initials}
                        </div>
                        {isActive && (
                          <div
                            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 bg-[var(--color-success)] border-[3px] border-[var(--color-surface)] rounded-full"
                            title="Бот работает"
                          />
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex flex-col min-w-0 pt-0.5 md:pt-1 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-0.5 md:mb-1 w-full min-w-0">
                          <h3 className="text-[16px] md:text-[18px] font-extrabold text-[var(--color-foreground)] leading-tight truncate">
                            {bot.name}
                          </h3>
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={isActive ? "active" : "draft"}
                              initial={{ opacity: 0, y: 4, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.9 }}
                              transition={{ duration: 0.18 }}
                              className="inline-flex"
                            >
                              <StatusBadge tone={isActive ? "success" : "neutral"} label={isActive ? "Работает" : "Черновик"} />
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        <span className="text-[13px] md:text-[14px] font-medium text-[var(--color-foreground-secondary)] truncate block w-full">
                          @{bot.username?.replace("@", "") || "username"}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions (Power, Settings) */}
                    <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2 md:-mr-1">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => toggleBot(bot)}
                        disabled={isToggling[bot.id]}
                        className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${isActive ? "text-[var(--color-success)] hover:bg-[var(--color-success-soft)]" : "text-[var(--color-foreground-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"} ${isToggling[bot.id] ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={isActive ? "Остановить" : "Запустить"}
                      >
                        {isToggling[bot.id] ? (
                          <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                          <motion.span
                            key={isActive ? "on" : "off"}
                            initial={{ scale: 0.4, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 520, damping: 24 }}
                            className="flex"
                          >
                            <Power size={18} />
                          </motion.span>
                        )}
                      </motion.button>

                      <div className="relative">
                        <button
                          onClick={() =>
                            setOpenMenuId(isMenuOpen ? null : bot.id)
                          }
                          aria-label={`${isMenuOpen ? "Закрыть" : "Открыть"} меню бота ${bot.name}`}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          aria-controls={`bot-menu-${bot.id}`}
                          title="Действия с ботом"
                          className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${isMenuOpen ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "text-[var(--color-foreground-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"}`}
                        >
                          <Settings size={18} />
                        </button>

                        {/* Settings Popup */}
                        <AnimatePresence>
                          {isMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 10 }}
                              transition={{ duration: 0.15 }}
                              id={`bot-menu-${bot.id}`}
                              role="menu"
                              className="absolute right-0 top-11 md:top-12 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl rounded-xl overflow-hidden z-30"
                            >
                              <div className="p-1">
                                <button
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onEditBotSettings(bot.id);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[14px] font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors"
                                >
                                  <Settings
                                    size={16}
                                    className="text-[var(--color-foreground-secondary)]"
                                  />{" "}
                                  Настройки бота
                                </button>
                                <div className="h-px w-full bg-[var(--color-border)] my-1" />
                                <button
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    showConfirm({
                                      title: "Очистить базу лидов?",
                                      message:
                                        "Эта операция удалит всех пользователей. Воронки сохранятся.",
                                      type: "warning",
                                      confirmText: "Сбросить",
                                      cancelText: "Отмена",
                                      onConfirm: () => onResetLeads(bot.id),
                                    });
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[14px] font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] rounded-lg transition-colors"
                                >
                                  <RefreshCw size={16} /> Сбросить базу
                                </button>
                                <button
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    showConfirm({
                                      title: "Удалить бота?",
                                      message: "Бот будет удален навсегда.",
                                      type: "danger",
                                      confirmText: "Удалить",
                                      cancelText: "Отмена",
                                      onConfirm: () => onDeleteBot(bot.id),
                                    });
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[14px] font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} /> Удалить бота
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* --- STATS: три метрики в одну строку + спарклайн справа --- */}
                  <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[var(--color-surface-2)] px-4 py-3">
                    <dl className="flex min-w-0 items-center gap-5 md:gap-7">
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold text-[var(--color-foreground-tertiary)]">Лиды</dt>
                        <dd className="font-accent text-[16px] font-semibold tabular-nums leading-tight text-[var(--color-foreground)]">
                          {bot.usersCount}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold text-[var(--color-foreground-tertiary)]">Продажи</dt>
                        <dd className="font-accent text-[16px] font-semibold tabular-nums leading-tight text-[var(--color-foreground)]">
                          {bot.sales || 0}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold text-[var(--color-foreground-tertiary)]">Выручка</dt>
                        <dd className="font-accent text-[16px] font-semibold tabular-nums leading-tight text-[var(--color-success)]">
                          {bot.paymentProvider ? `${(bot.revenue || 0).toLocaleString("ru-RU")} ₽` : "—"}
                        </dd>
                      </div>
                    </dl>
                    {isActive && bot.paymentProvider ? (
                      <MiniSparkline />
                    ) : !bot.paymentProvider ? (
                      <span className="shrink-0 rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-bold text-[var(--color-warning)]">
                        Нет кассы
                      </span>
                    ) : null}
                  </div>

                  {/* --- MAIN ACTION --- */}
                  <button
                    onClick={() => onEditBot(bot.id)}
                    className="w-full h-[42px] md:h-[44px] rounded-[12px] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)] font-bold text-[14px] flex items-center justify-center gap-2 transition-colors duration-200"
                  >
                    Открыть бота <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

/** Плоский спарклайн в карточке бота (сглаженная линия, primary). */
function MiniSparkline() {
  // Детализации по дням в списке пока нет — рисуем детерминированную кривую от выручки.
  const points = [0.35, 0.5, 0.42, 0.66, 0.58, 0.82, 1];
  const w = 96;
  const h = 32;
  const max = Math.max(...points);
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - (p / max) * (h - 6) - 3] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--p-100)" stroke="none" className="dark:opacity-20" />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={coords[coords.length - 1][1]} r="3" fill="var(--color-primary)" />
    </svg>
  );
};
