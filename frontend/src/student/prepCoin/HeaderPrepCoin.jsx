import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import usePrepCoinBalance from './usePrepCoinBalance';

const COUNT_MS = 650;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Rolls the shown number from the old balance to the new one. */
function useCountUp(target) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target == null) return undefined;
    const start = from.current;
    if (start == null || start === target || reducedMotion() || typeof requestAnimationFrame !== 'function') {
      from.current = target;
      setShown(target);
      return undefined;
    }
    let frame;
    const began = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - began) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + (target - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); from.current = target; };
  }, [target]);
  return shown;
}

/** The only score-like figure in the student header: the Prep Coin balance, linking to its history. */
export default function HeaderPrepCoin() {
  const { balance, changeCount, lastGain } = usePrepCoinBalance();
  const shown = useCountUp(balance);
  const [gain, setGain] = useState(null);
  useEffect(() => {
    if (!lastGain) return undefined;
    setGain(lastGain);
    const timer = setTimeout(() => setGain(null), 1600);
    return () => clearTimeout(timer);
  }, [lastGain]);
  if (balance == null) return null;
  return <Link to="/student/wallet" title="Prep Coin balance and history" aria-label={`Prep Coin ${balance.toLocaleString()}`} className={`relative flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/70 pl-1.5 pr-2.5 text-[13px] font-bold tabular-nums text-amber-900 shadow-sm shadow-amber-900/5 transition-[colors,box-shadow] hover:from-amber-100 hover:to-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-amber-700/50 dark:from-amber-500/15 dark:to-amber-500/5 dark:text-amber-200 dark:hover:from-amber-500/20 ${gain ? 'shadow-[0_0_0_3px_rgba(245,158,11,0.25)]' : ''}`}>
    {/* A new key restarts the one-off flip each time the balance changes. */}
    <PrepCoinIcon key={changeCount} size={22} pop={changeCount > 0} />
    <span>{(shown ?? balance).toLocaleString()}</span><span className="hidden text-[10px] font-semibold uppercase tracking-wide sm:inline">Prep Coin</span>
    {gain && <span key={gain.at} aria-hidden="true" className="prep-coin-gain pointer-events-none absolute -top-3 right-1 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-extrabold text-white shadow">+{gain.amount}</span>}
  </Link>;
}
