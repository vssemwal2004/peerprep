import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { PREP_COIN_CHANGED } from './prepCoinEvents';
import { COINS_EARNED } from '../rewards/rewardEvents';

/**
 * The student's live Prep Coin balance. Reloads on PREP_COIN_CHANGED and when the tab regains focus;
 * an earned reward (COINS_EARNED) carries the new balance, so it updates instantly with no request.
 * changeCount increases each time the balance changes after the first load (for a one-off coin flip);
 * lastGain is the latest earned amount (for the floating "+N").
 */
export default function usePrepCoinBalance() {
  const [balance, setBalance] = useState(null);
  const [changeCount, setChangeCount] = useState(0);
  const [lastGain, setLastGain] = useState(null);
  const previous = useRef(null);
  useEffect(() => {
    let active = true;
    const apply = (next) => {
      if (previous.current !== null && previous.current !== next) setChangeCount((count) => count + 1);
      previous.current = next;
      setBalance(next);
    };
    const load = () => api.walletSummary().then((result) => {
      if (active) apply(Math.max(0, Number(result.balance) || 0));
    }).catch(() => {});
    const onEarned = (event) => {
      const next = Number(event.detail?.balance);
      if (!Number.isFinite(next)) return load();
      // A later reward may arrive before an earlier one: never move the counter backwards.
      if (previous.current !== null && next < previous.current) return undefined;
      setLastGain({ amount: event.detail.amount, at: event.detail.at || Date.now() });
      apply(next);
      return undefined;
    };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    window.addEventListener(PREP_COIN_CHANGED, load);
    window.addEventListener(COINS_EARNED, onEarned);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener(PREP_COIN_CHANGED, load);
      window.removeEventListener(COINS_EARNED, onEarned);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return { balance, changeCount, lastGain };
}
