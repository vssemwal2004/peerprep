import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import usePrepCoinBalance from './usePrepCoinBalance';

/** Prep Coin balance on the student profile; the same live figure as the header. */
export default function ProfilePrepCoin({ focusRing = '' }) {
  const { balance, changeCount } = usePrepCoinBalance();
  if (balance == null) return null;
  return (
    <Link to="/student/wallet" aria-label={`Prep Coin balance ${balance.toLocaleString()}. Open Prep Coin history`}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/60 px-3.5 py-3 transition-colors hover:border-amber-300 dark:border-amber-500/25 dark:from-amber-500/10 dark:via-transparent dark:to-amber-500/5 ${focusRing}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-amber-300/30 blur-2xl" />
      <PrepCoinIcon key={changeCount} size={40} shine pop={changeCount > 0} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80">Prep Coin</span>
        <span className="block text-xl font-bold leading-tight tabular-nums text-amber-950 dark:text-amber-100">{balance.toLocaleString()}</span>
        <span className="block truncate text-[11px] text-amber-800/70 dark:text-amber-200/60">Credits for interviews and premium practice</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
