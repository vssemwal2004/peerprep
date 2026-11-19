import { useState } from 'react';
import { MATE_COLOR, YOU_COLOR } from './circleViz';
import { useWidth } from './useWidth';

// The two simple charts of the comparison page. Two series only: you (sky) and your Prep Mate (amber).

/**
 * One measure as two bars, you over your Prep Mate, scaled to the larger of the two. The bigger
 * number is bold, so who leads is clear without reading the bars.
 */
export function PairedBars({ label, you = 0, mate = 0, mateName, unit = '' }) {
  const max = Math.max(1, you, mate);
  const bar = (value, color, name, lead) => <div className="flex items-center gap-2.5">
    <span className="w-16 shrink-0 truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{name}</span>
    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
      <span className="block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${(value / max) * 100}%`, minWidth: value ? 6 : 0, backgroundColor: color }} />
    </span>
    <span className={`w-12 shrink-0 text-right text-[13px] tabular-nums ${lead ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}>{value}{unit}</span>
  </div>;
  return <div className="py-3" role="group" aria-label={`${label}: you ${you}${unit}, ${mateName} ${mate}${unit}`}>
    <p className="mb-2 text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{label}</p>
    <div className="space-y-1.5">
      {bar(you, YOU_COLOR, 'You', you > mate)}
      {bar(mate, MATE_COLOR, mateName, mate > you)}
    </div>
  </div>;
}

const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const niceMax = (value) => (value <= 4 ? 4 : value <= 10 ? 10 : Math.ceil(value / 5) * 5);

/** Problems solved per week, last 8 weeks: a pair of bars per week, hover for the numbers. */
export function WeeklyBars({ you = [], mate = [], mateName }) {
  const [ref, width] = useWidth(640);
  const [hover, setHover] = useState(null);
  const weeks = you.map((row, index) => ({ weekStart: row.weekStart, you: row.solved, mate: mate[index]?.solved || 0 }));
  const height = 210;
  const pad = { top: 12, right: 8, bottom: 26, left: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...weeks.flatMap((week) => [week.you, week.mate])));
  const group = plotW / Math.max(1, weeks.length);
  const barW = Math.max(5, Math.min(20, (group - 16) / 2));
  const y = (value) => pad.top + plotH - (value / max) * plotH;
  const bar = (x, value) => {
    const top = y(value);
    const h = pad.top + plotH - top;
    if (h <= 0) return null;
    const r = Math.min(4, h, barW / 2);
    return `M${x},${pad.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.top + plotH} Z`;
  };
  const labelEvery = group < 56 ? 2 : 1;
  const active = hover !== null ? weeks[hover] : null;
  return <div ref={ref} className="relative">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" role="img" aria-label={`Problems solved per week, you and ${mateName}`}>
      {[0, max / 2, max].map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-white/[0.08]" strokeDasharray={tick ? '3 5' : undefined} />
        <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px] dark:fill-zinc-500">{Math.round(tick)}</text>
      </g>)}
      {weeks.map((week, index) => {
        const x0 = pad.left + index * group + (group - (barW * 2 + 3)) / 2;
        const youPath = bar(x0, week.you);
        const matePath = bar(x0 + barW + 3, week.mate);
        const last = index === weeks.length - 1;
        return <g key={week.weekStart} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
          <rect x={pad.left + index * group} y={pad.top} width={group} height={plotH} className={hover === index ? 'fill-slate-100 dark:fill-white/[0.04]' : 'fill-transparent'} />
          {youPath && <path d={youPath} fill={YOU_COLOR} />}
          {matePath && <path d={matePath} fill={MATE_COLOR} />}
          {(last || (weeks.length - 1 - index) % labelEvery === 0) && <text x={pad.left + index * group + group / 2} y={height - 8} textAnchor="middle"
            className={`text-[11px] ${last ? 'fill-slate-700 font-semibold dark:fill-zinc-200' : 'fill-slate-400 dark:fill-zinc-500'}`}>{last ? 'This week' : weekLabel(week.weekStart)}</text>}
        </g>;
      })}
    </svg>
    {active && <div role="tooltip" className="pointer-events-none absolute top-0 z-10 min-w-[140px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-lg dark:border-white/10 dark:bg-[#2a2a2a]"
      style={{ left: `${Math.min(88, Math.max(12, ((pad.left + hover * group + group / 2) / width) * 100))}%` }}>
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{hover === weeks.length - 1 ? 'This week' : `Week of ${weekLabel(active.weekStart)}`}</p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: YOU_COLOR }} />You<b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{active.you}</b></p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: MATE_COLOR }} />{mateName}<b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{active.mate}</b></p>
    </div>}
    <table className="sr-only" data-no-serial><caption>Problems solved per week</caption><thead><tr><th>Week starting</th><th>You</th><th>{mateName}</th></tr></thead>
      <tbody>{weeks.map((week) => <tr key={week.weekStart}><td>{week.weekStart}</td><td>{week.you}</td><td>{week.mate}</td></tr>)}</tbody></table>
  </div>;
}
