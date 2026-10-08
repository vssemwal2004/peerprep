import { BookOpenCheck, CheckCircle2, ClipboardList, Clock3, Flame, MessageSquare, Percent } from 'lucide-react';
import { AnimatedMetric } from '../../student/profile/ui';
import { Muted, StatStrip } from './shared';
import { fmtDateTime, fmtRelative, plural } from './utils';

function StreakDots({ week, best }) {
  const active = week.filter((day) => day.active).length;
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`Active ${active} of the last 7 days. Best streak ${best} days.`}>
      {week.map((day) => (
        <span
          key={day.key}
          title={`${day.full}: ${day.active ? 'active' : 'no activity'}`}
          className={`h-1.5 w-2 rounded-full ${day.active ? 'bg-orange-400' : 'bg-slate-200 dark:bg-zinc-700'}`}
        />
      ))}
      <span className="ml-1">best {best}d</span>
    </span>
  );
}

/**
 * Headline KPIs for admins in one structured strip. A dash (not 0%) marks data that does not
 * exist yet, so an empty record is never mistaken for a poor score.
 */
export default function OverviewStrip({ headline, lastActive, coding, acceptance, assessments, interviews, learning, streak }) {
  const hasAttempts = coding.attempted > 0;
  const hasAcceptance = acceptance.total > 0 && acceptance.rate !== null;
  // avgScore is percent of max marks; null when the server could not normalize it.
  const hasAssessment = assessments.attempts > 0 && assessments.avgScore !== null && assessments.avgScore !== undefined;
  const hasInterview = interviews.feedbackReceived > 0;
  const hasLearning = learning.percent !== null;

  const items = [
    {
      label: coding.scoped ? 'Solved · your problems' : 'Problems solved',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: 'emerald',
      value: hasAttempts ? (
        <>
          <AnimatedMetric value={coding.totalSolved} />
          <span className="text-xs font-medium text-slate-400 dark:text-zinc-500"> / {coding.attempted}</span>
        </>
      ) : <Muted />,
      helper: hasAttempts ? 'of attempted problems' : 'No attempts yet',
    },
    {
      label: 'Acceptance',
      icon: <Percent className="h-3.5 w-3.5" />,
      tone: 'sky',
      value: hasAcceptance ? <AnimatedMetric value={acceptance.rate} suffix="%" decimals={1} /> : <Muted />,
      helper: acceptance.total > 0
        ? (acceptance.accepted !== null ? `${acceptance.accepted} of ${acceptance.total} accepted` : plural(acceptance.total, 'submission'))
        : 'No submissions yet',
    },
    {
      label: 'Assessment avg',
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      tone: 'amber',
      value: hasAssessment ? <AnimatedMetric value={assessments.avgScore} suffix="%" decimals={1} /> : <Muted />,
      helper: assessments.attempts > 0 ? plural(assessments.attempts, 'attempt') : 'Not taken yet',
    },
    {
      label: 'Interview avg',
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      tone: 'indigo',
      value: hasInterview ? <AnimatedMetric value={interviews.avgScore} suffix="%" decimals={1} /> : <Muted />,
      helper: hasInterview ? `${plural(interviews.feedbackReceived, 'review')} received` : 'No feedback yet',
    },
    {
      label: learning.label,
      icon: <BookOpenCheck className="h-3.5 w-3.5" />,
      tone: 'violet',
      value: hasLearning ? <AnimatedMetric value={learning.percent} suffix="%" decimals={0} /> : <Muted />,
      helper: hasLearning ? learning.detail : 'No course progress yet',
    },
    {
      label: 'Current streak',
      icon: <Flame className="h-3.5 w-3.5" />,
      tone: 'orange',
      value: <AnimatedMetric value={streak.current} suffix={streak.current === 1 ? ' day' : ' days'} />,
      helper: <StreakDots week={streak.week} best={streak.best} />,
    },
  ];

  return (
    <section
      aria-labelledby="admin-overview-title"
      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h2 id="admin-overview-title" className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
            Performance snapshot
          </h2>
          <p className="truncate text-xs text-slate-500 dark:text-zinc-400" title={headline}>{headline}</p>
        </div>
        <span
          title={lastActive ? fmtDateTime(lastActive) : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700"
        >
          <Clock3 className="h-3 w-3 text-slate-400" aria-hidden="true" />
          Last coding activity: {lastActive ? fmtRelative(lastActive) : 'none yet'}
        </span>
      </header>
      <StatStrip items={items} cols="grid-cols-2 sm:grid-cols-3" label="Key performance indicators" />
    </section>
  );
}
