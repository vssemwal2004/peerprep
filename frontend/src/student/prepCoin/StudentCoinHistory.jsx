import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Gift, RotateCcw } from 'lucide-react';
import StudentDashboardHeader from '../../components/StudentDashboardHeader';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { api } from '../../utils/api';
import { PREP_COIN_CHANGED } from './prepCoinEvents';

const card = 'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]';
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Received' },
  { value: 'out', label: 'Spent' },
  { value: 'refund', label: 'Refunds' },
];

function describe(row) {
  if (row.kind === 'student_spend') return { title: `Spent on ${row.feature || 'a PeerPrep feature'}`, Icon: ArrowUpRight, sign: '−', group: 'out', tone: 'text-slate-900 dark:text-zinc-100', chip: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300' };
  if (row.kind === 'student_refund') return { title: `Refunded: ${row.feature || 'a PeerPrep feature'}`, Icon: RotateCcw, sign: '+', group: 'refund', tone: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300' };
  return { title: `Received from ${row.fromName}`, Icon: ArrowDownLeft, sign: '+', group: 'in', tone: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' };
}

const dayLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/** A student's Prep Coin balance, prices and history. Prep Coin is separate from Prep Score. */
export default function StudentCoinHistory() {
  const [wallet, setWallet] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const load = () => {
      api.wallet().then(setWallet).catch((cause) => setError(cause.message || 'Your Prep Coins could not be loaded.'));
      api.walletPricing().then((result) => setPricing((result.features || []).filter((feature) => feature.price > 0 || feature.freePerMonth > 0))).catch(() => {});
    };
    load();
    window.addEventListener(PREP_COIN_CHANGED, load);
    return () => window.removeEventListener(PREP_COIN_CHANGED, load);
  }, []);

  const view = useMemo(() => {
    const rows = (wallet?.movements || []).map((row) => ({ ...row, ...describe(row) }));
    const month = new Date();
    const inMonth = rows.filter((row) => {
      const date = new Date(row.createdAt);
      return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
    });
    const sumOf = (list, group) => list.filter((row) => row.group === group).reduce((total, row) => total + Number(row.amount || 0), 0);
    const visible = filter === 'all' ? rows : rows.filter((row) => row.group === filter);
    const days = [];
    for (const row of visible) {
      const label = dayLabel(row.createdAt);
      if (days.at(-1)?.label !== label) days.push({ label, rows: [] });
      days.at(-1).rows.push(row);
    }
    return { days, received: sumOf(inMonth, 'in') + sumOf(inMonth, 'refund'), spent: sumOf(inMonth, 'out'), count: rows.length };
  }, [wallet, filter]);

  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100">
    <StudentDashboardHeader />
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}

      <section aria-label="Balance" className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-6 shadow-[0_12px_40px_-24px_rgba(180,83,9,0.45)] dark:border-amber-500/20 dark:from-amber-500/10 dark:via-[#242424] dark:to-sky-500/5 sm:p-8">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <PrepCoinIcon size={96} shine label="Prep Coin" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Prep Coin balance</p>
            <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums text-amber-950 dark:text-amber-50">{wallet ? Number(wallet.balance).toLocaleString() : '—'}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Credits for PeerPrep features, issued by your coordinator. They never change your Prep Score or rank.</p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-2 sm:w-56 sm:grid-cols-1">
            <div className="rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-amber-200/60 backdrop-blur dark:bg-white/5 dark:ring-white/10">
              <dt className="text-[11px] text-slate-500 dark:text-zinc-400">Received this month</dt>
              <dd className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">+{view.received.toLocaleString()}</dd>
            </div>
            <div className="rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-amber-200/60 backdrop-blur dark:bg-white/5 dark:ring-white/10">
              <dt className="text-[11px] text-slate-500 dark:text-zinc-400">Spent this month</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-zinc-100">−{view.spent.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </section>

      {pricing.length > 0 && <section className={card} aria-labelledby="coin-uses-title">
        <h2 id="coin-uses-title" className="text-base font-semibold">What Prep Coins unlock</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {pricing.map((feature) => {
            const freeShare = feature.freePerMonth ? Math.round((feature.freeLeft / feature.freePerMonth) * 100) : 0;
            return <li key={feature.featureKey} className="rounded-xl border border-slate-200/80 p-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{feature.label}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">
                  <PrepCoinIcon size={14} />{feature.price ? feature.price.toLocaleString() : 'Free'}
                </span>
              </div>
              {feature.freePerMonth ? <>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"><Gift className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />{feature.freeLeft} of {feature.freePerMonth} free uses left this month</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${freeShare}%` }} /></div>
              </> : null}
            </li>;
          })}
        </ul>
      </section>}

      <section className={card} aria-labelledby="coin-history-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="coin-history-title" className="text-base font-semibold">History</h2>
          <div role="tablist" aria-label="Filter history" className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-white/5">
            {FILTERS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)}
              className={`rounded-[10px] px-3 py-1 text-xs font-semibold transition ${filter === item.value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'}`}>{item.label}</button>)}
          </div>
        </div>
        {view.days.length ? <div className="mt-3 space-y-4">
          {view.days.map((day) => <div key={day.label}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{day.label}</p>
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {day.rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${row.chip}`}><row.Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block truncate font-medium">{row.title}</span><span className="block text-xs text-slate-500 dark:text-zinc-400">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                </span>
                <strong className={`inline-flex shrink-0 items-center gap-1 tabular-nums ${row.tone}`}>{row.sign}{Number(row.amount).toLocaleString()}<PrepCoinIcon size={14} /></strong>
              </li>)}
            </ul>
          </div>)}
        </div> : <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center dark:border-zinc-700">
          <PrepCoinIcon size={40} />
          <p className="text-sm text-slate-500 dark:text-zinc-400">{wallet ? (view.count ? 'Nothing matches this filter.' : 'No Prep Coin activity yet.') : 'Loading…'}</p>
        </div>}
      </section>
    </main>
  </div>;
}
