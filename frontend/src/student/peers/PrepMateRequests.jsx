import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Inbox, Loader2, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import PeerAvatar from './PeerAvatar';
import { ACTION_TOASTS, DECISION_TONES, PEER_NETWORK_EVENT, errorMessage, peerSubtitle, runPeerAction, timeAgo } from './peerNetwork';

/** The signed-in student's pending Prep Mate requests, kept fresh by network events. */
export function useIncomingRequests(enabled = true) {
  const [state, setState] = useState({ items: [], loading: Boolean(enabled), error: null });
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve([]);
    return api.getPeerNetwork('incoming')
      .then((result) => {
        const items = result?.items || [];
        setState({ items, loading: false, error: null });
        return items;
      })
      .catch((error) => { setState((prev) => ({ ...prev, loading: false, error })); return []; });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: null });
      return undefined;
    }
    setState((prev) => (prev.items.length ? prev : { ...prev, loading: true }));
    load();
    window.addEventListener(PEER_NETWORK_EVENT, load);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, load);
  }, [enabled, load]);

  return { ...state, reload: load };
}

const buttonBase = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-[#1a1a1a]';
const buttonSizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };

/** Green Accept + red Decline for one request. Calls onDecided('accept' | 'decline') on success. */
export function RequestDecisionButtons({ peer, requestId, size = 'sm', onDecided, block = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const name = peer?.name || 'this student';

  const decide = async (action) => {
    setBusy(action);
    try {
      await runPeerAction(action, { peerId: peer?.id, requestId });
      toast.show(ACTION_TOASTS[action](name));
      onDecided?.(action);
    } catch (error) {
      toast.error(errorMessage(error));
      // A request withdrawn or already answered elsewhere: refresh the lists.
      if (error?.response?.status === 409) onDecided?.('gone');
    } finally {
      setBusy(null);
    }
  };

  const width = block ? 'flex-1' : '';
  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  return (
    <div className={`flex items-center gap-2 ${block ? 'w-full' : ''}`}>
      <button type="button" disabled={busy !== null} onClick={() => decide('accept')}
        className={`${buttonBase} ${buttonSizes[size]} ${DECISION_TONES.accept} ${width}`} aria-label={`Accept Prep Mate request from ${name}`}>
        {busy === 'accept' ? spinner : <Check className="h-4 w-4" aria-hidden="true" />} Accept
      </button>
      <button type="button" disabled={busy !== null} onClick={() => decide('decline')}
        className={`${buttonBase} ${buttonSizes[size]} ${DECISION_TONES.decline} ${width}`} aria-label={`Decline Prep Mate request from ${name}`}>
        {busy === 'decline' ? spinner : <X className="h-4 w-4" aria-hidden="true" />} Decline
      </button>
    </div>
  );
}

const OUTCOME = {
  accept: { label: 'Now Prep Mates', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20', Icon: Check },
  decline: { label: 'Declined', className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20', Icon: X },
  gone: { label: 'No longer open', className: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10', Icon: X },
};

/** One received request: who asked, when, and Accept / Decline (then the outcome in place). */
export function PrepMateRequestRow({ peer, onNavigate, onDecided, stacked = false }) {
  const [outcome, setOutcome] = useState(null);
  const done = outcome ? OUTCOME[outcome] : null;
  const since = timeAgo(peer.since);
  return (
    <li className={`flex gap-3 px-4 py-3 ${stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center'}`}>
      <Link to={`/student/peers/${peer.id}`} onClick={onNavigate}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        <PeerAvatar name={peer.name} url={peer.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{peer.name}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-zinc-400">
            {[peerSubtitle(peer) || 'Student', since && `asked ${since === 'Just now' ? 'just now' : since}`].filter(Boolean).join(' · ')}
          </span>
        </span>
      </Link>
      {done ? (
        <span className={`inline-flex h-8 items-center gap-1.5 self-start rounded-xl px-3 text-xs font-semibold ring-1 ring-inset sm:self-center ${done.className}`}>
          <done.Icon className="h-3.5 w-3.5" aria-hidden="true" /> {done.label}
        </span>
      ) : (
        <RequestDecisionButtons peer={peer} requestId={peer.relation?.requestId} block={stacked}
          onDecided={(action) => { setOutcome(action); onDecided?.(action, peer); }} />
      )}
    </li>
  );
}

/** Pending requests as a list, with loading / empty / error states. */
export function PrepMateRequestList({ items, loading, error, onNavigate, emptyText = 'No Prep Mate requests waiting.', stacked = false }) {
  if (loading) {
    return <div className="flex h-32 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>;
  }
  if (error) return <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{errorMessage(error)}</p>;
  if (!items.length) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500"><Inbox className="h-5 w-5" aria-hidden="true" /></span>
        <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
      {items.map((peer) => <PrepMateRequestRow key={peer.relation?.requestId || peer.id} peer={peer} onNavigate={onNavigate} stacked={stacked} />)}
    </ul>
  );
}
