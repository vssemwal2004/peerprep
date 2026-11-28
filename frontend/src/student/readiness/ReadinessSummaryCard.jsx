import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Crosshair, HelpCircle, Lock, Minus, RefreshCw, TrendingDown, TrendingUp, Users } from 'lucide-react';
import ReadinessExplainDialog from './ReadinessExplainDialog';
import { smoothPath, TRACK_META, TRACK_ORDER, trendOf } from './readinessModel';
import GuideInfo from '../../guide/platform/GuideInfo';

const pill = 'inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ring-white/25 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80';

/** Up / down / flat chip for the last 30 days. */
function ChangeChip({ change }) {
  const up = change > 0.05, down = change < -0.05;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const tone = up ? 'bg-emerald-400/20 text-emerald-50 ring-emerald-200/40' : down ? 'bg-rose-400/25 text-rose-50 ring-rose-200/40' : 'bg-white/10 text-sky-50 ring-white/20';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ring-1 ring-inset ${tone}`}
      title="Change over the last 30 days">
      <Icon className="h-3 w-3" aria-hidden="true" />{up ? '+' : ''}{change.toFixed(1)}<span className="font-medium opacity-80">30d</span>
    </span>
  );
}

/** A small up/down line of the last 30 days, scaled to its own range so small moves show. */
function Sparkline({ values, label }) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return <div className="h-9" aria-hidden="true" />;
  const W = 100, H = 36, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(4, max - min);
  const low = Math.max(0, min - (span - (max - min)) / 2);
  const x = (index) => (index / (values.length - 1)) * W;
  const y = (value) => pad + (H - pad * 2) * (1 - (value - low) / span);
  const points = values.map((value, index) => [x(index), y(value)]);
  const line = smoothPath(points);
  const last = points.at(-1);
  return (
    <div className="relative mt-2 h-9" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]"
        style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }} aria-hidden="true" />
    </div>
  );
}

/** One track: name, big number with its 30-day change, the trend line, target bar and status. */
function Track({ trackKey, track, hasEvidence, loading, trend }) {
  const meta = TRACK_META[trackKey];
  const cutoff = Number(track?.cutoff) || (trackKey === 'pbc' ? 75 : 70);
  const value = Math.max(0, Math.min(100, Number(track?.score) || 0));
  const { values, change } = trendOf(trend, trackKey);
  const met = Boolean(track?.met && hasEvidence);
  const status = !hasEvidence ? `No solves yet · target ${cutoff}` : met ? `Target ${cutoff} met` : `${Math.max(0, Number(track?.remaining) || 0).toFixed(1)} to target ${cutoff}`;
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.08] p-3 ring-1 ring-inset ring-white/15">
      <p className="truncate text-[11.5px] font-semibold text-sky-50" title={`${meta.full} (${meta.short})`}>{meta.label}<span className="hidden font-normal text-sky-100/80 xl:inline"> Companies</span></p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex items-baseline gap-1 tabular-nums">
          <span className="text-[30px] font-bold leading-none tracking-[-0.04em]">
            {loading ? <span className="inline-block h-7 w-14 animate-pulse rounded-md bg-white/20 align-middle" /> : hasEvidence ? track?.display ?? '—' : '0'}
          </span>
          <span className="text-[11px] font-medium text-sky-100/80">/100</span>
        </p>
        {!loading && hasEvidence && values.length > 1 ? <ChangeChip change={change} /> : null}
      </div>
      {!loading && hasEvidence ? <Sparkline values={values} label={`${meta.full}: ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} in 30 days`} /> : <div className="mt-2 h-9" aria-hidden="true" />}
      <div className="relative mt-2 h-1.5 rounded-full bg-white/20" role="progressbar" aria-label={`${meta.full} readiness`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className={`h-full rounded-full ${met ? 'bg-emerald-300' : 'bg-white'}`} style={{ width: `${loading ? 0 : value}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-white/90" style={{ left: `${cutoff}%` }} title={`Target ${cutoff}`} />
      </div>
      {!loading ? <p className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${met ? 'text-emerald-100' : 'text-sky-100'}`}>{met ? <Check className="h-3 w-3" aria-hidden="true" /> : null}{status}</p> : null}
    </div>
  );
}

/**
 * Compact Prep Readiness card (PeerPrep sky/slate, beside the Prep Score card): Service-Based and
 * Product-Based with their 30-day trend lines and targets, "View growth" (or `onView` for staff)
 * and the explanation. `sharing`: the Prep Mate privacy state (own profile only).
 */
export default function ReadinessSummaryCard({
  summary, loading = false, error = null, onRetry, viewTo = '/student/analysis/readiness#growth', onView, sharing, readOnly = false,
  title = 'Prep Readiness', className = '', guide = 'pf-readiness',
}) {
  const [explain, setExplain] = useState(false);
  const tracks = summary?.tracks || {};
  const hasEvidence = Boolean(summary?.hasEvidence);
  const unavailable = summary && summary.available === false;
  const trend = summary?.trend?.days || [];

  return (
    <section aria-labelledby={`${guide}-title`} aria-busy={loading} data-guide={guide}
      className={`relative flex h-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-sky-700 via-sky-800 to-slate-900 text-white shadow-[0_10px_30px_-18px_rgba(3,105,161,0.9)] ${className}`}>
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" aria-hidden="true" />

      <header className="relative flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25"><Crosshair className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${guide}-title`} className="flex items-center gap-1.5 text-[14px] font-semibold">{title}{!readOnly ? <GuideInfo step={guide} /> : null}</h2>
          <p className="truncate text-[11px] text-sky-100">Coding practice targets</p>
        </div>
        {sharing !== undefined ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ring-white/25"
            title={sharing ? 'Accepted Prep Mates see your Prep Score and readiness values. Change it in Edit Profile → Privacy.' : 'Only you and your staff see this. Change it in Edit Profile → Privacy.'}>
            {sharing ? <Users className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}{sharing ? 'Shared' : 'Private'}
          </span>
        ) : null}
      </header>

      {unavailable ? (
        <p className="relative flex-1 px-4 py-5 text-[12.5px] text-sky-100">Needs Prep Coding, which is not enabled for this account.</p>
      ) : error && !summary ? (
        <div className="relative flex flex-1 items-center gap-2 px-4 py-5 text-[12.5px] text-sky-100">
          Could not load.
          {onRetry ? <button type="button" onClick={onRetry} className={pill}><RefreshCw className="h-3.5 w-3.5" />Retry</button> : null}
        </div>
      ) : (
        <div className="relative grid flex-1 grid-cols-1 gap-2.5 px-4 pt-3 min-[420px]:grid-cols-2">
          {TRACK_ORDER.map((key) => <Track key={key} trackKey={key} track={tracks[key]} hasEvidence={hasEvidence} loading={loading && !summary} trend={trend} />)}
        </div>
      )}

      {!unavailable ? (
        <footer className="relative mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-3">
          <button type="button" onClick={() => setExplain(true)} className="inline-flex items-center gap-1 rounded-md text-[11.5px] font-medium text-sky-100 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />{readOnly ? 'How is it calculated?' : 'How can I improve?'}
          </button>
          {onView
            ? <button type="button" onClick={onView} className={pill}>View breakdown<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
            : viewTo ? <Link to={viewTo} className={pill}>View growth<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link> : null}
        </footer>
      ) : null}
      {error && summary ? <p role="status" className="relative px-4 pb-3 text-[11px] text-sky-100">Showing the last loaded values. {onRetry ? <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button> : null}</p> : null}
      <ReadinessExplainDialog open={explain} onClose={() => setExplain(false)} tracks={summary?.policy?.tracks} />
    </section>
  );
}
