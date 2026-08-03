import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileBox,
  Info,
  Link2,
  Loader2,
  LockKeyhole,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { DeliveryType } from '../types';

interface ConnectedChat {
  id: string;
  chatId: string;
  title: string;
  chatType: 'channel' | 'group' | 'supergroup';
}

type VerifyStatus = 'idle' | 'loading' | 'ok' | 'error';

interface ChatVerifyState {
  status: VerifyStatus;
  message: string;
  resolvedType?: 'channel' | 'group' | 'supergroup';
}

interface DeliverySelectorProps {
  value: DeliveryType;
  onChange: (type: DeliveryType) => void;
  deliveryValue: string;
  onDeliveryValueChange: (value: string) => void;
  chatAccessMode?: 'member' | 'read_only';
  onChatAccessModeChange: (value: 'member' | 'read_only') => void;
  chatType?: 'channel' | 'group' | 'supergroup';
  onChatTypeChange: (value: 'channel' | 'group' | 'supergroup' | undefined) => void;
  botId?: string;
}

const options: { id: DeliveryType; icon: LucideIcon; label: string }[] = [
  { id: 'link', icon: Link2, label: 'Ссылка' },
  { id: 'invite', icon: MailPlus, label: 'Канал / группа' },
  { id: 'file', icon: FileBox, label: 'Файл' },
];

const LEGACY_TEST_ACCESS_URL = 'https://example.com/test-access';

function parseSelectedIds(deliveryValue: string): string[] {
  if (!deliveryValue) return [];
  try {
    const parsed = JSON.parse(deliveryValue);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // not JSON — treat as single legacy id
  }
  if (deliveryValue === LEGACY_TEST_ACCESS_URL) return [];
  return [deliveryValue];
}

export const DeliverySelector = ({
  value,
  onChange,
  deliveryValue,
  onDeliveryValueChange,
  chatAccessMode = 'member',
  onChatAccessModeChange,
  chatType,
  onChatTypeChange,
  botId,
}: DeliverySelectorProps) => {
  const [connectedChats, setConnectedChats] = useState<ConnectedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-chat verification state
  const [verifyStates, setVerifyStates] = useState<Record<string, ChatVerifyState>>({});

  // Parse selected chat IDs from deliveryValue
  const selectedIds = useMemo(() => parseSelectedIds(deliveryValue), [deliveryValue]);

  // Clear legacy URL on mount
  useEffect(() => {
    if (value === 'invite' && (deliveryValue || '').trim() === LEGACY_TEST_ACCESS_URL) {
      onDeliveryValueChange('');
      onChatTypeChange(undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConnectedChats = useCallback(async () => {
    if (!botId) return;
    setIsLoadingChats(true);
    setLoadError(null);
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.getConnectedChats(botId);
      setConnectedChats(result.chats);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить подключённые чаты.');
    } finally {
      setIsLoadingChats(false);
    }
  }, [botId]);

  // Auto-load when switching to invite tab
  useEffect(() => {
    if (value !== 'invite') return;
    const timerId = window.setTimeout(() => void loadConnectedChats(), 0);
    return () => window.clearTimeout(timerId);
  }, [loadConnectedChats, value]);

  // Toggle a chat in the selection
  const toggleChat = (chat: ConnectedChat) => {
    const isSelected = selectedIds.includes(chat.chatId);
    let newIds: string[];
    if (isSelected) {
      newIds = selectedIds.filter(id => id !== chat.chatId);
      // Clear verify state for this chat
      setVerifyStates(prev => {
        const next = { ...prev };
        delete next[chat.chatId];
        return next;
      });
    } else {
      newIds = [...selectedIds, chat.chatId];
    }
    onDeliveryValueChange(newIds.length > 0 ? JSON.stringify(newIds) : '');

    // Update chatType based on first verified or first selected chat
    const firstVerifiedType = Object.entries(verifyStates).find(
      ([cid, s]) => newIds.includes(cid) && s.status === 'ok'
    )?.[1].resolvedType;
    onChatTypeChange(firstVerifiedType ?? (newIds.length > 0 ? chat.chatType : undefined));
  };

  // Verify a single chat
  const verifyChat = async (chat: ConnectedChat) => {
    if (!botId) return;
    setVerifyStates(prev => ({ ...prev, [chat.chatId]: { status: 'loading', message: '' } }));
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.verifyChatDelivery(botId, chat.chatId, chatAccessMode);
      const resolvedType = result.chatType as 'channel' | 'group' | 'supergroup';
      setVerifyStates(prev => ({
        ...prev,
        [chat.chatId]: { status: 'ok', message: `${result.chatTitle} · доступ подтверждён`, resolvedType },
      }));
      // Set chatType from first verified selected chat
      const firstVerifiedType = resolvedType;
      onChatTypeChange(firstVerifiedType);
    } catch (error) {
      setVerifyStates(prev => ({
        ...prev,
        [chat.chatId]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Не удалось проверить права бота.',
        },
      }));
    }
  };

  // Check if any selected chat is a supergroup (verified)
  const hasSupergroupSelected = selectedIds.some(
    id => verifyStates[id]?.resolvedType === 'supergroup'
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="text-label">Способ выдачи</label>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface-2)] p-1">
        {options.map(option => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => { onChange(option.id); }}
              className={`flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-[11px] transition-colors sm:text-[12px] ${
                selected
                  ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-primary)]'
                  : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'
              }`}
            >
              <option.icon size={14} />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      {value === 'link' && (
        <input
          type="url"
          placeholder="Вставьте ссылку для покупателя"
          value={deliveryValue}
          onChange={e => onDeliveryValueChange(e.target.value)}
          className="input w-full"
        />
      )}

      {value === 'invite' && (
        <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="flex items-start gap-2 text-[12px] text-[var(--color-foreground-secondary)]">
            <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
            <p>
              После оплаты бот пришлёт покупателю персональную одноразовую ссылку в каждый
              выбранный канал или группу. Выберите один или несколько чатов ниже.
            </p>
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-label">Подключённые каналы и группы</label>
            <button
              type="button"
              onClick={loadConnectedChats}
              disabled={isLoadingChats}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-primary)] disabled:opacity-60"
            >
              <RefreshCw size={14} className={isLoadingChats ? 'animate-spin' : ''} />
              Обновить
            </button>
          </div>

          {/* Chat list */}
          {isLoadingChats ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-[12px] text-[var(--color-foreground-secondary)]">
              Загружаем подключённые чаты…
            </p>
          ) : loadError ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-[12px] text-[var(--color-danger)]">
              <LockKeyhole size={14} />
              {loadError}
            </p>
          ) : connectedChats.length > 0 ? (
            <div className="space-y-2">
              {connectedChats.map(chat => {
                const isChecked = selectedIds.includes(chat.chatId);
                const vs = verifyStates[chat.chatId];
                return (
                  <div
                    key={chat.id}
                    className={`rounded-lg border transition-colors ${
                      isChecked
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    {/* Chat row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      {/* Checkbox */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => toggleChat(chat)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isChecked
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                            : 'border-[var(--color-border-strong)] bg-[var(--color-surface)]'
                        }`}
                      >
                        {isChecked && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>

                      {/* Title + type */}
                      <button
                        type="button"
                        onClick={() => toggleChat(chat)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[12px] font-semibold text-[var(--color-foreground)]">
                          {chat.title}
                        </span>
                        <span className="text-[11px] text-[var(--color-foreground-secondary)]">
                          {chat.chatType === 'channel' ? 'Канал' : chat.chatType === 'supergroup' ? 'Супергруппа' : 'Группа'}
                        </span>
                      </button>

                      {/* Verify button / status */}
                      {isChecked && (
                        <>
                          {!vs || vs.status === 'idle' ? (
                            <button
                              type="button"
                              onClick={() => verifyChat(chat)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] border border-[var(--color-border)]"
                            >
                              <ShieldCheck size={12} />
                              Проверить
                            </button>
                          ) : vs.status === 'loading' ? (
                            <Loader2 size={15} className="shrink-0 animate-spin text-[var(--color-primary)]" />
                          ) : vs.status === 'ok' ? (
                            <CheckCircle2 size={15} className="shrink-0 text-[var(--color-success)]" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => verifyChat(chat)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-danger-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)] border border-[var(--color-danger)]"
                            >
                              <ShieldCheck size={12} />
                              Повторить
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Inline status message */}
                    {isChecked && vs && vs.status === 'ok' && (
                      <p className="flex items-center gap-1.5 border-t border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-success)]">
                        <CheckCircle2 size={12} />
                        {vs.message}
                      </p>
                    )}
                    {isChecked && vs && vs.status === 'error' && (
                      <p className="flex items-center gap-1.5 border-t border-[var(--color-danger)] px-3 py-1.5 text-[11px] text-[var(--color-danger)]">
                        <LockKeyhole size={12} />
                        {vs.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">
              Добавьте бота администратором нужного канала или группы и дайте ему право приглашать
              пользователей. Затем отправьте <code>/connect</code> в этот чат и нажмите «Обновить».
            </p>
          )}

          {/* Supergroup access mode — show when any verified selected chat is supergroup */}
          {hasSupergroupSelected && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-lg border p-2.5 ${
                  chatAccessMode === 'member'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  checked={chatAccessMode === 'member'}
                  onChange={() => onChatAccessModeChange('member')}
                />
                <span className="block text-[12px] font-semibold text-[var(--color-foreground)]">Участник</span>
                <span className="mt-0.5 block text-[11px] text-[var(--color-foreground-secondary)]">Обычный доступ в группу</span>
              </label>
              <label
                className={`cursor-pointer rounded-lg border p-2.5 ${
                  chatAccessMode === 'read_only'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  checked={chatAccessMode === 'read_only'}
                  onChange={() => onChatAccessModeChange('read_only')}
                />
                <span className="block text-[12px] font-semibold text-[var(--color-foreground)]">Только чтение</span>
                <span className="mt-0.5 block text-[11px] text-[var(--color-foreground-secondary)]">Бот ограничит сообщения после вступления</span>
              </label>
            </div>
          )}

          {/* Summary of selected */}
          {selectedIds.length > 0 && (
            <p className="text-[11px] text-[var(--color-foreground-secondary)]">
              Выбрано: <b className="text-[var(--color-foreground)]">{selectedIds.length}</b> чат{selectedIds.length === 1 ? '' : selectedIds.length < 5 ? 'а' : 'ов'}.
              После оплаты покупатель получит ссылку в каждый.
            </p>
          )}
        </section>
      )}

      {value === 'file' && (
        <p className="rounded-xl border border-dashed border-[var(--color-border-strong)] p-3 text-center text-[12px] text-[var(--color-foreground-secondary)]">
          Выдача файла настраивается через синхронизированное медиа воронки.
        </p>
      )}
    </div>
  );
};
