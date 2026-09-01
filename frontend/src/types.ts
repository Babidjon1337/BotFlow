export interface Tariff {
  id: string;
  name: string;
  price: string | number;
  description: string;
  hasDelivery?: boolean;
  actionType: 'link' | 'group' | 'text' | 'file';
  actionData: string;
  chatAccessMode?: string;
  inviteExpiresHours?: number;
  chatType?: 'channel' | 'group' | 'supergroup';
  installments?: boolean;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaType?: 'photo' | 'video' | null;
}

/** Медиа в узле воронки: Telegram file_id + id ассета (до 10 на шаг). */
export interface NodeMediaAsset {
  mediaFileId: string;
  mediaAssetId: string;
  mediaType: 'photo' | 'video' | 'document';
  /** Локальное имя файла (для будущего файла, ещё не загруженного в ТГ). */
  fileName?: string;
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
  managerUrl?: string;
  tariffs?: Tariff[];
  tariffSelectionText?: string;
  media?: boolean;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaType?: 'photo' | 'video' | 'document' | null;
  /** Несколько медиа на шаг (фото/видео, до 10) — новый формат. */
  mediaAssets?: NodeMediaAsset[] | null;
}

export type TabType = 'home' | 'build' | 'flow' | 'profile' | 'subscription' | 'manage' | 'admin_stats';
export type SheetType = 'billing_first' | 'billing_renew' | 'bot_switcher' | 'bot_settings' | 'checkout' | 'bot_create' | null;
export type PaymentProvider = 'yookassa' | 'robokassa' | 'prodamus';
export type DeliveryType = 'link' | 'invite' | 'file';

export interface BotConfig {
  id: string;
  name: string;
  username: string;
  status: 'active' | 'inactive'; // active means receiving traffic
  usersCount: number;
  isTokenLocked: boolean;
  sales?: number;
  revenue?: number;
  token?: string;
  paymentProvider?: string;
  hasPaymentCredentials?: boolean;
  paymentKeys?: Record<string, string>;
  tokenPreview?: string;
  paymentCredentialsPreview?: Record<string, string>;
  paymentWebhookUrl?: string;
  offerUrl?: string;
  offerInstallments?: boolean;
  funnelComplete: boolean;
  mediaSyncDone?: boolean;
  botUrl?: string;
}

export interface AppState {
  activeBot: BotConfig | null;
  bots: BotConfig[];
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionUntil: string | null;
  slotsBought: number;
  isAdmin?: boolean;
  subscriptionAutoRenew?: boolean;
  subscriptionRetryCount?: number;
  userEmail: string;
  emailReceiptsEnabled?: boolean;
  emailBillingNotificationsEnabled?: boolean;
  activeSheet: SheetType;
  sheetData?: { tariff: 'basic' | 'pro' } | { botId: string };
  isDirty: boolean;
  isLoading?: boolean;
}
