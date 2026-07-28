import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, CheckCircle2 } from 'lucide-react';

interface FunnelCardProps {
  stepId: string;
  title: string;
  isComplete: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const FunnelCard = ({ title, isComplete, defaultExpanded = false, children }: FunnelCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className="transition-all duration-300 relative"
      style={{
        padding: 0,
        overflow: 'hidden',
        background: 'var(--color-surface)',
        borderRadius: '20px',
        border: isExpanded
          ? '1.5px solid var(--color-border-strong)'
          : `1px solid ${isComplete ? 'var(--color-success-soft)' : 'var(--color-border)'}`,
        boxShadow: isExpanded
          ? '0 8px 24px -8px rgba(0,0,0,0.1)'
          : isComplete
          ? '0 2px 8px -4px rgba(0,0,0,0.06)'
          : '0 1px 4px -2px rgba(0,0,0,0.04)',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between transition-colors duration-200 hover:bg-[var(--color-surface-2)]"
        style={{
          padding: '14px 18px',
          background: isExpanded ? 'var(--color-surface-2)' : 'transparent',
          borderBottom: isExpanded ? '1px solid var(--color-border)' : '1px solid transparent',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          {isComplete ? (
            <CheckCircle2
              size={16}
              className="shrink-0"
              style={{ color: 'var(--color-success)', transition: 'color 0.3s ease' }}
            />
          ) : (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--color-foreground-tertiary)',
                flexShrink: 0,
                transition: 'background 0.3s ease',
              }}
            />
          )}
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--color-foreground)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </span>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={16} style={{ color: 'var(--color-foreground-tertiary)' }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div style={{ padding: '20px 20px 24px' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
