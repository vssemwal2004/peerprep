import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CheckCircle2, Flame, Trophy } from 'lucide-react';
import { CodingStartIllustration, LearningStartIllustration } from './DashboardIllustrations';
import { numeric } from './dashboardUtils';
import { focusRing, interactiveCard, Skeleton, Unavailable } from './ui';

function Swash() {
  return <svg viewBox="0 0 120 12" preserveAspectRatio="none" fill="none" aria-hidden="true" className="absolute -bottom-1.5 left-0 h-2.5 w-full text-sky-300 dark:text-sky-700">
    <path d="M2 8C30 3 70 2 118 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M14 11C44 7.5 74 7 104 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
  </svg>;
}

function Stat({ to, icon: Icon, iconClass, value, label, loading, children }) {
  const body = <>
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
      <Icon className={`h-3.5 w-3.5 ${iconClass}`} aria-hidden="true" />{label}
    </span>
    <span className="mt-1 block text-[19px] font-bold leading-none tracking-[-0.03em] tabular-nums text-slate-900 dark:text-zinc-50">
      {loading ? <Skeleton className="h-[19px] w-10" /> : value}
    </span>
    {children}
  </>;
  const base = 'block min-w-0 bg-white px-3.5 py-2.5 dark:bg-[#242424]';
  return to
    ? <Link to={to} className={`${base} transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/70 ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}>{body}</Link>
    : <div className={base}>{body}</div>;
}

function WeekBars({ week }) {
  return <span className="mt-2 flex gap-[3px]" role="img" aria-label={week.map((day) => `${day.fullLabel}: ${day.count} activities`).join(', ')}>
    {week.map((day, index) => <span key={day.key} title={`${day.fullLabel}: ${day.count ? `${day.count} activit${day.count === 1 ? 'y' : 'ies'}` : 'no activity'}`}
      className={`h-1 flex-1 rounded-full ${day.count > 0 ? 'bg-amber-500' : index === week.length - 1 ? 'bg-slate-300 dark:bg-zinc-600' : 'bg-slate-200 dark:bg-zinc-700'}`} />)}
  </span>;
}

function StatStrip({ data, loading, week, canQuestions, canLearning }) {
  const streak = data?.coding?.streak;
  const activeDays = week.filter((day) => day.count > 0).length;
  const rank = data?.ranking?.rank;
  const stats = [
    streak
      ? { key: 'streak', icon: Flame, iconClass: numeric(streak.current) > 0 ? 'text-amber-500' : 'text-slate-400', label: 'Day streak', value: <>{numeric(streak.current)}<span className="ml-1 text-[11px] font-medium tracking-normal text-slate-400 dark:text-zinc-500">best {numeric(streak.best)}</span></>, bars: true }
      : { key: 'active', icon: Flame, iconClass: activeDays > 0 ? 'text-amber-500' : 'text-slate-400', label: 'Active days', value: <>{activeDays}<span className="text-[12px] font-medium text-slate-400 dark:text-zinc-500">/7</span></>, bars: true },
    ...(canQuestions ? [{ key: 'solved', to: '/problems', icon: CheckCircle2, iconClass: 'text-[#43866a]', label: 'Solved', value: numeric(data?.coding?.totalSolved).toLocaleString() }] : []),
    ...(canLearning ? [{ key: 'topics', to: '/student/learning', icon: BookOpenCheck, iconClass: 'text-sky-600 dark:text-sky-400', label: 'Topics done', value: numeric(data?.learning?.completedTopics).toLocaleString() }] : []),
    { key: 'rank', to: '/student/profile', icon: Trophy, iconClass: 'text-[#b08c3e]', label: 'Rank', value: rank ? `#${numeric(rank).toLocaleString()}` : '—' },
  ];
  const columns = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[stats.length];
  return <div aria-label="Your progress at a glance" className={`grid ${columns} gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-slate-200/80 dark:border-zinc-800 dark:bg-zinc-800 lg:min-w-[440px]`}>
    {stats.map(({ key, bars, ...stat }) => <Stat key={key} {...stat} loading={loading}>{bars && !loading && <WeekBars week={week} />}</Stat>)}
  </div>;
}

function StartGuide({ canQuestions, canLearning }) {
  if (!canQuestions && !canLearning) return null;
  const cards = [
    canQuestions && { to: '/problems', title: 'Start coding', copy: 'Solve your first problem and open your streak.', cta: 'Explore questions', Art: CodingStartIllustration },
    canLearning && { to: '/student/learning', title: 'Start learning', copy: 'Watch a lesson and finish your first topic.', cta: 'Explore subjects', Art: LearningStartIllustration },
  ].filter(Boolean);
  return <section aria-labelledby="start-guide-title" className="mt-5">
    <h2 id="start-guide-title" className="mb-2.5 text-[13px] font-semibold text-slate-900 dark:text-zinc-100">Start here</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map(({ to, title, copy, cta, Art }) => <Link key={to} to={to} className={`group flex items-center gap-4 p-4 ${interactiveCard} ${focusRing}`}>
        <Art className="h-auto w-[104px] shrink-0" />
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-zinc-400">{copy}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 dark:text-sky-400">{cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </div>
      </Link>)}
    </div>
  </section>;
}

export default function GreetingHeader({ greeting, firstName, now, nudge, data, section, week, firstSession, canQuestions, canLearning, onRetry }) {
  return <header className="dashboard-greeting">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.035em] text-slate-950 dark:text-zinc-50 sm:text-[30px]">
          {greeting}, <span className="relative inline-block whitespace-nowrap text-sky-600 dark:text-sky-400">{firstName}<Swash /></span>
        </h1>
        {nudge && <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-400">{nudge}</p>}
      </div>
      {!firstSession && !section.error && <StatStrip data={data} loading={section.loading} week={week} canQuestions={canQuestions} canLearning={canLearning} />}
    </div>
    {section.error && <Unavailable className="mt-4" message="Your progress could not be loaded." onRetry={onRetry} />}
    {firstSession && <StartGuide canQuestions={canQuestions} canLearning={canLearning} />}
  </header>;
}
