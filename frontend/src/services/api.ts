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

export interface AdminOverview {
  users_total: number;
  bots_total: number;
  bots_active: number;
  saas_payments_succeeded: number;
  saas_revenue: number;
  operations_requiring_attention: number;
}

export interface AdminUser {
  id: number;
  telegram_id: number;
  bots_count: number;
  lifetime_slots: number;
  subscription_ends_at: string | null;
  subscription_auto_renew: boolean;
  subscription_retry_count: number;
  is_disabled: boolean;
  created_at: string | null;
}

export interface AdminBot {
  id: number;
  owner_id: number;
  owner_telegram_id: number;
  display_name: string;
  username: string | null;
  tg_bot_id: number | null;
  status: "draft" | "active" | "archived";
  users_count: number;
  is_token_locked: boolean;
  has_lifetime_license: boolean;
  funnel_complete: boolean;
  media_sync_done: boolean;
  payment_provider: string | null;
  has_payment_credentials: boolean;
  created_at: string | null;
}

export type AdminBotAction = "start" | "stop" | "reinstall_webhook";

export interface AdminBotActionResult {
  status: string;
  message: string;
  botStatus: AdminBot["status"];
  webhookUrl?: string | null;
}

export interface AdminSaasPayment {
  id: string;
  user_id: number;
  user_telegram_id: number;
  product: "license" | "pro_initial" | "pro_renewal";
  amount: number;
  currency: string;
  status: "pending" | "succeeded" | "failed";
  attempt: number;
  paid_at: string | null;
  created_at: string | null;
}

export interface AdminOperation {
  payment_id: string;
  bot_id: number;
  bot_name: string;
  lead_id: number;
  provider: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  fulfillment_status: string;
  fulfillment_attempts: number;
  fulfillment_error: string | null;
  owner_notification_status: string;
  owner_notification_attempts: number;
  owner_notification_error: string | null;
}

export interface AdminAuditEntry {
  id: string;
  actor_telegram_id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
}

export interface AdminSystemStatus {
  running: boolean;
  jobs: Array<{
    id: string;
    next_run_at: string | null;
    last_finished_at: string | null;
    last_error: string | null;
  }>;
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
  const responseBody = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const getErrorDetail = (): string | null => {
    if (!isJson || !responseBody) return null;

    try {
      const payload: unknown = JSON.parse(responseBody);
      if (payload && typeof payload === "object" && "detail" in payload) {
        const detail = (payload as { detail?: unknown }).detail;
        return typeof detail === "string" ? detail : null;
      }
    } catch {
      // The response is marked as JSON but is malformed. A useful generic
      // error is shown below instead of leaking the raw response.
    }

    return null;
  };

  if (!response.ok) {
    throw new Error(
      getErrorDetail() || `Ошибка сервера (${response.status}). Повторите попытку.`
    );
  }

  if (!isJson) {
    console.error("API returned a non-JSON response", {
      endpoint,
      status: response.status,
      contentType,
    });
    throw new Error(
      "Сервер вернул неожиданный ответ вместо данных. Обновите Mini App и повторите сохранение."
    );
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch {
    console.error("API returned malformed JSON", { endpoint, status: response.status });
    throw new Error(
      "Сервер вернул некорректные данные. Обновите Mini App и повторите попытку."
    );
  }
}

export const apiService = {
  async getAdminOverview() {
    return fetchApi<AdminOverview>("/api/admin/overview");
  },

  async getAdminUsers(query?: string, page: number = 1, limit: number = 25) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query?.trim()) params.set("query", query.trim());
    return fetchApi<{ users: AdminUser[]; total: number; page: number; limit: number }>(
      `/api/admin/users?${params.toString()}`
    );
  },

  async setAdminUserAccess(
    userId: number,
    data: { disabled: boolean; stopActiveBots: boolean },
  ) {
    return fetchApi<{ user_id: number; is_disabled: boolean; stopped_active_bots: number; changed: boolean }>(
      `/api/admin/users/${userId}/access`,
      { method: "POST", body: JSON.stringify(data) },
    );
  },

  async changeAdminLifetimeLicenses(
    userId: number,
    data: { direction: "grant" | "revoke"; quantity: number },
  ) {
    return fetchApi<{ user_id: number; lifetime_slots: number; used_lifetime_licenses: number }>(
      `/api/admin/users/${userId}/lifetime-licenses`,
      { method: "POST", body: JSON.stringify(data) },
    );
  },

  async extendAdminUserPro(userId: number, days: number) {
    return fetchApi<{ user_id: number; subscription_ends_at: string }>(
      `/api/admin/users/${userId}/pro`,
      { method: "POST", body: JSON.stringify({ days }) },
    );
  },

  async disableAdminUserAutoRenew(userId: number) {
    return fetchApi<{ user_id: number; subscription_auto_renew: boolean; changed: boolean }>(
      `/api/admin/users/${userId}/cancel-auto-renew`,
      { method: "POST" },
    );
  },

  async getAdminBots(filters: { query?: string; status?: AdminBot["status"]; page?: number; limit?: number } = {}) {
    const params = new URLSearchParams({ page: String(filters.page ?? 1), limit: String(filters.limit ?? 25) });
    if (filters.query?.trim()) params.set("query", filters.query.trim());
    if (filters.status) params.set("status", filters.status);
    return fetchApi<{ bots: AdminBot[]; total: number; page: number; limit: number }>(
      `/api/admin/bots?${params.toString()}`
    );
  },

  async runAdminBotAction(botId: number, action: AdminBotAction) {
    return fetchApi<AdminBotActionResult>(`/api/admin/bots/${botId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },

  async getAdminBotReadiness(botId: number) {
    return fetchApi<{ isReady: boolean; reasons: string[] }>(
      `/api/admin/bots/${botId}/readiness`,
    );
  },

  async getAdminPayments(status?: AdminSaasPayment["status"], page: number = 1, limit: number = 25) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    return fetchApi<{ payments: AdminSaasPayment[]; total: number; page: number; limit: number }>(
      `/api/admin/payments?${params.toString()}`
    );
  },

  async getAdminOperations(page: number = 1, limit: number = 25) {
    return fetchApi<{ operations: AdminOperation[]; total: number; page: number; limit: number }>(
      `/api/admin/operations?page=${page}&limit=${limit}`
    );
  },

  async getAdminAuditLog(page: number = 1, limit: number = 25) {
    return fetchApi<{ entries: AdminAuditEntry[]; total: number; page: number; limit: number }>(
      `/api/admin/audit-log?page=${page}&limit=${limit}`
    );
  },

  async getAdminSystemStatus() {
    return fetchApi<AdminSystemStatus>("/api/admin/system");
  },

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

  async verifyChatDelivery(
    botId: string | number,
    chatId: string,
    accessMode: string
  ) {
    return fetchApi<{ status: string; chatTitle: string; chatType: string }>(
      `/api/bots/${botId}/chat-delivery/verify`,
      { method: "POST", body: JSON.stringify({ chatId, accessMode }) }
    );
  },

  async getConnectedChats(botId: string | number) {
    return fetchApi<{ chats: Array<{ id: string; chatId: string; title: string; chatType: string }> }>(
      `/api/bots/${botId}/connected-chats`
    );
  },

  async deleteConnectedChat(botId: string | number, chatId: string) {
    return fetchApi<{ status: string }>(
      `/api/bots/${botId}/connected-chats/${chatId}`,
      { method: "DELETE" }
    );
  },

  async getBotChartData(botId: string | number, period: 'week' | 'month') {
    return fetchApi<{ points: Array<{ date: string; sales: number; users: number }> }>(
      `/api/bots/${botId}/stats/chart?period=${period}`
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
