import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

export const Toast = ({ message, type = 'success', duration = 3000, onClose }: ToastProps) => {
  const isMobileViewport = window.innerWidth < 1024;

  // Auto-extend duration for long multi-line messages
  const effectiveDuration = useMemo(() => {
    const lineCount = message.split('\n').length;
    if (lineCount > 3) return Math.max(duration, 6000);
    if (lineCount > 1) return Math.max(duration, 4500);
    return duration;
  }, [message, duration]);

  useEffect(() => {
    const t = setTimeout(onClose, effectiveDuration);
    return () => clearTimeout(t);
  }, [effectiveDuration, onClose]);

  // Render message lines, supporting \n and bullet points with styled categories
  const renderedMessage = useMemo(() => {
    const lines = message.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      return <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--color-foreground)', minWidth: 0 }}>{message}</span>;
    }
    return (
      <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--color-foreground)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {lines.map((line, i) => {
          if (i === 0) {
            return (
              <span key={i} style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '2px' }}>
                {line}
              </span>
            );
          }

          const bulletMatch = line.match(/^(\s*•\s*)([^:]+:)(.*)$/);
          if (bulletMatch) {
            return (
              <span key={i} style={{ display: 'block', paddingLeft: '4px', fontSize: '13px', lineHeight: 1.45 }}>
                <span style={{ opacity: 0.7, marginRight: '4px' }}>•</span>
                <strong style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{bulletMatch[2]}</strong>
                <span style={{ opacity: 0.9 }}>{bulletMatch[3]}</span>
              </span>
            );
          }

          const isBullet = line.trimStart().startsWith('•');
          return (
            <span key={i} style={{
              display: 'block',
              paddingLeft: isBullet ? '4px' : undefined,
              fontSize: isBullet ? '13px' : '14px',
              opacity: isBullet ? 0.9 : 1,
              lineHeight: 1.4,
            }}>
              {line}
            </span>
          );
        })}
      </span>
    );
  }, [message]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -30, x: '-50%', scale: 0.96 }}
        animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
        exit={{ opacity: 0, y: -30, x: '-50%', scale: 0.96 }}
        transition={{ duration: 0.25, type: 'spring', damping: 25, stiffness: 300 }}
        onClick={onClose}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y < -20) onClose();
        }}
        style={{
          position: 'fixed',
          top: isMobileViewport
            ? 'max(80px, calc(var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)) + 12px))'
            : '24px',
          left: '50%',
          zIndex: 9999, display: 'flex', alignItems: 'flex-start', gap: '10px',
          padding: '12px 18px',
          width: 'min(calc(100vw - 32px), 440px)',
          minHeight: '44px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-float)',
          whiteSpace: 'normal',
          lineHeight: 1.35,
          cursor: 'pointer',
          touchAction: 'none'
        }}
      >
        {type === 'success'
          ? <CheckCircle2 size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '2px' }} />
          : <XCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />}
        {renderedMessage}
      </motion.div>
    </AnimatePresence>
  );
};
