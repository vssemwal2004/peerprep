import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, Clock3, LayoutDashboard,
  ListChecks, Loader2, MessageSquareText, RotateCcw, Search, ShieldAlert, Target, Trophy, Users, X,
} from 'lucide-react';
import { api } from '../../utils/api';
import CompanyLogo from '../../student/prepMock/CompanyLogo';
import { MockPageHeader } from './MockWorkspace';
import useLiveAssessmentRoster from '../reports/useLiveAssessmentRoster';
import { OutcomeBar, QuestionList, QuestionMap, ScoreRing, SectionBars, outcomeCounts } from '../../features/prepMock/MockResultParts';

// Prep Mock › Results. Left: every mock students have attempted (search, sort, "all mocks" toggle).
// Right: the chosen mock's numbers and its students ranked by score; a student opens their attempt
// question by question (green right, red wrong, coding tests and marks). URL: ?mock=<id>&attempt=<submissionId>.

const surface = 'rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]';
const insetRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500';
const ghostButton = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#e6e7eb] bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-300 dark:hover:border-violet-400/30 dark:hover:text-violet-200 ${focusRing}`;
const searchInput = 'h-9 w-full rounded-xl border border-[#e6e7eb] bg-[#f8f9fb] pl-9 pr-8 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white [&::-webkit-search-cancel-button]:hidden';
const muted = 'text-slate-500 dark:text-zinc-400';
const faint = 'text-slate-400 dark:text-zinc-500';
const eyebrow = 'text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400';

const FINISHED = new Set(['submitted', 'expired', 'violation', 'incomplete']);
const SORTS = [
  { value: 'attempts', label: 'Most attempts' },
  { value: 'avg-low', label: 'Lowest average' },
  { value: 'avg-high', label: 'Highest average' },
  { value: 'name', label: 'Name A–Z' },
];
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const pct = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value))}%`);
const marks = (value) => {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
};
const dateText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const duration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const minutes = Math.floor(total / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m ${Math.round(total % 60)}s`;
};
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

/** How one attempt ended, for the chip in the students table. */
function attemptState(row, passPercentage) {
  if (row.status === 'in_progress') return { key: 'progress', label: 'In progress', tone: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25' };
  if (!FINISHED.has(row.status)) return { key: 'waiting', label: 'Not started', tone: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-400 dark:ring-white/10' };
  if (row.percentage === null || row.percentage === undefined) return { key: 'checking', label: 'Being checked', tone: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25' };
  return row.percentage >= passPercentage
    ? { key: 'passed', label: 'Passed', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' }
    : { key: 'failed', label: 'Below pass mark', tone: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25' };
}

function Stat({ label, value, tone = 'text-slate-900 dark:text-white', hint }) {
  return (
    <div className="min-w-0 bg-[#fcfcfd] px-4 py-3 sm:px-5 dark:bg-[#262626]" title={hint}>
      <dt className={`truncate text-[11.5px] ${muted}`}>{label}</dt>
      <dd className={`mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

// --- Left bar: mocks with results ---------------------------------------------------------

function MockRail({ mocks, selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [withResults, setWithResults] = useState(true);
  const [sort, setSort] = useState('attempts');
  const term = query.trim().toLowerCase();
  const attempted = mocks.filter((mock) => Number(mock.attempts) > 0).length;
  const shown = useMemo(() => mocks
    .filter((mock) => !withResults || Number(mock.attempts) > 0)
    .filter((mock) => !term || [mock.title, mock.company, mock.role].some((value) => String(value || '').toLowerCase().includes(term)))
    .sort((a, b) => {
      const avg = (mock) => (Number.isFinite(Number(mock.avgPercentage)) && Number(mock.attempts) > 0 ? Number(mock.avgPercentage) : null);
      if (sort === 'avg-low') return (avg(a) ?? 101) - (avg(b) ?? 101) || String(a.title).localeCompare(String(b.title));
      if (sort === 'avg-high') return (avg(b) ?? -1) - (avg(a) ?? -1) || String(a.title).localeCompare(String(b.title));
      if (sort === 'name') return String(a.title).localeCompare(String(b.title));
      return Number(b.attempts || 0) - Number(a.attempts || 0) || String(a.title).localeCompare(String(b.title));
    }), [mocks, withResults, term, sort]);

  return (
    <aside aria-label="Mocks" className={`${surface} flex min-h-0 flex-col overflow-hidden lg:flex-1`}>
      <div className="shrink-0 space-y-2.5 border-b border-[#eef0f3] px-3 pb-3 pt-3.5 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className={`flex items-center gap-1.5 ${eyebrow}`}>Mocks <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums tracking-normal text-slate-700 dark:bg-white/[0.08] dark:text-zinc-200">{shown.length}</span></h2>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort mocks"
            className={`h-7 max-w-[9rem] rounded-md border-0 bg-transparent py-0 pl-1 pr-6 text-[11.5px] font-semibold text-slate-600 dark:text-zinc-300 ${insetRing}`}>
            {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mock, company or role" aria-label="Find a mock" className={searchInput} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 ${insetRing}`}><X className="h-3.5 w-3.5" /></button>}
        </label>
        <div className="flex gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]" role="group" aria-label="Which mocks">
          {[[true, 'With results', attempted], [false, 'All mocks', mocks.length]].map(([value, label, count]) => (
            <button key={label} type="button" aria-pressed={withResults === value} onClick={() => setWithResults(value)}
              className={`inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-[10px] text-[11.5px] font-semibold transition-colors ${insetRing} ${withResults === value ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>
              {label}<span className={`tabular-nums ${faint}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <nav aria-label="Mock results" className="min-h-0 flex-1 px-2 py-2 lg:overflow-y-auto lg:overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => onSelect('')} aria-current={!selectedId ? 'page' : undefined}
          className={`mb-1.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${insetRing} ${!selectedId ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(109,40,217,0.9)]"><LayoutDashboard className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">Overview</span>
            <span className={`block truncate text-[11.5px] ${muted}`}>{plural(attempted, 'mock')} with results</span>
          </span>
        </button>
        {shown.length === 0 ? (
          <p role="status" className={`px-3 py-6 text-center text-[12.5px] ${muted}`}>{term ? `No mock matches “${query.trim()}”.` : 'No student has attempted a mock yet.'}</p>
        ) : (
          <ul className="divide-y divide-[#eef0f3] border-t border-[#eef0f3] dark:divide-white/[0.06] dark:border-white/[0.06]">
            {shown.map((mock) => {
              const active = String(mock._id) === String(selectedId);
              const attempts = Number(mock.attempts || 0);
              return (
                <li key={mock._id} className="py-1.5">
                  <button type="button" onClick={() => onSelect(String(mock._id))} aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${insetRing} ${active ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
                    <CompanyLogo name={mock.company || mock.title} logo={mock.companyLogo} size="tile" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13.5px] font-semibold leading-5 ${active ? 'text-violet-900 dark:text-violet-100' : 'text-slate-900 dark:text-zinc-50'}`} title={mock.title}>{mock.title || 'Untitled mock'}</span>
                      <span className={`block truncate text-[11.5px] ${muted}`}>{[mock.company, mock.role].filter(Boolean).join(' · ') || 'No company'}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className={`rounded-md px-1.5 py-[3px] text-[10.5px] font-semibold leading-none ${attempts ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{plural(attempts, 'attempt')}</span>
                        {attempts > 0 && Number.isFinite(Number(mock.avgPercentage)) && <span className="rounded-md bg-slate-100 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">avg {pct(mock.avgPercentage)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

// --- Overview (no mock chosen) --------------------------------------------------------------

function Overview({ mocks, onSelect }) {
  const attempted = mocks.filter((mock) => Number(mock.attempts) > 0);
  const attempts = attempted.reduce((sum, mock) => sum + Number(mock.attempts || 0), 0);
  const graded = attempted.filter((mock) => Number.isFinite(Number(mock.avgPercentage)));
  const weighted = graded.reduce((sum, mock) => sum + Number(mock.avgPercentage) * Number(mock.attempts || 0), 0);
  const weight = graded.reduce((sum, mock) => sum + Number(mock.attempts || 0), 0);
  const top = [...attempted].sort((a, b) => Number(b.attempts || 0) - Number(a.attempts || 0)).slice(0, 6);
  const hardest = [...graded].sort((a, b) => Number(a.avgPercentage) - Number(b.avgPercentage)).slice(0, 5);
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-[#e8e5f4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(139,92,246,0.14),transparent_65%),radial-gradient(45%_90%_at_100%_0%,rgba(14,165,233,0.11),transparent_65%)]" aria-hidden="true" />
        <div className="relative p-5 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300">Results</p>
          <h2 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[26px] dark:text-zinc-50">How students did in each mock</h2>
          <p className={`mt-2 max-w-xl text-[14px] leading-6 ${muted}`}>Pick a mock on the left to see every student's score, then open a student to check each answer.</p>
        </div>
        <dl className="relative grid grid-cols-2 gap-px border-t border-[#eef0f3] bg-[#eef0f3] sm:grid-cols-4 dark:border-white/[0.06] dark:bg-white/[0.06]">
          <Stat label="Mocks with results" value={attempted.length} />
          <Stat label="Attempts" value={attempts.toLocaleString()} tone="text-violet-700 dark:text-violet-300" />
          <Stat label="Average score" value={weight ? pct(weighted / weight) : '—'} hint="Across graded attempts, weighted by attempts" />
          <Stat label="Mocks in total" value={mocks.length} />
        </dl>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${surface} p-4 sm:p-5`} aria-labelledby="results-most">
          <h3 id="results-most" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><Users className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />Most attempted</h3>
          <ul className="mt-3 space-y-1">
            {top.length ? top.map((mock) => (
              <li key={mock._id}>
                <button type="button" onClick={() => onSelect(String(mock._id))} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03] ${insetRing}`}>
                  <CompanyLogo name={mock.company || mock.title} logo={mock.companyLogo} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">{mock.title}</span><span className={`block truncate text-[11.5px] ${muted}`}>{[mock.company, mock.role].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-right"><span className="block text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">{Number(mock.attempts || 0)}</span><span className={`block text-[11px] ${faint}`}>attempts</span></span>
                </button>
              </li>
            )) : <li className={`py-6 text-center text-[12.5px] ${muted}`}>No attempts yet.</li>}
          </ul>
        </section>
        <section className={`${surface} p-4 sm:p-5`} aria-labelledby="results-hard">
          <h3 id="results-hard" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><Target className="h-4 w-4 text-rose-500" aria-hidden="true" />Lowest average score</h3>
          <ul className="mt-3 space-y-2.5">
            {hardest.length ? hardest.map((mock) => {
              const value = Math.max(0, Math.min(100, Number(mock.avgPercentage)));
              return (
                <li key={mock._id}>
                  <button type="button" onClick={() => onSelect(String(mock._id))} className={`block w-full rounded-lg text-left ${insetRing}`}>
                    <span className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate font-semibold text-slate-800 dark:text-zinc-100">{mock.title}</span><span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">{pct(value)}</span></span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"><span className={`block h-full rounded-full ${value < 40 ? 'bg-rose-500' : value < 60 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${value}%` }} /></span>
                  </button>
                </li>
              );
            }) : <li className={`py-6 text-center text-[12.5px] ${muted}`}>No graded attempts yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

// --- One mock: numbers and students -------------------------------------------------------

const STUDENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'passed', label: 'Passed' },
  { key: 'failed', label: 'Below pass' },
  { key: 'checking', label: 'Being checked' },
  { key: 'progress', label: 'In progress' },
];
const PAGE = 50;

function MockResults({ mock, onOpenAttempt, onFullReport, onFeedback }) {
  const roster = useLiveAssessmentRoster(String(mock._id), { fallbackAssessment: mock, kind: 'mock' });
  const passPercentage = Number(roster.assessment?.passPercentage ?? mock.passPercentage ?? 40);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  // Only students who started the mock (the roster also lists eligible students who have not).
  const rows = useMemo(() => roster.rows
    .filter((row) => row.status && row.status !== 'not_started')
    .map((row) => ({ ...row, state: attemptState(row, passPercentage) }))
    .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1) || String(a.name).localeCompare(String(b.name))), [roster.rows, passPercentage]);
  const ranked = useMemo(() => {
    let rank = 0;
    return rows.map((row) => (row.percentage === null || row.percentage === undefined ? { ...row, rank: null } : { ...row, rank: (rank += 1) }));
  }, [rows]);
  const graded = rows.filter((row) => row.percentage !== null && row.percentage !== undefined);
  const finished = rows.filter((row) => FINISHED.has(row.status));
  const passed = graded.filter((row) => row.percentage >= passPercentage);
  const average = graded.length ? graded.reduce((sum, row) => sum + row.percentage, 0) / graded.length : null;
  const best = graded.length ? graded.reduce((top, row) => (row.percentage > top.percentage ? row : top), graded[0]) : null;
  const buckets = [0, 1, 2, 3, 4].map((index) => graded.filter((row) => Math.min(4, Math.floor(row.percentage / 20)) === index).length);
  const peak = Math.max(1, ...buckets);
  const term = query.trim().toLowerCase();
  const visible = ranked
    .filter((row) => filter === 'all' || row.state.key === filter)
    .filter((row) => !term || [row.name, row.rollNo, row.email, row.college, row.branch].some((value) => String(value || '').toLowerCase().includes(term)));

  return (
    <div className="space-y-5">
      <header className={`${surface} overflow-hidden`}>
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_0%_0%,rgba(139,92,246,0.09),transparent_70%)]" aria-hidden="true" />
          <div className="relative flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <CompanyLogo name={mock.company || mock.title} logo={mock.companyLogo} size="spot" />
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 dark:text-zinc-50" title={mock.title}>{mock.title}</h2>
                <p className={`mt-0.5 truncate text-[12.5px] ${muted}`}>{[mock.company, mock.role, mock.duration ? `${mock.duration} min` : '', mock.totalMarks ? `${mock.totalMarks} marks` : '', `pass mark ${passPercentage}%`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button type="button" onClick={() => roster.refresh?.()} className={ghostButton} aria-label="Refresh results"><RotateCcw className={`h-4 w-4 ${roster.refreshing ? 'animate-spin' : ''}`} /></button>
              <button type="button" onClick={onFeedback} className={ghostButton}><MessageSquareText className="h-4 w-4" aria-hidden="true" />Feedback</button>
              <button type="button" onClick={onFullReport} className={ghostButton}><BarChart3 className="h-4 w-4" aria-hidden="true" />Full report<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-[#eef0f3] bg-[#eef0f3] sm:grid-cols-3 xl:grid-cols-6 dark:border-white/[0.06] dark:bg-white/[0.06]">
          <Stat label="Attempted" value={rows.length} tone="text-violet-700 dark:text-violet-300" />
          <Stat label="Finished" value={finished.length} />
          <Stat label="Average score" value={pct(average)} />
          <Stat label="Passed" value={graded.length ? `${passed.length} (${pct((passed.length / graded.length) * 100)})` : '—'} tone="text-emerald-700 dark:text-emerald-300" />
          <Stat label="Top score" value={best ? pct(best.percentage) : '—'} hint={best ? best.name : ''} />
          <Stat label="Being checked" value={finished.length - graded.length} tone={finished.length - graded.length ? 'text-amber-700 dark:text-amber-300' : undefined} />
        </dl>
      </header>

      {graded.length > 0 && (
        <section className={`${surface} p-4 sm:p-5`} aria-labelledby="mock-spread">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="mock-spread" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />Score spread</h3>
            <p className={`text-[12px] ${muted}`}>{plural(graded.length, 'graded attempt')}</p>
          </div>
          <div className="mt-4 grid grid-cols-5 items-end gap-2" style={{ height: 120 }}>
            {buckets.map((count, index) => (
              <div key={index} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="text-[12px] font-bold tabular-nums text-slate-700 dark:text-zinc-200">{count}</span>
                <span className={`w-full rounded-t-lg ${index * 20 + 20 <= passPercentage ? 'bg-gradient-to-t from-rose-400 to-rose-300' : 'bg-gradient-to-t from-violet-600 to-violet-400'}`} style={{ height: `${Math.max(4, (count / peak) * 80)}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-5 gap-2 text-center text-[11px] text-slate-500 dark:text-zinc-400">{['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'].map((label) => <span key={label}>{label}</span>)}</div>
        </section>
      )}

      <section className={`${surface} overflow-hidden`} aria-labelledby="mock-students">
        <div className="flex flex-col gap-2.5 border-b border-[#eef0f3] px-4 py-3 dark:border-white/[0.06] xl:flex-row xl:items-center">
          <h3 id="mock-students" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-50"><Trophy className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />Students<span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-700 dark:bg-white/[0.08] dark:text-zinc-200">{visible.length}</span></h3>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-slate-100 p-0.5 [scrollbar-width:none] dark:bg-white/[0.05]" role="group" aria-label="Filter students">
              {STUDENT_FILTERS.map((option) => (
                <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => { setFilter(option.key); setLimit(PAGE); }}
                  className={`inline-flex h-7 shrink-0 items-center rounded-[10px] px-2.5 text-[11.5px] font-semibold transition-colors ${insetRing} ${filter === option.key ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>{option.label}</button>
              ))}
            </div>
            <label className="relative block w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} placeholder="Name, roll no. or college" aria-label="Find a student" className={searchInput} />
            </label>
          </div>
        </div>

        {roster.loading && !roster.rows.length ? (
          <div className={`flex items-center justify-center gap-2 px-4 py-14 text-[13px] ${muted}`}><Loader2 className="h-4 w-4 animate-spin" />Loading results…</div>
        ) : roster.error && !roster.rows.length ? (
          <p className="px-4 py-10 text-center text-[13px] text-rose-700 dark:text-rose-300">{roster.error}</p>
        ) : visible.length === 0 ? (
          <p className={`px-4 py-12 text-center text-[13px] ${muted}`}>{rows.length ? 'No student matches this filter.' : 'No student has attempted this mock yet.'}</p>
        ) : (
          <>
            <div className="hidden grid-cols-[52px_minmax(200px,1.6fr)_minmax(150px,1fr)_120px_100px_120px_28px] gap-x-3 border-b border-[#eef0f3] bg-[#fafbfc] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 lg:grid dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-500">
              <span>Rank</span><span>Student</span><span>Score</span><span>Result</span><span>Time</span><span>Submitted</span><span className="sr-only">Open</span>
            </div>
            <ul className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">
              {visible.slice(0, limit).map((row) => {
                const canOpen = Boolean(row.submissionId) && FINISHED.has(row.status);
                const share = Math.max(0, Math.min(100, Number(row.percentage) || 0));
                return (
                  <li key={row.key}>
                    <button type="button" disabled={!canOpen} onClick={() => onOpenAttempt(row)}
                      className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors disabled:cursor-default lg:grid-cols-[52px_minmax(200px,1.6fr)_minmax(150px,1fr)_120px_100px_120px_28px] ${canOpen ? 'hover:bg-violet-50/40 dark:hover:bg-white/[0.02]' : ''} ${insetRing}`}>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums ${row.rank === 1 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white' : row.rank && row.rank <= 3 ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{row.rank ?? '–'}</span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[12px] font-bold text-violet-700 sm:flex dark:bg-violet-500/10 dark:text-violet-200" aria-hidden="true">{initials(row.name)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{row.name || 'Student'}</span>
                          <span className={`block truncate text-[11.5px] ${muted}`}>{[row.rollNo, row.college || row.branch].filter(Boolean).join(' · ') || row.email}</span>
                        </span>
                      </span>
                      <span className="col-span-3 min-w-0 lg:col-span-1">
                        <span className="flex items-baseline gap-1.5 text-[13px]"><b className="font-bold tabular-nums text-slate-900 dark:text-white">{marks(row.score)}</b><span className={`tabular-nums ${faint}`}>/ {marks(row.maxMarks ?? mock.totalMarks)}</span><span className="ml-auto font-semibold tabular-nums text-slate-600 lg:ml-1 dark:text-zinc-300">{pct(row.percentage)}</span></span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"><span className={`block h-full rounded-full ${row.state.key === 'passed' ? 'bg-emerald-500' : row.state.key === 'failed' ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ width: `${share}%` }} /></span>
                      </span>
                      <span className="col-span-2 lg:col-span-1"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${row.state.tone}`}>{row.state.label}</span>{row.flagged && <ShieldAlert className="ml-1.5 inline h-3.5 w-3.5 text-amber-500" aria-label="Integrity flags" />}</span>
                      <span className={`hidden text-[12.5px] tabular-nums lg:block ${muted}`}>{duration(row.timeTakenSec)}</span>
                      <span className={`hidden text-[12.5px] lg:block ${muted}`}>{dateText(row.submittedAt)}</span>
                      <ChevronRight className={`hidden h-4 w-4 lg:block ${canOpen ? 'text-slate-400' : 'text-transparent'}`} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {visible.length > limit && (
              <div className="border-t border-[#eef0f3] p-3 text-center dark:border-white/[0.06]">
                <button type="button" onClick={() => setLimit((value) => value + PAGE)} className={ghostButton}>Show {Math.min(PAGE, visible.length - limit)} more<span className={faint}>· {visible.length - limit} left</span></button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// --- One student's attempt ------------------------------------------------------------------

function AttemptView({ submissionId, mock, row, passPercentage, onBack, onFullReport }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [tab, setTab] = useState('questions');
  const [openIndex, setOpenIndex] = useState(null);
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', data: null });
    api.getStudentAssessmentReport(submissionId)
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((error) => { if (active) setState({ loading: false, error: error.message || 'Could not load this attempt.', data: null }); });
    return () => { active = false; };
  }, [submissionId]);
  const data = state.data;
  // Opened from a link (no table row): the report names the student itself.
  const person = row || (data?.student ? { ...data.student, submittedAt: data.submittedAt } : null);
  const rows = useMemo(() => data?.questionWise || [], [data]);
  const counts = useMemo(() => outcomeCounts(rows), [rows]);
  const flags = data ? Object.entries(data.securityInfo || {}).filter(([key, value]) => key !== 'location' && Number(value) > 0).reduce((sum, [, value]) => sum + Number(value), 0) : 0;
  const pick = (index) => {
    setTab('questions');
    setOpenIndex(index);
    requestAnimationFrame(() => document.getElementById(`mock-attempt-q-${index}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white ${focusRing}`}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />All students in {mock.title}
      </button>
      <header className={`${surface} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-[15px] font-bold text-white" aria-hidden="true">{initials(person?.name)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-zinc-50">{person?.name || 'Student'}</h2>
            <p className={`mt-0.5 truncate text-[12.5px] ${muted}`}>{[person?.rollNo, person?.email, person?.college, person?.branch].filter(Boolean).join(' · ')}</p>
            <p className={`mt-0.5 text-[12px] ${faint}`}>Submitted {dateText(person?.submittedAt)} · {duration(data?.timeTakenSec ?? person?.timeTakenSec)}</p>
          </div>
          <button type="button" onClick={onFullReport} className={ghostButton}><BarChart3 className="h-4 w-4" aria-hidden="true" />Proctoring &amp; full report<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>

        {state.loading ? (
          <div className={`flex items-center justify-center gap-2 py-12 text-[13px] ${muted}`}><Loader2 className="h-4 w-4 animate-spin" />Loading the attempt…</div>
        ) : state.error ? (
          <p className="py-8 text-center text-[13px] text-rose-700 dark:text-rose-300">{state.error}</p>
        ) : (
          <div className="mt-5 flex flex-col gap-6 border-t border-[#eef0f3] pt-5 md:flex-row md:items-center dark:border-white/[0.06]">
            <ScoreRing percent={data.accuracy ?? 0} passPercentage={passPercentage} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="text-[32px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{marks(data.score)}<span className="text-[17px] font-semibold text-slate-400 dark:text-zinc-500"> / {marks(data.totalMarks)} marks</span></p>
                {data.score !== null && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset ${Number(data.accuracy) >= passPercentage ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25'}`}>
                    {Number(data.accuracy) >= passPercentage ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}{Number(data.accuracy) >= passPercentage ? 'Passed' : 'Below the pass mark'} ({passPercentage}%)
                  </span>
                )}
                {data.evaluationStatus && data.evaluationStatus !== 'completed' && <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[12px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300">Being checked</span>}
              </div>
              <OutcomeBar counts={counts} total={rows.length} />
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {[
                  [ListChecks, 'Questions', rows.length],
                  [CheckCircle2, 'Correct', data.correctAnswers ?? counts.correct],
                  [Clock3, 'Time taken', duration(data.timeTakenSec)],
                  [AlertTriangle, 'Integrity flags', flags],
                ].map(([Icon, label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f6f7f9] px-3.5 py-2.5 dark:bg-white/[0.04]">
                    <p className={`flex items-center gap-1.5 text-[11.5px] ${muted}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
                    <p className={`mt-0.5 text-[16px] font-bold tabular-nums ${label === 'Integrity flags' && value ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {data && (
        <>
          <div role="tablist" aria-label="Attempt view" className="flex gap-5 border-b border-[#e6e7eb] dark:border-white/[0.08]">
            {[['questions', 'Questions', rows.length], ['sections', 'Sections', (data.sectionBreakdown || []).length]].filter(([, , count]) => count > 0).map(([id, label, count]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] font-semibold transition-colors ${insetRing} ${tab === id ? 'border-violet-600 text-slate-900 dark:border-violet-400 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}>
                {label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{count}</span>
              </button>
            ))}
          </div>
          {tab === 'sections' ? (
            <section className={`${surface} p-5`} aria-label="Section scores"><SectionBars sections={data.sectionBreakdown || []} /></section>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)] xl:items-start">
              <aside className={`${surface} p-4 xl:sticky xl:top-0`} aria-label="Question map">
                <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-zinc-50">Questions at a glance</p>
                <QuestionMap rows={rows} onPick={pick} />
              </aside>
              <QuestionList rows={rows} openIndex={openIndex} onToggle={(index) => setOpenIndex((current) => (current === index ? null : index))} idPrefix="mock-attempt-q" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Page -------------------------------------------------------------------------------------

export default function MockResultsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('mock') || '';
  const attemptId = params.get('attempt') || '';
  const [list, setList] = useState({ loading: true, error: '', mocks: [] });
  const [reload, setReload] = useState(0);
  // The roster row behind ?attempt= (name, roll no.), kept while the attempt is open.
  const [attemptRow, setAttemptRow] = useState(null);

  useEffect(() => {
    let active = true;
    setList((current) => ({ ...current, loading: true, error: '' }));
    api.listAssessments({ kind: 'mock' })
      .then((data) => { if (active) setList({ loading: false, error: '', mocks: (data.assessments || []).filter((mock) => mock.lifecycleStatus !== 'draft' || Number(mock.attempts) > 0) }); })
      .catch((error) => { if (active) setList({ loading: false, error: error.message || 'Could not load mocks.', mocks: [] }); });
    return () => { active = false; };
  }, [reload]);

  const mock = list.mocks.find((entry) => String(entry._id) === selectedId) || null;
  const go = (next) => setParams((current) => {
    const updated = new URLSearchParams(current);
    Object.entries(next).forEach(([key, value]) => { if (value) updated.set(key, value); else updated.delete(key); });
    return updated;
  });
  const fullReport = () => navigate(`/admin/prepmock/reports?assessmentId=${encodeURIComponent(selectedId)}`);
  const attempted = list.mocks.filter((entry) => Number(entry.attempts) > 0);
  const totalAttempts = attempted.reduce((sum, entry) => sum + Number(entry.attempts || 0), 0);

  let body;
  if (list.loading && !list.mocks.length) body = <div className={`${surface} flex min-h-56 items-center justify-center gap-2 text-[13px] ${muted}`}><Loader2 className="h-4 w-4 animate-spin" />Loading mocks…</div>;
  else if (list.error) body = <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center text-[13px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{list.error}</div>;
  else if (selectedId && !mock) body = <div className={`${surface} p-8 text-center text-[13px] ${muted}`}>This mock is not available any more. <button type="button" onClick={() => go({ mock: '', attempt: '' })} className="font-semibold text-violet-700 underline dark:text-violet-300">Back to overview</button></div>;
  else if (mock && attemptId) {
    body = <AttemptView key={attemptId} submissionId={attemptId} mock={mock} row={attemptRow} passPercentage={Number(mock.passPercentage ?? 40)}
      onBack={() => go({ attempt: '' })} onFullReport={fullReport} />;
  } else if (mock) {
    body = <MockResults key={mock._id} mock={mock} onFullReport={fullReport} onFeedback={() => navigate('/admin/prepmock/feedback')}
      onOpenAttempt={(row) => { setAttemptRow(row); go({ attempt: row.submissionId }); }} />;
  } else body = <Overview mocks={list.mocks} onSelect={(id) => go({ mock: id, attempt: '' })} />;

  return (
    <div className="h-screen overflow-hidden bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
      <div className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col px-4 pt-4 sm:px-6 lg:pt-5">
        <MockPageHeader label="Results" icon={Trophy} chips={[
          { key: 'mocks', value: attempted.length, text: attempted.length === 1 ? 'mock with results' : 'mocks with results' },
          { key: 'attempts', value: totalAttempts.toLocaleString(), text: totalAttempts === 1 ? 'attempt' : 'attempts' },
        ]}>
          <button type="button" onClick={() => setReload((value) => value + 1)} className={ghostButton}><RotateCcw className={`h-4 w-4 ${list.loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh</button>
        </MockPageHeader>
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-6">
          <div className={`${selectedId ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col lg:pb-5`}>
            <MockRail mocks={list.mocks} selectedId={selectedId} onSelect={(id) => go({ mock: id, attempt: '' })} />
          </div>
          <div className={`${selectedId ? 'block' : 'hidden lg:block'} min-h-0 min-w-0 pb-6 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 [scrollbar-width:thin]`}>
            {selectedId && <button type="button" onClick={() => go({ mock: '', attempt: '' })} className={`mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold lg:hidden ${muted}`}><ArrowLeft className="h-4 w-4" />All mocks</button>}
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
