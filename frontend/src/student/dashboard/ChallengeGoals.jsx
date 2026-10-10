import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Check, Code2, LockKeyhole } from 'lucide-react';
import { card, focusRing, Skeleton, textLink, Unavailable } from './ui';

const shortDate = (value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' }) : '';
};
const PERIODS = [['weekly', 'This week'], ['monthly', 'This month']];

/** Weekly and monthly goals with their rank-point reward. Badge editions live on the profile. */
export default function ChallengeGoals({ section, onRetry, canQuestions, canLearning }) {
  const tabsId = useId();
  const tabsRef = useRef(null);
  const [tab, setTab] = useState('weekly');
  const data = section?.data;
  const period = data?.periods?.find((entry) => entry.kind === tab);
  const permitted = (href) => href === '/problems' ? canQuestions : href === '/student/learning' && canLearning;
  const next = period?.goals?.find((goal) => !goal.completed && !goal.paused && permitted(goal.href));
  const rewards = data?.newAwards || [];
  const select = (target, focus = false) => {
    setTab(target);
    if (focus) tabsRef.current?.querySelector(`[data-period="${target}"]`)?.focus();
  };
  const onKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? 'weekly' : event.key === 'End' ? 'monthly' : tab === 'weekly' ? 'monthly' : 'weekly', true);
  };

  return <section aria-labelledby={`${tabsId}-title`} aria-busy={Boolean(section?.loading)} data-period-active={tab} className={`flex flex-col p-4 ${card}`}>
    <header className="flex items-center justify-between gap-3">
      <h2 id={`${tabsId}-title`} className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-100">Your challenges</h2>
      <div ref={tabsRef} role="tablist" aria-label="Challenge period" onKeyDown={onKeyDown} className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800">
        {PERIODS.map(([kind, label]) => <button key={kind} type="button" role="tab" data-period={kind} id={`${tabsId}-${kind}`} aria-controls={`${tabsId}-panel`} aria-selected={tab === kind} tabIndex={tab === kind ? 0 : -1} onClick={() => select(kind)}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${focusRing} ${tab === kind ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{label}</button>)}
      </div>
    </header>

    {section?.loading ? <Skeleton className="mt-3 h-[150px]" />
      : section?.error || !data ? <Unavailable className="mt-3" message="Progress unavailable" onRetry={onRetry} />
        : !period ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-[12px] text-slate-500 dark:bg-zinc-800/60 dark:text-zinc-400">Explore a subject or question to begin</p>
          : <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="mt-3 flex flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{period.title}</h3>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">Resets {shortDate(period.endsAt)}</p>
              </div>
              <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tabular-nums ${period.earned ? 'bg-[#43866a]/10 text-[#326f55] dark:text-[#83bd9e]' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'}`}>
                {period.earned ? <><Check className="-mt-0.5 mr-0.5 inline h-3 w-3" aria-hidden="true" />+{period.rewardPoints} added</> : <>+{period.rewardPoints} pts</>}
              </span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {period.goals.map((goal) => {
                const Icon = goal.completed ? Check : goal.paused ? LockKeyhole : goal.metric === 'coding' ? Code2 : goal.metric === 'learning' ? BookOpen : CalendarDays;
                const percent = Math.max(0, Math.min(100, Number(goal.progress) || 0));
                return <li key={goal.metric}>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${goal.completed ? 'text-[#43866a]' : 'text-slate-400 dark:text-zinc-500'}`} aria-hidden="true" />
                    <span className="flex-1 truncate text-slate-600 dark:text-zinc-300">{goal.label}</span>
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{goal.paused ? 'Paused' : `${goal.value}/${goal.target}`}</span>
                  </div>
                  <div className="ml-[22px] mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-label={`${tab} ${goal.label} progress`} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(goal.value, goal.target)}>
                    <span className={`block h-full rounded-full ${goal.completed ? 'bg-[#43866a]' : 'bg-sky-500'}`} style={{ width: `${percent}%` }} />
                  </div>
                </li>;
              })}
            </ul>
            <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-[11.5px]">
              {period.earned ? <span className="font-semibold text-[#326f55] dark:text-[#83bd9e]">All goals complete</span>
                : next ? <Link className={textLink} to={next.href}>Keep going<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                  : <span className="text-slate-400 dark:text-zinc-500">{period.paused ? 'Waiting for university access' : 'One practice day at a time'}</span>}
              {rewards.length > 0 && <p role="status" className="truncate font-semibold text-sky-700 dark:text-sky-300">{rewards.length === 1 ? 'Challenge reward earned' : `${rewards.length} challenge rewards earned`} · +{rewards.reduce((sum, award) => sum + (Number(award.rewardPoints) || 0), 0)} pts</p>}
            </div>
          </div>}
  </section>;
}
