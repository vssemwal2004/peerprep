import { motion } from 'framer-motion';
import { CalendarDays, ArrowUpRight } from 'lucide-react';
import { formatDateTime } from './assessmentDashboardUtils';

export default function AssessmentCard({ assessment, onLaunch }) {
  const isLive = assessment.status === 'Live';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base font-semibold leading-6 text-slate-900 sm:text-lg">{assessment.title}</h3>
          <div className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-500">
            <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formatDateTime(assessment.startTime)}</span>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {assessment.status}
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-5 text-slate-500">
          {assessment.hasSubmissionInProgress ? 'Continue your assessment' : 'Start when available'}
        </div>
        <button
          type="button"
          onClick={() => onLaunch(assessment)}
          disabled={!isLive}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 sm:w-auto"
        >
          {assessment.hasSubmissionInProgress ? 'Continue' : 'Start'}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
