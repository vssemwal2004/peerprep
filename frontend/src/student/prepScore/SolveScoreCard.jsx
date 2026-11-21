import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck2, Check, Coins, Crosshair, Flame, Gauge, Lightbulb, X } from 'lucide-react';
import { formatPoints, resetLabel } from './topicQuota';

/**
 * The card after a submission that changed the Prep Score: points per topic, a note when a topic is
 * full for today (with topics that still pay), and the daily challenge completion. Bottom-right,
 * non-blocking, closes by itself.
 */
export default function SolveScoreCard({ card, onClose, autoHideMs = 14000 }) {
  useEffect(() => {
    if (!card) return undefined;
    const timer = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(timer);
  }, [card, onClose, autoHideMs]);
  if (!card) return null;
  const { solve, challenge } = card;
  const fullTopics = solve?.fullTopics || [];
  return (
    <motion.aside initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
      role="status" aria-live="polite"
      className="fixed bottom-5 right-5 z-[45] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[#262626]">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-[0_8px_18px_-10px_rgba(2,132,199,0.9)]"><Gauge className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">Prep Score</p>
          <p className="text-[22px] font-bold leading-tight tabular-nums text-slate-950 dark:text-white">
            +{formatPoints((solve?.points || 0) + (challenge?.points || 0))}
            {solve?.total !== undefined ? <span className="ml-2 text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">now {formatPoints(solve.total)}</span> : null}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      {solve?.parts?.length ? (
        <ul className="flex flex-wrap gap-1.5 px-4 pb-3">
          {solve.parts.map((part) => (
            <li key={part.topic} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${part.counted
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
              : 'bg-slate-100 text-slate-500 ring-slate-200 line-through decoration-slate-400 dark:bg-white/[0.05] dark:text-zinc-400 dark:ring-white/10'}`}>
              {part.counted ? <Check className="h-3 w-3" aria-hidden="true" /> : null}{part.topic}{part.counted ? ` +${formatPoints(part.points)}` : ' · full today'}
            </li>
          ))}
        </ul>
      ) : null}

      {fullTopics.length ? (
        <div className="mx-4 mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-400/20">
          <p className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />{fullTopics.join(', ')} {fullTopics.length === 1 ? 'is' : 'are'} done for today ({solve.limit}/{solve.limit})</p>
          <p className="mt-0.5">{solve.allFull
            ? `Every tag was full, so this solve earned 0 base points. It still counts toward Prep Readiness. Tags pay again after ${resetLabel(solve.resetsAt)}.`
            : `Their share went to the tags with room. They pay again after ${resetLabel(solve.resetsAt)}.`}</p>
          {solve.alternative ? (
            <a href={solve.alternative.url} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 dark:bg-white/[0.06] dark:text-emerald-300 dark:ring-emerald-400/20">
              Next that still pays: {solve.alternative.title} ({solve.alternative.difficulty}) →
            </a>
          ) : solve.suggestions?.length ? <p className="mt-1.5 flex flex-wrap gap-1.5">{solve.suggestions.map((topic) => <span key={topic} className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-white/[0.06] dark:text-amber-100 dark:ring-amber-400/20">{topic}</span>)}</p> : null}
        </div>
      ) : null}

      {card.readiness ? (
        <div className="mx-4 mb-3 rounded-xl bg-violet-50 px-3 py-2.5 text-[12px] text-violet-900 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:text-violet-100 dark:ring-violet-400/20">
          <p className="flex items-center gap-1.5 font-semibold"><Crosshair className="h-3.5 w-3.5" aria-hidden="true" />Prep Readiness · {card.readiness.label}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
            {['sbc', 'pbc'].map((key) => {
              const track = card.readiness.tracks?.[key];
              if (!track) return null;
              const note = track.excluded ? 'topic not in this track' : track.wasComplete ? 'topic target already met' : null;
              return <span key={key}><b>{key === 'sbc' ? 'Service-Based' : 'Product-Based'}</b> {track.display}{note ? <span className="text-violet-700/70 dark:text-violet-200/70"> · {note}</span> : track.delta > 0 ? <span className="font-semibold text-emerald-700 dark:text-emerald-300"> +{track.delta.toFixed(2)}</span> : null}</span>;
            })}
          </p>
        </div>
      ) : null}

      {challenge ? (
        <div className="flex items-center gap-3 border-t border-violet-100 bg-gradient-to-r from-violet-50 to-sky-50 px-4 py-3 dark:border-white/[0.06] dark:from-violet-500/10 dark:to-sky-500/[0.06]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><CalendarCheck2 className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p className="font-semibold text-slate-900 dark:text-white">Daily challenge complete</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-slate-600 dark:text-zinc-300">
              {challenge.points ? <span>+{formatPoints(challenge.points)} Prep Score</span> : null}
              {challenge.coins ? <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />+{challenge.coins}</span> : null}
              <span className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-300"><Flame className="h-3.5 w-3.5" aria-hidden="true" />Prep Streak {challenge.streak} {challenge.streak === 1 ? 'day' : 'days'}</span>
            </p>
          </div>
        </div>
      ) : null}
    </motion.aside>
  );
}
