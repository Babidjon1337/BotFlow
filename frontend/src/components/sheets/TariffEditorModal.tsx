import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  ChevronDown,
  Megaphone,
  Users,
  FileText,
  Link2,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type {
  TariffItem,
  TariffDeliverable,
  PaymentType,
  SalesMode,
  BillingPeriod,
} from '../../types/tariff';
import { apiService } from '../../services/api';

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
  const [price, setPrice] = useState(tariff?.price ? String(tariff.price) : '');
  const [oldPrice, setOldPrice] = useState(tariff?.oldPrice ? String(tariff.oldPrice) : '');
  const [paymentType, setPaymentType] = useState<PaymentType>(tariff?.paymentType || 'subscription');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(tariff?.billingPeriod || 'month');
  const [salesMode, setSalesMode] = useState<SalesMode>(tariff?.salesMode || 'auto');
  const [isActiveInFunnel, setIsActiveInFunnel] = useState(tariff?.isActiveInFunnel !== false);
  const [deliverables, setDeliverables] = useState<TariffDeliverable[]>(() =>
    tariff?.deliverables ? [...tariff.deliverables] : []
  );

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat picker sub-view
  const [chatPickerOpen, setChatPickerOpen] = useState<'channel' | 'group' | null>(null);
  const [connectedChats, setConnectedChats] = useState<ConnectedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);

  // Custom link sub-view
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  // File upload state
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Validation
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Load connected chats when picker is opened
  const loadConnectedChats = async () => {
    if (!botId) return;
    setIsLoadingChats(true);
    setChatLoadError(null);
    try {
      const res = await apiService.getConnectedChats(botId);
      setConnectedChats(res.chats as ConnectedChat[]);
    } catch (err) {
      setChatLoadError(err instanceof Error ? err.message : 'Не удалось загрузить чаты');
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleOpenChatPicker = (type: 'channel' | 'group') => {
    setIsDropdownOpen(false);
    setChatPickerOpen(type);
    void loadConnectedChats();
  };

  const handleSelectChat = (chat: ConnectedChat) => {
    const isChannel = chat.chatType === 'channel';
    const newDeliverable: TariffDeliverable = {
      id: createDeliverableId(),
      type: isChannel ? 'channel' : 'group',
      title: `${isChannel ? 'Канал' : 'Чат'} «${chat.title}»`,
      chatId: chat.chatId,
      chatType: chat.chatType,
      accessNote: 'Персональная ссылка (1 вход)',
    };
    setDeliverables((prev) => [...prev, newDeliverable]);
    setChatPickerOpen(null);
  };

  const handleFileClick = () => {
    setIsDropdownOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    try {
      let fileUrl: string | undefined;
      let fileId: string | undefined;

      try {
        const uploadRes = await apiService.uploadTariffFile(botId, file);
        fileUrl = uploadRes.url;
        fileId = uploadRes.id;
      } catch {
        // Fallback: file noted locally
      }

      const newDeliverable: TariffDeliverable = {
        id: createDeliverableId(),
        type: 'file',
        title: `Файл «${file.name}»`,
        fileName: file.name,
        fileSize: file.size,
        fileSizeFormatted: formatFileSize(file.size),
        fileUrl,
        fileId,
      };
      setDeliverables((prev) => [...prev, newDeliverable]);
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
    const finalUrl = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
    const newDeliverable: TariffDeliverable = {
      id: createDeliverableId(),
      type: 'link',
      title: linkTitle.trim() || 'Ссылка на доступ',
      url: finalUrl,
      accessNote: 'Внешняя ссылка',
    };
    setDeliverables((prev) => [...prev, newDeliverable]);
    setLinkTitle('');
    setLinkUrl('');
    setLinkError('');
    setLinkModalOpen(false);
  };

  const handleRemoveDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Укажите название тарифа');
      return;
    }

    const cleanPrice = Number(price.toString().replace(/\s+/g, ''));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setFormError('Укажите корректную стоимость тарифа (больше 0 ₽)');
      return;
    }

    let cleanOldPrice: number | null = null;
    if (oldPrice.trim()) {
      const parsedOldPrice = Number(oldPrice.replace(/\s+/g, ''));
      if (!isNaN(parsedOldPrice) && parsedOldPrice > 0) {
        cleanOldPrice = parsedOldPrice;
      }
    }

    const tariffItem: TariffItem = {
      id: tariff?.id || `t_${Date.now()}`,
      name: trimmedName,
      price: cleanPrice,
      oldPrice: cleanOldPrice,
      paymentType,
      billingPeriod: paymentType === 'subscription' ? billingPeriod : undefined,
      salesMode,
      isActiveInFunnel,
      buyersCount: tariff?.buyersCount ?? 0,
      revenue: tariff?.revenue ?? 0,
      deliverables,
      createdAt: tariff?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSave(tariffItem);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось сохранить тариф');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-2xl sm:w-[560px] sm:rounded-[20px]"
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

          {/* 1. Name */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">
              Название тарифа <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="например, VIP-клуб с наставничеством"
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 2. Price & Old Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Цена, ₽ <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="1 990"
                className="font-accent h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-fg-secondary">
                Старая цена, ₽ <span className="text-xs font-normal text-fg-tertiary">(зачёркнуто)</span>
              </label>
              <input
                type="text"
                value={oldPrice}
                onChange={(e) => setOldPrice(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="2 990"
                className="font-accent h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-fg-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* 3. Payment Type */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">
              Условия оплаты
            </label>
            <div className="mb-3 flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setPaymentType('one_time')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  paymentType === 'one_time'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Разовый платёж
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('subscription')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  paymentType === 'subscription'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Регулярная подписка
              </button>
            </div>

            {paymentType === 'subscription' && (
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <label className="mb-2 block text-xs font-medium text-fg-secondary">
                  Период списания
                </label>
                <div className="relative">
                  <select
                    value={billingPeriod}
                    onChange={(e) => setBillingPeriod(e.target.value as BillingPeriod)}
                    className="h-11 w-full appearance-none rounded-xl border border-border bg-card px-4 pr-10 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="month">Каждый месяц (30 дней)</option>
                    <option value="week">1 неделя (7 дней)</option>
                    <option value="3months">3 месяца</option>
                    <option value="year">1 год</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-fg-secondary">
                  Автосписание происходит автоматически в соответствии с выбранным периодом. Клиент может в любой момент отменить автопродление в боте без потери оплаченного срока.
                </p>
              </div>
            )}
          </div>

          {/* 4. Sales Mode */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">
              Способ продажи тарифа
            </label>
            <div className="flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setSalesMode('auto')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  salesMode === 'auto'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Автопродажа (онлайн)
              </button>
              <button
                type="button"
                onClick={() => setSalesMode('application')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  salesMode === 'application'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Через менеджера
              </button>
              <button
                type="button"
                onClick={() => setSalesMode('hybrid')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  salesMode === 'hybrid'
                    ? 'bg-card text-purple-600 dark:text-purple-400 shadow-sm'
                    : 'text-fg-secondary hover:text-foreground'
                }`}
              >
                Гибрид
              </button>
            </div>
          </div>

          {/* 5. Deliverables */}
          <div>
            <div className="mb-3 flex items-center justify-between">
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

            {/* List of deliverables */}
            {deliverables.length > 0 && (
              <div className="mb-3 space-y-2">
                {deliverables.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          item.type === 'channel' || item.type === 'group'
                            ? 'bg-primary/10 text-primary'
                            : item.type === 'file'
                            ? 'bg-muted text-fg-secondary'
                            : 'bg-info-soft text-info'
                        }`}
                      >
                        {item.type === 'channel' && <Megaphone className="size-4" />}
                        {item.type === 'group' && <Users className="size-4" />}
                        {item.type === 'file' && <FileText className="size-4" />}
                        {item.type === 'link' && <Link2 className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {item.title}
                          {item.type === 'file' && item.fileSizeFormatted && (
                            <span className="ml-1 text-fg-tertiary">
                              ({item.fileSizeFormatted})
                            </span>
                          )}
                        </div>
                        {item.accessNote && (
                          <div className="text-xs font-medium text-success">
                            {item.accessNote}
                          </div>
                        )}
                        {item.type === 'link' && item.url && (
                          <div className="max-w-[260px] truncate text-xs text-primary sm:max-w-[340px]">
                            {item.url}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDeliverable(item.id)}
                      className="rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                      title="Удалить выдачу"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Deliverable Dropdown Button */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus:outline-none"
              >
                <Plus className="size-4" />
                Добавить выдачу
                <ChevronDown className="ml-1 size-4 text-fg-tertiary" />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1.5 space-y-1 rounded-xl border border-border bg-card p-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={() => handleOpenChatPicker('channel')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Megaphone className="size-4 text-primary" />
                    <span className="flex-1">Канал Telegram</span>
                    <span className="text-xs text-fg-tertiary">Персональная ссылка</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenChatPicker('group')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Users className="size-4 text-primary" />
                    <span className="flex-1">Группа / Чат</span>
                    <span className="text-xs text-fg-tertiary">Персональная ссылка</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFileClick}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <FileText className="size-4 text-fg-secondary" />
                    <span className="flex-1">Файл (PDF, архив и др.)</span>
                    <span className="text-xs text-fg-tertiary">Загрузка с устройства</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setLinkModalOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Link2 className="size-4 text-info" />
                    <span className="flex-1">Ссылка</span>
                    <span className="text-xs text-fg-tertiary">Любой внешний адрес</span>
                  </button>
                </div>
              )}
            </div>

            {/* Chat Picker Inline Panel */}
            {chatPickerOpen && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">
                    Выберите {chatPickerOpen === 'channel' ? 'канал' : 'группу'}
                  </div>
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
                      onClick={() => setChatPickerOpen(null)}
                      className="text-fg-tertiary hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                {isLoadingChats ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : chatLoadError ? (
                  <div className="text-xs text-danger">{chatLoadError}</div>
                ) : connectedChats.length === 0 ? (
                  <div className="space-y-2 text-xs text-fg-secondary">
                    <p>Подключённые чаты не найдены.</p>
                    <p className="rounded-lg bg-card p-3 border border-border">
                      Чтобы добавить канал или группу:
                      <br />1. Откройте чат в Telegram.
                      <br />2. Добавьте бота в администраторы с правом публикации и пригласительных ссылок.
                      <br />3. Нажмите кнопку «Обновить».
                    </p>
                  </div>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {connectedChats
                      .filter((c) =>
                        chatPickerOpen === 'channel'
                          ? c.chatType === 'channel'
                          : c.chatType === 'group' || c.chatType === 'supergroup'
                      )
                      .map((chat) => (
                        <button
                          key={chat.chatId}
                          type="button"
                          onClick={() => handleSelectChat(chat)}
                          className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-muted"
                        >
                          <span className="font-medium text-foreground">{chat.title}</span>
                          <span className="text-xs text-primary">Выбрать →</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Link Input Inline Panel */}
            {linkModalOpen && (
              <div className="mt-3 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Добавление ссылки</span>
                  <button
                    type="button"
                    onClick={() => setLinkModalOpen(false)}
                    className="text-fg-tertiary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-secondary">
                    Название (опционально)
                  </label>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="например, База знаний или Личный кабинет"
                    className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-fg-secondary">
                    URL-адрес ссылки
                  </label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => {
                      setLinkUrl(e.target.value);
                      if (linkError) setLinkError('');
                    }}
                    placeholder="https://example.com/course"
                    className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                  {linkError && <span className="mt-1 text-xs text-danger">{linkError}</span>}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkModalOpen(false)}
                    className="h-8 rounded-lg px-3 text-xs text-fg-secondary hover:bg-muted"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLink}
                    className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-white hover:bg-primary-hover"
                  >
                    Добавить
                  </button>
                </div>
              </div>
            )}

            {isUploadingFile && (
              <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                <Loader2 className="size-4 animate-spin" />
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
        <div className="sticky bottom-0 z-10 flex shrink-0 justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 rounded-xl px-5 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              'Сохранить тариф'
            )}
          </button>
        </div>
      </motion.div>
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
  if (!isOpen) return null;

  return (
    <TariffEditorForm
      key={tariff?.id || 'new'}
      onClose={onClose}
      onSave={onSave}
      tariff={tariff}
      botId={botId}
    />
  );
}
