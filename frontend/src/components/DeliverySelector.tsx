import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileBox, Info, Link2, Loader2, LockKeyhole, MailPlus, RefreshCw, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { DeliveryType } from '../types';

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

export const DeliverySelector = ({ value, onChange, deliveryValue, onDeliveryValueChange, chatAccessMode = 'member', onChatAccessModeChange, chatType, onChatTypeChange, botId }: DeliverySelectorProps) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verification, setVerification] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [connectedChats, setConnectedChats] = useState<Array<{ id: string; chatId: string; title: string; chatType: 'channel' | 'group' | 'supergroup' }>>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  // Old funnel drafts contained a demo URL in the group-delivery field. It is
  // neither a Telegram chat nor a valid target, so never let it be verified.
  useEffect(() => {
    if (value === 'invite' && deliveryValue.trim() === LEGACY_TEST_ACCESS_URL) {
      onDeliveryValueChange('');
      onChatTypeChange(undefined);
    }
  }, [deliveryValue, onChatTypeChange, onDeliveryValueChange, value]);

  const loadConnectedChats = useCallback(async () => {
    if (!botId) return;
    setIsLoadingChats(true);
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.getConnectedChats(botId);
      setConnectedChats(result.chats);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Не удалось загрузить подключённые чаты.');
    } finally {
      setIsLoadingChats(false);
    }
  }, [botId]);

  // Do not make a user guess that they first need to refresh the list: load
  // saved /connect targets immediately when this delivery method is selected.
  useEffect(() => {
    if (value !== 'invite') return;
    const timerId = window.setTimeout(() => void loadConnectedChats(), 0);
    return () => window.clearTimeout(timerId);
  }, [loadConnectedChats, value]);

  const verifyChat = async () => {
    if (!botId || !deliveryValue.trim()) {
      setVerificationError('Сначала выберите подключённый канал или группу.');
      return;
    }
    setIsVerifying(true);
    setVerification(null);
    setVerificationError(null);
    try {
      const { apiService } = await import('../services/api');
      const result = await apiService.verifyChatDelivery(botId, deliveryValue, chatAccessMode);
      const resolvedType = result.chatType as 'channel' | 'group' | 'supergroup';
      onChatTypeChange(resolvedType);
      setVerification(`${result.chatTitle} · доступ бота подтверждён`);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Не удалось проверить права бота.');
    } finally {
      setIsVerifying(false);
    }
  };

  const typeLabel = chatType === 'channel' ? 'канал' : chatType === 'supergroup' ? 'супергруппа' : 'группа';

  return (
    <div className="flex flex-col gap-3">
      <label className="text-label">Способ выдачи</label>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-surface-2)] p-1">
        {options.map((option) => {
          const selected = value === option.id;
          return <button key={option.id} type="button" aria-pressed={selected} onClick={() => { onChange(option.id); if (option.id === 'invite' && deliveryValue.trim().startsWith('http')) { onDeliveryValueChange(''); onChatTypeChange(undefined); } setVerification(null); setVerificationError(null); }} className={`flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-[11px] transition-colors sm:text-[12px] ${selected ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-primary)]' : 'text-[var(--color-foreground-secondary)] hover:text-[var(--color-foreground)]'}`}><option.icon size={14} /><span className="truncate">{option.label}</span></button>;
        })}
      </div>

      {value === 'link' && <input type="url" placeholder="Вставьте ссылку для покупателя" value={deliveryValue} onChange={(event) => onDeliveryValueChange(event.target.value)} className="input w-full" />}

      {value === 'invite' && <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-start gap-2 text-[12px] text-[var(--color-foreground-secondary)]"><Info size={15} className="mt-0.5 shrink-0 text-[var(--color-primary)]" /><p>После оплаты бот создаст персональную одноразовую ссылку. Сначала проверим, куда бот может приглашать покупателя.</p></div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2"><label className="text-label">Подключённые каналы и группы</label><button type="button" onClick={loadConnectedChats} disabled={isLoadingChats} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-primary)]"><RefreshCw size={14} className={isLoadingChats ? 'animate-spin' : ''} />Обновить</button></div>
          {isLoadingChats ? <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-[12px] text-[var(--color-foreground-secondary)]">Загружаем подключённые чаты…</p> : connectedChats.length > 0 ? <div className="space-y-1.5">{connectedChats.map((chat) => <button key={chat.id} type="button" onClick={() => { onDeliveryValueChange(chat.chatId); onChatTypeChange(chat.chatType); setVerification(null); setVerificationError(null); }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${deliveryValue === chat.chatId ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-[var(--color-foreground)]">{chat.title}</span><span className="text-[11px] text-[var(--color-foreground-secondary)]">{chat.chatType === 'channel' ? 'Канал' : 'Группа'}</span></span><CheckCircle2 size={15} className="shrink-0 text-[var(--color-primary)]" /></button>)}</div> : <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-[12px] leading-relaxed text-[var(--color-foreground-secondary)]">Добавьте бота администратором нужного канала или группы и дайте ему право приглашать пользователей. Затем отправьте <code>/connect</code> в этот чат и нажмите «Обновить».</p>}
        </div>

        {deliveryValue && <button type="button" disabled={isVerifying} onClick={verifyChat} className="btn btn-secondary w-full text-[12px]">{isVerifying ? <Loader2 className="animate-spin" size={15} /> : <ShieldCheck size={15} />}<span>Проверить права бота в выбранном чате</span></button>}

        {chatType && <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-foreground-secondary)]">Тип: <b className="text-[var(--color-foreground)]">{typeLabel}</b>. Ссылка одноразовая и не имеет срока действия.</div>}
        {chatType === 'supergroup' && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-2.5 ${chatAccessMode === 'member' ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}><input className="sr-only" type="radio" checked={chatAccessMode === 'member'} onChange={() => onChatAccessModeChange('member')} /><span className="block text-[12px] font-semibold text-[var(--color-foreground)]">Участник</span><span className="mt-0.5 block text-[11px] text-[var(--color-foreground-secondary)]">Обычный доступ в группу</span></label>
          <label className={`cursor-pointer rounded-lg border p-2.5 ${chatAccessMode === 'read_only' ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}><input className="sr-only" type="radio" checked={chatAccessMode === 'read_only'} onChange={() => onChatAccessModeChange('read_only')} /><span className="block text-[12px] font-semibold text-[var(--color-foreground)]">Только чтение</span><span className="mt-0.5 block text-[11px] text-[var(--color-foreground-secondary)]">Бот ограничит сообщения после вступления</span></label>
        </div>}
        {verification && <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-success)]"><CheckCircle2 size={15} />{verification}</p>}
        {verificationError && <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-danger)]"><LockKeyhole size={15} />{verificationError}</p>}
      </section>}

      {value === 'file' && <p className="rounded-xl border border-dashed border-[var(--color-border-strong)] p-3 text-center text-[12px] text-[var(--color-foreground-secondary)]">Выдача файла настраивается через синхронизированное медиа воронки.</p>}
    </div>
  );
};
