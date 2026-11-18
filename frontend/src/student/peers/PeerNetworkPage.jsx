import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EyeOff, Inbox, Loader2, Search, Send, Users } from 'lucide-react';
import { api } from '../../utils/api';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import { PrepMateRequestRow } from './PrepMateRequests';
import { PEER_NETWORK_EVENT, PEER_TERMS, compactCount, errorMessage, peerSubtitle, usePeerSummary } from './peerNetwork';
import { usePeerSearch } from './usePeerSearch';

const TABS = [
  { key: 'mates', label: PEER_TERMS.prepMates, countKey: 'prepMates', empty: 'No Prep Mates yet. Search a classmate above and tap “Add Prep Mate”.' },
  { key: 'incoming', label: 'Requests', countKey: 'incomingRequests', empty: 'No Prep Mate requests waiting.' },
  { key: 'outgoing', label: 'Sent', countKey: null, empty: 'No pending requests sent.' },
];

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]';

function PeerRow({ peer, onRelationChange }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <Link to={`/student/peers/${peer.id}`} className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        <PeerAvatar name={peer.name} url={peer.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{peer.name}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-zinc-400">{peerSubtitle(peer) || 'Student'}</span>
        </span>
      </Link>
      <PeerActions peer={peer} relation={peer.relation} size="sm" onRelationChange={(relation) => onRelationChange(peer.id, relation)} />
    </li>
  );
}

export default function PeerNetworkPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === params.get('tab')) ? params.get('tab') : 'mates';
  const { summary } = usePeerSummary(true);
  const [list, setList] = useState({ tab: null, items: [], nextBefore: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const search = usePeerSearch(query);

  // Opening the page with requests waiting (and no tab chosen) lands on Requests, once.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !summary) return;
    landed.current = true;
    if (!params.get('tab') && summary.incomingRequests > 0) setParams({ tab: 'incoming' }, { replace: true });
  }, [summary, params, setParams]);

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    return api.getPeerNetwork(tab)
      .then((result) => { setList(result); setError(null); })
      .catch((reason) => setError(reason))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => load(true);
    window.addEventListener(PEER_NETWORK_EVENT, refresh);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, refresh);
  }, [load]);

  const loadMore = async () => {
    if (!list.nextBefore) return;
    setLoadingMore(true);
    try {
      const more = await api.getPeerNetwork(tab, list.nextBefore);
      setList((prev) => ({ ...more, items: [...prev.items, ...more.items] }));
    } catch (reason) {
      setError(reason);
    } finally {
      setLoadingMore(false);
    }
  };

  const updateRelation = (peerId, relation) => {
    const apply = (items) => items.map((item) => (item.id === peerId ? { ...item, relation } : item));
    setList((prev) => ({ ...prev, items: apply(prev.items) }));
    search.patch(peerId, relation);
  };

  const activeTab = TABS.find((item) => item.key === tab);
  const searching = query.trim().length >= 2;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-5 sm:px-6">
      <header className="mb-5 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          <Users className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Prep Mates
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Find classmates from your university and send a Prep Mate request. Once they accept, you are Prep Mates.
        </p>
      </header>

      {summary && summary.visibleToPeers === false && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Your profile is hidden from classmates, so you can browse but not connect. Turn on <strong>Visible to peers</strong> in <Link to="/student/profile" className="font-semibold underline">Edit Profile</Link>.</p>
        </div>
      )}

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search classmates by name"
          aria-label="Search classmates by name"
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 dark:border-zinc-700 dark:bg-[#242424] dark:text-white"
        />
        {search.loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
      </div>

      {searching ? (
        <section className={card} aria-label="Search results">
          {search.error ? (
            <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{search.error}</p>
          ) : search.results.length === 0 && !search.loading ? (
            <p className="p-5 text-sm text-slate-500 dark:text-zinc-400">No classmates match “{query.trim()}”.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {search.results.map((peer) => <PeerRow key={peer.id} peer={peer} onRelationChange={updateRelation} />)}
            </ul>
          )}
        </section>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Peer lists">
            {TABS.map((item) => {
              const count = item.countKey ? summary?.[item.countKey] : null;
              const selected = item.key === tab;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setParams(item.key === 'mates' ? {} : { tab: item.key }, { replace: true })}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-[#242424] dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-white/5'}`}
                >
                  {item.key === 'incoming' && <Inbox className="h-4 w-4" aria-hidden="true" />}
                  {item.key === 'outgoing' && <Send className="h-4 w-4" aria-hidden="true" />}
                  {item.label}
                  {count !== null && count !== undefined && (
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? 'bg-white/20' : item.key === 'incoming' && count > 0 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{compactCount(count)}</span>
                  )}
                </button>
              );
            })}
          </div>

          <section className={card} role="tabpanel" aria-label={activeTab.label}>
            {loading ? (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800" aria-busy="true">
                {[0, 1, 2].map((key) => (
                  <li key={key} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
                    <span className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" />
                  </li>
                ))}
              </ul>
            ) : error ? (
              <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{errorMessage(error)}</p>
            ) : list.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500 dark:text-zinc-400">{activeTab.empty}</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {list.items.map((peer) => (tab === 'incoming' && peer.relation?.mate === 'incoming'
                    ? <PrepMateRequestRow key={peer.relation.requestId || peer.id} peer={peer} />
                    : <PeerRow key={peer.id} peer={peer} onRelationChange={updateRelation} />))}
                </ul>
                {list.nextBefore && (
                  <div className="border-t border-slate-100 p-3 text-center dark:border-zinc-800">
                    <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-xl px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 disabled:opacity-60 dark:text-sky-400 dark:hover:bg-sky-950/40">
                      {loadingMore ? 'Loading…' : 'Show more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
