import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import { PAYMENT_PROVIDERS } from '../constants';
import type { PaymentProvider, AppState } from '../types';
import { FunnelCard } from './FunnelCard';
import { useAppState } from '../providers/AppStateProvider';

interface BotSetupCardProps {
  appState: AppState;
  onConnect: () => void;
}

export const BotSetupCard = ({ appState, onConnect }: BotSetupCardProps) => {
  const { setSheet, setActiveTab, isAdmin } = useAppState();
  const activeBot = appState.activeBot;
  const isEditing = !!activeBot;

  const [name, setName] = useState(activeBot?.name || '');
  const [username, setUsername] = useState(activeBot?.username || '');
  const [token, setToken] = useState(activeBot?.token || '');
  const [provider, setProvider] = useState<PaymentProvider>((activeBot?.paymentProvider as PaymentProvider) || 'yookassa');
  const [keys, setKeys] = useState<Record<string, string>>(activeBot?.paymentKeys || {});
  const isPro = appState.subscriptionStatus === 'active' || isAdmin;
  const hasManyUsers = (activeBot?.usersCount || 0) > 10;
  const isTokenLocked = isEditing && !isPro && hasManyUsers;
  const canEditToken = !isTokenLocked;
  const canEditPayment = true;

  const handleSave = () => {
    if (!activeBot) {
      onConnect();
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Bot Name and Username */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Название бота</label>
          <input
            type="text"
            placeholder="Мой магазин"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Юзернейм</label>
          <input
            type="text"
            placeholder="@username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* Token */}
      <div>
        <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Токен Telegram бота</label>
        <div style={{ position: 'relative' }}>
          <KeyRound size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-foreground-tertiary)' }} />
          <input
            type="text"
            placeholder="1234567890:AAH_xxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={!canEditToken}
            className="input"
            style={{ paddingLeft: '40px', opacity: !canEditToken ? 0.6 : 1, cursor: !canEditToken ? 'not-allowed' : 'text' }}
          />
        </div>
        {isTokenLocked && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-warning)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>🔒</span>
            <span>
              У вас более 10 пользователей. Токен заблокирован. (Для смены нужна <span onClick={() => { setSheet(null); setActiveTab('subscription'); }} style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}>подписка бота</span> или новый слот).
            </span>
          </p>
        )}
        {!isEditing && (
          <div style={{ marginTop: '8px', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-xs)', fontSize: '12px', color: 'var(--color-foreground-secondary)', lineHeight: 1.6 }}>
            Получите токен в <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>@BotFather</a> — отправьте <code style={{ background: 'var(--color-border)', padding: '1px 5px', borderRadius: '4px' }}>/newbot</code>
          </div>
        )}
      </div>

      {/* Payment provider */}
      <div>
        <label className="text-label" style={{ display: 'block', marginBottom: '8px' }}>Платёжная система</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', padding: '4px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          {(Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map(p => (
            <button
              key={p}
              onClick={() => { setProvider(p); setKeys({}); }}
              disabled={!canEditPayment}
              style={{
                height: '34px', borderRadius: '6px', fontSize: '13px', fontWeight: provider === p ? 500 : 400,
                cursor: canEditPayment ? 'pointer' : 'not-allowed', border: 'none',
                background: provider === p ? 'var(--color-surface)' : 'transparent',
                color: provider === p ? 'var(--color-foreground)' : 'var(--color-foreground-secondary)',
                boxShadow: provider === p ? 'var(--shadow-card)' : 'none',
                transition: 'all 150ms ease', textTransform: 'capitalize',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {PAYMENT_PROVIDERS[provider].map(field => (
              <motion.div key={field.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="text-label" style={{ display: 'block', marginBottom: '6px' }}>{field.label}</label>
                <input
                  type="text"
                  placeholder={field.hint}
                  value={keys[field.key] || ''}
                  onChange={(e) => setKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
                  disabled={!canEditPayment}
                  className="input"
                  style={{ opacity: !canEditPayment ? 0.6 : 1, cursor: !canEditPayment ? 'not-allowed' : 'text' }}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>

      {!isEditing && (
        <button onClick={handleSave} disabled={token.length < 20} className="btn btn-action w-full" style={{ height: '44px' }}>
          Подключить бота
        </button>
      )}

      {isEditing && (
        <>
          <div style={{ marginTop: '8px' }}>
            <button onClick={handleSave} className="btn btn-secondary w-full" style={{ height: '44px' }}>
              Обновить настройки
            </button>
          </div>

        </>
      )}

    </div>
  );

  if (isEditing) {
    return (
      <FunnelCard
        stepId="setup"
        title="Шаг 0 · Настройки бота"
        isComplete={!!(activeBot?.token && activeBot?.name && activeBot?.username)}
        defaultExpanded={false}
      >
        {content}
      </FunnelCard>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-foreground)', marginBottom: '4px' }}>Подключите бота</div>
        <div style={{ fontSize: '13px', color: 'var(--color-foreground-secondary)' }}>Введите токен и выберите платёжную систему</div>
      </div>
      <div style={{ padding: '24px' }}>
        {content}
      </div>
    </div>
  );
};
