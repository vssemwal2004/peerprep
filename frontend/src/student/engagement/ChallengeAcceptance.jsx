import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../../utils/api';
import { focusRing } from '../profile/format';
import ChallengeAcceptanceCelebration from './ChallengeAcceptanceCelebration';

export default function ChallengeAcceptance({ plan, kind, enabled = true, nextHref, compact = false, onAccepted }) {
  const key = `${kind}:${plan?.periodKey || ''}`;
  const generation = useRef(0);
  const [receipt, setReceipt] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const acceptanceRef = useRef(null);
  const closeCelebration = useCallback(() => setCelebrating(false), []);
  useEffect(() => {
    generation.current += 1;
    setReceipt(null); setPending(false); setError(''); setCelebrating(false);
    return () => { generation.current += 1; };
  }, [key, enabled]);
  if (!plan?.periodKey) return null;
  const completed = plan.completed || plan.earned || (receipt?.key === key && receipt.completed);
  const accepted = Boolean(plan.acceptedAt || (receipt?.key === key && receipt.acceptedAt));
  const available = enabled && !plan.paused;
  const accept = async () => {
    if (pending) return;
    const request = generation.current;
    setPending(true); setError('');
    try {
      const result = await api.acceptStudentChallenge(kind, plan.periodKey);
      if (request === generation.current) {
        setReceipt({ ...result, key });
        if (result.acceptedAt && !result.completed) setCelebrating(true);
        onAccepted?.(result);
      }
    } catch (reason) {
      if (request === generation.current) setError(reason?.message || 'Could not accept this challenge. Please retry.');
    } finally { if (request === generation.current) setPending(false); }
  };
  return <div ref={acceptanceRef} tabIndex={-1} className={compact ? 'challenge-acceptance' : 'space-y-2 border-t border-slate-100 pt-3 dark:border-zinc-800'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {completed ? <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check size={14} />{plan.rewardPoints} XP earned</p>
        : accepted ? <p className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300"><Check size={14} />Challenge accepted</p>
          : <button type="button" disabled={!available || pending} onClick={accept} className={`rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>{pending ? 'Accepting…' : `Accept ${kind} challenge`}</button>}
      {!completed && available && nextHref && (accepted || !compact) && <Link to={nextHref} className={`inline-flex items-center gap-1 rounded text-xs font-semibold text-sky-600 dark:text-sky-400 ${focusRing}`}>Continue {kind} challenge<ArrowRight size={14} /></Link>}
    </div>
    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    <p className={compact ? 'sr-only' : 'text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400'}>{compact ? 'XP follows verified completion. Accepting is just your first step.' : 'Accepting saves your plan. Points are awarded once, after verified completion—not for accepting or opening a task.'}</p>
    {celebrating && available && createPortal(<ChallengeAcceptanceCelebration kind={kind} rewardPoints={plan.rewardPoints} nextHref={nextHref} onClose={closeCelebration} returnFocusRef={acceptanceRef} />, document.body)}
  </div>;
}
