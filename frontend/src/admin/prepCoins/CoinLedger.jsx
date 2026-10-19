import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, ReceiptText, RefreshCw, Send } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, EmptyHint, Glass, SkeletonRows } from '../../overview/ui';
import { CoinAmount, CoinPage, KindChip, LiveBadge } from './shared';
import { KIND_GROUPS, buttonClass, inputClass } from './coinModel';

const LIVE_MS = 30_000;

const dayLabel = (value) => new Date(value).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function CoinLedger() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const scope = params.get('scope') || '';
  const [universities, setUniversities] = useState([]);
  const [entries, setEntries] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const entriesRef = useRef(null);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => { api.platformWallets().then((result) => setUniversities(result.universities || [])).catch(() => {}); }, []);

  const loadFirst = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await api.coinLedger({ kind, scope });
      const current = entriesRef.current;
      if (silent && current) {
        // Live refresh: add only new rows on top, keep any older pages already loaded, and highlight them.
        const known = new Set(current.map((row) => row.id));
        const fresh = result.entries.filter((row) => !known.has(row.id));
        setFreshIds(new Set(fresh.map((row) => row.id)));
        if (fresh.length) setEntries([...fresh, ...current]);
      } else {
        setEntries(result.entries);
        setCursor(result.nextCursor);
      }
      setError('');
      setUpdatedAt(new Date());
    } catch (failure) {
      setError(failure.message || 'Could not load the ledger.');
    } finally { setLoading(false); }
  }, [kind, scope]);

  useEffect(() => { entriesRef.current = null; setEntries(null); setFreshIds(new Set()); loadFirst(); }, [loadFirst]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadFirst({ silent: true }); }, LIVE_MS);
    return () => clearInterval(timer);
  }, [loadFirst]);

  async function loadOlder() {
    setLoading(true);
    try {
      const result = await api.coinLedger({ kind, scope, before: cursor });
      setEntries((current) => [...(current || []), ...result.entries]);
      setCursor(result.nextCursor);
    } catch (failure) {
      setError(failure.message || 'Could not load older movements.');
    } finally { setLoading(false); }
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const days = useMemo(() => {
    const groups = [];
    for (const row of entries || []) {
      const label = dayLabel(row.createdAt);
      if (groups.at(-1)?.label !== label) groups.push({ label, rows: [] });
      groups.at(-1).rows.push(row);
    }
    return groups;
  }, [entries]);

  return (
    <CoinPage title="Ledger" subtitle="Every Prep Coin movement, newest first. New movements appear on their own"
      live={<LiveBadge updatedAt={updatedAt} loading={loading} />}
      actions={<>
        <button type="button" onClick={() => loadFirst()} className={buttonClass.secondary} aria-label="Refresh ledger"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <Link to="/admin/prep-coins/issue" className={buttonClass.primary}><Send className="h-4 w-4" />Issue coins</Link>
      </>}>
      <Glass className="p-5">
        <CardHeader title="Movements" Icon={ReceiptText} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Movement type" className="inline-flex flex-wrap rounded-xl bg-slate-900/[0.05] p-0.5 dark:bg-white/[0.06]">
            {KIND_GROUPS.map((group) => (
              <button key={group.value || 'all'} type="button" role="tab" aria-selected={kind === group.value} onClick={() => setFilter('kind', group.value)}
                className={`rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition ${kind === group.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>{group.label}</button>
            ))}
          </div>
          <select className={`${inputClass} h-9 w-auto min-w-[200px] text-xs`} value={scope} onChange={(event) => setFilter('scope', event.target.value)} aria-label="Wallet">
            <option value="">Every wallet</option>
            <option value="main">PeerPrep main accounts</option>
            {universities.map((university) => <option key={university.universityId} value={university.universityId}>{university.name}</option>)}
          </select>
        </div>
        {error ? <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4" />{error}</p> : null}
        {!entries ? <SkeletonRows rows={6} /> : days.length ? (
          <div className="space-y-5">
            {days.map((day) => (
              <div key={day.label}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{day.label}</p>
                <ul className="divide-y divide-slate-100 dark:divide-white/5">
                  {day.rows.map((row) => (
                    <li key={row.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-2.5 transition-colors duration-1000 sm:grid-cols-[64px_160px_minmax(0,1fr)_170px_120px] ${freshIds.has(row.id) ? 'bg-amber-50 dark:bg-amber-400/10' : ''}`}>
                      <span className="hidden text-[11px] tabular-nums text-slate-500 sm:block">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="hidden sm:block"><KindChip kind={row.kind} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-900 dark:text-white">{row.from} → {row.to}</span>
                        <span className="block truncate text-[11px] text-slate-500">{row.feature || (row.kind === 'topup' || row.kind === 'initial' ? 'University wallet' : 'Transfer')}<span className="sm:hidden"> · {row.scope}</span></span>
                      </span>
                      <span className="hidden truncate text-[11px] text-slate-500 sm:block">{row.scope}</span>
                      <span className="text-right"><CoinAmount value={row.amount} sign={row.kind === 'student_spend' ? '−' : '+'} className={row.kind === 'student_spend' ? 'text-xs text-amber-700 dark:text-amber-300' : 'text-xs text-emerald-700 dark:text-emerald-300'} /></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {cursor ? <div className="flex justify-center"><button type="button" onClick={loadOlder} disabled={loading} className={buttonClass.secondary}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Load older movements</button></div> : <p className="text-center text-[11px] text-slate-400">That is every movement{kind || scope ? ' for these filters' : ''}.</p>}
          </div>
        ) : <EmptyHint>{kind || scope ? 'No movements match these filters.' : 'No coins have moved yet.'}</EmptyHint>}
      </Glass>
    </CoinPage>
  );
}
