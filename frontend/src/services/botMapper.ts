import type { BotConfig } from "../types";

export interface ApiBot {
  id: number | string;
  displayName?: string;
  username?: string | null;
  status?: string;
  usersCount?: number;
  sales?: number;
  revenue?: number;
  isTokenLocked?: boolean;
  hasLifetimeLicense?: boolean;
  paymentProvider?: string;
  hasPaymentCredentials?: boolean;
  tokenPreview?: string;
  paymentCredentialsPreview?: Record<string, string>;
  paymentWebhookUrl?: string;
  offerUrl?: string;
  offerInstallments?: boolean;
  funnelComplete?: boolean;
  mediaSyncDone?: boolean;
  botUrl?: string;
  token_changed?: boolean;
}

/** Converts the public API representation to the shape consumed by the UI. */
export function mapApiBot(bot: ApiBot): BotConfig {
  return {
    id: String(bot.id),
    name: bot.displayName || "Без имени",
    username: bot.username || "@unknown",
    status: bot.status === "active" ? "active" : "inactive",
    usersCount: bot.usersCount || 0,
    sales: bot.sales || 0,
    revenue: bot.revenue || 0,
    isTokenLocked: bot.isTokenLocked === true,
    hasLifetimeLicense: bot.hasLifetimeLicense === true,
    paymentProvider: bot.paymentProvider,
    hasPaymentCredentials: bot.hasPaymentCredentials === true,
    tokenPreview: bot.tokenPreview,
    paymentCredentialsPreview: bot.paymentCredentialsPreview,
    paymentWebhookUrl: bot.paymentWebhookUrl,
    offerUrl: bot.offerUrl,
    offerInstallments: bot.offerInstallments === true,
    funnelComplete: bot.funnelComplete === true,
    mediaSyncDone: bot.mediaSyncDone === true,
    botUrl: bot.botUrl,
  };
}
