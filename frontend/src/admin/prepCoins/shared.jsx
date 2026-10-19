import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { Glass, OverviewShell } from '../../overview/ui';
import { relativeTime } from '../../overview/overviewModel';
import { formatCoins, kindMeta } from './coinModel';

// Shared components of the Prep Coin console pages. Helpers live in coinModel.js.

export function KindChip({ kind }) {
  const meta = kindMeta(kind);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${meta.chip}`}>
      <meta.Icon className="h-3 w-3" aria-hidden="true" />{meta.label}
    </span>
  );
}

export function CoinAmount({ value, sign = '', className = '' }) {
  return <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${className}`}>{sign}{formatCoins(value)}<PrepCoinIcon size={14} /></span>;
}

export function LiveBadge({ updatedAt, loading }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20" aria-live="polite">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${loading ? '' : 'animate-ping'}`} />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live{updatedAt ? ` · ${relativeTime(updatedAt)}` : ''}
    </span>
  );
}

export function CoinPage({ title, subtitle, actions, children, live }) {
  return (
    <OverviewShell>
      <Glass as="header" className="mb-4 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <PrepCoinIcon size={48} shine />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Prep Coins</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{live}{actions}</div>
      </Glass>
      {children}
    </OverviewShell>
  );
}
