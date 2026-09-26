import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  Crown,
  Gift,
  Layers,
  Link2,
  MoreHorizontal,
  Plus,
  Power,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  X,
  Users,
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";
import { useAlert } from "../AlertProvider";
import { BotCreateSheet } from "../sheets/BotCreateSheet";
import {
  apiService,
  type AdminAuditEntry,
  type AdminBotAction,
  type AdminBot,
  type AdminOperation,
  type AdminOverview,
  type AdminSaasPayment,
  type AdminSystemStatus,
  type AdminUser,
  type AdminUserDetail,
  type AccessLink,
} from "../../services/api";

type AdminSection = "overview" | "users" | "payments" | "operations" | "system" | "access-links";
type LoadState = "idle" | "loading" | "ready" | "error";

const sections: Array<{ id: AdminSection; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Пользователи" },
  { id: "payments", label: "Платежи" },
  { id: "operations", label: "Операции" },
  { id: "system", label: "Система" },
  { id: "access-links", label: "Ссылки доступа" },
];

const formatAmount = (amount: number, currency: string = "RUB") =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

const productName: Record<AdminSaasPayment["product"], string> = {
  license: "Подписка на бота",
  pro_initial: "Подписка на бота",
  pro_renewal: "Продление подписки",
};

const auditActionLabel: Record<string, string> = {
  user_access_disabled: "Доступ пользователя ограничен",
  user_access_restored: "Доступ пользователя восстановлен",
  lifetime_licenses_granted: "Выдан бессрочный доступ",
  lifetime_licenses_revoked: "Отозван бессрочный доступ",
  pro_extended: "Подписка продлена",
  pro_auto_renew_disabled: "Автопродление подписки отключено",
  bot_start: "Бот запущен",
  bot_stop: "Бот остановлен",
  bot_reinstall_webhook: "Webhook бота переустановлен",
  payment_delivery_retry: "Повторена выдача после оплаты",
  bot_leads_archived: "Список лидов очищен",
};

function auditSummary(entry: AdminAuditEntry): string | null {
  const details = entry.details;
  if (entry.action === "lifetime_licenses_granted" || entry.action === "lifetime_licenses_revoked") {
    return typeof details.quantity === "number" ? `Бессрочных доступов: ${details.quantity}` : null;
  }
  if (entry.action === "pro_extended") {
    return typeof details.days === "number" ? `Добавлено дней: ${details.days}` : null;
  }
  if (entry.action === "user_access_disabled" && Array.isArray(details.stopped_active_bot_ids)) {
    return details.stopped_active_bot_ids.length ? `Остановлено ботов: ${details.stopped_active_bot_ids.length}` : "Боты продолжили работу";
  }
  if (entry.action === "payment_delivery_retry") {
    const delivered = details.access_delivered === true;
    const notified = details.owner_notified === true;
    return delivered || notified ? "Попытка завершилась успешно" : "Попытка передана в очередь";
  }
  if (entry.action === "bot_leads_archived") {
    return typeof details.archived_count === "number" ? `Скрыто лидов из CRM: ${details.archived_count}` : null;
  }
  return null;
}

export function AdminStats() {
  const { setToastMessage, setToastType, setActiveTab, selectBot, setSheet, setAdminOrigin } = useAppState();
  const { showConfirm } = useAlert();
  const [section, setSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminSaasPayment[]>([]);
  const [operations, setOperations] = useState<AdminOperation[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [accessLinks, setAccessLinks] = useState<AccessLink[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usersQuery, setUsersQuery] = useState("");
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [selectedUserState, setSelectedUserState] = useState<LoadState>("idle");
  const [selectedUserError, setSelectedUserError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [botActionId, setBotActionId] = useState<number | null>(null);
  const [operationActionId, setOperationActionId] = useState<string | null>(null);
  const [grantTarget, setGrantTarget] = useState<
    | { type: "user"; user: AdminUser; bots?: AdminBot[] }
    | { type: "bot"; bot: AdminBot }
    | null
  >(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [quickGrantUserId, setQuickGrantUserId] = useState<number | null>(null);
  const [isCreateBotForUserOpen, setIsCreateBotForUserOpen] = useState(false);

  const handleEditFunnel = useCallback(
    async (bot: AdminBot) => {
      try {
        setAdminOrigin(true);
        const result = await selectBot(String(bot.id), true);
        if (result.status === "error") {
          setToastType("error");
          setToastMessage(result.message || "Не удалось открыть воронку бота.");
          return;
        }
        setSelectedUser(null);
        setActiveTab("build");
        setToastType("success");
        setToastMessage(`Открыт сценарий бота «${bot.display_name}».`);
      } catch {
        setToastType("error");
        setToastMessage("Не удалось открыть сценарий бота.");
      }
    },
    [selectBot, setActiveTab, setAdminOrigin, setToastMessage, setToastType]
  );

  const handleOpenBotIntegrations = useCallback(
    async (bot: AdminBot) => {
      try {
        setAdminOrigin(true);
        const result = await selectBot(String(bot.id), true);
        if (result.status === "error") {
          setToastType("error");
          setToastMessage(result.message || "Не удалось открыть интеграции бота.");
          return;
        }
        setSelectedUser(null);
        setActiveTab("integrations");
        setToastType("success");
        setToastMessage(`Открыты интеграции и касса бота «${bot.display_name}».`);
      } catch {
        setToastType("error");
        setToastMessage("Не удалось открыть интеграции бота.");
      }
    },
    [selectBot, setActiveTab, setAdminOrigin, setToastMessage, setToastType]
  );

  const handleOpenBotWorkspace = useCallback(
    async (bot: AdminBot) => {
      try {
        setAdminOrigin(true);
        const result = await selectBot(String(bot.id), true);
        if (result.status === "error") {
          setToastType("error");
          setToastMessage(result.message || "Не удалось открыть воркспейс бота.");
          return;
        }
        setSelectedUser(null);
        setActiveTab("home");
        setToastType("success");
        setToastMessage(`Открыт воркспейс бота «${bot.display_name}».`);
      } catch {
        setToastType("error");
        setToastMessage("Не удалось открыть воркспейс бота.");
      }
    },
    [selectBot, setActiveTab, setAdminOrigin, setToastMessage, setToastType]
  );

  const handleOpenBotSettings = useCallback(
    async (bot: AdminBot) => {
      try {
        setAdminOrigin(true);
        const result = await selectBot(String(bot.id), true);
        if (result.status === "error") {
          setToastType("error");
          setToastMessage(result.message || "Не удалось открыть настройки бота.");
          return;
        }
        setSelectedUser(null);
        setActiveTab("build");
        setSheet("bot_settings");
      } catch {
        setToastType("error");
        setToastMessage("Не удалось открыть настройки бота.");
      }
    },
    [selectBot, setActiveTab, setAdminOrigin, setSheet, setToastMessage, setToastType]
  );

  const refreshSection = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      if (section === "overview") {
        const [nextOverview, nextOperations] = await Promise.all([
          apiService.getAdminOverview(),
          apiService.getAdminOperations(1, 5),
        ]);
        setOverview(nextOverview);
        setOperations(nextOperations.operations);
      }
      if (section === "users") {
        const nextUsers = await apiService.getAdminUsers(usersQuery, 1, 50);
        setUsers(nextUsers.users);
      }
      if (section === "payments") {
        const nextPayments = await apiService.getAdminPayments(undefined, 1, 50);
        setPayments(nextPayments.payments);
      }
      if (section === "operations") {
        const nextOperations = await apiService.getAdminOperations(1, 50);
        setOperations(nextOperations.operations);
      }
      if (section === "system") {
        const [nextAudit, nextSystemStatus] = await Promise.all([
          apiService.getAdminAuditLog(1, 50),
          apiService.getAdminSystemStatus(),
        ]);
        setAuditEntries(nextAudit.entries);
        setSystemStatus(nextSystemStatus);
      }
      if (section === "access-links") {
        const nextLinks = await apiService.listAccessLinks();
        setAccessLinks(nextLinks.links);
      }
      setState("ready");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось загрузить данные админки.";
      setError(message);
      setState("error");
      setToastType("error");
      setToastMessage(message);
    }
  }, [section, setToastMessage, setToastType, usersQuery]);

  useEffect(() => {
    const delay = section === "users" ? 250 : 0;
    const timer = window.setTimeout(() => {
      void refreshSection();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [refreshSection, section]);

  const activeSection = useMemo(
    () => sections.find((item) => item.id === section)?.label ?? "Админ",
    [section],
  );

  const loadUserProfile = useCallback(async (userId: number) => {
    setSelectedUserState("loading");
    setSelectedUserError(null);
    try {
      const detail = await apiService.getAdminUserDetail(userId);
      setSelectedUser(detail);
      setSelectedUserState("ready");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось открыть профиль пользователя.";
      setSelectedUserError(message);
      setSelectedUserState("error");
      setToastType("error");
      setToastMessage(message);
    }
  }, [setToastMessage, setToastType]);

  const openUserProfile = useCallback((user: AdminUser) => {
    setSelectedUser({ user, bots: [] });
    void loadUserProfile(user.id);
  }, [loadUserProfile]);

  const applyUserAction = useCallback(async (data: { stopActiveBots?: boolean }) => {
    if (!actionUser) return;
    setActionBusy(true);
    try {
      const result = await apiService.setAdminUserAccess(actionUser.id, {
        disabled: !actionUser.is_disabled,
        stopActiveBots: Boolean(data.stopActiveBots),
      });
      setToastType("success");
      setToastMessage(result.is_disabled ? `Доступ ограничен${result.stopped_active_bots ? `, остановлено ботов: ${result.stopped_active_bots}` : ""}.` : "Доступ к Mini App восстановлен.");
      setActionUser(null);
      await refreshSection();
      if (selectedUser?.user.id === actionUser.id) {
        await loadUserProfile(actionUser.id);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось применить изменение.";
      setToastType("error");
      setToastMessage(message);
    } finally {
      setActionBusy(false);
    }
  }, [actionUser, loadUserProfile, refreshSection, selectedUser, setToastMessage, setToastType]);

  const executeBotAction = useCallback(async (bot: AdminBot, action: AdminBotAction) => {
    setBotActionId(bot.id);
    try {
      const result = await apiService.runAdminBotAction(bot.id, action);
      setSelectedUser((current) => current ? {
        ...current,
        bots: current.bots.map((item) => item.id === bot.id ? { ...item, status: result.botStatus } : item),
      } : current);
      setToastType("success");
      setToastMessage(result.message);
    } catch (requestError) {
      setToastType("error");
      setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось выполнить действие с ботом.");
    } finally {
      setBotActionId(null);
    }
  }, [setToastMessage, setToastType]);

  const requestBotAction = useCallback((bot: AdminBot, action: AdminBotAction) => {
    if (action === "stop") {
      showConfirm({
        title: "Остановить бота?",
        message: "Бот перестанет обрабатывать воронку. Webhook останется подключённым только для технических событий Telegram.",
        type: "danger",
        confirmText: "Остановить",
        cancelText: "Отмена",
        onConfirm: () => { void executeBotAction(bot, action); },
      });
      return;
    }
    void executeBotAction(bot, action);
  }, [executeBotAction, showConfirm]);

  const checkBotReadiness = useCallback(async (bot: AdminBot) => {
    setBotActionId(bot.id);
    try {
      const result = await apiService.getAdminBotReadiness(bot.id);
      setToastType(result.isReady ? "success" : "error");
      setToastMessage(result.isReady ? "Воронка готова к запуску." : (result.summary || `Бот пока нельзя запустить:\n• ${result.reasons.join("\n• ")}`));
    } catch (requestError) {
      setToastType("error");
      setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось проверить готовность.");
    } finally {
      setBotActionId(null);
    }
  }, [setToastMessage, setToastType]);

  const archiveBotLeads = useCallback((bot: AdminBot) => {
    showConfirm({
      title: "Очистить список лидов?",
      message: "Лиды исчезнут из CRM, их дожимы будут отменены. Оплаты, аналитика и история блокировки токена сохранятся. Если человек снова нажмёт /start, он станет новым лидом.",
      type: "danger",
      confirmText: "Очистить список",
      cancelText: "Отмена",
      onConfirm: () => {
        void (async () => {
          setBotActionId(bot.id);
          try {
            const result = await apiService.archiveAdminBotLeads(bot.id);
            setToastType("success");
            setToastMessage(result.archivedCount ? `Скрыто лидов из CRM: ${result.archivedCount}.` : "В CRM уже нет активных лидов.");
          } catch (requestError) {
            setToastType("error");
            setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось очистить список лидов.");
          } finally {
            setBotActionId(null);
          }
        })();
      },
    });
  }, [setToastMessage, setToastType, showConfirm]);

  const retryOperation = useCallback((operation: AdminOperation) => {
    showConfirm({
      title: "Повторить выдачу?",
      message: "Будет повторена только незавершённая выдача доступа или уведомление владельца. Новый счёт и списание не создаются.",
      type: "warning",
      confirmText: "Повторить",
      cancelText: "Отмена",
      onConfirm: () => {
        void (async () => {
          setOperationActionId(operation.payment_id);
          try {
            const result = await apiService.retryAdminOperation(operation.payment_id);
            setToastType("success");
            setToastMessage(
              result.access_delivered || result.owner_notified
                ? "Повторная попытка выполнена. Состояние операции обновлено."
                : "Повторная попытка поставлена в очередь. Проверьте статус через минуту.",
            );
            await refreshSection();
          } catch (requestError) {
            setToastType("error");
            setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось повторить операцию.");
          } finally {
            setOperationActionId(null);
          }
        })();
      },
    });
  }, [refreshSection, setToastMessage, setToastType, showConfirm]);

  const openGrantForUser = useCallback(async (user: AdminUser) => {
    setQuickGrantUserId(user.id);
    try {
      const detail = await apiService.getAdminUserDetail(user.id);
      setGrantTarget({ type: "user", user, bots: detail.bots });
    } catch {
      setGrantTarget({ type: "user", user, bots: [] });
    } finally {
      setQuickGrantUserId(null);
    }
  }, []);

  const openGrantForBot = useCallback((bot: AdminBot) => {
    setGrantTarget({ type: "bot", bot });
  }, []);

  const applyGrant = useCallback(
    async (data: {
      botId?: number;
      days?: number;
      isLifetime?: boolean;
    }) => {
      if (!grantTarget) return;
      setGrantBusy(true);
      try {
        if (grantTarget.type === "bot") {
          const result = await apiService.grantAdminBotSubscription(grantTarget.bot.id, {
            days: data.days,
            isLifetime: data.isLifetime,
          });
          setToastType("success");
          setToastMessage(result.message || "Подписка выдана.");
        } else {
          const targetBotId = data.botId ?? grantTarget.bots?.[0]?.id;
          if (!targetBotId) {
            throw new Error("У пользователя нет ботов для начисления подписки. Создайте бота или выдайте ссылку доступа.");
          }
          const result = await apiService.grantAdminUserBotPeriod(grantTarget.user.id, {
            botId: targetBotId,
            days: data.days,
            isLifetime: data.isLifetime,
          });
          setToastType("success");
          setToastMessage(result.message || "Подписка выдана.");
        }
        setGrantTarget(null);
        await refreshSection();
        if (selectedUser) {
          await loadUserProfile(selectedUser.user.id);
        }
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Не удалось выдать подписку.";
        setToastType("error");
        setToastMessage(message);
      } finally {
        setGrantBusy(false);
      }
    },
    [grantTarget, loadUserProfile, refreshSection, selectedUser, setToastMessage, setToastType]
  );

  const revokeSubscription = useCallback(
    (bot: AdminBot) => {
      showConfirm({
        title: "Отозвать подписку бота?",
        message: `Подписка на бота «${bot.display_name}» будет отключена. Бот перестанет работать, если у него нет активного тарифа.`,
        type: "danger",
        confirmText: "Отозвать",
        cancelText: "Отмена",
        onConfirm: () => {
          void (async () => {
            setBotActionId(bot.id);
            try {
              const result = await apiService.revokeAdminBotSubscription(bot.id);
              setToastType("success");
              setToastMessage(result.message || "Подписка бота отозвана.");
              await refreshSection();
              if (selectedUser) {
                await loadUserProfile(selectedUser.user.id);
              }
            } catch (requestError) {
              const message =
                requestError instanceof Error ? requestError.message : "Не удалось отозвать подписку.";
              setToastType("error");
              setToastMessage(message);
            } finally {
              setBotActionId(null);
            }
          })();
        },
      });
    },
    [loadUserProfile, refreshSection, selectedUser, setToastMessage, setToastType, showConfirm]
  );

  const handleManageVip = useCallback(
    async (action: "grant" | "revoke", days?: number, isPermanent?: boolean) => {
      if (!selectedUser) return;
      const user = selectedUser.user;
      if (action === "revoke") {
        showConfirm({
          title: "Отозвать VIP-статус?",
          message: `VIP-статус пользователя ID ${user.telegram_id} будет отключен. Публикация ботов потребует отдельных подписок или свободных слотов.`,
          type: "danger",
          confirmText: "Отозвать VIP",
          cancelText: "Отмена",
          onConfirm: () => {
            void (async () => {
              try {
                const res = await apiService.changeUserVip(user.id, { action: "revoke" });
                setToastType("success");
                setToastMessage(res.message || "VIP-статус отозван");
                await loadUserProfile(user.id);
                await refreshSection();
              } catch (err) {
                setToastType("error");
                setToastMessage(err instanceof Error ? err.message : "Не удалось отозвать VIP");
              }
            })();
          },
        });
      } else {
        try {
          const res = await apiService.changeUserVip(user.id, { action: "grant", days, isPermanent });
          setToastType("success");
          setToastMessage(res.message || "VIP-статус выдан");
          await loadUserProfile(user.id);
          await refreshSection();
        } catch (err) {
          setToastType("error");
          setToastMessage(err instanceof Error ? err.message : "Не удалось выдать VIP");
        }
      }
    },
    [selectedUser, loadUserProfile, refreshSection, setToastMessage, setToastType, showConfirm]
  );

  const handleManageFreeSlots = useCallback(
    async (direction: "grant" | "revoke", quantity: number) => {
      if (!selectedUser) return;
      const user = selectedUser.user;
      if (direction === "revoke") {
        showConfirm({
          title: "Отозвать свободный слот?",
          message: `Количество бесплатных слотов пользователя будет уменьшено на ${quantity}.`,
          type: "warning",
          confirmText: "Отозвать",
          cancelText: "Отмена",
          onConfirm: () => {
            void (async () => {
              try {
                await apiService.changeUserFreeSlots(user.id, { direction: "revoke", quantity });
                setToastType("success");
                setToastMessage("Слот отозван");
                await loadUserProfile(user.id);
                await refreshSection();
              } catch (err) {
                setToastType("error");
                setToastMessage(err instanceof Error ? err.message : "Не удалось отозвать слот");
              }
            })();
          },
        });
      } else {
        try {
          await apiService.changeUserFreeSlots(user.id, { direction: "grant", quantity });
          setToastType("success");
          setToastMessage(`Начислено слотов: ${quantity}`);
          await loadUserProfile(user.id);
          await refreshSection();
        } catch (err) {
          setToastType("error");
          setToastMessage(err instanceof Error ? err.message : "Не удалось начислить слоты");
        }
      }
    },
    [selectedUser, loadUserProfile, refreshSection, setToastMessage, setToastType, showConfirm]
  );

  return (
    <section className="w-full pb-16" aria-labelledby="admin-title">
      <header className="mb-6 border-b border-[var(--color-border)] pb-5 md:mb-8 md:pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="kicker">Админ</p>
            <h1 id="admin-title" className="mt-2 text-page-title font-extrabold text-[var(--color-foreground)]">
              {activeSection}
            </h1>
            <p className="mt-1 text-body-sm text-[var(--color-foreground-secondary)]">
              Реальные данные платформы. Финансовые статусы подтверждаются только платёжными провайдерами.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSection()}
            disabled={state === "loading"}
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-body-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-wait disabled:opacity-60 xl:self-auto"
          >
            <RefreshCw size={16} className={state === "loading" ? "animate-spin" : ""} aria-hidden="true" />
            Обновить
          </button>
        </div>

        <nav className="mt-6 flex gap-1 overflow-x-auto scrollbar-none border-b border-[var(--color-border)]" aria-label="Разделы администрирования">
          {sections.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setSection(item.id);
                }}
                aria-current={active ? "page" : undefined}
                className={`relative h-10 shrink-0 px-3 text-sm font-semibold transition-colors ${
                  active
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {item.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--color-primary)]" />}
              </button>
            );
          })}
        </nav>
      </header>

      {state === "error" ? <ErrorState message={error ?? "Не удалось загрузить данные."} onRetry={refreshSection} /> : null}
      {state !== "error" && section === "overview" ? <Overview overview={overview} operations={operations} loading={state === "loading"} onNavigate={setSection} onRetryOperation={retryOperation} retryingOperationId={operationActionId} /> : null}
      {state !== "error" && section === "users" ? (
        selectedUser ? (
          <UserProfileScreen
            detail={selectedUser}
            state={selectedUserState}
            error={selectedUserError}
            busyBotId={botActionId}
            onClose={() => {
              setSelectedUser(null);
              setSelectedUserState("idle");
              setSelectedUserError(null);
            }}
            onRetry={() => void loadUserProfile(selectedUser.user.id)}
            onManageAccess={() => setActionUser(selectedUser.user)}
            onAction={requestBotAction}
            onCheckReadiness={checkBotReadiness}
            onArchiveLeads={archiveBotLeads}
            onOpenGrantBot={openGrantForBot}
            onOpenGrantUser={(user: AdminUser, bots: AdminBot[]) => setGrantTarget({ type: "user", user, bots })}
            onRevokeSubscription={revokeSubscription}
            onEditFunnel={handleEditFunnel}
            onOpenIntegrations={handleOpenBotIntegrations}
            onOpenWorkspace={handleOpenBotWorkspace}
            onOpenSettings={handleOpenBotSettings}
            onAddBot={() => setIsCreateBotForUserOpen(true)}
            onManageVip={handleManageVip}
            onManageFreeSlots={handleManageFreeSlots}
          />
        ) : (
          <UsersSection
            users={users}
            query={usersQuery}
            onQueryChange={setUsersQuery}
            loading={state === "loading"}
            quickGrantLoadingId={quickGrantUserId}
            onOpenProfile={openUserProfile}
            onQuickGrant={openGrantForUser}
          />
        )
      ) : null}
      {state !== "error" && section === "payments" ? <PaymentsSection payments={payments} loading={state === "loading"} /> : null}
      {state !== "error" && section === "operations" ? <OperationsSection operations={operations} loading={state === "loading"} onRetryOperation={retryOperation} retryingOperationId={operationActionId} /> : null}
      {state !== "error" && section === "system" ? <SystemSection entries={auditEntries} systemStatus={systemStatus} loading={state === "loading"} /> : null}
      {state !== "error" && section === "access-links" ? <AccessLinksSection links={accessLinks} loading={state === "loading"} onChanged={() => void refreshSection()} /> : null}
      {actionUser ? <UserActionDialog key={actionUser.id} user={actionUser} busy={actionBusy} onClose={() => setActionUser(null)} onApply={applyUserAction} /> : null}
      {grantTarget ? (
        <GrantSubscriptionDialog
          key={grantTarget.type === "bot" ? `bot-${grantTarget.bot.id}` : `user-${grantTarget.user.id}`}
          target={grantTarget}
          busy={grantBusy}
          onClose={() => setGrantTarget(null)}
          onApply={applyGrant}
          onNavigateToLinks={() => {
            setGrantTarget(null);
            setSection("access-links");
          }}
        />
      ) : null}
      {isCreateBotForUserOpen && selectedUser ? (
        <BotCreateSheet
          onClose={() => setIsCreateBotForUserOpen(false)}
          onCreate={async (botData) => {
            try {
              const newBot = await apiService.createBot({
                displayName: botData.displayName,
                token: botData.token,
                paymentProvider: botData.paymentProvider,
                paymentCreds: botData.paymentCreds,
                offerUrl: botData.offerUrl,
                ownerUserId: selectedUser.user.id,
              });
              setIsCreateBotForUserOpen(false);
              setToastType("success");
              setToastMessage(`Бот «${newBot.displayName}» успешно создан для пользователя.`);
              await loadUserProfile(selectedUser.user.id);
            } catch (err) {
              setToastType("error");
              setToastMessage(err instanceof Error ? err.message : "Не удалось создать бота.");
            }
          }}
        />
      ) : null}
    </section>
  );
}

function Overview({ overview, operations, loading, onNavigate, onRetryOperation, retryingOperationId }: { overview: AdminOverview | null; operations: AdminOperation[]; loading: boolean; onNavigate: (section: AdminSection) => void; onRetryOperation: (operation: AdminOperation) => void; retryingOperationId: string | null }) {
  const metrics = [
    { label: "Владельцы ботов", value: overview?.users_total, icon: Users, note: "Зарегистрированы в BotFlow" },
    { label: "Активные боты", value: overview ? `${overview.bots_active} / ${overview.bots_total}` : null, icon: Bot, note: "Активны сейчас" },
    { label: "SaaS-выручка", value: overview ? formatAmount(overview.saas_revenue) : null, icon: CreditCard, note: "Подтверждённые платежи" },
    { label: "Требуют внимания", value: overview?.operations_requiring_attention, icon: AlertTriangle, note: "Выдача доступа или уведомление" },
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, note }) => (
          <article key={label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
            <Icon size={18} className="mb-5 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="font-accent text-[22px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-[var(--color-foreground)]">{loading || value === null ? "—" : value}</p>
            <h2 className="mt-2 text-sm font-semibold text-[var(--color-foreground)]">{label}</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-foreground-secondary)]">{note}</p>
          </article>
        ))}
      </div>
      <Section title="Операции, требующие внимания" description="Оплаченные заказы, где выдача доступа или уведомление ещё не завершены.">
        {loading ? <RowsSkeleton count={2} /> : operations.length ? <div className="divide-y divide-[var(--color-border)]">{operations.map((operation) => <OperationRow key={operation.payment_id} operation={operation} onRetry={onRetryOperation} busy={retryingOperationId === operation.payment_id} />)}</div> : <EmptyState icon={<CheckCircle2 size={21} />} title="Незавершённых операций нет" description="Когда после оплаты потребуется повторить выдачу доступа или уведомление, запись появится здесь." />}
        {!loading && operations.length ? <button type="button" onClick={() => onNavigate("operations")} className="mt-4 text-sm font-semibold text-[var(--color-primary)] hover:underline">Открыть все операции</button> : null}
      </Section>
    </div>
  );
}

function UsersSection({
  users,
  query,
  onQueryChange,
  loading,
  quickGrantLoadingId,
  onOpenProfile,
  onQuickGrant,
}: {
  users: AdminUser[];
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  quickGrantLoadingId?: number | null;
  onOpenProfile: (user: AdminUser) => void;
  onQuickGrant: (user: AdminUser) => void;
}) {
  return (
    <Section
      title="Пользователи платформы"
      description="Нажмите на строку любого пользователя, чтобы открыть подробный профиль, управлять доступом и настроить подписки на его ботов."
    >
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder="@username, Telegram ID или ID BotFlow"
      />
      {loading ? (
        <RowsSkeleton count={5} />
      ) : users.length ? (
        <>
          <div className="mt-5 space-y-3 lg:hidden">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                loadingGrant={quickGrantLoadingId === user.id}
                onOpenProfile={onOpenProfile}
                onQuickGrant={onQuickGrant}
              />
            ))}
          </div>
          <div className="mt-5 hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]">
                <tr>
                  <th className="pb-3">Пользователь</th>
                  <th className="pb-3">Доступ к сервису</th>
                  <th className="pb-3">Боты</th>
                  <th className="pb-3">Регистрация</th>
                  <th className="pb-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => onOpenProfile(user)}
                    className="group cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/60 transition-colors"
                  >
                    <td className="py-4">
                      <p className="font-semibold tabular-nums text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                        {user.username ? `@${user.username.replace(/^@/, "")}` : `ID ${user.telegram_id}`}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">
                        Telegram ID: {user.telegram_id} · BotFlow #{user.id}
                      </p>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={user.is_disabled ? "danger" : "success"}>
                          {user.is_disabled ? (
                            <>
                              <ShieldAlert size={12} className="mr-1 inline" aria-hidden="true" />
                              Ограничен
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={12} className="mr-1 inline" aria-hidden="true" />
                              Активен
                            </>
                          )}
                        </StatusBadge>
                        {user.is_platform_admin ? (
                          <StatusBadge tone="warning">
                            <Crown size={12} className="mr-1 inline" aria-hidden="true" />
                            Администратор
                          </StatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="font-bold tabular-nums text-[var(--color-foreground)]">
                        {user.bots_count}
                      </span>{" "}
                      <span className="text-xs text-[var(--color-foreground-secondary)]">ботов</span>
                    </td>
                    <td className="py-4 whitespace-nowrap text-[var(--color-foreground-secondary)]">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickGrant(user);
                          }}
                          disabled={quickGrantLoadingId === user.id}
                          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--color-primary)] px-3 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                          title="Выдать бесплатный доступ (3 месяца на бота)"
                        >
                          {quickGrantLoadingId === user.id ? (
                            <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Gift size={14} aria-hidden="true" />
                          )}
                          +3 мес на бота
                        </button>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-foreground-secondary)] group-hover:bg-[var(--color-surface-2)] group-hover:text-[var(--color-primary)] transition-colors">
                          <ChevronRight size={18} aria-hidden="true" />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Users size={21} />}
          title="Пользователи не найдены"
          description="Проверьте @username, Telegram ID или внутренний ID BotFlow."
        />
      )}
    </Section>
  );
}

function UserCard({
  user,
  loadingGrant,
  onOpenProfile,
  onQuickGrant,
}: {
  user: AdminUser;
  loadingGrant?: boolean;
  onOpenProfile: (user: AdminUser) => void;
  onQuickGrant: (user: AdminUser) => void;
}) {
  return (
    <article
      onClick={() => onOpenProfile(user)}
      className="group cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-2)]/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold tabular-nums text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
            {user.username ? `@${user.username.replace(/^@/, "")}` : `ID ${user.telegram_id}`}
          </p>
          <p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">
            Telegram ID: {user.telegram_id} · BotFlow #{user.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge tone={user.is_disabled ? "danger" : "success"}>
            {user.is_disabled ? (
              <>
                <ShieldAlert size={11} className="mr-1 inline" aria-hidden="true" />
                Ограничен
              </>
            ) : (
              <>
                <ShieldCheck size={11} className="mr-1 inline" aria-hidden="true" />
                Активен
              </>
            )}
          </StatusBadge>
          {user.is_platform_admin ? (
            <StatusBadge tone="warning">
              <Crown size={11} className="mr-1 inline" aria-hidden="true" />
              Админ
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-foreground-secondary)]">Боты</dt>
          <dd className="mt-1 font-semibold tabular-nums text-[var(--color-foreground)]">
            {user.bots_count}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-foreground-secondary)]">Регистрация</dt>
          <dd className="mt-1 text-xs text-[var(--color-foreground-secondary)]">
            {formatDate(user.created_at)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)]/60 pt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickGrant(user);
          }}
          disabled={loadingGrant}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loadingGrant ? (
            <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Gift size={15} aria-hidden="true" />
          )}
          +3 мес на бота
        </button>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-foreground-secondary)] group-hover:text-[var(--color-primary)] transition-colors">
          Карточка
          <ChevronRight size={15} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function UserProfileScreen({
  detail,
  state,
  error,
  busyBotId,
  onClose,
  onRetry,
  onManageAccess,
  onAction,
  onCheckReadiness,
  onArchiveLeads,
  onOpenGrantBot,
  onOpenGrantUser,
  onRevokeSubscription,
  onEditFunnel,
  onOpenIntegrations,
  onOpenWorkspace,
  onOpenSettings,
  onAddBot,
  onManageVip,
  onManageFreeSlots,
}: {
  detail: AdminUserDetail;
  state: LoadState;
  error: string | null;
  busyBotId: number | null;
  onClose: () => void;
  onRetry: () => void;
  onManageAccess: () => void;
  onAction: (bot: AdminBot, action: AdminBotAction) => void;
  onCheckReadiness: (bot: AdminBot) => void;
  onArchiveLeads: (bot: AdminBot) => void;
  onOpenGrantBot: (bot: AdminBot) => void;
  onOpenGrantUser: (user: AdminUser, bots: AdminBot[]) => void;
  onRevokeSubscription: (bot: AdminBot) => void;
  onEditFunnel: (bot: AdminBot) => void;
  onOpenIntegrations?: (bot: AdminBot) => void;
  onOpenWorkspace?: (bot: AdminBot) => void;
  onOpenSettings?: (bot: AdminBot) => void;
  onAddBot?: () => void;
  onManageVip: (action: "grant" | "revoke", days?: number, isPermanent?: boolean) => void;
  onManageFreeSlots: (direction: "grant" | "revoke", quantity: number) => void;
}) {
  const { user, bots } = detail;

  const activeRunningCount = useMemo(
    () => bots.filter((b) => b.status === "active").length,
    [bots]
  );

  const activeSubCount = useMemo(
    () =>
      bots.filter(
        (b) =>
          b.subscription?.is_lifetime ||
          b.has_lifetime_license ||
          (b.subscription?.status === "active" &&
            (!b.subscription?.ends_at || new Date(b.subscription.ends_at) > new Date()))
      ).length,
    [bots]
  );

  const freeUsed = user.free_slots_used ?? bots.filter((b) => b.has_lifetime_license).length;
  const freeAvail = user.free_slots_available ?? Math.max(0, (user.lifetime_slots || 0) - freeUsed);
  const freeTotal = user.free_slots_total ?? user.lifetime_slots ?? 0;

  const displayName = user.username
    ? `@${user.username.replace(/^@/, "")}`
    : `Пользователь ${user.telegram_id}`;

  return (
    <div className="w-full space-y-4" aria-labelledby="admin-user-profile-title">
      {/* ── Breadcrumb + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px] font-semibold text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            Пользователи
          </button>
          <ChevronRight size={13} className="text-[var(--color-foreground-tertiary)]" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-[var(--color-foreground)]">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenGrantUser(user, bots)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-[11px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Gift size={13} aria-hidden="true" />
            +3 мес на бота
          </button>
          <button
            type="button"
            onClick={onManageAccess}
            className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px] font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            {user.is_disabled ? "Разблокировать" : "Ограничить доступ"}
          </button>
        </div>
      </div>

      {/* ── User identity ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2
            id="admin-user-profile-title"
            className="text-xl font-black tracking-tight text-[var(--color-foreground)]"
          >
            {displayName}
          </h2>
          <StatusBadge tone={user.is_disabled ? "danger" : "success"}>
            {user.is_disabled ? (
              <><ShieldAlert size={11} className="mr-1 inline" aria-hidden="true" />Доступ ограничен</>
            ) : (
              <><ShieldCheck size={11} className="mr-1 inline" aria-hidden="true" />Доступ активен</>
            )}
          </StatusBadge>
          {user.is_platform_admin && (
            <StatusBadge tone="warning">
              <Crown size={11} className="mr-1 inline" aria-hidden="true" />
              Администратор
            </StatusBadge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-[var(--color-foreground-tertiary)]">
            TG&nbsp;ID:&nbsp;<strong className="font-semibold text-[var(--color-foreground-secondary)]">{user.telegram_id}</strong>
          </span>
          <span className="text-[var(--color-border)]">·</span>
          <span className="text-[11px] text-[var(--color-foreground-tertiary)]">
            BotFlow:&nbsp;<strong className="font-semibold text-[var(--color-foreground-secondary)]">#{user.id}</strong>
          </span>
          <span className="text-[var(--color-border)]">·</span>
          <span className="text-[11px] text-[var(--color-foreground-tertiary)]">
            Регистрация:&nbsp;<strong className="font-semibold text-[var(--color-foreground-secondary)]">{formatDate(user.created_at)}</strong>
          </span>
        </div>
      </div>

      {state === "loading" ? (
        <RowsSkeleton count={5} />
      ) : state === "error" ? (
        <ErrorState message={error ?? "Не удалось открыть профиль."} onRetry={onRetry} />
      ) : (
        <>
          {/* ── 4 compact metrics ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ProfileMetric icon={<Bot size={16} />} label="Всего ботов" value={String(bots.length)} note={`В аккаунте: ${user.bots_count}`} />
            <ProfileMetric icon={<Activity size={16} />} label="Активны" value={`${activeRunningCount} / ${bots.length}`} note="Активные боты" />
            <ProfileMetric icon={<ShieldCheck size={16} />} label="С подпиской" value={`${activeSubCount} / ${bots.length}`} note="1 бот = 1 подписка" />
            <ProfileMetric icon={<Clock size={16} />} label="Регистрация" value={formatDate(user.created_at).split(",")[0]} note={formatDate(user.created_at).split(",")[1]?.trim()} />
          </div>

          {/* ── Entitlements: 3-column grid ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            {/* VIP */}
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                  <Crown size={16} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-[var(--color-foreground)] leading-none">VIP-статус</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-foreground-tertiary)]">Глобальный, все боты бесплатно</p>
                </div>
              </div>
              <div className="mb-3">
                {user.is_vip_permanent ? (
                  <StatusBadge tone="success">Бессрочно (навсегда)</StatusBadge>
                ) : user.is_vip ? (
                  <StatusBadge tone="success">до {formatDate(user.vip_ends_at || user.subscription_ends_at)}</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Не активен</StatusBadge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["30", "90", "365"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => onManageVip("grant", Number(d), false)}
                    className="h-7 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-[11px] font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors">
                    {d === "365" ? "+1 год" : `+${d} дн`}
                  </button>
                ))}
                <button type="button" onClick={() => onManageVip("grant", undefined, true)}
                  className="h-7 rounded-lg bg-amber-500/20 px-2.5 text-[11px] font-bold text-amber-500 hover:opacity-90 transition-opacity">
                  ∞ навсегда
                </button>
                {(user.is_vip || user.is_vip_permanent) && (
                  <button type="button" onClick={() => onManageVip("revoke")}
                    className="h-7 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 text-[11px] font-semibold text-red-500 hover:bg-red-500/20 transition-colors">
                    Отозвать
                  </button>
                )}
              </div>
            </section>

            {/* Free Slots */}
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <Layers size={16} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-[var(--color-foreground)] leading-none">Бесплатные боты</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-foreground-tertiary)]">1 слот = 1 бот навсегда</p>
                </div>
              </div>
              <div className="mb-3 flex items-center gap-4">
                {[
                  { v: freeTotal, label: "всего" },
                  { v: freeUsed, label: "исп." },
                  { v: freeAvail, label: "своб.", primary: true },
                ].map(({ v, label, primary }) => (
                  <div key={label} className="text-center">
                    <p className={`font-accent text-lg font-black tabular-nums ${primary ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"}`}>{v}</p>
                    <p className="text-[10px] text-[var(--color-foreground-tertiary)]">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onManageFreeSlots("grant", 1)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 text-[11px] font-bold text-white hover:opacity-90 transition-opacity">
                  <Plus size={11} />1 слот
                </button>
                <button type="button" onClick={() => onManageFreeSlots("grant", 5)}
                  className="h-7 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-[11px] font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors">
                  +5 слотов
                </button>
                {freeAvail > 0 && (
                  <button type="button" onClick={() => onManageFreeSlots("revoke", 1)}
                    className="h-7 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 text-[11px] font-semibold text-red-500 hover:bg-red-500/20 transition-colors">
                    −1 слот
                  </button>
                )}
              </div>
            </section>

            {/* Mini App Access */}
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${user.is_disabled ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-500"}`}>
                  <ShieldCheck size={16} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-[var(--color-foreground)] leading-none">Доступ к сервису</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-foreground-tertiary)]">Mini App · BotFlow</p>
                </div>
              </div>
              <div className="mb-3">
                <StatusBadge tone={user.is_disabled ? "danger" : "success"}>
                  {user.is_disabled ? "Вход заблокирован" : "Вход разрешён"}
                </StatusBadge>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-foreground-secondary)]">
                  {user.is_disabled
                    ? "Пользователь не может открывать интерфейс и редактировать воронки."
                    : "Стандартный доступ к платформе, созданию и настройке воронок."}
                </p>
              </div>
              <button
                type="button"
                onClick={onManageAccess}
                className="h-7 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-[11px] font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]"
              >
                {user.is_disabled ? "Разблокировать вход" : "Ограничить доступ"}
              </button>
            </section>
          </div>

          {/* ── Bots ── */}
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
              <div>
                <h3 className="text-[13px] font-bold text-[var(--color-foreground)]">
                  Боты пользователя · {bots.length}
                </h3>
                <p className="text-[11px] text-[var(--color-foreground-tertiary)]">
                  1 бот = 1 подписка. Настройте воронку прямо отсюда.
                </p>
              </div>
              {onAddBot && (
                <button
                  type="button"
                  onClick={onAddBot}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-[11px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Plus size={13} /> Добавить бота
                </button>
              )}
            </div>
            <div className="p-4">
              {bots.length ? (
                <div className="space-y-2.5">
                  {bots.map((bot) => (
                    <AdminBotRow
                      key={bot.id}
                      bot={bot}
                      busy={busyBotId === bot.id}
                      showOwner={false}
                      userIsVip={Boolean(user.is_vip_permanent || user.is_vip)}
                      onAction={onAction}
                      onCheckReadiness={onCheckReadiness}
                      onArchiveLeads={onArchiveLeads}
                      onOpenGrant={onOpenGrantBot}
                      onRevokeSubscription={onRevokeSubscription}
                      onEditFunnel={onEditFunnel}
                      onOpenIntegrations={onOpenIntegrations}
                      onOpenWorkspace={onOpenWorkspace}
                      onOpenSettings={onOpenSettings}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Bot size={21} />}
                  title="У пользователя пока нет ботов"
                  description="Как только пользователь создаст бота в интерфейсе, он появится здесь."
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ProfileMetric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon: ReactNode;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <div className="text-[var(--color-primary)] shrink-0" aria-hidden="true">{icon}</div>
      <div className="min-w-0">
        <p className="font-accent text-sm font-bold tabular-nums leading-none text-[var(--color-foreground)]">{value}</p>
        <p className="mt-1 text-[11px] font-semibold text-[var(--color-foreground-secondary)] truncate">{label}</p>
        {note && <p className="text-[10px] leading-none text-[var(--color-foreground-tertiary)] truncate mt-0.5">{note}</p>}
      </div>
    </article>
  );
}




function UserActionDialog({
  user,
  busy,
  onClose,
  onApply,
}: {
  user: AdminUser;
  busy: boolean;
  onClose: () => void;
  onApply: (data: { stopActiveBots?: boolean }) => Promise<void>;
}) {
  const [stopActiveBots, setStopActiveBots] = useState(false);
  const isRestricting = !user.is_disabled;

  const submit = () => void onApply({ stopActiveBots });

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-action-title"
        className="w-full max-w-lg rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-foreground-secondary)]">
              {user.username ? `@${user.username.replace(/^@/, "")}` : `Пользователь ${user.telegram_id}`}
            </p>
            <h2 id="admin-user-action-title" className="mt-1 text-lg font-bold text-[var(--color-foreground)]">
              Управление доступом к сервису
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">
            {isRestricting
              ? "Ограничить доступ пользователя к платформе?"
              : "Восстановить доступ пользователя к платформе?"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-foreground-secondary)]">
            {isRestricting
              ? "Пользователь не сможет открывать интерфейс конструктора и редактировать воронки."
              : "Пользователь снова сможет открывать интерфейс и управлять своими ботами."}
          </p>

          {isRestricting ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-foreground-secondary)]">
              <input
                type="checkbox"
                checked={stopActiveBots}
                onChange={(event) => setStopActiveBots(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              />
              <span>
                <strong className="text-[var(--color-foreground)]">Также остановить все активные боты</strong>
                <br />
                Боты перейдут в статус «черновик» и перестанут обрабатывать диалоги в Telegram.
              </span>
            </label>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`h-11 rounded-xl px-5 text-sm font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60 ${
              isRestricting
                ? "bg-[var(--color-danger)] hover:opacity-90"
                : "bg-[var(--color-primary)] hover:opacity-90"
            }`}
          >
            {busy ? "Сохраняем…" : isRestricting ? "Ограничить доступ" : "Восстановить доступ"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface GrantSubscriptionDialogProps {
  target:
    | { type: "user"; user: AdminUser; bots?: AdminBot[] }
    | { type: "bot"; bot: AdminBot };
  busy: boolean;
  onClose: () => void;
  onApply: (data: {
    botId?: number;
    days?: number;
    isLifetime?: boolean;
  }) => Promise<void>;
  onNavigateToLinks?: () => void;
}

function GrantSubscriptionDialog({
  target,
  busy,
  onClose,
  onApply,
  onNavigateToLinks,
}: GrantSubscriptionDialogProps) {
  const isBotTarget = target.type === "bot";
  const user = isBotTarget ? null : target.user;
  const fixedBot = isBotTarget ? target.bot : null;
  const userBots = isBotTarget ? [] : target.bots ?? [];

  const [selectedBotId, setSelectedBotId] = useState<number | undefined>(
    fixedBot ? fixedBot.id : userBots.length > 0 ? userBots[0].id : undefined
  );
  const [selectedPreset, setSelectedPreset] = useState<"30" | "90" | "180" | "365" | "lifetime" | "custom">("90");
  const [customDays, setCustomDays] = useState("90");

  const effectiveDays = useMemo(() => {
    if (selectedPreset === "lifetime") return undefined;
    if (selectedPreset === "custom") return Math.max(1, Number(customDays) || 30);
    return Number(selectedPreset) || 90;
  }, [selectedPreset, customDays]);

  const isLifetime = selectedPreset === "lifetime";

  const targetTitle = isBotTarget
    ? `Бот «${fixedBot?.display_name}»`
    : `Пользователь ${user?.username ? `@${user.username.replace(/^@/, "")}` : user?.telegram_id}`;

  const currentSub = isBotTarget
    ? fixedBot?.subscription
    : userBots.find((b) => b.id === selectedBotId)?.subscription;

  const submitLabel = useMemo(() => {
    if (isLifetime) return "Выдать бессрочный доступ на бота";
    if (selectedPreset === "90") return "Выдать 3 месяца бесплатно на бота";
    if (selectedPreset === "30") return "Выдать 1 месяц (30 дн.) на бота";
    if (selectedPreset === "180") return "Выдать 6 месяцев (180 дн.) на бота";
    if (selectedPreset === "365") return "Выдать 1 год (365 дн.) на бота";
    return `Выдать ${effectiveDays} дн. на бота`;
  }, [effectiveDays, isLifetime, selectedPreset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onApply({
      botId: isBotTarget ? fixedBot?.id : selectedBotId,
      days: isLifetime ? undefined : effectiveDays,
      isLifetime,
    });
  };

  const presets: Array<{ id: "30" | "90" | "180" | "365" | "lifetime"; label: string; badge?: string; hint: string }> = [
    { id: "30", label: "1 месяц", hint: "30 дней" },
    { id: "90", label: "3 месяца", badge: "Хит 90 дн.", hint: "90 дней бесплатно" },
    { id: "180", label: "6 месяцев", hint: "180 дней" },
    { id: "365", label: "1 год", hint: "365 дней" },
    { id: "lifetime", label: "Бессрочно", badge: "VIP", hint: "Навсегда без списаний" },
  ];

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-grant-sub-title"
        className="w-full max-w-lg rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-white">
                <Gift size={16} aria-hidden="true" />
              </div>
              <h2 id="admin-grant-sub-title" className="text-lg font-bold text-[var(--color-foreground)]">
                Выдать подписку на бота
              </h2>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--color-foreground-secondary)]">
              {targetTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {!isBotTarget && (
            <div>
              <label htmlFor="grant-bot-select" className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">
                Выберите бота для начисления
              </label>
              {userBots.length > 0 ? (
                <select
                  id="grant-bot-select"
                  value={selectedBotId ?? ""}
                  onChange={(e) => setSelectedBotId(Number(e.target.value) || undefined)}
                  disabled={busy}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {userBots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.display_name} {b.username ? `(@${b.username})` : ""} [ID #{b.id}]
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5 rounded-2xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)]/20 p-4 text-xs leading-5 text-[var(--color-foreground)]">
                  <p className="font-bold">У пользователя ещё нет созданных ботов</p>
                  <p className="mt-1 text-[var(--color-foreground-secondary)]">
                    Подписка привязывается к конкретному боту (1 бот = 1 подписка). Чтобы выдать доступ новому пользователю до создания бота, используйте раздел «Ссылки доступа».
                  </p>
                  {onNavigateToLinks && (
                    <button
                      type="button"
                      onClick={onNavigateToLinks}
                      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <Link2 size={14} aria-hidden="true" />
                      Перейти в «Ссылки доступа»
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {(isBotTarget || userBots.length > 0) && (
            <>
              {/* Статус выбранного бота без смайликов */}
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
                <span className="font-semibold text-[var(--color-foreground)]">Текущий статус бота:</span>
                {!currentSub ? (
                  <span className="inline-flex items-center gap-1 text-[var(--color-foreground-secondary)]">
                    <Clock size={13} aria-hidden="true" /> Без подписки
                  </span>
                ) : currentSub.is_lifetime ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-success)]">
                    <ShieldCheck size={13} aria-hidden="true" /> Бессрочный доступ
                  </span>
                ) : currentSub.status === "active" && currentSub.ends_at ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-success)]">
                    <CheckCircle2 size={13} aria-hidden="true" /> Активна до {formatDate(currentSub.ends_at)}
                  </span>
                ) : currentSub.ends_at ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-danger)]">
                    <AlertCircle size={13} aria-hidden="true" /> Истекла {formatDate(currentSub.ends_at)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[var(--color-foreground-secondary)]">
                    <Clock size={13} aria-hidden="true" /> Без подписки
                  </span>
                )}
              </div>

              {/* Срок бесплатного доступа */}
              <div>
                <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">
                  Срок начисления подписки
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {presets.map((preset) => {
                    const active = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPreset(preset.id)}
                        className={`relative flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                          active
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-2 ring-[var(--color-primary)]/20"
                            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-sm font-bold text-[var(--color-foreground)]">{preset.label}</span>
                          {preset.badge && (
                            <span className="rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase">
                              {preset.badge}
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 text-[11px] text-[var(--color-foreground-secondary)]">{preset.hint}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setSelectedPreset("custom")}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                      selectedPreset === "custom"
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-2 ring-[var(--color-primary)]/20"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50"
                    }`}
                  >
                    <span className="text-sm font-bold text-[var(--color-foreground)]">Свой срок</span>
                    <span className="mt-0.5 text-[11px] text-[var(--color-foreground-secondary)]">Указать дни</span>
                  </button>
                </div>

                {selectedPreset === "custom" && (
                  <div className="mt-3">
                    <label htmlFor="grant-custom-days" className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">
                      Количество дней
                    </label>
                    <input
                      id="grant-custom-days"
                      type="number"
                      min="1"
                      max="3650"
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ""))}
                      className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      placeholder="Например, 90"
                    />
                  </div>
                )}

                <p className="mt-3 text-xs leading-5 text-[var(--color-foreground-tertiary)]">
                  {isLifetime
                    ? "Бессрочный доступ закрепляется за данным ботом. Бот продолжит работать без необходимости продлевать тариф."
                    : `Срок суммируется с текущей подпиской бота. Если подписки не было, активируется на ${effectiveDays} дн. с сегодняшнего дня.`}
                </p>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy || (!isBotTarget && userBots.length === 0)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Gift size={16} aria-hidden="true" />
              {busy ? "Выдаём…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminBotRow({
  bot,
  busy,
  showOwner = true,
  userIsVip = false,
  onAction,
  onCheckReadiness,
  onArchiveLeads,
  onOpenGrant,
  onRevokeSubscription,
  onEditFunnel,
  onOpenIntegrations,
  onOpenWorkspace: _onOpenWorkspace,
  onOpenSettings: _onOpenSettings,
}: {
  bot: AdminBot;
  busy: boolean;
  showOwner?: boolean;
  userIsVip?: boolean;
  onAction: (bot: AdminBot, action: AdminBotAction) => void;
  onCheckReadiness: (bot: AdminBot) => void;
  onArchiveLeads: (bot: AdminBot) => void;
  onOpenGrant?: (bot: AdminBot) => void;
  onRevokeSubscription?: (bot: AdminBot) => void;
  onEditFunnel?: (bot: AdminBot) => void;
  onOpenIntegrations?: (bot: AdminBot) => void;
  onOpenWorkspace?: (bot: AdminBot) => void;
  onOpenSettings?: (bot: AdminBot) => void;
}) {
  const isActive = bot.status === "active";
  const [menuOpen, setMenuOpen] = useState(false);

  const sub = bot.subscription;
  const isSubLifetime = sub?.is_lifetime || bot.has_lifetime_license;
  const hasActiveSub =
    isSubLifetime ||
    (sub?.status === "active" && (!sub?.ends_at || new Date(sub.ends_at) > new Date()));

  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 transition-all hover:bg-[var(--color-surface-2)]/70">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:pr-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-bold text-[var(--color-foreground)]">
              {bot.display_name}
            </h4>
            <StatusBadge tone={isActive ? "success" : bot.status === "archived" ? "danger" : "neutral"}>
              {isActive ? "Активен" : bot.status === "archived" ? "Архив" : "Черновик"}
            </StatusBadge>
            {userIsVip ? (
              <StatusBadge tone="success">
                <Crown size={12} className="mr-1 inline" aria-hidden="true" />
                Бесплатно (VIP)
              </StatusBadge>
            ) : isSubLifetime ? (
              <StatusBadge tone="success">
                <ShieldCheck size={12} className="mr-1 inline" aria-hidden="true" />
                Бессрочно
              </StatusBadge>
            ) : sub?.status === "active" && sub?.ends_at ? (
              <StatusBadge tone="success">
                <CheckCircle2 size={12} className="mr-1 inline" aria-hidden="true" />
                Подписка до {formatDate(sub.ends_at)}
              </StatusBadge>
            ) : sub?.ends_at ? (
              <StatusBadge tone="danger">
                <AlertCircle size={12} className="mr-1 inline" aria-hidden="true" />
                Истекла {formatDate(sub.ends_at)}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                <Clock size={12} className="mr-1 inline" aria-hidden="true" />
                Без подписки
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-[var(--color-foreground-secondary)]">
            {bot.username ? `@${bot.username.replace(/^@/, "")}` : "Username не задан"}
            {showOwner ? ` · Владелец: ${bot.owner_telegram_id}` : ""} · Лидов в CRM: {bot.users_count}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--color-foreground-secondary)]">
            {bot.payment_provider ? `Касса: ${bot.payment_provider}` : "Касса: не подключена"} · Воронка: {bot.funnel_complete ? "настроена" : "не заполнена"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Кнопка прямого перехода в конструктор воронки */}
          {onEditFunnel ? (
            <button
              type="button"
              onClick={() => onEditFunnel(bot)}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-3 text-xs font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              title="Открыть конструктор и настроить сценарий этого бота"
            >
              <Workflow size={15} aria-hidden="true" />
              Заполнить воронку
            </button>
          ) : null}

          {/* Кнопка перехода в платёжки и токен */}
          {onOpenIntegrations ? (
            <button
              type="button"
              onClick={() => onOpenIntegrations(bot)}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="Подключить токен бота и платёжную систему (ЮKassa / Robokassa / Prodamus)"
            >
              <CreditCard size={15} aria-hidden="true" />
              Платёжка и токен
            </button>
          ) : null}

          {/* Кнопка запуска (в формате как в сценарии воронки) */}
          <button
            type="button"
            onClick={() => onAction(bot, isActive ? "stop" : "start")}
            disabled={busy || bot.status === "archived"}
            className="size-10 rounded-xl flex items-center justify-center border transition-colors shrink-0 disabled:opacity-60"
            style={{
              borderColor: isActive
                ? "var(--color-success-soft)"
                : "var(--color-border)",
              color: isActive
                ? "var(--color-success)"
                : "var(--color-foreground-tertiary)",
              background: isActive
                ? "var(--color-success-soft)"
                : "var(--color-surface)",
            }}
            title={isActive ? "Остановить бота" : "Запустить бота"}
            aria-label={isActive ? "Остановить бота" : "Запустить бота"}
          >
            {busy ? (
              <div className="animate-spin size-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Power size={17} />
            )}
          </button>

          {/* Кнопка [ ••• ] с выпадающими действиями */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
              aria-label="Дополнительные действия"
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-60"
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" role="presentation" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl">
                  {/* • Проверить готовность */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onCheckReadiness(bot);
                    }}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
                  >
                    <ScanSearch size={14} className="text-[var(--color-foreground-secondary)]" /> Проверить готовность
                  </button>

                  {/* • + 3 мес */}
                  {onOpenGrant ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenGrant(bot);
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
                    >
                      <Gift size={14} className="text-[var(--color-primary)]" /> + 3 мес
                    </button>
                  ) : null}

                  {/* • Переустановить Webhook */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onAction(bot, "reinstall_webhook");
                    }}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
                  >
                    <Link2 size={14} className="text-[var(--color-foreground-secondary)]" /> Переустановить Webhook
                  </button>

                  <div className="my-1 border-t border-[var(--color-border)]" />

                  {/* • Очистить лиды CRM */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onArchiveLeads(bot);
                    }}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)] disabled:opacity-60"
                  >
                    <Trash2Icon /> Очистить лиды CRM
                  </button>

                  {/* Отозвать подписку бота (если активна) */}
                  {hasActiveSub && onRevokeSubscription ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onRevokeSubscription(bot);
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)] disabled:opacity-60"
                    >
                      <ShieldAlert size={14} /> Отозвать подписку бота
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Trash2Icon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}

function PaymentsSection({ payments, loading }: { payments: AdminSaasPayment[]; loading: boolean }) {
  return <Section title="Платежи BotFlow" description="История оплаты подписок на ботов. Статус нельзя изменить вручную — источником истины остаётся провайдер.">{loading ? <RowsSkeleton count={5} /> : payments.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]"><tr><th className="pb-3">Пользователь</th><th className="pb-3">Продукт</th><th className="pb-3">Сумма</th><th className="pb-3">Статус</th><th className="pb-3">Дата</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{payment.user_telegram_id}</td><td className="py-4 text-[var(--color-foreground)]">{productName[payment.product]}</td><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(payment.amount, payment.currency)}</td><td className="py-4"><StatusBadge tone={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status === "succeeded" ? "Оплачен" : payment.status === "failed" ? "Ошибка" : "Ожидает"}</StatusBadge></td><td className="py-4 text-[var(--color-foreground-secondary)]">{formatDate(payment.paid_at ?? payment.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<CreditCard size={21} />} title="Платежей пока нет" description="После создания первого счёта здесь появится реальная история SaaS-платежей." />}</Section>;
}

function OperationsSection({ operations, loading, onRetryOperation, retryingOperationId }: { operations: AdminOperation[]; loading: boolean; onRetryOperation: (operation: AdminOperation) => void; retryingOperationId: string | null }) {
  return <Section title="Операции" description="Оплата уже подтверждена, но выдача доступа или уведомление владельца требует внимания.">{loading ? <RowsSkeleton count={4} /> : operations.length ? <div className="divide-y divide-[var(--color-border)]">{operations.map((operation) => <OperationRow key={operation.payment_id} operation={operation} expanded onRetry={onRetryOperation} busy={retryingOperationId === operation.payment_id} />)}</div> : <EmptyState icon={<CheckCircle2 size={21} />} title="Ничего не требует действий" description="Все подтверждённые платежи обработаны или ожидают штатной очереди." />}</Section>;
}

function AccessLinksSection({ links, loading, onChanged }: { links: AccessLink[]; loading: boolean; onChanged: () => void }) {
  const safeLinks = Array.isArray(links) ? links : [];
  const { setToastMessage, setToastType } = useAppState();
  const { showConfirm } = useAlert();
  const [category, setCategory] = useState<"vip" | "free_bots">("vip");
  const [vipPreset, setVipPreset] = useState<"30" | "90" | "180" | "365" | "permanent" | "custom">("30");
  const [customDays, setCustomDays] = useState("30");
  const [freeBotsCount, setFreeBotsCount] = useState("1");
  const [freeBotsDuration, setFreeBotsDuration] = useState<"permanent" | "30" | "90" | "180" | "365" | "custom">("permanent");
  const [customFreeBotsDays, setCustomFreeBotsDays] = useState("30");
  const [people, setPeople] = useState("1");
  const [linkDays, setLinkDays] = useState("7");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [lastLink, setLastLink] = useState<AccessLink | null>(null);

  // Основной бот платформы: username можно переопределить через VITE_MAIN_BOT_USERNAME.
  const botUsername = import.meta.env.VITE_MAIN_BOT_USERNAME ?? "BotFlowru_bot";
  const linkUrl = (token: string) => `https://t.me/${botUsername}?start=gl_${token}`;

  const effectiveDays = useMemo(() => {
    if (vipPreset === "permanent") return undefined;
    if (vipPreset === "custom") return Math.max(1, Number(customDays) || 30);
    return Number(vipPreset) || 30;
  }, [vipPreset, customDays]);

  const effectiveFreeBotsDays = useMemo(() => {
    if (freeBotsDuration === "permanent") return undefined;
    if (freeBotsDuration === "custom") return Math.max(1, Number(customFreeBotsDays) || 30);
    return Number(freeBotsDuration) || 30;
  }, [freeBotsDuration, customFreeBotsDays]);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const validDays = Number(linkDays);
      const isVip = category === "vip";
      const isPermanent = isVip && vipPreset === "permanent";
      const isFreeBotsPermanent = freeBotsDuration === "permanent";
      const body: Parameters<typeof apiService.createAccessLink>[0] = {
        kind: isVip ? "vip" : "free_bots",
        note,
        maxActivations: Math.max(1, Number(people) || 1),
        ...(validDays > 0
          ? { validUntil: new Date(Date.now() + validDays * 86_400_000).toISOString() }
          : {}),
        ...(isVip ? { isPermanent, days: isPermanent ? undefined : effectiveDays } : {}),
        ...(!isVip
          ? {
              freeBotsCount: Math.max(1, Number(freeBotsCount) || 1),
              isPermanent: isFreeBotsPermanent,
              days: isFreeBotsPermanent ? undefined : effectiveFreeBotsDays,
            }
          : {}),
      };
      const created = await apiService.createAccessLink(body);
      setLastLink(created);
      setNote("");
      setToastType("success");
      setToastMessage("Ссылка создана");
      onChanged();
    } catch (requestError) {
      setToastType("error");
      setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось создать ссылку.");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      setToastType("success");
      setToastMessage("Ссылка скопирована");
    } catch {
      setToastType("error");
      setToastMessage("Не удалось скопировать — скопируйте вручную: " + linkUrl(token));
    }
  };

  const deactivate = (link: AccessLink) => {
    showConfirm({
      title: "Закрыть ссылку?",
      message: "Она больше не будет активироваться. Уже выданный доступ сохранится.",
      type: "warning",
      confirmText: "Закрыть ссылку",
      cancelText: "Отмена",
      onConfirm: () => {
        void apiService
          .deactivateAccessLink(link.id)
          .then(() => {
            setToastType("success");
            setToastMessage("Ссылка закрыта");
            onChanged();
          })
          .catch((error) => {
            setToastType("error");
            setToastMessage(error instanceof Error ? error.message : "Не удалось закрыть ссылку.");
          });
      },
    });
  };

  const kindLabel = (link: AccessLink) => {
    if (link.kind === "vip") {
      return link.isPermanent ? "VIP навсегда (все боты)" : `VIP на ${link.days || 30} дн.`;
    }
    if (link.kind === "free_bots") {
      const count = link.freeBotsCount || 1;
      const word = count === 1 ? "бот" : count < 5 ? "бота" : "ботов";
      if (link.isPermanent) {
        return `${count} ${word} навсегда (слоты)`;
      }
      return `${count} ${word} на ${link.days || 30} дн.`;
    }
    if (link.kind === "one_bot") {
      return "1 бот навсегда бесплатно";
    }
    if (link.kind === "permanent") {
      return "Бессрочный VIP-доступ (все боты)";
    }
    return link.days ? `VIP на ${link.days} дн.` : "VIP-подписка до даты";
  };

  return (
    <div className="space-y-6">
      <Section title="Создать спец-ссылку" description="Человек открывает ссылку, жмёт START у главного бота BotFlow — и получает доступ. Ссылку можно выдать нескольким людям и ограничить срок её жизни.">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--color-foreground-secondary)]">Категория доступа</p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Категория доступа">
              <button
                type="button"
                role="radio"
                aria-checked={category === "vip"}
                onClick={() => setCategory("vip")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  category === "vip"
                    ? "border-amber-500 bg-amber-500/10 shadow-sm"
                    : "border-[var(--color-border)] hover:border-amber-500/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Crown size={18} className="text-amber-500" />
                  <span className="text-sm font-bold text-[var(--color-foreground)]">VIP-доступ к аккаунту</span>
                </div>
                <span className="mt-1 block text-xs text-[var(--color-foreground-secondary)]">
                  Все боты пользователя бесплатны, пока действует VIP (на срок или бессрочно).
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === "free_bots"}
                onClick={() => setCategory("free_bots")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  category === "free_bots"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-sm"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-[var(--color-primary)]" />
                  <span className="text-sm font-bold text-[var(--color-foreground)]">Бесплатные боты (слоты)</span>
                </div>
                <span className="mt-1 block text-xs text-[var(--color-foreground-secondary)]">
                  Начисляет конкретное количество слотов навсегда. 1 слот = 1 бот бесплатно без подписки.
                </span>
              </button>
            </div>
          </div>

          {category === "vip" ? (
            <div>
              <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Срок VIP-доступа</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ["30", "1 мес (30 дн.)"],
                  ["90", "3 мес (90 дн.)"],
                  ["180", "6 мес (180 дн.)"],
                  ["365", "1 год (365 дн.)"],
                  ["permanent", "Бессрочно навсегда"],
                  ["custom", "Своё число дней"],
                ].map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVipPreset(preset as typeof vipPreset)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                      vipPreset === preset
                        ? preset === "permanent"
                          ? "bg-amber-500 text-black shadow-sm"
                          : "bg-[var(--color-primary)] text-white shadow-sm"
                        : "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {vipPreset === "custom" && (
                <div className="mt-2 max-w-xs">
                  <label className="block text-xs text-[var(--color-foreground-secondary)]">
                    Число дней VIP:
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ""))}
                      className="mt-1 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Количество бесплатных ботов (слотов)</span>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {["1", "2", "3", "5", "10"].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setFreeBotsCount(cnt)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                        freeBotsCount === cnt
                          ? "bg-[var(--color-primary)] text-white shadow-sm"
                          : "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                      }`}
                    >
                      {cnt} {cnt === "1" ? "бот" : Number(cnt) < 5 ? "бота" : "ботов"}
                    </button>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-foreground-secondary)]">или:</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={freeBotsCount}
                      onChange={(e) => setFreeBotsCount(e.target.value.replace(/\D/g, ""))}
                      className="h-10 w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-center text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Срок бесплатного доступа</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ["permanent", "Бессрочно навсегда"],
                    ["30", "1 мес (30 дн.)"],
                    ["90", "3 мес (90 дн.)"],
                    ["180", "6 мес (180 дн.)"],
                    ["365", "1 год (365 дн.)"],
                    ["custom", "Своё число дней"],
                  ].map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFreeBotsDuration(preset as typeof freeBotsDuration)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                        freeBotsDuration === preset
                          ? preset === "permanent"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-[var(--color-primary)] text-white shadow-sm"
                          : "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {freeBotsDuration === "custom" && (
                  <div className="mt-2 max-w-xs">
                    <label className="block text-xs text-[var(--color-foreground-secondary)]">
                      Число дней доступа:
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={customFreeBotsDays}
                        onChange={(e) => setCustomFreeBotsDays(e.target.value.replace(/\D/g, ""))}
                        className="mt-1 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Сколько людей (активаций)</span>
              <input type="number" min={1} max={10000} value={people}
                onChange={(event) => setPeople(event.target.value.replace(/\D/g, ""))}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Ссылка живёт, дней</span>
              <input type="number" min={0} max={365} value={linkDays}
                onChange={(event) => setLinkDays(event.target.value.replace(/\D/g, ""))}
                placeholder="0 — без срока"
                className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="block text-xs font-semibold text-[var(--color-foreground-secondary)]">Заметка</span>
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} maxLength={255}
                placeholder="Кому и зачем"
                className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </label>
          </div>

          <button type="button" onClick={() => void create()} disabled={creating}
            className="h-11 w-full rounded-xl bg-[var(--color-primary)] px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto">
            {creating
              ? "Создаём…"
              : category === "vip"
                ? `Создать VIP-ссылку (${vipPreset === "permanent" ? "Бессрочно" : `${effectiveDays} дн.`})`
                : `Создать ссылку (${freeBotsCount} ${freeBotsCount === "1" ? "бот" : Number(freeBotsCount) < 5 ? "бота" : "ботов"} · ${freeBotsDuration === "permanent" ? "Бессрочно" : `${effectiveFreeBotsDays} дн.`})`}
          </button>
        </div>

        {lastLink ? (
          <div className="mt-4 rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success-soft)] p-4">
            <p className="text-sm font-bold text-[var(--color-foreground)]">
              {kindLabel(lastLink)} · до {lastLink.maxActivations} чел.
            </p>
            <code className="mt-2 block break-all rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs">
              {linkUrl(lastLink.token)}
            </code>
            <button type="button" onClick={() => void copyLink(lastLink.token)}
              className="mt-2 h-9 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-bold text-white hover:opacity-90">Копировать</button>
          </div>
        ) : null}
      </Section>

      <Section title="Созданные ссылки" description="Счётчик показывает, сколько людей уже активировали ссылку. Выданный доступ не отзывается закрытием ссылки.">
        {loading ? <RowsSkeleton count={4} /> : safeLinks.length ? (
          <div className="divide-y divide-[var(--color-border)]">
            {safeLinks.map((link) => {
              const exhausted = link.activationsCount >= link.maxActivations;
              const expired = Boolean(link.validUntil && new Date(link.validUntil) <= new Date());
              return (
                <div key={link.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={link.isActive && !expired ? "success" : exhausted ? "neutral" : "warning"}>
                        {link.isActive && !expired ? "Активна" : expired ? "Истекла" : exhausted ? "Исчерпана" : "Закрыта"}
                      </StatusBadge>
                      <span className="text-sm font-semibold text-[var(--color-foreground)]">{kindLabel(link)}</span>
                      <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--color-foreground-secondary)]">
                        {link.activationsCount} / {link.maxActivations}
                      </span>
                      {link.note ? <span className="text-xs text-[var(--color-foreground-secondary)]">· {link.note}</span> : null}
                    </div>
                    <p className="mt-1 break-all text-xs text-[var(--color-foreground-secondary)]">
                      gl_{link.token}
                      {link.validUntil ? ` · ссылка до ${formatDate(link.validUntil)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => void copyLink(link.token)}
                      className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]">Копировать</button>
                    {link.isActive ? (
                      <button type="button" onClick={() => deactivate(link)}
                        className="h-9 rounded-lg border border-[var(--color-danger)] px-3 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">Закрыть</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<CheckCircle2 size={21} />} title="Ссылок пока нет" description="Создайте первую — и отправьте её человеку в личку или в рассылке." />
        )}
      </Section>
    </div>
  );
}

function SystemSection({ entries, systemStatus, loading }: { entries: AdminAuditEntry[]; systemStatus: AdminSystemStatus | null; loading: boolean }) {
  const jobLabel: Record<string, string> = { "bot-reminders": "Дожимы", "pro-renewals": "Продление подписок", "client-payment-fulfillment": "Выдача после оплаты" };
  return <div className="grid gap-6 2xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.4fr)]"><Section title="Состояние системы" description="Состояние планировщика относится к текущему процессу приложения и не заменяет внешний мониторинг.">{loading ? <RowsSkeleton count={3} /> : systemStatus ? <div className="space-y-3"><SystemRow label="Планировщик" value={systemStatus.running ? "Запущен" : "Не запущен"} tone={systemStatus.running ? "success" : "danger"} />{systemStatus.jobs.map((job) => <SystemRow key={job.id} label={jobLabel[job.id] ?? job.id} value={job.last_error ? `Ошибка: ${job.last_error}` : job.last_finished_at ? `Последний запуск: ${formatDate(job.last_finished_at)}` : job.next_run_at ? `Первый запуск: ${formatDate(job.next_run_at)}` : "Нет данных о запуске"} tone={job.last_error ? "danger" : "neutral"} />)}</div> : <EmptyState icon={<AlertTriangle size={21} />} title="Статус процесса недоступен" description="Нажмите «Обновить», чтобы повторить запрос." />}</Section><Section title="Журнал действий" description="Изменения доступа, статусов и повторные операции записываются здесь.">{loading ? <RowsSkeleton count={4} /> : entries.length ? <ol className="max-h-[420px] divide-y divide-[var(--color-border)] overflow-y-auto pr-2 md:max-h-[560px]">{entries.map((entry) => <li key={entry.id} className="py-4 first:pt-0"><p className="font-semibold text-[var(--color-foreground)]">{auditActionLabel[entry.action] ?? entry.action}</p>{auditSummary(entry) ? <p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{auditSummary(entry)}</p> : null}<p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">Администратор {entry.actor_telegram_id} · {entry.target_type}{entry.target_id ? ` №${entry.target_id}` : ""} · {formatDate(entry.created_at)}</p></li>)}</ol> : <EmptyState icon={<ClipboardList size={21} />} title="Журнал пока пуст" description="Он начнёт заполняться, когда будут добавлены административные действия." />}</Section></div>;
}

function OperationRow({ operation, expanded = false, onRetry, busy = false }: { operation: AdminOperation; expanded?: boolean; onRetry: (operation: AdminOperation) => void; busy?: boolean }) {
  const issue = operation.fulfillment_status !== "succeeded" ? "Выдача доступа" : "Уведомление владельца";
  const error = operation.fulfillment_status !== "succeeded" ? operation.fulfillment_error : operation.owner_notification_error;
  return <article className="flex flex-col gap-3 py-4 first:pt-0 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="font-semibold text-[var(--color-foreground)]">{operation.bot_name}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{issue} · {operation.provider} · {formatAmount(operation.amount, operation.currency)}</p>{expanded && error ? <p className="mt-2 break-words text-xs leading-5 text-[var(--color-danger)]">{error}</p> : null}</div><div className="flex items-center gap-2"><StatusBadge tone="warning">Требует проверки</StatusBadge><button type="button" onClick={() => onRetry(operation)} disabled={busy} className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-wait disabled:opacity-60">{busy ? "Повторяем…" : "Повторить"}</button></div></article>;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block flex-1">
      <span className="sr-only">Поиск</span>
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="search"
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] py-0 pl-10 pr-3 text-sm text-[var(--color-foreground)] outline-none transition-all placeholder:text-[var(--color-foreground-tertiary)] focus:border-[var(--color-primary)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
      />
    </label>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6 shadow-[var(--shadow-card)]">
      <header className="mb-5">
        <h2 className="text-base font-bold tracking-[-0.01em] text-[var(--color-foreground)]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-foreground-secondary)]">{description}</p>
      </header>
      {children}
    </section>
  );
}

function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  const styles = { success: "bg-[var(--color-success-soft)] text-[var(--color-success)]", warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]", danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]", neutral: "bg-[var(--color-surface-2)] text-[var(--color-foreground-secondary)]" };
  return <span className={`inline-flex w-fit whitespace-nowrap items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

function SystemRow({ label, value, tone }: { label: string; value: string; tone: "success" | "neutral" | "danger" }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">{label}</p>
        <p className="mt-1 break-words text-xs leading-5 text-[var(--color-foreground-secondary)]">{value}</p>
      </div>
      <StatusBadge tone={tone}>{tone === "success" ? "Активен" : tone === "danger" ? "Ошибка" : "Ожидает"}</StatusBadge>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center"><div className="mb-3 text-[var(--color-foreground-tertiary)]">{icon}</div><h3 className="text-sm font-bold text-[var(--color-foreground)]">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--color-foreground-secondary)]">{description}</p></div>; }

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-5"><h2 className="font-bold text-[var(--color-foreground)]">Не удалось загрузить данные</h2><p className="mt-1 text-sm leading-6 text-[var(--color-foreground-secondary)]">{message}</p><button type="button" onClick={() => void onRetry()} className="mt-4 h-10 rounded-xl bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[var(--color-background)]">Повторить</button></div>; }

function RowsSkeleton({ count }: { count: number }) { return <div className="space-y-3" aria-busy="true" aria-label="Загрузка данных">{Array.from({ length: count }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />)}</div>; }
