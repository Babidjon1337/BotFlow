import { useMemo, useState, type ReactNode } from "react";
import { Activity, Bot, CreditCard, Database, Gift, Pause, Play, Search, ShieldCheck, Users } from "lucide-react";
import { useAppState } from "../../providers/AppStateProvider";
import { demoBots, demoEvents, demoPayments, demoUsers, type DemoAdminUser } from "../admin/mockAdminData";

type Section = "overview" | "users" | "bots" | "billing" | "system";

const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Пользователи" },
  { id: "bots", label: "Боты" },
  { id: "billing", label: "Платежи" },
  { id: "system", label: "Система" },
];

const statusClass: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  retry: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  expired: "bg-red-500/10 text-red-700 dark:text-red-300",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function AdminStats() {
  const { setToastMessage } = useAppState();
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<DemoAdminUser | null>(null);
  const [pausedBots, setPausedBots] = useState<Set<string>>(new Set());

  const users = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? demoUsers.filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(value)) : demoUsers;
  }, [query]);

  const demoAction = (message: string) => {
    setToastMessage(`${message} Это демонстрационное действие.`);
  };

  const toggleBot = (id: string, name: string) => {
    setPausedBots((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    demoAction(`Статус бота «${name}» изменён.`);
  };

  return (
    <section className="w-full space-y-5 pb-16" aria-labelledby="admin-title">
      <header className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><ShieldCheck size={23} aria-hidden="true" /></div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2"><h1 id="admin-title" className="text-xl font-bold text-[var(--color-foreground)] md:text-2xl">Центр контроля</h1><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Демо-данные</span></div>
              <p className="max-w-2xl text-sm text-[var(--color-foreground-secondary)]">Интерфейс поддержки и контроля платформы. Данные и действия на этом экране не затрагивают пользователей.</p>
            </div>
          </div>
          <span className="self-start rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Доступ подтверждён сервером</span>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-[var(--color-surface-2)] p-1" aria-label="Разделы администрирования">
          {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors ${section === item.id ? "bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm" : "text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]"}`}>{item.label}</button>)}
        </nav>
      </header>

      {section === "overview" && <Overview onNavigate={setSection} />}
      {section === "users" && <UsersSection users={users} query={query} setQuery={setQuery} onSelect={setSelectedUser} />}
      {section === "bots" && <BotsSection pausedBots={pausedBots} onToggle={toggleBot} />}
      {section === "billing" && <BillingSection />}
      {section === "system" && <SystemSection />}

      {selectedUser && <UserDialog user={selectedUser} onClose={() => setSelectedUser(null)} onAction={(label) => { demoAction(`${label}: ${selectedUser.name}.`); setSelectedUser(null); }} />}
    </section>
  );
}

function Overview({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const cards = [
    ["Владельцы ботов", "1 482", "218 за 7 дней", Users],
    ["Активные боты", "2 750", "96% доступны", Bot],
    ["MRR", "642 000 ₽", "PRO-подписки", CreditCard],
    ["Нужны действия", "3", "Списания и доступы", Activity],
  ] as const;
  return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, hint, Icon]) => <article key={label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><Icon size={19} className="mb-5 text-[var(--color-primary)]" aria-hidden="true" /><p className="text-2xl font-bold text-[var(--color-foreground)]">{value}</p><h2 className="mt-1 text-sm font-medium text-[var(--color-foreground)]">{label}</h2><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{hint}</p></article>)}</div><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><Panel title="Требуют внимания"><div className="space-y-3"><AlertRow title="PRO: повторное списание сегодня" description="Дарья Власова · попытка 2 из 3" action="К платежам" onClick={() => onNavigate("billing")} /><AlertRow title="Бот отключён после PRO" description="Клуб Дарьи · доступ по PRO закончился" action="К ботам" onClick={() => onNavigate("bots")} /></div></Panel><Panel title="Последние события"><ol className="space-y-3">{demoEvents.map((event) => <li key={event} className="border-l-2 border-[var(--color-primary)] pl-3 text-sm text-[var(--color-foreground-secondary)]">{event}</li>)}</ol></Panel></div></>;
}

function UsersSection({ users, query, setQuery, onSelect }: { users: DemoAdminUser[]; query: string; setQuery: (value: string) => void; onSelect: (user: DemoAdminUser) => void }) {
  return <Panel title="Пользователи" description="Поиск и поддержка владельцев ботов"><label className="relative mb-4 block"><span className="sr-only">Поиск пользователя</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-foreground-tertiary)]" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} name="admin-user-search" type="search" placeholder="Имя или @username…" className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5 pl-10 pr-3 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" /></label><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-[var(--color-foreground-secondary)]"><tr><th className="pb-3 font-medium">Пользователь</th><th className="pb-3 font-medium">Доступ</th><th className="pb-3 font-medium">Боты</th><th className="pb-3 font-medium">Платёж</th><th className="pb-3" /></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-[var(--color-border)]"><td className="py-3"><p className="font-medium text-[var(--color-foreground)]">{user.name}</p><p className="text-xs text-[var(--color-foreground-secondary)]">{user.username} · {user.lastActive}</p></td><td className="py-3">{user.subscription === "pro" ? "PRO" : `${user.licenses} лиц.`}</td><td className="py-3">{user.bots}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass[user.paymentState]}`}>{user.paymentState === "retry" ? "Повтор" : user.paymentState === "expired" ? "Истёк" : "Оплачен"}</span></td><td className="py-3 text-right"><button type="button" onClick={() => onSelect(user)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]">Открыть</button></td></tr>)}</tbody></table></div></Panel>;
}

function BotsSection({ pausedBots, onToggle }: { pausedBots: Set<string>; onToggle: (id: string, name: string) => void }) { return <Panel title="Боты" description="Статус и право на запуск"><div className="space-y-3">{demoBots.map((bot) => { const paused = pausedBots.has(bot.id) || bot.status === "paused"; return <article key={bot.id} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium text-[var(--color-foreground)]">{bot.name}</h2><p className="text-xs text-[var(--color-foreground-secondary)]">{bot.owner} · {bot.entitlement} · {bot.leads.toLocaleString("ru-RU")} лидов · {bot.updatedAt}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass[paused ? "paused" : "active"]}`}>{paused ? "Приостановлен" : "Активен"}</span><button type="button" onClick={() => onToggle(bot.id, bot.name)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]">{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{paused ? "Запустить" : "Остановить"}</button></div></article>; })}</div></Panel>; }

function BillingSection() { return <Panel title="Подписки и платежи" description="Контроль повторных списаний и покупок"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-[var(--color-foreground-secondary)]"><tr><th className="pb-3 font-medium">Клиент</th><th className="pb-3 font-medium">Продукт</th><th className="pb-3 font-medium">Сумма</th><th className="pb-3 font-medium">Статус</th><th className="pb-3 font-medium">Дата</th></tr></thead><tbody>{demoPayments.map((payment) => <tr key={payment.id} className="border-t border-[var(--color-border)]"><td className="py-3 font-medium text-[var(--color-foreground)]">{payment.customer}</td><td className="py-3">{payment.product}</td><td className="py-3">{payment.amount}</td><td className="py-3">{payment.status}</td><td className="py-3 text-[var(--color-foreground-secondary)]">{payment.at}</td></tr>)}</tbody></table></div></Panel>; }

function SystemSection() { return <Panel title="Система и аудит" description="Наблюдаемость без ложных обещаний"><div className="grid gap-3 md:grid-cols-3">{[["API", "Демо: доступен"], ["Очередь повторных списаний", "Демо: 2 задачи"], ["База данных", "Демо: мониторинг подключается позже"]].map(([name, value]) => <article key={name} className="rounded-xl bg-[var(--color-surface-2)] p-4"><Database size={18} className="mb-3 text-[var(--color-primary)]" aria-hidden="true" /><h2 className="text-sm font-medium text-[var(--color-foreground)]">{name}</h2><p className="mt-1 text-xs text-[var(--color-foreground-secondary)]">{value}</p></article>)}</div></Panel>; }

function UserDialog({ user, onClose, onAction }: { user: DemoAdminUser; onClose: () => void; onAction: (label: string) => void }) { return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="admin-user-title" className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="admin-user-title" className="text-lg font-bold text-[var(--color-foreground)]">{user.name}</h2><p className="text-sm text-[var(--color-foreground-secondary)]">{user.username} · {user.bots} ботов · {user.licenses} лицензии</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface-2)]" aria-label="Закрыть карточку пользователя">Закрыть</button></div><div className="mt-5 grid gap-2"><button type="button" onClick={() => onAction("Выдана лицензия")} className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]"><Gift size={16} className="mr-2 inline text-[var(--color-primary)]" aria-hidden="true" />Выдать лицензию</button><button type="button" onClick={() => onAction("Выдан PRO-доступ")} className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]">Выдать PRO-доступ</button><button type="button" onClick={() => onAction("Запущен повтор платежа")} className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]">Повторить платёж</button></div></section></div>; }

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) { return <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6"><h2 className="text-base font-semibold text-[var(--color-foreground)]">{title}</h2>{description && <p className="mb-5 mt-1 text-sm text-[var(--color-foreground-secondary)]">{description}</p>}{children}</section>; }
function AlertRow({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) { return <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-medium text-[var(--color-foreground)]">{title}</h3><p className="text-xs text-[var(--color-foreground-secondary)]">{description}</p></div><button type="button" onClick={onClick} className="self-start rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]">{action}</button></div>; }
