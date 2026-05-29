import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  EyeOff,
  FileText,
  Filter,
  Lock,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Target,
  XCircle,
} from 'lucide-react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatDateTime, formatScore, formatSeconds, formatShortDate } from './assessment-dashboard/assessmentDashboardUtils';
import { useToast } from '../components/CustomToast';

const STORAGE_KEY = 'peerprep_student_report_workspace_v1';

const shellClass = 'border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const mutedText = 'text-slate-500 dark:text-gray-400';
const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500';

function permission(report, key) {
  return Boolean(report?.permissions?.[key]);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function percent(value, total) {
  const n = Number(value || 0);
  const d = Number(total || 0);
  return d > 0 ? Math.max(0, Math.min(100, (n / d) * 100)) : 0;
}

function scorePercent(report) {
  if (!permission(report, 'canViewPercentage')) return null;
  if (Number.isFinite(Number(report?.accuracy))) return Number(report.accuracy);
  return percent(report?.score, report?.totalMarks);
}

function safeFileName(value = 'assessment-report') {
  return String(value || 'assessment-report')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'assessment-report';
}

async function exportStudentReportExcel(report) {
  if (!report) return;
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const pct = scorePercent(report);
  const scoreVisible = permission(report, 'canViewScore');

  const summaryRows = [
    ['Assessment', report.assessmentName || 'Untitled Assessment'],
    ['Status', report.status || ''],
    ['Assessment type', report.assessmentType || ''],
    ['Submitted', report.submittedAt ? formatDateTime(report.submittedAt) : ''],
    ['Started', report.startedAt ? formatDateTime(report.startedAt) : ''],
    ['Score', scoreVisible ? `${formatScore(report.score)} / ${formatScore(report.totalMarks)}` : 'Hidden'],
    ['Percentage', pct !== null ? `${Math.round(pct)}%` : 'Hidden'],
    ['Time spent', permission(report, 'canViewTimeAnalysis') ? formatSeconds(report.timeTakenSec) : 'Hidden'],
    ['Rank', permission(report, 'canViewRank') && report.rank ? `#${report.rank} of ${report.participants || '-'}` : 'Hidden'],
    ['Total questions', report.totalQuestions ?? ''],
    ['Correct', scoreVisible ? report.correctAnswers ?? 0 : 'Hidden'],
    ['Wrong', scoreVisible ? report.wrongAnswers ?? 0 : 'Hidden'],
    ['Skipped', scoreVisible ? report.skippedQuestions ?? 0 : 'Hidden'],
    ['Violation count', report.violationCount ?? report.securityInfo?.totalViolations ?? 'No data'],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  if (Array.isArray(report.sectionBreakdown) && report.sectionBreakdown.length) {
    const sectionRows = report.sectionBreakdown.map((section) => ({
      Section: section.sectionName || `Section ${Number(section.sectionIndex || 0) + 1}`,
      Type: section.type || '',
      Questions: section.totalQuestions ?? 0,
      Correct: section.correctAnswers ?? 0,
      Wrong: section.wrongAnswers ?? 0,
      Skipped: section.skippedQuestions ?? 0,
      Partial: section.pendingEvaluationQuestions ?? 0,
      Accuracy: `${Math.round(percent(section.correctAnswers, section.totalQuestions))}%`,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sectionRows), 'Sections');
  }

  if (Array.isArray(report.questionWise) && report.questionWise.length) {
    const questionRows = report.questionWise.map((question, index) => ({
      Question: `Q${index + 1}`,
      Section: question.sectionName || '',
      Type: question.type || '',
      Difficulty: question.difficulty || '',
      Status: getQuestionStatus(question),
      Marks: permission(report, 'canViewScore') ? `${formatScore(question.marksObtained || 0)} / ${formatScore(question.maxMarks || 0)}` : 'Hidden',
      'Student Answer': hasValue(question.studentAnswer) ? question.studentAnswer : '',
      'Correct Answer': hasValue(question.correctAnswer) ? question.correctAnswer : 'Hidden',
      'Time Spent': formatSeconds(question.timeSpentSec || 0),
      QuestionText: question.questionText || '',
      Explanation: hasValue(question.explanation) ? question.explanation : '',
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(questionRows), 'Questions');
  }

  const securityEntries = Object.entries(report.securityInfo || {})
    .filter(([, value]) => hasValue(value))
    .map(([key, value]) => ({ Metric: key.replace(/([A-Z])/g, ' $1'), Value: value }));
  if (securityEntries.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(securityEntries), 'Security');
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${safeFileName(report.assessmentName)}-student-report-${dateStamp}.xlsx`);
}

function stateStyle(state) {
  const key = String(state || '').toLowerCase();
  if (['correct', 'completed', 'available', 'released', 'attempted'].includes(key)) {
    return 'border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300';
  }
  if (['incorrect', 'wrong', 'locked', 'hidden', 'pending'].includes(key)) {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300';
  }
  if (['skipped', 'not attempted'].includes(key)) {
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
  return 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300';
}

function getReportAvailability(report) {
  if (!report) return 'No data';
  if (report.permissions?.resultReleased) return 'Available result';
  if (report.permissions?.releaseAt) return 'Pending result';
  return 'Locked result';
}

function getAttemptState(report) {
  if (!report) return '';
  if (report.status) return report.status;
  if (report.submittedAt) return 'Completed';
  if (report.startedAt) return 'Attempted';
  return 'Not attempted';
}

function getQuestionStatus(question) {
  const status = String(question?.status || '').toLowerCase();
  if (status === 'incorrect') return 'Wrong';
  if (status === 'pending') return 'Partial';
  if (status) return status.charAt(0).toUpperCase() + status.slice(1);
  if (question?.isCorrect === true) return 'Correct';
  if (question?.isSkipped) return 'Skipped';
  return 'Visited';
}

function AnswerBlock({ label, value }) {
  const [expanded, setExpanded] = useState(false);
  if (!hasValue(value)) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const long = text.length > 220;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-950/60">
      <div className={labelClass}>{label}</div>
      <div className={`mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-gray-200 ${long && !expanded ? 'max-h-28 overflow-hidden' : ''}`}>
        {text}
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-300"
        >
          {expanded ? 'Show less' : 'Show full answer'}
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, message }) {
  return (
    <div className={`${shellClass} rounded-xl px-6 py-10 text-center`}>
      <Icon className="mx-auto h-7 w-7 text-slate-300 dark:text-gray-600" />
      <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</div>
      {message ? <p className={`mx-auto mt-1 max-w-xl text-sm leading-6 ${mutedText}`}>{message}</p> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid h-[calc(100vh-10rem)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
      <div className="animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
    </div>
  );
}

function SummaryRow({ label, value, hidden }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-gray-800">
      <span className={`text-xs ${mutedText}`}>{label}</span>
      <span className="truncate text-right text-sm font-semibold text-slate-900 dark:text-white">{hidden ? 'Hidden' : value}</span>
    </div>
  );
}

function SectionShell({ id, title, children, defaultOpen = true, onJump }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className={`${shellClass} overflow-hidden rounded-xl`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <button type="button" onClick={() => onJump?.(id)} className="text-sm font-semibold text-slate-950 dark:text-white">
          {title}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>
      {open ? <div className="p-4">{children}</div> : null}
    </section>
  );
}

function ReportNavigation({ reports, selectedId, query, setQuery, status, setStatus, onSelect }) {
  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(reports.map((report) => report.status).filter(Boolean)));
    return ['all', ...values];
  }, [reports]);

  return (
    <aside className={`${shellClass} flex min-h-0 flex-col rounded-xl`}>
      <div className="shrink-0 border-b border-slate-200 p-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={labelClass}>Report Library</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">{reports.length} assessments</div>
          </div>
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
            Dynamic
          </span>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reports"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:focus:ring-sky-900/40"
          />
        </div>
        {statusOptions.length > 1 ? (
          <div className="mt-2 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-sky-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            >
              {statusOptions.map((item) => (
                <option key={item} value={item}>{item === 'all' ? 'All statuses' : item}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {reports.length ? reports.map((report) => {
          const selected = String(report.id) === String(selectedId);
          const availability = getReportAvailability(report);
          const pct = scorePercent(report);
          const scoreVisible = permission(report, 'canViewScore');
          return (
            <button
              key={report.id}
              type="button"
              onClick={() => onSelect(report)}
              className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? 'border-sky-300 bg-sky-50 text-sky-950 ring-1 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-100 dark:ring-sky-900'
                  : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:hover:border-gray-800 dark:hover:bg-gray-950/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{report.assessmentName}</div>
                  <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] ${mutedText}`}>
                    {report.assessmentType ? <span>{report.assessmentType}</span> : null}
                    {report.dateAttempted ? <span>{formatShortDate(report.dateAttempted)}</span> : null}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${stateStyle(availability)}`}>
                  {scoreVisible && pct !== null ? `${Math.round(pct)}%` : <EyeOff className="h-3.5 w-3.5" />}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${stateStyle(availability)}`}>{availability}</span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${stateStyle(getAttemptState(report))}`}>{getAttemptState(report)}</span>
              </div>
            </button>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
            No report data received.
          </div>
        )}
      </div>
    </aside>
  );
}

function WorkspaceHeader({ report, onRefresh, onExport, search, setSearch, filterOpen, setFilterOpen }) {
  if (!report) return null;
  const pct = scorePercent(report);
  const scoreVisible = permission(report, 'canViewScore');
  const percentageVisible = permission(report, 'canViewPercentage');
  const metadata = [
    report.assessmentType,
    hasValue(report.totalQuestions) ? `${report.totalQuestions} questions` : null,
    hasValue(report.duration) ? `${report.duration} min` : null,
    report.status,
  ].filter(Boolean);

  return (
    <div className={`${shellClass} sticky top-0 z-30 rounded-xl shadow-sm`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {metadata.map((item) => (
              <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                {item}
              </span>
            ))}
            <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${stateStyle(getReportAvailability(report))}`}>
              {getReportAvailability(report)}
            </span>
          </div>
          <h2 className="mt-2 truncate text-base font-semibold text-slate-950 dark:text-white">{report.assessmentName}</h2>
          <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs ${mutedText}`}>
            {report.submittedAt || report.dateAttempted ? <span>Submitted {formatDateTime(report.submittedAt || report.dateAttempted)}</span> : null}
            {report.startedAt ? <span>Started {formatDateTime(report.startedAt)}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search in report"
              className="h-8 w-44 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
            />
          </div>
          <button type="button" onClick={() => setFilterOpen(!filterOpen)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </button>
          <button type="button" onClick={onRefresh} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800">
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button type="button" onClick={onExport} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
        </div>
      </div>
      <div className="grid gap-0 px-4 py-2 text-xs sm:grid-cols-4">
        <SummaryRow label="Score" value={`${formatScore(report.score)} / ${formatScore(report.totalMarks)}`} hidden={!scoreVisible} />
        <SummaryRow label="Percentage" value={pct !== null ? `${Math.round(pct)}%` : 'Hidden'} hidden={!percentageVisible} />
        <SummaryRow label="Attempt count" value={report.attempts || report.attemptCount || 1} />
        <SummaryRow label="Time spent" value={formatSeconds(report.timeTakenSec)} hidden={!permission(report, 'canViewTimeAnalysis')} />
      </div>
    </div>
  );
}

function ReportTabs({ tabs, activeTab, setActiveTab }) {
  if (!tabs.length) return null;
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-[#f8fbff] py-2 dark:border-gray-800 dark:bg-gray-950">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === tab.id
              ? 'bg-sky-600 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function OverviewPanel({ report, onJump }) {
  if (!report) return null;
  const scoreVisible = permission(report, 'canViewScore');
  const pct = scorePercent(report);
  const totalQuestions = Number(report.totalQuestions || 0);
  const attempted = totalQuestions - Number(report.skippedQuestions || 0);
  return (
    <div className="space-y-3">
      {!report.permissions?.resultReleased ? (
        <EmptyState
          icon={Lock}
          title="Result release pending"
          message={report.permissions?.releaseAt ? `Your detailed result is scheduled for ${formatDateTime(report.permissions.releaseAt)}.` : 'Your admin has not released detailed results for this assessment yet.'}
        />
      ) : null}

      <SectionShell id="summary" title="Report Summary" onJump={onJump}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <SummaryRow label="Score" value={`${formatScore(report.score)} / ${formatScore(report.totalMarks)}`} hidden={!scoreVisible} />
          <SummaryRow label="Rank" value={`#${report.rank} of ${report.participants || '-'}`} hidden={!permission(report, 'canViewRank') || !report.rank} />
          <SummaryRow label="Accuracy" value={pct !== null ? `${Math.round(pct)}%` : 'Hidden'} hidden={!permission(report, 'canViewPercentage')} />
          <SummaryRow label="Time taken" value={formatSeconds(report.timeTakenSec)} hidden={!permission(report, 'canViewTimeAnalysis')} />
          <SummaryRow label="Questions attempted" value={`${attempted} / ${totalQuestions}`} hidden={!scoreVisible} />
          <SummaryRow label="Correct count" value={report.correctAnswers ?? 'Hidden'} hidden={!scoreVisible} />
          <SummaryRow label="Wrong count" value={report.wrongAnswers ?? 'Hidden'} hidden={!scoreVisible} />
          <SummaryRow label="Skipped count" value={report.skippedQuestions ?? 'Hidden'} hidden={!scoreVisible} />
          <SummaryRow label="Violation count" value={report.violationCount ?? report.securityInfo?.totalViolations ?? 'No data'} />
        </div>
      </SectionShell>
    </div>
  );
}

function PerformancePanel({ report, onJump }) {
  if (!permission(report, 'canViewSectionAnalytics')) {
    return <EmptyState icon={Lock} title="Section analytics hidden" message="Section-wise analytics are disabled for this assessment." />;
  }
  const sections = report.sectionBreakdown || [];
  if (!sections.length) return <EmptyState title="No section performance data" message="The backend did not return section breakdown for this report." />;
  return (
    <SectionShell id="performance" title="Section Performance" onJump={onJump}>
      <div className="space-y-2">
        {sections.map((section) => {
          const accuracy = percent(section.correctAnswers, section.totalQuestions);
          return (
            <div key={`${section.sectionIndex}-${section.sectionName}`} className="rounded-lg border border-slate-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{section.sectionName}</div>
                  <div className={`mt-0.5 text-xs ${mutedText}`}>{section.type || 'Section'} - {section.totalQuestions || 0} questions</div>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{Math.round(accuracy)}%</div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${accuracy}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-gray-300">
                <span>Correct <b className="text-lime-700 dark:text-lime-300">{section.correctAnswers}</b></span>
                <span>Wrong <b className="text-sky-700 dark:text-sky-300">{section.wrongAnswers}</b></span>
                <span>Skipped <b>{section.skippedQuestions}</b></span>
                <span>Partial <b>{section.pendingEvaluationQuestions}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function QuestionReview({ report, search, filterOpen }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  const questions = report?.questionWise || [];
  const dynamicStatuses = useMemo(() => Array.from(new Set(questions.map((question) => question.status).filter(Boolean))), [questions]);
  const dynamicSections = useMemo(() => Array.from(new Set(questions.map((question) => question.sectionName).filter(Boolean))), [questions]);
  const dynamicDifficulties = useMemo(() => Array.from(new Set(questions.map((question) => question.difficulty).filter(Boolean))), [questions]);

  const filteredQuestions = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesSearch = !searchText || `${question.questionText || ''} ${question.sectionName || ''} ${question.type || ''}`.toLowerCase().includes(searchText);
      const matchesStatus = statusFilter === 'all' || question.status === statusFilter;
      const matchesSection = sectionFilter === 'all' || question.sectionName === sectionFilter;
      const matchesDifficulty = difficultyFilter === 'all' || question.difficulty === difficultyFilter;
      return matchesSearch && matchesStatus && matchesSection && matchesDifficulty;
    });
  }, [difficultyFilter, questions, search, sectionFilter, statusFilter]);

  useEffect(() => {
    setSelectedIndex(0);
    setShowExplanation(false);
  }, [statusFilter, sectionFilter, difficultyFilter, search, report?.id]);

  if (!permission(report, 'canViewQuestionReview')) {
    return <EmptyState icon={Lock} title="Question review hidden" message="Question-level review is not available until your admin releases it." />;
  }
  if (!questions.length) return <EmptyState title="No question review data" message="The backend did not return question-wise data for this report." />;

  const selected = filteredQuestions[Math.min(selectedIndex, Math.max(0, filteredQuestions.length - 1))];

  return (
    <div className={`${shellClass} overflow-hidden rounded-xl`}>
      <div className="border-b border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Question Review</div>
            <div className={`mt-0.5 text-xs ${mutedText}`}>{filteredQuestions.length} of {questions.length} questions</div>
          </div>
          {filterOpen ? (
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <option value="all">All statuses</option>
                {dynamicStatuses.map((item) => <option key={item} value={item}>{getQuestionStatus({ status: item })}</option>)}
              </select>
              {dynamicSections.length ? (
                <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  <option value="all">All sections</option>
                  {dynamicSections.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : null}
              {dynamicDifficulties.length ? (
                <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  <option value="all">All difficulties</option>
                  {dynamicDifficulties.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-[520px] gap-0 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40 lg:border-b-0 lg:border-r">
          <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto lg:max-h-[calc(100vh-24rem)] lg:grid-cols-3">
            {filteredQuestions.map((question, index) => (
              <button
                key={`${question.sectionIndex}-${question.questionIndex}-${index}`}
                type="button"
                onClick={() => {
                  setSelectedIndex(index);
                  setShowExplanation(false);
                }}
                className={`h-8 rounded-md border text-[11px] font-semibold transition-colors ${
                  index === selectedIndex ? 'ring-2 ring-sky-300 ' : ''
                } ${stateStyle(question.status)}`}
                title={getQuestionStatus(question)}
              >
                Q{index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 p-4">
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={labelClass}>{selected.sectionName || 'Question'}</div>
                  <h3 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Q{selectedIndex + 1}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${stateStyle(selected.status)}`}>{getQuestionStatus(selected)}</span>
                  {hasValue(selected.type) ? <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 dark:border-gray-800 dark:text-gray-300">{selected.type}</span> : null}
                  {hasValue(selected.difficulty) ? <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 dark:border-gray-800 dark:text-gray-300">{selected.difficulty}</span> : null}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-900 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-100">
                {selected.questionText}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <AnswerBlock label="Student answer" value={selected.studentAnswer} />
                <AnswerBlock label="Correct answer" value={selected.correctAnswer} />
              </div>

              <div className="grid gap-x-8 md:grid-cols-2">
                <SummaryRow label="Marks" value={`${formatScore(selected.marksObtained || 0)} / ${formatScore(selected.maxMarks || 0)}`} hidden={!permission(report, 'canViewScore')} />
                <SummaryRow label="Time spent" value={formatSeconds(selected.timeSpentSec || 0)} />
                <SummaryRow label="Negative marks" value={formatScore(selected.negativeMarks || 0)} hidden={!hasValue(selected.negativeMarks)} />
                <SummaryRow label="Status" value={getQuestionStatus(selected)} />
              </div>

              {hasValue(selected.explanation) ? (
                <div className="rounded-lg border border-slate-200 dark:border-gray-800">
                  <button type="button" onClick={() => setShowExplanation((value) => !value)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 dark:text-gray-100">
                    Explanation
                    <ChevronDown className={`h-4 w-4 transition-transform ${showExplanation ? '' : '-rotate-90'}`} />
                  </button>
                  {showExplanation ? <div className={`border-t border-slate-200 px-3 py-3 text-sm leading-6 ${mutedText} dark:border-gray-800`}>{selected.explanation}</div> : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-gray-800">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300">Previous</button>
                <span className={`text-xs ${mutedText}`}>{selectedIndex + 1} / {filteredQuestions.length}</span>
                <button type="button" disabled={selectedIndex >= filteredQuestions.length - 1} onClick={() => setSelectedIndex((value) => Math.min(filteredQuestions.length - 1, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300">Next</button>
              </div>
            </div>
          ) : (
            <EmptyState title="No matching questions" message="Adjust the available filters or report search to inspect questions." />
          )}
        </div>
      </div>
    </div>
  );
}

function ViolationsPanel({ report }) {
  const security = report?.securityInfo || {};
  const entries = Object.entries(security).filter(([, value]) => Number(value || 0) > 0);
  if (!entries.length && !hasValue(report?.violationCount)) return null;
  return (
    <SectionShell id="violations" title="Violations">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {hasValue(report.violationCount) ? <SummaryRow label="Total" value={report.violationCount} /> : null}
        {entries.map(([key, value]) => <SummaryRow key={key} label={key.replace(/([A-Z])/g, ' $1')} value={value} />)}
      </div>
    </SectionShell>
  );
}

export default function AssessmentReportsPage() {
  const { dashboard, loading, error, refresh } = useStudentAssessmentDashboardData();
  const toast = useToast();
  const [selectedReport, setSelectedReport] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [reportSearch, setReportSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const workspaceRef = useRef(null);

  const reports = dashboard.reports || [];

  const filteredReports = useMemo(() => {
    const search = query.trim().toLowerCase();
    return reports.filter((report) => {
      const queryMatch = !search || `${report.assessmentName || ''} ${report.assessmentType || ''} ${report.status || ''}`.toLowerCase().includes(search);
      const statusMatch = status === 'all' || report.status === status;
      return queryMatch && statusMatch;
    });
  }, [query, reports, status]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.reportId && reports.length) {
        const report = reports.find((item) => String(item.id) === String(saved.reportId));
        if (report) setSelectedReport(report);
      }
    } catch {
      // Ignore invalid stored UI state.
    }
  }, [reports]);

  useEffect(() => {
    if (!selectedReport && filteredReports.length) setSelectedReport(filteredReports[0]);
    if (selectedReport && !filteredReports.some((report) => String(report.id) === String(selectedReport.id))) {
      setSelectedReport(filteredReports[0] || null);
    }
  }, [filteredReports, selectedReport]);

  const currentReport = filteredReports.find((report) => String(report.id) === String(selectedReport?.id)) || selectedReport;

  const tabs = useMemo(() => {
    if (!currentReport) return [];
    const items = [{ id: 'overview', label: 'Overview' }];
    if (permission(currentReport, 'canViewQuestionReview') && (currentReport.questionWise || []).length) items.push({ id: 'questions', label: 'Questions' });
    if (permission(currentReport, 'canViewSectionAnalytics') && (currentReport.sectionBreakdown || []).length) items.push({ id: 'performance', label: 'Performance' });
    const securityEntries = Object.entries(currentReport.securityInfo || {}).filter(([, value]) => Number(value || 0) > 0);
    if (hasValue(currentReport.violationCount) || securityEntries.length) items.push({ id: 'violations', label: 'Violations' });
    if (hasValue(currentReport.feedback)) items.push({ id: 'feedback', label: 'Feedback' });
    return items;
  }, [currentReport]);

  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0].id);
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!currentReport) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reportId: currentReport.id, activeTab }));
  }, [activeTab, currentReport]);

  const selectReport = useCallback((report) => {
    setSelectedReport(report);
    workspaceRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const jumpTo = useCallback((id) => {
    const container = workspaceRef.current;
    const target = container?.querySelector(`#${id}`);
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop - 126, behavior: 'smooth' });
  }, []);

  const handleExport = useCallback(async () => {
    if (!currentReport) return;
    try {
      await exportStudentReportExcel(currentReport);
      toast.success('Student report exported to Excel');
    } catch (err) {
      toast.error(err.message || 'Failed to export report');
    }
  }, [currentReport, toast]);

  return (
    <AssessmentModuleLayout title="Assessment Reports">
      <div className="h-[calc(100vh-9.5rem)] overflow-hidden rounded-xl bg-[#f8fbff] text-slate-900 dark:bg-gray-950 dark:text-gray-100">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="rounded-xl border border-sky-200 bg-white px-6 py-10 text-sm text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
            <AlertCircle className="mb-3 h-6 w-6" />
            {error}
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <ReportNavigation
              reports={filteredReports}
              selectedId={currentReport?.id}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              onSelect={selectReport}
            />

            <main ref={workspaceRef} className="min-h-0 overflow-y-auto pr-1">
              {currentReport ? (
                <div className="space-y-3">
                  <WorkspaceHeader
                    report={currentReport}
                    onRefresh={refresh}
                    onExport={handleExport}
                    search={reportSearch}
                    setSearch={setReportSearch}
                    filterOpen={filterOpen}
                    setFilterOpen={setFilterOpen}
                  />
                  <ReportTabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} />

                  {activeTab === 'overview' ? <OverviewPanel report={currentReport} onJump={jumpTo} /> : null}
                  {activeTab === 'questions' ? <QuestionReview report={currentReport} search={reportSearch} filterOpen={filterOpen} /> : null}
                  {activeTab === 'performance' ? <PerformancePanel report={currentReport} onJump={jumpTo} /> : null}
                  {activeTab === 'violations' ? <ViolationsPanel report={currentReport} /> : null}
                  {activeTab === 'feedback' && hasValue(currentReport.feedback) ? (
                    <SectionShell id="feedback" title="Feedback">
                      <div className="text-sm leading-6 text-slate-700 dark:text-gray-300">{currentReport.feedback}</div>
                    </SectionShell>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="No report available"
                  message="Assessment reports will appear here only when the backend returns report data for your account."
                />
              )}
            </main>
          </div>
        )}
      </div>
    </AssessmentModuleLayout>
  );
}
