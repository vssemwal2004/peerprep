import { useEffect, useState } from 'react';
import { Check, Clock3, Loader2, UserPlus, X } from 'lucide-react';
import { useToast } from '../../components/CustomToast';
import { ACTION_TOASTS, DECISION_TONES, PEER_TERMS, errorMessage, mateButtonState, runPeerAction } from './peerNetwork';

const base = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-[#1a1a1a]';
const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm' };
const tones = {
  primary: 'bg-sky-600 text-white shadow-sm hover:bg-sky-700',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-rose-900 dark:hover:bg-rose-950/40 dark:hover:text-rose-300',
  muted: 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-rose-900 dark:hover:text-rose-300',
  danger: 'border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

/**
 * The one Prep Mate button for a classmate: Add Prep Mate → Request sent → Prep Mates, or
 * Accept / Decline when they asked you. Removing a Prep Mate or withdrawing a request asks for a
 * second click within a few seconds.
 */
export default function PeerActions({ peer, relation, onRelationChange, size = 'md', block = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [armed, setArmed] = useState(null);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(null), 3500);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!peer?.id || !relation) return null;
  if (relation.self) {
    return <span className="inline-flex h-8 items-center rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-500 dark:bg-white/5 dark:text-zinc-400">You</span>;
  }
  const name = peer.name || 'this student';

  const act = async (action) => {
    setBusy(action);
    setArmed(null);
    try {
      const next = await runPeerAction(action, { peerId: peer.id, requestId: relation.requestId });
      if (next) onRelationChange?.(next);
      const message = ACTION_TOASTS[action]?.(name, next);
      if (message) toast.show(message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const mate = mateButtonState(relation);
  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  const width = block ? 'w-full flex-1' : '';

  if (mate.action === 'accept') {
    return (
      <div className={`flex items-center gap-2 ${block ? 'w-full' : ''}`}>
        <button type="button" disabled={busy !== null} onClick={() => act('accept')} className={`${base} ${sizes[size]} ${DECISION_TONES.accept} ${width}`} aria-label={`Accept Prep Mate request from ${name}`}>
          {busy === 'accept' ? spinner : <Check className="h-4 w-4" aria-hidden="true" />} Accept
        </button>
        <button type="button" disabled={busy !== null} onClick={() => act('decline')} className={`${base} ${sizes[size]} ${DECISION_TONES.decline} ${width}`} aria-label={`Decline Prep Mate request from ${name}`}>
          {busy === 'decline' ? spinner : <X className="h-4 w-4" aria-hidden="true" />} {PEER_TERMS.decline}
        </button>
      </div>
    );
  }

  const icon = mate.action === 'remove' ? <Check className="h-4 w-4" aria-hidden="true" />
    : mate.action === 'cancel' || mate.disabled ? <Clock3 className="h-4 w-4" aria-hidden="true" />
      : <UserPlus className="h-4 w-4" aria-hidden="true" />;
  return (
    <button
      type="button"
      disabled={busy !== null || mate.disabled}
      onClick={() => {
        if (mate.action === 'request') act('request');
        else if (mate.action) (armed === mate.action ? act(mate.action) : setArmed(mate.action));
      }}
      className={`${base} ${sizes[size]} ${armed && armed === mate.action ? tones.danger : tones[mate.tone] || tones.primary} ${width}`}
      title={mate.disabled && relation.retryAt ? `You can ask again after ${new Date(relation.retryAt).toLocaleDateString()}`
        : mate.action === 'remove' ? 'Click to remove Prep Mate' : mate.action === 'cancel' ? 'Click to withdraw the request' : undefined}
    >
      {busy === mate.action ? spinner : icon}
      {armed === 'remove' ? 'Remove Prep Mate?' : armed === 'cancel' ? 'Withdraw request?' : mate.label}
    </button>
  );
}
