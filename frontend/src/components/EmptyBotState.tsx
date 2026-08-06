import { motion } from 'framer-motion';
import { Plus, LayoutGrid } from 'lucide-react';

interface EmptyBotStateProps {
  onCreateBot: () => void;
  title?: string;
  description?: string;
}

export const EmptyBotState = ({ 
  onCreateBot,
  title = 'Добро пожаловать!',
  description = 'Создайте своего первого бота, чтобы автоматизировать процессы общения с клиентами и начать принимать платежи прямо в Telegram.'
}: EmptyBotStateProps) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // On mobile: use minimal padding so card fills screen properly
      padding: 'clamp(12px, 3vw, 40px) 16px',
      minHeight: 'clamp(300px, 60vh, 500px)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="card-saas"
        style={{
          width: '100%',
          maxWidth: '540px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // Adaptive padding: compact on mobile, generous on desktop
          padding: 'clamp(24px, 5vw, 48px) clamp(20px, 5vw, 32px)',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          borderRadius: '24px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-2) 100%)'
        }}
      >
        {/* Badge */}
        <div style={{ 
          position: 'relative', 
          zIndex: 1,
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '8px',
          padding: '6px 16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '100px',
          color: 'var(--color-primary)',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
          <LayoutGrid size={15} />
          <span>BotFlow</span>
        </div>

        {/* Image — smaller on mobile */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <motion.img 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            src="/empty_state_robot.png" 
            alt="New Bot" 
            style={{ 
              // Adaptive height: smaller on small screens
              height: 'clamp(140px, 25vh, 240px)',
              objectFit: 'contain'
            }} 
          />
        </div>

        {/* Text Content */}
        <h2 style={{
          fontSize: 'clamp(18px, 4vw, 24px)',
          fontWeight: 800,
          color: 'var(--color-foreground)',
          marginBottom: '10px',
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          position: 'relative',
          zIndex: 1
        }}>
          {title}
        </h2>
        
        <p style={{
          fontSize: 'clamp(13px, 3vw, 14px)',
          color: 'var(--color-foreground-secondary)',
          lineHeight: 1.5,
          marginBottom: '24px',
          maxWidth: '380px',
          position: 'relative',
          zIndex: 1
        }}>
          {description}
        </p>

        {/* Action Button */}
        <button
          onClick={onCreateBot}
          className="btn-primary-saas group"
          style={{
            height: '48px',
            padding: '0 28px',
            fontSize: '15px',
            gap: '10px',
            boxShadow: '0 8px 20px -6px rgba(99, 102, 241, 0.4)',
            display: 'inline-flex',
            position: 'relative',
            zIndex: 1,
            borderRadius: '14px'
          }}
        >
          <Plus size={20} strokeWidth={2.5} />
          Создать первого бота
        </button>
      </motion.div>
    </div>
  );
};
