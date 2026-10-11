import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CodingStartIllustration, LearningStartIllustration } from './DashboardIllustrations';
import { focusRing, interactiveCard, Unavailable } from './ui';

function StartGuide({ canQuestions, canLearning }) {
  if (!canQuestions && !canLearning) return null;
  const cards = [
    canQuestions && { to: '/problems', title: 'Start coding', copy: 'Solve your first problem and open your streak.', cta: 'Explore questions', Art: CodingStartIllustration },
    canLearning && { to: '/student/learning', title: 'Start learning', copy: 'Watch a lesson and finish your first topic.', cta: 'Explore subjects', Art: LearningStartIllustration },
  ].filter(Boolean);
  return <section aria-labelledby="start-guide-title" className="mt-7">
    <h2 id="start-guide-title" className="mb-3 text-[15px] font-medium text-slate-900 dark:text-zinc-100">Start here</h2>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map(({ to, title, copy, cta, Art }) => <Link key={to} to={to} className={`group flex items-center gap-4 p-5 ${interactiveCard} ${focusRing}`}>
        <Art className="h-auto w-[104px] shrink-0" />
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium text-slate-900 dark:text-zinc-100">{title}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{copy}</p>
          <span className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-sky-700 dark:text-sky-400">{cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </div>
      </Link>)}
    </div>
  </section>;
}

/** Hand-drawn stroke under the student's name; draws in once on load. */
function NameUnderline() {
  return <svg viewBox="0 0 200 16" preserveAspectRatio="none" fill="none" aria-hidden="true" className="pointer-events-none absolute -bottom-3 left-0 h-3.5 w-full overflow-visible text-sky-400 dark:text-sky-500">
    <path d="M4 11.5C52 5.5 118 3.2 196 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" pathLength="1" className="dashboard-underline" />
    <path d="M30 14.6C78 11.2 128 10.4 172 11.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" pathLength="1" opacity=".5" className="dashboard-underline dashboard-underline-late" />
  </svg>;
}

/** Greeting and one short line of context, with the student's level and badges alongside. */
export default function GreetingHeader({ greeting, name, nudge, section, firstSession, canQuestions, canLearning, onRetry, aside }) {
  return <header className="dashboard-greeting pt-1">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0">
        <h1 className="text-[28px] font-medium leading-[1.2] tracking-[-0.03em] text-slate-900 dark:text-zinc-50 sm:text-[34px]">
          {greeting},{' '}
          <span className="relative inline-block break-words">
            <span className="font-bold text-sky-600 dark:text-sky-400">{name}</span>
            <NameUnderline />
          </span>
        </h1>
        {nudge && <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{nudge}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
    {section.error && <Unavailable className="mt-5" message="Your progress could not be loaded." onRetry={onRetry} />}
    {firstSession && <StartGuide canQuestions={canQuestions} canLearning={canLearning} />}
  </header>;
}
