import { motion } from 'framer-motion';
import { CalendarDays, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatDateTime } from './assessmentDashboardUtils';

export default function AssessmentCard({ assessment, onLaunch }) {
  const isLive = assessment.status === 'Live';
  const isCompleted = Boolean(
    assessment.hasSubmitted
    || assessment.submittedAt
    || assessment.manuallyCompletedAt
    || assessment.actionLabel === 'Completed'
    || assessment.status === 'Completed',
  );
  const canLaunch = isLive && !isCompleted;
  const statusTone = isCompleted
    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
    : isLive
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-700';
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={canLaunch ? { y: -2 } : undefined}
      className={`flex h-full flex-col rounded-xl border p-4 shadow-sm transition-shadow sm:p-5 ${
        isCompleted
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white shadow-emerald-900/5'
          : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`line-clamp-2 text-base font-semibold leading-6 sm:text-lg ${
            isCompleted ? 'text-emerald-950' : 'text-slate-900'
          }`}>{assessment.title}</h3>
          <div className={`mt-3 flex items-start gap-2 text-sm leading-5 ${
            isCompleted ? 'text-emerald-700' : 'text-slate-500'
          }`}>
            <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formatDateTime(assessment.startTime)}</span>
          </div>
        </div>

        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
          {isCompleted ? 'Completed' : assessment.status}
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm leading-5 ${isCompleted ? 'font-medium text-emerald-700' : 'text-slate-500'}`}>
          {helperText}
        </div>
        <button
          type="button"
          onClick={() => {
            if (canLaunch) onLaunch(assessment);
          }}
          disabled={!canLaunch}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:w-auto ${
            isCompleted
              ? 'cursor-default bg-emerald-600 text-white shadow-sm shadow-emerald-900/10'
              : 'bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
          }`}
        >
          {isCompleted ? 'Completed' : assessment.hasSubmissionInProgress ? 'Continue' : 'Start'}
          {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </button>
      </div>
    </motion.div>
  );
}
