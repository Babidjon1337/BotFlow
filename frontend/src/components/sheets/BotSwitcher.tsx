import { motion } from 'framer-motion';
import { Check, Plus, X, Lock } from 'lucide-react';
import type { BotConfig } from '../../types';
import { useAppState } from '../../providers/AppStateProvider';

interface BotSwitcherProps {
  bots: BotConfig[];
  activeBotId: string | undefined;
  subscriptionStatus: 'none' | 'active' | 'expired';
  onSelect: (id: string) => void;
  onAddBot: () => void;
  onClose: () => void;
  onToggleStatus?: (botId: string, newStatus: 'active' | 'inactive') => Promise<void>;
}

export const BotSwitcher = ({ bots, activeBotId, subscriptionStatus, onSelect, onAddBot, onClose, onToggleStatus }: BotSwitcherProps) => {
  const { isAdmin } = useAppState();
  const isPro = subscriptionStatus === 'active' || isAdmin;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        onTouchStart={onClose}
        className="fixed inset-0 bg-transparent z-[100]"
      />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="fixed top-[74px] left-4 right-4 mx-auto flex w-[calc(100%-32px)] max-w-[440px] flex-col overflow-hidden lg:top-[85px] lg:left-4 lg:right-auto lg:mx-0 lg:w-[360px]"
        style={{
          zIndex: 101,
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-float)',
          padding: '6px',
          maxHeight: 'min(560px, calc(100dvh - 96px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', marginBottom: '2px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-foreground-tertiary)', fontWeight: 500 }}>Ваши боты</span>
          <button onClick={onClose} style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} style={{ color: 'var(--color-foreground-tertiary)' }} />
          </button>
        </div>

        {/* The list scrolls while the title and add button stay visible. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {bots.map(bot => (
          <div
            key={bot.id}
            onClick={() => onSelect(bot.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: 'none',
              background: bot.id === activeBotId ? 'var(--color-primary-soft)' : 'transparent',
              cursor: 'pointer', transition: 'background 150ms ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: bot.id === activeBotId ? 'var(--color-primary)' : 'var(--color-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 600,
                color: bot.id === activeBotId ? '#fff' : 'var(--color-foreground-secondary)',
              }}>
                {bot.name.substring(0, 2).toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: bot.id === activeBotId ? 500 : 400, color: 'var(--color-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {bot.name}
                  {bot.id === activeBotId && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-foreground-tertiary)', marginTop: '1px' }}>{bot.username}</div>
              </div>
            </div>

            {/* Status Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleStatus) {
                  onToggleStatus(bot.id, bot.status === 'active' ? 'inactive' : 'active');
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '4px 8px', borderRadius: '12px', border: 'none',
                background: bot.status === 'active' ? 'var(--color-success-soft)' : 'var(--color-surface-2)',
                color: bot.status === 'active' ? 'var(--color-success)' : 'var(--color-foreground-tertiary)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >
              {bot.status === 'active' ? 'ВКЛ' : 'ВЫКЛ'}
            </button>
          </div>
        ))}
        </div>



        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '4px', paddingTop: '4px' }}>
          <button
            className="add-bot-btn hover:bg-[var(--color-surface-2)] active:bg-[var(--color-surface)]"
            onClick={() => { 
              onClose(); 
              onAddBot(); 
            }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: 'none',
              background: 'transparent', cursor: 'pointer', transition: 'background 150ms ease',
              color: (!isPro && bots.length >= 1) ? 'var(--color-foreground-tertiary)' : 'var(--color-foreground-secondary)',
              opacity: (!isPro && bots.length >= 1) ? 0.6 : 1,
            }}
          >
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px dashed var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(!isPro && bots.length >= 1) ? <Lock size={14} /> : <Plus size={14} />}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '14px' }}>Добавить бота</div>
              {!isPro && bots.length >= 1 ? (
                <div style={{ fontSize: '11px', color: 'var(--color-warning)' }}>Доступно по PRO подписке</div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--color-foreground-tertiary)' }}>Сборка бесплатно</div>
              )}
            </div>
          </button>
        </div>
      </motion.div>
    </>
  );
};
