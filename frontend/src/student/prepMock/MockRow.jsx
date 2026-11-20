import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, Clock3, Layers, ListChecks, Lock, MessageSquareText, Trophy } from 'lucide-react';
import { AlwaysOpenBadge, StatusBadge } from './prepMockUi';
import { isAlwaysOpen, mockState, plainText, resultOf, sectionTypes, totalMarksOf } from './prepMockModel';
import { formatDateTime, formatDurationMinutes } from '../assessment-dashboard/assessmentDashboardUtils';
import { focusRing } from '../dashboard/ui';

function availabilityText(mock, state, alwaysOpen) {
  if (state === 'completed') return mock.submittedAt ? `Submitted ${formatDateTime(mock.submittedAt)}` : 'Submitted';
  if (alwaysOpen) return state === 'closed' ? 'No longer available' : 'Always open · start any time';
  if (state === 'upcoming') return `Opens ${formatDateTime(mock.startTime)}`;
  if (state === 'closed') return `Closed ${formatDateTime(mock.manuallyCompletedAt || mock.endTime)}`;
  return `Open till ${formatDateTime(mock.endTime)}`;
}

const button = `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold transition-colors ${focusRing}`;

function Fact({ icon: Icon, children }) {
  return <li className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" aria-hidden="true" />{children}</li>;
}

/**
 * One mock of the selected role, as a compact row. The action follows Prep Assessment exactly:
 * Start / Continue open the same launch window (details, password) and test page; a submitted mock
 * shows its released result and feedback.
 */
export default function MockRow({ mock, report, onStart, onViewResult, onFeedback }) {
  const state = mockState(mock);
  const alwaysOpen = isAlwaysOpen(mock);
  const open = state === 'live' || state === 'in_progress';
  const description = plainText(mock.description);
  const sections = Array.isArray(mock.sections) ? mock.sections.length : Number(mock.totalSections) || 0;
  const marks = totalMarksOf(mock);
  const result = resultOf(report);
  const needsPassword = Boolean(mock.passwordEnabled && !mock.passwordUnlocked);
  const questions = Number(mock.totalQuestions);

  let action;
  if (open) {
    action = (
      <button type="button" data-guide="pmock-start" onClick={() => onStart(mock)} aria-label={`${state === 'in_progress' ? 'Continue' : 'Start'} ${mock.title}`}
        className={`${button} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200`}>
        {needsPassword && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}{state === 'in_progress' ? 'Continue' : 'Start'}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  } else if (state === 'completed' && report) {
    action = (
      <button type="button" data-guide="pmock-start" onClick={() => onViewResult(report)} aria-label={`View result of ${mock.title}`}
        className={`${button} bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20`}>
        <BarChart3 className="h-4 w-4" aria-hidden="true" />{result ? `Result ${result.label}` : 'View report'}
      </button>
    );
  } else {
    const label = state === 'completed' ? 'Completed' : state === 'upcoming' ? 'Not open yet' : 'Closed';
    const Icon = state === 'completed' ? CheckCircle2 : state === 'upcoming' ? CalendarDays : Lock;
    action = (
      <button type="button" data-guide="pmock-start" disabled className={`${button} cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400`}>
        <Icon className="h-4 w-4" aria-hidden="true" />{label}
      </button>
    );
  }

  return (
    <li data-guide="pmock-mock" className={`relative flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-5 ${open ? 'bg-emerald-50/40 dark:bg-emerald-500/[0.03]' : ''}`}>
      {open && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-emerald-500" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge state={state} />
          {alwaysOpen && open && <AlwaysOpenBadge />}
          {needsPassword && open && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20"><Lock className="h-3 w-3" aria-hidden="true" />Password</span>}
          {sectionTypes(mock).map((type) => <span key={type} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{type}</span>)}
        </div>
        <h3 className="mt-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-zinc-50">{mock.title || 'Untitled mock'}</h3>
        {description && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500 dark:text-zinc-400" title={description}>{description}</p>}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600 dark:text-zinc-300" aria-label="Mock facts">
          <Fact icon={Clock3}>{formatDurationMinutes(mock.duration)}</Fact>
          {Number.isFinite(questions) && <Fact icon={ListChecks}>{questions} {questions === 1 ? 'question' : 'questions'}</Fact>}
          {sections > 0 && <Fact icon={Layers}>{sections} {sections === 1 ? 'section' : 'sections'}</Fact>}
          {marks > 0 && <Fact icon={Trophy}>{marks} marks</Fact>}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:w-[300px] lg:shrink-0 lg:flex-col lg:items-end lg:justify-center">
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-zinc-400">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{availabilityText(mock, state, alwaysOpen)}</span>
        </p>
        <div className="flex items-center gap-2">
          {state === 'completed' && (
            <button type="button" onClick={() => onFeedback(mock)} aria-label={`Give feedback on ${mock.title}`}
              className={`${button} px-2.5 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]`}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Feedback</span>
            </button>
          )}
          {action}
        </div>
      </div>
    </li>
  );
}
