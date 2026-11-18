import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Handshake, Inbox, Loader2, X } from 'lucide-react';
import { api } from '../../utils/api';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import { PrepMateRequestList, useIncomingRequests } from './PrepMateRequests';
import { PEER_NETWORK_EVENT, errorMessage, peerSubtitle } from './peerNetwork';

/**
 * Popup with a student's Prep Mates. `owner` is the student whose list it is ({ id, name,
 * avatarUrl }); `isSelf` shows "Your Prep Mates" with a Requests tab (opened first while
 * requests are waiting) and links to the full Prep Mates page.
 */
export default function PrepMatesModal({ open, onClose, owner, count, requests = 0, isSelf = false, initialTab }) {
  const [state, setState] = useState({ items: [], nextBefore: null, loading: true, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState('mates');
  const closeRef = useRef(null);
  const firstName = String(owner?.name || 'This student').split(' ')[0];
  const fetchPage = (before) => (isSelf ? api.getPeerNetwork('mates', before) : api.getPeerNetworkOf(owner.id, 'mates', before));
  const incoming = useIncomingRequests(open && isSelf);

  // Opening the popup lands on Requests while any are waiting, unless a tab was asked for.
  useEffect(() => {
    if (open) setTab(isSelf && (initialTab === 'requests' || (!initialTab && requests > 0)) ? 'requests' : 'mates');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !owner?.id) return undefined;
    const load = (quiet) => {
      if (!quiet) setState({ items: [], nextBefore: null, loading: true, error: null });
      return fetchPage()
        .then((result) => setState({ items: result.items || [], nextBefore: result.nextBefore || null, loading: false, error: null }))
        .catch((error) => setState({ items: [], nextBefore: null, loading: false, error }));
    };
    load(false);
    if (!isSelf) return undefined;
    // An accepted request adds a Prep Mate while the popup is open.
    const refresh = () => load(true);
    window.addEventListener(PEER_NETWORK_EVENT, refresh);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, owner?.id, isSelf]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await fetchPage(state.nextBefore);
      setState((prev) => ({ ...prev, items: [...prev.items, ...(more.items || [])], nextBefore: more.nextBefore || null }));
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
    } finally {
      setLoadingMore(false);
    }
  };

  const setRelation = (peerId, relation) => setState((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === peerId ? { ...item, relation } : item)) }));

  if (!open) return null;
  const total = Number.isFinite(Number(count)) ? Number(count) : state.items.length;
  const requestCount = incoming.loading ? Number(requests) || 0 : incoming.items.length;
  const showRequests = isSelf && tab === 'requests';
  const tabClass = (selected) => `relative inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected
    ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white'
    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="prep-mates-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#242424] sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><Handshake className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="prep-mates-title" className="truncate text-[15px] font-semibold text-slate-900 dark:text-zinc-50">
              {isSelf ? 'Your Prep Mates' : `${firstName}’s Prep Mates`}
              {!isSelf && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-xs font-semibold tabular-nums text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">{total}</span>}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Classmates who prepare together</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/5 dark:hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        {isSelf && (
          <div className="border-b border-slate-100 px-5 py-2.5 dark:border-zinc-800">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-zinc-800/80" role="tablist" aria-label="Prep Mates lists">
              <button type="button" role="tab" aria-selected={showRequests} onClick={() => setTab('requests')} className={tabClass(showRequests)}>
                <Inbox className="h-4 w-4" aria-hidden="true" /> Requests
                {requestCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white">{requestCount}</span>}
              </button>
              <button type="button" role="tab" aria-selected={!showRequests} onClick={() => setTab('mates')} className={tabClass(!showRequests)}>
                <Handshake className="h-4 w-4" aria-hidden="true" /> Prep Mates
                <span className="rounded-full bg-slate-200/80 px-1.5 text-[11px] tabular-nums text-slate-600 dark:bg-zinc-600 dark:text-zinc-200">{total}</span>
              </button>
            </div>
          </div>
        )}

        <div className="min-h-[13rem] flex-1 overflow-y-auto" role={isSelf ? 'tabpanel' : undefined}>
          {showRequests ? (
            <PrepMateRequestList items={incoming.items} loading={incoming.loading} error={incoming.error} onNavigate={onClose} stacked
              emptyText="No requests waiting. New ones show up here." />
          ) : state.loading ? (
            <div className="flex h-52 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
          ) : state.error ? (
            <p className="p-6 text-sm text-rose-600 dark:text-rose-400">{errorMessage(state.error)}</p>
          ) : state.items.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500"><Handshake className="h-5 w-5" aria-hidden="true" /></span>
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{isSelf ? 'No Prep Mates yet' : `${firstName} has no Prep Mates yet`}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isSelf && requestCount > 0
                  ? <button type="button" onClick={() => setTab('requests')} className="font-semibold text-sky-600 hover:underline dark:text-sky-400">You have {requestCount} {requestCount === 1 ? 'request' : 'requests'} waiting →</button>
                  : isSelf ? 'Search a classmate’s name at the top and tap “Add Prep Mate”.' : 'Prep Mates appear here once a request is accepted.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {state.items.map((peer) => (
                <li key={peer.id} className="flex items-center gap-3 px-5 py-3">
                  <Link to={peer.relation?.self ? '/student/profile' : `/student/peers/${peer.id}`} onClick={onClose}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                    <PeerAvatar name={peer.name} url={peer.avatarUrl} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{peer.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-zinc-400">{peerSubtitle(peer) || 'Student'}</span>
                    </span>
                  </Link>
                  {!isSelf && <PeerActions peer={peer} relation={peer.relation} size="sm" onRelationChange={(relation) => setRelation(peer.id, relation)} />}
                </li>
              ))}
            </ul>
          )}
          {!showRequests && state.nextBefore && !state.loading && (
            <div className="border-t border-slate-100 p-3 text-center dark:border-zinc-800">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-xl px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 disabled:opacity-60 dark:text-sky-400 dark:hover:bg-sky-950/40">
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </div>
        {isSelf && (
          <footer className="border-t border-slate-100 px-5 py-3 text-right dark:border-zinc-800">
            <Link to={showRequests ? '/student/peers?tab=incoming' : '/student/peers'} onClick={onClose} className="text-[13px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400">Open Prep Mates page →</Link>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
