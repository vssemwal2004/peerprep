import { Link } from 'react-router-dom';
import { Gauge, Lock, Users } from 'lucide-react';
import ReadinessSummaryCard from './ReadinessSummaryCard';
import { formatScore } from '../prepScore/formatScore';

/** Prep Score, styled as the own profile's Prep Score card (sky), read-only. */
function SharedPrepScoreCard({ value, name, isSelf }) {
  return (
    <section aria-labelledby="peer-prep-score-title" className="relative flex h-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-sky-800 text-white shadow-[0_10px_30px_-18px_rgba(2,132,199,0.8)]">
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />
      <header className="relative flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25"><Gauge className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="peer-prep-score-title" className="text-[14px] font-semibold">Prep Score</h2>
          <p className="truncate text-[11px] text-sky-100">Activity points from practice</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ring-white/25"><Users className="h-3 w-3" aria-hidden="true" />{isSelf ? 'Shared' : `Shared by ${name}`}</span>
      </header>
      <p className="relative flex-1 px-4 pt-3 text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums">{value == null ? '—' : formatScore(value)}</p>
      <p className="relative px-4 pb-3.5 pt-3 text-[11px] text-sky-100/90">Visible to accepted Prep Mates only</p>
    </section>
  );
}

/**
 * Prep Score + Prep Readiness on a classmate's profile, the twins of the own profile's cards.
 * Only what the student chose to share with accepted Prep Mates (server: sharedSummaryFor);
 * otherwise a compact "private" notice. Never topics, attempts or notes.
 * shared: { prepScore, readiness: { sbc: { score, display, met, cutoff, remaining }, pbc }, hasEvidence } | null
 */
export default function SharedScoresCard({ shared, name = 'This student', isSelf = false }) {
  if (!shared) {
    return (
      <section data-guide="pp-shared" aria-label="Prep Score and Prep Readiness"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10"><Lock className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{isSelf ? 'Your Prep Score and Prep Readiness are private' : `${name}’s Prep Score and Prep Readiness are private`}</p>
          <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">{isSelf ? 'Prep Mates see them only if you switch sharing on.' : 'They appear here only if the student shares them with Prep Mates.'}</p>
        </div>
        {isSelf ? <Link to="/student/profile" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10">Edit Profile → Privacy</Link> : null}
      </section>
    );
  }
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2" data-guide="pp-shared">
      <SharedPrepScoreCard value={shared.prepScore} name={name} isSelf={isSelf} />
      {shared.readiness ? (
        <ReadinessSummaryCard readOnly viewTo={null} guide="pp-readiness"
          summary={{ available: true, hasEvidence: shared.hasEvidence, tracks: shared.readiness }} />
      ) : null}
    </div>
  );
}
