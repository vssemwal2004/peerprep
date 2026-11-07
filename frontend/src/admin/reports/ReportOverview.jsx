import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Flag, LineChart, PlayCircle,
  ShieldAlert, Trophy, Users,
} from 'lucide-react';
import { formatDateTime, formatDuration } from './ReportComponents';
import {
  ACADEMIC_DIMENSIONS, DISTRIBUTION_BUCKETS, formatRelativeAge, groupBreakdown, rowEvaluationState,
  rowPercentage, rowViolationCount,
} from './rosterModel';

const OUTCOME_SEGMENTS = [
  { key: 'passed', label: 'Passed', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'failed', label: 'Failed', bar: 'bg-rose-400', dot: 'bg-rose-400' },
  { key: 'graded', label: 'Graded', bar: 'bg-sky-600', dot: 'bg-sky-600', optional: true },
  { key: 'evaluating', label: 'Evaluating', bar: 'bg-violet-400', dot: 'bg-violet-400' },
  { key: 'needs_review', label: 'Needs review', bar: 'bg-amber-400', dot: 'bg-amber-400', optional: true },
  { key: 'in_progress', label: 'In progress', bar: 'bg-sky-400', dot: 'bg-sky-400' },
  { key: 'not_started', label: 'Not started', bar: 'bg-slate-200 dark:bg-gray-700', dot: 'bg-slate-300 dark:bg-gray-600' },
];

const ACTIVITY_META = {
  started: { icon: PlayCircle, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-300', text: 'started the test' },
  submitted: { icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300', text: 'submitted' },
  graded: { icon: Trophy, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300', text: 'was graded' },
  flagged: { icon: Flag, tone: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300', text: 'was flagged' },
};

const TILE_TONES = {
  slate: 'text-slate-900 dark:text-white',
  sky: 'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  violet: 'text-violet-700 dark:text-violet-300',
  rose: 'text-rose-700 dark:text-rose-300',
};

function Panel({ icon: Icon, title, action, children, className = '' }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-3.5 dark:border-gray-800">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
          <Icon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          {title}
        </h3>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function Tile({ label, value, sub, tone = 'slate', delta, onClick, title }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-1 text-[11px] font-medium text-slate-500 dark:text-gray-400">
        <span className="truncate">{label}</span>
        {delta ? <span className={`shrink-0 rounded-full px-1 text-[10px] font-semibold tabular-nums ${delta > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'}`} title="Since the previous update">{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}</span> : null}
      </span>
      <span className={`mt-0.5 block text-xl font-semibold leading-tight tabular-nums ${TILE_TONES[tone]}`}>{value}</span>
      {sub ? <span className="mt-0.5 block truncate text-[10.5px] text-slate-400 dark:text-gray-500" title={sub}>{sub}</span> : null}
    </>
  );
  const className = 'min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900';
  return onClick
    ? <button type="button" onClick={onClick} title={title} className={`${className} transition-colors hover:border-sky-300 hover:bg-sky-50/40 dark:hover:border-sky-700`}>{body}</button>
    : <div className={className} title={title}>{body}</div>;
}

function EmptyNote({ children }) {
  return <p className="px-4 py-6 text-center text-xs text-slate-400 dark:text-gray-500">{children}</p>;
}

function MetaPair({ label, children }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">{children}</span>
    </span>
  );
}

/** Candidates, finished, average and pass rate for each course / branch / semester / group. */
function GroupBreakdown({ rows, passPercentage }) {
  // Only details at least one candidate has filled in are offered.
  const dimensions = useMemo(
    () => ACADEMIC_DIMENSIONS.filter((dimension) => rows.some((row) => row[dimension.key] !== undefined && row[dimension.key] !== null && row[dimension.key] !== '')),
    [rows],
  );
  const [chosen, setChosen] = useState('');
  // Lead with a detail that actually splits the candidates (a single college says nothing).
  const splitting = dimensions.find((dimension) => new Set(rows.map((row) => row[dimension.key] ?? '')).size > 1);
  const key = dimensions.some((dimension) => dimension.key === chosen) ? chosen : (splitting || dimensions[0])?.key;
  const lines = useMemo(() => (key ? groupBreakdown(rows, key, { passPercentage }) : []), [key, passPercentage, rows]);
  if (!dimensions.length) return null;
  return (
    <Panel
      icon={Users}
      title="By class"
      action={(
        <div role="tablist" aria-label="Group candidates by" className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-gray-800">
          {dimensions.map((dimension) => (
            <button
              key={dimension.key}
              type="button"
              role="tab"
              aria-selected={dimension.key === key}
              onClick={() => setChosen(dimension.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${dimension.key === key ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-700 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400'}`}
            >
              {dimension.label.replace(' / section', '')}
            </button>
          ))}
        </div>
      )}
    >
      <div className="max-h-64 overflow-auto">
        <table data-no-serial className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-400 dark:bg-gray-800 dark:text-gray-500">
            <tr>
              <th className="px-3.5 py-1.5 font-semibold">{dimensions.find((dimension) => dimension.key === key)?.label}</th>
              <th className="px-2 py-1.5 text-right font-semibold">Cand.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Done</th>
              <th className="px-2 py-1.5 text-right font-semibold">Avg</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">Pass</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {lines.map((line) => (
              <tr key={line.value || '__empty'} className="text-slate-700 dark:text-gray-200">
                <td className="max-w-[9rem] truncate px-3.5 py-1.5 font-medium" title={line.label}>{line.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.candidates}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.finished}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.avgPercentage == null ? '—' : `${line.avgPercentage}%`}</td>
                <td className="px-3.5 py-1.5 text-right tabular-nums">{line.passRate == null ? '—' : `${line.passRate}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function ReportOverview({
  assessment, statusLabel, statusClass, stats, deltas = {}, release, rows, activity, now, passPercentage,
  onOpenStudent, onOpenViolations, onShowCandidates, onOpenAnalysis,
}) {
  const distributionMaximum = Math.max(1, ...stats.distribution);
  const segments = OUTCOME_SEGMENTS
    .map((segment) => ({ ...segment, count: stats.outcome[segment.key] || 0 }))
    .filter((segment) => !segment.optional || segment.count > 0);
  const completion = stats.total ? Math.round((stats.finished / stats.total) * 100) : 0;
  const otherEnds = [
    stats.expired ? `${stats.expired} expired` : null,
    stats.violation ? `${stats.violation} violation` : null,
    stats.incomplete ? `${stats.incomplete} incomplete` : null,
  ].filter(Boolean);
  const finishedSub = stats.finished
    ? [`${stats.submitted} submitted`, ...otherEnds].join(' · ')
    : 'No one has finished yet';
  const gradedSub = [`${stats.graded} graded`, stats.evaluating ? `${stats.evaluating} evaluating` : null, stats.needsReview ? `${stats.needsReview} need review` : null].filter(Boolean).join(' · ');

  const topPerformers = rows
    .filter((row) => rowEvaluationState(row) === 'graded' && rowPercentage(row) != null)
    .sort((a, b) => rowPercentage(b) - rowPercentage(a) || (a.timeTakenSec ?? Infinity) - (b.timeTakenSec ?? Infinity))
    .slice(0, 5);
  const attention = [
    ...rows.filter((row) => rowEvaluationState(row) === 'needs_review').map((row) => ({ row, reason: 'Needs manual review', tone: 'amber' })),
    ...rows.filter((row) => row.flagged || rowViolationCount(row) >= 3)
      .sort((a, b) => rowViolationCount(b) - rowViolationCount(a))
      .map((row) => ({ row, reason: `${rowViolationCount(row)} integrity event${rowViolationCount(row) === 1 ? '' : 's'}`, tone: 'rose' })),
  ].filter((item, index, list) => list.findIndex((other) => other.row.key === item.row.key) === index).slice(0, 6);

  return (
    <div className="space-y-3">
      {/* Assessment summary: one compact card */}
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white">{assessment.title || 'Untitled assessment'}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${statusClass}`}>{statusLabel}</span>
              <span className="text-xs text-slate-400 dark:text-gray-500">{[assessment.assessmentType || assessment.testType || 'Mixed', assessment.assessmentId ? `ID ${assessment.assessmentId}` : null].filter(Boolean).join(' · ')}</span>
            </div>
            <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <MetaPair label="Starts">{formatDateTime(assessment.startTime)}</MetaPair>
              <MetaPair label="Ends">{formatDateTime(assessment.endTime)}</MetaPair>
              <MetaPair label="Duration">{assessment.duration ? `${assessment.duration} min` : 'Not set'}</MetaPair>
              <MetaPair label="Questions">{assessment.totalQuestions || '—'}</MetaPair>
              <MetaPair label="Marks">{assessment.totalMarks ?? '—'}</MetaPair>
              <MetaPair label="Pass mark">{assessment.passPercentage == null ? 'Not set' : `${assessment.passPercentage}%`}</MetaPair>
            </dl>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            {onOpenAnalysis && (
              <button type="button" onClick={onOpenAnalysis} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                <LineChart className="h-3.5 w-3.5" />Full analysis
              </button>
            )}
            {release}
          </div>
        </div>
      </section>

      {/* Headline numbers: every one is a count of candidates, and they add up (see the sub-lines) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Tile label="Candidates" value={stats.total} sub="Assigned + attempted" onClick={() => onShowCandidates('all')} title="Everyone assigned this test, plus anyone who attempted it" />
        <Tile label="Attempted" value={stats.started} sub={`${stats.notStarted} not started`} tone="sky" delta={deltas.started} title="Started the test: in progress + finished" />
        <Tile label="In progress" value={stats.inProgress} sub="Writing now" tone="sky" delta={deltas.inProgress} onClick={() => onShowCandidates('in_progress')} />
        <Tile label="Finished" value={stats.finished} sub={finishedSub} tone="emerald" delta={deltas.finished} onClick={() => onShowCandidates('finished')} title="Submitted, expired, violation and incomplete attempts" />
        <Tile label="Not started" value={stats.notStarted} sub={stats.total ? `${Math.round((stats.notStarted / stats.total) * 100)}% of candidates` : '—'} onClick={() => onShowCandidates('not_started')} />
        <Tile label="Avg score" value={stats.avgPercentage == null ? '—' : `${stats.avgPercentage}%`} sub={stats.avgPercentage == null ? 'No graded attempts yet' : gradedSub} tone="violet" />
        <Tile label="Pass rate" value={stats.passRate == null ? '—' : `${stats.passRate}%`} sub={stats.passRate == null ? (stats.graded && passPercentage == null ? 'Pass mark not set' : 'No graded attempts yet') : `${stats.passed} of ${stats.graded} graded`} tone="emerald" onClick={() => onShowCandidates('passed')} />
        <Tile label="Flagged" value={stats.flaggedSessions} sub={`${stats.violationEvents} integrity events`} tone="rose" delta={deltas.flagged} onClick={() => onShowCandidates('flagged')} />
      </div>

      {/* Progress: one slim bar */}
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">Completion</h3>
          <span className="text-xs text-slate-500 dark:text-gray-400">{stats.finished} of {stats.total} finished · <span className="font-semibold text-slate-700 dark:text-gray-200">{completion}%</span></span>
        </div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={segments.map((segment) => `${segment.label} ${segment.count}`).join(', ')}>
          {stats.total > 0 && segments.filter((segment) => segment.count > 0).map((segment) => (
            <span key={segment.key} className={`h-full transition-[width] duration-700 ${segment.bar}`} style={{ width: `${(segment.count / stats.total) * 100}%` }} title={`${segment.label}: ${segment.count}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((segment) => (
            <button key={segment.key} type="button" onClick={() => onShowCandidates(segment.key)} className="group inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white">
              <span className={`h-2 w-2 rounded-full ${segment.dot}`} />{segment.label}
              <span className="font-semibold tabular-nums text-slate-800 dark:text-gray-100">{segment.count}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Score distribution */}
        <Panel icon={LineChart} title="Score distribution" action={<span className="text-[11px] text-slate-400">{stats.graded} graded</span>}>
          <div className="grid flex-1 grid-cols-4 items-end gap-2.5 px-4 pb-1 pt-3">
            {DISTRIBUTION_BUCKETS.map((label, index) => {
              const count = Number(stats.distribution[index] || 0);
              return (
                <div key={label} className="flex min-w-0 flex-col items-center">
                  <strong className="mb-1 text-xs tabular-nums text-slate-900 dark:text-white">{count}</strong>
                  <div className="flex h-20 w-full max-w-12 items-end overflow-hidden rounded-md bg-slate-50 dark:bg-gray-800">
                    <div className="w-full rounded-md bg-gradient-to-t from-sky-600 to-sky-400 transition-[height] duration-700" style={{ height: `${count ? Math.max(8, (count / distributionMaximum) * 100) : 0}%` }} />
                  </div>
                  <span className="mt-1.5 text-[10.5px] font-medium text-slate-400">{label}%</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100 dark:divide-gray-800 dark:border-gray-800">
            {[['Lowest', stats.minPercentage == null ? '—' : `${stats.minPercentage}%`], ['Average', stats.avgPercentage == null ? '—' : `${stats.avgPercentage}%`], ['Highest', stats.maxPercentage == null ? '—' : `${stats.maxPercentage}%`], ['Avg time', stats.avgTimeSec ? formatDuration(stats.avgTimeSec) : '—']].map(([label, value]) => (
              <div key={label} className="px-2 py-2 text-center">
                <strong className="text-[13px] tabular-nums text-slate-900 dark:text-white">{value}</strong>
                <p className="text-[10.5px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </Panel>

        <GroupBreakdown rows={rows} passPercentage={passPercentage} />

        {/* Top performers */}
        <Panel icon={Trophy} title="Top performers" action={<button type="button" onClick={() => onShowCandidates('passed')} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">View all</button>}>
          {topPerformers.length ? (
            <ol className="divide-y divide-slate-100 dark:divide-gray-800">
              {topPerformers.map((row, index) => (
                <li key={row.key}>
                  <button type="button" onClick={() => onOpenStudent(row)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-800 dark:text-gray-100">{row.name || 'Unknown'}</span>
                      <span className="block text-[10.5px] text-slate-400">{[row.branch, row.timeTakenSec ? formatDuration(row.timeTakenSec) : null].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{Math.round(rowPercentage(row) * 10) / 10}%</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <EmptyNote>Appears once attempts are graded.</EmptyNote>}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Integrity */}
        <Panel icon={ShieldAlert} title="Integrity" action={<button type="button" onClick={() => onShowCandidates('flagged')} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">Open flagged</button>}>
          <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-gray-800">
            {[
              ['Events', stats.violationEvents, `${stats.flaggedSessions} flagged`],
              ['Tab switches', stats.tabSwitches],
              ['Fullscreen exits', stats.fullscreenExits],
              ['Camera flags', stats.cameraFlags],
              ['AI flags', stats.aiViolations],
            ].map(([label, value, hint]) => (
              <div key={label} className="bg-white px-3.5 py-2 last:odd:col-span-2 dark:bg-gray-900">
                <p className="text-[10.5px] text-slate-500 dark:text-gray-400">{label}</p>
                <p className="text-lg font-semibold leading-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
                {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
              </div>
            ))}
          </div>
          {stats.topViolator && (
            <button type="button" onClick={() => onOpenViolations(stats.topViolator.key)} className="flex items-center gap-2 border-t border-slate-100 px-3.5 py-2 text-left hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-800/60">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
              <span className="truncate text-xs text-slate-600 dark:text-gray-300">Most flagged: <span className="font-semibold text-slate-900 dark:text-white">{stats.topViolator.name}</span> · {stats.topViolator.count}</span>
            </button>
          )}
        </Panel>

        {/* Needs attention */}
        <Panel icon={AlertTriangle} title="Needs attention" action={<span className="text-[11px] text-slate-400">{attention.length}</span>}>
          {attention.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {attention.map(({ row, reason, tone }) => (
                <li key={row.key}>
                  <button type="button" onClick={() => onOpenStudent(row)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'amber' ? 'bg-amber-400' : 'bg-rose-500'}`} />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-gray-100">{row.name || 'Unknown'}</span>
                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-gray-400">{reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyNote>Nothing needs attention right now.</EmptyNote>}
        </Panel>

        {/* Live activity */}
        <Panel icon={Activity} title="Live activity" action={<span className="text-[11px] text-slate-400">this session</span>}>
          {activity.length ? (
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
              {activity.map((event) => {
                const meta = ACTIVITY_META[event.type];
                const Icon = meta.icon;
                return (
                  <li key={event.id} className="flex items-center gap-2.5 px-3.5 py-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.tone}`}><Icon className="h-3 w-3" /></span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-gray-200">
                      <span className="font-medium text-slate-900 dark:text-white">{event.name}</span> {meta.text}{event.type === 'flagged' && event.count > 1 ? ` (${event.count})` : ''}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{formatRelativeAge(event.at, now)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyNote>Starts, submissions and flags appear here as they happen.</EmptyNote>}
          <p className="mt-auto flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2 text-[10.5px] text-slate-400 dark:border-gray-800">
            <Clock className="h-3 w-3" />Updates live while this page is open
          </p>
        </Panel>
      </div>
    </div>
  );
}
