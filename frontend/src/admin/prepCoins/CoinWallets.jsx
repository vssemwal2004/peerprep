import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2, ChevronLeft, ChevronRight, ReceiptText, Search, Send, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, EmptyHint, Glass, Segmented, SkeletonRows } from '../../overview/ui';
import { percent, relativeTime } from '../../overview/overviewModel';
import UniversityBadge from '../universities/UniversityBadge';
import { CoinAmount, CoinPage, LiveBadge } from './shared';
import { buttonClass, formatCoins, inputClass, useLive } from './coinModel';

const loadSummary = () => api.coinConsoleSummary();

function UniversityWallets() {
  const { data, error, loading, updatedAt } = useLive(loadSummary, 60_000);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const rows = useMemo(() => {
    const list = (data?.universities || []).filter((row) => `${row.name} ${row.universityId}`.toLowerCase().includes(filter.trim().toLowerCase()));
    return list.sort((a, b) => (sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'shared' ? b.distributed30d - a.distributed30d : b.balance - a.balance));
  }, [data, filter, sortBy]);
  const total = (data?.universities || []).reduce((sum, row) => sum + row.balance, 0);

  return (
    <Glass className="p-5">
      <CardHeader title="University wallets" subtitle={data ? `${formatCoins(total)} coins across ${data.universities.length} universities` : 'Loading…'} Icon={Building2}
        action={<LiveBadge updatedAt={updatedAt} loading={loading} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input className={`${inputClass} pl-9`} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search universities" aria-label="Search universities" />
        </label>
        <Segmented label="Sort wallets" value={sortBy} onChange={setSortBy} options={[{ value: 'balance', label: 'Balance' }, { value: 'shared', label: 'Passed on' }, { value: 'name', label: 'Name' }]} />
      </div>
      {error ? <p className="mb-3 flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p> : null}
      {!data ? <SkeletonRows rows={4} /> : rows.length ? (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead><tr className="text-[11px] text-slate-500 dark:text-slate-400">{['University', 'Balance', 'Share of all', 'Passed on · 30 days', ''].map((heading) => <th key={heading} className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((row) => (
                <tr key={row.universityId} className="transition hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-2.5">
                      <UniversityBadge university={{ name: row.name, logo: row.logo ? { url: row.logo } : null }} size="sm" />
                      <span className="min-w-0"><span className="block truncate font-semibold text-slate-900 dark:text-white">{row.name}</span><span className="block text-[11px] text-slate-500">{row.universityId}{row.active ? '' : ' · disabled'}</span></span>
                    </span>
                  </td>
                  <td className="px-2 py-3"><CoinAmount value={row.balance} className="text-sm text-slate-900 dark:text-white" /></td>
                  <td className="w-[180px] px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10"><div className="h-full rounded-full bg-amber-500" style={{ width: `${percent(row.balance, total)}%` }} /></div>
                      <span className="w-9 text-right tabular-nums text-slate-500">{percent(row.balance, total)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 tabular-nums text-slate-600 dark:text-slate-300">{formatCoins(row.distributed30d)}</td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/admin/prep-coins/ledger?scope=${encodeURIComponent(row.universityId)}`} className={`${buttonClass.secondary} h-8 px-2.5`}><ReceiptText className="h-3.5 w-3.5" />Ledger</Link>
                      <Link to={`/admin/prep-coins/issue?university=${encodeURIComponent(row.universityId)}`} className={`${buttonClass.primary} h-8 px-2.5`}><Send className="h-3.5 w-3.5" />Add coins</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyHint action={data.universities.length ? null : <Link to="/admin/universities/new" className="text-xs font-semibold text-sky-700">Add a university</Link>}>{data.universities.length ? 'No university matches.' : 'No universities yet.'}</EmptyHint>}
    </Glass>
  );
}

function AccountWallets() {
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      setState({ loading: false, data: await api.coinAccounts({ role, search: query, page }), error: '' });
    } catch (failure) {
      setState({ loading: false, data: null, error: failure.message || 'Could not load account wallets.' });
    }
  }, [role, query, page]);
  useEffect(() => { load(); }, [load]);
  // Search a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const data = state.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Glass className="p-5">
      <CardHeader title="PeerPrep accounts" subtitle="Coordinators and students in the main database" Icon={Users}
        action={<Segmented label="Account type" value={role} onChange={(value) => { setRole(value); setPage(1); }} options={[{ value: '', label: 'All' }, { value: 'student', label: 'Students' }, { value: 'coordinator', label: 'Coordinators' }]} />} />
      <label className="relative mb-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or ID" aria-label="Search accounts" />
      </label>
      {state.error ? <p className="mb-3 flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{state.error}</p> : null}
      {!data ? <SkeletonRows rows={5} /> : data.accounts.length ? (
        <>
          <div className="-mx-2 overflow-x-auto">
            <table className={`w-full min-w-[640px] text-left text-xs transition-opacity ${state.loading ? 'opacity-60' : ''}`}>
              <thead><tr className="text-[11px] text-slate-500 dark:text-slate-400">{['Account', 'Type', 'Balance', 'Last change', ''].map((heading) => <th key={heading} className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.accounts.map((account) => (
                  <tr key={account.id} className="transition hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.03]">
                    <td className="px-2 py-3"><span className="block truncate font-semibold text-slate-900 dark:text-white">{account.name}</span><span className="block truncate text-[11px] text-slate-500">{account.email}{account.accountId ? ` · ${account.accountId}` : ''}</span></td>
                    <td className="px-2 py-3 capitalize text-slate-600 dark:text-slate-300">{account.role}</td>
                    <td className="px-2 py-3"><CoinAmount value={account.balance} className="text-sm text-slate-900 dark:text-white" /></td>
                    <td className="px-2 py-3 text-slate-500">{relativeTime(account.updatedAt)}</td>
                    <td className="px-2 py-3 text-right">
                      <Link to={`/admin/prep-coins/issue?role=${account.role}&search=${encodeURIComponent(account.email || account.name)}`} className={`${buttonClass.primary} h-8 px-2.5`}><Send className="h-3.5 w-3.5" />Add coins</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{formatCoins(data.total)} wallet{data.total === 1 ? '' : 's'}</span>
            <span className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className={`${buttonClass.secondary} h-8 px-2`} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              Page {page} of {pages}
              <button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className={`${buttonClass.secondary} h-8 px-2`} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </span>
          </div>
        </>
      ) : <EmptyHint action={<Link to="/admin/prep-coins/issue?role=student" className="text-xs font-semibold text-sky-700">Issue coins to an account</Link>}>{query ? 'No wallet matches this search.' : 'No PeerPrep account has a wallet yet.'}</EmptyHint>}
    </Glass>
  );
}

export default function CoinWallets() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'accounts' ? 'accounts' : 'universities';
  return (
    <CoinPage title="Wallets" subtitle="Who holds Prep Coins right now"
      actions={<>
        <Segmented label="Wallet type" value={tab} onChange={(value) => setParams(value === 'accounts' ? { tab: 'accounts' } : {}, { replace: true })}
          options={[{ value: 'universities', label: 'Universities' }, { value: 'accounts', label: 'PeerPrep accounts' }]} />
        <Link to="/admin/prep-coins/issue" className={buttonClass.primary}><Send className="h-4 w-4" />Issue coins</Link>
      </>}>
      {tab === 'accounts' ? <AccountWallets /> : <UniversityWallets />}
    </CoinPage>
  );
}
