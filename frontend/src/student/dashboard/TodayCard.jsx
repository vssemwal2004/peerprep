import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, RotateCw } from 'lucide-react';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { MISSION_MODULES } from '../engagement/missionAccess';
import { numeric } from './dashboardUtils';
import { card, DifficultyTag, focusRing, Skeleton } from './ui';

const ink = 'bg-slate-900 dark:bg-zinc-100';
const stubTitle = 'text-[13px] font-medium text-slate-500 dark:text-zinc-400';

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The week drawn as a chain: each day is a node and consecutive active days are linked, so the
 * streak is literally visible. Today is the larger node, sky when done and dashed while pending.
 */
function StreakChain({ week, loading }) {
  return <ol className="grid min-w-[250px] max-w-[440px] flex-1 grid-cols-7" aria-label={week.map((day) => `${day.fullLabel}: ${day.count ? 'active' : 'no activity'}`).join(', ')}>
    {week.map((day, index) => {
      const today = index === week.length - 1;
      const active = !loading && day.count > 0;
      const linked = active && index > 0 && !loading && week[index - 1].count > 0;
      const node = today
        ? active ? 'h-4 w-4 bg-sky-600 ring-4 ring-sky-100 dark:ring-sky-500/20' : 'h-4 w-4 border-2 border-dashed border-sky-400 bg-white dark:bg-[#242424]'
        : active ? `h-3 w-3 ${ink} ring-4 ring-white dark:ring-[#242424]` : 'h-3 w-3 border-2 border-[#d5d9e0] bg-white dark:border-white/15 dark:bg-[#242424]';
      return <li key={day.key} className="relative flex flex-col items-center gap-2" title={`${day.fullLabel}: ${day.count ? `${day.count} activit${day.count === 1 ? 'y' : 'ies'}` : 'no activity'}`}>
        {index > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-2 h-[2px] w-full -translate-y-1/2 ${linked ? today ? 'bg-sky-600' : ink : 'bg-[#e6e8ec] dark:bg-white/[0.08]'}`} />}
        <span className="relative z-10 flex h-4 items-center" aria-hidden="true"><span className={`block rounded-full transition-colors ${node}`} /></span>
        <span className={`text-[11px] ${today ? 'font-semibold text-sky-700 dark:text-sky-300' : 'text-slate-400 dark:text-zinc-500'}`} aria-hidden="true">{today ? 'Today' : day.label}</span>
      </li>;
    })}
  </ol>;
}

// One outline for every state, so the mark keeps its shape while its fill tells the story.
const FLAME = 'M20 2.5C23.2 10.4 34 16.6 34 30.2 34 39.8 27.6 46 20 46 12.4 46 6 39.8 6 30.2 6 23.4 9.6 18.8 12.8 15.2 13.4 20 15.4 23 18 24.2 16.4 16.4 17.4 8.6 20 2.5Z';
const CORE = 'M20.2 22.5C22.2 27.4 27 30.2 27 36 27 40.4 23.9 43 20 43 16.1 43 13 40.4 13 36.6 13 32.8 15.8 30.6 17.4 28.2 18.2 31 19.4 32.1 20.6 32.6 19.6 29.2 19.5 25.8 20.2 22.5Z';

/**
 * PeerPrep's streak mark. Burning: the streak is alive and today is done. Waiting: alive but today
 * still needs activity, so the flame is only half full. Cold: no streak yet.
 */
function StreakFlame({ state }) {
  const id = useId().replace(/:/g, '');
  return <svg viewBox="0 0 40 48" className={`h-[52px] w-[44px] shrink-0 overflow-visible ${state === 'burning' ? 'drop-shadow-[0_6px_10px_rgba(249,115,22,0.35)]' : ''}`} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#fbbf24" />
        <stop offset="0.55" stopColor="#f97316" />
        <stop offset="1" stopColor="#e11d48" />
      </linearGradient>
      <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#fffbeb" />
        <stop offset="1" stopColor="#fde68a" />
      </linearGradient>
      <clipPath id={`${id}-half`}><rect x="0" y="26" width="40" height="22" /></clipPath>
    </defs>
    {state === 'burning' && <g className="streak-flicker">
      <path d={FLAME} fill={`url(#${id}-outer)`} />
      <path d={CORE} fill={`url(#${id}-core)`} className="streak-core" />
      <path d="M26.5 14.5c1.6 1.4 2.6 3 3 4.8" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
    </g>}
    {state === 'waiting' && <>
      <path d={FLAME} fill="#fef3c7" clipPath={`url(#${id}-half)`} className="dark:fill-amber-500/25" />
      <path d={CORE} fill="#fbbf24" fillOpacity=".55" clipPath={`url(#${id}-half)`} />
      <path d={FLAME} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 26h24" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="2 2.5" strokeOpacity=".7" />
    </>}
    {state === 'cold' && <path d={FLAME} fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" strokeLinejoin="round" className="text-slate-300 dark:text-zinc-600" />}
  </svg>;
}

function StreakHeadline({ week, streak, loading }) {
  const current = numeric(streak?.current);
  const activeToday = week[week.length - 1]?.count > 0;
  const activeDays = week.filter((day) => day.count > 0).length;
  const lit = streak ? current > 0 : activeDays > 0;
  const flame = loading || !lit ? 'cold' : activeToday ? 'burning' : 'waiting';
  const note = !streak ? 'days active this week'
    : current === 0 ? 'Practise today to start one'
      : `${activeToday ? 'Done for today' : 'Keep it alive today'} · Best ${numeric(streak.best)}`;
  return <div className="flex shrink-0 items-center gap-3.5">
    <StreakFlame state={flame} />
    <div>
    <p className="flex items-baseline gap-2">
      <span className="text-[44px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-slate-950 dark:text-zinc-50">{loading ? '–' : streak ? current : activeDays}</span>
      <span className="text-[14px] font-medium text-slate-600 dark:text-zinc-300">{streak ? 'day streak' : 'of 7'}</span>
    </p>
    {!loading && <p className={`mt-2 text-[12.5px] ${streak && current > 0 && !activeToday ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-zinc-400'}`}>{note}</p>}
    </div>
  </div>;
}

function LoadFailed({ what, onRetry }) {
  return <div role="status" className="mt-2.5 flex items-center justify-between gap-3">
    <p className="text-[14px] font-medium text-slate-700 dark:text-zinc-200">Progress unavailable
      <span className="block text-[12.5px] font-normal text-slate-400 dark:text-zinc-500">{what} could not load right now.</span>
    </p>
    <button type="button" onClick={onRetry} className={`group inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e4e7ec] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-[#f6f7f9] dark:border-white/10 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-white/[0.05] ${focusRing}`}>
      <RotateCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" aria-hidden="true" />Retry
    </button>
  </div>;
}

function LegacyDaily({ section, onRetry }) {
  const now = useMinuteClock();
  const daily = section?.data?.daily;
  const deadline = new Date(daily?.endsAt || '').getTime();
  const minutes = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 60000)) : null;
  const done = Boolean(daily?.completed);
  return <section aria-labelledby="daily-title" aria-busy={Boolean(section?.loading)} className={done ? 'is-completed' : ''}>
    <div className="flex items-center justify-between gap-3">
      <h3 id="daily-title" className={stubTitle}>Daily challenge</h3>
      {daily?.problem && <p className="flex items-center gap-3 text-[12px] tabular-nums">
        {daily.rewardPoints ? <span className="font-semibold text-amber-600 dark:text-amber-300">+{daily.rewardPoints} pts</span> : null}
        {!done && minutes !== null && <span className="text-slate-500 dark:text-zinc-400">ends in {Math.floor(minutes / 60)}h {minutes % 60}m</span>}
      </p>}
    </div>
    {section?.loading ? <Skeleton className="mt-3 h-[52px]" />
      : section?.error || !section?.data ? <LoadFailed what="Today’s challenge" onRetry={onRetry} />
        : !daily?.problem ? <p className="mt-2 text-[14px] text-slate-600 dark:text-zinc-300">{daily?.enabled === false ? 'Daily challenge is paused' : 'New challenge coming soon'}</p>
          : <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold tracking-[-0.01em] text-slate-950 dark:text-zinc-50" title={daily.problem.title}>{daily.problem.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                <DifficultyTag difficulty={daily.problem.difficulty} />
                {done && <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />Completed today</span>}
              </div>
            </div>
            <Link to={daily.problem.href} className={`group inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors ${focusRing} ${done
              ? 'border border-[#e4e7ec] text-slate-700 hover:bg-[#f6f7f9] dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.05]'
              : 'bg-sky-600 text-white shadow-[0_6px_16px_-8px_rgba(2,132,199,0.7)] hover:bg-sky-700'}`}>
              {done ? 'Review solution' : 'Solve challenge'}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>}
  </section>;
}

/** Missions as numbered steps on the same chain motif; completed steps fill in. */
function Missions({ section }) {
  const { allowsModule, allowsPath } = useUniversityPolicy();
  const data = section?.data;
  const daily = data?.daily;
  const goals = (daily?.goals || []).filter((goal) => allowsModule(MISSION_MODULES[goal.domain]) && (!goal.href || allowsPath(goal.href, 'student')));
  const ordered = [...goals.filter((goal) => goal.slot === 'core'), ...goals.filter((goal) => goal.slot === 'choice')].slice(0, 3);
  const done = goals.filter((goal) => goal.completed).length;
  return <section aria-labelledby="missions-title" aria-busy={Boolean(section?.loading)} className={daily?.completed ? 'is-completed' : ''}>
    <div className="flex items-center justify-between gap-3">
      <h3 id="missions-title" className={stubTitle}>Today&apos;s missions</h3>
      {goals.length > 0 && <p className="flex items-center gap-3 text-[12px] tabular-nums">
        <span className="text-slate-500 dark:text-zinc-400">{done}/{goals.length} done</span>
        <span className="font-semibold text-amber-600 dark:text-amber-300">{daily.completed ? `${daily.rewardPoints} XP earned` : `+${daily.rewardPoints} XP`}</span>
      </p>}
    </div>
    {!goals.length
      ? <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{data?.enabled === false ? 'Missions are paused by your university.' : 'New missions appear when your university adds content you can open.'}</p>
      : <ol className="mt-2">
        {ordered.map((goal, index) => {
          const open = !goal.completed && goal.href && !goal.paused;
          const body = <>
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${goal.completed
              ? `${ink} text-white dark:text-zinc-900` : 'border-2 border-[#d5d9e0] bg-white text-slate-500 group-hover:border-sky-500 group-hover:text-sky-700 dark:border-white/15 dark:bg-[#242424] dark:text-zinc-400'}`} aria-hidden="true">
              {goal.completed ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : goal.paused ? <LockKeyhole className="h-3 w-3" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[13.5px] font-medium ${goal.completed ? 'text-slate-400 line-through decoration-slate-300 dark:text-zinc-500' : 'text-slate-800 dark:text-zinc-100'}`}>{goal.title || goal.label}</span>
              {(goal.minutes || goal.target > 1) && <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{[goal.minutes && `~${goal.minutes} min`, goal.target > 1 && `${goal.value}/${goal.target}`].filter(Boolean).join(' · ')}</span>}
            </span>
            {open && <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-sky-600 dark:text-zinc-600 dark:group-hover:text-sky-300" aria-hidden="true" />}
          </>;
          return <li key={goal.id} className="relative">
            {index < ordered.length - 1 && <span className="absolute bottom-[-6px] left-[11px] top-[30px] w-[2px] bg-[#e6e8ec] dark:bg-white/[0.08]" aria-hidden="true" />}
            {open
              ? <Link to={goal.href} className={`group -mx-2 flex items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[#f6f7f9] dark:hover:bg-white/[0.04] ${focusRing}`}>{body}</Link>
              : <div className="-mx-2 flex items-center gap-3 px-2 py-1.5">{body}</div>}
          </li>;
        })}
      </ol>}
  </section>;
}

function DailyPart({ section, onRetry }) {
  if (section?.data?.version === 2) {
    return section.loading ? <Skeleton className="h-[96px]" />
      : section.error ? <section aria-labelledby="missions-title"><h3 id="missions-title" className={stubTitle}>Today&apos;s missions</h3><LoadFailed what="Today’s missions" onRetry={onRetry} /></section>
        : <Missions section={section} />;
  }
  return <LegacyDaily section={section} onRetry={onRetry} />;
}

/** Fallback when there is no daily task: the first real practice suggestion, never an invented one. */
function NextUp({ problem }) {
  return <section aria-labelledby="today-next-title">
    <h3 id="today-next-title" className={stubTitle}>Try next</h3>
    <Link to={problem.href} className={`group mt-2 flex items-center justify-between gap-4 rounded-[10px] ${focusRing}`}>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-semibold tracking-[-0.01em] text-slate-950 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300">{problem.title}</span>
        <DifficultyTag difficulty={problem.difficulty} className="mt-1.5" />
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e4e7ec] px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors group-hover:border-sky-200 group-hover:bg-sky-50 group-hover:text-sky-700 dark:border-white/10 dark:text-zinc-200 dark:group-hover:bg-sky-500/10">
        Solve<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  </section>;
}

/** A dashed tear line with notches cut into both card edges: the day's task reads as a ticket stub. */
function TicketStub({ children }) {
  const notch = 'absolute -top-[10px] h-[18px] w-[18px] rounded-full border border-[#e9eaee] bg-[#f6f7f9] dark:border-white/[0.07] dark:bg-[#1a1a1a]';
  return <div className="relative -mx-5 mt-5 border-t-2 border-dashed border-[#e4e7ec] px-5 pt-4 dark:border-white/[0.08]">
    <span className={`${notch} -left-[10px] [clip-path:inset(0_0_0_50%)]`} aria-hidden="true" />
    <span className={`${notch} -right-[10px] [clip-path:inset(0_50%_0_0)]`} aria-hidden="true" />
    <div className="space-y-4">{children}</div>
  </div>;
}

export default function TodayCard({ now, week, streak, loading, engagement, showDaily, fallbackProblem, onRetry, className = '', style }) {
  const legacyEmpty = showDaily && !engagement?.loading && !engagement?.error && engagement?.data?.version !== 2 && !engagement?.data?.daily?.problem;
  return <section aria-labelledby="today-title" style={style} className={`flex flex-col p-5 ${card} ${className}`}>
    <header className="flex items-baseline justify-between gap-3">
      <h2 id="today-title" className="text-[13px] font-medium text-slate-500 dark:text-zinc-400">Today</h2>
      <time dateTime={now.toISOString().slice(0, 10)} className="text-[12.5px] tabular-nums text-slate-400 dark:text-zinc-500">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</time>
    </header>
    <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <StreakHeadline week={week} streak={streak} loading={loading} />
      <StreakChain week={week} loading={loading} />
    </div>
    {(showDaily || fallbackProblem) && <TicketStub>
      {showDaily && <DailyPart section={engagement} onRetry={onRetry} />}
      {(!showDaily || legacyEmpty) && fallbackProblem && <NextUp problem={fallbackProblem} />}
    </TicketStub>}
    {showDaily && <Link to="/student/quickprep" className={`mt-4 inline-flex items-center gap-1.5 self-start rounded text-xs font-semibold text-sky-600 dark:text-sky-400 ${focusRing}`}>Daily challenge & QuickPrep<ArrowRight size={14} /></Link>}
  </section>;
}
