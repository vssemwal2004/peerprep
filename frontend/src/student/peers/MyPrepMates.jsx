import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PrepMatesModal from './PrepMatesModal';
import { PrepMatesButton } from './PeerProfileCards';
import { canUsePeers, usePeerSummary } from './peerNetwork';

/** The signed-in student's own Prep Mates count + popup list, for their profile card. */
export default function MyPrepMates() {
  const { user } = useAuth();
  const enabled = canUsePeers(user);
  const { summary } = usePeerSummary(enabled);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const requests = summary?.incomingRequests || 0;
  return (
    <div className="w-full">
      <PrepMatesButton count={summary?.prepMates} onOpen={() => setOpen(true)} label="your Prep Mates" />
      {requests > 0 && (
        <Link to="/student/peers?tab=incoming" className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg py-1 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{requests}</span>
          Prep Mate {requests === 1 ? 'request' : 'requests'} waiting
        </Link>
      )}
      <PrepMatesModal open={open} onClose={() => setOpen(false)} owner={{ id: String(user?._id || ''), name: user?.name }} count={summary?.prepMates} isSelf />
    </div>
  );
}
