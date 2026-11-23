import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, Lock, MessageSquareText } from 'lucide-react';
import { resultOf } from './prepMockModel';
import { focusRing } from '../dashboard/ui';

const sizes = {
  md: 'h-9 px-3.5 text-[12.5px]',
  lg: 'h-11 px-5 text-[14px]',
};

/**
 * The mock's action, exactly as Prep Assessment: Start / Continue open the same launch window (details,
 * password) and test page; a submitted mock shows its released result and Feedback; otherwise a disabled
 * "Not open yet" / "Closed" / "Completed".
 */
export default function MockActions({ mock, state, report, onStart, onViewResult, onFeedback, size = 'md', className = '' }) {
  const open = state === 'live' || state === 'in_progress';
  const needsPassword = Boolean(mock.passwordEnabled && !mock.passwordUnlocked);
  const result = resultOf(report);
  const button = `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors ${sizes[size] || sizes.md} ${focusRing}`;

  let action;
  if (open) {
    action = (
      <button type="button" data-guide="pmock-start" onClick={() => onStart(mock)} aria-label={`${state === 'in_progress' ? 'Continue' : 'Start'} ${mock.title}`}
        className={`${button} bg-violet-600 text-white shadow-[0_10px_24px_-14px_rgba(109,40,217,0.9)] hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400`}>
        {needsPassword && <Lock className="h-4 w-4" aria-hidden="true" />}{state === 'in_progress' ? 'Continue mock' : 'Start mock'}<ArrowRight className="h-4 w-4" aria-hidden="true" />
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
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {state === 'completed' && (
        <button type="button" onClick={() => onFeedback(mock)} aria-label={`Give feedback on ${mock.title}`}
          className={`${button} border border-[#e6e7eb] bg-white text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-200 dark:hover:bg-white/[0.06]`}>
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />Feedback
        </button>
      )}
      {action}
    </div>
  );
}
