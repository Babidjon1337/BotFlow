export interface Tariff {
  id: string;
  name: string;
  price: string | number;
  description: string;
  hasDelivery?: boolean;
  actionType: 'link' | 'group' | 'text' | 'file';
  actionData: string;
}

export interface FunnelNode {
  id: string;
  step: string;
  subtitle: string;
  delay: string;
  kind: 'message' | 'reminder' | 'delivery' | 'payment';
  content: string;
  buttonText: string;
  buttonText2?: string;
  x: number;
  y: number;
  paymentMode?: 'auto' | 'application' | 'hybrid';
  managerText?: string;
  tariffs?: Tariff[];
  tariffSelectionText?: string;
  media?: boolean;
}

export type TabType = 'home' | 'build' | 'flow' | 'profile' | 'subscription' | 'manage' | 'admin_stats';
export type SheetType = 'billing_first' | 'billing_renew' | 'bot_switcher' | 'bot_settings' | 'checkout' | 'bot_create' | 'invoice' | null;
export type PaymentProvider = 'yookassa' | 'robokassa' | 'prodamus';
export type DeliveryType = 'link' | 'invite' | 'file';

export interface BotConfig {
  id: string;
  name: string;
  username: string;
  status: 'active' | 'inactive'; // active means receiving traffic
  usersCount: number;
  isTokenLocked: boolean;
  token?: string;
  paymentProvider?: string;
  paymentKeys?: Record<string, string>;
  offerUrl?: string;
  offerInstallments?: boolean;
  funnelComplete: boolean;
}

export interface AppState {
  activeBot: BotConfig | null;
  bots: BotConfig[];
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionUntil: string | null;
  slotsBought: number;
  userEmail: string;
  activeSheet: SheetType;
  sheetData?: { tariff: 'basic' | 'pro' } | { botId: string } | { clientName: string, username: string };
  isDirty: boolean;
}
