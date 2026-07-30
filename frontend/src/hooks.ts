import { useState, useEffect } from 'react';

type TelegramWebApp = {
  viewportHeight?: number;
  onEvent?: (event: 'viewportChanged', handler: () => void) => void;
  offEvent?: (event: 'viewportChanged', handler: () => void) => void;
};

export const useViewportHeight = () => {
  const [vh, setVh] = useState(window.innerHeight);

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    
    const update = () => {
      setVh(tg?.viewportHeight || window.visualViewport?.height || window.innerHeight);
    };

    if (tg && tg.onEvent) {
      tg.onEvent('viewportChanged', update);
    }
    
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    
    update(); // initial sync

    return () => {
      if (tg && tg.offEvent) {
        tg.offEvent('viewportChanged', update);
      }
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return vh;
};
