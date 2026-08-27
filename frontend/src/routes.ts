export type AccountTab = 'bots' | 'gateways' | 'billing' | 'profile' | 'admin';

/** Разделы внутри выбранного бота (design.md §15.1). */
export type BotView =
  | 'overview'
  | 'scenario'
  | 'platforms'
  | 'monetization'
  | 'broadcasts'
  | 'clients'
  | 'analytics';

export type AppRoute =
  | { level: 'account'; tab: AccountTab }
  | { level: 'bot'; view: BotView };

export interface AccountTabDef {
  id: AccountTab;
  /** Полное название (sidebar/заголовок). */
  label: string;
  /** Короткий ярлык bottom-nav mobile. */
  short: string;
}

export const ACCOUNT_TABS: AccountTabDef[] = [
  { id: 'bots', label: 'Мои боты', short: 'Боты' },
  { id: 'gateways', label: 'Платёжные системы', short: 'Кассы' },
  { id: 'billing', label: 'Подписка', short: 'Подписка' },
  { id: 'profile', label: 'Профиль', short: 'Профиль' },
  { id: 'admin', label: 'Управление сервисом', short: 'Админ' },
];

export const BOT_VIEWS: Array<{
  id: BotView;
  label: string;
  comingSoon?: boolean;
}> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'scenario', label: 'Сценарий' },
  { id: 'platforms', label: 'Платформы' },
  { id: 'monetization', label: 'Монетизация' },
  { id: 'broadcasts', label: 'Рассылки' },
];

const ROUTE_KEY = 'botflow_route_v1';

function isBotView(value: unknown): value is BotView {
  return typeof value === 'string' && BOT_VIEWS.some(v => v.id === value);
}

function isAccountTab(value: unknown): value is AccountTab {
  return typeof value === 'string' && ACCOUNT_TABS.some(t => t.id === value);
}

/** Миграция старых сохранённых маршрутов (funnel → scenario и т.п.). */
const BOT_VIEW_ALIASES: Record<string, BotView> = {
  funnel: 'scenario',
  connections: 'platforms',
  clients: 'overview',
  analytics: 'overview',
};

export function loadStoredRoute(): AppRoute {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return { level: 'account', tab: 'bots' };
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'level' in parsed &&
      parsed.level === 'bot' &&
      'view' in parsed
    ) {
      const rawView = String(parsed.view);
      const view = isBotView(rawView) ? rawView : BOT_VIEW_ALIASES[rawView];
      if (view) return { level: 'bot', view };
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'level' in parsed &&
      parsed.level === 'account' &&
      'tab' in parsed &&
      isAccountTab(parsed.tab)
    ) {
      return { level: 'account', tab: parsed.tab };
    }
  } catch {
    // повреждённый маршрут игнорируем
  }
  return { level: 'account', tab: 'bots' };
}

export function persistRoute(route: AppRoute): void {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
  } catch {
    // приватный режим — маршрут просто не сохранится
  }
}

/** Уровень бота доступен только когда выбран бот. */
export function resolveRoute(route: AppRoute, hasActiveBot: boolean, isAdmin = false): AppRoute {
  if (route.level === 'bot' && !hasActiveBot) {
    return { level: 'account', tab: 'bots' };
  }
  if (
    route.level === 'bot' &&
    (route.view === 'clients' || route.view === 'analytics')
  ) {
    return { level: 'bot', view: 'overview' };
  }
  if (route.level === 'account' && route.tab === 'admin' && !isAdmin) {
    return { level: 'account', tab: 'bots' };
  }
  return route;
}
