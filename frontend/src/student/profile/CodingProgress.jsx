import { Code2, Flame, Trophy } from 'lucide-react';
import { Card, CardLink } from './ui';
import { formatPercent } from './format';

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', stroke: '#14b8a6', text: 'text-teal-600 dark:text-teal-400', box: 'bg-teal-50/70 dark:bg-teal-500/5' },
  { key: 'medium', label: 'Medium', stroke: '#f59e0b', text: 'text-amber-600 dark:text-amber-400', box: 'bg-amber-50/70 dark:bg-amber-500/5' },
  { key: 'hard', label: 'Hard', stroke: '#f43f5e', text: 'text-rose-600 dark:text-rose-400', box: 'bg-rose-50/70 dark:bg-rose-500/5' },
];

const ARC_DEGREES = 270;

/**
 * 270° gauge split into Easy/Medium/Hard segments (share of solved problems), LeetCode-style.
 * Center shows solved / available and how many problems are attempted but not yet solved.
 */
function SolvedGauge({ totalSolved, totalProblems, values, attempting }) {
  const size = 112;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (ARC_DEGREES / 360);
  const denominator = Math.max(totalProblems, totalSolved, 1);
  const filled = arcLength * Math.min(1, totalSolved / denominator);
  const gap = values.filter((value) => value > 0).length > 1 ? 4 : 0;
  let cursor = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${totalSolved} of ${denominator} problems solved`}>
      {/* rotate so the 90° opening sits at the bottom */}
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full rotate-[135deg]" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          className="stroke-slate-100 dark:stroke-zinc-800"
        />
        {DIFFICULTIES.map((item, index) => {
          const value = values[index];
          if (!value || !totalSolved) return null;
          const length = filled * (value / totalSolved);
          const node = (
            <circle
              key={item.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.stroke}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(length - gap, 1)} ${circumference}`}
              strokeDashoffset={-cursor}
              className="transition-[stroke-dasharray] duration-700"
            />
          );
          cursor += length;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="leading-none">
          <span className="text-[22px] font-semibold tracking-tight tabular-nums text-slate-900 dark:text-zinc-50">{totalSolved}</span>
          <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">/{denominator}</span>
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Solved</p>
        {attempting > 0 ? (
          <p className="mt-0.5 text-[10px] text-slate-400 dark:text-zinc-500">{attempting} attempting</p>
        ) : null}
      </div>
    </div>
  );
}

function lastSevenDays(activity) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (6 - index)));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      active: Number(activity?.[key] || 0) > 0,
      full: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
}

export default function CodingProgress({
  totalSolved,
  totalProblems,
  easySolved,
  mediumSolved,
  hardSolved,
  attemptedProblems,
  streak,
  activity,
  className = '',
  description = 'Solved problems and your streak',
  action = <CardLink to="/problems">Practice</CardLink>,
}) {
  const values = [easySolved, mediumSolved, hardSolved];
  const attempting = Number.isFinite(attemptedProblems) ? Math.max(0, attemptedProblems - totalSolved) : 0;
  const week = lastSevenDays(activity);
  const activeThisWeek = week.filter((day) => day.active).length;

  return (
    <Card
      id="coding-progress"
      title="Coding Progress"
      description={description}
      icon={<Code2 className="h-4 w-4" />}
      action={action}
      className={className}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <SolvedGauge totalSolved={totalSolved} totalProblems={totalProblems} values={values} attempting={attempting} />

        <ul className="grid w-full flex-1 gap-1.5">
          {DIFFICULTIES.map((item, index) => (
            <li key={item.key} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${item.box}`}>
              <span className={`text-xs font-semibold ${item.text}`}>{item.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-zinc-100">
                {values[index]}
                {totalSolved > 0 ? (
                  <span className="ml-1 text-[11px] font-normal text-slate-400 dark:text-zinc-500">
                    {formatPercent((values[index] / totalSolved) * 100, 0)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Streak lives here (no separate section) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Flame className={`h-4 w-4 ${streak.current > 0 ? 'text-orange-500' : 'text-slate-300 dark:text-zinc-600'}`} aria-hidden="true" />
            <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{streak.current}</span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">day streak</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{streak.best}</span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">best</span>
          </span>
        </div>
        <div className="flex items-center gap-1" role="img" aria-label={`Active ${activeThisWeek} of the last 7 days`}>
          {week.map((day) => (
            <span
              key={day.key}
              title={`${day.full}: ${day.active ? 'active' : 'no activity'}`}
              className={`h-2 w-4 rounded-full ${day.active ? 'bg-orange-400' : 'bg-slate-200 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
