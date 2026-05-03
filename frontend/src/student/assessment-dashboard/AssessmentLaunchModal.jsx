import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, Layers3, Lock, X } from 'lucide-react';
import { formatDateTime, formatDurationMinutes } from './assessmentDashboardUtils';

export default function AssessmentLaunchModal({ assessment, open, onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  if (!assessment) return null;

  const requiresPassword = Boolean(assessment.passwordEnabled);
  const settings = assessment.settings || {};
  const activeRules = [
    settings.enableFullscreen && 'Fullscreen enforcement',
    settings.tabSwitchDetection && `Tab switch monitoring${settings.tabSwitchLimit ? ` (${settings.tabSwitchLimit} allowed)` : ''}`,
    settings.cameraMonitoring && 'Camera verification and monitoring',
    settings.disableCopyPaste && 'Copy/paste blocking',
    settings.preventMultipleTabs && 'Duplicate assessment tab blocking',
    settings.restrictNavigation && 'Navigation restriction',
    settings.idleDetection && `Idle monitoring${settings.idleThresholdMin ? ` (${settings.idleThresholdMin} min)` : ''}`,
    settings.questionWatermark && 'Candidate watermarking',
    settings.audioMonitoring && 'Audio monitoring rule',
    settings.randomShuffle && 'Question shuffle',
    settings.autoSubmitOnEnd && 'Auto-submit on timer end',
  ].filter(Boolean);
  const instructionItems = [
    assessment.instructions,
    ...(Array.isArray(assessment.customInstructions) ? assessment.customInstructions : []),
  ].filter((item) => String(item || '').trim());

  const handleConfirm = async () => {
    if (requiresPassword && !password.trim()) {
      setError('Enter the assessment password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.message || 'Unable to start assessment.');
      setSubmitting(false);
    }
  };

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
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_38px_95px_-58px_rgba(15,23,42,0.5)] dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-5 sm:px-5">
              <div className="pr-10">
                <div className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
                  Launch Assessment
                </div>
                <h3 className="mt-3 break-words text-xl font-black tracking-tight text-slate-950 dark:text-white">
                  {assessment.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-300">
                  Review the schedule and duration, then continue to secure verification.
                </p>
              </div>

              <div className="mt-4 grid gap-2.5">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Schedule
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{formatDateTime(assessment.startTime)}</div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    Duration
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{formatDurationMinutes(assessment.duration)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    <Layers3 className="h-3.5 w-3.5" />
                    Questions
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalQuestions}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                    Total Marks
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950 dark:text-white">{assessment.totalMarks}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                Active Rules
              </div>
              <div className="mt-2 grid max-h-40 gap-1.5 overflow-y-auto pr-1 text-sm text-slate-600 dark:text-gray-300">
                {(activeRules.length ? activeRules : ['Standard assessment monitoring']).map((rule) => (
                  <div key={rule} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-400">
                Instructions
              </div>
              <div className="mt-2 max-h-28 space-y-1.5 overflow-y-auto pr-1 text-sm text-slate-600 dark:text-gray-300">
                {(instructionItems.length ? instructionItems : ['Read all rules carefully before continuing to verification.']).map((item, index) => (
                  <div key={`instruction-${index}`} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {requiresPassword && (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-300">
                  <Lock className="h-3.5 w-3.5" />
                  Assessment Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError('');
                  }}
                  placeholder="Enter password"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
              </div>
            )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_35px_-25px_rgba(15,23,42,0.75)] transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
