import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';

interface InfoTooltipProps {
  text: string | React.ReactNode;
  title?: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

type TooltipCoordinates = {
  left: number;
  top: number;
  actualSide: InfoTooltipProps['side'];
  arrowLeft: string;
};

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, title, className = '', side = 'top' }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState<TooltipCoordinates>({ left: 0, top: 0, actualSide: side, arrowLeft: '50%' });
  const ref = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = 250; // approximate popover width
    const height = 100; // approximate height

    const spaceTop = rect.top;
    const spaceBottom = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;

    let actualSide: InfoTooltipProps['side'];

    // Smart positioning logic based on available space
    if (window.innerWidth >= 768 && spaceRight > width + 20 && side !== 'left' && side !== 'bottom') {
      actualSide = 'right'; // Prefer right on desktop if enough space
    } else if (spaceTop > height + 20) {
      actualSide = 'top';
    } else if (spaceBottom > height + 20) {
      actualSide = 'bottom';
    } else if (spaceRight > width + 20) {
      actualSide = 'right';
    } else {
      actualSide = 'left';
    }

    // Force top/bottom on small screens
    if (window.innerWidth < 768 && (actualSide === 'left' || actualSide === 'right')) {
      actualSide = spaceTop > height + 20 ? 'top' : 'bottom';
    }

    const iconCenter = rect.left + rect.width / 2;
    const clampedLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - 125, window.innerWidth - 266));
    const topBottomArrowLeft = `${Math.max(16, Math.min(iconCenter - clampedLeft, 234))}px`;

    if (actualSide === 'right') {
      setCoords({ left: rect.right + 10, top: rect.top + rect.height / 2, actualSide: 'right', arrowLeft: '0' });
    } else if (actualSide === 'left') {
      setCoords({ left: rect.left - 10, top: rect.top + rect.height / 2, actualSide: 'left', arrowLeft: '100%' });
    } else if (actualSide === 'bottom') {
      setCoords({ left: clampedLeft, top: rect.bottom + 10, actualSide: 'bottom', arrowLeft: topBottomArrowLeft });
    } else {
      setCoords({ left: clampedLeft, top: rect.top - 10, actualSide: 'top', arrowLeft: topBottomArrowLeft });
    }
  }, [side]);

  useEffect(() => {
    if (show) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [show, updatePosition]);

  const getTransform = () => {
    if (coords.actualSide === 'right') return 'translateY(-50%)';
    if (coords.actualSide === 'left') return 'translateX(-100%) translateY(-50%)';
    if (coords.actualSide === 'top') return 'translateY(-100%)';
    return 'none';
  };

  const getArrowStyles = (): React.CSSProperties => {
    if (coords.actualSide === 'right') {
      return {
        position: 'absolute',
        right: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderRight: '6px solid var(--color-surface)',
        filter: 'drop-shadow(-1px 0 1px rgba(0,0,0,0.08))',
      };
    }
    if (coords.actualSide === 'left') {
      return {
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderLeft: '6px solid var(--color-surface)',
        filter: 'drop-shadow(1px 0 1px rgba(0,0,0,0.08))',
      };
    }
    if (coords.actualSide === 'bottom') {
      return {
        position: 'absolute',
        left: coords.arrowLeft,
        transform: 'translateX(-50%)',
        bottom: '100%',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderBottom: '6px solid var(--color-surface)',
        filter: 'drop-shadow(0 -1px 1px rgba(0,0,0,0.08))',
      };
    }
    // Top
    return {
      position: 'absolute',
      left: coords.arrowLeft,
      transform: 'translateX(-50%)',
      top: '100%',
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderTop: '6px solid var(--color-surface)',
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))',
    };
  };

  return (
    <div
      ref={ref}
      className={`relative inline-flex items-center align-middle ml-1.5 cursor-help shrink-0 ${className}`}
      onMouseEnter={() => { updatePosition(); setShow(true); }}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); updatePosition(); setShow(!show); }}
    >
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all duration-150 hover:scale-110"
        style={{
          background: show ? 'var(--color-primary)' : 'var(--color-primary-soft)',
          color: show ? '#fff' : 'var(--color-primary)',
        }}
      >
        <HelpCircle size={11} strokeWidth={2.5} />
      </div>

      {show && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.13 }}
            className="font-sans rounded-xl text-left pointer-events-none"
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              transform: getTransform(),
              minWidth: '220px',
              maxWidth: '260px',
              width: 'max-content',
              padding: '10px 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 12px 28px -6px rgba(0,0,0,0.22), 0 4px 8px -4px rgba(0,0,0,0.12)',
              zIndex: 100000,
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            {title && (
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color: 'var(--color-primary)',
                  marginBottom: '4px',
                }}
              >
                {title}
              </div>
            )}
            <div style={{ color: 'var(--color-foreground-secondary)', fontWeight: 400 }}>{text}</div>
            <div style={getArrowStyles()} />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
