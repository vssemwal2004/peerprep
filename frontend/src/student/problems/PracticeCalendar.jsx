import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import DailyCodingChallenge from '../DailyCodingChallenge';
import usePracticeCalendar, { istDayKey, utcDayKey } from './usePracticeCalendar';
import { card, DIFFICULTY, focusRing } from './problemsUi';

const MONTHS_BACK = 11;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const LEVELS = [
  '',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  'bg-emerald-300 text-emerald-950 dark:bg-emerald-500/45 dark:text-white',
  'bg-emerald-500 text-white dark:bg-emerald-500',
];
const level = (count) => (count >= 4 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0);
const keyOf = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const shiftKey = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const weekdayOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** Consecutive active days ending today, or yesterday while today is still open. */
function currentStreak(activity, todayKey) {
  let cursor = activity[todayKey] > 0 ? todayKey : shiftKey(todayKey, -1);
  let streak = 0;
  while (activity[cursor] > 0 && streak < 400) { streak += 1; cursor = shiftKey(cursor, -1); }
  return streak;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(target, now) {
  const minutes = Math.ceil((new Date(target).getTime() - now.getTime()) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : null;
}

function DayCell({ dayKey, label, count, planDone, isToday, future }) {
  const text = `${new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${count ? `${count} ${count === 1 ? 'activity' : 'activities'}` : 'no activity'}${planDone ? ', daily plan complete' : ''}`;
  return <li title={text} aria-current={isToday ? 'date' : undefined}
    className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11.5px] tabular-nums transition-colors ${count ? LEVELS[level(count)] : future ? 'text-slate-300 dark:text-zinc-600' : 'text-slate-500 dark:text-zinc-400'} ${isToday ? 'font-semibold ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-[#232325]' : ''}`}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true">{label}</span>
    {planDone && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#232325]" aria-hidden="true" />}
  </li>;
}

function TodayRows({ daily, plan, now }) {
  const problem = daily?.enabled ? daily.challenge : null;
  const goals = (plan?.goals || []).filter((goal) => goal.slot !== 'stretch');
  const doneGoals = goals.filter((goal) => goal.completed).length;
  const resetsIn = countdown(daily?.nextResetAt || plan?.endsAt, now);
  const difficulty = DIFFICULTY[problem?.difficulty];
  if (!problem && !goals.length) {
    return <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0f1f4] pt-3 text-[12px] text-slate-500 dark:border-white/[0.06] dark:text-zinc-400">
      <span>Any problem you solve counts today.</span>
      <DailyCodingChallenge variant="header" className="!h-auto !px-0 hover:!bg-transparent" />
    </div>;
  }
  return <div className="mt-3 space-y-2 border-t border-[#f0f1f4] pt-3 dark:border-white/[0.06]">
    {problem && <Link to={problem.href || `/problems/${problem._id}`} className={`group flex items-center gap-3 rounded-xl ${focusRing}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Problem of the day{resetsIn ? ` · resets in ${resetsIn}` : ''}</span>
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-slate-900 group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300" title={problem.title}>{problem.title}</span>
          {difficulty && <span className={`shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ring-1 ring-inset ${difficulty.pill}`}>{difficulty.short}</span>}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[10px] bg-sky-600 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors group-hover:bg-sky-700">
        Solve<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>}
    {goals.length > 0 && <Link to="/student/challenges?period=daily" className={`group flex items-center gap-3 rounded-lg ${focusRing}`}>
      <span className="shrink-0 text-[12px] font-medium text-slate-700 group-hover:text-amber-700 dark:text-zinc-200 dark:group-hover:text-amber-300">Today’s plan</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" aria-hidden="true">
        <span className="block h-full rounded-full bg-amber-500" style={{ width: `${plan.completed ? 100 : Math.round((doneGoals / goals.length) * 100)}%` }} />
      </span>
      <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">{plan.completed ? 'Complete' : `${doneGoals}/${goals.length} done`}</span>
    </Link>}
  </div>;
}

/**
 * Compact by default: streak, this week and today. The month view opens on request so the topic
 * list below stays in view.
 */
export default function PracticeCalendar() {
  const data = usePracticeCalendar();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const [monthsBack, setMonthsBack] = useState(0);
  const todayKey = data.verified ? istDayKey(now) : utcDayKey(now);
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  const view = new Date(Date.UTC(todayYear, todayMonth - 1 - monthsBack, 1));
  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const summary = useMemo(() => {
    const keys = Array.from({ length: daysInMonth }, (_, index) => keyOf(year, month, index + 1));
    return { activeDays: keys.filter((key) => data.activity[key] > 0).length, total: keys.reduce((sum, key) => sum + (Number(data.activity[key]) || 0), 0), plansDone: keys.filter((key) => data.plans[key]).length };
  }, [data.activity, data.plans, daysInMonth, month, year]);
  const streak = useMemo(() => currentStreak(data.activity, todayKey), [data.activity, todayKey]);
  const week = Array.from({ length: 7 }, (_, index) => shiftKey(todayKey, index - 6));
  const cellProps = (key) => ({ dayKey: key, count: Number(data.activity[key]) || 0, planDone: Boolean(data.plans[key]), isToday: key === todayKey, future: key > todayKey });
  const navButton = `flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-[#f3f4f6] disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-white/[0.06] ${focusRing}`;
  const toggle = () => { setExpanded((value) => !value); setMonthsBack(0); };

  return <section aria-labelledby="practice-calendar-title" aria-busy={data.loading} className={`p-4 ${card}`}>
    <header className="flex items-center justify-between gap-3">
      <h2 id="practice-calendar-title" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/15" aria-hidden="true"><CalendarDays className="h-4 w-4" /></span>
        Practice calendar
      </h2>
      <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls="practice-calendar-days"
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-600 hover:bg-[#f3f4f6] dark:text-zinc-300 dark:hover:bg-white/[0.06] ${focusRing}`}>
        {expanded ? 'Week' : 'Month'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </header>

    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
      <span className="inline-flex items-center gap-1"><Flame className={`h-3.5 w-3.5 ${streak ? 'text-orange-500' : 'text-slate-300 dark:text-zinc-600'}`} aria-hidden="true" />
        <strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{data.loading ? '–' : streak}</strong> day streak</span>
      <span><strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{data.loading ? '–' : summary.activeDays}</strong> active {expanded && monthsBack ? 'that month' : 'this month'}</span>
      {data.verified && <span><strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{data.loading ? '–' : summary.plansDone}</strong> {summary.plansDone === 1 ? 'plan' : 'plans'}</span>}
    </p>

    <div id="practice-calendar-days" className="mt-3">
      {expanded ? <>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100" aria-live="polite">{monthLabel}</p>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => setMonthsBack((value) => Math.min(MONTHS_BACK, value + 1))} disabled={monthsBack >= MONTHS_BACK} aria-label="Previous month" className={navButton}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setMonthsBack((value) => Math.max(0, value - 1))} disabled={monthsBack === 0} aria-label="Next month" className={navButton}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 dark:text-zinc-500" aria-hidden="true">{WEEKDAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <ol className="mt-1 grid grid-cols-7 gap-1" aria-label={`${monthLabel} practice activity`}>
          {Array.from({ length: view.getUTCDay() }, (_, index) => <li key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: daysInMonth }, (_, index) => { const key = keyOf(year, month, index + 1); return <DayCell key={key} label={index + 1} {...cellProps(key)} />; })}
        </ol>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-zinc-500" aria-hidden="true">
          <span className="inline-flex items-center gap-1">Less{LEVELS.slice(1).map((tone) => <span key={tone} className={`h-3 w-3 rounded ${tone.split(' ').filter((name) => name.startsWith('bg-') || name.startsWith('dark:bg-')).join(' ')}`} />)}More</span>
          {data.verified && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Plan done</span>}
        </div>
      </> : <>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 dark:text-zinc-500" aria-hidden="true">{week.map((key) => <span key={key}>{WEEKDAYS[weekdayOf(key)]}</span>)}</div>
        <ol className="mt-1 grid grid-cols-7 gap-1" aria-label="Last 7 days of practice">
          {week.map((key) => <DayCell key={key} label={Number(key.slice(8))} {...cellProps(key)} />)}
        </ol>
      </>}
    </div>
    {data.error && <p className="mt-2 text-[12px] text-slate-500 dark:text-zinc-400" role="status">Your practice history could not be loaded right now.</p>}

    {(!expanded || monthsBack === 0) && <TodayRows daily={data.daily} plan={data.todayPlan} now={now} />}
  </section>;
}
