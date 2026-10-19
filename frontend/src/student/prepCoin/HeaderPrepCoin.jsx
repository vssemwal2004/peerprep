import { Link } from 'react-router-dom';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import usePrepCoinBalance from './usePrepCoinBalance';

/** The only score-like figure in the student header: the Prep Coin balance, linking to its history. */
export default function HeaderPrepCoin() {
  const { balance, changeCount } = usePrepCoinBalance();
  if (balance == null) return null;
  return <Link to="/student/wallet" title="Prep Coin balance and history" aria-label={`Prep Coin ${balance.toLocaleString()}`} className="flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/70 pl-1.5 pr-2.5 text-[13px] font-bold tabular-nums text-amber-900 shadow-sm shadow-amber-900/5 transition-colors hover:from-amber-100 hover:to-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-amber-700/50 dark:from-amber-500/15 dark:to-amber-500/5 dark:text-amber-200 dark:hover:from-amber-500/20">
    {/* A new key restarts the one-off flip each time the balance changes. */}
    <PrepCoinIcon key={changeCount} size={22} pop={changeCount > 0} />
    <span>{balance.toLocaleString()}</span><span className="hidden text-[10px] font-semibold uppercase tracking-wide sm:inline">Prep Coin</span>
  </Link>;
}
