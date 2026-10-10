import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Flame } from 'lucide-react';

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy', stroke: '#43866a', text: 'text-[#326f55] dark:text-[#83bd9e]' },
  { key: 'medium', label: 'Medium', stroke: '#b08c3e', text: 'text-[#8e6e2a] dark:text-[#d5b977]' },
  { key: 'hard', label: 'Hard', stroke: '#88465b', text: 'text-[#88465b] dark:text-[#cf91a6]' },
];

function count(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function availableCount(value, solved) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(count(numeric), solved) : null;
}

function SolvedGauge({ solved, available, values, difficulty, loading, compact }) {
  const size = compact ? 116 : 124;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const filled = available > 0 ? arcLength * Math.min(1, solved / available) : 0;
  const difficultyIndex = DIFFICULTIES.findIndex((item) => item.key === difficulty);
  const visibleValues = difficultyIndex < 0 ? values : values.map((value, index) => (index === difficultyIndex ? value : 0));
  const bucketTotal = visibleValues.reduce((total, value) => total + value, 0);
  let cursor = 0;
  const label = difficultyIndex < 0 ? 'All problems' : `${DIFFICULTIES[difficultyIndex].label} problems`;
  const accessibleValue = loading
    ? 'Loading coding progress'
    : `${label}: ${solved} solved${available === null ? ', available total unavailable' : ` out of ${available}`}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={accessibleValue}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full rotate-[135deg]" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`} className="stroke-slate-100 dark:stroke-zinc-800" />
        {!loading && visibleValues.map((value, index) => {
          if (!value || !bucketTotal || filled <= 0) return null;
          const length = filled * (value / bucketTotal);
          const offset = cursor;
          cursor += length;
          return (
            <circle key={DIFFICULTIES[index].key} cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={DIFFICULTIES[index].stroke} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${Math.max(0, length - (bucketTotal === value ? 0 : Math.min(3, length / 2)))} ${circumference}`}
              strokeDashoffset={-offset} className="transition-[stroke-dasharray,stroke-dashoffset] duration-300 motion-reduce:transition-none" />
          );
        })}
        {!loading && !bucketTotal && filled > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#475569" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-1 text-center">
        <p className="leading-none tabular-nums">
          <span className="text-[27px] font-semibold tracking-[-0.05em] text-slate-950 dark:text-zinc-50">{loading ? '—' : solved}</span>
          <span className="ml-0.5 text-xs text-slate-400 dark:text-zinc-500">/{loading || available === null ? '—' : available}</span>
        </p>
        <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-zinc-400">{difficultyIndex < 0 ? 'Total solved' : `${DIFFICULTIES[difficultyIndex].label} solved`}</p>
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

/** Shared dashboard/profile card. Preview with hover/focus, or select a difficulty to keep it. */
export default function CodingProgress({
  totalSolved = 0,
  totalProblems,
  easySolved = 0,
  mediumSolved = 0,
  hardSolved = 0,
  totalsByDifficulty,
  attemptedProblems,
  streak = {},
  activity = {},
  className = '',
  description = 'A clear view of your coding practice.',
  action,
  compact = false,
  loading = false,
  showActivity = true,
}) {
  const headingId = useId();
  const [selected, setSelected] = useState('all');
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const active = hovered || focused || selected;
  const values = [easySolved, mediumSolved, hardSolved].map(count);
  const solvedTotal = count(totalSolved);
  const totals = DIFFICULTIES.map((item, index) => availableCount(totalsByDifficulty?.[item.key], values[index]));
  const availableTotal = availableCount(totalProblems, solvedTotal);
  const activeIndex = DIFFICULTIES.findIndex((item) => item.key === active);
  const solved = activeIndex < 0 ? solvedTotal : values[activeIndex];
  const available = activeIndex < 0 ? availableTotal : totals[activeIndex];
  const attempting = attemptedProblems === null || attemptedProblems === undefined ? 0 : Math.max(0, count(attemptedProblems) - solvedTotal);
  const week = lastSevenDays(activity);
  const activeThisWeek = week.filter((day) => day.active).length;
  const currentStreak = count(streak?.current);
  const bestStreak = count(streak?.best);
  const buttonBase = 'rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900';
  const choose = (key) => {
    setSelected(key);
    setHovered(null);
    setFocused(key);
  };

  return (
    <section aria-labelledby={headingId} aria-busy={loading} className={`rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.025)] dark:border-zinc-800 dark:bg-[#242424] ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-[14px] font-semibold tracking-tight text-slate-950 dark:text-zinc-50">Coding progress</h2>
          {description ? <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">{description}</p> : null}
        </div>
        {action === undefined ? (
          <Link to="/problems" className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded text-[11px] font-semibold text-sky-600 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300">
            Practice <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : action}
      </header>

      <div className={`flex items-center gap-3 ${compact ? 'mt-3' : 'mt-4'}`}>
        <SolvedGauge solved={solved} available={available} values={values} difficulty={active} loading={loading} compact={compact} />
        <div className="min-w-0 flex-1" role="group" aria-label="Coding difficulty filter"
          onMouseLeave={() => setHovered(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setSelected('all');
              setFocused(null);
              setHovered(null);
            }
          }}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <button type="button" disabled={loading} aria-pressed={selected === 'all'}
              onMouseEnter={() => setHovered('all')} onFocus={() => setFocused('all')} onBlur={() => setFocused(null)} onClick={() => choose('all')}
              className={`px-1.5 py-1 text-[10px] font-semibold ${buttonBase} ${active === 'all' ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>
              All questions
            </button>
            <span className={`${compact ? 'sr-only' : 'text-[9px] whitespace-nowrap text-slate-400 dark:text-zinc-500'}`}>Solved / total</span>
          </div>
          {DIFFICULTIES.map((item, index) => (
            <button key={item.key} type="button" disabled={loading} aria-pressed={selected === item.key}
              aria-label={`${item.label}: ${values[index]} solved${totals[index] === null ? '' : ` out of ${totals[index]} questions`}`}
              onMouseEnter={() => setHovered(item.key)} onFocus={() => setFocused(item.key)} onBlur={() => setFocused(null)} onClick={() => choose(item.key)}
              className={`flex w-full items-center justify-between gap-1.5 px-1.5 py-2 text-[11px] ${buttonBase} ${active === item.key ? 'bg-sky-50/80 dark:bg-sky-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/70'}`}>
              <span className={`flex items-center gap-1.5 font-medium ${item.text}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.stroke }} aria-hidden="true" />{item.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{loading ? '—' : values[index]}<span className="ml-0.5 font-normal text-slate-400 dark:text-zinc-500"> / {loading || totals[index] === null ? '—' : totals[index]}</span></span>
            </button>
          ))}
        </div>
      </div>

      {showActivity ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <Flame className={`h-4 w-4 ${currentStreak > 0 ? 'text-[#b08c3e]' : 'text-slate-400 dark:text-zinc-500'}`} aria-hidden="true" />
          <span><strong className="font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{loading ? '—' : currentStreak}</strong> day streak</span>
          <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
          <span>Best <strong className="font-medium tabular-nums text-slate-700 dark:text-zinc-300">{loading ? '—' : bestStreak}</strong></span>
        </div>
        <div className="flex items-center gap-1" role="img" aria-label={loading ? 'Loading weekly activity' : `Active ${activeThisWeek} of the last 7 days`}>
          {week.map((day) => (
            <span key={day.key} title={`${day.full}: ${day.active ? 'active' : 'no activity'}`}
              className={`h-1.5 w-3 rounded-full ${!loading && day.active ? 'bg-[#43866a]' : 'bg-slate-100 dark:bg-zinc-800'}`} />
          ))}
        </div>
      </div> : null}
      {attempting > 0 && !loading ? <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400">{attempting} {attempting === 1 ? 'question' : 'questions'} attempted and still to solve.</p> : null}
    </section>
  );
}
