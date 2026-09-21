import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Megaphone,
  Users,
  FileText,
  Link2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Zap,
  UserCheck,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import type {
  TariffItem,
  TariffDeliverable,
  PaymentType,
  SalesMode,
  BillingPeriod,
} from '../../types/tariff';
import { apiService } from '../../services/api';
import { TariffDescriptionEditor } from '../TariffDescriptionEditor';

interface ConnectedChat {
  id: string;
  chatId: string;
  title: string;
  chatType: 'channel' | 'group' | 'supergroup';
}

interface TariffEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tariff: TariffItem) => Promise<void> | void;
  tariff?: TariffItem | null;
  botId: string;
}

let deliverableCounter = 0;
function createDeliverableId(): string {
  deliverableCounter += 1;
  return `del_${Date.now()}_${deliverableCounter}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 КБ';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const BILLING_PERIODS: { id: BillingPeriod; label: string; days: string }[] = [
  { id: 'week', label: '1 неделя', days: 'каждые 7 дней' },
  { id: 'month', label: '1 месяц', days: 'каждые 30 дней' },
  { id: '3months', label: '3 месяца', days: 'каждые 90 дней' },
  { id: 'year', label: '1 год', days: 'каждые 365 дней' },
];

const SALES_MODES: {
  id: SalesMode;
  label: string;
  icon: typeof Zap;
  description: string;
}[] = [
  {
    id: 'auto',
    label: 'Автопродажа',
    icon: Zap,
    description:
      'Клиент оплачивает онлайн через подключённую кассу и бот автоматически выдаёт доступ к материалам.',
  },
  {
    id: 'application',
    label: 'Через менеджера',
    icon: UserCheck,
    description:
      'Вместо онлайн-оплаты бот выводит кнопку связи с менеджером для консультации или выставления счёта вручную.',
  },
  {
    id: 'hybrid',
    label: 'Гибрид',
    icon: Layers,
    description:
      'Клиент получает две кнопки: моментальная онлайн-оплата картой и связь с менеджером для консультации.',
  },
];

interface TariffEditorFormProps {
  onClose: () => void;
  onSave: (tariff: TariffItem) => Promise<void> | void;
  tariff?: TariffItem | null;
  botId: string;
}

function TariffEditorForm({
  onClose,
  onSave,
  tariff,
  botId,
}: TariffEditorFormProps) {
  const isEditing = Boolean(tariff);

  const [name, setName] = useState(tariff?.name || '');
  const [description, setDescription] = useState(tariff?.description || '');
  const [price, setPrice] = useState(
    tariff?.price !== undefined && tariff.price !== null ? String(tariff.price) : ''
  );
  const [oldPrice, setOldPrice] = useState(tariff?.oldPrice ? String(tariff.oldPrice) : '');
  const [paymentType, setPaymentType] = useState<PaymentType>(tariff?.paymentType || 'subscription');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(tariff?.billingPeriod || 'month');
  const [salesMode, setSalesMode] = useState<SalesMode>(tariff?.salesMode || 'auto');
  const [isActiveInFunnel, setIsActiveInFunnel] = useState(tariff?.isActiveInFunnel !== false);
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(tariff?.mediaType || null);
  const [mediaFileId, setMediaFileId] = useState<string | null>(tariff?.mediaFileId || null);
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(tariff?.mediaAssetId || null);

  const [deliverables, setDeliverables] = useState<TariffDeliverable[]>(() =>
    tariff?.deliverables ? [...tariff.deliverables] : []
  );

  // Deliverables Sub-Modal State
  const [isDeliverableModalOpen, setIsDeliverableModalOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'menu' | 'channel' | 'group' | 'link'>('menu');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connected Chats
  const [connectedChats, setConnectedChats] = useState<ConnectedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);

  // Custom link sub-view
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  // File upload state
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Validation
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDeliverableModalOpen) {
          setIsDeliverableModalOpen(false);
          setPickerStep('menu');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isDeliverableModalOpen]);

  // Load connected chats
  const loadConnectedChats = async () => {
    if (!botId) return;
    setIsLoadingChats(true);
    setChatLoadError(null);
    try {
      const res = await apiService.getConnectedChats(botId);
      setConnectedChats(Array.isArray(res?.chats) ? (res.chats as ConnectedChat[]) : []);
    } catch (err) {
      setChatLoadError(err instanceof Error ? err.message : 'Не удалось загрузить чаты');
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleOpenDeliverablesModal = () => {
    setPickerStep('menu');
    setIsDeliverableModalOpen(true);
  };

  const handleSelectChatType = (type: 'channel' | 'group') => {
    setPickerStep(type);
    void loadConnectedChats();
  };

  const handleSelectChat = (chat: ConnectedChat) => {
    const isChannel = chat.chatType === 'channel';
    if (deliverables.some((d) => d.chatId === chat.chatId)) {
      setFormError(`Этот ${isChannel ? 'канал' : 'чат'} уже добавлен в выдачу этого тарифа`);
      setIsDeliverableModalOpen(false);
      setPickerStep('menu');
      return;
    }
    const newDeliverable: TariffDeliverable = {
      id: createDeliverableId(),
      type: isChannel ? 'channel' : 'group',
      title: `${isChannel ? 'Канал' : 'Чат'} «${chat.title}»`,
      chatId: chat.chatId,
      chatType: chat.chatType,
      accessNote: 'Персональная ссылка (1 вход)',
    };
    setDeliverables((prev) => [...prev, newDeliverable]);
    setIsDeliverableModalOpen(false);
    setPickerStep('menu');
  };

  const handleFileClick = () => {
    setIsDeliverableModalOpen(false);
    setPickerStep('menu');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setFormError(null);
    try {
      const res = await apiService.uploadTariffFile(botId, file);
      const newDeliverable: TariffDeliverable = {
        id: createDeliverableId(),
        type: 'file',
        title: file.name,
        fileName: file.name,
        fileSize: file.size,
        fileSizeFormatted: formatFileSize(file.size),
        fileUrl: res.filePath || res.url,
      };
      setDeliverables((prev) => [...prev, newDeliverable]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLink = () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      setLinkError('Введите ссылку');
      return;
    }
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setLinkError('Ссылка должна начинаться с http:// или https://');
      return;
    }
    const title = linkTitle.trim() || trimmedUrl;
    const newDeliverable: TariffDeliverable = {
      id: createDeliverableId(),
      type: 'link',
      title,
      url: trimmedUrl,
    };
    setDeliverables((prev) => [...prev, newDeliverable]);
    setLinkTitle('');
    setLinkUrl('');
    setLinkError('');
    setIsDeliverableModalOpen(false);
    setPickerStep('menu');
  };

  const handleRemoveDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const handleUploadTariffMedia = async (file: File) => {
    if (!botId) return;
    if (file.size > 20 * 1024 * 1024) {
      const sizeMb = Math.round(file.size / (1024 * 1024));
      setFormError(
        `Файл (${sizeMb} МБ) превышает лимит браузера (20 МБ). Большие файлы можно отправить напрямую через Telegram-бота во вкладке «Сценарий».`
      );
      return;
    }
    try {
      const media = await apiService.uploadBotMedia(
        botId,
        `tariff:${tariff?.id || 'new'}`,
        file
      );
      setMediaType((media.mediaType as 'photo' | 'video') || 'photo');
      setMediaFileId(media.fileId);
      setMediaAssetId(media.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось загрузить медиа');
    }
  };

  const handleUploadLargeMedia = (file?: File) => {
    const sizeMb = file ? Math.round(file.size / (1024 * 1024)) : 0;
    setFormError(
      `Файл${sizeMb ? ` (${sizeMb} МБ)` : ''} превышает лимит браузера 20 МБ. Большие видео до 2 ГБ загружаются через Telegram-бота во вкладке «Сценарий».`
    );
  };

  const handleRemoveMedia = () => {
    setMediaType(null);
    setMediaFileId(null);
    setMediaAssetId(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Укажите название тарифа');
      return;
    }

    const parsedPrice = parseFloat(price.replace(/\s+/g, ''));
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setFormError('Укажите корректную стоимость');
      return;
    }

    const parsedOldPrice = oldPrice.trim()
      ? parseFloat(oldPrice.replace(/\s+/g, ''))
      : null;

    if (parsedOldPrice !== null && parsedOldPrice <= parsedPrice) {
      setFormError('Старая цена должна быть больше текущей стоимости');
      return;
    }

    const payload: TariffItem = {
      id: tariff?.id || `t_${Date.now()}`,
      name: trimmedName,
      description: description.trim() || undefined,
      price: parsedPrice,
      oldPrice: parsedOldPrice,
      paymentType,
      billingPeriod: paymentType === 'subscription' ? billingPeriod : undefined,
      salesMode,
      isActiveInFunnel,
      mediaType,
      mediaFileId,
      mediaAssetId,
      buyersCount: tariff?.buyersCount || 0,
      revenue: tariff?.revenue || 0,
      deliverables,
      createdAt: tariff?.createdAt,
      updatedAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка при сохранении тарифа');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-2xl sm:max-w-3xl sm:w-full sm:rounded-[20px]"
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
          <h2 className="truncate text-lg font-bold text-foreground">
            {isEditing ? `Редактирование: ${tariff?.name}` : 'Создание нового тарифа'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-foreground">
          {formError && (
            <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs font-medium text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Name & Prices Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Название тарифа <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="например, VIP-клуб с наставничеством"
                className="h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Цена, ₽ <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="1 990"
                className="font-accent tabular-nums h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-2 block text-sm font-semibold text-fg-secondary">
                Старая цена, ₽ <span className="text-xs font-normal text-fg-tertiary">(зачёркнуто)</span>
              </label>
              <input
                type="text"
                value={oldPrice}
                onChange={(e) => setOldPrice(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="2 990"
                className="font-accent tabular-nums h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* 2. Description (Formatted Telegram Rich Text + Photo/Video) */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">
              Описание тарифа{' '}
              <span className="text-xs font-normal text-fg-tertiary">
                (форматирование Telegram + фото или видео)
              </span>
            </label>
            <TariffDescriptionEditor
              value={description}
              onChange={setDescription}
              botId={botId}
              mediaFileId={mediaFileId}
              mediaAssetId={mediaAssetId}
              mediaType={mediaType}
              onUploadMedia={handleUploadTariffMedia}
              onUploadLargeMedia={handleUploadLargeMedia}
              onRemoveMedia={handleRemoveMedia}
              placeholder="Опишите, что входит в тариф..."
              helperText="Клиент увидит этот текст и медиа в Telegram при выборе тарифа"
              mediaHint="Фото или видео над описанием тарифа в Telegram · до 20 МБ"
            />
          </div>

          {/* 3. Payment Type & Recurring Period */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-foreground">
              Условия оплаты
            </label>
            <div className="flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setPaymentType('one_time')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                  paymentType === 'one_time'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Разовый платёж
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('subscription')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                  paymentType === 'subscription'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Регулярная подписка
              </button>
            </div>

            {paymentType === 'subscription' && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
                <div className="text-xs font-semibold text-foreground">
                  Период списания
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BILLING_PERIODS.map((p) => {
                    const isSelected = billingPeriod === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBillingPeriod(p.id)}
                        className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-xs'
                            : 'border-border bg-card text-fg-secondary hover:border-border-strong hover:text-foreground'
                        }`}
                      >
                        <span>{p.label}</span>
                        <span className="mt-0.5 text-[10px] font-normal opacity-75">
                          {p.days}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs leading-relaxed text-fg-secondary">
                  Автосписание происходит автоматически в соответствии с выбранным периодом. Клиент может в любой момент отменить автопродление в боте без потери оплаченного срока.
                </p>
              </div>
            )}
          </div>

          {/* 4. Sales Mode */}
          <div className="space-y-2.5">
            <label className="block text-sm font-semibold text-foreground">
              Способ продажи тарифа
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SALES_MODES.map((m) => {
                const isSelected = salesMode === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSalesMode(m.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary shadow-xs'
                        : 'border-border bg-card text-fg-secondary hover:border-border-strong hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-fg-secondary">
              {SALES_MODES.find((m) => m.id === salesMode)?.description}
            </div>
          </div>

          {/* 5. Deliverables */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Выдача доступа ({deliverables.length})
              </h3>
              <span className="text-xs text-fg-secondary">Что получит клиент</span>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Existing Deliverables List */}
            {deliverables.length > 0 && (
              <div className="space-y-2">
                {deliverables.map((del) => (
                  <div
                    key={del.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-2xs"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {del.type === 'channel' && <Megaphone className="size-4" />}
                        {del.type === 'group' && <Users className="size-4" />}
                        {del.type === 'file' && <FileText className="size-4" />}
                        {del.type === 'link' && <Link2 className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {del.title}
                        </div>
                        <div className="truncate text-xs text-fg-secondary">
                          {del.type === 'channel' && 'Канал Telegram · персональная ссылка'}
                          {del.type === 'group' && 'Чат / Группа Telegram · персональная ссылка'}
                          {del.type === 'file' && `Файл ${del.fileSizeFormatted ? `· ${del.fileSizeFormatted}` : ''}`}
                          {del.type === 'link' && (del.url || 'Внешняя ссылка')}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDeliverable(del.id)}
                      className="ml-2 flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                      title="Удалить выдачу"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Deliverable Trigger Button */}
            <button
              type="button"
              onClick={handleOpenDeliverablesModal}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus:outline-none"
            >
              <Plus className="size-3.5" />
              Добавить выдачу доступа
            </button>

            {isUploadingFile && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Загрузка файла...</span>
              </div>
            )}
          </div>

          {/* 6. Active in Funnel Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Использовать в воронке продаж
              </div>
              <div className="text-xs text-fg-secondary">
                Тариф будет доступен клиентам на шаге выбора тарифов
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActiveInFunnel}
              onClick={() => setIsActiveInFunnel((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isActiveInFunnel ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isActiveInFunnel ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 z-10 flex shrink-0 justify-end gap-2.5 border-t border-border bg-muted/30 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 rounded-xl px-4 text-xs font-semibold text-fg-secondary transition-colors hover:bg-muted"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Сохранение...
              </>
            ) : (
              'Сохранить тариф'
            )}
          </button>
        </div>
      </motion.div>

      {/* ─── Deliverables Sub-Modal Overlay (Поверх окна) ─── */}
      <AnimatePresence>
        {isDeliverableModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsDeliverableModalOpen(false);
                setPickerStep('menu');
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl text-foreground"
            >
              {/* Menu Step */}
              {pickerStep === 'menu' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Добавить выдачу доступа
                      </h3>
                      <p className="text-xs text-fg-secondary mt-0.5">
                        Выберите, что получит клиент после оплаты или заявки
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDeliverableModalOpen(false)}
                      className="flex size-7 items-center justify-center rounded-full text-fg-secondary hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {/* Channel */}
                    <button
                      type="button"
                      onClick={() => handleSelectChatType('channel')}
                      className="flex w-full items-center gap-3.5 rounded-xl border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Megaphone className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          Канал Telegram
                        </div>
                        <div className="text-xs text-fg-secondary">
                          Бот создаст персональную ссылку на 1 вход в закрытый канал
                        </div>
                      </div>
                    </button>

                    {/* Group */}
                    <button
                      type="button"
                      onClick={() => handleSelectChatType('group')}
                      className="flex w-full items-center gap-3.5 rounded-xl border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                        <Users className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          Группа / Чат Telegram
                        </div>
                        <div className="text-xs text-fg-secondary">
                          Персональная пригласительная ссылка в закрытое сообщество
                        </div>
                      </div>
                    </button>

                    {/* File */}
                    <button
                      type="button"
                      onClick={handleFileClick}
                      className="flex w-full items-center gap-3.5 rounded-xl border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                        <FileText className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          Файл любого формата
                        </div>
                        <div className="text-xs text-fg-secondary">
                          PDF, чек-лист, таблица, архив с загрузкой с устройства
                        </div>
                      </div>
                    </button>

                    {/* Link */}
                    <button
                      type="button"
                      onClick={() => setPickerStep('link')}
                      className="flex w-full items-center gap-3.5 rounded-xl border border-border p-3 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                        <Link2 className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          Внешняя ссылка
                        </div>
                        <div className="text-xs text-fg-secondary">
                          Ссылка на курс, Notion, Google Drive или личный кабинет
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Channel / Group Picker Step */}
              {(pickerStep === 'channel' || pickerStep === 'group') && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPickerStep('menu')}
                      className="flex items-center gap-1 text-xs font-semibold text-fg-secondary hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      Назад
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={loadConnectedChats}
                        disabled={isLoadingChats}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <RefreshCw className={`size-3 ${isLoadingChats ? 'animate-spin' : ''}`} />
                        Обновить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeliverableModalOpen(false);
                          setPickerStep('menu');
                        }}
                        className="flex size-7 items-center justify-center rounded-full text-fg-secondary hover:bg-muted"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Выберите {pickerStep === 'channel' ? 'канал' : 'группу'}
                    </h3>
                    <p className="text-xs text-fg-secondary mt-0.5">
                      Бот должен быть администратором с правом приглашения
                    </p>
                  </div>

                  {isLoadingChats ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                  ) : chatLoadError ? (
                    <div className="text-xs text-danger p-3 rounded-xl bg-danger-soft">
                      {chatLoadError}
                    </div>
                  ) : (() => {
                    const availableChats = connectedChats.filter((c) =>
                      pickerStep === 'channel'
                        ? c.chatType === 'channel'
                        : c.chatType === 'group' || c.chatType === 'supergroup'
                    );

                    if (availableChats.length === 0) {
                      const isChannel = pickerStep === 'channel';
                      return (
                        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-xs text-fg-secondary">
                          <p className="font-semibold text-foreground">
                            Подключённые {isChannel ? 'каналы' : 'группы'} не найдены
                          </p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Откройте {isChannel ? 'канал' : 'чат'} в Telegram.</li>
                            <li>
                              Добавьте бота в администраторы с правом добавления участников.
                            </li>
                            <li>Нажмите кнопку «Обновить» выше.</li>
                          </ol>
                        </div>
                      );
                    }

                    return (
                      <div className="max-h-60 space-y-2 overflow-y-auto">
                        {availableChats.map((chat) => (
                          <button
                            key={chat.chatId}
                            type="button"
                            onClick={() => handleSelectChat(chat)}
                            className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                          >
                            <span className="text-sm font-medium text-foreground truncate">
                              {chat.title}
                            </span>
                            <span className="text-xs font-semibold text-primary shrink-0 ml-2">
                              Выбрать →
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Link Step */}
              {pickerStep === 'link' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPickerStep('menu')}
                      className="flex items-center gap-1 text-xs font-semibold text-fg-secondary hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeliverableModalOpen(false);
                        setPickerStep('menu');
                      }}
                      className="flex size-7 items-center justify-center rounded-full text-fg-secondary hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Добавить ссылку
                    </h3>
                    <p className="text-xs text-fg-secondary mt-0.5">
                      Укажите название и адрес внешней ссылки
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Название ссылки
                      </label>
                      <input
                        type="text"
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                        placeholder="например, База знаний или Личный кабинет"
                        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        URL ссылки <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        value={linkUrl}
                        onChange={(e) => {
                          setLinkUrl(e.target.value);
                          if (linkError) setLinkError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLink();
                          }
                        }}
                        placeholder="https://example.com/course"
                        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      {linkError && (
                        <span className="mt-1 block text-xs text-danger">
                          {linkError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPickerStep('menu')}
                      className="h-9 rounded-xl px-3 text-xs font-semibold text-fg-secondary hover:bg-muted"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover shadow-xs"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TariffEditorModal({
  isOpen,
  onClose,
  onSave,
  tariff,
  botId,
}: TariffEditorModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <TariffEditorForm
          key={tariff?.id || 'new'}
          onClose={onClose}
          onSave={onSave}
          tariff={tariff}
          botId={botId}
        />
      )}
    </AnimatePresence>
  );
}
