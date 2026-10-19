import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { PREP_COIN_CHANGED } from './prepCoinEvents';

/**
 * The student's live Prep Coin balance. Reloads on PREP_COIN_CHANGED and when the tab regains focus;
 * changeCount increases each time the balance changes after the first load (for a one-off coin flip).
 */
export default function usePrepCoinBalance() {
  const [balance, setBalance] = useState(null);
  const [changeCount, setChangeCount] = useState(0);
  const previous = useRef(null);
  useEffect(() => {
    let active = true;
    const load = () => api.walletSummary().then((result) => {
      if (!active) return;
      const next = Math.max(0, Number(result.balance) || 0);
      if (previous.current !== null && previous.current !== next) setChangeCount((count) => count + 1);
      previous.current = next;
      setBalance(next);
    }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    window.addEventListener(PREP_COIN_CHANGED, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener(PREP_COIN_CHANGED, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return { balance, changeCount };
}
