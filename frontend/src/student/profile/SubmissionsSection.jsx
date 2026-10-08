import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Code2,
  History,
  ListChecks,
  Loader2,
  Play,
  Send,
  XCircle,
} from 'lucide-react';
import { CardLink, EmptyRow, Pill } from './ui';
import {
  STATUS_BAR_COLORS,
  STATUS_TONE_CLASSES,
  difficultyTone,
  focusRing,
  formatDateTime,
  formatRelative,
  formatRuntime,
  languageLabel,
  statusMeta,
  submissionTitle,
} from './format';

function StatusIcon({ tone }) {
  const className = 'h-4 w-4';
  if (tone === 'success') return <CheckCircle2 className={`${className} text-emerald-500`} aria-hidden="true" />;
  if (tone === 'danger') return <XCircle className={`${className} text-rose-500`} aria-hidden="true" />;
  if (tone === 'warning') return <AlertTriangle className={`${className} text-amber-500`} aria-hidden="true" />;
  if (tone === 'pending') return <Loader2 className={`${className} animate-spin text-sky-500 motion-reduce:animate-none`} aria-hidden="true" />;
  return <CircleDashed className={`${className} text-slate-400 dark:text-zinc-500`} aria-hidden="true" />;
}

function SolvedList({ problems }) {
  const list = Array.isArray(problems) ? problems : [];
  if (list.length === 0) {
    return <EmptyRow icon={<CheckCircle2 className="h-4 w-4" />} message="No accepted solutions yet." ctaLabel="Solve a problem" ctaTo="/problems" />;
  }
  return (
    <ul className="space-y-1">
      {list.map((problem, index) => (
        <li
          key={`${problem.title}-${index}`}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${index % 2 === 0 ? 'bg-slate-50/80 dark:bg-zinc-900/40' : ''}`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 dark:text-zinc-200" title={problem.title}>{problem.title}</p>
          <Pill className={`hidden sm:inline-flex ${difficultyTone(problem.difficulty)}`}>{problem.difficulty}</Pill>
          <time
            className="shrink-0 text-[11px] text-slate-400 dark:text-zinc-500"
            dateTime={problem.acceptedAt || undefined}
            title={formatDateTime(problem.acceptedAt)}
          >
            {formatRelative(problem.acceptedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

const MODE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'submit', label: 'Submit' },
  { key: 'run', label: 'Run' },
];

function ResultMix({ breakdown }) {
  const entries = Object.entries(breakdown || {})
    .map(([status, count]) => ({ ...statusMeta(status), count: Number(count) || 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;
  return (
    <div className="mb-3 rounded-lg border border-slate-100 px-3 py-2.5 dark:border-zinc-800">
      <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={entries.map((e) => `${e.label}: ${e.count}`).join(', ')}>
        {entries.map((entry) => (
          <div key={entry.key} className={`${STATUS_BAR_COLORS[entry.tone]} h-full rounded-full`} style={{ width: `${(entry.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_BAR_COLORS[entry.tone]}`} aria-hidden="true" />
            {entry.label}
            <span className="font-semibold tabular-nums text-slate-800 dark:text-zinc-200">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmissionList({ submissions, statusBreakdown }) {
  const [mode, setMode] = useState('all');
  const list = useMemo(() => (Array.isArray(submissions) ? submissions : []), [submissions]);
  const counts = useMemo(() => ({
    all: list.length,
    submit: list.filter((item) => item?.mode !== 'run').length,
    run: list.filter((item) => item?.mode === 'run').length,
  }), [list]);
  const visible = mode === 'all' ? list : list.filter((item) => (mode === 'run' ? item?.mode === 'run' : item?.mode !== 'run'));

  if (list.length === 0) {
    return <EmptyRow icon={<ListChecks className="h-4 w-4" />} message="No submissions yet." ctaLabel="Browse problems" ctaTo="/problems" />;
  }

  return (
    <>
      <ResultMix breakdown={statusBreakdown} />
      <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800" role="group" aria-label="Filter by type">
        {MODE_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={mode === item.key}
            onClick={() => setMode(item.key)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${focusRing} ${mode === item.key
              ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
              : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            {item.label}
            <span className="ml-1 tabular-nums text-slate-400 dark:text-zinc-500">{counts[item.key]}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyRow icon={<ListChecks className="h-4 w-4" />} message={mode === 'run' ? 'No recent runs.' : 'No recent submissions.'} />
      ) : (
        <ul className="space-y-1">
          {visible.map((submission, index) => {
            const meta = statusMeta(submission?.status, submission?.createdAt);
            const runtime = formatRuntime(submission?.executionTimeMs, submission?.status);
            const isRun = submission?.mode === 'run';
            const title = submissionTitle(submission);
            return (
              <li
                key={`${title}-${submission?.createdAt}-${index}`}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${index % 2 === 0 ? 'bg-slate-50/80 dark:bg-zinc-900/40' : ''}`}
              >
                <StatusIcon tone={meta.tone} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800 dark:text-zinc-200" title={title}>{title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px font-medium ${isRun
                      ? 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'
                      : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'}`}
                    >
                      {isRun ? <Play className="h-3 w-3" aria-hidden="true" /> : <Send className="h-3 w-3" aria-hidden="true" />}
                      {isRun ? 'Run' : 'Submit'}
                    </span>
                    {submission?.language ? <span>{languageLabel(submission.language)}</span> : null}
                    {runtime ? <><span aria-hidden="true">·</span><span className="tabular-nums">{runtime}</span></> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={submission?.createdAt || undefined} title={formatDateTime(submission?.createdAt)}>
                      {formatRelative(submission?.createdAt)}
                    </time>
                  </div>
                </div>
                <Pill className={STATUS_TONE_CLASSES[meta.tone]} title={meta.stale ? 'This execution never reported a result.' : undefined}>
                  {meta.label}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const LANGUAGE_COLORS = {
  python: 'bg-sky-500',
  python3: 'bg-sky-500',
  javascript: 'bg-amber-500',
  java: 'bg-orange-500',
  cpp: 'bg-violet-500',
  c: 'bg-slate-500',
};

function LanguageList({ languages }) {
  const total = languages.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  if (languages.length === 0) {
    return <EmptyRow icon={<Code2 className="h-4 w-4" />} message="Start solving to track your languages." ctaLabel="Browse problems" ctaTo="/problems" />;
  }
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {languages.map((item) => {
        const count = Number(item.count) || 0;
        const percent = total ? Math.round((count / total) * 100) : 0;
        const color = LANGUAGE_COLORS[String(item.language || '').toLowerCase()] || 'bg-teal-500';
        return (
          <li key={item.language || 'unknown'}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-zinc-300">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
                <span className="truncate">{languageLabel(item.language)}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400">
                <span className="font-semibold text-slate-800 dark:text-zinc-200">{count}</span>
                {` ${count === 1 ? 'submission' : 'submissions'} · ${percent}%`}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" aria-hidden="true">
              <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const TABS = [
  { key: 'solved', label: 'Recent AC', icon: CheckCircle2 },
  { key: 'submissions', label: 'Submissions', icon: History },
  { key: 'languages', label: 'Languages', icon: Code2 },
];

/** LeetCode-style tabbed history: recent accepted, recent submissions/runs, language usage. */
export default function PracticeHistory({ solved, submissions, statusBreakdown, languages }) {
  const [tab, setTab] = useState('solved');

  return (
    <section
      id="practice-history"
      aria-label="Practice history"
      className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Practice history">
          {TABS.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`history-tab-${item.key}`}
                aria-selected={selected}
                aria-controls="history-panel"
                onClick={() => setTab(item.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${focusRing} ${selected
                  ? 'bg-slate-100 text-slate-900 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        <CardLink to="/problems">Go to problems</CardLink>
      </div>
      <div id="history-panel" role="tabpanel" aria-labelledby={`history-tab-${tab}`} className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {tab === 'solved' ? <SolvedList problems={solved} /> : null}
        {tab === 'submissions' ? <SubmissionList submissions={submissions} statusBreakdown={statusBreakdown} /> : null}
        {tab === 'languages' ? <LanguageList languages={languages} /> : null}
      </div>
    </section>
  );
}
