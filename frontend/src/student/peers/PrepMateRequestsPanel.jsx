import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { PrepMateRequestRow, useIncomingRequests } from './PrepMateRequests';

const SHOWN = 3;

/**
 * Pinned at the top of the notification panel while Prep Mate requests are waiting, so they can be
 * answered right there (green Accept / red Decline). Renders nothing when there are none.
 */
export default function PrepMateRequestsPanel({ onNavigate }) {
  const { items, loading } = useIncomingRequests(true);
  if (loading || !items.length) return null;
  const more = items.length - SHOWN;
  return (
    <section aria-label="Prep Mate requests" className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-indigo-50/70 to-white px-5 py-3 dark:border-slate-800 dark:from-indigo-500/[0.07] dark:to-slate-950">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-white" aria-hidden="true"><UserPlus className="h-4 w-4" /></span>
        <h3 className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-white">Prep Mate requests</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">{items.length}</span>
      </div>
      <ul className="-mx-4 divide-y divide-slate-100 dark:divide-slate-800">
        {items.slice(0, SHOWN).map((peer) => <PrepMateRequestRow key={peer.relation?.requestId || peer.id} peer={peer} onNavigate={onNavigate} />)}
      </ul>
      {more > 0 && (
        <Link to="/student/peers?tab=incoming" onClick={onNavigate} className="mt-1 block text-right text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400">
          See all {items.length} requests →
        </Link>
      )}
    </section>
  );
}
