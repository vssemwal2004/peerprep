import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  FileLock2,
  Hash,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { formatDateTime, formatDurationMinutes } from './assessmentDashboardUtils';

function formatSectionType(type = '') {
  const normalized = String(type || '').toLowerCase().replace(/_/g, ' ');
  if (!normalized) return 'Mixed';
  if (normalized === 'mcq') return 'MCQ';
  if (normalized === 'one line') return 'One Line';
  if (normalized === 'short answer') return 'Short Answer';
  if (normalized === 'coding') return 'Coding';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-sky-50 text-sky-600">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-xs font-semibold text-slate-800 truncate">{value}</div>
      </div>
    </div>
  );
}

function SectionRow({ index, section }) {
  const questionCount = section.questions?.length || Number(section.totalQuestions || 0) || 0;
  const marksPerQuestion = Number(section.marksPerQuestion || section.pointsPerQuestion || 0) || 0;
  const totalMarks = Number(section.totalMarks || 0) || (questionCount * marksPerQuestion);
  const sectionTitle = section.sectionName || section.title || `Section ${index + 1}`;

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-sky-100 text-[10px] font-bold text-sky-700">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800">{sectionTitle}</span>
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 uppercase">
              {formatSectionType(section.type)}
            </span>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
          <span>{questionCount} Qs</span>
          <span className="text-slate-300">•</span>
          <span>{marksPerQuestion} pts</span>
          <span className="text-slate-300">•</span>
          <span className="font-semibold text-slate-700">{totalMarks} total</span>
        </div>
      </div>
    </div>
  );
}

export default function AssessmentLaunchModal({ assessment, open, onClose, onUnlock, onStart }) {
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

  const requiresPassword = Boolean(assessment?.passwordEnabled && !assessment?.passwordUnlocked);
  const sections = Array.isArray(assessment?.sections) ? assessment.sections : [];

  const sectionSummary = useMemo(() => {
    const totalSections = sections.length || Number(assessment?.totalSections || 0) || 0;
    const totalQuestions = sections.reduce(
      (sum, section) => sum + (section.questions?.length || Number(section.totalQuestions || 0) || 0),
      0,
    ) || Number(assessment?.totalQuestions || 0) || 0;
    const uniqueTypes = [...new Set(sections.map((section) => section?.type).filter(Boolean))];
    const typeLabel = uniqueTypes.length
      ? uniqueTypes.map((type) => formatSectionType(type)).join(', ')
      : formatSectionType(assessment?.assessmentType || 'mixed');
    const totalMarksFromSections = sections.reduce((sum, section) => {
      const questionCount = section.questions?.length || Number(section.totalQuestions || 0) || 0;
      const marksPerQuestion = Number(section.marksPerQuestion || section.pointsPerQuestion || 0) || 0;
      return sum + (Number(section.totalMarks || 0) || (questionCount * marksPerQuestion));
    }, 0);

    return {
      totalSections,
      totalQuestions,
      typeLabel,
      totalMarks: totalMarksFromSections > 0 ? totalMarksFromSections : Number(assessment?.totalMarks || 0) || 0,
    };
  }, [assessment, sections]);

  const handleUnlock = async () => {
    if (!assessment) return;
    if (requiresPassword && !password.trim()) {
      setError('Enter the assessment password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onUnlock(password);
      onStart();
    } catch (err) {
      setError(err.message || 'Unable to start assessment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!assessment) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-100 text-sky-600">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assessment Details</span>
                </div>
                <h2 className="text-base font-bold text-slate-900">{assessment.title}</h2>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <DetailItem
                    icon={Calendar}
                    label="Start Date"
                    value={formatDateTime(assessment.startTime) || 'Not specified'}
                  />
                  <DetailItem
                    icon={Calendar}
                    label="End Date"
                    value={formatDateTime(assessment.endTime) || 'Not specified'}
                  />
                  <DetailItem
                    icon={Clock}
                    label="Duration"
                    value={formatDurationMinutes(assessment.duration) || 'Not specified'}
                  />
                  <DetailItem
                    icon={FileLock2}
                    label="Total Sections"
                    value={`${sectionSummary.totalSections} • ${sectionSummary.totalQuestions} Qs`}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-sky-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Question Types</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-800">{sectionSummary.typeLabel}</span>
                </div>

                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Hash className="h-3.5 w-3.5 text-sky-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Section Details</span>
                  </div>
                  {sections.length > 0 ? (
                    <div className="space-y-1.5">
                      {sections.map((section, index) => (
                        <SectionRow key={`${section.sectionName || section.title || 'section'}-${index}`} index={index} section={section} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                      No sections available
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Marks</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900">{sectionSummary.totalMarks}</span>
                </div>

                {requiresPassword && (
                  <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3">
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 mb-1.5">
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
                      className="w-full rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                    {error && <p className="mt-1 text-[10px] font-medium text-rose-600">{error}</p>}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={submitting}
                  className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-200 disabled:text-sky-50"
                >
                  {submitting ? 'Verifying...' : assessment.hasSubmissionInProgress ? 'Continue Test' : 'Start Test'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
