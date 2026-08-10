import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Users,
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";
import { useAlert } from "../AlertProvider";
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
} from "../../services/api";

type AdminSection = "overview" | "users" | "bots" | "payments" | "operations" | "system";
type LoadState = "idle" | "loading" | "ready" | "error";
type AdminUserAction = "access" | "licenses" | "pro" | "auto-renew";

const sections: Array<{ id: AdminSection; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Пользователи" },
  { id: "bots", label: "Боты" },
  { id: "payments", label: "Платежи" },
  { id: "operations", label: "Операции" },
  { id: "system", label: "Система" },
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
  license: "Лицензия",
  pro_initial: "PRO",
  pro_renewal: "Продление PRO",
};

export function AdminStats() {
  const { setToastMessage, setToastType } = useAppState();
  const { showConfirm } = useAlert();
  const [section, setSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [payments, setPayments] = useState<AdminSaasPayment[]>([]);
  const [operations, setOperations] = useState<AdminOperation[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usersQuery, setUsersQuery] = useState("");
  const [botsQuery, setBotsQuery] = useState("");
  const [botsStatus, setBotsStatus] = useState<AdminBot["status"] | "all">("all");
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [botActionId, setBotActionId] = useState<number | null>(null);
  const [operationActionId, setOperationActionId] = useState<string | null>(null);

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
      if (section === "bots") {
        const nextBots = await apiService.getAdminBots({
          query: botsQuery,
          status: botsStatus === "all" ? undefined : botsStatus,
          limit: 50,
        });
        setBots(nextBots.bots);
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
      setState("ready");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось загрузить данные админки.";
      setError(message);
      setState("error");
      setToastType("error");
      setToastMessage(message);
    }
  }, [botsQuery, botsStatus, section, setToastMessage, setToastType, usersQuery]);

  useEffect(() => {
    const delay = section === "users" || section === "bots" ? 250 : 0;
    const timer = window.setTimeout(() => {
      void refreshSection();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [refreshSection, section]);

  const activeSection = useMemo(
    () => sections.find((item) => item.id === section)?.label ?? "Админ",
    [section],
  );

  const applyUserAction = useCallback(async (action: AdminUserAction, data: { stopActiveBots?: boolean; direction?: "grant" | "revoke"; quantity?: number; days?: number }) => {
    if (!actionUser) return;
    setActionBusy(true);
    try {
      if (action === "access") {
        const result = await apiService.setAdminUserAccess(actionUser.id, {
          disabled: !actionUser.is_disabled,
          stopActiveBots: Boolean(data.stopActiveBots),
        });
        setToastType("success");
        setToastMessage(result.is_disabled ? `Доступ ограничен${result.stopped_active_bots ? `, остановлено ботов: ${result.stopped_active_bots}` : ""}.` : "Доступ к Mini App восстановлен.");
      }
      if (action === "licenses" && data.direction && data.quantity) {
        const result = await apiService.changeAdminLifetimeLicenses(actionUser.id, {
          direction: data.direction,
          quantity: data.quantity,
        });
        setToastType("success");
        setToastMessage(`Лицензии обновлены: всего ${result.lifetime_slots}, закреплено за ботами ${result.used_lifetime_licenses}.`);
      }
      if (action === "pro" && data.days) {
        const result = await apiService.extendAdminUserPro(actionUser.id, data.days);
        setToastType("success");
        setToastMessage(`PRO продлён до ${formatDate(result.subscription_ends_at)}.`);
      }
      if (action === "auto-renew") {
        await apiService.disableAdminUserAutoRenew(actionUser.id);
        setToastType("success");
        setToastMessage("Автопродление отключено. Уже оплаченный срок PRO сохранён.");
      }
      setActionUser(null);
      await refreshSection();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Не удалось применить изменение.";
      setToastType("error");
      setToastMessage(message);
    } finally {
      setActionBusy(false);
    }
  }, [actionUser, refreshSection, setToastMessage, setToastType]);

  const executeBotAction = useCallback(async (bot: AdminBot, action: AdminBotAction) => {
    setBotActionId(bot.id);
    try {
      const result = await apiService.runAdminBotAction(bot.id, action);
      setBots((current) => current.map((item) => item.id === bot.id ? { ...item, status: result.botStatus } : item));
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
      setToastMessage(result.isReady ? "Воронка готова к запуску." : `Бот пока нельзя запустить: ${result.reasons.join(" ")}`);
    } catch (requestError) {
      setToastType("error");
      setToastMessage(requestError instanceof Error ? requestError.message : "Не удалось проверить готовность.");
    } finally {
      setBotActionId(null);
    }
  }, [setToastMessage, setToastType]);

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

  return (
    <section className="w-full pb-16" aria-labelledby="admin-title">
      <header className="mb-6 border-b border-[var(--color-border)] pb-5 md:mb-8 md:pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--color-foreground-tertiary)]">
              <ShieldCheck size={15} className="text-[var(--color-primary)]" aria-hidden="true" />
              Внутренняя зона управления
            </div>
            <h1 id="admin-title" className="text-2xl font-bold tracking-[-0.03em] text-[var(--color-foreground)] md:text-3xl">
              {activeSection}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-foreground-secondary)]">
              Реальные данные платформы. Финансовые статусы подтверждаются только платёжными провайдерами.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSection()}
            disabled={state === "loading"}
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-wait disabled:opacity-60 xl:self-auto"
          >
            <RefreshCw size={16} className={state === "loading" ? "animate-spin" : ""} aria-hidden="true" />
            Обновить
          </button>
        </div>

        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]" aria-label="Разделы администрирования">
          {sections.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
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
      {state !== "error" && section === "users" ? <UsersSection users={users} query={usersQuery} onQueryChange={setUsersQuery} loading={state === "loading"} onManage={setActionUser} /> : null}
      {state !== "error" && section === "bots" ? <BotsSection bots={bots} query={botsQuery} onQueryChange={setBotsQuery} status={botsStatus} onStatusChange={setBotsStatus} loading={state === "loading"} busyBotId={botActionId} onAction={requestBotAction} onCheckReadiness={checkBotReadiness} /> : null}
      {state !== "error" && section === "payments" ? <PaymentsSection payments={payments} loading={state === "loading"} /> : null}
      {state !== "error" && section === "operations" ? <OperationsSection operations={operations} loading={state === "loading"} onRetryOperation={retryOperation} retryingOperationId={operationActionId} /> : null}
      {state !== "error" && section === "system" ? <SystemSection entries={auditEntries} systemStatus={systemStatus} loading={state === "loading"} /> : null}
      {actionUser ? <UserActionDialog key={actionUser.id} user={actionUser} busy={actionBusy} onClose={() => setActionUser(null)} onApply={applyUserAction} /> : null}
    </section>
  );
}

function Overview({ overview, operations, loading, onNavigate, onRetryOperation, retryingOperationId }: { overview: AdminOverview | null; operations: AdminOperation[]; loading: boolean; onNavigate: (section: AdminSection) => void; onRetryOperation: (operation: AdminOperation) => void; retryingOperationId: string | null }) {
  const metrics = [
    { label: "Владельцы ботов", value: overview?.users_total, icon: Users, note: "Зарегистрированы в BotFlow" },
    { label: "Активные боты", value: overview ? `${overview.bots_active} / ${overview.bots_total}` : null, icon: Bot, note: "Работают сейчас" },
    { label: "SaaS-выручка", value: overview ? formatAmount(overview.saas_revenue) : null, icon: CreditCard, note: "Подтверждённые платежи" },
    { label: "Требуют внимания", value: overview?.operations_requiring_attention, icon: AlertTriangle, note: "Выдача доступа или уведомление" },
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, note }) => (
          <article key={label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <Icon size={18} className="mb-7 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="text-2xl font-bold tracking-[-0.03em] tabular-nums text-[var(--color-foreground)]">{loading || value === null ? "—" : value}</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{label}</h2>
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

function UsersSection({ users, query, onQueryChange, loading, onManage }: { users: AdminUser[]; query: string; onQueryChange: (value: string) => void; loading: boolean; onManage: (user: AdminUser) => void }) {
  return <Section title="Пользователи" description="Поиск владельцев по Telegram ID. Имена не сохраняются в профиле владельца, поэтому интерфейс не подменяет их вымышленными данными."><SearchInput value={query} onChange={onQueryChange} placeholder="Telegram ID" />{loading ? <RowsSkeleton count={5} /> : users.length ? <><div className="mt-5 space-y-3 md:hidden">{users.map((user) => <UserCard key={user.id} user={user} onManage={onManage} />)}</div><div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]"><tr><th className="pb-3">Пользователь</th><th className="pb-3">Доступ</th><th className="pb-3">Боты</th><th className="pb-3">PRO</th><th className="pb-3">Зарегистрирован</th><th className="pb-3" aria-label="Действия" /></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-4"><p className="font-semibold tabular-nums text-[var(--color-foreground)]">{user.telegram_id}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">ID в BotFlow: {user.id}</p></td><td className="py-4"><StatusBadge tone={user.is_disabled ? "danger" : "success"}>{user.is_disabled ? "Ограничен" : "Активен"}</StatusBadge></td><td className="py-4"><p className="font-semibold tabular-nums text-[var(--color-foreground)]">{user.bots_count}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{user.lifetime_slots} лиц.</p></td><td className="py-4"><StatusBadge tone={user.subscription_ends_at ? "success" : "neutral"}>{user.subscription_ends_at ? `до ${formatDate(user.subscription_ends_at)}` : "Нет"}</StatusBadge></td><td className="py-4 text-[var(--color-foreground-secondary)]">{formatDate(user.created_at)}</td><td className="py-4 text-right"><button type="button" onClick={() => onManage(user)} className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]">Управлять</button></td></tr>)}</tbody></table></div></> : <EmptyState icon={<Users size={21} />} title="Пользователи не найдены" description="Измените запрос или дождитесь первой регистрации в Mini App." />}</Section>;
}

function UserCard({ user, onManage }: { user: AdminUser; onManage: (user: AdminUser) => void }) {
  return <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold tabular-nums text-[var(--color-foreground)]">{user.telegram_id}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">ID в BotFlow: {user.id}</p></div><StatusBadge tone={user.is_disabled ? "danger" : "success"}>{user.is_disabled ? "Ограничен" : "Активен"}</StatusBadge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-[var(--color-foreground-secondary)]">Боты</dt><dd className="mt-1 font-semibold tabular-nums text-[var(--color-foreground)]">{user.bots_count}</dd></div><div><dt className="text-xs text-[var(--color-foreground-secondary)]">Лицензии</dt><dd className="mt-1 font-semibold tabular-nums text-[var(--color-foreground)]">{user.lifetime_slots}</dd></div><div className="col-span-2"><dt className="text-xs text-[var(--color-foreground-secondary)]">PRO</dt><dd className="mt-1 text-sm text-[var(--color-foreground)]">{user.subscription_ends_at ? `до ${formatDate(user.subscription_ends_at)}` : "Не подключён"}</dd></div></dl><button type="button" onClick={() => onManage(user)} className="mt-4 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface)]/70">Управлять доступом</button></article>;
}

function UserActionDialog({ user, busy, onClose, onApply }: { user: AdminUser; busy: boolean; onClose: () => void; onApply: (action: AdminUserAction, data: { stopActiveBots?: boolean; direction?: "grant" | "revoke"; quantity?: number; days?: number }) => Promise<void> }) {
  const [action, setAction] = useState<AdminUserAction>("access");
  const [stopActiveBots, setStopActiveBots] = useState(false);
  const [licenseDirection, setLicenseDirection] = useState<"grant" | "revoke">("grant");
  const [quantity, setQuantity] = useState(1);
  const [days, setDays] = useState(30);
  const isRestricting = !user.is_disabled;
  const submit = () => void onApply(action, { stopActiveBots, direction: licenseDirection, quantity, days });
  const submitLabel = action === "access" ? (isRestricting ? "Ограничить доступ" : "Восстановить доступ") : action === "licenses" ? (licenseDirection === "grant" ? "Выдать лицензии" : "Отозвать лицензии") : action === "pro" ? "Продлить PRO" : "Отключить автопродление";
  return <div className="fixed inset-0 z-[150] flex items-end bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="admin-user-action-title" className="w-full max-w-lg rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl sm:rounded-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[var(--color-foreground-secondary)]">Пользователь {user.telegram_id}</p><h2 id="admin-user-action-title" className="mt-1 text-lg font-bold text-[var(--color-foreground)]">Управление доступом</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть" className="rounded-lg p-2 text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"><X size={18} /></button></div><label className="mt-6 block text-xs font-semibold text-[var(--color-foreground-secondary)]" htmlFor="admin-user-action">Действие</label><select id="admin-user-action" value={action} onChange={(event) => setAction(event.target.value as AdminUserAction)} disabled={busy} className="mt-2 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"><option value="access">{isRestricting ? "Ограничить доступ" : "Восстановить доступ"}</option><option value="licenses">Выдать или отозвать лицензии</option><option value="pro">Продлить PRO</option><option value="auto-renew">Отключить автопродление PRO</option></select>{action === "access" ? <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"><p className="text-sm font-semibold text-[var(--color-foreground)]">{isRestricting ? "Вход в Mini App будет запрещён." : "Пользователь снова сможет войти в Mini App."}</p>{isRestricting ? <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-5 text-[var(--color-foreground-secondary)]"><input type="checkbox" checked={stopActiveBots} onChange={(event) => setStopActiveBots(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" /><span><strong className="text-[var(--color-foreground)]">Также остановить все активные боты.</strong><br />Боты станут черновиками и не запустятся автоматически после восстановления доступа.</span></label> : null}</div> : null}{action === "licenses" ? <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_112px]"><select value={licenseDirection} onChange={(event) => setLicenseDirection(event.target.value as "grant" | "revoke")} disabled={busy} className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)]"><option value="grant">Выдать лицензии</option><option value="revoke">Отозвать свободные лицензии</option></select><label><span className="sr-only">Количество</span><input value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} type="number" min="1" max="100" disabled={busy} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)]" /></label><p className="sm:col-span-2 text-xs leading-5 text-[var(--color-foreground-secondary)]">Отозвать можно только лицензии, не закреплённые за ботами.</p></div> : null}{action === "pro" ? <div className="mt-5"><label htmlFor="admin-pro-days" className="text-sm font-semibold text-[var(--color-foreground)]">Продлить на дней</label><input id="admin-pro-days" value={days} onChange={(event) => setDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} type="number" min="1" max="365" disabled={busy} className="mt-2 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)]" /><p className="mt-2 text-xs leading-5 text-[var(--color-foreground-secondary)]">Срок добавится к текущему оплаченному периоду. Автопродление не включится.</p></div> : null}{action === "auto-renew" ? <p className="mt-5 rounded-xl bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-foreground)]">Будущие автоматические списания будут отменены. Уже оплаченный срок PRO останется без изменений.</p> : null}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50">Отмена</button><button type="button" onClick={submit} disabled={busy} className={`h-11 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60 ${action === "access" && isRestricting || action === "licenses" && licenseDirection === "revoke" ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]"}`}>{busy ? "Сохраняем…" : submitLabel}</button></div></div></div>;
}

function BotsSection({ bots, query, onQueryChange, status, onStatusChange, loading, busyBotId, onAction, onCheckReadiness }: { bots: AdminBot[]; query: string; onQueryChange: (value: string) => void; status: AdminBot["status"] | "all"; onStatusChange: (value: AdminBot["status"] | "all") => void; loading: boolean; busyBotId: number | null; onAction: (bot: AdminBot, action: AdminBotAction) => void; onCheckReadiness: (bot: AdminBot) => void }) {
  return <Section title="Боты" description="Операционное состояние без раскрытия Telegram-токенов и ключей платёжных систем."><div className="flex flex-col gap-3 md:flex-row"><SearchInput value={query} onChange={onQueryChange} placeholder="Название, @username или Telegram ID" /><label className="sr-only" htmlFor="admin-bot-status">Статус бота</label><select id="admin-bot-status" value={status} onChange={(event) => onStatusChange(event.target.value as AdminBot["status"] | "all")} className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"><option value="all">Все статусы</option><option value="active">Активные</option><option value="draft">Черновики</option><option value="archived">Архив</option></select></div>{loading ? <RowsSkeleton count={5} /> : bots.length ? <div className="mt-5 space-y-3">{bots.map((bot) => <AdminBotRow key={bot.id} bot={bot} busy={busyBotId === bot.id} onAction={onAction} onCheckReadiness={onCheckReadiness} />)}</div> : <EmptyState icon={<Bot size={21} />} title="Боты не найдены" description="Измените фильтр или дождитесь создания первого бота." />}</Section>;
}

function AdminBotRow({ bot, busy, onAction, onCheckReadiness }: { bot: AdminBot; busy: boolean; onAction: (bot: AdminBot, action: AdminBotAction) => void; onCheckReadiness: (bot: AdminBot) => void }) {
  const isActive = bot.status === "active";
  return <article className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-[var(--color-foreground)]">{bot.display_name}</h2><StatusBadge tone={isActive ? "success" : bot.status === "archived" ? "danger" : "neutral"}>{isActive ? "Работает" : bot.status === "archived" ? "Архив" : "Черновик"}</StatusBadge></div><p className="mt-1 break-words text-xs text-[var(--color-foreground-secondary)]">{bot.username ? `@${bot.username.replace(/^@/, "")}` : "Username не задан"} · владелец {bot.owner_telegram_id} · {bot.users_count} лидов</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{bot.payment_provider ? `Касса: ${bot.payment_provider}` : "Касса не выбрана"} · Воронка: {bot.funnel_complete ? "готова" : "не готова"}</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><button type="button" onClick={() => onCheckReadiness(bot)} disabled={busy} className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)] disabled:opacity-60">Проверить</button><button type="button" onClick={() => onAction(bot, "reinstall_webhook")} disabled={busy} className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)] disabled:opacity-60">Webhook</button><button type="button" onClick={() => onAction(bot, isActive ? "stop" : "start")} disabled={busy || bot.status === "archived"} className={`col-span-2 h-9 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60 sm:col-span-1 ${isActive ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]"}`}>{busy ? "Выполняем…" : isActive ? "Остановить" : "Запустить"}</button></div></div></article>;
}

function PaymentsSection({ payments, loading }: { payments: AdminSaasPayment[]; loading: boolean }) {
  return <Section title="Платежи BotFlow" description="История оплаты лицензий и PRO. Статус нельзя изменить вручную — источником истины остаётся провайдер.">{loading ? <RowsSkeleton count={5} /> : payments.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]"><tr><th className="pb-3">Пользователь</th><th className="pb-3">Продукт</th><th className="pb-3">Сумма</th><th className="pb-3">Статус</th><th className="pb-3">Дата</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{payment.user_telegram_id}</td><td className="py-4 text-[var(--color-foreground)]">{productName[payment.product]}</td><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(payment.amount, payment.currency)}</td><td className="py-4"><StatusBadge tone={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status === "succeeded" ? "Оплачен" : payment.status === "failed" ? "Ошибка" : "Ожидает"}</StatusBadge></td><td className="py-4 text-[var(--color-foreground-secondary)]">{formatDate(payment.paid_at ?? payment.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<CreditCard size={21} />} title="Платежей пока нет" description="После создания первого счёта здесь появится реальная история SaaS-платежей." />}</Section>;
}

function OperationsSection({ operations, loading, onRetryOperation, retryingOperationId }: { operations: AdminOperation[]; loading: boolean; onRetryOperation: (operation: AdminOperation) => void; retryingOperationId: string | null }) {
  return <Section title="Операции" description="Оплата уже подтверждена, но выдача доступа или уведомление владельца требует внимания.">{loading ? <RowsSkeleton count={4} /> : operations.length ? <div className="divide-y divide-[var(--color-border)]">{operations.map((operation) => <OperationRow key={operation.payment_id} operation={operation} expanded onRetry={onRetryOperation} busy={retryingOperationId === operation.payment_id} />)}</div> : <EmptyState icon={<CheckCircle2 size={21} />} title="Ничего не требует действий" description="Все подтверждённые платежи обработаны или ожидают штатной очереди." />}</Section>;
}

function SystemSection({ entries, systemStatus, loading }: { entries: AdminAuditEntry[]; systemStatus: AdminSystemStatus | null; loading: boolean }) {
  const jobLabel: Record<string, string> = { "bot-reminders": "Дожимы", "pro-renewals": "Продление PRO", "client-payment-fulfillment": "Выдача после оплаты" };
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><Section title="Контур системы" description="Состояние планировщика относится к текущему процессу приложения и не заменяет внешний мониторинг.">{loading ? <RowsSkeleton count={3} /> : systemStatus ? <div className="space-y-3"><SystemRow label="Планировщик" value={systemStatus.running ? "Запущен" : "Не запущен"} tone={systemStatus.running ? "success" : "danger"} />{systemStatus.jobs.map((job) => <SystemRow key={job.id} label={jobLabel[job.id] ?? job.id} value={job.last_error ? `Ошибка: ${job.last_error}` : job.last_finished_at ? `Последний запуск: ${formatDate(job.last_finished_at)}` : job.next_run_at ? `Первый запуск: ${formatDate(job.next_run_at)}` : "Нет данных о запуске"} tone={job.last_error ? "danger" : "neutral"} />)}</div> : <EmptyState icon={<AlertTriangle size={21} />} title="Статус процесса недоступен" description="Нажмите «Обновить», чтобы повторить запрос." />}</Section><Section title="Журнал действий" description="Изменения доступа, статусов и повторные операции записываются здесь.">{loading ? <RowsSkeleton count={4} /> : entries.length ? <ol className="divide-y divide-[var(--color-border)]">{entries.map((entry) => <li key={entry.id} className="py-4 first:pt-0"><p className="font-semibold text-[var(--color-foreground)]">{entry.action}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">Администратор {entry.actor_telegram_id} · {entry.target_type}{entry.target_id ? ` #${entry.target_id}` : ""} · {formatDate(entry.created_at)}</p></li>)}</ol> : <EmptyState icon={<ClipboardList size={21} />} title="Журнал пока пуст" description="Он начнёт заполняться, когда будут добавлены административные действия." />}</Section></div>;
}

function OperationRow({ operation, expanded = false, onRetry, busy = false }: { operation: AdminOperation; expanded?: boolean; onRetry: (operation: AdminOperation) => void; busy?: boolean }) {
  const issue = operation.fulfillment_status !== "succeeded" ? "Выдача доступа" : "Уведомление владельца";
  const error = operation.fulfillment_status !== "succeeded" ? operation.fulfillment_error : operation.owner_notification_error;
  return <article className="flex flex-col gap-3 py-4 first:pt-0 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="font-semibold text-[var(--color-foreground)]">{operation.bot_name}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{issue} · {operation.provider} · {formatAmount(operation.amount, operation.currency)}</p>{expanded && error ? <p className="mt-2 break-words text-xs leading-5 text-[var(--color-danger)]">{error}</p> : null}</div><div className="flex items-center gap-2"><StatusBadge tone="warning">Требует проверки</StatusBadge><button type="button" onClick={() => onRetry(operation)} disabled={busy} className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-wait disabled:opacity-60">{busy ? "Повторяем…" : "Повторить"}</button></div></article>;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="relative block flex-1"><span className="sr-only">Поиск</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" aria-hidden="true" /><input value={value} onChange={(event) => onChange(event.target.value)} type="search" placeholder={placeholder} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] py-0 pl-10 pr-3 text-sm text-[var(--color-foreground)] outline-none transition-colors placeholder:text-[var(--color-foreground-tertiary)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]" /></label>;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6"><header className="mb-5"><h2 className="text-base font-bold tracking-[-0.01em] text-[var(--color-foreground)]">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-foreground-secondary)]">{description}</p></header>{children}</section>;
}

function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  const styles = { success: "bg-[var(--color-success-soft)] text-[var(--color-success)]", warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]", danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]", neutral: "bg-[var(--color-surface-2)] text-[var(--color-foreground-secondary)]" };
  return <span className={`inline-flex w-fit items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

function SystemRow({ label, value, tone }: { label: string; value: string; tone: "success" | "neutral" | "danger" }) { return <div className="flex items-start justify-between gap-4 rounded-xl bg-[var(--color-surface-2)] p-4"><div className="min-w-0"><p className="text-sm font-semibold text-[var(--color-foreground)]">{label}</p><p className="mt-1 break-words text-xs leading-5 text-[var(--color-foreground-secondary)]">{value}</p></div><StatusBadge tone={tone}>{tone === "success" ? "OK" : tone === "danger" ? "Ошибка" : "Нет данных"}</StatusBadge></div>; }

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center"><div className="mb-3 text-[var(--color-foreground-tertiary)]">{icon}</div><h3 className="text-sm font-bold text-[var(--color-foreground)]">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--color-foreground-secondary)]">{description}</p></div>; }

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-5"><h2 className="font-bold text-[var(--color-foreground)]">Не удалось загрузить данные</h2><p className="mt-1 text-sm leading-6 text-[var(--color-foreground-secondary)]">{message}</p><button type="button" onClick={() => void onRetry()} className="mt-4 h-10 rounded-xl bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[var(--color-background)]">Повторить</button></div>; }

function RowsSkeleton({ count }: { count: number }) { return <div className="space-y-3" aria-busy="true" aria-label="Загрузка данных">{Array.from({ length: count }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />)}</div>; }
