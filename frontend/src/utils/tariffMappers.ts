import type {
  TariffItem,
  TariffDeliverable,
  DeliverableType,
  BillingPeriod,
} from '../types/tariff';
import type { Tariff } from '../types';

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 КБ';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function stripTelegramHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/blockquote>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPeriodSuffix(period?: string): string {
  if (!period) return '/ мес';
  const p = String(period).toLowerCase().trim();
  if (p === 'week' || p === '1_week') return '/ нед';
  if (p === 'month' || p === '1_month') return '/ мес';
  if (p === '3months' || p === '3_months') return '/ 3 мес';
  if (p === 'year' || p === '1_year') return '/ год';

  const match = p.match(/\d+/);
  const num = match ? match[0] : '1';
  if (p.includes('day') || p.includes('дн') || p.includes('ден')) return `/ ${num} дн`;
  if (p.includes('week') || p.includes('нед')) return `/ ${num} нед`;
  if (p.includes('month') || p.includes('мес')) return `/ ${num} мес`;
  if (p.includes('year') || p.includes('год') || p.includes('лет')) return `/ ${num} г`;
  return '/ мес';
}

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs >= 11 && abs <= 19) return `${n} ${many}`;
  if (rem === 1) return `${n} ${one}`;
  if (rem >= 2 && rem <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function formatBillingPeriod(period?: string): { label: string; suffix: string; daysDesc: string } {
  if (!period) {
    return { label: '1 месяц', suffix: '/ мес', daysDesc: 'каждые 30 дней' };
  }
  const p = String(period).toLowerCase().trim();
  if (p === 'week' || p === '1_week' || p === '7_days') {
    return { label: '1 неделя', suffix: '/ нед', daysDesc: 'каждые 7 дней' };
  }
  if (p === 'month' || p === '1_month' || p === '30_days') {
    return { label: '1 месяц', suffix: '/ мес', daysDesc: 'каждые 30 дней' };
  }
  if (p === '3months' || p === '3_months' || p === '90_days') {
    return { label: '3 месяца', suffix: '/ 3 мес', daysDesc: 'каждые 90 дней' };
  }
  if (p === 'year' || p === '1_year' || p === '12_months' || p === '365_days') {
    return { label: '1 год', suffix: '/ год', daysDesc: 'каждые 365 дней' };
  }

  const match = p.match(/\d+/);
  const val = match ? parseInt(match[0], 10) : 1;

  if (p.includes('day') || p.includes('дн') || p.includes('ден')) {
    return {
      label: pluralizeRu(val, 'день', 'дня', 'дней'),
      suffix: `/ ${val} дн`,
      daysDesc: `каждые ${pluralizeRu(val, 'день', 'дня', 'дней')}`,
    };
  }

  if (p.includes('week') || p.includes('нед')) {
    const totalDays = val * 7;
    return {
      label: pluralizeRu(val, 'неделя', 'недели', 'недель'),
      suffix: `/ ${val} нед`,
      daysDesc: `каждые ${pluralizeRu(totalDays, 'день', 'дня', 'дней')}`,
    };
  }

  if (p.includes('month') || p.includes('мес')) {
    if (val === 12) {
      return { label: '1 год', suffix: '/ год', daysDesc: 'каждые 365 дней' };
    }
    const totalDays = val * 30;
    return {
      label: pluralizeRu(val, 'месяц', 'месяца', 'месяцев'),
      suffix: `/ ${val} мес`,
      daysDesc: `каждые ${pluralizeRu(totalDays, 'день', 'дня', 'дней')}`,
    };
  }

  if (p.includes('year') || p.includes('год') || p.includes('лет')) {
    const totalDays = val * 365;
    return {
      label: pluralizeRu(val, 'год', 'года', 'лет'),
      suffix: val === 1 ? '/ год' : `/ ${val} г`,
      daysDesc: `каждые ${pluralizeRu(totalDays, 'день', 'дня', 'дней')}`,
    };
  }

  return { label: '1 месяц', suffix: '/ мес', daysDesc: 'каждые 30 дней' };
}

export function parsePeriodIntoUnitAndValue(period?: string): { value: number; unit: 'day' | 'week' | 'month' } {
  if (!period) return { value: 1, unit: 'month' };
  const p = String(period).toLowerCase().trim();
  if (p === 'week' || p === '1_week' || p === '7_days') return { value: 1, unit: 'week' };
  if (p === 'month' || p === '1_month' || p === '30_days') return { value: 1, unit: 'month' };
  if (p === '3months' || p === '3_months' || p === '90_days') return { value: 3, unit: 'month' };
  if (p === 'year' || p === '1_year' || p === '12_months' || p === '365_days') return { value: 12, unit: 'month' };

  const match = p.match(/\d+/);
  const val = match ? parseInt(match[0], 10) : 1;

  if (p.includes('day') || p.includes('дн') || p.includes('ден')) {
    return { value: val, unit: 'day' };
  }
  if (p.includes('week') || p.includes('нед')) {
    return { value: val, unit: 'week' };
  }
  if (p.includes('month') || p.includes('мес')) {
    return { value: val, unit: 'month' };
  }
  if (p.includes('year') || p.includes('год') || p.includes('лет')) {
    return { value: val * 12, unit: 'month' };
  }
  return { value: val, unit: 'month' };
}

export function buildBillingPeriod(value: number, unit: 'day' | 'week' | 'month'): string {
  const v = Math.max(1, Math.round(value || 1));
  if (unit === 'day') {
    return v === 1 ? '1_day' : `${v}_days`;
  }
  if (unit === 'week') {
    return v === 1 ? '1_week' : `${v}_weeks`;
  }
  return v === 1 ? '1_month' : `${v}_months`;
}

export function toBackendPayload(item: TariffItem) {
  const isSubscription = item.paymentType === 'subscription';
  let recurringPeriod: string | undefined = undefined;
  if (isSubscription) {
    if (item.billingPeriod === 'week') recurringPeriod = '1_week';
    else if (item.billingPeriod === '3months') recurringPeriod = '3_months';
    else if (item.billingPeriod === 'year') recurringPeriod = '1_year';
    else if (item.billingPeriod === 'month') recurringPeriod = '1_month';
    else recurringPeriod = item.billingPeriod || '1_month';
  }

  return {
    name: item.name,
    description: item.description || undefined,
    price: item.price,
    paymentType: isSubscription ? 'recurring' : 'one_time',
    recurringPeriod,
    salesMode: item.salesMode === 'application' ? 'manual' : item.salesMode,
    isActive: item.isActiveInFunnel,
    oldPrice: item.oldPrice !== undefined ? item.oldPrice : undefined,
    managerUrl: item.managerUrl || undefined,
    buttonText: item.buttonText || undefined,
    mediaType: item.mediaType || undefined,
    mediaFileId: item.mediaFileId || undefined,
    mediaAssetId: item.mediaAssetId || undefined,
    mediaAssets: item.mediaAssets || undefined,
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
  let billingPeriod: BillingPeriod = '1_month';
  if (recPeriod === '1_week' || recPeriod === 'week') billingPeriod = '1_week';
  else if (recPeriod === '3_months' || recPeriod === '3months') billingPeriod = '3_months';
  else if (recPeriod === '1_year' || recPeriod === 'year') billingPeriod = '1_year';
  else if (recPeriod === '1_month' || recPeriod === 'month') billingPeriod = '1_month';
  else if (recPeriod) billingPeriod = recPeriod;

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
    oldPrice:
      raw.oldPrice !== undefined && raw.oldPrice !== null
        ? Number(raw.oldPrice)
        : raw.old_price !== undefined && raw.old_price !== null
        ? Number(raw.old_price)
        : null,
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
    managerUrl: (raw.manager_url as string) || (raw.managerUrl as string) || null,
    buttonText: (raw.button_text as string) || (raw.buttonText as string) || null,
    mediaType: (raw.media_type as 'photo' | 'video') || (raw.mediaType as 'photo' | 'video') || null,
    mediaFileId: (raw.media_file_id as string) || (raw.mediaFileId as string) || null,
    mediaAssetId: (raw.media_asset_id as string) || (raw.mediaAssetId as string) || null,
    mediaAssets: (raw.media_assets as import('../types').NodeMediaAsset[]) || (raw.mediaAssets as import('../types').NodeMediaAsset[]) || undefined,
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

  const isSub = item.paymentType === 'subscription';

  return {
    id: item.id,
    name: item.name,
    price: item.price,
    oldPrice: item.oldPrice,
    description: item.description && item.description.trim() ? item.description : '',
    managerUrl: item.managerUrl || null,
    buttonText: item.buttonText || null,
    salesMode: item.salesMode,
    hasDelivery: Boolean(item.deliverables && item.deliverables.length > 0),
    actionType,
    actionData,
    chatType,
    mediaType: item.mediaType || null,
    mediaFileId: item.mediaFileId || null,
    mediaAssetId: item.mediaAssetId || null,
    mediaAssets: item.mediaAssets || null,
    installments: isSub,
    paymentType: isSub ? 'recurring' : 'one_time',
    payment_type: isSub ? 'recurring' : 'one_time',
    recurringPeriod: isSub ? item.billingPeriod : undefined,
    recurring_period: isSub ? item.billingPeriod : undefined,
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

  const rawSales = (t as unknown as Record<string, unknown>).salesMode || t.salesMode;
  const salesMode: 'auto' | 'application' | 'hybrid' =
    rawSales === 'manual' || rawSales === 'application'
      ? 'application'
      : rawSales === 'hybrid'
      ? 'hybrid'
      : 'auto';

  const isRecurring =
    Boolean(t.installments) ||
    t.paymentType === 'recurring' ||
    t.payment_type === 'recurring' ||
    t.paymentType === 'subscription';

  const rawRec = t.recurringPeriod || t.recurring_period;
  let billingPeriod: BillingPeriod | undefined = undefined;
  if (isRecurring) {
    billingPeriod = rawRec ? String(rawRec) : '1_month';
  }

  return {
    id: String(t.id || `t_${idx}`),
    name: t.name || `Тариф ${idx + 1}`,
    price: typeof t.price === 'number' ? t.price : Number(t.price) || 0,
    oldPrice: t.oldPrice ? Number(t.oldPrice) : null,
    paymentType: isRecurring ? 'subscription' : 'one_time',
    billingPeriod,
    salesMode,
    isActiveInFunnel: true,
    buyersCount: 0,
    revenue: 0,
    description: t.description,
    managerUrl: t.managerUrl || null,
    buttonText: t.buttonText || null,
    mediaType: t.mediaType || null,
    mediaFileId: t.mediaFileId || null,
    mediaAssetId: t.mediaAssetId || null,
    mediaAssets: t.mediaAssets || undefined,
    deliverables,
  };
}
