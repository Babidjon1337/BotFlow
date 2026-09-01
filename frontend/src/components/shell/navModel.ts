import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Banknote,
  Bot,
  FileText,
  LayoutDashboard,
  Plug,
  Send,
  User,
  Users,
  ShieldCheck,
} from 'lucide-react'
import type { AccountTab, BotView } from '../../routes'

export const ACCOUNT_TAB_ICONS: Record<AccountTab, LucideIcon> = {
  bots: Bot,
  billing: Banknote,
  profile: User,
  admin: ShieldCheck,
};

export const BOT_VIEW_ICONS: Record<BotView, LucideIcon> = {
  overview: LayoutDashboard,
  scenario: FileText,
  integrations: Plug,
  audience: Users,
  broadcasts: Send,
  clients: Users,
  analytics: BarChart3,
};

export function formatBotUsername(username?: string): string {
  if (!username) return 'без username';
  return username.startsWith('@') ? username : `@${username}`;
}

export function formatMoney(value: number | undefined): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}
