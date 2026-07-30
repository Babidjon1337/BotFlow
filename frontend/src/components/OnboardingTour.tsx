import { useState, useLayoutEffect, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, ArrowLeft, X } from 'lucide-react';

interface TourStep {
  targetId: string | null;
  title: string;
  description: string;
  tooltipSide: 'top' | 'bottom' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: null,
    title: '👋 Добро пожаловать в Bot Father',
    description: 'За несколько минут настроите Telegram-бота с автоматической воронкой продаж и приёмом оплат. Покажем, как всё устроено.',
    tooltipSide: 'center',
  },
  {
    targetId: 'tour-funnel-tab',
    title: '🤖 Вкладка «Воронка»',
    description: 'Здесь настраивается поведение бота. Настройка полностью бесплатна — платить нужно только при публикации.',
    tooltipSide: 'bottom',
  },
  {
    targetId: 'tour-token-input',
    title: '🔑 Токен бота',
    description: 'Вставьте токен из @BotFather в Telegram. Это уникальный ключ, который связывает Bot Father с вашим ботом.',
    tooltipSide: 'bottom',
  },
  {
    targetId: 'tour-funnel-steps',
    title: '📋 Шаги воронки',
    description: 'Цепочка сообщений: стартовое, дожимы и сообщение после оплаты. Каждый шаг отправляется автоматически в нужное время.',
    tooltipSide: 'bottom',
  },
  {
    targetId: 'tour-publish-btn',
    title: '🚀 Публикация',
    description: 'Когда воронка готова — нажмите «Опубликовать». Разовый запуск: 2 000 ₽. PRO-подписка: до 10 ботов за 3 000 ₽/мес.',
    tooltipSide: 'top',
  },
  {
    targetId: 'tour-nav-stats',
    title: '📊 Статистика',
    description: 'После запуска смотрите сколько пользователей зашло, кто оплатил и как работает каждый шаг воронки.',
    tooltipSide: 'top',
  },
  {
    targetId: 'tour-nav-profile',
    title: '⚙️ Профиль',
    description: 'Управляйте подпиской, платёжными интеграциями и настройками аккаунта.',
    tooltipSide: 'top',
  },
];

const PAD = 10;
const TOOLTIP_W = 320;
const SPRING = { stiffness: 320, damping: 32, mass: 0.8 };

interface OnboardingTourProps {
  onComplete: () => void;
}

export const OnboardingTour = ({ onComplete }: OnboardingTourProps) => {
  const [step, setStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: `min(${TOOLTIP_W}px, calc(100vw - 32px))`,
  });

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  // Spring values for the spotlight rect
  const spX = useSpring(-9999, SPRING);
  const spY = useSpring(-9999, SPRING);
  const spW = useSpring(0, SPRING);
  const spH = useSpring(0, SPRING);

  const [hasTarget, setHasTarget] = useState(false);

  // 1. Scroll target into view when step changes
  useEffect(() => {
    if (current.targetId) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [current.targetId]);

  // 2. Measure and update positions
  const measure = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!current.targetId) {
      spX.set(-9999); spY.set(-9999); spW.set(0); spH.set(0);
      setHasTarget(false);
      setTooltipStyle(prev => {
        const next = { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: `min(${TOOLTIP_W}px, calc(100vw - 32px))` };
        if (prev.top === next.top && prev.left === next.left) return prev;
        return next;
      });
      return;
    }

    const el = document.querySelector<HTMLElement>(`[data-tour="${current.targetId}"]`);
    if (!el) {
      spX.set(-9999); spY.set(-9999); spW.set(0); spH.set(0);
      setHasTarget(false);
      return;
    }

    const r = el.getBoundingClientRect();
    const top    = Math.max(0, r.top - PAD);
    const left   = Math.max(0, r.left - PAD);
    const width  = Math.min(r.width + PAD * 2, vw - left);
    const height = Math.min(r.height + PAD * 2, vh - top);

    spX.set(left);
    spY.set(top);
    spW.set(width);
    spH.set(height);
    setHasTarget(true);

    const margin = 16;
    const clampedLeft = Math.min(Math.max(left, margin), vw - TOOLTIP_W - margin);
    const side = current.tooltipSide;
    
    let ts: React.CSSProperties = { position: 'fixed', width: `min(${TOOLTIP_W}px, calc(100vw - 32px))` };

    if (side === 'bottom') {
      const spaceBelow = vh - (top + height);
      if (spaceBelow >= 200) {
        ts = { ...ts, top: top + height + 16, left: clampedLeft };
      } else {
        ts = { ...ts, bottom: 24, left: clampedLeft };
      }
    } else if (side === 'top') {
      const spaceAbove = top;
      if (spaceAbove >= 200) {
        ts = { ...ts, bottom: vh - top + 16, left: clampedLeft };
      } else {
        ts = { ...ts, top: 24, left: clampedLeft };
      }
    } else {
      ts = { ...ts, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    
    setTooltipStyle(prev => {
      if (prev.top === ts.top && prev.bottom === ts.bottom && prev.left === ts.left) return prev;
      return ts;
    });
  }, [current.targetId, current.tooltipSide, spX, spY, spW, spH]);

  useLayoutEffect(() => {
    const initialMeasure = requestAnimationFrame(measure);
    const t1 = setInterval(measure, 50);
    const t2 = setTimeout(() => clearInterval(t1), 600); // Poll during smooth scroll
    
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    
    return () => {
      clearInterval(t1);
      clearTimeout(t2);
      cancelAnimationFrame(initialMeasure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [step, measure]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

  const panelTopH    = spY;
  const panelBotTop  = useTransform([spY, spH], ([y, h]) => (y as number) + (h as number));
  const panelLeftW   = spX;
  const panelRightL  = useTransform([spX, spW], ([x, w]) => (x as number) + (w as number));

  const next = () => { if (isLast) { onComplete(); return; } setStep(s => s + 1); };
  const prev = () => setStep(s => s - 1);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      
      {/* ── Permanent dark overlay (4 panels) ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'all' }} onClick={onComplete}>
        {/* Top */}
        <motion.div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'rgba(0,0,0,0.76)',
          height: hasTarget ? panelTopH : vh,
          backdropFilter: !hasTarget ? 'blur(3px)' : undefined,
        }} />
        {/* Bottom */}
        <motion.div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.76)',
          top: hasTarget ? panelBotTop : vh,
        }} />
        {/* Left */}
        <motion.div style={{
          position: 'absolute', top: hasTarget ? spY : 0, left: 0, bottom: 0,
          background: 'rgba(0,0,0,0.76)',
          width: hasTarget ? panelLeftW : 0,
          height: hasTarget ? spH : 0,
        }} />
        {/* Right */}
        <motion.div style={{
          position: 'absolute', top: hasTarget ? spY : 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.76)',
          left: hasTarget ? panelRightL : vw,
          height: hasTarget ? spH : 0,
        }} />
      </div>

      {/* ── Spotlight ring ── */}
      <AnimatePresence>
        {hasTarget && (
          <motion.div
            key={`ring-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              top: spY, left: spX, width: spW, height: spH,
              borderRadius: 12,
              boxShadow: '0 0 0 2.5px var(--color-primary), 0 0 0 6px rgba(51,144,236,0.2)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Tooltip ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`tip-${step}`}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          style={{
            ...tooltipStyle,
            background: 'var(--color-surface)',
            borderRadius: '20px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
            padding: '24px',
            pointerEvents: 'all',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {TOUR_STEPS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === step ? 22 : 6,
                    background: i <= step ? 'var(--color-primary)' : 'var(--color-border)',
                    opacity: i === step ? 1 : i < step ? 0.5 : 0.35,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ height: '6px', borderRadius: '3px' }}
                />
              ))}
            </div>
            <button
              onClick={onComplete}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--color-surface-2)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--color-foreground-tertiary)', flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>

          <motion.h3
            key={`title-${step}`}
            initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05, duration: 0.18 }}
            style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-foreground)', marginBottom: '8px', letterSpacing: '-0.01em', lineHeight: 1.3 }}
          >
            {current.title}
          </motion.h3>
          <motion.p
            key={`desc-${step}`}
            initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.18 }}
            style={{ fontSize: '14px', color: 'var(--color-foreground-secondary)', lineHeight: 1.65, marginBottom: '22px' }}
          >
            {current.description}
          </motion.p>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
            {!isFirst ? (
              <button
                onClick={prev}
                className="btn btn-secondary"
                style={{ height: '40px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
              >
                <ArrowLeft size={14} /> Назад
              </button>
            ) : <div />}

            <motion.button
              onClick={next}
              whileTap={{ scale: 0.95 }}
              className="btn btn-primary"
              style={{
                height: '40px', padding: '0 20px',
                display: 'flex', alignItems: 'center', gap: '6px',
                flex: isFirst ? 1 : undefined, justifyContent: 'center',
                fontSize: '14px', fontWeight: 600,
              }}
            >
              {isLast ? 'Начнём! 🚀' : 'Далее'} {!isLast && <ArrowRight size={14} />}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
