import { motion } from 'framer-motion';
import { Zap, CreditCard, ArrowRight } from 'lucide-react';

interface LandingProps {
  onPay: () => void;
  isPaying: boolean;
}

export const Landing = ({ onPay, isPaying }: LandingProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="w-28 h-28 bg-gradient-to-br from-primary to-purple-600 rounded-[36px] flex items-center justify-center mb-10 shadow-2xl shadow-primary/20 relative"
      >
        <Zap size={48} color="white" fill="white" />
        <motion.div 
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 bg-primary/40 rounded-[36px] blur-2xl"
        />
      </motion.div>
      <h1 className="text-5xl font-black mb-4 tracking-tight text-foreground">BotFlow</h1>
      <p className="text-muted-foreground mb-12 max-w-[280px] leading-relaxed font-medium">
        Ваша персональная империя ботов начинается здесь. Конструктор, воронки, платежи.
      </p>
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-[40px] p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-4 mb-10 bg-white/5 p-5 rounded-3xl border border-white/5">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
            <CreditCard size={28} />
          </div>
          <div className="text-left text-foreground">
            <div className="font-black text-xl">PRO Доступ</div>
            <div className="text-sm text-muted-foreground font-bold uppercase tracking-wider">1500₽ / месяц</div>
          </div>
        </div>
        
        <button 
          onClick={onPay}
          disabled={isPaying}
          className="group relative w-full bg-primary text-white font-black py-5 rounded-[24px] shadow-2xl shadow-primary/30 transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
        >
          <span className="relative z-10 flex items-center justify-center gap-2 text-xl">
            {isPaying ? <div className="w-7 h-7 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : <>Подписаться <ArrowRight size={22} strokeWidth={3} /></>}
          </span>
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
        </button>
        <p className="text-[11px] text-muted-foreground/60 mt-6 font-bold leading-relaxed px-4">
          Нажимая кнопку, вы принимаете условия публичной оферты и политики конфиденциальности.
        </p>
      </motion.div>
    </div>
  );
};
