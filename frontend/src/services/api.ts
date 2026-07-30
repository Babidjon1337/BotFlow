import type { FunnelNode } from "../types";
import type { ApiBot } from "./botMapper";

export type SubscriptionStatus = "none" | "active" | "expired";

export interface BillingState {
  telegram_id: number;
  subscription_status: SubscriptionStatus;
  subscription_until: string | null;
  slots_bought: number;
  subscription_auto_renew: boolean;
  subscription_retry_count: number;
  is_admin: boolean;
  email: string | null;
  email_receipts_enabled: boolean;
  email_billing_notifications_enabled: boolean;
}

export interface BillingProduct {
  id: "basic" | "pro";
  name: string;
  price: number;
  period: "lifetime" | "month";
}

const BASE_URL = import.meta.env.VITE_API_URL || "";

function getInitData(): string {
  // @ts-expect-error Telegram injects WebApp into the browser window.
  return window.Telegram?.WebApp?.initData || "";
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": getInitData(),
    ...(options.headers as Record<string, string>),
  };

  if (options.body && options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Error ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const apiService = {
  async updateNotificationSettings(data: {
    email?: string;
    emailReceiptsEnabled: boolean;
    emailBillingNotificationsEnabled: boolean;
  }) {
    return fetchApi<BillingState>("/api/profile/notification-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async auth(initData?: string) {
    return fetchApi<{
      status: string;
      user: BillingState;
      bots: ApiBot[];
    }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ init_data: initData || getInitData() }),
    });
  },

  async getBots() {
    return fetchApi<{ bots: ApiBot[] }>("/api/bots");
  },

  async createBot(data: {
    token: string;
    displayName: string;
    paymentProvider?: string;
    paymentCreds?: Record<string, unknown>;
    offerUrl?: string;
    offerInstallments?: boolean;
  }) {
    return fetchApi<ApiBot>("/api/bots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateBot(
    botId: string | number,
    data: {
      token?: string;
      displayName?: string;
      paymentProvider?: string;
      paymentCreds?: Record<string, unknown>;
      offerUrl?: string;
      offerInstallments?: boolean;
    }
  ) {
    return fetchApi<ApiBot>(`/api/bots/${botId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteBot(botId: string | number) {
    return fetchApi<{ status: string; message: string }>(`/api/bots/${botId}`, {
      method: "DELETE",
    });
  },

  async resetBotLeads(botId: string | number) {
    return fetchApi<{ status: string; deletedCount: number }>(`/api/bots/${botId}/leads`, {
      method: "DELETE",
    });
  },

  async toggleBot(botId: string | number, action: "start" | "stop") {
    return fetchApi<{
      status: string;
      message: string;
      botStatus: "active" | "draft";
      webhookUrl?: string;
      botUrl?: string;
    }>(`/api/bots/${botId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },

  async getFunnel(botId: string | number) {
    return fetchApi<{
      version: number;
      nodes: FunnelNode[];
      funnelComplete: boolean;
    }>(`/api/bots/${botId}/funnel`);
  },

  async getBotReadiness(botId: string | number) {
    return fetchApi<{ isReady: boolean; reasons: string[] }>(
      `/api/bots/${botId}/readiness`
    );
  },

  async saveFunnel(
    botId: string | number,
    nodes: FunnelNode[],
    funnelComplete: boolean = true
  ) {
    return fetchApi<{
      status: string;
      message: string;
      funnelComplete: boolean;
      readinessReasons: string[];
      botStatus: "active" | "draft";
      stopped: boolean;
    }>(`/api/bots/${botId}/funnel`, {
      method: "PUT",
      body: JSON.stringify({
        version: 2,
        nodes,
        funnelComplete,
      }),
    });
  },

  async syncMedia(botId: string | number) {
    return fetchApi<{ status: string; mediaSyncDone: boolean }>(
      `/api/bots/${botId}/media-sync`,
      {
        method: "POST",
      }
    );
  },

  async uploadBotMedia(botId: string | number, nodeId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetchApi<{ id: string; nodeId: string; mediaType: "photo" | "video" | "document"; fileId: string }>(
      `/api/bots/${botId}/media?node_id=${encodeURIComponent(nodeId)}`,
      { method: "POST", body: formData }
    );
  },

  async getBotMediaPreview(botId: string | number, assetId: string) {
    const response = await fetch(`${BASE_URL}/api/bots/${botId}/media/${assetId}/preview`, {
      headers: { "X-Telegram-Init-Data": getInitData() },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || "Не удалось загрузить предпросмотр файла.");
    }
    return response.blob();
  },

  async getLeads(
    botId: string | number,
    search?: string,
    page: number = 1,
    limit: number = 20
  ) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("page", str(page));
    params.append("limit", str(limit));
    return fetchApi<{ leads: Array<Record<string, unknown>>; total: number }>(
      `/api/bots/${botId}/leads?${params.toString()}`
    );
  },

  async getStats(botId: string | number) {
    return fetchApi<{
      views: number;
      clicks: number;
      sales: number;
      conversion: number;
      revenue: number;
      funnel_data: { name: string; value: number }[];
    }>(`/api/bots/${botId}/stats`);
  },

  async sendInvoice(
    botId: string | number,
    leadTelegramId: number,
    tariffIds: string[]
  ) {
    return fetchApi<{ status: string; message: string }>(
      `/api/bots/${botId}/invoices`,
      {
        method: "POST",
        body: JSON.stringify({ leadTelegramId, tariffIds }),
      }
    );
  },

  async createBillingCheckout(product: "basic" | "pro", email?: string) {
    return fetchApi<{ paymentId: string; confirmationUrl: string }>(
      "/api/billing/checkout",
      {
        method: "POST",
        body: JSON.stringify({ product, email }),
      }
    );
  },

  async getBillingCatalog() {
    return fetchApi<{ products: BillingProduct[] }>("/api/billing/catalog");
  },

  async getBillingStatus() {
    return fetchApi<BillingState>("/api/billing/status");
  },

  async cancelBilling() {
    return fetchApi<BillingState>("/api/billing/cancel", { method: "POST" });
  },
};

function str(val: unknown): string {
  return String(val);
}
