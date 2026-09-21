import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  ExternalLink,
  CreditCard,
  RotateCcw,
  ReceiptText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Megaphone,
  Users,
  FileText,
  Link2,
  Clock,
  Calendar,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { apiService } from '../../services/api';
import type {
  AudienceLead,
  LeadDetailResponse,
  LeadPaymentDetail,
} from '../../services/api';
import type { TariffItem } from '../../types/tariff';
import { useAlert } from '../AlertProvider';
import { useAppState } from '../../providers/AppStateProvider';
import { mapBackendTariff } from '../../utils/tariffMappers';

interface LeadDetailModalProps {
  isOpen: boolean;
  lead: AudienceLead | null;
  botId: string;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(num?: number | null): string {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return num.toLocaleString('ru-RU');
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  lead,
  botId,
  onClose,
  onLeadUpdated,
}) => {
  const { showConfirm } = useAlert();
  const { setToastMessage, setToastType } = useAppState();

  const [detail, setDetail] = useState<LeadDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions in progress
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(null);

  // Available tariffs for invoice
  const [availableTariffs, setAvailableTariffs] = useState<TariffItem[]>([]);
  const [selectedTariffIds, setSelectedTariffIds] = useState<string[]>([]);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);

  // Load lead details and tariffs
  useEffect(() => {
    if (!isOpen || !lead || !botId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSelectedTariffIds([]);

    // 1. Fetch lead detail
    apiService
      .getLeadDetail(botId, lead.id)
      .then((res) => {
        if (!cancelled) {
          setDetail(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить данные клиента');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // 2. Fetch available tariffs for invoicing
    apiService
      .getTariffs(botId)
      .then((res) => {
        if (cancelled) return;
        const rawList = Array.isArray(res) ? res : res?.tariffs;
        if (Array.isArray(rawList)) {
          const mapped = rawList.map((t, idx) =>
            mapBackendTariff(t as unknown as Record<string, unknown>, idx)
          );
          setAvailableTariffs(mapped);
        }
      })
      .catch(() => {
        // Fallback to empty if tariffs endpoint fails
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, lead, botId]);

  if (!isOpen || !lead) return null;

  const currentLead = detail?.lead || lead;
  const payments = detail?.payments || [];
  const succeededPayments = payments.filter((p) => p.status === 'succeeded');
  const totalPaidSum = detail?.lead?.totalPaid ?? succeededPayments.reduce((sum, p) => sum + p.amount, 0);

  // Handle Refund
  const handleRefund = (payment: LeadPaymentDetail) => {
    showConfirm({
      title: 'Оформить возврат средств?',
      message: `Вы уверены, что хотите вернуть ${formatNumber(payment.amount)} ₽ за тариф «${payment.name}»? Доступ клиента к закрытым чатам и материалам будет отозван.`,
      confirmText: 'Вернуть средства',
      cancelText: 'Отмена',
      onConfirm: async () => {
        setRefundingPaymentId(payment.id);
        try {
          await apiService.refundLeadPayment(botId, lead.id, payment.id);
          setToastType?.('success');
          setToastMessage(`Возврат ${formatNumber(payment.amount)} ₽ успешно оформлен`);

          // Refresh lead detail
          const updated = await apiService.getLeadDetail(botId, lead.id);
          setDetail(updated);
          onLeadUpdated?.();
        } catch (err) {
          setToastType?.('error');
          setToastMessage(err instanceof Error ? err.message : 'Не удалось оформить возврат');
        } finally {
          setRefundingPaymentId(null);
        }
      },
    });
  };

  // Handle Cancel Subscription
  const handleCancelSubscription = (payment: LeadPaymentDetail) => {
    showConfirm({
      title: 'Отменить автосписание?',
      message: `Автопродление подписки «${payment.name}» будет отключено. Клиент сохранит оплаченный доступ до окончания периода.`,
      confirmText: 'Отменить автосписание',
      cancelText: 'Назад',
      onConfirm: async () => {
        setCancellingPaymentId(payment.id);
        try {
          await apiService.cancelLeadSubscription(botId, lead.id, payment.id);
          setToastType?.('success');
          setToastMessage('Автопродление подписки успешно отключено');

          const updated = await apiService.getLeadDetail(botId, lead.id);
          setDetail(updated);
          onLeadUpdated?.();
        } catch (err) {
          setToastType?.('error');
          setToastMessage(err instanceof Error ? err.message : 'Не удалось отменить автосписание');
        } finally {
          setCancellingPaymentId(null);
        }
      },
    });
  };

  // Toggle invoice tariff selection
  const toggleTariffSelect = (tariffId: string) => {
    setSelectedTariffIds((prev) =>
      prev.includes(tariffId) ? prev.filter((id) => id !== tariffId) : [...prev, tariffId]
    );
  };

  // Handle Send Invoice
  const handleSendInvoice = async () => {
    if (selectedTariffIds.length === 0 || isSendingInvoice) return;
    setIsSendingInvoice(true);
    try {
      await apiService.sendInvoice(botId, lead.telegramId, selectedTariffIds);
      setToastType?.('success');
      setToastMessage('Счёт успешно отправлен клиенту в Telegram');
      setSelectedTariffIds([]);

      // Refresh lead details in background
      const updated = await apiService.getLeadDetail(botId, lead.id);
      setDetail(updated);
      onLeadUpdated?.();
    } catch (err) {
      setToastType?.('error');
      setToastMessage(err instanceof Error ? err.message : 'Не удалось отправить счёт');
    } finally {
      setIsSendingInvoice(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border bg-card shadow-2xl sm:max-w-2xl sm:w-full sm:rounded-[24px]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base">
              {(currentLead.firstName || currentLead.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold text-foreground">
                  {currentLead.firstName || currentLead.username || `ID ${currentLead.telegramId}`}
                </h2>
                {currentLead.username && (
                  <a
                    href={`https://t.me/${currentLead.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    title="Открыть в Telegram"
                  >
                    @{currentLead.username}
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <p className="text-xs text-fg-secondary">
                Telegram ID: <span className="font-mono">{currentLead.telegramId}</span> · В боте с {formatDate(currentLead.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-foreground">
          {/* Summary Pills */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-[11px] font-medium text-fg-secondary">Всего покупок</div>
              <div className="font-accent tabular-nums text-lg font-bold text-foreground mt-0.5">
                {succeededPayments.length}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-[11px] font-medium text-fg-secondary">Сумма оплат</div>
              <div className="font-accent tabular-nums text-lg font-bold text-success mt-0.5">
                {formatNumber(totalPaidSum)} ₽
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-medium text-fg-secondary">Шаг в воронке</div>
              <div className="text-xs font-semibold text-foreground truncate mt-1">
                {currentLead.currentStep || 'node_start'}
              </div>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-fg-secondary gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm">Загрузка информации о покупках...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs font-medium text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Купленные тарифы и доступы */}
          {!isLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-fg-secondary flex items-center gap-1.5">
                  <CreditCard size={15} className="text-primary" />
                  Купленные тарифы и история оплат ({payments.length})
                </h3>
              </div>

              {payments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
                  <p className="text-xs text-fg-secondary">
                    У этого клиента пока нет оплаченных тарифов в боте.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map((p) => {
                    const isSucceeded = p.status === 'succeeded';
                    const isRefunded = p.status === 'refunded';
                    const isSub = p.paymentType === 'subscription';
                    const hasAutoRenew = isSub && p.autoRenew !== false;

                    return (
                      <div
                        key={p.id}
                        className={`rounded-2xl border p-4 transition-all ${
                          isSucceeded
                            ? 'border-border bg-card shadow-2xs'
                            : isRefunded
                            ? 'border-danger/30 bg-danger-soft/20'
                            : 'border-border bg-muted/30'
                        }`}
                      >
                        {/* Top: Name & Price & Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="text-sm font-bold text-foreground truncate">
                              {p.name}
                            </h4>
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                              {isSub ? 'Подписка' : 'Разовый платёж'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-accent tabular-nums text-sm font-bold text-foreground">
                              {formatNumber(p.amount)} ₽
                            </span>

                            {isSucceeded && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                                <CheckCircle2 size={11} /> Оплачен
                              </span>
                            )}
                            {isRefunded && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                                <XCircle size={11} /> Возврат
                              </span>
                            )}
                            {!isSucceeded && !isRefunded && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-secondary">
                                <Clock size={11} /> {p.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Date and Details */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} className="text-fg-tertiary" />
                            {formatDate(p.paidAt || p.createdAt)}
                          </span>
                          {p.provider && (
                            <span className="capitalize text-fg-tertiary">
                              Платёжка: {p.provider}
                            </span>
                          )}
                          {isSub && (
                            <span
                              className={`font-medium ${
                                hasAutoRenew ? 'text-success' : 'text-fg-tertiary line-through'
                              }`}
                            >
                              {hasAutoRenew ? '✓ Автосписание активно' : '✕ Автосписание отменено'}
                            </span>
                          )}
                        </div>

                        {/* Deliverables summary */}
                        {p.deliverables && p.deliverables.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-fg-tertiary mr-1">
                              Выдано:
                            </span>
                            {p.deliverables.map((d, dIdx) => (
                              <span
                                key={d.id || dIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-fg-secondary"
                              >
                                {d.type === 'channel' && <Megaphone size={11} className="text-emerald-500" />}
                                {d.type === 'group' && <Users size={11} className="text-blue-500" />}
                                {d.type === 'file' && <FileText size={11} className="text-purple-500" />}
                                {d.type === 'link' && <Link2 size={11} className="text-amber-500" />}
                                <span className="truncate max-w-[150px]">{d.title}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Grants info if revoked or active */}
                        {p.grants && p.grants.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {p.grants.map((g) => (
                              <span
                                key={g.id}
                                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${
                                  g.status === 'revoked'
                                    ? 'bg-danger-soft text-danger'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                <ShieldCheck size={11} />
                                Чат ID {g.chatId}: {g.status === 'revoked' ? 'Доступ отозван' : 'Доступ активен'}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action buttons (Refund / Cancel Subscription) */}
                        {isSucceeded && (
                          <div className="mt-3.5 pt-2.5 border-t border-border flex flex-wrap items-center justify-end gap-2">
                            {/* Cancel auto-renew if subscription is active */}
                            {hasAutoRenew && (
                              <button
                                type="button"
                                disabled={cancellingPaymentId === p.id}
                                onClick={() => handleCancelSubscription(p)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-fg-secondary hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              >
                                {cancellingPaymentId === p.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <RotateCcw size={12} />
                                )}
                                Отменить автосписание
                              </button>
                            )}

                            {/* Refund button */}
                            <button
                              type="button"
                              disabled={refundingPaymentId === p.id}
                              onClick={() => handleRefund(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/30 text-xs font-semibold text-danger hover:bg-danger-soft transition-colors disabled:opacity-50"
                            >
                              {refundingPaymentId === p.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <RotateCcw size={12} />
                              )}
                              Сделать возврат
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Выставить счёт с выбором тарифов */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-fg-secondary flex items-center gap-1.5">
                <ReceiptText size={15} className="text-primary" />
                Выставить счёт клиенту
              </h3>
              <span className="text-xs text-fg-tertiary">
                Бот отправит сообщение с оплатой в Telegram
              </span>
            </div>

            {availableTariffs.length === 0 ? (
              <p className="text-xs text-fg-secondary rounded-xl bg-muted/40 p-3">
                В боте пока нет тарифов. Создайте тариф во вкладке «Тарифы», чтобы выставлять счета клиентам.
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {availableTariffs.map((t) => {
                    const isSelected = selectedTariffIds.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleTariffSelect(t.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all ${
                          isSelected
                            ? 'border-primary bg-primary-soft/30 shadow-2xs ring-1 ring-primary'
                            : 'border-border bg-card hover:border-border-strong hover:bg-muted/40'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {t.name}
                          </p>
                          <p className="text-[11px] text-fg-secondary">
                            {t.paymentType === 'subscription' ? 'Подписка' : 'Разовый'}
                          </p>
                        </div>
                        <div className="font-accent tabular-nums text-xs font-bold text-primary shrink-0">
                          {formatNumber(t.price)} ₽
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-fg-secondary">
                    Выбрано тарифов: <strong>{selectedTariffIds.length}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={selectedTariffIds.length === 0 || isSendingInvoice}
                    onClick={handleSendInvoice}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    {isSendingInvoice ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Отправка...
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        Отправить счёт в Telegram
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex shrink-0 justify-end border-t border-border bg-muted/30 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl px-4 text-xs font-semibold text-fg-secondary transition-colors hover:bg-muted"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </div>
  );
};
