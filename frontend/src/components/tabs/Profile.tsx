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
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";

export const Profile = () => {
  const { appState, theme, toggleTheme, setActiveTab, isAdmin, setAppState } = useAppState();
  const isSubscribed = appState.subscriptionStatus === "active" || isAdmin;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [email, setEmail] = useState(appState.userEmail || "");
  const [receiptsEnabled, setReceiptsEnabled] = useState(appState.emailReceiptsEnabled !== false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const telegramUser = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string; username?: string; photo_url?: string } }; HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp?.initDataUnsafe?.user;

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
      className="w-full pb-10 flex justify-center"
    >
      <div className="w-full max-w-[640px] pt-2 lg:pt-6 px-4 lg:px-0">
        <AnimatePresence mode="wait">
          {/* ── PROFILE SECTION ── */}
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
            {/* Account Header Card — with theme toggle */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              className="relative rounded-[24px] overflow-hidden group"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                boxShadow: "0 4px 24px -12px rgba(0,0,0,0.05)",
              }}
            >
              {/* Gradient banner */}
              <div
                className="transition-transform duration-1000 group-hover:scale-105"
                style={{
                  height: "88px",
                  background: "var(--color-primary)",
                  opacity: 0.9,
                }}
              />

              {/* Theme toggle in top-right of card */}
              <button
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
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <div className="px-6 pb-6 relative">
                <div
                  className="flex items-center justify-center shrink-0 shadow-md relative z-10 overflow-hidden"
                  style={{
                    width: "68px",
                    height: "68px",
                    borderRadius: "20px",
                    background: "var(--color-surface)",
                    border: "4px solid var(--color-surface)",
                    color: "var(--color-primary)",
                    fontSize: "24px",
                    fontWeight: 700,
                    marginTop: "-34px",
                    marginBottom: "12px",
                  }}
                >
                  {telegramUser?.photo_url ? (
                    <img src={telegramUser.photo_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    (telegramUser?.first_name || "User").charAt(0).toUpperCase()
                  )}
                </div>
                <h2
                  style={{
                    fontSize: "19px",
                    fontWeight: 800,
                    color: "var(--color-foreground)",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {telegramUser?.first_name || "Мой аккаунт"}
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-foreground-secondary)",
                    marginTop: "2px",
                  }}
                >
                  {telegramUser?.username ? `@${telegramUser.username}` : "TG User"}
                </p>
              </div>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="card p-5 flex flex-col transition-shadow hover:shadow-md cursor-default"
              >
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2
                    size={15}
                    style={{ color: "var(--color-foreground-tertiary)" }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--color-foreground-secondary)",
                    }}
                  >
                    Ботов создано
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "32px",
                    fontWeight: 800,
                    color: "var(--color-foreground)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  {appState.bots.length}
                </span>
              </motion.div>
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="card p-5 flex flex-col transition-shadow hover:shadow-md cursor-default"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Users
                    size={15}
                    style={{ color: "var(--color-foreground-tertiary)" }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--color-foreground-secondary)",
                    }}
                  >
                    Пользователей
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "32px",
                    fontWeight: 800,
                    color: "var(--color-foreground)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  {appState.bots.reduce((acc, bot) => acc + bot.usersCount, 0)}
                </span>
              </motion.div>
            </div>

            {/* PRO Subscription CTA — selling banner if not subscribed */}
            {!isSubscribed ? (
              <motion.button
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab?.("subscription")}
                className="w-full text-left group"
              >
                {/* PRO Subscription CTA — selling banner if not subscribed */}
                <div
                  className="relative overflow-hidden transition-shadow group-hover:shadow-[var(--shadow-float)]"
                  style={{
                    borderRadius: 20,
                      background: "var(--color-primary)",
                  }}
                >
                  {/* Background Effects */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)",
                    }}
                  />
                  <div
                    className="absolute -top-12 -right-12 pointer-events-none transition-transform duration-700 group-hover:scale-125"
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                  <div
                    className="absolute -bottom-16 -left-8 pointer-events-none transition-transform duration-700 group-hover:scale-125"
                    style={{
                      width: 180,
                      height: 180,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  />

                  <div className="relative z-10 flex flex-col md:flex-row items-center p-4 md:p-6 gap-4 md:gap-6">
                    {/* Info Block */}
                    <div className="flex-1 w-full min-w-0">
                      <div className="flex items-center justify-between mb-2 md:mb-3">
                        <div
                          className="inline-flex items-center gap-1.5"
                          style={{
                            background: "rgba(255,255,255,0.2)",
                            borderRadius: "100px",
                            padding: "4px 8px",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#fff",
                            letterSpacing: "0.04em",
                          }}
                        >
                          <Crown size={12} /> ПОДПИСКА БОТА
                        </div>
                        <div className="md:hidden flex items-baseline gap-1 bg-white/10 px-2 py-0.5 rounded-full">
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 800,
                              color: "#fff",
                            }}
                            >
                              990 ₽
                            </span>
                            <span
                              style={{
                                fontSize: "9px",
                                color: "rgba(255,255,255,0.7)",
                              }}
                            >
                              /мес
                            </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="text-[17px] md:text-[24px] font-black text-white leading-[1.15] mb-1.5 md:mb-3 tracking-tight">
                            Опубликуйте бота
                            <br />
                            и получайте деньги
                          </div>
                          <div className="hidden md:flex flex-wrap gap-1.5 mb-4">
                            {["Без лимитов", "Оплата на вашей кассе", "Аналитика"].map(
                              (tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    background: "rgba(255,255,255,0.15)",
                                    borderRadius: "100px",
                                    padding: "3px 8px",
                                    fontSize: "11px",
                                    color: "#fff",
                                    fontWeight: 600,
                                  }}
                                >
                                  {tag}
                                </span>
                              ),
                            )}
                          </div>
                          <div className="hidden md:flex items-baseline gap-1.5">
                            <span
                              style={{
                                fontSize: "24px",
                                fontWeight: 900,
                                color: "#fff",
                                letterSpacing: "-0.01em",
                              }}
                            >
                              990 ₽
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                color: "rgba(255,255,255,0.7)",
                              }}
                            >
                              / месяц
                            </span>
                          </div>
                        </div>

                        {/* Mobile Image inline */}
                        <div className="md:hidden w-[72px] h-[72px] shrink-0 drop-shadow-xl relative">
                          <img
                            src="/pro_sub.png"
                            alt="PRO"
                            className="w-full h-full object-contain absolute bottom-0 right-0 scale-125 origin-bottom-right"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Desktop Image */}
                    <div className="hidden md:block w-[280px] h-[180px] shrink-0 drop-shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-2">
                      <img
                        src="/pro_sub.png"
                        alt="PRO"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </div>

                  {/* Button */}
                  <div className="relative z-10 px-4 pb-4 md:px-6 md:pb-6">
                    <div
                      className="w-full flex items-center justify-center gap-1.5 shadow-sm transition-colors group-hover:bg-white/20"
                      style={{
                        background: "rgba(255,255,255,0.15)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        backdropFilter: "blur(4px)",
                        color: "#fff",
                        padding: "12px",
                        borderRadius: "14px",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      Перейти к подписке <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </motion.button>
            ) : (
              /* Active subscription — compact card */
              <button
                onClick={() => setActiveTab?.(isAdmin ? "admin_stats" : "subscription")}
                className="w-full card p-4 flex items-center gap-4 text-left transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: isAdmin ? "rgba(192, 38, 211, 0.15)" : "var(--color-accent-soft)" }}
                >
                  <Crown size={18} style={{ color: isAdmin ? "#c084fc" : "var(--color-accent)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: isAdmin ? "#c084fc" : "var(--color-foreground)",
                    }}
                  >
                    {isAdmin ? "Тариф: Админ (SaaS Owner)" : "Подписка"}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-foreground-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    {isAdmin
                      ? `Активна · ${appState.bots.length} ботов в работе`
                      : appState.subscriptionUntil
                        ? `Активна · продление ${new Date(appState.subscriptionUntil).toLocaleDateString("ru-RU")}`
                        : `Активна · ${appState.bots.length} ботов`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="badge"
                    style={{
                      fontSize: "11px",
                      background: isAdmin ? "var(--color-primary)" : undefined,
                      color: isAdmin ? "#fff" : undefined,
                    }}
                  >
                    {isAdmin ? "ADMIN" : "990 ₽/мес"}
                  </span>
                  <ChevronRight
                    size={16}
                    style={{ color: "var(--color-foreground-tertiary)" }}
                  />
                </div>
              </button>
            )}

            {/* Settings rows */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
              className="card-saas overflow-hidden p-0 divide-y divide-[var(--color-border)]"
              style={{ borderRadius: "24px" }}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => {
                    const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp;
                    tg?.HapticFeedback?.impactOccurred("light");
                    setNotificationsOpen((open) => !open);
                  }}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-surface-2)] transition-colors text-left group"
                >
                  <div
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                    style={{
                      background: "var(--color-primary-soft)",
                      color: "var(--color-primary)",
                    }}
                  >
                    <Zap size={18} />
                  </div>
                  <div className="flex-1">
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "var(--color-foreground)",
                      }}
                    >
                      Уведомления и чеки
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--color-foreground-tertiary)",
                      }}
                    >
                      Настройки Email и Telegram
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-[var(--color-foreground-tertiary)] transition-transform group-hover:translate-x-1"
                  />
                </button>

                {/* Expanded Content */}
                {notificationsOpen && <div style={{ padding: "0 20px 20px 20px" }}>
                  <div className="pt-4 border-t border-[var(--color-border)] space-y-5">
                    <div className="rounded-xl bg-[var(--color-surface-2)] p-3 text-[13px] text-[var(--color-foreground-secondary)]">
                      Telegram-уведомления о покупке, продлении и сбое списания обязательны: так вы не пропустите изменение доступа.
                    </div>
                    <div>
                      <label className="text-[13px] font-bold text-[var(--color-foreground)] block mb-1.5">
                        Email для отправки чеков
                      </label>
                      <input
                        type="email"
                        placeholder="ваша@почта.ru"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="input w-full"
                        style={{ height: "44px", fontSize: "14px" }}
                      />
                    </div>
                    <label className="flex items-center justify-between gap-4 text-[13px] text-[var(--color-foreground)]">
                      <span><b>Чеки на email</b><br /><span className="text-[var(--color-foreground-secondary)]">Использовать email при оплате лицензии и PRO</span></span>
                      <input type="checkbox" checked={receiptsEnabled} onChange={(event) => setReceiptsEnabled(event.target.checked)} />
                    </label>
                    {notificationError && <p className="text-[13px] text-[var(--color-danger)]">{notificationError}</p>}
                    <button type="button" onClick={saveNotifications} disabled={isSavingNotifications} className="btn-primary w-full">
                      {isSavingNotifications ? "Сохраняем…" : "Сохранить настройки"}
                    </button>
                  </div>
                </div>}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
