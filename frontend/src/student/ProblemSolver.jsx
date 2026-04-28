import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Send,
  RotateCcw,
  Tag,
  Building2,
  PanelLeftOpen,
  PanelRightOpen,
} from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import CodeEditor from './CodeEditor';
import { DifficultyBadge, EmptyState, LoadingPanel } from '../admin/compiler/CompilerUi';
import {
  formatDateTime,
  formatDuration,
  getLanguageLabel,
  submissionStatusClass,
} from '../admin/compiler/compilerUtils';
import { RichTextPreview } from '../admin/compiler/CompilerContentPreview';
import {
  buildProblemDrafts,
  getCodeValidationMessage,
  getStarterCodeForLanguage,
  loadProblemDrafts,
  saveProblemDrafts,
  studentStatusBadgeClass,
} from './problemUtils';
function StudentProgressBadge({ status }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${studentStatusBadgeClass(status)}`}>
      {status}
    </span>
  );
}

function LeftPanelTabs({
  activeTab,
  onTabChange,
  verdictLabel,
  verdictTone = 'neutral',
  verdictDisabled = false,
}) {
  const verdictTextTone = verdictTone === 'success'
    ? 'text-emerald-600 dark:text-emerald-300'
    : (verdictTone === 'danger' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-gray-400');

  return (
    <div className="sticky top-0 z-20 flex flex-none items-center justify-between gap-3 border-b border-slate-200/70 bg-white/92 px-5 pt-3 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/92">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onTabChange('description')}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === 'description'
              ? 'border-b-2 border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
              : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          Description
        </button>
        <button
          type="button"
          onClick={() => onTabChange('submissions')}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === 'submissions'
              ? 'border-b-2 border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
              : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          Submissions
        </button>

        <button
          type="button"
          onClick={() => onTabChange('acceptance')}
          disabled={verdictDisabled}
          className={`pb-3 text-sm font-semibold transition-colors ${
            activeTab === 'acceptance'
              ? 'border-b-2 border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
              : `border-b-2 border-transparent ${verdictTextTone} ${verdictDisabled ? 'opacity-50' : 'hover:text-slate-700 dark:hover:text-gray-200'}`
          }`}
        >
          {verdictLabel || 'Result'}
        </button>
      </div>

    </div>
  );
}

function decodeHtmlEntities(value) {
  const raw = String(value ?? '');
  if (!raw.includes('&')) return raw;
  return raw
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function formatMemoryMb(memoryUsedKb) {
  const numeric = Number(memoryUsedKb || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  return `${(numeric / 1024).toFixed(2)} MB`;
}

function CodeWithLineNumbers({ code }) {
  const normalized = String(code ?? '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return null;

  const lines = normalized.split('\n');
  const gutterWidth = String(Math.min(lines.length, 9999)).length;

  return (
    <div className="overflow-x-auto">
      <pre className="whitespace-pre text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span
              className="select-none pr-4 text-slate-400 dark:text-gray-500"
              style={{ minWidth: `${gutterWidth + 1}ch` }}
            >
              {index + 1}
            </span>
            <span className="text-slate-800 dark:text-gray-100">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function Histogram({ values, highlightValue, formatLabel, markerLabel = 'You' }) {
  const numbers = (values || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  if (numbers.length < 2) {
    return null;
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }

  const bins = 28;
  const range = max - min;
  const step = range / bins;
  const counts = Array.from({ length: bins }, () => 0);

  numbers.forEach((value) => {
    const rawIndex = step > 0 ? Math.floor((value - min) / step) : 0;
    const index = Math.min(bins - 1, Math.max(0, rawIndex));
    counts[index] += 1;
  });

  const maxCount = Math.max(...counts);
  const totalCount = counts.reduce((sum, count) => sum + count, 0);
  const percents = totalCount > 0 ? counts.map((count) => (count / totalCount) * 100) : counts.map(() => 0);
  const maxPercent = Math.max(...percents, 0);
  const yMax = Math.max(40, Math.ceil(maxPercent / 10) * 10);
  const highlightIndex = (() => {
    const hv = Number(highlightValue);
    if (!Number.isFinite(hv)) return -1;
    const rawIndex = step > 0 ? Math.floor((hv - min) / step) : 0;
    return Math.min(bins - 1, Math.max(0, rawIndex));
  })();

  const xTicks = Array.from({ length: 6 }, (_, idx) => {
    const t = idx / 5;
    const value = min + range * t;
    return {
      label: formatLabel ? formatLabel(value) : String(value),
      left: `${t * 100}%`,
    };
  });

  const markerLeft = highlightIndex >= 0
    ? `${((highlightIndex + 0.5) / bins) * 100}%`
    : null;

  // LeetCode-like hover tooltip.
  const [hover, setHover] = useState(null);

  return (
    <div className="rounded-[26px] bg-white/78 px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/80">
      <div className="relative">
        <div className="absolute inset-0 pointer-events-none">
          {[yMax, yMax / 2].map((tick) => {
            const top = yMax > 0 ? `${100 - (tick / yMax) * 100}%` : '100%';
            return (
              <div key={tick} className="absolute left-0 right-0" style={{ top }}>
                <div className="flex items-center gap-2">
                  <div className="w-9 text-[10px] text-slate-400 dark:text-gray-500">{`${tick}%`}</div>
                  <div className="h-px flex-1 bg-slate-100 dark:bg-gray-800" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative flex h-40 items-end gap-0.5 pl-9">
          {percents.map((percent, index) => {
            const heightPercent = yMax > 0 ? Math.round((percent / yMax) * 100) : 0;
            const isActive = index === highlightIndex;
            const barCount = counts[index];
            const runtimeValue = min + step * (index + 0.5);
            return (
              <div
                key={index}
                className={`flex-1 rounded-sm ${isActive ? 'bg-sky-600 dark:bg-sky-500' : 'bg-slate-300/90 dark:bg-gray-700'}`}
                style={{ height: `${Math.max(4, heightPercent)}%` }}
                onMouseEnter={() => setHover({ index, percent, count: barCount, value: runtimeValue })}
                onMouseMove={(event) => {
                  const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                  if (!rect) return;
                  const x = event.clientX - rect.left;
                  setHover((previous) => (previous ? { ...previous, x } : previous));
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </div>

        {markerLeft && (
          <div className="pointer-events-none absolute bottom-1" style={{ left: `calc(${markerLeft} + 2.25rem)` }}>
            <div className="relative -translate-x-1/2">
              <div className="h-10 w-px bg-slate-200 dark:bg-gray-700" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-sky-600 bg-white text-[10px] font-bold text-slate-700 shadow-sm dark:border-sky-500 dark:bg-gray-900 dark:text-gray-100">
                  {markerLabel}
                </div>
              </div>
            </div>
          </div>
        )}

        {hover && typeof hover.x === 'number' && (
          <div
            className="pointer-events-none absolute top-12"
            style={{ left: `calc(${hover.x}px + 2.25rem)` }}
          >
            <div className="relative -translate-x-1/2">
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-700 shadow-[0_10px_28px_rgba(15,23,42,0.12)] dark:bg-gray-900 dark:text-gray-200">
                {`${hover.percent.toFixed(2)}% of solutions used ${Math.round(hover.value)} ms of runtime`}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 pl-9">
        <div className="relative h-4">
          {xTicks.map((tick) => (
            <div
              key={tick.left}
              className="absolute -translate-x-1/2 text-[10px] text-slate-400 dark:text-gray-500"
              style={{ left: tick.left }}
            >
              {tick.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProblemDescriptionPanel({ problem }) {
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);

  const topics = problem.tags || [];
  const companies = problem.companyTags || [];

  return (
    <div className="space-y-6 px-5 py-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <StudentProgressBadge status={problem.studentStatus || 'Unsolved'} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{problem.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
            {Number(problem.acceptanceRate || 0).toFixed(1)}% acceptance | {problem.totalSubmissions || 0} submissions
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
          Description
        </h2>
        <RichTextPreview content={problem.description} />
      </section>

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.inputFormat || 'Input format will appear here.'}
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.outputFormat || 'Output format will appear here.'}
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Constraints</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.constraints || 'Constraints will appear here.'}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
            Examples
          </h2>
          <span className="text-xs text-slate-500 dark:text-gray-400">
            {problem.sampleTestCases?.length || 0} sample cases
          </span>
        </div>

        {(problem.sampleTestCases || []).length === 0 ? (
          <EmptyState
            title="No sample cases available"
            description="This problem has not been published with visible examples yet."
          />
        ) : (
          <div className="space-y-4">
            {(problem.sampleTestCases || []).map((testCase, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[24px] bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:bg-gray-900/85"
              >
                <div className="flex items-center justify-between gap-3 bg-slate-50/85 px-4 py-3 dark:bg-gray-800/85">
                  <div className="text-sm font-semibold text-slate-900 dark:text-gray-100">Example {index + 1}</div>
                </div>

                <div className="space-y-4 px-4 py-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</div>
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                      {testCase.input || ''}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</div>
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                      {testCase.output || ''}
                    </pre>
                  </div>

                  {testCase.explanation && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Explanation</div>
                      <div className="text-sm text-slate-700 dark:text-gray-300">{testCase.explanation}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(topics.length > 0 || companies.length > 0) && (
          <section className="divide-y divide-slate-200/70 rounded-[22px] bg-slate-50/80 dark:divide-gray-700 dark:bg-gray-800/70">
            {topics.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setTopicsOpen((previous) => !previous)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Tag className="h-4 w-4 text-slate-500 dark:text-gray-400" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">Topics</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform dark:text-gray-500 ${topicsOpen ? 'rotate-180' : ''}`} />
                </button>
                {topicsOpen && (
                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-2">
                      {topics.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {companies.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setCompaniesOpen((previous) => !previous)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">Companies</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform dark:text-gray-500 ${companiesOpen ? 'rotate-180' : ''}`} />
                </button>
                {companiesOpen && (
                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-2">
                      {companies.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </section>

    </div>
  );
}

function statusLabel(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'AC') return 'Accepted';
  if (normalized === 'WA') return 'Wrong Answer';
  if (normalized === 'TLE') return 'Time Limit Exceeded';
  if (normalized === 'RE') return 'Runtime Error';
  if (normalized === 'CE') return 'Compile Error';
  if (normalized === 'PENDING') return 'Pending';
  if (normalized === 'RUNNING') return 'Running';
  return status || 'Result';
}

function SubmissionDetail({ submission }) {
  if (!submission) return null;

  const prettyStatus = statusLabel(submission.status);
  const casesLabel = submission.totalTestCases > 0
    ? `${submission.passedTestCases || 0} / ${submission.totalTestCases} testcases passed`
    : '';

  const testCaseBars = Array.isArray(submission.testCaseResults)
    ? submission.testCaseResults
    : [];
  const maxCaseTime = testCaseBars.reduce((max, entry) => Math.max(max, Number(entry.executionTimeMs || 0)), 0);

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`text-lg font-bold ${prettyStatus === 'Accepted' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-900 dark:text-gray-100'}`}
            >
              {prettyStatus}
            </div>
            {casesLabel && (
              <div className="text-sm text-slate-500 dark:text-gray-400">{casesLabel}</div>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
            {formatDateTime(submission.createdAt)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] bg-slate-50/85 p-4 dark:bg-gray-800/85">
          <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Runtime</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{formatDuration(submission.executionTimeMs || 0)}</div>
        </div>
        <div className="rounded-[24px] bg-slate-50/85 p-4 dark:bg-gray-800/85">
          <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Memory</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">
            {submission.memoryUsedKb ? `${(submission.memoryUsedKb / 1024).toFixed(2)} MB` : '—'}
          </div>
        </div>
      </div>

      {testCaseBars.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Runtime Distribution</div>
          <div className="flex h-16 items-end gap-0.5 overflow-hidden rounded-[24px] bg-slate-50/85 px-3 py-2 dark:bg-gray-800/85">
            {testCaseBars.slice(0, 120).map((entry) => {
              const h = maxCaseTime > 0
                ? Math.max(10, Math.round((Number(entry.executionTimeMs || 0) / maxCaseTime) * 100))
                : 12;
              const isOk = String(entry.status || '').toUpperCase() === 'AC';
              return (
                <div
                  key={`${entry.index}-${entry.status}`}
                  className={isOk ? 'w-1 rounded-sm bg-sky-500/80' : 'w-1 rounded-sm bg-rose-500/80'}
                  style={{ height: `${h}%` }}
                  title={`Case ${entry.index}: ${statusLabel(entry.status)} (${entry.executionTimeMs || 0} ms)`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionList({ loading, submissions, selectedId, onSelect, onOpenDetail }) {
  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-5 py-5">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-gray-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500 dark:border-gray-700 dark:border-t-sky-400" />
          Loading your submissions...
        </div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="px-5 py-5">
        <EmptyState
          title="No submissions yet"
          description="Run or submit from the editor to build your attempt history here."
        />
      </div>
    );
  }

  const rows = submissions;
  const selectedSubmission = rows.find((submission) => String(submission._id) === String(selectedId))
    || rows[0];

  return (
    <div className="px-5 py-5">
      <div className="overflow-hidden rounded-[26px] bg-white/82 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/82">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <colgroup>
              <col className="w-[210px]" />
              <col className="w-[140px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-white text-xs font-semibold text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)] dark:bg-gray-900 dark:text-gray-300 dark:shadow-[inset_0_-1px_0_0_rgb(55,65,81)]">
              <tr>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Language</th>
                <th className="px-4 py-3 text-left">Runtime</th>
                <th className="px-4 py-3 text-left">Memory</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
              {rows.map((submission) => {
                const isSelected = String(submission._id) === String(selectedSubmission?._id);
                const statusText = statusLabel(submission.status);
                const statusUpper = String(submission.status || '').toUpperCase();
                const statusTone = statusUpper === 'AC'
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : (['CE', 'RE', 'WA', 'TLE'].includes(statusUpper) ? 'text-rose-600 dark:text-rose-300' : 'text-slate-800 dark:text-gray-100');

                return (
                  <tr
                    key={submission._id}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-900/10'
                        : 'bg-white hover:bg-slate-50 dark:bg-gray-900 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => {
                      onSelect?.(submission._id);
                      onOpenDetail?.();
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-semibold ${statusTone}`}>{statusText}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                            {submission.mode}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-gray-500">
                          {formatDateTime(submission.createdAt)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:bg-gray-900 dark:text-gray-200">
                        {getLanguageLabel(submission.language)}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-gray-100">
                      {submission.executionTimeMs ? formatDuration(submission.executionTimeMs) : 'N/A'}
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-gray-100">
                      {formatMemoryMb(submission.memoryUsedKb)}
                    </td>

                    <td className="px-4 py-3 text-slate-400 dark:text-gray-500">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function beatsPercentLowerIsBetter(value, dataset) {
  const numericValue = Number(value);
  const values = (dataset || [])
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0 || values.length < 2) {
    return null;
  }

  const slowerCount = values.filter((entry) => entry > numericValue).length;
  return Math.max(0, Math.min(100, (slowerCount / values.length) * 100));
}

function AcceptancePanel({ submissions, selectedId, onBack }) {
  const rows = Array.isArray(submissions) ? submissions : [];
  const selected = rows.find((entry) => String(entry._id) === String(selectedId)) || rows[0] || null;
  const analysisRef = useRef(null);
  const solutionRef = useRef(null);
  const [activeShortcut, setActiveShortcut] = useState('analysis');

  useEffect(() => {
    const target = activeShortcut === 'solution' ? solutionRef.current : analysisRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeShortcut, selected?._id]);

  if (!selected) {
    return (
      <div className="px-5 py-5">
        <EmptyState
          title="No submissions yet"
          description="Submit a solution to see runtime and memory analytics here."
        />
      </div>
    );
  }

  const languageKey = selected.language;
  const peer = rows
    .filter((entry) => entry.mode === 'submit' && entry.language === languageKey)
    .filter((entry) => Number(entry.executionTimeMs || 0) > 0 || Number(entry.memoryUsedKb || 0) > 0);

  const runtimeMs = Number(selected.executionTimeMs || 0);
  const memoryKb = Number(selected.memoryUsedKb || 0);

  const runtimeBeats = beatsPercentLowerIsBetter(runtimeMs, peer.map((entry) => entry.executionTimeMs));
  const memoryBeats = beatsPercentLowerIsBetter(memoryKb, peer.map((entry) => entry.memoryUsedKb));

  const codeText = decodeHtmlEntities(selected.sourceCode || '');
  const compileText = decodeHtmlEntities(selected.compileOutput || '');
  const stderrText = decodeHtmlEntities(selected.stderr || '');

  const statusUpper = String(selected.status || '').toUpperCase();
  const isAccepted = statusUpper === 'AC';
  const isCompileError = statusUpper === 'CE';
  const isWrongAnswer = statusUpper === 'WA';
  const isErrorLike = ['CE', 'RE', 'WA', 'TLE'].includes(statusUpper);

  const totalCases = Number(selected.totalTestCases ?? 0);
  const passedCases = Number(selected.passedTestCases ?? 0);
  const passedLabel = `${passedCases} / ${totalCases} testcases passed`;

  const failedCaseIndex = Number(selected.failedCase?.index || 0);
  const caseResults = Array.isArray(selected.testCaseResults) ? selected.testCaseResults : [];

  const userName = selected.user?.name || '';
  const initials = userName
    ? userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
    : 'U';

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
            All Submissions
          </button>

          <div className="flex flex-wrap items-baseline gap-2">
            <div className={`text-lg font-bold ${
              isAccepted
                ? 'text-emerald-600 dark:text-emerald-300'
                : (isErrorLike ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-gray-100')
            }`}>
              {statusLabel(selected.status)}
            </div>
            <div className="text-xs text-slate-400 dark:text-gray-500">{passedLabel}</div>
          </div>

          {caseResults.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {caseResults.slice(0, 200).map((entry) => {
                const isOk = String(entry.status || '').toUpperCase() === 'AC';
                const isFailed = failedCaseIndex > 0 && Number(entry.index) === failedCaseIndex;
                const base = isOk
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800';
                const ring = isFailed ? 'ring-2 ring-amber-400/60 dark:ring-amber-300/40' : '';

                return (
                  <span
                    key={entry.index}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${base} ${ring}`}
                    title={`Case ${entry.index}: ${statusLabel(entry.status)}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    Case {entry.index}
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-gray-800 dark:text-gray-100">
              {initials}
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-gray-100">{userName || 'You'}</span>
              <span className="text-slate-400 dark:text-gray-500">&nbsp;submitted at {formatDateTime(selected.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveShortcut('analysis')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeShortcut === 'analysis' ? 'bg-slate-900 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
          >
            Analysis
          </button>
          {isAccepted && (
            <button
              type="button"
              onClick={() => setActiveShortcut('solution')}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeShortcut === 'solution' ? 'bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/30'}`}
            >
              Solution
            </button>
          )}
        </div>
      </div>

      {isAccepted && (
        <div
          ref={analysisRef}
          className={`overflow-hidden rounded-[26px] bg-white/82 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-all dark:bg-gray-900/82 ${activeShortcut === 'analysis' ? 'ring-2 ring-sky-300/70 dark:ring-sky-500/40' : ''}`}
        >
          <div className="grid gap-0 md:grid-cols-2">
            <div className="space-y-1 bg-slate-50 px-5 py-5 dark:bg-gray-800">
              <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">Runtime</div>
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="text-xl font-bold text-slate-900 dark:text-gray-100">
                  {runtimeMs ? `${Math.round(runtimeMs)} ms` : '—'}
                </div>
                <div className="text-xs text-slate-500 dark:text-gray-400">
                  {runtimeBeats === null ? 'Beats —' : `Beats ${runtimeBeats.toFixed(2)}%`}
                </div>
              </div>
            </div>

            <div className="space-y-1 px-5 py-5">
              <div className="text-sm font-semibold text-slate-400 dark:text-gray-500">Memory</div>
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="text-xl font-bold text-slate-400 dark:text-gray-500">
                  {formatMemoryMb(memoryKb)}
                </div>
                <div className="text-xs text-slate-400 dark:text-gray-500">
                  {memoryBeats === null ? 'Beats —' : `Beats ${memoryBeats.toFixed(2)}%`}
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <Histogram
              values={peer.map((entry) => entry.executionTimeMs)}
              highlightValue={runtimeMs}
              formatLabel={(value) => `${Math.round(value)}ms`}
              markerLabel={initials || 'You'}
            />
          </div>
        </div>
      )}

      {isCompileError && (compileText || stderrText) && (
        <div className="rounded-[24px] bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-[0_12px_24px_rgba(244,63,94,0.06)] dark:bg-rose-900/10 dark:text-rose-200">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{compileText || stderrText}</pre>
        </div>
      )}

      {isWrongAnswer && (
        <div className="space-y-4">
          <div className="rounded-[24px] bg-rose-50 px-5 py-4 text-sm text-rose-800 shadow-[0_12px_24px_rgba(244,63,94,0.06)] dark:bg-rose-900/10 dark:text-rose-200">
            One of the judge test cases did not match the expected output.
          </div>

          {failedCaseIndex > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Case {failedCaseIndex}
              </span>
            </div>
          )}
        </div>
      )}

      {codeText && (
        <div
          ref={solutionRef}
          className={`space-y-2 rounded-[26px] transition-all ${activeShortcut === 'solution' ? 'ring-2 ring-emerald-300/70 dark:ring-emerald-500/40' : ''}`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-gray-400">
            <span>Code</span>
            <span className="text-slate-300 dark:text-gray-600">|</span>
            <span className="text-slate-600 dark:text-gray-300">{getLanguageLabel(selected.language)}</span>
          </div>
          <div className="rounded-[24px] bg-white/82 px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] dark:bg-gray-900/82">
            <CodeWithLineNumbers code={codeText} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProblemSolver() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const splitContainerRef = useRef(null);
  const dragFrameRef = useRef(null);
  const submissionPollRef = useRef(null);
  const submissionTrackerRef = useRef(null);
  const isMountedRef = useRef(true);
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState('description');
  const [activeConsoleTab, setActiveConsoleTab] = useState('testcase');
  const [mobileView, setMobileView] = useState('description');
  const [problemListOpen, setProblemListOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(null);
  const [language, setLanguage] = useState('python');
  const [drafts, setDrafts] = useState({});
  const [problemList, setProblemList] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [activeTestCaseId, setActiveTestCaseId] = useState(null);
  const [lastRunInput, setLastRunInput] = useState('');
  const [lastRunCaseId, setLastRunCaseId] = useState(null);
  const [result, setResult] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stopSubmissionPolling = useCallback(() => {
    if (submissionPollRef.current) {
      clearInterval(submissionPollRef.current);
      submissionPollRef.current = null;
    }
    submissionTrackerRef.current = null;
  }, []);

  useEffect(() => () => {
    isMountedRef.current = false;
    stopSubmissionPolling();
  }, [stopSubmissionPolling]);

  const loadSubmissions = useCallback(async ({ silent = false, selectLatest = false } = {}) => {
    if (!id) {
      return [];
    }

    try {
      if (!silent) {
        setSubmissionsLoading(true);
      }
      const response = await api.listStudentProblemSubmissions(id, { page: 1, limit: 50 });
      const next = response.submissions || [];
      setSubmissions(next);

      if (selectLatest && next.length > 0) {
        setSelectedSubmissionId(next[0]._id);
      } else if (next.length > 0) {
        setSelectedSubmissionId((current) => current || next[0]._id);
      }

      return next;
    } catch (error) {
      if (!silent) {
        toast.error(error.message || 'Failed to load submissions.');
      }
      return [];
    } finally {
      if (!silent) {
        setSubmissionsLoading(false);
      }
    }
  }, [id, toast]);

  const syncSubmissionResult = useCallback((submission) => {
    if (!submission || !isMountedRef.current) {
      return;
    }

    const normalizedStatus = String(submission.status || '').toUpperCase();
    setResult(submission);
    setActiveConsoleTab('result');
    setActiveLeftTab('acceptance');
    if (submission._id) {
      setSelectedSubmissionId(submission._id);
    }
    if (normalizedStatus === 'AC' || normalizedStatus === 'ACCEPTED') {
      setProblem((previous) => (previous ? { ...previous, studentStatus: 'Solved' } : previous));
    }
  }, []);

  const finalizeTrackedSubmission = useCallback((submission, { successMessage, errorMessage } = {}) => {
    if (!isMountedRef.current) {
      return;
    }

    syncSubmissionResult(submission);
    stopSubmissionPolling();
    void loadSubmissions({ silent: true, selectLatest: true }).catch(() => {
      // The submission row is already finalized; the UI can still use the current snapshot.
    });
    setIsSubmitting(false);

    if (successMessage) {
      toast.success(successMessage);
    } else if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [loadSubmissions, stopSubmissionPolling, syncSubmissionResult, toast]);

  const findTrackedSubmission = useCallback((submissionsList) => {
    const tracker = submissionTrackerRef.current;
    if (!tracker) {
      return null;
    }

    return (submissionsList || []).find((submission) => {
      const status = String(submission.status || '').toUpperCase();
      const createdAt = new Date(submission.createdAt || 0).getTime();
      return submission.mode === 'submit'
        && String(submission.language || '') === tracker.language
        && String(submission.sourceCode || '') === tracker.sourceCode
        && createdAt >= tracker.startedAt - 1000
        && createdAt <= tracker.startedAt + 5 * 60 * 1000
        && ['PENDING', 'RUNNING', 'AC', 'WA', 'TLE', 'RE', 'CE'].includes(status);
    }) || null;
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const clampLeftWidth = useCallback((nextWidth) => {
    const minLeft = 320;
    const minRight = 420;
    const splitterWidth = 12;
    const container = splitContainerRef.current;
    if (!container) {
      return Math.max(minLeft, Math.round(nextWidth));
    }

    const containerWidth = container.getBoundingClientRect().width;
    const maxLeft = Math.max(minLeft, Math.floor(containerWidth - minRight - splitterWidth));
    const rounded = Math.round(nextWidth);
    return Math.min(maxLeft, Math.max(minLeft, rounded));
  }, []);

  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) return;

    const ensureWidthInBounds = () => {
      const rect = container.getBoundingClientRect();
      const defaultWidth = rect.width > 0 ? rect.width * 0.4 : 480;
      setLeftWidth((previous) => clampLeftWidth(previous ?? defaultWidth));
    };

    ensureWidthInBounds();
    const observer = new ResizeObserver(() => ensureWidthInBounds());
    observer.observe(container);
    return () => observer.disconnect();
  }, [clampLeftWidth]);

  useEffect(() => {
    let isMounted = true;

    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getStudentProblem(id);
        if (!isMounted) {
          return;
        }

        const storedDrafts = loadProblemDrafts(id);
        const nextDrafts = buildProblemDrafts(response, storedDrafts);
        const nextLanguage = response.supportedLanguages?.[0] || 'python';

        setProblem(response);
        setDrafts(nextDrafts);
        setLanguage((previous) => (
          response.supportedLanguages?.includes(previous) ? previous : nextLanguage
        ));
        const samples = Array.isArray(response.sampleTestCases) ? response.sampleTestCases : [];
        const nextCases = samples.map((testCase, index) => ({
          id: `sample-${index + 1}`,
          kind: 'sample',
          input: testCase?.input || '',
          expectedOutput: testCase?.output || '',
        }));
        setTestCases(nextCases);
        setActiveTestCaseId(nextCases[0]?.id || null);
        setLastRunInput('');
        setLastRunCaseId(null);
        setResult(null);
      } catch (error) {
        if (isMounted) {
          toast.error(error.message || 'Failed to load the selected problem.');
          setProblem(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProblem();
    return () => {
      isMounted = false;
    };
  }, [id, toast]);

  useEffect(() => {
    let isMounted = true;

    const loadProblemList = async () => {
      try {
        const response = await api.listStudentProblems({
          sortBy: 'updatedAt',
          sortOrder: 'desc',
          page: 1,
          limit: 200,
        });
        if (isMounted) {
          setProblemList(response.problems || []);
        }
      } catch {
        if (isMounted) {
          setProblemList([]);
        }
      }
    };

    loadProblemList();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (problem?._id) {
      saveProblemDrafts(problem._id, drafts);
    }
  }, [drafts, problem?._id]);

  useEffect(() => {
    if (problem?._id) {
      loadSubmissions({ silent: true, selectLatest: true });
    }
  }, [loadSubmissions, problem?._id]);

  useEffect(() => {
    if (activeLeftTab === 'submissions' || activeLeftTab === 'acceptance') {
      loadSubmissions();
    }
  }, [activeLeftTab, loadSubmissions]);

  const activeCode = useMemo(() => {
    if (!problem) {
      return '';
    }
    return drafts[language] ?? problem.codeTemplates?.[language] ?? '';
  }, [drafts, language, problem]);

  const activeTestCase = useMemo(() => {
    if (!Array.isArray(testCases) || testCases.length === 0) return null;
    const found = testCases.find((entry) => String(entry.id) === String(activeTestCaseId));
    return found || testCases[0];
  }, [activeTestCaseId, testCases]);

  const activeTestCaseInput = activeTestCase?.input ?? '';

  const expectedOutputForRun = useMemo(() => {
    const targetId = lastRunCaseId || activeTestCaseId;
    if (!targetId) return null;
    const found = testCases.find((entry) => String(entry.id) === String(targetId));
    if (!found) return null;
    return found.expectedOutput !== undefined ? found.expectedOutput : null;
  }, [activeTestCaseId, lastRunCaseId, testCases]);

  const verdictForTab = useMemo(() => {
    if (!submissions || submissions.length === 0) return null;
    const selected = selectedSubmissionId
      ? submissions.find((entry) => entry._id === selectedSubmissionId)
      : null;
    return selected || submissions[0];
  }, [submissions, selectedSubmissionId]);

  const verdictTabLabel = verdictForTab ? statusLabel(verdictForTab.status) : 'Result';
  const verdictTabTone = (() => {
    const upper = String(verdictForTab?.status || '').toUpperCase();
    if (upper === 'AC') return 'success';
    if (['WA', 'CE', 'RE', 'TLE'].includes(upper)) return 'danger';
    return 'neutral';
  })();

  const currentProblemIndex = useMemo(() => (
    problemList.findIndex((entry) => String(entry._id) === String(id))
  ), [id, problemList]);

  const previousProblem = currentProblemIndex > 0 ? problemList[currentProblemIndex - 1] : null;
  const nextProblem = currentProblemIndex >= 0 ? problemList[currentProblemIndex + 1] : null;

  const openProblemById = useCallback((problemId) => {
    if (!problemId || String(problemId) === String(id)) {
      setProblemListOpen(false);
      return;
    }
    setProblemListOpen(false);
    navigate(`/problems/${problemId}`);
  }, [id, navigate]);

  const updateDraft = (nextCode) => {
    setDrafts((previous) => ({
      ...previous,
      [language]: nextCode,
    }));
  };

  const resetCode = () => {
    if (!problem) {
      return;
    }

    setDrafts((previous) => ({
      ...previous,
      [language]: problem.codeTemplates?.[language] || '',
    }));
    setResult(null);
  };

  const handleRun = async () => {
    if (!problem) {
      return;
    }

    const validationMessage = getCodeValidationMessage(
      activeCode,
      getStarterCodeForLanguage(problem, language),
      'run',
    );
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    const selectedCase = activeTestCase;
    const runInput = selectedCase?.input ?? '';
    const runCases = (Array.isArray(testCases) && testCases.length > 0 ? testCases : [selectedCase])
      .filter(Boolean)
      .map((entry, index) => ({
        id: entry.id || `case-${index + 1}`,
        label: `Case ${index + 1}`,
        kind: 'sample',
        input: String(entry.input ?? ''),
        ...(entry.expectedOutput !== null && entry.expectedOutput !== undefined
          ? { expectedOutput: String(entry.expectedOutput ?? '') }
          : {}),
      }));

    setLastRunInput(runInput);
    setLastRunCaseId(selectedCase?.id || null);
    setResult(null);

    setIsRunning(true);
    setActiveConsoleTab('result');
    try {
      const queuedJob = await api.runStudentProblem(problem._id, {
        language,
        sourceCode: activeCode,
        customInput: runInput,
        testCases: runCases,
      });

      let completedRun = queuedJob;
      if (queuedJob?.jobId) {
        toast.info('Run received. Waiting for execution result.');
        completedRun = await api.waitForExecutionResult(queuedJob.jobId, {
          intervalMs: 1000,
          timeoutMs: 2 * 60 * 1000,
        });
      }

      const nextSubmissions = await loadSubmissions({ silent: true, selectLatest: true });
      const matchedSubmission = queuedJob?.jobId
        ? nextSubmissions.find((submission) => String(submission.jobId || '') === String(queuedJob.jobId))
        : null;
      const responsePayload = completedRun?.result?.response || completedRun;
      if (matchedSubmission) {
        setResult(responsePayload);
        setSelectedSubmissionId(matchedSubmission._id);
        toast.success(`Run finished with status ${responsePayload?.status || statusLabel(matchedSubmission.status)}`);
      } else {
        setResult(responsePayload);
        toast.success(`Run finished with status ${responsePayload?.status || 'Completed'}`);
      }

    } catch (error) {
      toast.error(error.message || 'Failed to run code.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = () => {
    if (!problem) {
      return;
    }

    const validationMessage = getCodeValidationMessage(
      activeCode,
      getStarterCodeForLanguage(problem, language),
      'submit',
    );
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    stopSubmissionPolling();
    setIsSubmitting(true);

    void api.submitStudentProblem(problem._id, {
      language,
      sourceCode: activeCode,
    }).then(async (queuedJob) => {
      if (!isMountedRef.current) {
        return;
      }

      if (queuedJob?.jobId) {
        toast.info('Submission received. Waiting for final verdict.');
        await api.waitForExecutionResult(queuedJob.jobId, {
          intervalMs: 1000,
          timeoutMs: 10 * 60 * 1000,
        });
      }

      const nextSubmissions = await loadSubmissions({ silent: true, selectLatest: true });
      const matchedSubmission = queuedJob?.jobId
        ? nextSubmissions.find((submission) => String(submission.jobId || '') === String(queuedJob.jobId))
        : findTrackedSubmission(nextSubmissions);

      if (matchedSubmission) {
        finalizeTrackedSubmission(matchedSubmission, {
          successMessage: `Submission finished with verdict ${statusLabel(matchedSubmission.status)}`,
        });
        return;
      }

      stopSubmissionPolling();
      setIsSubmitting(false);
      toast.success('Submission finished. Refresh the submissions tab if details are not visible yet.');
    }).catch((error) => {
      if (isMountedRef.current) {
        stopSubmissionPolling();
        setIsSubmitting(false);
        toast.error(error.message || 'Failed to submit code.');
      }
    });
  };

  const handleResizeStart = (event) => {
    if (!splitContainerRef.current) {
      return;
    }

    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }

    const containerRect = splitContainerRef.current.getBoundingClientRect();
    const defaultWidth = containerRect.width > 0 ? containerRect.width * 0.45 : 480;
    const startWidth = clampLeftWidth(leftWidth ?? defaultWidth);
    const startX = event.clientX;
    let latestWidth = startWidth;

    const schedule = (next) => {
      latestWidth = clampLeftWidth(next);
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        setLeftWidth(latestWidth);
      });
    };

    const handlePointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      schedule(startWidth + delta);
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 pb-8 pt-20">
        <div className="w-full">
          <LoadingPanel label="Loading problem workspace..." />
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="min-h-screen px-4 pb-8 pt-20">
        <div className="w-full">
          <EmptyState
            title="Problem unavailable"
            description="The requested problem could not be loaded or is no longer active."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#eff6ff_45%,_#f8fafc_100%)] dark:bg-[linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <div className="flex h-full min-h-0 flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 bg-white/86 px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)] backdrop-blur-xl dark:bg-gray-900/88">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              aria-label="Go back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setProblemListOpen((previous) => !previous)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {problemListOpen ? <PanelRightOpen className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              Problem List
            </button>
            <div className="hidden items-center gap-1 rounded-xl bg-white/90 p-1 shadow-[0_8px_18px_rgba(15,23,42,0.035)] dark:bg-gray-900 lg:inline-flex">
              <button
                type="button"
                onClick={() => previousProblem && openProblemById(previousProblem._id)}
                disabled={!previousProblem}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Previous problem"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nextProblem && openProblemById(nextProblem._id)}
                disabled={!nextProblem}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Next problem"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-xl bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-500"
            >
              {(problem.supportedLanguages || []).map((supportedLanguage) => (
                <option key={supportedLanguage} value={supportedLanguage}>
                  {getLanguageLabel(supportedLanguage)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={resetCode}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>

            <div className="flex items-center gap-1 rounded-2xl bg-white/90 p-1 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:bg-gray-900 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView('description')}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'description' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                Description
              </button>
              <button
                type="button"
                onClick={() => setMobileView('editor')}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'editor' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                Editor
              </button>
            </div>
          </div>
        </header>

        <div className="relative hidden min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2 lg:flex">
          {problemListOpen && (
            <>
              <button
                type="button"
                onClick={() => setProblemListOpen(false)}
                className="absolute inset-0 z-30 cursor-default bg-transparent"
                aria-label="Close problem list"
              />
              <aside className="absolute inset-y-0 left-0 z-40 flex w-[35vw] min-w-[340px] max-w-[460px] flex-col overflow-hidden rounded-r-[30px] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] dark:bg-gray-900">
              <div className="border-b border-slate-200/70 px-5 py-4 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">Problem Navigator</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{problemList.length} questions</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-gray-800">
                    <button
                      type="button"
                      onClick={() => previousProblem && openProblemById(previousProblem._id)}
                      disabled={!previousProblem}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Previous question"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => nextProblem && openProblemById(nextProblem._id)}
                      disabled={!nextProblem}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Next question"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {problemList.map((entry, index) => {
                    const active = String(entry._id) === String(id);
                    return (
                      <button
                        key={entry._id}
                        type="button"
                        onClick={() => openProblemById(entry._id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${active ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-100 dark:ring-sky-800' : 'bg-white/78 text-slate-700 hover:bg-slate-50 dark:bg-gray-950/40 dark:text-gray-200 dark:hover:bg-gray-800/80'}`}
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                            Question {index + 1}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold">{entry.title}</p>
                        </div>
                        <div className="shrink-0">
                          <DifficultyBadge difficulty={entry.difficulty} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              </aside>
            </>
          )}

          <div
            ref={splitContainerRef}
            className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 grid-cols-[auto_16px_minmax(0,1fr)] overflow-hidden"
          >
          <section
            style={{
              width: leftWidth === null ? 'clamp(320px, 40vw, 680px)' : `${leftWidth}px`,
              flexBasis: leftWidth === null ? 'clamp(320px, 40vw, 680px)' : `${leftWidth}px`,
              willChange: 'width',
            }}
            className="flex shrink-0 min-w-[320px] flex-col overflow-hidden rounded-[30px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84"
          >
            <LeftPanelTabs
              activeTab={activeLeftTab}
              onTabChange={setActiveLeftTab}
              verdictLabel={verdictTabLabel}
              verdictTone={verdictTabTone}
              verdictDisabled={!verdictForTab}
            />
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
              {activeLeftTab === 'description' ? (
                <ProblemDescriptionPanel problem={problem} />
              ) : activeLeftTab === 'submissions' ? (
                <SubmissionList
                  loading={submissionsLoading}
                  submissions={submissions}
                  selectedId={selectedSubmissionId}
                  onSelect={setSelectedSubmissionId}
                  onOpenDetail={() => setActiveLeftTab('acceptance')}
                />
              ) : (
                <AcceptancePanel
                  submissions={submissions}
                  selectedId={selectedSubmissionId}
                  onBack={() => setActiveLeftTab('submissions')}
                />
              )}
            </div>
          </section>

          <button
            type="button"
            onPointerDown={handleResizeStart}
            className="group relative flex w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center transition-colors"
            aria-label="Resize panels"
          >
            <div className="absolute inset-y-5 left-1/2 w-px -translate-x-1/2 rounded-full bg-slate-200/90 dark:bg-gray-700" />
            <div className="relative z-10 rounded-full bg-white/92 p-1 text-slate-400 shadow-[0_10px_20px_rgba(15,23,42,0.06)] transition-colors group-hover:text-sky-500 dark:bg-gray-900 dark:text-gray-500">
              <PanelLeftOpen className="h-3.5 w-3.5 rotate-90" />
            </div>
          </button>

          <section className="min-h-0 min-w-0 overflow-hidden">
            <CodeEditor
              supportedLanguages={problem.supportedLanguages || []}
              language={language}
              code={activeCode}
              onLanguageChange={setLanguage}
              onCodeChange={updateDraft}
              customInput={activeTestCaseInput}
              testCases={testCases}
              activeTestCaseId={activeTestCaseId}
              onActiveTestCaseChange={setActiveTestCaseId}
              runInputUsed={lastRunCaseId ? lastRunInput : null}
              expectedOutputForRun={expectedOutputForRun}
              activeConsoleTab={activeConsoleTab}
              onConsoleTabChange={setActiveConsoleTab}
              result={result}
              isRunning={isRunning}
              isSubmitting={isSubmitting}
              onRun={handleRun}
              onSubmit={handleSubmit}
              onReset={resetCode}
              showToolbar={false}
            />
          </section>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 px-3 pb-3 pt-2 lg:hidden">
          <div className={`overflow-hidden rounded-[28px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84 ${mobileView === 'description' ? 'block' : 'hidden'}`}>
            <LeftPanelTabs
              activeTab={activeLeftTab}
              onTabChange={setActiveLeftTab}
              verdictLabel={verdictTabLabel}
              verdictTone={verdictTabTone}
              verdictDisabled={!verdictForTab}
            />
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto scroll-smooth">
              {activeLeftTab === 'description' ? (
                <ProblemDescriptionPanel problem={problem} />
              ) : activeLeftTab === 'submissions' ? (
                <SubmissionList
                  loading={submissionsLoading}
                  submissions={submissions}
                  selectedId={selectedSubmissionId}
                  onSelect={setSelectedSubmissionId}
                  onOpenDetail={() => setActiveLeftTab('acceptance')}
                />
              ) : (
                <AcceptancePanel
                  submissions={submissions}
                  selectedId={selectedSubmissionId}
                  onBack={() => setActiveLeftTab('submissions')}
                />
              )}
            </div>
          </div>

          <div className={`${mobileView === 'editor' ? 'block' : 'hidden'}`}>
            <CodeEditor
              supportedLanguages={problem.supportedLanguages || []}
              language={language}
              code={activeCode}
              onLanguageChange={setLanguage}
              onCodeChange={updateDraft}
              customInput={activeTestCaseInput}
              testCases={testCases}
              activeTestCaseId={activeTestCaseId}
              onActiveTestCaseChange={setActiveTestCaseId}
              runInputUsed={lastRunCaseId ? lastRunInput : null}
              expectedOutputForRun={expectedOutputForRun}
              activeConsoleTab={activeConsoleTab}
              onConsoleTabChange={setActiveConsoleTab}
              result={result}
              isRunning={isRunning}
              isSubmitting={isSubmitting}
              onRun={handleRun}
              onSubmit={handleSubmit}
              onReset={resetCode}
              showToolbar={false}
            />
          </div>
        </div>

        {/* Intentionally no below-fold cards here to keep the page fixed-height (LeetCode-style). */}
      </div>
    </div>
  );
}
