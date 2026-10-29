import {
  Activity, AlertTriangle, CheckCircle2, Clock, Flag, PlayCircle,
  ShieldAlert, Target, TrendingUp, Trophy,
} from 'lucide-react';
import { KpiCard, formatDateTime, formatDuration } from './ReportComponents';
import { DISTRIBUTION_BUCKETS, formatRelativeAge, rowEvaluationState, rowPercentage, rowViolationCount } from './rosterModel';

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

function Panel({ icon: Icon, title, action, children, className = '' }) {
  return (
    <section className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 dark:border-gray-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          {title}
        </h3>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function MetaItem({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-gray-500">{children}</p>;
}

export default function ReportOverview({
  assessment, statusLabel, statusClass, stats, kpis, release, rows, activity, now,
  onOpenStudent, onOpenViolations, onShowCandidates,
}) {
  const distributionMaximum = Math.max(1, ...stats.distribution);
  const segments = OUTCOME_SEGMENTS
    .map((segment) => ({ ...segment, count: stats.outcome[segment.key] || 0 }))
    .filter((segment) => !segment.optional || segment.count > 0);
  const completion = stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0;

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
    <div className="space-y-4">
      {/* Assessment summary */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{assessment.title || 'Untitled assessment'}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>{statusLabel}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
              {[assessment.assessmentType || assessment.testType || 'Mixed', assessment.assessmentId ? `ID ${assessment.assessmentId}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="shrink-0">
            {release}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-gray-800">
          <MetaItem label="Starts">{formatDateTime(assessment.startTime)}</MetaItem>
          <MetaItem label="Ends">{formatDateTime(assessment.endTime)}</MetaItem>
          <MetaItem label="Duration">{assessment.duration ? `${assessment.duration} min` : 'Not set'}</MetaItem>
          <MetaItem label="Questions">{assessment.totalQuestions || '—'}</MetaItem>
          <MetaItem label="Total marks">{assessment.totalMarks ?? '—'}</MetaItem>
          <MetaItem label="Pass mark">{assessment.passPercentage == null ? 'Not set' : `${assessment.passPercentage}%`}</MetaItem>
        </dl>
      </section>

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      {/* Exam progress */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Target className="h-4 w-4 text-sky-600" />Completion outcome</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{stats.submitted} of {stats.total} candidates have finished · {completion}% complete</p>
          </div>
          <strong className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{stats.passRate == null ? 'Pass rate —' : `${stats.passRate}% pass`}</strong>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={segments.map((segment) => `${segment.label} ${segment.count}`).join(', ')}>
          {stats.total > 0 && segments.filter((segment) => segment.count > 0).map((segment) => (
            <span key={segment.key} className={`h-full transition-[width] duration-700 ${segment.bar}`} style={{ width: `${(segment.count / stats.total) * 100}%` }} title={`${segment.label}: ${segment.count}`} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
          {segments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              onClick={() => onShowCandidates(segment.key)}
              className="group rounded-lg text-left"
            >
              <span className="flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-slate-800 dark:text-gray-400 dark:group-hover:text-white">
                <span className={`h-2 w-2 rounded-full ${segment.dot}`} />{segment.label}
              </span>
              <span className="mt-0.5 block text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{segment.count}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Score distribution */}
        <Panel icon={TrendingUp} title="Score distribution" action={<span className="text-xs text-slate-400">{stats.graded} graded</span>}>
          <div className="grid flex-1 grid-cols-4 items-end gap-3 px-5 pb-2 pt-5">
            {DISTRIBUTION_BUCKETS.map((label, index) => {
              const count = Number(stats.distribution[index] || 0);
              return (
                <div key={label} className="flex min-w-0 flex-col items-center">
                  <strong className="mb-1.5 text-sm tabular-nums text-slate-900 dark:text-white">{count}</strong>
                  <div className="flex h-28 w-full max-w-14 items-end overflow-hidden rounded-md bg-slate-50 dark:bg-gray-800">
                    <div className="w-full rounded-md bg-gradient-to-t from-sky-600 to-sky-400 transition-[height] duration-700" style={{ height: `${count ? Math.max(8, (count / distributionMaximum) * 100) : 0}%` }} />
                  </div>
                  <span className="mt-2 text-[11px] font-medium text-slate-400">{label}%</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 dark:divide-gray-800 dark:border-gray-800">
            {[['Lowest', stats.minPercentage], ['Average', stats.avgPercentage], ['Highest', stats.maxPercentage]].map(([label, value]) => (
              <div key={label} className="px-3 py-3 text-center">
                <strong className="text-base tabular-nums text-slate-900 dark:text-white">{value == null ? '—' : `${value}%`}</strong>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Top performers */}
        <Panel icon={Trophy} title="Top performers" action={<button type="button" onClick={() => onShowCandidates('passed')} className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">View all</button>}>
          {topPerformers.length ? (
            <ol className="divide-y divide-slate-100 dark:divide-gray-800">
              {topPerformers.map((row, index) => (
                <li key={row.key}>
                  <button type="button" onClick={() => onOpenStudent(row)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-gray-100">{row.name || 'Unknown'}</span>
                      <span className="block text-xs text-slate-400">{row.timeTakenSec ? formatDuration(row.timeTakenSec) : '—'}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{Math.round(rowPercentage(row) * 10) / 10}%</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <EmptyNote>Appears once attempts are graded.</EmptyNote>}
        </Panel>

        {/* Live activity */}
        <Panel icon={Activity} title="Live activity" action={<span className="text-xs text-slate-400">this session</span>}>
          {activity.length ? (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
              {activity.map((event) => {
                const meta = ACTIVITY_META[event.type];
                const Icon = meta.icon;
                return (
                  <li key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-gray-200">
                      <span className="font-medium text-slate-900 dark:text-white">{event.name}</span> {meta.text}{event.type === 'flagged' && event.count > 1 ? ` (${event.count} events)` : ''}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatRelativeAge(event.at, now)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyNote>Starts, submissions and flags appear here as they happen.</EmptyNote>}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Integrity */}
        <Panel icon={ShieldAlert} title="Integrity overview" className="xl:col-span-2" action={<button type="button" onClick={() => onShowCandidates('flagged')} className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">Open violations</button>}>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-5 dark:bg-gray-800">
            {[
              ['Integrity events', stats.violationEvents, `${stats.flaggedSessions} flagged sessions`],
              ['Tab switches', stats.tabSwitches],
              ['Fullscreen exits', stats.fullscreenExits],
              ['Camera flags', stats.cameraFlags],
              ['AI flags', stats.aiViolations],
            ].map(([label, value, hint]) => (
              <div key={label} className="bg-white px-4 py-4 dark:bg-gray-900">
                <p className="text-xs text-slate-500 dark:text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
                {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
              </div>
            ))}
          </div>
          {stats.topViolator && (
            <button type="button" onClick={() => onOpenViolations(stats.topViolator.key)} className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 text-left hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-800/60">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <span className="text-sm text-slate-600 dark:text-gray-300">Most flagged: <span className="font-semibold text-slate-900 dark:text-white">{stats.topViolator.name}</span> · {stats.topViolator.count} events</span>
            </button>
          )}
        </Panel>

        {/* Needs attention */}
        <Panel icon={AlertTriangle} title="Needs attention" action={<span className="text-xs text-slate-400">{attention.length}</span>}>
          {attention.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {attention.map(({ row, reason, tone }) => (
                <li key={row.key}>
                  <button type="button" onClick={() => onOpenStudent(row)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'amber' ? 'bg-amber-400' : 'bg-rose-500'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-gray-100">{row.name || 'Unknown'}</span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-gray-400">{reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyNote>Nothing needs your attention right now.</EmptyNote>}
          <p className="mt-auto flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-gray-800">
            <Clock className="h-3 w-3" />{stats.avgTimeSec ? `Average time on graded attempts: ${formatDuration(stats.avgTimeSec)}` : 'Average time appears once attempts are graded'}
          </p>
        </Panel>
      </div>
    </div>
  );
}
