import { CalendarDays, ArrowRight, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDateTime, formatDurationMinutes } from './assessmentDashboardUtils';

export default function AssessmentCard({ assessment, onLaunch, onFeedback }) {
  const isLive = assessment.status === 'Live';
  const isCompleted = Boolean(
    assessment.hasSubmitted
    || assessment.submittedAt
    || assessment.manuallyCompletedAt
    || assessment.actionLabel === 'Completed'
    || assessment.status === 'Completed',
  );
  const canGiveFeedback = isCompleted && Boolean(assessment.hasSubmitted || assessment.submittedAt);
  const canLaunch = isLive && !isCompleted;
  const statusTone = isCompleted
    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800'
    : isLive
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300';
  const helperText = isCompleted
    ? assessment.submittedAt
      ? `Submitted ${formatDateTime(assessment.submittedAt)}`
      : assessment.manuallyCompletedAt
        ? `Completed ${formatDateTime(assessment.manuallyCompletedAt)}`
        : 'Assessment completed'
    : assessment.hasSubmissionInProgress
      ? 'Continue your assessment'
      : 'Start when available';

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">{assessment.title || 'Not available'}</h3>
        </div>

        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
          {isCompleted ? 'Completed' : assessment.status || 'Not available'}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-[11px] text-slate-500 dark:text-gray-400">
        <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{formatDateTime(assessment.startTime)}</span></div>
        <div className="grid grid-cols-2 gap-2"><span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{formatDurationMinutes(assessment.duration)}</span><span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5" />{assessment.totalQuestions !== undefined && assessment.totalQuestions !== null ? `${assessment.totalQuestions} questions` : 'Not available'}</span></div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-gray-800">
        <div className="truncate text-[11px] text-slate-500 dark:text-gray-400">
          {helperText}
        </div>
        <button
          type="button"
          onClick={() => {
            if (canGiveFeedback) onFeedback?.(assessment);
            else if (canLaunch) onLaunch(assessment);
          }}
          disabled={!canLaunch && !canGiveFeedback}
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            canGiveFeedback
              ? 'bg-sky-600 text-white shadow-sm shadow-sky-900/10 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500'
              : isCompleted
                ? 'cursor-default bg-emerald-600 text-white shadow-sm shadow-emerald-900/10'
              : 'bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500'
          }`}
        >
          {canGiveFeedback ? 'Give feedback' : isCompleted ? 'Completed' : assessment.hasSubmissionInProgress ? 'Continue' : 'Start'}
          {isCompleted && !canGiveFeedback ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
        </button>
      </div>
    </motion.article>
  );
}
