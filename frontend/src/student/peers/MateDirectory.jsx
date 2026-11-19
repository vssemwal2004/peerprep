import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Inbox, Search, Send, Users } from 'lucide-react';
import { api } from '../../utils/api';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import { PrepMateRequestRow } from './PrepMateRequests';
import { PEER_NETWORK_EVENT, compactCount, errorMessage, peerSubtitle } from './peerNetwork';
import { PingButton, PracticeMeta, Pager } from './circleParts';
import { card, CardTitle, focusRing, Skeleton } from '../dashboard/ui';

const SORTS = [
  { key: 'recent', label: 'Newest first' },
  { key: 'active', label: 'Most active this week' },
  { key: 'name', label: 'Name A–Z' },
];
const TABS = [
  { key: 'mates', label: 'Prep Mates', Icon: Users },
  { key: 'incoming', label: 'Requests', Icon: Inbox },
  { key: 'outgoing', label: 'Sent', Icon: Send },
];

function MateCard({ mate, onPinged }) {
  return <li className="flex flex-col rounded-2xl border border-[#eef0f3] bg-[#fbfbfc] p-3.5 transition hover:border-[#dcdee4] hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]">
    <div className="flex items-center gap-3">
      <PeerAvatar name={mate.name} url={mate.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <Link to={`/student/peers/${mate.id}`} className="block truncate text-[13.5px] font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{mate.name}</Link>
        <p className="truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{peerSubtitle(mate) || 'Student'}</p>
      </div>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
      <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-inset ring-[#eef0f3] dark:bg-white/[0.03] dark:ring-white/[0.05]"><dt className="text-[10.5px] text-slate-400 dark:text-zinc-500">This week</dt><dd className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">{mate.thisWeek}</dd></div>
      <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-inset ring-[#eef0f3] dark:bg-white/[0.03] dark:ring-white/[0.05]"><dt className="text-[10.5px] text-slate-400 dark:text-zinc-500">All time</dt><dd className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">{mate.totalSolved}</dd></div>
    </dl>
    <div className="mt-2.5 flex items-center justify-between gap-2">
      <PracticeMeta streak={mate.streak} practisedToday={mate.practisedToday} />
    </div>
    <div className="mt-3 flex items-center gap-2">
      <Link to={`/student/peers/${mate.id}/compare`} className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[12px] font-semibold text-white shadow-sm hover:bg-sky-700 ${focusRing}`}><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />Compare</Link>
      <PingButton row={mate} onPinged={onPinged} />
    </div>
  </li>;
}

function RequestsList({ tab }) {
  const [list, setList] = useState({ items: [], nextBefore: null });
  const [state, setState] = useState({ loading: true, error: null });
  const load = useCallback(() => api.getPeerNetwork(tab).then((result) => { setList(result); setState({ loading: false, error: null }); })
    .catch((error) => setState({ loading: false, error })), [tab]);
  useEffect(() => {
    load();
    window.addEventListener(PEER_NETWORK_EVENT, load);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, load);
  }, [load]);
  const more = async () => {
    const next = await api.getPeerNetwork(tab, list.nextBefore).catch(() => null);
    if (next) setList((previous) => ({ ...next, items: [...previous.items, ...next.items] }));
  };
  if (state.loading) return <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (state.error) return <p className="p-4 text-[13px] text-rose-600 dark:text-rose-400">{errorMessage(state.error)}</p>;
  if (!list.items.length) return <p className="px-4 py-8 text-center text-[13px] text-slate-500 dark:text-zinc-400">{tab === 'incoming' ? 'No Prep Mate requests waiting.' : 'No pending requests sent.'}</p>;
  return <>
    <ul className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
      {list.items.map((peer) => (tab === 'incoming' && peer.relation?.mate === 'incoming'
        ? <PrepMateRequestRow key={peer.relation.requestId || peer.id} peer={peer} />
        : <li key={peer.id} className="flex items-center gap-3 px-4 py-3">
          <Link to={`/student/peers/${peer.id}`} className="flex min-w-0 flex-1 items-center gap-3"><PeerAvatar name={peer.name} url={peer.avatarUrl} size="sm" />
            <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{peer.name}</span><span className="block truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{peerSubtitle(peer)}</span></span></Link>
          <PeerActions peer={peer} relation={peer.relation} size="sm" onRelationChange={load} />
        </li>))}
    </ul>
    {list.nextBefore && <div className="border-t border-[#eef0f3] p-3 text-center dark:border-white/[0.06]"><button type="button" onClick={more} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-white/[0.05] ${focusRing}`}>Show more</button></div>}
  </>;
}

/** Your Prep Mates (searchable, sortable, paged cards), plus Requests and Sent. */
export default function MateDirectory({ summary, onPinged }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === params.get('tab')) ? params.get('tab') : 'mates';
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const load = useCallback(() => api.getPeerMates({ q: query, sort, page })
    .then((data) => setState({ loading: false, error: null, data }))
    .catch((error) => setState((current) => ({ ...current, loading: false, error }))), [query, sort, page]);
  useEffect(() => {
    if (tab !== 'mates') return undefined;
    load();
    window.addEventListener(PEER_NETWORK_EVENT, load);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, load);
  }, [tab, load]);
  const markPinged = (peerId) => {
    setState((current) => ({ ...current, data: current.data && { ...current.data, items: current.data.items.map((item) => (item.id === peerId ? { ...item, nudged: true, canNudge: false } : item)) } }));
    onPinged?.(peerId);
  };
  const counts = { mates: summary?.prepMates, incoming: summary?.incomingRequests, outgoing: null };
  const data = state.data;

  return <section id="my-prep-mates" className={card} aria-labelledby="directory-title">
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <CardTitle id="directory-title" title="Your Prep Mates" icon={Users} tone="sky" />
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Prep Mate lists">
        {TABS.map(({ key, label, Icon }) => {
          const selected = tab === key;
          const count = counts[key];
          return <button key={key} type="button" role="tab" aria-selected={selected} onClick={() => setParams(key === 'mates' ? {} : { tab: key }, { replace: true })}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${focusRing} ${selected ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900' : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            {count != null && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${key === 'incoming' && count > 0 && !selected ? 'bg-rose-500 text-white' : selected ? 'bg-white/20' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-zinc-400'}`}>{compactCount(count)}</span>}
          </button>;
        })}
      </div>
    </div>

    {tab !== 'mates' ? <div className="border-t border-[#eef0f3] dark:border-white/[0.06]"><RequestsList tab={tab} /></div> : <div className="border-t border-[#eef0f3] p-4 dark:border-white/[0.06]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search your Prep Mates" aria-label="Search your Prep Mates"
            className="h-9 w-full rounded-xl border border-[#e6e7eb] bg-white pl-9 pr-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-100" />
        </label>
        <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort Prep Mates"
          className="h-9 rounded-xl border border-[#e6e7eb] bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-sky-400 dark:border-white/[0.08] dark:bg-[#242424] dark:text-zinc-200">
          {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>
      {state.loading && !data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-44" />)}</div>
        : state.error && !data ? <p className="text-[13px] text-rose-600 dark:text-rose-400">{errorMessage(state.error)}</p>
          : !data.items.length ? <p className="py-8 text-center text-[13px] text-slate-500 dark:text-zinc-400">{query ? `No Prep Mate matches “${query}”.` : 'No Prep Mates yet. Use “Find classmates” above and send a request.'}</p>
            : <>
              <p className="mb-3 text-[12px] text-slate-500 dark:text-zinc-400">{query ? `${data.matching} of ${data.total} Prep Mates` : `${data.total} Prep Mates`}</p>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">{data.items.map((mate) => <MateCard key={mate.id} mate={mate} onPinged={markPinged} />)}</ul>
              {data.pages > 1 && <div className="mt-4"><Pager page={data.page} pages={data.pages} onPage={setPage} label="Prep Mate pages" /></div>}
            </>}
    </div>}
  </section>;
}
