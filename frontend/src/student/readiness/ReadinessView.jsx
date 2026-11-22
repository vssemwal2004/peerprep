import { useState } from 'react';
import { AlertCircle, HelpCircle, Info, RefreshCw } from 'lucide-react';
import ReadinessGrowthChart from './ReadinessGrowthChart';
import ReadinessTopicTable from './ReadinessTopicTable';
import ReadinessExplainDialog from './ReadinessExplainDialog';
import PracticeNextPanel from './PracticeNextPanel';
import { focusRing, relativeTime, STATUS_CLASSES, TRACK_META, TRACK_ORDER, trackStatus } from './readinessModel';

const card = 'rounded-2xl border border-[#e9eaee] bg-white p-4 dark:border-white/[0.07] dark:bg-[#232325]';
const RANGES = [{ id: '7d', label: '7D' }, { id: '30d', label: '30D' }, { id: '90d', label: '90D' }];

function ScoreCard({ track, hasEvidence, evidenceCount, lastSolveAt, computedAt }) {
  const meta = TRACK_META[track.key];
  const status = trackStatus(track, hasEvidence);
  const value = Math.max(0, Math.min(100, Number(track.score) || 0));
  return (
    <article className={`${card} relative overflow-hidden`} aria-labelledby={`score-${track.key}`}>
      <span className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-[0.12] blur-2xl" style={{ backgroundColor: meta.color }} aria-hidden="true" />
      <p id={`score-${track.key}`} className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{meta.full} <span className="text-[11px] font-normal text-slate-400">({meta.short}) · coding readiness</span></p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className="text-[40px] font-bold leading-none tracking-[-0.04em]" style={{ color: meta.color }}>{hasEvidence ? track.display : '0'}</span>
        <span className="text-[13px] text-slate-400 dark:text-zinc-500">/ 100 · practice target {track.cutoff}</span>
      </p>
      <div className="relative mt-3 h-2 rounded-full bg-slate-100 dark:bg-white/[0.07]" role="progressbar" aria-label={`${meta.full} readiness`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${value}%` }} />
        <span className="absolute -top-1 h-4 w-0.5 rounded bg-slate-700 dark:bg-white/80" style={{ left: `${track.cutoff}%` }} title={`Target ${track.cutoff}`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${STATUS_CLASSES[status.tone]}`}>{status.label}</span>
        <span className="text-[11.5px] text-slate-500 dark:text-zinc-400">{evidenceCount} verified solve{evidenceCount === 1 ? '' : 's'}{lastSolveAt ? ` · last ${relativeTime(lastSolveAt)}` : ''}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-zinc-500">Updated {relativeTime(computedAt)}</p>
    </article>
  );
}

/**
 * The Prep Readiness page body (student Prep Analysis section and the staff dialog).
 * mode 'student' adds ANVI Practice Next and practice links; 'staff' is read-only.
 */
export default function ReadinessView({ data, loading, error, stale, reload, range, onRange, mode = 'student' }) {
  const [track, setTrack] = useState('pbc');
  const [explain, setExplain] = useState(false);
  if (loading && !data) {
    return <div className="space-y-3" aria-busy="true"><div className="grid gap-3 md:grid-cols-2">{[0, 1].map((key) => <div key={key} className={`${card} h-[170px] animate-pulse`} />)}</div><div className={`${card} h-[300px] animate-pulse`} /></div>;
  }
  if (!data) {
    return (
      <div className={`${card} flex flex-col items-center gap-3 py-12 text-center`}>
        <AlertCircle className="h-7 w-7 text-rose-400" aria-hidden="true" />
        <p className="text-[13.5px] font-semibold text-slate-800 dark:text-zinc-100">Prep Readiness could not be loaded.</p>
        <p className="text-[12px] text-slate-500 dark:text-zinc-400">{error?.message || 'Please try again.'}</p>
        <button type="button" onClick={reload} className={`inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-700 ${focusRing}`}><RefreshCw className="h-3.5 w-3.5" />Retry</button>
      </div>
    );
  }
  if (data.available === false) return <div className={`${card} py-10 text-center text-[13px] text-slate-500 dark:text-zinc-400`}>Prep Readiness needs Prep Coding, which is not enabled for this account.</div>;
  const cutoffs = { sbc: data.tracks.sbc.cutoff, pbc: data.tracks.pbc.cutoff };

  return (
    <div className="space-y-4">
      {stale ? <p role="status" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertCircle className="h-4 w-4" aria-hidden="true" />Showing the last loaded values ({relativeTime(data.computedAt)}). <button type="button" onClick={reload} className="font-semibold underline">Retry</button></p> : null}

      {/* 1. Score cards */}
      <div className="grid gap-3 md:grid-cols-2" data-guide="an-readiness-scores">
        {TRACK_ORDER.map((key) => <ScoreCard key={key} track={{ ...data.tracks[key], key }} hasEvidence={data.hasEvidence} evidenceCount={data.evidenceCount} lastSolveAt={data.lastSolveAt} computedAt={data.computedAt} />)}
      </div>

      {/* 2. Explanation */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-violet-50/70 px-4 py-2.5 dark:bg-violet-500/[0.07]">
        <p className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-zinc-300"><Info className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />Progress toward coding practice targets, not a prediction of selection by any company.{data.unmappedCount ? ` ${data.unmappedCount} solved problem${data.unmappedCount === 1 ? ' is' : 's are'} waiting for a topic review.` : ''}</p>
        <button type="button" onClick={() => setExplain(true)} data-guide="an-readiness-explain" className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-violet-700 shadow-sm ring-1 ring-inset ring-violet-200 hover:bg-violet-50 dark:bg-white/[0.05] dark:text-violet-200 dark:ring-violet-400/20 ${focusRing}`}>
          <HelpCircle className="h-4 w-4" aria-hidden="true" />How is my score calculated?
        </button>
      </div>

      {/* 3. Growth */}
      <section id="growth" className={`${card} scroll-mt-24`} aria-labelledby="readiness-growth-title" data-guide="an-readiness-growth">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="readiness-growth-title" className="text-[14px] font-semibold text-slate-900 dark:text-white">Readiness growth</h3>
            <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Each day is scored under the policy that applied that day{data.growth?.publications?.length ? '; amber lines mark a new policy' : ''}.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-3 text-[11.5px] sm:flex">{TRACK_ORDER.map((key) => <span key={key} className="inline-flex items-center gap-1.5 font-semibold" style={{ color: TRACK_META[key].color }}><span className="h-0.5 w-4 rounded" style={{ backgroundColor: TRACK_META[key].color }} />{TRACK_META[key].label}</span>)}</span>
            {onRange ? (
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="group" aria-label="Range">
                {RANGES.map((item) => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => onRange(item.id)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${focusRing} ${range === item.id ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400'}`}>{item.label}</button>)}
              </div>
            ) : null}
          </div>
        </header>
        <ReadinessGrowthChart growth={data.growth} cutoffs={cutoffs} />
        {data.growth?.publications?.length ? (
          <p className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-300">
            {data.growth.publications.map((item) => `Policy v${item.version} from ${item.day}`).join(' · ')}: topic weights or targets changed, so the same solves can score differently before and after.
          </p>
        ) : null}
      </section>

      {/* 4. Track selector drives the table and ANVI together */}
      <div className="flex flex-wrap items-center gap-3" data-guide="an-readiness-track">
        <span className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200">Show topics for</span>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]" role="tablist" aria-label="Company type">
          {TRACK_ORDER.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={track === key} onClick={() => setTrack(key)}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition ${focusRing} ${track === key ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
              style={track === key ? { color: TRACK_META[key].color } : undefined}>
              {TRACK_META[key].label}<span className="hidden sm:inline"> Companies</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. ANVI Practice Next + topic breakdown */}
      {mode === 'student' ? <PracticeNextPanel track={track} insights={data.insights} /> : null}
      <section className={card} aria-labelledby="readiness-topics-title" data-guide="an-readiness-topics">
        <h3 id="readiness-topics-title" className="mb-2 text-[14px] font-semibold text-slate-900 dark:text-white">Topic breakdown · {TRACK_META[track].full}</h3>
        <ReadinessTopicTable topics={data.topics} track={track} quota={data.quota} readOnly={mode !== 'student'} />
      </section>

      <ReadinessExplainDialog open={explain} onClose={() => setExplain(false)} tracks={data.policy?.tracks} quotaLimit={data.quota?.limit} />
    </div>
  );
}
