import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, CalendarDays, Clock3, EyeOff, Hourglass, ListChecks, Lock, MessageSquareText, Target, Trophy, X } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { OutcomeBar, QuestionList, QuestionMap, ScoreRing, SectionBars, outcomeCounts } from '../../features/prepMock/MockResultParts';
import { isResultAnnounced } from '../../utils/assessmentEvaluation';
import { formatSeconds } from '../assessment-dashboard/assessmentDashboardUtils';

/** 15.5 not 15.50; whole numbers stay whole. */
const formatScore = (value) => {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
};

// The student's result for one Prep Mock: score ring against the pass mark, right / wrong /
// skipped, section scores, and every question (green right, red wrong) with their own answer and,
// when the admin allows it, the correct one. Coding questions show tests passed, marks and the code.

const surface = 'rounded-2xl border border-[#e9eaee] bg-white dark:border-white/[0.07] dark:bg-[#242424]';
const dateText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function Fact({ icon: Icon, label, value, detail }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f6f7f9] px-3.5 py-2.5 dark:bg-white/[0.04]">
      <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-zinc-400"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
      <p className="mt-0.5 truncate text-[16px] font-bold tabular-nums text-slate-900 dark:text-white">{value}{detail && <span className="ml-1 text-[12px] font-medium text-slate-400 dark:text-zinc-500">{detail}</span>}</p>
    </div>
  );
}

function Waiting({ icon: Icon, title, text }) {
  return (
    <div className={`${surface} flex flex-col items-center px-6 py-12 text-center`} role="status">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><Icon className="h-7 w-7" aria-hidden="true" /></span>
      <h3 className="mt-4 text-[17px] font-semibold text-slate-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-slate-500 dark:text-zinc-400">{text}</p>
    </div>
  );
}

export default function MockResultModal({ report, mock = null, open, onClose, onFeedback }) {
  const [tab, setTab] = useState('questions');
  const [openIndex, setOpenIndex] = useState(null);
  const closeRef = useRef(null);
  // The latest close handler, so the open effect does not rerun (and reset the view) on each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const rows = useMemo(() => report?.questionWise || [], [report]);
  const counts = useMemo(() => outcomeCounts(rows), [rows]);

  useEffect(() => {
    if (!open) return undefined;
    setTab('questions');
    setOpenIndex(null);
    const opener = document.activeElement;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current?.(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, report?.id]);

  if (!report) return null;
  const announced = isResultAnnounced(report);
  const evaluating = report.permissions?.resultReleased && ['processing'].includes(report.evaluationStatus);
  const percent = Number(report.accuracy ?? (report.totalMarks ? (report.score / report.totalMarks) * 100 : 0));
  const passMark = report.passPercentage ?? null;
  const passed = passMark === null ? null : percent >= Number(passMark);
  const answersHidden = announced && !report.permissions?.canViewCorrectAnswers;
  const company = mock?.company || '';
  const role = mock?.role || '';

  const pick = (index) => {
    setTab('questions');
    setOpenIndex(index);
    requestAnimationFrame(() => document.getElementById(`mock-result-q-${index}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-3 py-6 font-dmsans backdrop-blur-sm sm:px-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="mock-result-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-[#e8e5f4] bg-[#f6f7f9] text-slate-900 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] dark:border-white/[0.08] dark:bg-[#1a1a1a] dark:text-zinc-100">
            <header className="relative overflow-hidden border-b border-[#ece9f7] bg-white px-5 py-4 sm:px-6 dark:border-white/[0.06] dark:bg-[#242424]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_120%_at_0%_0%,rgba(139,92,246,0.14),transparent_65%),radial-gradient(40%_100%_at_100%_0%,rgba(14,165,233,0.1),transparent_65%)]" aria-hidden="true" />
              <div className="relative flex items-start gap-3.5">
                {company && <CompanyLogo name={company} logo={mock?.companyLogo} size="spot" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300">Mock result</p>
                  <h2 id="mock-result-title" className="mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-[-0.02em] text-slate-950 sm:text-[22px] dark:text-white">{report.assessmentName}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
                    {[company, role].filter(Boolean).join(' · ')}
                    {report.submittedAt && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Submitted {dateText(report.submittedAt)}</span></>}
                  </p>
                </div>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close result"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="space-y-5 p-4 sm:p-6">
              {!announced ? (
                evaluating
                  ? <Waiting icon={Hourglass} title="Your answers are being checked" text="Coding answers take a little while to run. Your score shows here as soon as checking finishes." />
                  : <Waiting icon={Lock} title="Result not released yet" text="Your answers are saved. Your score and question review appear here once your admin releases the result." />
              ) : (
                <>
                  <section aria-label="Your score" className={`${surface} p-5 sm:p-6`}>
                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                      <ScoreRing percent={percent} passPercentage={passMark} />
                      <div className="min-w-0 flex-1 space-y-4">
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                          <p className="text-[34px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">
                            {formatScore(report.score)}<span className="text-[18px] font-semibold text-slate-400 dark:text-zinc-500"> / {formatScore(report.totalMarks)} marks</span>
                          </p>
                          {passed !== null && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset ${passed ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25'}`}>
                              {passed ? <Award className="h-3.5 w-3.5" aria-hidden="true" /> : <Target className="h-3.5 w-3.5" aria-hidden="true" />}
                              {passed ? 'Cleared the pass mark' : 'Below the pass mark'} ({passMark}%)
                            </span>
                          )}
                        </div>
                        <OutcomeBar counts={counts} total={rows.length || report.totalQuestions} />
                        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                          <Fact icon={ListChecks} label="Questions" value={report.totalQuestions ?? rows.length} />
                          <Fact icon={Clock3} label="Time taken" value={formatSeconds(report.timeTakenSec)} />
                          {report.rank ? <Fact icon={Trophy} label="Rank" value={`#${report.rank}`} detail={report.participants ? `of ${report.participants}` : ''} /> : <Fact icon={Target} label="Correct" value={report.correctAnswers ?? counts.correct} />}
                          {report.percentile !== null && report.percentile !== undefined ? <Fact icon={Award} label="Percentile" value={Math.round(report.percentile)} /> : <Fact icon={Target} label="Wrong" value={report.wrongAnswers ?? counts.incorrect} />}
                        </div>
                      </div>
                    </div>
                  </section>

                  <div role="tablist" aria-label="Result view" className="flex gap-5 border-b border-[#e6e7eb] dark:border-white/[0.08]">
                    {[['questions', 'Questions', rows.length], ['sections', 'Sections', (report.sectionBreakdown || []).length]].filter(([, , count]) => count > 0).map(([id, label, count]) => (
                      <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                        className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] font-semibold transition-colors ${tab === id ? 'border-violet-600 text-slate-900 dark:border-violet-400 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}>
                        {label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{count}</span>
                      </button>
                    ))}
                  </div>

                  {tab === 'sections' ? (
                    <section className={`${surface} p-5`} aria-label="Section scores"><SectionBars sections={report.sectionBreakdown || []} /></section>
                  ) : rows.length ? (
                    <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
                      <aside className={`${surface} p-4 lg:sticky lg:top-4`} aria-label="Question map">
                        <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-zinc-50">Jump to a question</p>
                        <QuestionMap rows={rows} onPick={pick} />
                        {answersHidden && (
                          <p className="mt-4 flex gap-2 rounded-xl bg-[#f6f7f9] p-2.5 text-[11.5px] leading-5 text-slate-500 dark:bg-white/[0.04] dark:text-zinc-400">
                            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Correct answers are not shown for this mock. You can see which questions you got right.
                          </p>
                        )}
                      </aside>
                      <QuestionList rows={rows} openIndex={openIndex} onToggle={(index) => setOpenIndex((current) => (current === index ? null : index))} you idPrefix="mock-result-q" />
                    </div>
                  ) : (
                    <Waiting icon={ListChecks} title="Question review is not available" text="This mock shows your score only." />
                  )}
                </>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e9eaee] bg-white px-5 py-3.5 sm:px-6 dark:border-white/[0.06] dark:bg-[#242424]">
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">Tell us how this mock felt, it helps us make the next one better.</p>
              <div className="flex gap-2">
                {onFeedback && (
                  <button type="button" onClick={onFeedback}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-50 px-3 text-[12.5px] font-semibold text-violet-700 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20">
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />Give feedback
                  </button>
                )}
                <button type="button" onClick={onClose}
                  className="inline-flex h-9 items-center rounded-xl bg-violet-600 px-4 text-[12.5px] font-semibold text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)] hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
                  Done
                </button>
              </div>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
