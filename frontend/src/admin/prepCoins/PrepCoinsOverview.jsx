import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Building2, Gift, Layers, ReceiptText, RotateCcw, Send, Tag, Trophy, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { DonutChart, StackedBars } from '../../overview/charts';
import { CardHeader, CardLink, EmptyHint, Glass, KpiTile, SkeletonRows } from '../../overview/ui';
import { relativeTime, weekChange } from '../../overview/overviewModel';
import UniversityBadge from '../universities/UniversityBadge';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { CoinAmount, CoinPage, KindChip, LiveBadge } from './shared';
import { buttonClass, formatCoins, useLive } from './coinModel';

const FLOW_SERIES = [
  { key: 'issued', label: 'Issued', color: '#0284c7' },
  { key: 'shared', label: 'Passed on', color: '#10b981' },
  { key: 'spent', label: 'Spent', color: '#f59e0b' },
  { key: 'refunded', label: 'Refunded', color: '#94a3b8' },
];
const loadSummary = () => api.coinConsoleSummary();

export default function PrepCoinsOverview() {
  const { data, error, loading, updatedAt } = useLive(loadSummary, 30_000);
  const showSkeleton = loading && !data;
  const features = Array.isArray(data?.features) ? data.features : [];
  const topHolders = Array.isArray(data?.topHolders) ? data.topHolders : [];
  const universities = Array.isArray(data?.universities) ? data.universities : [];
  const recent = Array.isArray(data?.recent) ? data.recent : [];

  const view = useMemo(() => {
    if (!data) return null;
    const { totals, month, trend } = data;
    const circulation = totals.universityWallets + totals.universityAccounts + totals.mainAccounts;
    return { totals, month, trend, circulation, series: (key) => trend.map((day) => day[key]) };
  }, [data]);

  const kpis = view ? [
    { label: 'In circulation', value: formatCoins(view.circulation), helper: `${formatCoins(view.totals.holders)} account wallets hold coins`, Icon: Layers, color: '#d97706' },
    { label: 'University wallets', value: formatCoins(view.totals.universityWallets), helper: 'Ready for admins to pass on', Icon: Building2, color: '#0284c7', to: '/admin/prep-coins/wallets' },
    { label: 'With students', value: formatCoins(view.totals.students), helper: `Coordinators hold ${formatCoins(view.totals.coordinators)}`, Icon: Users, color: '#10b981', to: '/admin/prep-coins/wallets?tab=accounts' },
    { label: 'Free uses · 30 days', value: formatCoins(view.month.freeUses), helper: `${formatCoins(view.month.charges)} paid uses`, Icon: Gift, color: '#059669' },
    { label: 'Issued · 30 days', value: formatCoins(view.month.issued), helper: 'Top-ups and direct credits', Icon: ArrowDownLeft, color: '#0284c7', trend: view.series('issued'), delta: weekChange(view.series('issued')), to: '/admin/prep-coins/ledger?kind=issued' },
    { label: 'Spent · 30 days', value: formatCoins(view.month.spent), helper: 'On paid student features', Icon: ArrowUpRight, color: '#f59e0b', trend: view.series('spent'), delta: weekChange(view.series('spent')), to: '/admin/prep-coins/ledger?kind=spent' },
    { label: 'Refunded · 30 days', value: formatCoins(view.month.refunded), helper: `${formatCoins(view.month.refunds)} refunded uses`, Icon: RotateCcw, color: '#64748b', trend: view.series('refunded'), to: '/admin/prep-coins/ledger?kind=refunded' },
    { label: 'Waiting to settle', value: formatCoins(view.month.pending), helper: 'Charges still being confirmed', Icon: ReceiptText, color: view.month.pending ? '#e11d48' : '#10b981' },
  ] : [];

  return (
    <CoinPage title="Overview" subtitle="Every Prep Coin across PeerPrep and its universities, updated live"
      live={<LiveBadge updatedAt={updatedAt} loading={loading} />}
      actions={<>
        <Link to="/admin/prep-coins/issue" className={buttonClass.primary}><Send className="h-4 w-4" />Issue coins</Link>
        <Link to="/admin/prep-coins/ledger" className={buttonClass.secondary}><ReceiptText className="h-4 w-4" />Ledger</Link>
      </>}>
      {error ? <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {showSkeleton ? [1, 2, 3, 4, 5, 6, 7, 8].map((key) => <KpiTile key={key} label="" loading />) : kpis.map((kpi) => <KpiTile key={kpi.label} {...kpi} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-8">
          <CardHeader title="Coin flow" subtitle="Daily movements, last 30 days" Icon={ReceiptText} action={<CardLink to="/admin/prep-coins/ledger">Open ledger</CardLink>} />
          {view ? <StackedBars data={view.trend} series={FLOW_SERIES} height={240} /> : <div className="h-[240px] animate-pulse rounded-xl bg-slate-200/60 dark:bg-white/[0.05]" />}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            {FLOW_SERIES.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span>)}
          </div>
        </Glass>
        <Glass className="p-5 xl:col-span-4">
          <CardHeader title="Where coins are" subtitle="Current balances" Icon={Layers} />
          {view ? (
            <DonutChart centre={formatCoins(view.circulation)} caption="coins"
              slices={[
                { label: 'University wallets', value: view.totals.universityWallets, color: '#0284c7' },
                { label: 'Students', value: view.totals.students, color: '#10b981' },
                { label: 'Coordinators', value: view.totals.coordinators, color: '#f59e0b' },
              ]} />
          ) : <SkeletonRows rows={3} />}
          {view ? <p className="mt-4 rounded-xl bg-slate-900/[0.03] px-3 py-2 text-[11px] text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">PeerPrep main accounts hold {formatCoins(view.totals.mainAccounts)}; university accounts hold {formatCoins(view.totals.universityAccounts)}.</p> : null}
        </Glass>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-6">
          <CardHeader title="Paid features" subtitle="Prices and spending, last 30 days" Icon={Tag} action={<CardLink to="/admin/prep-coins/pricing">Edit prices</CardLink>} />
          {showSkeleton ? <SkeletonRows rows={2} /> : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead><tr className="text-[11px] text-slate-500 dark:text-slate-400">{['Feature', 'Price', 'Free / month', 'Paid uses', 'Spent', 'Refunded'].map((heading) => <th key={heading} className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {features.map((feature) => (
                    <tr key={feature.key}>
                      <td className="px-2 py-3 font-semibold text-slate-900 dark:text-white">{feature.label}</td>
                      <td className="px-2 py-3">{feature.price ? <CoinAmount value={feature.price} /> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">Free</span>}</td>
                      <td className="px-2 py-3 tabular-nums text-slate-600 dark:text-slate-300">{feature.freePerMonth || '—'}</td>
                      <td className="px-2 py-3 tabular-nums text-slate-600 dark:text-slate-300">{formatCoins(feature.uses)}</td>
                      <td className="px-2 py-3"><CoinAmount value={feature.spent} className="text-amber-700 dark:text-amber-300" /></td>
                      <td className="px-2 py-3 tabular-nums text-slate-500">{formatCoins(feature.refunded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && !features.some((feature) => feature.price) ? <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">No feature has a price yet, so students use everything for free.</p> : null}
        </Glass>
        <Glass className="p-5 xl:col-span-3">
          <CardHeader title="Top holders" subtitle="Largest account balances" Icon={Trophy} />
          {showSkeleton ? <SkeletonRows /> : topHolders.length ? (
            <ol className="space-y-2">
              {topHolders.map((holder, index) => (
                <li key={holder.id} className="flex items-center gap-2.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{holder.name}</span><span className="block truncate text-[11px] capitalize text-slate-500">{holder.role} · {holder.scope}</span></span>
                  <CoinAmount value={holder.balance} className="text-xs text-slate-900 dark:text-white" />
                </li>
              ))}
            </ol>
          ) : <EmptyHint>No account holds coins yet.</EmptyHint>}
        </Glass>
        <Glass className="p-5 xl:col-span-3">
          <CardHeader title="University wallets" subtitle="Balance · passed on in 30 days" Icon={Building2} action={<CardLink to="/admin/prep-coins/wallets">All</CardLink>} />
          {showSkeleton ? <SkeletonRows /> : universities.length ? (
            <ul className="space-y-2.5">
              {universities.slice(0, 6).map((university) => (
                <li key={university.universityId} className="flex items-center gap-2.5">
                  <UniversityBadge university={{ name: university.name, logo: university.logo ? { url: university.logo } : null }} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{university.name}</span><span className="block text-[11px] text-slate-500">{formatCoins(university.distributed30d)} passed on</span></span>
                  <CoinAmount value={university.balance} className="text-xs text-slate-900 dark:text-white" />
                </li>
              ))}
            </ul>
          ) : <EmptyHint action={<CardLink to="/admin/universities/new">Add a university</CardLink>}>No universities yet.</EmptyHint>}
        </Glass>
      </div>

      <Glass className="mt-4 p-5">
        <CardHeader title="Latest movements" subtitle="Refreshes every 30 seconds" Icon={ReceiptText} action={<CardLink to="/admin/prep-coins/ledger">Full ledger</CardLink>} />
        {showSkeleton ? <SkeletonRows rows={5} /> : recent.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {recent.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)_140px_110px]">
                <span className="hidden sm:block"><KindChip kind={row.kind} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-900 dark:text-white">{row.from} → {row.to}{row.feature ? ` · ${row.feature}` : ''}</span>
                  <span className="block truncate text-[11px] text-slate-500 sm:hidden">{row.scope} · {relativeTime(row.createdAt)}</span>
                </span>
                <span className="hidden truncate text-[11px] text-slate-500 sm:block">{row.scope} · {relativeTime(row.createdAt)}</span>
                <span className="text-right"><CoinAmount value={row.amount} sign={row.kind === 'student_spend' ? '−' : '+'} className={row.kind === 'student_spend' ? 'text-xs text-amber-700 dark:text-amber-300' : 'text-xs text-emerald-700 dark:text-emerald-300'} /></span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PrepCoinIcon size={44} shine />
            <p className="text-sm text-slate-500 dark:text-slate-400">No coins have moved yet.</p>
            <Link to="/admin/prep-coins/issue" className={buttonClass.primary}><Send className="h-4 w-4" />Issue the first coins</Link>
          </div>
        )}
      </Glass>
    </CoinPage>
  );
}
