import { Loader2, X } from 'lucide-react';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';

const coins = (value) => `${Number(value || 0).toLocaleString()} Prep Coin${Number(value) === 1 ? '' : 's'}`;

/** Asks a student to confirm a Prep Coin cost (or a free monthly use) before a paid action. */
export default function CoinCostDialog({ state, onConfirm, onCancel }) {
  const { quote, busy, shortfall, error } = state;
  const short = shortfall || (quote.cost > quote.balance ? { required: quote.cost, balance: quote.balance } : null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" role="presentation" onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="prep-coin-cost-title" className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-[#242424]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PrepCoinIcon size={36} shine />
            <h2 id="prep-coin-cost-title" className="text-base font-semibold text-slate-950 dark:text-zinc-50">{quote.label}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        {quote.cost === 0 ? (
          <p className="mt-4 text-sm text-slate-700 dark:text-zinc-200">Free this time: <b>{quote.freeLeft} of {quote.freePerMonth}</b> free uses left this month.</p>
        ) : (
          <div className="mt-4 space-y-1 text-sm text-slate-700 dark:text-zinc-200">
            <p>This uses <b className="tabular-nums">{coins(quote.cost)}</b>.</p>
            <p className="tabular-nums text-slate-500 dark:text-zinc-400">Balance {coins(quote.balance)}{short ? '' : ` → ${coins(quote.balance - quote.cost)}`}</p>
          </div>
        )}
        {short && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">You need {coins(short.required)} and have {coins(short.balance)}. Prep Coins are issued by your coordinator.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy || Boolean(short)} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{quote.cost === 0 ? 'Continue' : `Use ${coins(quote.cost)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
