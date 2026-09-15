import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Users,
  ChevronRight,
  Sun,
  Moon,
  Zap,
  BarChart2,
  ArrowRight,
  Bot,
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";

export const Profile = () => {
  const { appState, theme, toggleTheme, setActiveTab, isAdmin, setAppState } = useAppState();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [email, setEmail] = useState(appState.userEmail || "");
  const [receiptsEnabled, setReceiptsEnabled] = useState(appState.emailReceiptsEnabled !== false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const telegramUser = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string; username?: string; photo_url?: string } }; HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp?.initDataUnsafe?.user;

  const activeBotsCount = appState.bots.filter((b) => b.status === "active").length;
  const totalLeadsCount = appState.bots.reduce((acc, bot) => acc + (bot.usersCount || 0), 0);

  const saveNotifications = async () => {
    setIsSavingNotifications(true);
    setNotificationError(null);
    try {
      const { apiService } = await import("../../services/api");
      const saved = await apiService.updateNotificationSettings({
        email: email.trim() || undefined,
        emailReceiptsEnabled: receiptsEnabled,
        emailBillingNotificationsEnabled: appState.emailBillingNotificationsEnabled !== false,
      });
      setAppState((prev) => ({
        ...prev,
        userEmail: saved.email || "",
        emailReceiptsEnabled: saved.email_receipts_enabled,
        emailBillingNotificationsEnabled: saved.email_billing_notifications_enabled,
      }));
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Не удалось сохранить настройки.");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="w-full pb-16"
    >
      <div className="w-full max-w-[1000px] mx-auto px-4 md:px-6 pt-2 lg:pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key="profile-main"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: 16, transition: { duration: 0.15 } }}
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
            }}
            className="space-y-4"
          >
            {/* Account Header Card */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              className="relative rounded-[22px] overflow-hidden group border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
            >
              {/* Primary banner strip */}
              <div
                className="transition-transform duration-1000 group-hover:scale-105"
                style={{
                  height: "80px",
                  background: "var(--color-primary)",
                  opacity: 0.9,
                }}
              />

              {/* Theme toggle in top-right */}
              <button
                type="button"
                onClick={toggleTheme}
                className="absolute top-3 right-3 z-10 flex items-center justify-center rounded-xl transition-all hover:bg-white/30 active:scale-95"
                style={{
                  width: 36,
                  height: 36,
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}
                title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                aria-label={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <div className="px-6 pb-6 relative">
                <div
                  className="flex items-center justify-center shrink-0 shadow-md relative z-10 overflow-hidden"
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "18px",
                    background: "var(--color-surface)",
                    border: "3px solid var(--color-surface)",
                    color: "var(--color-primary)",
                    fontSize: "22px",
                    fontWeight: 700,
                    marginTop: "-32px",
                    marginBottom: "12px",
                  }}
                >
                  {telegramUser?.photo_url ? (
                    <img src={telegramUser.photo_url} alt="Аватар пользователя" className="w-full h-full object-cover" />
                  ) : (
                    (telegramUser?.first_name || "User").charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[19px] font-black text-[var(--color-foreground)] leading-tight tracking-tight m-0">
                      {telegramUser?.first_name || "Мой аккаунт"}
                    </h2>
                    <p className="text-[13px] text-[var(--color-foreground-secondary)] mt-0.5">
                      {telegramUser?.username ? `@${telegramUser.username}` : "Пользователь Telegram"}
                    </p>
                  </div>
                  {isAdmin ? (
                    <span className="rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] px-3 py-1 text-xs font-bold">
                      Администратор платформы
                    </span>
                  ) : null}
                </div>
              </div>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 flex flex-col shadow-sm transition-shadow hover:shadow-md cursor-default"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <BarChart2 size={15} className="text-[var(--color-foreground-tertiary)]" />
                  <span className="text-[13px] font-medium text-[var(--color-foreground-secondary)]">
                    Ботов создано
                  </span>
                </div>
                <span className="text-[30px] md:text-[34px] font-black text-[var(--color-foreground)] tracking-tight leading-none tabular-nums">
                  {appState.bots.length}
                </span>
              </motion.div>

              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 flex flex-col shadow-sm transition-shadow hover:shadow-md cursor-default"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <Zap size={15} className="text-[var(--color-foreground-tertiary)]" />
                  <span className="text-[13px] font-medium text-[var(--color-foreground-secondary)]">
                    Работают сейчас
                  </span>
                </div>
                <span className="text-[30px] md:text-[34px] font-black text-[var(--color-success)] tracking-tight leading-none tabular-nums">
                  {activeBotsCount}
                </span>
              </motion.div>

              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 flex flex-col col-span-2 md:col-span-1 shadow-sm transition-shadow hover:shadow-md cursor-default"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <Users size={15} className="text-[var(--color-foreground-tertiary)]" />
                  <span className="text-[13px] font-medium text-[var(--color-foreground-secondary)]">
                    Лидов в CRM
                  </span>
                </div>
                <span className="text-[30px] md:text-[34px] font-black text-[var(--color-foreground)] tracking-tight leading-none tabular-nums">
                  {totalLeadsCount}
                </span>
              </motion.div>
            </div>

            {/* Subscription Section — 1 бот = 1 подписка */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[var(--color-border)]">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: isAdmin ? "rgba(192, 38, 211, 0.15)" : "var(--color-primary-soft)",
                      color: isAdmin ? "#c084fc" : "var(--color-primary)",
                    }}
                  >
                    <Crown size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] md:text-[18px] font-black text-[var(--color-foreground)] leading-tight tracking-tight">
                        {isAdmin ? "Тариф: Администратор" : "Подписка на ботов"}
                      </h3>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{
                          background: isAdmin ? "var(--color-primary)" : "var(--color-surface-2)",
                          color: isAdmin ? "#fff" : "var(--color-foreground-secondary)",
                        }}
                      >
                        {isAdmin ? "ADMIN" : "1 бот = 990 ₽/мес"}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-[var(--color-foreground-secondary)] leading-relaxed">
                      {isAdmin
                        ? "Полный административный доступ ко всем функциям платформы."
                        : "Оплата только за опубликованных ботов (990 ₽/мес). Черновики бесплатны."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab?.(isAdmin ? "admin_stats" : "subscription")}
                  className="h-10 px-4 rounded-xl font-bold text-xs bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm shrink-0 self-start sm:self-auto"
                >
                  {isAdmin ? "Панель админа" : "Управление подписками"}
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Список ботов пользователя и их статус подписки */}
              {appState.bots.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-foreground-tertiary)] mb-2">
                    Статус ботов в аккаунте
                  </p>
                  <div className="divide-y divide-[var(--color-border)]/60">
                    {appState.bots.map((bot) => {
                      const isActive = bot.status === "active";
                      const isFree = bot.hasLifetimeLicense;
                      return (
                        <div
                          key={bot.id}
                          className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3"
                        >
                          <div className="min-w-0 flex items-center gap-2.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                background: isFree
                                  ? "var(--color-primary)"
                                  : isActive
                                  ? "var(--color-success)"
                                  : "var(--color-foreground-tertiary)",
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-[var(--color-foreground)] truncate">
                                {bot.name}
                              </p>
                              <p className="text-[11px] text-[var(--color-foreground-secondary)] truncate">
                                {bot.username ? `@${bot.username.replace(/^@/, "")}` : "username не задан"}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span
                              className="inline-flex items-center rounded-lg px-2.5 py-0.5 text-[11px] font-semibold"
                              style={{
                                background: isFree
                                  ? "var(--color-primary-soft)"
                                  : isActive
                                  ? "var(--color-success-soft)"
                                  : "var(--color-surface-2)",
                                color: isFree
                                  ? "var(--color-primary)"
                                  : isActive
                                  ? "var(--color-success)"
                                  : "var(--color-foreground-secondary)",
                              }}
                            >
                              {isFree
                                ? "Бессрочно · 0 ₽"
                                : isActive
                                ? "Работает · 990 ₽/мес"
                                : "Черновик · 0 ₽"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-foreground-secondary)]">
                  <div className="flex items-center gap-2">
                    <Bot size={15} className="text-[var(--color-foreground-tertiary)]" />
                    <span>У вас пока нет созданных ботов.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab?.("manage")}
                    className="text-[var(--color-primary)] font-bold hover:underline"
                  >
                    Создать бота
                  </button>
                </div>
              )}
            </motion.div>

            {/* Settings Card: Уведомления и чеки */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => {
                  const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
                  tg?.HapticFeedback?.impactOccurred("light");
                  setNotificationsOpen((open) => !open);
                }}
                className="w-full flex items-center gap-4 p-5 hover:bg-[var(--color-surface-2)] transition-colors text-left group"
              >
                <div
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                  style={{
                    background: "var(--color-primary-soft)",
                    color: "var(--color-primary)",
                  }}
                >
                  <Zap size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[var(--color-foreground)]">
                    Уведомления и чеки
                  </div>
                  <div className="text-[13px] text-[var(--color-foreground-secondary)] truncate">
                    Настройки фискальных чеков и Telegram-оповещений
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className={`text-[var(--color-foreground-tertiary)] transition-transform duration-200 ${notificationsOpen ? "rotate-90" : "group-hover:translate-x-1"}`}
                />
              </button>

              {notificationsOpen && (
                <div className="p-5 pt-0 border-t border-[var(--color-border)] space-y-4">
                  <div className="mt-4 flex items-start gap-3 rounded-xl bg-[var(--color-primary-soft)]/30 p-3.5 text-xs leading-relaxed text-[var(--color-foreground)]">
                    <Zap size={16} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                    <p>
                      Telegram-уведомления о покупке, продлении и сбое списания приходят автоматически в главный бот платформы — так вы не пропустите изменение доступа.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="profile-email" className="block text-xs font-semibold text-[var(--color-foreground)]">
                      Email для чеков
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      placeholder="ваша@почта.ru"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="input mt-1.5 w-full h-11 rounded-xl px-3 text-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                    <p className="mt-1 text-[11px] text-[var(--color-foreground-secondary)]">
                      Фискальные чеки высылаются после каждой подтверждённой оплаты подписки.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[var(--color-foreground)]">Чеки на email</span>
                      <span className="block text-[11px] text-[var(--color-foreground-secondary)]">Дублировать фискальный чек на почту при оплате</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={receiptsEnabled}
                      onClick={() => setReceiptsEnabled((v) => !v)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${receiptsEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-strong)]"}`}
                    >
                      <span
                        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${receiptsEnabled ? "left-[22px]" : "left-0.5"}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>

                  {notificationError && <p className="text-xs font-medium text-[var(--color-danger)]">{notificationError}</p>}

                  <button
                    type="button"
                    onClick={saveNotifications}
                    disabled={isSavingNotifications}
                    className="h-11 w-full rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isSavingNotifications ? "Сохраняем…" : "Сохранить настройки"}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
