export type DeliverableType = 'channel' | 'group' | 'file' | 'link';

export interface TariffDeliverable {
  id: string;
  type: DeliverableType;
  title: string;
  chatId?: string;
  chatType?: 'channel' | 'group' | 'supergroup';
  accessNote?: string;
  fileName?: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  fileUrl?: string;
  fileId?: string;
  url?: string;
}

export type SalesMode = 'auto' | 'application' | 'hybrid';
export type PaymentType = 'one_time' | 'subscription';
export type BillingPeriod = 'week' | 'month' | '3months' | 'year';

export interface TariffItem {
  id: string;
  name: string;
  price: number;
  oldPrice?: number | null;
  paymentType: PaymentType;
  billingPeriod?: BillingPeriod;
  salesMode: SalesMode;
  isActiveInFunnel: boolean;
  buyersCount: number;
  revenue: number;
  description?: string;
  mediaType?: 'photo' | 'video' | null;
  mediaFileId?: string | null;
  mediaAssetId?: string | null;
  mediaUrl?: string | null;
  deliverables: TariffDeliverable[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TariffMetrics {
  totalCount: number;
  activeInFunnelCount: number;
  buyersCount: number;
  totalRevenue: number;
}
