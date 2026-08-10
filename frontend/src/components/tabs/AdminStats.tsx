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
  Users,
} from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";
import {
  apiService,
  type AdminAuditEntry,
  type AdminBot,
  type AdminOperation,
  type AdminOverview,
  type AdminSaasPayment,
  type AdminUser,
} from "../../services/api";

type AdminSection = "overview" | "users" | "bots" | "payments" | "operations" | "system";
type LoadState = "idle" | "loading" | "ready" | "error";

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
  const [section, setSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [payments, setPayments] = useState<AdminSaasPayment[]>([]);
  const [operations, setOperations] = useState<AdminOperation[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usersQuery, setUsersQuery] = useState("");
  const [botsQuery, setBotsQuery] = useState("");
  const [botsStatus, setBotsStatus] = useState<AdminBot["status"] | "all">("all");

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
        const nextAudit = await apiService.getAdminAuditLog(1, 50);
        setAuditEntries(nextAudit.entries);
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
      {state !== "error" && section === "overview" ? <Overview overview={overview} operations={operations} loading={state === "loading"} onNavigate={setSection} /> : null}
      {state !== "error" && section === "users" ? <UsersSection users={users} query={usersQuery} onQueryChange={setUsersQuery} loading={state === "loading"} /> : null}
      {state !== "error" && section === "bots" ? <BotsSection bots={bots} query={botsQuery} onQueryChange={setBotsQuery} status={botsStatus} onStatusChange={setBotsStatus} loading={state === "loading"} /> : null}
      {state !== "error" && section === "payments" ? <PaymentsSection payments={payments} loading={state === "loading"} /> : null}
      {state !== "error" && section === "operations" ? <OperationsSection operations={operations} loading={state === "loading"} /> : null}
      {state !== "error" && section === "system" ? <SystemSection entries={auditEntries} loading={state === "loading"} /> : null}
    </section>
  );
}

function Overview({ overview, operations, loading, onNavigate }: { overview: AdminOverview | null; operations: AdminOperation[]; loading: boolean; onNavigate: (section: AdminSection) => void }) {
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
        {loading ? <RowsSkeleton count={2} /> : operations.length ? <div className="divide-y divide-[var(--color-border)]">{operations.map((operation) => <OperationRow key={operation.payment_id} operation={operation} />)}</div> : <EmptyState icon={<CheckCircle2 size={21} />} title="Незавершённых операций нет" description="Когда после оплаты потребуется повторить выдачу доступа или уведомление, запись появится здесь." />}
        {!loading && operations.length ? <button type="button" onClick={() => onNavigate("operations")} className="mt-4 text-sm font-semibold text-[var(--color-primary)] hover:underline">Открыть все операции</button> : null}
      </Section>
    </div>
  );
}

function UsersSection({ users, query, onQueryChange, loading }: { users: AdminUser[]; query: string; onQueryChange: (value: string) => void; loading: boolean }) {
  return <Section title="Пользователи" description="Поиск владельцев по Telegram ID. Имена не сохраняются в профиле владельца, поэтому интерфейс не подменяет их вымышленными данными."><SearchInput value={query} onChange={onQueryChange} placeholder="Telegram ID" />{loading ? <RowsSkeleton count={5} /> : users.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]"><tr><th className="pb-3">Пользователь</th><th className="pb-3">Доступ</th><th className="pb-3">Боты</th><th className="pb-3">PRO</th><th className="pb-3">Зарегистрирован</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-4"><p className="font-semibold tabular-nums text-[var(--color-foreground)]">{user.telegram_id}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">ID в BotFlow: {user.id}</p></td><td className="py-4"><StatusBadge tone="neutral">{user.lifetime_slots} лиц.</StatusBadge></td><td className="py-4 tabular-nums text-[var(--color-foreground)]">{user.bots_count}</td><td className="py-4"><StatusBadge tone={user.subscription_ends_at ? "success" : "neutral"}>{user.subscription_ends_at ? `до ${formatDate(user.subscription_ends_at)}` : "Нет"}</StatusBadge></td><td className="py-4 text-[var(--color-foreground-secondary)]">{formatDate(user.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={21} />} title="Пользователи не найдены" description="Измените запрос или дождитесь первой регистрации в Mini App." />}</Section>;
}

function BotsSection({ bots, query, onQueryChange, status, onStatusChange, loading }: { bots: AdminBot[]; query: string; onQueryChange: (value: string) => void; status: AdminBot["status"] | "all"; onStatusChange: (value: AdminBot["status"] | "all") => void; loading: boolean }) {
  return <Section title="Боты" description="Операционное состояние без раскрытия Telegram-токенов и ключей платёжных систем."><div className="flex flex-col gap-3 md:flex-row"><SearchInput value={query} onChange={onQueryChange} placeholder="Название, @username или Telegram ID" /><label className="sr-only" htmlFor="admin-bot-status">Статус бота</label><select id="admin-bot-status" value={status} onChange={(event) => onStatusChange(event.target.value as AdminBot["status"] | "all")} className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"><option value="all">Все статусы</option><option value="active">Активные</option><option value="draft">Черновики</option><option value="archived">Архив</option></select></div>{loading ? <RowsSkeleton count={5} /> : bots.length ? <div className="mt-5 space-y-2">{bots.map((bot) => <article key={bot.id} className="grid gap-3 rounded-xl border border-[var(--color-border)] px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center"><div className="min-w-0"><h2 className="truncate font-semibold text-[var(--color-foreground)]">{bot.display_name}</h2><p className="mt-1 truncate text-xs text-[var(--color-foreground-secondary)]">{bot.username ? `@${bot.username.replace(/^@/, "")}` : "Username не задан"} · владелец {bot.owner_telegram_id}</p></div><StatusBadge tone={bot.status === "active" ? "success" : bot.status === "archived" ? "danger" : "neutral"}>{bot.status === "active" ? "Работает" : bot.status === "archived" ? "Архив" : "Черновик"}</StatusBadge><span className="text-xs text-[var(--color-foreground-secondary)]">{bot.users_count} лидов</span><span className="text-xs text-[var(--color-foreground-secondary)]">{bot.payment_provider ? bot.payment_provider : "Касса не выбрана"}</span></article>)}</div> : <EmptyState icon={<Bot size={21} />} title="Боты не найдены" description="Измените фильтр или дождитесь создания первого бота." />}</Section>;
}

function PaymentsSection({ payments, loading }: { payments: AdminSaasPayment[]; loading: boolean }) {
  return <Section title="Платежи BotFlow" description="История оплаты лицензий и PRO. Статус нельзя изменить вручную — источником истины остаётся провайдер.">{loading ? <RowsSkeleton count={5} /> : payments.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground-tertiary)]"><tr><th className="pb-3">Пользователь</th><th className="pb-3">Продукт</th><th className="pb-3">Сумма</th><th className="pb-3">Статус</th><th className="pb-3">Дата</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--color-border)] last:border-0"><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{payment.user_telegram_id}</td><td className="py-4 text-[var(--color-foreground)]">{productName[payment.product]}</td><td className="py-4 font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(payment.amount, payment.currency)}</td><td className="py-4"><StatusBadge tone={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status === "succeeded" ? "Оплачен" : payment.status === "failed" ? "Ошибка" : "Ожидает"}</StatusBadge></td><td className="py-4 text-[var(--color-foreground-secondary)]">{formatDate(payment.paid_at ?? payment.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<CreditCard size={21} />} title="Платежей пока нет" description="После создания первого счёта здесь появится реальная история SaaS-платежей." />}</Section>;
}

function OperationsSection({ operations, loading }: { operations: AdminOperation[]; loading: boolean }) {
  return <Section title="Операции" description="Оплата уже подтверждена, но выдача доступа или уведомление владельца требует внимания.">{loading ? <RowsSkeleton count={4} /> : operations.length ? <div className="divide-y divide-[var(--color-border)]">{operations.map((operation) => <OperationRow key={operation.payment_id} operation={operation} expanded />)}</div> : <EmptyState icon={<CheckCircle2 size={21} />} title="Ничего не требует действий" description="Все подтверждённые платежи обработаны или ожидают штатной очереди." />}</Section>;
}

function SystemSection({ entries, loading }: { entries: AdminAuditEntry[]; loading: boolean }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><Section title="Контур системы" description="Статусы ниже показываются только на основании успешно загруженных данных."><div className="space-y-3"><SystemRow label="API и база данных" value="Доступны для чтения" tone="success" /><SystemRow label="Планировщик" value="Отдельный health-check появится в следующем API-этапе" tone="neutral" /><SystemRow label="Финансовые операции" value="Подтверждаются вебхуками провайдеров" tone="neutral" /></div></Section><Section title="Журнал действий" description="Новые изменения доступа, статусов и повторные операции будут записываться здесь.">{loading ? <RowsSkeleton count={4} /> : entries.length ? <ol className="divide-y divide-[var(--color-border)]">{entries.map((entry) => <li key={entry.id} className="py-4 first:pt-0"><p className="font-semibold text-[var(--color-foreground)]">{entry.action}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">Администратор {entry.actor_telegram_id} · {entry.target_type}{entry.target_id ? ` #${entry.target_id}` : ""} · {formatDate(entry.created_at)}</p></li>)}</ol> : <EmptyState icon={<ClipboardList size={21} />} title="Журнал пока пуст" description="Он начнёт заполняться, когда будут добавлены административные действия." />}</Section></div>;
}

function OperationRow({ operation, expanded = false }: { operation: AdminOperation; expanded?: boolean }) {
  const issue = operation.fulfillment_status !== "succeeded" ? "Выдача доступа" : "Уведомление владельца";
  const error = operation.fulfillment_status !== "succeeded" ? operation.fulfillment_error : operation.owner_notification_error;
  return <article className="flex flex-col gap-3 py-4 first:pt-0 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="font-semibold text-[var(--color-foreground)]">{operation.bot_name}</p><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{issue} · {operation.provider} · {formatAmount(operation.amount, operation.currency)}</p>{expanded && error ? <p className="mt-2 break-words text-xs leading-5 text-[var(--color-danger)]">{error}</p> : null}</div><StatusBadge tone="warning">Требует проверки</StatusBadge></article>;
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

function SystemRow({ label, value, tone }: { label: string; value: string; tone: "success" | "neutral" }) { return <div className="flex items-start justify-between gap-4 rounded-xl bg-[var(--color-surface-2)] p-4"><div><p className="text-sm font-semibold text-[var(--color-foreground)]">{label}</p><p className="mt-1 text-xs leading-5 text-[var(--color-foreground-secondary)]">{value}</p></div><StatusBadge tone={tone}>{tone === "success" ? "OK" : "Нет данных"}</StatusBadge></div>; }

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center"><div className="mb-3 text-[var(--color-foreground-tertiary)]">{icon}</div><h3 className="text-sm font-bold text-[var(--color-foreground)]">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--color-foreground-secondary)]">{description}</p></div>; }

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-5"><h2 className="font-bold text-[var(--color-foreground)]">Не удалось загрузить данные</h2><p className="mt-1 text-sm leading-6 text-[var(--color-foreground-secondary)]">{message}</p><button type="button" onClick={() => void onRetry()} className="mt-4 h-10 rounded-xl bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[var(--color-background)]">Повторить</button></div>; }

function RowsSkeleton({ count }: { count: number }) { return <div className="space-y-3" aria-busy="true" aria-label="Загрузка данных">{Array.from({ length: count }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />)}</div>; }
