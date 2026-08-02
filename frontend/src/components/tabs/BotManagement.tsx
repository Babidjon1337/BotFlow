import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAlert } from "../AlertProvider";
import {
  Bot,
  Plus,
  Settings,
  Users,
  TrendingUp,
  ArrowRight,
  Activity,
  Power,
  RefreshCw,
  Trash2,
  Lock,
} from "lucide-react";
import { EmptyBotState } from "../EmptyBotState";
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
    isAdmin,
  } = useAppState();
  const { bots, subscriptionStatus } = appState;
  const { toggleBot, isToggling } = useBotToggle();
  const { requestBotSelection } = useBotSelectionGuard();
  const hasBots = bots.length > 0;
  const isPro = subscriptionStatus === "active" || isAdmin;

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

  const tg = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } }; HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
  const userId = tg?.initDataUnsafe?.user?.id || 123456;

  if (!hasBots) {
    return (
      <EmptyBotState
        onCreateBot={onCreateBot}
        title="Список ботов пуст"
        description="Создайте своего первого Telegram-бота, чтобы начать управлять ими здесь."
      />
    );
  }

  const activeBots = bots.filter((b) => b.status === "active").length;
  const totalUsers = bots.reduce((s, b) => s + (b.usersCount || 0), 0);

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
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
              Управление ботами
            </h1>
            <p className="text-[14px] text-[var(--color-foreground-secondary)] mt-1">
              Аналитика и настройки всех ваших проектов
            </p>
          </div>
          <button
            onClick={() => {
              if (!isPro && bots.length >= 1) {
                setActiveTab("subscription");
              } else {
                onCreateBot();
              }
            }}
            className="btn-primary-saas whitespace-nowrap"
            style={{
              height: "44px",
              padding: "0 20px",
              borderRadius: "14px",
              fontSize: "14px",
            }}
          >
            {!isPro && bots.length >= 1 ? (
              <Lock size={16} className="mr-2" />
            ) : (
              <Plus size={16} className="mr-2" />
            )}
            {!isPro && bots.length >= 1 ? "Доступно в PRO" : "Создать бота"}
          </button>
        </div>

        {/* Stats Section */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] md:rounded-[20px] shadow-sm flex items-center justify-between p-3 md:p-5 mb-6 md:mb-8 divide-x divide-[var(--color-border)]">
          {[
            {
              label: "Боты",
              value: bots.length,
              icon: Bot,
              color: "var(--color-primary)",
            },
            {
              label: "Актив",
              value: activeBots,
              icon: Activity,
              color: "var(--color-success)",
            },
            {
              label: "Лиды",
              value: totalUsers,
              icon: Users,
              color: "var(--color-accent)",
            },
            {
              label: "Конв.",
              value: "0%",
              icon: TrendingUp,
              color: "var(--color-warning)",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center flex-1 px-1 md:px-4 min-w-0"
            >
              <div className="text-[20px] sm:text-[24px] md:text-[28px] font-black text-[var(--color-foreground)] leading-none mb-1 md:mb-1.5">
                {stat.value}
              </div>
              <div className="text-[11px] sm:text-[12px] md:text-[13px] font-semibold text-[var(--color-foreground-secondary)] flex items-center justify-center gap-1 md:gap-1.5 w-full">
                <stat.icon
                  size={16}
                  style={{ color: stat.color }}
                  className="shrink-0"
                />
                <span className="truncate">{stat.label}</span>
              </div>
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
                className={!isActive ? "pt-3 md:pt-4" : ""}
              >
                <div className="relative group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[24px] p-5 md:p-6 flex flex-col gap-5 md:gap-6 transition-all hover:shadow-xl hover:border-[var(--color-primary)]/30">
                  {/* Draft Badge Overlap */}
                  {!isActive && (
                    <div className="absolute -top-3 -left-2 md:-top-4 md:-left-3 z-10">
                      <div className="bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] shadow-md rounded-[10px] md:rounded-xl px-2.5 py-1 md:px-3 md:py-1.5 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-[var(--color-foreground-secondary)]">
                          Черновик
                        </span>
                      </div>
                    </div>
                  )}
                  {/* --- HEADER --- */}
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Avatar + Info */}
                    <div className="flex items-start gap-4 min-w-0">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div 
                          className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-[16px] md:rounded-[20px] text-white flex items-center justify-center text-[18px] md:text-xl font-black shadow-sm"
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
                        <div className="flex items-center gap-2 mb-0.5 md:mb-1 w-full min-w-0">
                          <h3 className="text-[17px] md:text-[19px] font-black text-[var(--color-foreground)] leading-tight truncate">
                            {bot.name}
                          </h3>
                        </div>
                        <span className="text-[13px] md:text-[14px] font-medium text-[var(--color-foreground-secondary)] truncate block w-full">
                          @{bot.username?.replace("@", "") || "username"}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions (Power, Settings) */}
                    <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2 md:-mr-1">
                      <button
                        onClick={() => toggleBot(bot)}
                        disabled={isToggling[bot.id]}
                        className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${isActive ? "text-[var(--color-success)] hover:bg-[var(--color-success-soft)]" : "text-[var(--color-foreground-tertiary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"} ${isToggling[bot.id] ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={isActive ? "Остановить" : "Запустить"}
                      >
                        {isToggling[bot.id] ? (
                          <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                          <Power size={18} />
                        )}
                      </button>

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

                  {/* --- STATS --- */}
                  <div className="flex items-center justify-between px-2 md:px-4">
                    <div className="flex flex-col items-center">
                      <span className="text-[12px] md:text-[13px] font-bold text-[var(--color-foreground-tertiary)] uppercase tracking-wider mb-1">
                        Лиды
                      </span>
                      <span className="text-[24px] md:text-[28px] font-black text-[var(--color-foreground)] leading-none">
                        {bot.usersCount}
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="text-[12px] md:text-[13px] font-bold text-[var(--color-foreground-tertiary)] uppercase tracking-wider mb-1">
                        Продажи
                      </span>
                      <span className="text-[24px] md:text-[28px] font-black text-[var(--color-foreground)] leading-none">
                        0
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="text-[12px] md:text-[13px] font-bold text-[var(--color-foreground-tertiary)] uppercase tracking-wider mb-1">
                        Выручка
                      </span>
                      {bot.paymentProvider ? (
                        <span className="text-[24px] md:text-[28px] font-black text-[var(--color-success)] leading-none">
                          0 ₽
                        </span>
                      ) : (
                        <div className="h-[24px] md:h-[28px] flex items-center">
                          <span className="text-[11px] md:text-[12px] font-bold text-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-0.5 rounded-md">
                            Нет кассы
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* --- MAIN ACTION --- */}
                  <button
                    onClick={() => onEditBot(bot.id)}
                    className="w-full h-[46px] md:h-[48px] rounded-[16px] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)] font-bold text-[14px] md:text-[15px] flex items-center justify-center gap-2 transition-colors duration-200"
                  >
                    Редактор воронки <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
