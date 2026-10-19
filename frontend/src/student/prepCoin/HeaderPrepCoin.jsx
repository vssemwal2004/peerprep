import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { api } from '../../utils/api';
import { PREP_COIN_CHANGED } from './prepCoinEvents';

/** The only score-like figure in the student header: the Prep Coin balance, linking to its history. */
export default function HeaderPrepCoin() {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    let active = true;
    const load = () => api.walletSummary().then((result) => { if (active) setBalance(Math.max(0, Number(result.balance) || 0)); }).catch(() => {});
    load();
    window.addEventListener(PREP_COIN_CHANGED, load);
    return () => { active = false; window.removeEventListener(PREP_COIN_CHANGED, load); };
  }, []);
  if (balance == null) return null;
  return <Link to="/student/wallet" title="Prep Coin balance and history" aria-label={`Prep Coin ${balance.toLocaleString()}`} className="flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-[13px] font-bold tabular-nums text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20">
    <Coins className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
    <span>{balance.toLocaleString()}</span><span className="hidden text-[10px] font-semibold uppercase tracking-wide sm:inline">Prep Coin</span>
  </Link>;
}
