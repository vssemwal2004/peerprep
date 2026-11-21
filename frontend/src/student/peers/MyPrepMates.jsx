import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PrepMatesModal from './PrepMatesModal';
import { PrepMatesButton } from './PeerProfileCards';
import { canUsePeers, usePeerSummary } from './peerNetwork';

/** The signed-in student's own Prep Mates count + popup list, for their profile card. */
export default function MyPrepMates({ compact = false }) {
  const { user } = useAuth();
  const enabled = canUsePeers(user);
  const { summary } = usePeerSummary(enabled);
  const [open, setOpen] = useState(null);
  if (!enabled) return null;
  const requests = summary?.incomingRequests || 0;
  return (
    <div className="h-full w-full">
      <PrepMatesButton count={summary?.prepMates} onOpen={() => setOpen('mates')} label="your Prep Mates" compact={compact} />
      {requests > 0 && (
        <button type="button" onClick={() => setOpen('requests')}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-500/10">
          <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/60 motion-reduce:hidden" aria-hidden="true" />
            <span className="relative">{requests}</span>
          </span>
          {compact ? `${requests === 1 ? 'Request' : 'Requests'} · Review` : `Prep Mate ${requests === 1 ? 'request' : 'requests'} waiting · Review`}
        </button>
      )}
      <PrepMatesModal open={Boolean(open)} initialTab={open || undefined} onClose={() => setOpen(null)} owner={{ id: String(user?._id || ''), name: user?.name }}
        count={summary?.prepMates} requests={requests} isSelf />
    </div>
  );
}
