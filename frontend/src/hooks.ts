import { useState, useEffect } from 'react';

export const useViewportHeight = () => {
  const [vh, setVh] = useState(window.innerHeight);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    
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
