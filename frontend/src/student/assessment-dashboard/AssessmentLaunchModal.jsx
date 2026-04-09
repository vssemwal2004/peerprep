import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Clock3, Layers3, X } from 'lucide-react';
import { formatDateTime, formatDurationMinutes } from './assessmentDashboardUtils';

export default function AssessmentLaunchModal({ assessment, open, onClose, onConfirm }) {
  if (!assessment) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_38px_95px_-58px_rgba(15,23,42,0.5)] dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-12">
              <div className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                Launch Assessment
              </div>
              <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                {assessment.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                Review the schedule and duration, then begin the attempt in the secure assessment workspace.
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Schedule
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{formatDateTime(assessment.startTime)}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    Duration
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{formatDurationMinutes(assessment.duration)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    <Layers3 className="h-3.5 w-3.5" />
                    Questions
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalQuestions}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    Total Marks
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalMarks}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_35px_-25px_rgba(15,23,42,0.75)] transition-colors hover:bg-slate-800"
              >
                {assessment.hasSubmissionInProgress ? 'Continue Assessment' : 'Start Assessment'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
