import type { BotConfig } from "../types";

export interface ApiBot {
  id: number | string;
  displayName?: string;
  username?: string | null;
  status?: string;
  usersCount?: number;
  isTokenLocked?: boolean;
  paymentProvider?: string;
  hasPaymentCredentials?: boolean;
  tokenPreview?: string;
  paymentCredentialsPreview?: Record<string, string>;
  offerUrl?: string;
  offerInstallments?: boolean;
  funnelComplete?: boolean;
  mediaSyncDone?: boolean;
  botUrl?: string;
}

/** Converts the public API representation to the shape consumed by the UI. */
export function mapApiBot(bot: ApiBot): BotConfig {
  return {
    id: String(bot.id),
    name: bot.displayName || "Без имени",
    username: bot.username || "@unknown",
    status: bot.status === "active" ? "active" : "inactive",
    usersCount: bot.usersCount || 0,
    isTokenLocked: bot.isTokenLocked === true,
    paymentProvider: bot.paymentProvider,
    hasPaymentCredentials: bot.hasPaymentCredentials === true,
    tokenPreview: bot.tokenPreview,
    paymentCredentialsPreview: bot.paymentCredentialsPreview,
    offerUrl: bot.offerUrl,
    offerInstallments: bot.offerInstallments === true,
    funnelComplete: bot.funnelComplete === true,
    mediaSyncDone: bot.mediaSyncDone === true,
    botUrl: bot.botUrl,
  };
}
