import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Coins, RotateCcw } from 'lucide-react';
import StudentDashboardHeader from '../../components/StudentDashboardHeader';
import { api } from '../../utils/api';

const card = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#242424]';

function describe(row) {
  if (row.kind === 'student_spend') return { title: `Spent on ${row.feature || 'a PeerPrep feature'}`, Icon: ArrowUpRight, sign: '−', tone: 'text-slate-900 dark:text-zinc-100' };
  if (row.kind === 'student_refund') return { title: `Refunded: ${row.feature || 'a PeerPrep feature'}`, Icon: RotateCcw, sign: '+', tone: 'text-emerald-700 dark:text-emerald-300' };
  return { title: `Received from ${row.fromName}`, Icon: ArrowDownLeft, sign: '+', tone: 'text-emerald-700 dark:text-emerald-300' };
}

/** A student's Prep Coin balance, prices and history. Prep Coin is separate from Prep Score. */
export default function StudentCoinHistory() {
  const [wallet, setWallet] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.wallet().then(setWallet).catch((cause) => setError(cause.message || 'Your Prep Coins could not be loaded.'));
    api.walletPricing().then((result) => setPricing((result.features || []).filter((feature) => feature.price > 0))).catch(() => {});
  }, []);
  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100">
    <StudentDashboardHeader />
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Coins className="h-5 w-5" aria-hidden="true" /></span>
        <div><h1 className="text-2xl font-semibold tracking-tight">Prep Coins</h1><p className="text-sm text-slate-500 dark:text-zinc-400">Credits for PeerPrep features, issued by your coordinator.</p></div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
      <section className={card} aria-label="Balance">
        <p className="text-sm text-slate-500 dark:text-zinc-400">Balance</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{wallet ? Number(wallet.balance).toLocaleString() : '—'}</p>
        {pricing.length > 0 && <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {pricing.map((feature) => <li key={feature.featureKey} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
            <span className="font-semibold">{feature.label}</span>
            <span className="block text-xs text-slate-500 dark:text-zinc-400">{feature.price.toLocaleString()} coins{feature.freePerMonth ? ` · ${feature.freeLeft} of ${feature.freePerMonth} free this month` : ''}</span>
          </li>)}
        </ul>}
      </section>
      <section className={card} aria-labelledby="coin-history-title">
        <h2 id="coin-history-title" className="text-base font-semibold">History</h2>
        {wallet?.movements?.length ? <ul className="mt-2 divide-y divide-slate-100 dark:divide-zinc-800">
          {wallet.movements.map((row) => {
            const { title, Icon, sign, tone } = describe(row);
            return <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0"><span className="block truncate">{title}</span><span className="block text-xs text-slate-500 dark:text-zinc-400">{new Date(row.createdAt).toLocaleString()}</span></span>
              </span>
              <strong className={`shrink-0 tabular-nums ${tone}`}>{sign}{Number(row.amount).toLocaleString()}</strong>
            </li>;
          })}
        </ul> : <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">{wallet ? 'No Prep Coin activity yet.' : 'Loading…'}</p>}
      </section>
    </main>
  </div>;
}
