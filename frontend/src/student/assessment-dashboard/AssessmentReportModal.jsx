import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Target, Trophy, X } from 'lucide-react';
import { formatScore, formatSeconds } from './assessmentDashboardUtils';

function ProgressRow({ label, value, total, tone }) {
  const width = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          {value}
          <span className="ml-1 text-xs text-slate-400 dark:text-gray-400">of {total}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${tone}`}
        />
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const normalized = Math.max(0, Math.min(100, Number(score || 0)));
  const size = 104;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ height: size, width: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="assessment-score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#assessment-score-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {Math.round(normalized)}%
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
          Accuracy
        </div>
      </div>
    </div>
  );
}

export default function AssessmentReportModal({ report, open, onClose }) {
  if (!report) return null;

  const totalQuestions = report.totalQuestions || 0;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-7 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative my-2 w-full max-w-4xl rounded-md border border-slate-200 bg-white p-4 shadow-[0_38px_110px_-60px_rgba(15,23,42,0.5)] dark:border-gray-700 dark:bg-gray-900 sm:my-6 sm:p-5"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-10">
              <div className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                Detailed Analytics
              </div>
              <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {report.assessmentName}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                Review question performance, scoring accuracy, and time efficiency for this assessment attempt.
              </p>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
                  <ScoreRing score={report.accuracy} />

                  <div className="grid flex-1 gap-2.5 sm:grid-cols-2">
                    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                        Final Score
                      </div>
                      <div className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                        {formatScore(report.score)}
                        <span className="ml-1 text-base font-semibold text-slate-400 dark:text-gray-400">/ {formatScore(report.totalMarks)}</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                        Time Taken
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                        <Clock3 className="h-4.5 w-4.5 text-sky-600" />
                        {formatSeconds(report.timeTakenSec)}
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                        Total Questions
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                        <Target className="h-4.5 w-4.5 text-emerald-600" />
                        {report.totalQuestions}
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                        Status
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                        <Trophy className="h-4.5 w-4.5 text-amber-500" />
                        {report.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <ProgressRow label="Correct" value={report.correctAnswers} total={totalQuestions} tone="bg-emerald-500" />
                  <ProgressRow label="Wrong" value={report.wrongAnswers} total={totalQuestions} tone="bg-rose-500" />
                  <ProgressRow label="Skipped" value={report.skippedQuestions} total={totalQuestions} tone="bg-slate-400" />
                </div>

                {report.pendingEvaluationQuestions > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200">
                    {report.pendingEvaluationQuestions} question{report.pendingEvaluationQuestions !== 1 ? 's are' : ' is'} marked as pending evaluation. This usually applies to coding/manual review sections.
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3.5 shadow-[0_24px_50px_-42px_rgba(15,23,42,0.35)] dark:border-gray-700 dark:bg-gray-900">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-400">
                  Section Breakdown
                </div>
                <div className="mt-3 space-y-3">
                  {(report.sectionBreakdown || []).length > 0 ? (
                    report.sectionBreakdown.map((section) => (
                      <div key={section.sectionName} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{section.sectionName}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-gray-400">
                              {section.type}
                            </div>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-gray-900 dark:text-gray-200">
                            {section.totalQuestions} questions
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                          <div className="rounded-md bg-white px-2.5 py-2.5 dark:bg-gray-900">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-400">Correct</div>
                            <div className="mt-0.5 text-lg font-black text-emerald-600">{section.correctAnswers}</div>
                          </div>
                          <div className="rounded-md bg-white px-2.5 py-2.5 dark:bg-gray-900">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-400">Wrong</div>
                            <div className="mt-0.5 text-lg font-black text-rose-600">{section.wrongAnswers}</div>
                          </div>
                          <div className="rounded-md bg-white px-2.5 py-2.5 dark:bg-gray-900">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-400">Skipped</div>
                            <div className="mt-0.5 text-lg font-black text-slate-700 dark:text-gray-200">{section.skippedQuestions}</div>
                          </div>
                          <div className="rounded-md bg-white px-2.5 py-2.5 dark:bg-gray-900">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-400">Pending</div>
                            <div className="mt-0.5 text-lg font-black text-amber-600">{section.pendingEvaluationQuestions}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-sm text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                      Section-wise breakdown is not available for this attempt yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
