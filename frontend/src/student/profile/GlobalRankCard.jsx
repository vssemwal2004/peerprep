import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

export default function GlobalRankCard({ className = '', scoreRevision, showLink = true }) {
  const { user } = useAuth();
  const identity = user?._id || user?.id;
  const enabled = Boolean(identity && user?.accessScope !== 'assessment_only');
  const [state, setState] = useState({ identity: null, loading: true, data: null });
  const sequence = useRef(0);
  const discardRequests = useCallback(() => { sequence.current += 1; }, []);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++sequence.current;
    setState({ identity, loading: true, data: null });
    try {
      const response = await api.getStudentGlobalRanking();
      if (request === sequence.current) setState({ identity, loading: false, data: response.ranking });
    } catch {
      if (request === sequence.current) setState({ identity, loading: false, data: { status: 'unavailable' } });
    }
  }, [enabled, identity]);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 5 * 60_000);
    return () => { discardRequests(); window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, scoreRevision, discardRequests]);
  if (!enabled) return null;
  const loading = state.identity !== identity || state.loading;
  const data = state.identity === identity ? state.data : null;
  const ranked = !loading && data?.status === 'ready' && Number.isSafeInteger(data.rank) && data.rank > 0 && data.rank <= data.totalStudents;
  const messages = {
    not_connected: 'Global ranking needs a connection to the PeerPrep central server.',
    syncing: 'Your university scores are syncing. Check again shortly.',
    unavailable: 'Global ranking is temporarily unavailable. Your university rank is unaffected.',
    unranked: 'Complete a question, lesson or assessment to enter the global ranking.',
  };
  return <section aria-label="Global standing" aria-busy={loading} className={`rounded-xl border border-slate-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-[#242424] ${className}`}>
    <header className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-zinc-50"><Globe2 className="h-4 w-4 text-sky-500" aria-hidden="true" />Global standing</h2>
      <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh global rank" className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40 dark:hover:bg-white/5"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /></button>
    </header>
    {loading ? <p role="status" className="mt-3 text-xs text-slate-500">Loading global rank…</p> : ranked ? <>
      <p className="mt-3 text-[28px] font-semibold tracking-tight text-slate-950 dark:text-zinc-50">#{data.rank.toLocaleString()}<span className="ml-2 text-xs font-normal tracking-normal text-slate-500 dark:text-zinc-400">of {data.totalStudents.toLocaleString()} students{data.tied ? ' · tied' : ''}</span></p>
      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Prep Score {Number(data.score).toLocaleString(undefined, { maximumFractionDigits: 1 })} · {data.universities} universities</p>
    </> : <p role="status" className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{messages[data?.status] || messages.unavailable}</p>}
    {!loading && data?.partial && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Partial coverage: {data.universities} of {data.totalUniversities} universities synced.</p>}
    {!loading && data?.updatedAt && <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400">Synced {new Date(data.updatedAt).toLocaleString()} · Updates about every 5 minutes</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] dark:border-zinc-800">
      <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Only your rank is visible</span>
      {showLink && <Link to="/student/rankings" className="rounded font-semibold text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-400">View rankings</Link>}
    </div>
  </section>;
}
