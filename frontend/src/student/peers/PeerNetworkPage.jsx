import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, EyeOff, Inbox, Loader2, Medal, Search, Users } from 'lucide-react';
import { api } from '../../utils/api';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import RaceBoard from './RaceBoard';
import MateDirectory from './MateDirectory';
import { PEER_NETWORK_EVENT, compactCount, errorMessage, peerSubtitle, usePeerSummary } from './peerNetwork';
import { usePeerSearch } from './usePeerSearch';
import { card, focusRing, TitleIcon } from '../dashboard/ui';

/** Search any classmate in your university (not only Prep Mates) and send a request from the list. */
function FindClassmates() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const search = usePeerSearch(query);
  const box = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const searching = query.trim().length >= 2;
  return <div ref={box} className="relative w-full sm:w-80">
    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    <input type="search" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      placeholder="Find classmates by name" aria-label="Find classmates by name"
      className="h-10 w-full rounded-xl border border-[#e6e7eb] bg-white pl-10 pr-9 text-[13.5px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-[#242424] dark:text-white" />
    {search.loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
    {open && searching && <div className="absolute right-0 z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[#e6e7eb] bg-white shadow-xl sm:w-[420px] dark:border-white/[0.08] dark:bg-[#242424]" role="listbox" aria-label="Classmates">
      {search.error ? <p className="p-4 text-[13px] text-rose-600 dark:text-rose-400">{search.error}</p>
        : !search.results.length && !search.loading ? <p className="p-4 text-[13px] text-slate-500 dark:text-zinc-400">No classmates match “{query.trim()}”.</p>
          : <ul className="max-h-80 divide-y divide-[#eef0f3] overflow-y-auto dark:divide-white/[0.06]">
            {search.results.map((peer) => <li key={peer.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <Link to={`/student/peers/${peer.id}`} className="flex min-w-0 flex-1 items-center gap-2.5"><PeerAvatar name={peer.name} url={peer.avatarUrl} size="sm" />
                <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">{peer.name}</span><span className="block truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{peerSubtitle(peer) || 'Student'}</span></span></Link>
              <PeerActions peer={peer} relation={peer.relation} size="sm" onRelationChange={(relation) => search.patch(peer.id, relation)} />
            </li>)}
          </ul>}
    </div>}
  </div>;
}

function StatTile({ icon, tone, label, value, hint, to }) {
  const body = <>
    <TitleIcon icon={icon} tone={tone} />
    <div className="min-w-0">
      <p className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>
      <p className="text-[20px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{value}<span className="ml-1 text-[12px] font-medium text-slate-400 dark:text-zinc-500">{hint}</span></p>
    </div>
  </>;
  const className = `${card} flex items-center gap-3 p-3.5`;
  return to ? <Link to={to} className={`${className} transition hover:border-[#dcdee4] ${focusRing}`}>{body}</Link> : <div className={className}>{body}</div>;
}

/** The race data, shared by the summary tiles, the race board and the today card. */
function useCircle() {
  const [period, setPeriod] = useState('week');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const load = useCallback(() => api.getPeerCircle(period, { page, q: query })
    .then((data) => setState({ loading: false, error: '', data }))
    .catch((error) => setState((current) => ({ ...current, loading: false, error: errorMessage(error) }))), [period, page, query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener(PEER_NETWORK_EVENT, refresh);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, refresh);
  }, [load]);
  const markPinged = (peerId) => setState((current) => {
    if (!current.data) return current;
    const patch = (row) => (row?.id === peerId ? { ...row, nudged: true, canNudge: false } : row);
    return { ...current, data: { ...current.data, rows: current.data.rows.map(patch), podium: current.data.podium.map(patch) } };
  });
  return {
    ...state, reload: load, period, page, query, markPinged,
    setPeriod: (value) => { setPeriod(value); setPage(1); },
    setPage, setQuery: (value) => { setQuery(value); setPage(1); },
  };
}

export default function PeerNetworkPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { summary } = usePeerSummary(true);
  const circle = useCircle();

  // Opening the page with requests waiting (and no tab chosen) lands on Requests, once.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !summary) return;
    landed.current = true;
    if (!params.get('tab') && summary.incomingRequests > 0) navigate('/student/peers?tab=incoming', { replace: true });
  }, [summary, params, navigate]);

  const you = circle.data?.you;
  return <div className="min-h-[calc(100dvh-65px)] bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white"><Users className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />Prep Mates</h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-zinc-400">See where you stand among classmates from your university and compare your practice with any Prep Mate.</p>
        </div>
        <FindClassmates />
      </header>

      {summary && summary.visibleToPeers === false && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Your profile is hidden from classmates, so you can browse but not connect. Turn on <strong>Visible to peers</strong> in <Link to="/student/profile" className="font-semibold underline">Edit Profile</Link>.</p>
      </div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} tone="sky" label="Prep Mates" value={compactCount(summary?.prepMates ?? 0)} to="/student/peers#my-prep-mates" />
        <StatTile icon={Inbox} tone="rose" label="Requests waiting" value={compactCount(summary?.incomingRequests ?? 0)} to="/student/peers?tab=incoming" />
        <StatTile icon={Medal} tone="amber" label={`Your rank ${{ week: 'this week', month: 'this month', all: 'all time' }[circle.period]}`} value={you ? `#${you.rank}` : '—'} hint={circle.data ? `of ${circle.data.total}` : ''} />
        <StatTile icon={CalendarCheck} tone="emerald" label="Practised today" value={circle.data?.practisedToday ?? 0} hint={circle.data ? `of ${circle.data.mates}` : ''} />
      </div>

      {/* One column, built around comparing: the ranking (Compare on every row) and your Prep Mates. */}
      <div className="min-w-0 space-y-6">
        <RaceBoard circle={circle} period={circle.period} onPeriod={circle.setPeriod} onPage={circle.setPage}
          query={circle.query} onQuery={circle.setQuery} onPinged={circle.markPinged} />
        <MateDirectory summary={summary} onPinged={circle.markPinged} />
      </div>
    </div>
  </div>;
}
