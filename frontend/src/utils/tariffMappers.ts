import type {
  TariffItem,
  TariffDeliverable,
  DeliverableType,
} from '../types/tariff';
import type { Tariff } from '../types';

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 КБ';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function toBackendPayload(item: TariffItem) {
  const isSubscription = item.paymentType === 'subscription';
  let recurringPeriod: string | undefined = undefined;
  if (isSubscription) {
    if (item.billingPeriod === 'week') recurringPeriod = '1_week';
    else if (item.billingPeriod === '3months') recurringPeriod = '3_months';
    else if (item.billingPeriod === 'year') recurringPeriod = '1_year';
    else recurringPeriod = '1_month';
  }

  return {
    name: item.name,
    description: item.description || undefined,
    price: item.price,
    paymentType: isSubscription ? 'recurring' : 'one_time',
    recurringPeriod,
    salesMode: item.salesMode === 'application' ? 'manual' : item.salesMode,
    isActive: item.isActiveInFunnel,
    deliverables: item.deliverables.map((d) => {
      const base: Record<string, unknown> = {
        type: d.type,
        title: d.title,
      };
      if (d.type === 'channel' || d.type === 'group') {
        base.chatId = d.chatId;
        base.accessMode = 'member';
      } else if (d.type === 'file') {
        base.filePath = d.fileUrl || d.fileName || '';
        base.url = d.fileUrl || '';
        base.filename = d.fileName || d.title;
        base.sizeBytes = d.fileSize || 0;
      } else if (d.type === 'link') {
        base.url = d.url || '';
      }
      return base;
    }),
  };
}

export function mapBackendTariff(raw: Record<string, unknown>, idx = 0): TariffItem {
  const isRecurring =
    raw.payment_type === 'recurring' ||
    raw.paymentType === 'recurring' ||
    raw.paymentType === 'subscription';

  const recPeriod = String(raw.recurring_period || raw.recurringPeriod || '');
  let billingPeriod: 'week' | 'month' | '3months' | 'year' = 'month';
  if (recPeriod === '1_week' || recPeriod === 'week') billingPeriod = 'week';
  else if (recPeriod === '3_months' || recPeriod === '3months') billingPeriod = '3months';
  else if (recPeriod === '1_year' || recPeriod === 'year') billingPeriod = 'year';

  const rawSales = String(raw.sales_mode || raw.salesMode || 'auto');
  const salesMode: 'auto' | 'application' | 'hybrid' =
    rawSales === 'manual' ? 'application' : rawSales === 'hybrid' ? 'hybrid' : 'auto';

  const rawDeliverables = (Array.isArray(raw.deliverables) ? raw.deliverables : []) as Array<Record<string, unknown>>;
  const deliverables: TariffDeliverable[] = rawDeliverables.map((d, dIdx) => {
    const isFile = d.type === 'file';
    const isChat = d.type === 'channel' || d.type === 'group';
    const size =
      typeof d.sizeBytes === 'number'
        ? d.sizeBytes
        : typeof d.size_bytes === 'number'
        ? d.size_bytes
        : typeof d.size === 'number'
        ? d.size
        : undefined;

    return {
      id: String(d.id || `del_${raw.id || idx}_${dIdx}`),
      type: (d.type as DeliverableType) || 'link',
      title: String(d.title || (isFile ? d.filename || d.originalName || 'Файл' : isChat ? 'Чат / Канал' : 'Ссылка')),
      chatId: d.chatId ? String(d.chatId) : d.chat_id ? String(d.chat_id) : undefined,
      chatType: (d.chatType as 'channel' | 'group' | 'supergroup') || (d.type === 'channel' ? 'channel' : 'group'),
      accessNote: isChat ? 'Персональная ссылка (1 вход)' : undefined,
      fileName: d.filename ? String(d.filename) : d.originalName ? String(d.originalName) : d.fileName ? String(d.fileName) : undefined,
      fileSize: size,
      fileSizeFormatted: size ? formatFileSize(size) : undefined,
      fileUrl: d.url ? String(d.url) : d.filePath ? String(d.filePath) : d.file_path ? String(d.file_path) : undefined,
      url: d.url ? String(d.url) : undefined,
    };
  });

  return {
    id: String(raw.id || `t_${idx}`),
    name: String(raw.name || 'Тариф'),
    price: Number(raw.price) || 0,
    oldPrice: raw.oldPrice ? Number(raw.oldPrice) : null,
    paymentType: isRecurring ? 'subscription' : 'one_time',
    billingPeriod: isRecurring ? billingPeriod : undefined,
    salesMode,
    isActiveInFunnel:
      raw.is_active !== undefined
        ? Boolean(raw.is_active)
        : raw.isActive !== undefined
        ? Boolean(raw.isActive)
        : true,
    buyersCount: Number(raw.total_buyers ?? raw.totalBuyers ?? raw.buyersCount) || 0,
    revenue: Number(raw.total_revenue ?? raw.totalRevenue ?? raw.revenue) || 0,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    deliverables,
    createdAt: raw.created_at ? String(raw.created_at) : raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
    updatedAt: raw.updated_at ? String(raw.updated_at) : raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

export function tariffItemToTariff(item: TariffItem): Tariff {
  const d = item.deliverables && item.deliverables.length > 0 ? item.deliverables[0] : null;
  let actionType: 'link' | 'group' | 'text' | 'file' = 'link';
  let actionData = '';
  let chatType: 'channel' | 'group' | 'supergroup' | undefined = undefined;

  if (d) {
    if (d.type === 'channel' || d.type === 'group') {
      actionType = 'group';
      actionData = d.chatId || '';
      chatType = d.chatType || (d.type === 'channel' ? 'channel' : 'group');
    } else if (d.type === 'file') {
      actionType = 'file';
      actionData = d.fileUrl || d.fileId || d.fileName || '';
    } else if (d.type === 'link') {
      actionType = 'link';
      actionData = d.url || '';
    }
  }

  return {
    id: item.id,
    name: item.name,
    price: item.price,
    description: item.description && item.description.trim() ? item.description : (d ? d.title : item.name),
    hasDelivery: Boolean(item.deliverables && item.deliverables.length > 0),
    actionType,
    actionData,
    chatType,
    installments: item.paymentType === 'subscription',
    deliverables: item.deliverables,
  };
}

export function tariffToTariffItem(t: Tariff, idx = 0): TariffItem {
  let deliverables: TariffDeliverable[] = t.deliverables ? [...t.deliverables] : [];
  if (deliverables.length === 0 && t.hasDelivery !== false && t.actionData) {
    if (t.actionType === 'group') {
      deliverables = [
        {
          id: `del_${t.id}_1`,
          type: t.chatType === 'channel' ? 'channel' : 'group',
          title: t.chatType === 'channel' ? 'Канал' : 'Чат / Группа',
          chatId: t.actionData,
          chatType: t.chatType || 'group',
        },
      ];
    } else if (t.actionType === 'file') {
      deliverables = [
        {
          id: `del_${t.id}_1`,
          type: 'file',
          title: 'Файл',
          fileUrl: t.actionData,
          fileId: t.actionData,
        },
      ];
    } else if (t.actionType === 'link' || t.actionType === 'text') {
      deliverables = [
        {
          id: `del_${t.id}_1`,
          type: 'link',
          title: 'Ссылка',
          url: t.actionData,
        },
      ];
    }
  }

  return {
    id: String(t.id || `t_${idx}`),
    name: t.name || `Тариф ${idx + 1}`,
    price: typeof t.price === 'number' ? t.price : Number(t.price) || 0,
    paymentType: t.installments ? 'subscription' : 'one_time',
    salesMode: 'auto',
    isActiveInFunnel: true,
    buyersCount: 0,
    revenue: 0,
    description: t.description,
    deliverables,
  };
}
