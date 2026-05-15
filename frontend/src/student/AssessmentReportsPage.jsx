import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Award,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  EyeOff,
  FileText,
  Filter,
  Lock,
  Medal,
  Search,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import AssessmentModuleLayout from './assessment-dashboard/AssessmentModuleLayout';
import { useStudentAssessmentDashboardData } from './assessment-dashboard/useStudentAssessmentDashboardData';
import { formatDateTime, formatScore, formatSeconds, formatShortDate } from './assessment-dashboard/assessmentDashboardUtils';

const questionFilters = [
  { id: 'all', label: 'All Questions' },
  { id: 'correct', label: 'Correct' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'pending', label: 'Partial' },
];

const statusStyles = {
  correct: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  incorrect: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300',
  skipped: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
};

function permission(report, key) {
  return Boolean(report?.permissions?.[key]);
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

function toneForPercentage(value) {
  if (value === null || value === undefined) return 'slate';
  if (value >= 75) return 'emerald';
  if (value >= 50) return 'sky';
  if (value >= 35) return 'amber';
  return 'rose';
}

function toneClass(tone) {
  return {
    emerald: 'from-emerald-500 to-cyan-400 text-emerald-600 dark:text-emerald-300',
    sky: 'from-[#0f8fd6] to-[#52d8c8] text-sky-700 dark:text-sky-300',
    amber: 'from-amber-500 to-orange-300 text-amber-700 dark:text-amber-300',
    rose: 'from-rose-500 to-orange-400 text-rose-600 dark:text-rose-300',
    slate: 'from-slate-500 to-slate-300 text-slate-700 dark:text-gray-300',
  }[tone] || 'from-[#0f8fd6] to-[#52d8c8] text-sky-700 dark:text-sky-300';
}

const surfaceClass = 'rounded-[1.35rem] border border-slate-200/75 bg-[#fbfdff]/95 shadow-[0_18px_54px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl transition-all dark:border-white/10 dark:bg-[#07111f]/88 dark:shadow-black/35';
const innerSurfaceClass = 'rounded-[1.1rem] border border-slate-200/75 bg-white/88 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/[0.045]';
const labelClass = 'text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500';
const reportFontStyle = { fontFamily: "'Manrope', ui-sans-serif, system-ui, sans-serif" };
const headlineFontStyle = { fontFamily: "'Fraunces', 'Manrope', ui-serif, Georgia, serif" };

function Skeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="h-[720px] animate-pulse rounded-[1.75rem] border border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-slate-950/60" />
      <div className="h-[720px] animate-pulse rounded-[1.75rem] border border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-slate-950/60" />
    </div>
  );
}

function LockedPanel({ title = 'Result details are locked', message }) {
  return (
    <div className={`${surfaceClass} p-8 text-center`}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
        <Lock className="h-5 w-5" />
      </div>
      <div className="mt-4 text-base font-black tracking-tight text-slate-900 dark:text-white">{title}</div>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-gray-400">
        {message || 'Your admin has not enabled this part of the report for this assessment yet.'}
      </p>
    </div>
  );
}

function ScoreRing({ value, locked }) {
  const normalized = locked ? 0 : Math.round(Math.max(0, Math.min(100, Number(value || 0))));
  const tone = toneForPercentage(value);
  const classes = toneClass(tone);
  const size = 136;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative flex items-center justify-center rounded-[1.45rem] border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-2 shadow-[0_18px_42px_-34px_rgba(2,132,199,0.72)] dark:border-white/10 dark:from-white/10 dark:to-slate-950/30"
      style={{ height: size + 14, width: size + 14 }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="student-report-score" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="48%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-slate-100 dark:text-gray-800" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#student-report-score)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-extrabold tracking-[-0.04em] ${classes.split(' ').slice(2).join(' ')}`}>
          {locked ? 'Hidden' : `${normalized}%`}
        </div>
        <div className={labelClass}>
          Performance
        </div>
      </div>
    </motion.div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone = 'sky', locked = false }) {
  const classes = toneClass(tone);
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`${innerSurfaceClass} group relative overflow-hidden p-4 hover:border-sky-200/90 dark:hover:border-sky-800/70`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-200/30 blur-2xl transition-opacity group-hover:opacity-100 dark:bg-sky-500/10" />
      <div className={`relative flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-gradient-to-br ${classes.split(' ').slice(0, 2).join(' ')} text-white shadow-[0_14px_30px_-18px_rgba(14,165,233,0.85)]`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`relative mt-4 ${labelClass}`}>{label}</div>
      <div className="relative mt-1 truncate text-2xl font-extrabold tracking-[-0.035em] text-slate-950 dark:text-white">{locked ? 'Hidden' : value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">{sub}</div> : null}
    </motion.div>
  );
}

function ReportList({ reports, selectedId, onSelect }) {
  if (!reports.length) {
    return (
      <div className={`${surfaceClass} p-8 text-center`}>
        <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-gray-600" />
        <div className="mt-3 text-sm font-bold text-slate-800 dark:text-gray-200">No reports found</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Completed and partial attempts will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pr-1">
      {reports.map((report) => {
        const visibleScore = permission(report, 'canViewScore');
        const pct = scorePercent(report);
        const tone = toneForPercentage(pct);
        const selected = String(report.id) === String(selectedId);
        return (
          <motion.button
            key={report.id}
            type="button"
            onClick={() => onSelect(report)}
            whileHover={{ x: 3, y: -1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`relative w-full overflow-hidden rounded-[1.35rem] border p-4 text-left transition-all ${
              selected
                ? 'border-sky-300 bg-[linear-gradient(135deg,#f8fcff,#ffffff_58%,#edf9ff)] shadow-[0_18px_42px_-34px_rgba(2,132,199,0.85)] dark:border-sky-700 dark:bg-[linear-gradient(135deg,rgba(8,47,73,0.52),rgba(2,6,23,0.95)_58%,rgba(15,23,42,0.78))]'
                : 'border-slate-200/80 bg-white/85 hover:border-sky-200 hover:bg-white dark:border-white/10 dark:bg-slate-950/62 dark:hover:border-sky-800 dark:hover:bg-slate-900'
            }`}
          >
            {selected ? <span className="absolute left-0 top-4 h-10 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-sky-600" /> : null}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold tracking-[-0.015em] text-slate-950 dark:text-white">{report.assessmentName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
                  <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 font-bold uppercase tracking-wider dark:border-white/10 dark:bg-white/5">{report.assessmentType || 'mixed'}</span>
                  <span>{formatShortDate(report.dateAttempted)}</span>
                </div>
              </div>
              <span className={`rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs font-extrabold dark:border-white/10 dark:bg-white/5 ${visibleScore ? toneClass(tone).split(' ').slice(2).join(' ') : 'text-slate-400'}`}>
                {visibleScore ? `${Math.round(pct || 0)}%` : <EyeOff className="h-4 w-4" />}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
              <span>{report.status}</span>
              <span>{formatSeconds(report.timeTakenSec)}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function SectionAnalytics({ report }) {
  if (!permission(report, 'canViewSectionAnalytics')) {
    return <LockedPanel title="Section analytics hidden" message="Section-wise analytics are disabled for this assessment." />;
  }
  const sections = report.sectionBreakdown || [];
  if (!sections.length) return null;
  const strongest = [...sections].sort((a, b) => percent(b.correctAnswers, b.totalQuestions) - percent(a.correctAnswers, a.totalQuestions))[0];
  const weakest = [...sections].sort((a, b) => percent(a.correctAnswers, a.totalQuestions) - percent(b.correctAnswers, b.totalQuestions))[0];

  return (
    <div className={`${surfaceClass} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-950 dark:text-white">Section Performance</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Your strengths and improvement areas by section.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {strongest ? <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">Strongest: {strongest.sectionName}</span> : null}
          {weakest ? <span className="rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1 font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Focus: {weakest.sectionName}</span> : null}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {sections.map((section) => {
          const accuracy = percent(section.correctAnswers, section.totalQuestions);
          return (
            <motion.div
              key={`${section.sectionIndex}-${section.sectionName}`}
              whileHover={{ y: -2 }}
              className={`${innerSurfaceClass} p-4`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{section.sectionName}</div>
                  <div className={`mt-0.5 ${labelClass}`}>{section.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black tracking-tight text-slate-950 dark:text-white">{Math.round(accuracy)}%</div>
                  <div className={labelClass}>Accuracy</div>
                </div>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner dark:bg-slate-900">
                <motion.div initial={{ width: 0 }} animate={{ width: `${accuracy}%` }} transition={{ duration: 0.75, ease: 'easeOut' }} className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-teal-500" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <span className="rounded-xl border border-slate-100 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-white/5">Correct <b className="text-emerald-600">{section.correctAnswers}</b></span>
                <span className="rounded-xl border border-slate-100 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-white/5">Wrong <b className="text-rose-600">{section.wrongAnswers}</b></span>
                <span className="rounded-xl border border-slate-100 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-white/5">Skipped <b>{section.skippedQuestions}</b></span>
                <span className="rounded-xl border border-slate-100 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-white/5">Pending <b className="text-amber-600">{section.pendingEvaluationQuestions}</b></span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionReview({ report }) {
  const [filter, setFilter] = useState('all');
  const [section, setSection] = useState('all');
  const [openQuestion, setOpenQuestion] = useState(null);

  if (!permission(report, 'canViewQuestionReview')) {
    return <LockedPanel title="Question review hidden" message="Question-level review is not available until the assessment result is released by your admin." />;
  }

  const questions = report.questionWise || [];
  const sections = [...new Set(questions.map((question) => question.sectionName).filter(Boolean))];
  const filtered = questions.filter((question) => {
    const statusMatch = filter === 'all' || question.status === filter;
    const sectionMatch = section === 'all' || question.sectionName === section;
    return statusMatch && sectionMatch;
  });

  return (
    <div className={`${surfaceClass} overflow-hidden`}>
      <div className="sticky top-14 z-10 border-b border-slate-200/70 bg-white/90 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950 dark:text-white">Question Review</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Filter questions by status or section.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {questionFilters.map((item) => (
              <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 ${filter === item.id ? 'bg-slate-950 text-white shadow-lg shadow-slate-300/40 dark:bg-white dark:text-slate-950 dark:shadow-black/30' : 'border border-slate-200 bg-white/80 text-slate-600 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-sky-800'}`}>
                {item.label}
              </button>
            ))}
            <select value={section} onChange={(event) => setSection(event.target.value)} className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-gray-300">
              <option value="all">All Sections</option>
              {sections.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex gap-2 overflow-x-auto lg:sticky lg:top-36 lg:block lg:max-h-[620px] lg:space-y-2 lg:overflow-y-auto">
          {filtered.map((question, index) => (
            <button key={`${question.sectionIndex}-${question.questionIndex}`} type="button" onClick={() => setOpenQuestion(openQuestion === index ? null : index)} className={`min-w-12 rounded-xl border px-3 py-2 text-xs font-black transition-transform hover:-translate-y-0.5 lg:w-full ${statusStyles[question.status] || statusStyles.pending}`}>
              Q{question.questionIndex + 1}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.length ? filtered.map((question, index) => {
            const expanded = openQuestion === index || openQuestion === null;
            return (
              <motion.div
                key={`${question.sectionIndex}-${question.questionIndex}-card`}
                whileHover={{ y: -2 }}
                className={`${innerSurfaceClass} p-4`}
              >
                <button type="button" onClick={() => setOpenQuestion(expanded ? -1 : index)} className="flex w-full items-start justify-between gap-3 text-left">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyles[question.status] || statusStyles.pending}`}>{question.status}</span>
                      <span className="text-xs font-bold text-slate-400">{question.sectionName}</span>
                    </div>
                    <div className="mt-2 text-sm font-bold leading-6 text-slate-900 dark:text-white">Q{question.questionIndex + 1}. {question.questionText}</div>
                  </div>
                  <ChevronDown className={`mt-1 h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 space-y-3">
                    {question.options?.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {question.options.map((option, optionIndex) => {
                          const selected = question.selectedOptionIndex === optionIndex;
                          const correct = question.correctOptionIndex === optionIndex;
                          return (
                            <div key={`${option}-${optionIndex}`} className={`rounded-xl border px-3 py-2 text-sm ${correct ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200' : selected ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200' : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
                              {option}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {permission(report, 'canViewStudentAnswers') && !question.options?.length ? (
                      <div className="rounded-xl border border-slate-200 bg-white/85 p-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                        <b>Your answer:</b> {question.studentAnswer || 'Not answered'}
                      </div>
                    ) : null}
                    {permission(report, 'canViewCorrectAnswers') && question.correctAnswer ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                        <b>Correct answer:</b> {question.correctAnswer}
                      </div>
                    ) : null}
                    {permission(report, 'canViewScore') ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">Marks: {formatScore(question.marksObtained || 0)} / {formatScore(question.maxMarks || 0)}</span>
                        {question.negativeMarks ? <span className="rounded-full bg-rose-50 px-3 py-1 font-bold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">Negative: -{formatScore(question.negativeMarks)}</span> : null}
                      </div>
                    ) : null}
                    {permission(report, 'canViewExplanations') && question.explanation ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm leading-6 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
                        <b>Explanation:</b> {question.explanation}
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </motion.div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
              No questions match the selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Insights({ report }) {
  const pct = scorePercent(report);
  const sections = report.sectionBreakdown || [];
  const strongest = sections.length ? [...sections].sort((a, b) => percent(b.correctAnswers, b.totalQuestions) - percent(a.correctAnswers, a.totalQuestions))[0] : null;
  const weakest = sections.length ? [...sections].sort((a, b) => percent(a.correctAnswers, a.totalQuestions) - percent(b.correctAnswers, b.totalQuestions))[0] : null;
  const timeRatio = report.duration ? percent((report.timeTakenSec || 0) / 60, report.duration) : null;
  const items = [];

  if (permission(report, 'canViewPercentage') && pct !== null) {
    items.push(pct >= 75 ? 'Strong overall performance. Keep practicing timed mixed sets to maintain consistency.' : 'Your score shows room to grow. Review incorrect and skipped questions first.');
  }
  if (strongest && permission(report, 'canViewSectionAnalytics')) items.push(`${strongest.sectionName} is your strongest section.`);
  if (weakest && permission(report, 'canViewSectionAnalytics')) items.push(`Spend extra practice time on ${weakest.sectionName}.`);
  if (permission(report, 'canViewTimeAnalysis') && timeRatio !== null) {
    items.push(timeRatio > 90 ? 'You used most of the available time. Try shorter checkpoints per section.' : 'Your time usage looks controlled for this attempt.');
  }
  if (!items.length) items.push('Detailed insights will appear when your admin enables result visibility for this assessment.');

  return (
    <div className={`${surfaceClass} p-5`}>
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-300" />
        <h2 className="text-base font-black tracking-tight text-slate-950 dark:text-white">Performance Guidance</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <motion.div key={item} whileHover={{ y: -2 }} className={`${innerSurfaceClass} relative overflow-hidden p-4 pl-5 text-sm leading-6 text-slate-600 dark:text-gray-300`}>
            <span className="absolute left-0 top-4 h-8 w-1 rounded-r-full bg-sky-500/80" />
            {item}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TimeUsagePanel({ report }) {
  if (!permission(report, 'canViewTimeAnalysis')) return null;

  const usedSeconds = Number(report.timeTakenSec || 0);
  const durationMinutes = Number(report.duration || 0);
  const usedMinutes = usedSeconds / 60;
  const usedPercent = durationMinutes > 0 ? Math.max(0, Math.min(100, (usedMinutes / durationMinutes) * 100)) : 0;
  const remainingMinutes = durationMinutes > 0 ? Math.max(0, Math.round(durationMinutes - usedMinutes)) : null;
  const paceLabel = durationMinutes <= 0
    ? 'Recorded attempt time'
    : usedPercent > 92
      ? 'Finished near the limit'
      : usedPercent < 45
        ? 'Quick completion'
        : 'Balanced time usage';

  return (
    <div className={`${surfaceClass} overflow-hidden`}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className={labelClass}>Time Analysis</div>
              <h2 className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-slate-950 dark:text-white">Attempt pacing and duration control</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
              {paceLabel}
            </span>
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-3xl font-extrabold tracking-[-0.045em] text-slate-950 dark:text-white">{formatSeconds(usedSeconds)}</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">Total time spent in this attempt</div>
              </div>
              {durationMinutes > 0 ? (
                <div className="text-right text-sm text-slate-500 dark:text-gray-400">
                  <span className="font-bold text-slate-800 dark:text-gray-100">{Math.round(usedPercent)}%</span> of allotted time
                </div>
              ) : null}
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner dark:border-white/10 dark:bg-slate-900">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: durationMinutes > 0 ? `${usedPercent}%` : '100%' }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-[linear-gradient(90deg,#0f8fd6,#42c7c4,#0f766e)]"
              />
            </div>
            {durationMinutes > 0 ? (
              <div className="mt-2 flex justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                <span>Start</span>
                <span>{durationMinutes} min limit</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-slate-200/70 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.035] lg:border-l lg:border-t-0">
          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/50">
              <CalendarClock className="h-4 w-4 text-sky-600 dark:text-sky-300" />
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Allowed Duration</div>
              <div className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-slate-950 dark:text-white">{durationMinutes ? `${durationMinutes} min` : 'Not limited'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/50">
              <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-300" />
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Remaining</div>
              <div className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-slate-950 dark:text-white">{remainingMinutes === null ? 'N/A' : `${remainingMinutes} min`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportDetail({ report }) {
  if (!report) return <LockedPanel title="Select a report" message="Choose an assessment from the left to view your detailed analytics." />;

  const scoreVisible = permission(report, 'canViewScore');
  const pct = scorePercent(report);
  const rankVisible = permission(report, 'canViewRank') && report.rank;
  const metrics = [
    { icon: Award, label: 'Score', value: `${formatScore(report.score)} / ${formatScore(report.totalMarks)}`, locked: !scoreVisible, tone: 'sky' },
    { icon: Target, label: 'Accuracy', value: `${Math.round(pct || 0)}%`, locked: !permission(report, 'canViewPercentage'), tone: toneForPercentage(pct) },
    { icon: CheckCircle2, label: 'Correct', value: report.correctAnswers ?? 'Hidden', locked: !scoreVisible, tone: 'emerald' },
    { icon: XCircle, label: 'Incorrect', value: report.wrongAnswers ?? 'Hidden', locked: !scoreVisible, tone: 'rose' },
    { icon: Timer, label: 'Time Spent', value: formatSeconds(report.timeTakenSec), sub: report.duration ? `of ${report.duration} min` : '', locked: !permission(report, 'canViewTimeAnalysis'), tone: 'amber' },
    { icon: FileText, label: 'Attempted', value: scoreVisible ? `${(report.totalQuestions || 0) - (report.skippedQuestions || 0)} / ${report.totalQuestions || 0}` : 'Hidden', locked: !scoreVisible, tone: 'slate' },
  ];

  return (
    <div className="space-y-5">
      <div className={`sticky top-14 z-20 ${surfaceClass} p-5`}>
        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
          <ScoreRing value={pct} locked={!permission(report, 'canViewPercentage')} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300">{report.assessmentType || 'Assessment'}</span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">{report.status}</span>
              {rankVisible ? <span className="rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1 text-[11px] font-extrabold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Rank #{report.rank}</span> : null}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] text-slate-950 dark:text-white">{report.assessmentName}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-gray-400">
              <span>Submitted: {formatDateTime(report.submittedAt || report.dateAttempted)}</span>
              <span>Started: {formatDateTime(report.startedAt)}</span>
            </div>
          </div>
          {rankVisible ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-center dark:border-amber-800 dark:bg-amber-900/20">
              <Medal className="mx-auto h-5 w-5 text-amber-600" />
              <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">#{report.rank}</div>
              <div className="text-xs text-amber-700/80 dark:text-amber-300/80">of {report.participants || '-'} students</div>
            </div>
          ) : null}
        </div>
      </div>

      {!report.permissions?.resultReleased ? (
        <LockedPanel title="Result release pending" message={report.permissions?.releaseAt ? `Your detailed result is scheduled for ${formatDateTime(report.permissions.releaseAt)}.` : 'Your admin has not released detailed results for this assessment yet.'} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((item) => <MetricCard key={item.label} {...item} />)}
      </div>

      <Insights report={report} />
      <TimeUsagePanel report={report} />
      <SectionAnalytics report={report} />
      <QuestionReview report={report} />
    </div>
  );
}

export default function AssessmentReportsPage() {
  const { dashboard, loading, error } = useStudentAssessmentDashboardData();
  const [selectedReport, setSelectedReport] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const reports = dashboard.reports || [];
  const filteredReports = useMemo(() => {
    const search = query.trim().toLowerCase();
    return reports.filter((report) => {
      const queryMatch = !search || `${report.assessmentName || ''} ${report.assessmentType || ''}`.toLowerCase().includes(search);
      const statusMatch = status === 'all' || report.status === status;
      return queryMatch && statusMatch;
    });
  }, [reports, query, status]);

  useEffect(() => {
    if (!selectedReport && filteredReports.length) setSelectedReport(filteredReports[0]);
    if (selectedReport && !filteredReports.some((report) => String(report.id) === String(selectedReport.id))) {
      setSelectedReport(filteredReports[0] || null);
    }
  }, [filteredReports, selectedReport]);

  const currentReport = filteredReports.find((report) => String(report.id) === String(selectedReport?.id)) || selectedReport;
  const rankCards = filteredReports.filter((report) => permission(report, 'canViewRank') && report.rank).slice(0, 3);

  return (
    <AssessmentModuleLayout title="Assessment Reports">
      <div className="relative space-y-5 overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-[linear-gradient(135deg,#f8fafc,#eef6fb_48%,#f7fafc)] p-3 text-slate-900 dark:border-white/10 dark:bg-[linear-gradient(135deg,#020617,#071321_52%,#020617)] dark:text-gray-100 sm:p-5" style={reportFontStyle}>
        <div className="pointer-events-none absolute left-8 top-8 h-40 w-40 rounded-full bg-sky-200/18 blur-3xl dark:bg-sky-500/8" />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-white/82 shadow-[0_24px_70px_-56px_rgba(15,23,42,0.72)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72"
        >
          <div className="relative p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-cyan-100/55 blur-3xl dark:bg-cyan-500/8" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-sky-700 shadow-sm dark:border-sky-800 dark:bg-white/5 dark:text-sky-300">
                  <BarChart3 className="h-3.5 w-3.5" />
                  PeerPrep Report Studio
                </div>
                <h1 className="mt-4 max-w-3xl text-[2.55rem] font-bold leading-[1.04] tracking-[-0.04em] text-slate-950 dark:text-white" style={headlineFontStyle}>
                  Your assessment report, refined for focus.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-gray-300">
                  A calm report workspace for released scores, section patterns, question review, timing, and rank visibility according to your assessment settings.
                </p>
              </div>
              <div className="grid min-w-[min(100%,28rem)] grid-cols-3 gap-3">
                <MetricCard icon={FileText} label="Reports" value={reports.length} tone="sky" />
                <MetricCard icon={Trophy} label="Ranked" value={rankCards.length} tone="amber" />
                <MetricCard icon={Clock3} label="Avg Time" value={formatSeconds(Math.round(reports.reduce((sum, report) => sum + Number(report.timeTakenSec || 0), 0) / Math.max(1, reports.length)))} tone="emerald" />
              </div>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-white px-6 py-10 text-sm text-rose-600 dark:border-rose-800 dark:bg-gray-900 dark:text-rose-300">
            <AlertCircle className="mb-3 h-6 w-6" />
            {error}
          </div>
        ) : (
          <div className="relative grid min-w-0 gap-5 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
            <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)] xl:overflow-hidden">
              <div className={`${surfaceClass} p-4`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className={labelClass}>Report Library</div>
                    <div className="mt-1 text-base font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">{filteredReports.length} assessment{filteredReports.length === 1 ? '' : 's'}</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                    Scroll list
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search reports..."
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white/70 py-2 pl-10 pr-4 text-sm text-slate-700 outline-none ring-sky-200 transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  {['all', 'Completed', 'Partial'].map((item) => (
                    <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 ${status === item ? 'bg-slate-950 text-white shadow-lg shadow-slate-300/40 dark:bg-white dark:text-slate-950 dark:shadow-black/30' : 'border border-slate-200 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'}`}>
                      {item === 'all' ? 'All' : item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 max-h-[520px] overflow-y-auto pr-1 xl:max-h-[calc(100vh-22rem)]">
                <ReportList reports={filteredReports} selectedId={currentReport?.id} onSelect={setSelectedReport} />
              </div>
            </aside>

            <main className="min-w-0">
              {rankCards.length ? (
                <div className="mb-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="flex flex-wrap items-center gap-3">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-black text-amber-800 dark:text-amber-200">Ranking is enabled for {rankCards.length} visible report{rankCards.length === 1 ? '' : 's'}.</span>
                  </div>
                </div>
              ) : null}
              <ReportDetail report={currentReport} />
            </main>
          </div>
        )}
      </div>
    </AssessmentModuleLayout>
  );
}
