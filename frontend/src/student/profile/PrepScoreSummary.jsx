import { useId, useMemo, useState } from 'react';
import { Gauge, LineChart } from 'lucide-react';
import { formatScore } from '../prepScore/formatScore';
import { ChangeChip, PrepScoreHistoryDialog, usePrepScoreHistory } from '../prepScore/PrepScoreHistory';
import { dayLabel, fillDays, GAIN_KINDS, LOSS_KINDS, POINT_KINDS, signed } from '../prepScore/pointKinds';
import { smoothPath } from '../readiness/readinessModel';
import GuideInfo from '../../guide/platform/GuideInfo';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * The 30-day running total as a full-width line that grows to fill the card (so the card never
 * shows an empty block beside a taller Prep Readiness card). Scaled to its own range so small ups
 * and downs are visible; start and end values are labelled.
 */
function TrendArea({ history }) {
  const id = useId().replace(/:/g, '');
  const days = useMemo(() => fillDays(history), [history]);
  if (days.length < 2) return <div className="flex-1" aria-hidden="true" />;
  const W = 300, H = 100, pad = 8;
  const values = days.map((day) => day.total);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(0.5, max - min);
  const low = min - (span - (max - min)) / 2;
  const points = values.map((value, index) => [(index / (values.length - 1)) * W, pad + (H - pad * 2) * (1 - (value - low) / span)]);
  const line = smoothPath(points);
  const last = points.at(-1);
  return (
    <div className="relative mt-3 min-h-[64px] flex-1" role="img" aria-label={`Prep Score from ${formatScore(values[0])} on ${dayLabel(days[0].day)} to ${formatScore(values.at(-1))} today`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={W} y1={H * ratio} y2={H * ratio} stroke="#fff" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />)}
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke="#fff" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
        style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }} aria-hidden="true" />
      <span className="absolute bottom-0 left-0 text-[10px] font-medium text-sky-100/80">{dayLabel(days[0].day)}</span>
      <span className="absolute bottom-0 right-0 text-[10px] font-medium text-sky-100/80">Today</span>
    </div>
  );
}

/** Where the last 30 days' change came from: the biggest gains and losses (real ledger kinds). */
function SourceChips({ byKind = {} }) {
  const rows = [...GAIN_KINDS, ...LOSS_KINDS]
    .map((kind) => [kind, Number(byKind[kind]) || 0])
    .filter(([, value]) => Math.abs(value) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  if (!rows.length) return <p className="mt-2 text-[11px] text-sky-100/90">No points in the last 30 days yet. Solve a problem to start.</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Where the last 30 days' change came from">
      {rows.map(([kind, value]) => {
        const meta = POINT_KINDS[kind];
        const Icon = meta.Icon;
        return (
          <li key={kind} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${value < 0 ? 'bg-rose-500/25 text-rose-50 ring-rose-200/35' : 'bg-white/12 text-white ring-white/20'}`}
            title={meta.hint}>
            <Icon className="h-3 w-3" aria-hidden="true" />{meta.short} {signed(value)}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The signed-in student's own Prep Score: the number, its 30-day change, a trend line that fills
 * the card, and where the change came from. The trend opens the full history. Sits beside the
 * Prep Readiness card at the same height; the university rank lives in the profile sidebar.
 */
export default function PrepScoreSummary({ ranking, loading = false, className = '' }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const trend = usePrepScoreHistory('30d', Boolean(ranking));
  const score = finite(ranking?.score);
  const history = trend.history;

  return (
    <section
      aria-labelledby="profile-prep-score-title"
      aria-busy={loading}
      className={`relative flex h-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-sky-800 text-white shadow-[0_10px_30px_-18px_rgba(2,132,199,0.8)] ${className}`}
    >
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />
      <header className="relative flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25"><Gauge className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="profile-prep-score-title" className="flex items-center gap-1.5 text-[14px] font-semibold">Your Prep Score<GuideInfo step="pf-score" /></h2>
          <p className="truncate text-[11px] text-sky-100">Grows with your practice</p>
        </div>
      </header>
      <div className="relative flex flex-1 flex-col px-4 pt-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <span className="text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums" aria-label={`Prep Score ${loading || !ranking ? 'loading' : formatScore(score)}`}>
            {loading ? <span className="inline-block h-9 w-24 animate-pulse rounded-md bg-white/20 align-middle" /> : ranking ? formatScore(score) : '—'}
          </span>
          {history ? <span className="mb-1"><ChangeChip change={history.change} label="30 days" inverse /></span> : null}
        </div>
        {ranking && history ? (
          <>
            <TrendArea history={history} />
            <SourceChips byKind={history.byKind} />
          </>
        ) : ranking && trend.loading ? <div className="mt-3 min-h-[64px] flex-1 animate-pulse rounded-lg bg-white/10" aria-hidden="true" /> : <div className="flex-1" />}
      </div>
      <footer className="relative mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-3">
        <p className="text-[11px] text-sky-100/90">{ranking ? 'From solves, challenges, sheets and badges' : 'Your Prep Score is unavailable right now.'}</p>
        {ranking ? (
          <button type="button" onClick={() => setHistoryOpen(true)} data-guide="pf-score-history"
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ring-white/25 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Open your Prep Score history">
            <LineChart className="h-3.5 w-3.5" aria-hidden="true" />History
          </button>
        ) : null}
      </footer>
      <PrepScoreHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </section>
  );
}
