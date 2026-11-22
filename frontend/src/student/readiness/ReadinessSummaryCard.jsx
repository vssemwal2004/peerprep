import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Crosshair, HelpCircle, Lock, RefreshCw, Users } from 'lucide-react';
import ReadinessExplainDialog from './ReadinessExplainDialog';
import { TRACK_META, TRACK_ORDER } from './readinessModel';
import GuideInfo from '../../guide/platform/GuideInfo';

const pill = 'inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ring-white/25 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80';

/** One track: big number, a thin bar with the target tick, and a short status. */
function Track({ name, short, track, hasEvidence, loading }) {
  const cutoff = Number(track?.cutoff) || (short === 'PBC' ? 75 : 70);
  const value = Math.max(0, Math.min(100, Number(track?.score) || 0));
  const status = !hasEvidence ? `No solves yet · target ${cutoff}` : track?.met ? `Target ${cutoff} met` : `${Math.max(0, Number(track?.remaining) || 0).toFixed(1)} to target ${cutoff}`;
  return (
    <div className="min-w-0">
      <p className="truncate text-[11.5px] font-semibold text-violet-50" title={`${name} (${short})`}>{name}</p>
      <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.04em] tabular-nums">
        {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-white/20 align-middle" /> : hasEvidence ? track?.display ?? '—' : '0'}
      </p>
      <div className="relative mt-2.5 h-1.5 rounded-full bg-white/20" aria-hidden="true">
        <div className="h-full rounded-full bg-white" style={{ width: `${loading ? 0 : value}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-white/80" style={{ left: `${cutoff}%` }} />
      </div>
      {!loading ? <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-violet-100">{track?.met && hasEvidence ? <Check className="h-3 w-3" aria-hidden="true" /> : null}{status}</p> : null}
    </div>
  );
}

/**
 * Compact Prep Readiness card, styled as the Prep Score card's twin (violet): SBC and PBC with
 * their targets, "View growth" (or `onView` for staff) and the explanation. `sharing`: the Prep
 * Mate privacy state (own profile only).
 */
export default function ReadinessSummaryCard({
  summary, loading = false, error = null, onRetry, viewTo = '/student/analysis/prep-readiness#growth', onView, sharing, readOnly = false,
  title = 'Prep Readiness', className = '', guide = 'pf-readiness',
}) {
  const [explain, setExplain] = useState(false);
  const tracks = summary?.tracks || {};
  const hasEvidence = Boolean(summary?.hasEvidence);
  const unavailable = summary && summary.available === false;

  return (
    <section aria-labelledby={`${guide}-title`} aria-busy={loading} data-guide={guide}
      className={`relative flex h-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-purple-700 text-white shadow-[0_10px_30px_-18px_rgba(124,58,237,0.85)] ${className}`}>
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />

      <header className="relative flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25"><Crosshair className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${guide}-title`} className="flex items-center gap-1.5 text-[14px] font-semibold">{title}{!readOnly ? <GuideInfo step={guide} /> : null}</h2>
          <p className="truncate text-[11px] text-violet-100">Coding practice targets</p>
        </div>
        {sharing !== undefined ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ring-white/25"
            title={sharing ? 'Accepted Prep Mates see your Prep Score and readiness values. Change it in Edit Profile → Privacy.' : 'Only you and your staff see this. Change it in Edit Profile → Privacy.'}>
            {sharing ? <Users className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}{sharing ? 'Shared' : 'Private'}
          </span>
        ) : null}
      </header>

      {unavailable ? (
        <p className="relative flex-1 px-4 py-5 text-[12.5px] text-violet-100">Needs Prep Coding, which is not enabled for this account.</p>
      ) : error && !summary ? (
        <div className="relative flex flex-1 items-center gap-2 px-4 py-5 text-[12.5px] text-violet-100">
          Could not load.
          {onRetry ? <button type="button" onClick={onRetry} className={pill}><RefreshCw className="h-3.5 w-3.5" />Retry</button> : null}
        </div>
      ) : (
        <div className="relative grid flex-1 grid-cols-2 gap-5 px-4 pt-3">
          {TRACK_ORDER.map((key) => <Track key={key} name={TRACK_META[key].full} short={TRACK_META[key].short} track={tracks[key]} hasEvidence={hasEvidence} loading={loading && !summary} />)}
        </div>
      )}

      {!unavailable ? (
        <footer className="relative mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-3">
          <button type="button" onClick={() => setExplain(true)} className="inline-flex items-center gap-1 rounded-md text-[11.5px] font-medium text-violet-100 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />{readOnly ? 'How is it calculated?' : 'How can I improve?'}
          </button>
          {onView
            ? <button type="button" onClick={onView} className={pill}>View breakdown<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
            : viewTo ? <Link to={viewTo} className={pill}>View growth<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link> : null}
        </footer>
      ) : null}
      {error && summary ? <p role="status" className="relative px-4 pb-3 text-[11px] text-violet-100">Showing the last loaded values. {onRetry ? <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button> : null}</p> : null}
      <ReadinessExplainDialog open={explain} onClose={() => setExplain(false)} tracks={summary?.policy?.tracks} />
    </section>
  );
}
