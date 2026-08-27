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
  UserPlus,
  ChevronDown,
  Check,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  onChange: (type: DeliveryType, clearValue?: boolean) => void;
  deliveryValue: string;
  onDeliveryValueChange: (value: string) => void;
  chatAccessMode?: string;
  onChatAccessModeChange: (mode: string) => void;
  onChatTypeChange?: (chatType: 'channel' | 'group' | 'supergroup' | undefined) => void;
  onBatchUpdate?: (deliveryValue: string, chatType: 'channel' | 'group' | 'supergroup' | undefined) => void;
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
  onChatTypeChange,
  onBatchUpdate,
  botId,
}: DeliverySelectorProps) => {
  const [connectedChats, setConnectedChats] = useState<ConnectedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-chat verification state
  const [verifyStates, setVerifyStates] = useState<Record<string, ChatVerifyState>>({});
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);

  // Parse selected chat IDs from deliveryValue
  const selectedIds = useMemo(() => parseSelectedIds(deliveryValue), [deliveryValue]);

  // Clear legacy URL on mount
  useEffect(() => {
    if (value === 'invite' && (deliveryValue || '').trim() === LEGACY_TEST_ACCESS_URL) {
      onDeliveryValueChange('');
      onChatTypeChange?.(undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConnectedChats = useCallback(async () => {
    if (!botId) return;
    setIsLoadingChats(true);
    setLoadError(null);
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.getConnectedChats(botId);
      setConnectedChats(result.chats as ConnectedChat[]);
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
  const toggleChat = (chat: ConnectedChat, e: React.MouseEvent) => {
    e.stopPropagation();
    const isSelected = selectedIds.includes(chat.chatId);
    let newIds: string[];
    if (isSelected) {
      newIds = selectedIds.filter(id => id !== chat.chatId);
      setVerifyStates(prev => {
        const next = { ...prev };
        delete next[chat.chatId];
        return next;
      });
    } else {
      newIds = [...selectedIds, chat.chatId];
    }
    // Batch both updates together via the combined delivery change
    const newDelivery = newIds.length > 0 ? JSON.stringify(newIds) : '';
    const firstVerifiedType = Object.entries(verifyStates).find(
      ([cid, s]) => newIds.includes(cid) && s.status === 'ok'
    )?.[1].resolvedType;
    const nextChatType = firstVerifiedType ?? (newIds.length > 0 ? chat.chatType : undefined);
    
    if (onBatchUpdate) {
      onBatchUpdate(newDelivery, nextChatType);
    } else {
      onDeliveryValueChange(newDelivery);
      onChatTypeChange?.(nextChatType);
    }
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
      onChatTypeChange?.(firstVerifiedType);
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



  return (
    // stopPropagation so parent onClick wrappers (e.g. setSelectedBlockId) don't swallow our button clicks
    <div className="flex flex-col gap-3" onClick={e => e.stopPropagation()}>
      <label className="text-label">Способ выдачи</label>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface-2)] p-1">
        {options.map(option => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (value !== option.id) {
                  onChange(option.id as DeliveryType, true);
                }
              }}
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
            <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)]">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)] mb-2" />
              <p className="text-[13px] text-[var(--color-foreground-secondary)]">Загружаем подключённые чаты…</p>
            </div>
          ) : loadError ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-[13px] text-[var(--color-danger)] shadow-sm">
              <LockKeyhole size={18} className="shrink-0" />
              <p>{loadError}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connectedChats.length > 0 && (
                <div className="space-y-2">
                  {connectedChats.map(chat => {
                    const isChecked = selectedIds.includes(chat.chatId);
                    const vs = verifyStates[chat.chatId];
                    return (
                      <div
                        key={chat.id}
                        className={`rounded-xl border transition-all duration-200 ${
                          isChecked
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]/20'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]'
                        }`}
                      >
                        {/* Chat row */}
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          {/* Checkbox */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isChecked}
                            onClick={(e) => toggleChat(chat, e)}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                              isChecked
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.3)]'
                                : 'border-[var(--color-border-strong)] bg-[var(--color-surface)]'
                            }`}
                          >
                            {isChecked && <Check size={14} className="text-white" />}
                          </button>
                          
                          {/* Info */}
                          <div
                            className="flex min-w-0 flex-1 flex-col cursor-pointer justify-center"
                            onClick={(e) => toggleChat(chat, e)}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {chat.chatType === 'channel' ? (
                                <Megaphone size={14} className="text-[var(--color-foreground-tertiary)]" />
                              ) : (
                                <Users size={14} className="text-[var(--color-foreground-tertiary)]" />
                              )}
                              <span className="truncate text-[13.5px] font-semibold text-[var(--color-foreground)] leading-tight">
                                {chat.title}
                              </span>
                            </div>
                            <span className="text-[11.5px] text-[var(--color-foreground-secondary)] leading-tight">
                              {chat.chatType === 'channel' ? 'Канал' : 'Группа'}
                            </span>
                          </div>

                          {/* Access Mode Toggle */}
                          {isChecked && chat.chatType !== 'channel' && (() => {
                            let currentMode = 'member';
                            try {
                              const modes = JSON.parse(chatAccessMode || '{}');
                              currentMode = modes[chat.chatId] || 'member';
                            } catch { /* malformed legacy value falls back to member */ }
                            
                            return (
                              <div className="flex items-center rounded-full bg-[var(--color-surface-2)] p-0.5 border border-[var(--color-border)] mr-2" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      const modes = JSON.parse(chatAccessMode || '{}');
                                      modes[chat.chatId] = 'member';
                                      onChatAccessModeChange(JSON.stringify(modes));
                                    } catch {
                                      onChatAccessModeChange(JSON.stringify({ [chat.chatId]: 'member' }));
                                    }
                                  }}
                                  className={`px-3 py-1 text-[11.5px] font-semibold rounded-full transition-all duration-200 ${currentMode === 'member' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-border-strong)]' : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)]'}`}
                                >
                                  Участник
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      const modes = JSON.parse(chatAccessMode || '{}');
                                      modes[chat.chatId] = 'read_only';
                                      onChatAccessModeChange(JSON.stringify(modes));
                                    } catch {
                                      onChatAccessModeChange(JSON.stringify({ [chat.chatId]: 'read_only' }));
                                    }
                                  }}
                                  className={`px-3 py-1 text-[11.5px] font-semibold rounded-full transition-all duration-200 ${currentMode === 'read_only' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-border-strong)]' : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)]'}`}
                                >
                                  Только чтение
                                </button>
                              </div>
                            );
                          })()}

                          {/* Verify button / status */}
                          {isChecked && (
                            <>
                              {!vs || vs.status === 'idle' ? (
                                <button
                                  type="button"
                                  onClick={() => verifyChat(chat)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors"
                                >
                                  <ShieldCheck size={14} />
                                  Проверить
                                </button>
                              ) : vs.status === 'loading' ? (
                                <Loader2 size={16} className="shrink-0 animate-spin text-[var(--color-primary)]" />
                              ) : vs.status === 'ok' ? (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]">
                                  <CheckCircle2 size={16} />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => verifyChat(chat)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--color-danger)] border border-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)] hover:text-white"
                                >
                                  <ShieldCheck size={14} />
                                  Повторить
                                </button>
                              )}
                            </>
                          )}
                          
                        </div>

                        {/* Inline status message */}
                        {isChecked && vs && vs.status === 'ok' && (
                          <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-2.5 text-[12px] bg-[var(--color-success-soft)]/30 text-[var(--color-success)] rounded-b-xl">
                            <CheckCircle2 size={14} className="shrink-0" />
                            <span className="font-medium">{vs.message}</span>
                          </div>
                        )}
                        {isChecked && vs && vs.status === 'error' && (
                          <div className="flex items-start gap-2 border-t border-[var(--color-danger)] px-4 py-2.5 text-[12px] bg-[var(--color-danger-soft)]/50 text-[var(--color-danger)] rounded-b-xl">
                            <LockKeyhole size={14} className="shrink-0 mt-0.5" />
                            <span className="font-medium leading-tight">{vs.message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* HOW TO CONNECT INSTRUCTIONS */}
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsInstructionsOpen(!isInstructionsOpen)}
                  className="w-full bg-[var(--color-surface-2)] px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between hover:bg-[var(--color-border-soft)] transition-colors"
                >
                  <h4 className="text-[13px] font-bold text-[var(--color-foreground)] flex items-center gap-2">
                    <UserPlus size={16} className="text-[var(--color-primary)]" />
                    Как подключить новый чат?
                  </h4>
                  <ChevronDown
                    size={16}
                    className="text-[var(--color-foreground-tertiary)] transition-transform duration-200"
                    style={{ transform: isInstructionsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isInstructionsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[12px] font-bold text-[var(--color-primary)]">1</div>
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--color-foreground)] mb-0.5">Добавьте бота администратором</p>
                            <p className="text-[12px] text-[var(--color-foreground-secondary)] leading-relaxed">
                              Добавьте вашего бота в нужный канал или группу. В списке прав обязательно включите <strong>Пригласительные ссылки</strong> (Invite Users) и, если нужен режим чтения, <strong>Блокировку пользователей</strong> (Ban/Restrict).<br/>
                              <span className="text-[var(--color-success)] mt-1 inline-block">Бот автоматически пришлёт вам уведомление об успехе.</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[12px] font-bold text-[var(--color-primary)]">2</div>
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--color-foreground)] mb-0.5">Обновите список</p>
                            <p className="text-[12px] text-[var(--color-foreground-secondary)] leading-relaxed">
                              Нажмите кнопку <button type="button" onClick={loadConnectedChats} className="text-[var(--color-primary)] hover:underline font-semibold">Обновить</button> в правом верхнем углу этого блока, и ваш чат появится в списке.
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
