import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Filter,
  MessageSquareText,
  RefreshCw,
  Search,
  Star,
  Users,
  X,
} from 'lucide-react';
import { api } from '../utils/api';

const formatDate = (value, options = {}) => {
  if (!value) return 'Date not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date not available'
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', ...options });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildQuery = (values) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
};

function RatingStars({ value, size = 'h-4 w-4' }) {
  const rating = Number(value || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={rating ? `${rating} out of 5 stars` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size} ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-gray-600'}`}
        />
      ))}
    </span>
  );
}

function SummaryTile({ icon: Icon, label, value, helper, tone = 'sky' }) {
  const tones = {
    sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-900/25 dark:text-sky-300 dark:ring-sky-900/40',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-900/25 dark:text-emerald-300 dark:ring-emerald-900/40',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-900/25 dark:text-amber-300 dark:ring-amber-900/40',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">{label}</p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
          {helper && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">{helper}</p>}
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function AssessmentCard({ assessment, onOpen }) {
  const isCompleted = assessment.endTime && new Date(assessment.endTime).getTime() < Date.now();
  return (
    <button
      type="button"
      onClick={() => onOpen(assessment)}
      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-900/5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-700 dark:focus:ring-offset-gray-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-sky-600 dark:text-sky-300">
            <CalendarDays className="h-4 w-4" />
            {formatDate(assessment.startTime)}
          </div>
          <h2 className="line-clamp-2 text-base font-bold leading-5 text-slate-950 dark:text-white">{assessment.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${isCompleted ? 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'}`}>
          {isCompleted ? 'Completed' : 'Open'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
        <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-gray-800/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Completed</p>
          <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{assessment.completedStudents}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-gray-800/70">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Responses</p>
          <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{assessment.feedbackCount}</p>
        </div>
        <div className="rounded-lg bg-amber-50/80 p-2.5 dark:bg-amber-900/15">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700/70 dark:text-amber-300/70">Average rating</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="text-base font-bold text-amber-700 dark:text-amber-300">{assessment.averageRating ?? '—'}</p>
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </div>
        </div>
        <div className="rounded-lg bg-sky-50/80 p-2.5 dark:bg-sky-900/15">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700/70 dark:text-sky-300/70">Pending</p>
          <p className="mt-0.5 text-base font-bold text-sky-700 dark:text-sky-300">{assessment.pendingFeedback}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-3 text-[11px] font-semibold text-slate-500 dark:text-gray-400">
        <span>{assessment.assessmentType || 'Mixed'} assessment</span>
        <span className="text-sky-600 transition-transform group-hover:translate-x-0.5 dark:text-sky-300">View feedback →</span>
      </div>
    </button>
  );
}

function FeedbackStatus({ row }) {
  if (!row.feedback) {
    return <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/25 dark:text-amber-300">Pending</span>;
  }
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
      </span>
      <div className="flex items-center gap-1.5">
        <RatingStars value={row.feedback.rating} size="h-3.5 w-3.5" />
        <span className="text-xs font-semibold text-slate-600 dark:text-gray-300">{row.feedback.rating}/5</span>
      </div>
    </div>
  );
}

function StudentFeedbackModal({ row, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const initials = (row.student.name || 'Student')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-feedback-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-gray-700 dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{initials}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-300">Student feedback</p>
              <h2 id="student-feedback-title" className="truncate text-lg font-bold text-slate-950 dark:text-white">{row.student.name}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-gray-400">{row.student.studentId || row.student.email || 'Student ID unavailable'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close student feedback"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {row.student.email && <p className="-mt-1 text-xs text-slate-500 dark:text-gray-400">{row.student.email}</p>}

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Score</p>
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{row.score == null ? '—' : `${row.score}/${row.maxMarks ?? '—'}`}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Assessment submitted</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{formatDateTime(row.submittedAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Feedback date</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{formatDateTime(row.feedback?.submittedAt)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Student response</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">Rating and comments submitted after the assessment.</p>
              </div>
              {row.feedback ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-900/25">
                  <RatingStars value={row.feedback.rating} size="h-3.5 w-3.5" />
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{row.feedback.rating}/5</span>
                </div>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/25 dark:text-amber-300">Pending</span>
              )}
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 dark:bg-gray-800/60 dark:text-gray-200">
              {row.feedback?.comments ? <p className="whitespace-pre-wrap break-words">{row.feedback.comments}</p> : <p className="italic text-slate-400 dark:text-gray-500">No written feedback was submitted.</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3 dark:border-gray-800">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
        </div>
      </div>
    </div>
  );
}

function AssessmentFeedbackDetail({ assessment, onBack }) {
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.listAssessmentFeedback(assessment._id, buildQuery(filters));
      setData({ rows: response.rows || [], summary: response.summary || {} });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load assessment feedback.');
    } finally {
      setLoading(false);
    }
  }, [assessment._id, filters]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadRows(); }, 250);
    return () => clearTimeout(timeoutId);
  }, [loadRows]);

  const summary = data.summary || {};

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_55%,#eef4ff_100%)] px-3 py-4 dark:bg-gray-950 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1500px]">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-sky-300 hover:text-sky-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-300"
        >
          <ArrowLeft className="h-4 w-4" />
          All assessments
        </button>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">
              <MessageSquareText className="h-4 w-4" /> Assessment feedback
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{assessment.title}</h1>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
              <CalendarDays className="h-4 w-4" />
              {formatDateTime(assessment.startTime)}
              <span className="text-slate-300 dark:text-gray-600">•</span>
              {assessment.assessmentType || 'Mixed'} assessment
            </p>
          </div>
          <button type="button" onClick={() => void loadRows()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-sky-300 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:text-sky-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile icon={Users} label="Completed students" value={summary.completedStudents ?? 0} helper="Finished assessment attempts" />
          <SummaryTile icon={MessageSquareText} label="Feedback received" value={summary.feedbackCount ?? 0} helper="Submitted responses" tone="emerald" />
          <SummaryTile icon={Clock3} label="Pending feedback" value={summary.pendingFeedback ?? 0} helper="Students still to review" tone="amber" />
          <SummaryTile icon={Star} label="Average rating" value={summary.averageRating ? `${summary.averageRating}/5` : '—'} helper="Student experience rating" tone="slate" />
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Search student</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name, email or student ID" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600 dark:focus:bg-gray-900 dark:focus:ring-sky-900/40" />
              </span>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Feedback from</span>
              <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600" />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Feedback to</span>
              <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600" />
            </label>
            <button type="button" onClick={() => setFilters({ search: '', from: '', to: '' })} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <Filter className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </section>

        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-gray-800">
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">Student feedback</h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">Click a student row to view the complete response.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-gray-800 dark:text-gray-300">{data.rows.length} students</span>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />)}
            </div>
          ) : data.rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300 dark:text-gray-600" />
              <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-gray-200">No completed students found</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Try changing the search or feedback date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1020px] w-full text-left">
                <thead className="bg-slate-50 dark:bg-gray-800/80">
                  <tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">
                    <th className="px-4 py-2.5">Student</th>
                    <th className="px-3 py-2.5">Score</th>
                    <th className="px-3 py-2.5">Assessment submitted</th>
                    <th className="px-3 py-2.5">Feedback status</th>
                    <th className="px-3 py-2.5">Feedback date</th>
                    <th className="px-3 py-2.5">Comments</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {data.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="group cursor-pointer align-top transition-colors hover:bg-sky-50/50 focus:bg-sky-50/50 focus:outline-none dark:hover:bg-gray-800/40 dark:focus:bg-gray-800/40"
                      tabIndex={0}
                      onClick={() => setSelectedStudent(row)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedStudent(row); } }}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{row.student.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">{row.student.studentId || row.student.email || 'Student ID unavailable'}</p>
                        {row.student.email && row.student.studentId && <p className="mt-0.5 max-w-[190px] truncate text-[10px] text-slate-400 dark:text-gray-500">{row.student.email}</p>}
                      </td>
                      <td className="px-3 py-3 text-sm font-bold text-slate-800 dark:text-gray-200">{row.score == null ? '—' : `${row.score}/${row.maxMarks ?? '—'}`}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-gray-300">{formatDateTime(row.submittedAt)}</td>
                      <td className="px-3 py-3"><FeedbackStatus row={row} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-gray-400">{formatDateTime(row.feedback?.submittedAt)}</td>
                      <td className="max-w-[240px] px-3 py-3 text-xs leading-5 text-slate-600 dark:text-gray-300">
                        {row.feedback?.comments ? <span title={row.feedback.comments} className="line-clamp-2">{row.feedback.comments}</span> : <span className="text-slate-400 dark:text-gray-500">No written feedback</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex rounded-lg border border-sky-200 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 transition-colors group-hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:group-hover:bg-sky-900/30">View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selectedStudent && <StudentFeedbackModal row={selectedStudent} onClose={() => setSelectedStudent(null)} />}
      </div>
    </div>
  );
}

export default function AssessmentFeedback() {
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.listAssessmentFeedbackAssessments(buildQuery(filters));
      setAssessments(response.assessments || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load assessment feedback.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadAssessments(); }, 250);
    return () => clearTimeout(timeoutId);
  }, [loadAssessments]);

  const overview = useMemo(() => assessments.reduce((summary, assessment) => ({
    assessments: summary.assessments + 1,
    completed: summary.completed + Number(assessment.completedStudents || 0),
    responses: summary.responses + Number(assessment.feedbackCount || 0),
    pending: summary.pending + Number(assessment.pendingFeedback || 0),
  }), { assessments: 0, completed: 0, responses: 0, pending: 0 }), [assessments]);

  if (selectedAssessment) {
    return <AssessmentFeedbackDetail assessment={selectedAssessment} onBack={() => setSelectedAssessment(null)} />;
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_55%,#eef4ff_100%)] px-3 py-4 dark:bg-gray-950 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">
              <MessageSquareText className="h-4 w-4" /> Admin workspace
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Assessment Feedback</h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500 dark:text-gray-400">Review student experience after each assessment. Select an assessment to open its feedback table.</p>
          </div>
          <button type="button" onClick={() => void loadAssessments()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-sky-300 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:text-sky-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile icon={ClipboardCheck} label="Assessments" value={overview.assessments} helper="Published assessment windows" />
          <SummaryTile icon={Users} label="Completed attempts" value={overview.completed} helper="Students eligible for feedback" tone="emerald" />
          <SummaryTile icon={MessageSquareText} label="Feedback received" value={overview.responses} helper="Submitted student responses" tone="sky" />
          <SummaryTile icon={Clock3} label="Pending responses" value={overview.pending} helper="Awaiting student feedback" tone="amber" />
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Search assessments</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search by assessment name" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600 dark:focus:bg-gray-900 dark:focus:ring-sky-900/40" />
              </span>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Assessment from</span>
              <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600" />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Assessment to</span>
              <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600" />
            </label>
            <button type="button" onClick={() => setFilters({ search: '', from: '', to: '' })} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <Filter className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </section>

        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        <section className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Assessments</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Sorted by assessment date, newest first.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">{assessments.length} found</span>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}
            </div>
          ) : assessments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900">
              <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300 dark:text-gray-600" />
              <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-gray-200">No assessments found</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Try a different assessment name or date range.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assessments.map((assessment) => <AssessmentCard key={assessment._id} assessment={assessment} onOpen={setSelectedAssessment} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
