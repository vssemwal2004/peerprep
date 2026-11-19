import { useMemo, useState } from 'react';
import PeerAvatar from './PeerAvatar';
import { MATE_COLOR, YOU_COLOR } from './circleViz';
import { useWidth } from './useWidth';
import { seriesValues } from './circleMath';
import { DIFFICULTY_THEME } from '../../utils/difficultyTheme';

// Charts of the comparison page. Series colours are fixed by role (circleViz): you, your Prep Mate,
// then up to two circle leaders. One y-axis per chart, recessive grid, hover for exact numbers and
// an sr-only table for every plotted chart.

const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const niceMax = (value) => {
  if (value <= 4) return 4;
  if (value <= 10) return 10;
  const step = value <= 50 ? 5 : value <= 200 ? 25 : 100;
  return Math.ceil(value / step) * step;
};

/** Smooth path through points (Catmull-Rom as cubic Béziers), clamped so it never dips below 0. */
function smoothPath(points, floorY) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [p0, p1, p2, p3] = [points[index - 1] || points[index], points[index], points[index + 1], points[index + 2] || points[index + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(floorY, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(floorY, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Performance comparison: grouped bars per week for each person, with a trend line through each
 * person's bars. `series` = [{ key, label, color, weekly, total }].
 */
export function PerformanceChart({ series, mode = 'week' }) {
  const [ref, width] = useWidth(720);
  const [hover, setHover] = useState(null);
  const weeks = series[0]?.weekly || [];
  const data = useMemo(() => series.map((item) => ({ ...item, values: seriesValues(item.weekly, item.total, mode) })), [series, mode]);
  const height = width < 480 ? 230 : 280;
  const pad = { top: 16, right: 10, bottom: 30, left: 34 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.flatMap((item) => item.values)));
  const group = plotW / Math.max(1, weeks.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(18, (group - 14) / Math.max(1, data.length) - gap));
  const clusterW = data.length * barW + (data.length - 1) * gap;
  const baseY = pad.top + plotH;
  const y = (value) => pad.top + plotH - (value / max) * plotH;
  const barX = (week, index) => pad.left + week * group + (group - clusterW) / 2 + index * (barW + gap);
  const barPath = (x, value) => {
    const top = y(value);
    const h = baseY - top;
    if (h <= 0.5) return null;
    const r = Math.min(4, h, barW / 2);
    return `M${x},${baseY} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${baseY} Z`;
  };
  const labelEvery = group < 60 ? 2 : 1;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max].filter((tick) => Number.isInteger(tick));
  const total = mode === 'total';

  return <div ref={ref} className="relative">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full overflow-visible" role="img"
      aria-label={`${total ? 'Problems solved so far' : 'Problems solved per week'}, last ${weeks.length} weeks: ${data.map((item) => item.label).join(', ')}`}>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-white/[0.08]" strokeDasharray={tick ? '3 6' : undefined} />
        <text x={pad.left - 9} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums dark:fill-zinc-500">{tick}</text>
      </g>)}
      {weeks.map((week, weekIndex) => <rect key={week.weekStart} x={pad.left + weekIndex * group} y={pad.top} width={group} height={plotH} rx="8"
        className={hover === weekIndex ? 'fill-slate-100/80 dark:fill-white/[0.04]' : 'fill-transparent'} />)}
      {data.map((item, seriesIndex) => <g key={item.key} opacity={total ? 0.28 : 0.95}>
        {item.values.map((value, weekIndex) => {
          const path = barPath(barX(weekIndex, seriesIndex), value);
          return path && <path key={weekIndex} d={path} fill={item.color} />;
        })}
      </g>)}
      {data.map((item, seriesIndex) => {
        const points = item.values.map((value, weekIndex) => [barX(weekIndex, seriesIndex) + barW / 2, y(value)]);
        return <g key={`${item.key}-line`}>
          <path d={smoothPath(points, baseY)} fill="none" stroke={item.color} strokeWidth={total ? 2.5 : 2} strokeLinecap="round" />
          {points.map(([px, py], weekIndex) => <circle key={weekIndex} cx={px} cy={py} r={hover === weekIndex ? 5 : 3.5} fill={item.color}
            className="stroke-white dark:stroke-[#242424]" strokeWidth="2" />)}
        </g>;
      })}
      {weeks.map((week, weekIndex) => {
        const last = weekIndex === weeks.length - 1;
        return (last || (weeks.length - 1 - weekIndex) % labelEvery === 0) && <text key={week.weekStart} x={pad.left + weekIndex * group + group / 2} y={height - 9} textAnchor="middle"
          className={`text-[11px] ${last ? 'fill-slate-800 font-semibold dark:fill-zinc-100' : 'fill-slate-400 dark:fill-zinc-500'}`}>{last ? 'This week' : weekLabel(week.weekStart)}</text>;
      })}
      {/* Hit targets: the whole week column. */}
      {weeks.map((week, weekIndex) => <rect key={`hit-${week.weekStart}`} x={pad.left + weekIndex * group} y={0} width={group} height={height} fill="transparent"
        onPointerEnter={() => setHover(weekIndex)} onPointerLeave={() => setHover(null)} />)}
    </svg>
    {hover !== null && weeks[hover] && <div role="tooltip" className="pointer-events-none absolute top-1 z-10 min-w-[168px] -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-[12px] shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#2c2c2c]/95"
      style={{ left: `${Math.min(86, Math.max(14, ((pad.left + hover * group + group / 2) / width) * 100))}%` }}>
      <p className="mb-1.5 font-semibold text-slate-900 dark:text-white">{hover === weeks.length - 1 ? 'This week' : `Week of ${weekLabel(weeks[hover].weekStart)}`}</p>
      {[...data].sort((a, b) => b.values[hover] - a.values[hover]).map((item) => <p key={item.key} className="flex items-center gap-2 py-0.5 text-slate-600 dark:text-zinc-300">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
        <b className="ml-auto pl-4 tabular-nums text-slate-900 dark:text-white">{item.values[hover]}</b>
      </p>)}
      <p className="mt-1 text-[10.5px] text-slate-400 dark:text-zinc-500">{total ? 'Solved so far' : 'Solved that week'}</p>
    </div>}
    <table className="sr-only" data-no-serial><caption>{total ? 'Problems solved so far, by week' : 'Problems solved per week'}</caption>
      <thead><tr><th>Week starting</th>{data.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
      <tbody>{weeks.map((week, weekIndex) => <tr key={week.weekStart}><td>{week.weekStart}</td>{data.map((item) => <td key={item.key}>{item.values[weekIndex]}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

/** "Questions solved" across the top of your circle: one horizontal bar per person. */
export function LeaderBars({ leaders = [], colorFor }) {
  const max = Math.max(1, ...leaders.map((row) => row.solved));
  return <ol className="space-y-3">
    {leaders.map((row) => {
      const color = colorFor(row);
      return <li key={row.id} className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-400 dark:text-zinc-500">{row.rank}</span>
        <PeerAvatar name={row.name} url={row.avatarUrl} size="sm" className="!rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">
            <span className="truncate">{row.isYou ? 'You' : row.name}</span>
            {row.isMate && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Comparing</span>}
          </p>
          <span className="block h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
            <span className="block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${(row.solved / max) * 100}%`, minWidth: row.solved ? 8 : 0, backgroundColor: color }} />
          </span>
        </div>
        <span className="w-10 shrink-0 text-right text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">{row.solved}</span>
      </li>;
    })}
  </ol>;
}

const LEVELS = ['Easy', 'Medium', 'Hard'];

/** Easy / Medium / Hard mix as one stacked bar per person (length = problems solved). */
export function DifficultyMix({ you, mate, mateName }) {
  const people = [{ key: 'you', label: 'You', color: YOU_COLOR, totals: you.totals, person: you }, { key: 'mate', label: mateName, color: MATE_COLOR, totals: mate.totals, person: mate }];
  const max = Math.max(1, you.totals.total, mate.totals.total);
  return <div>
    <div className="space-y-4">
      {people.map(({ key, label, color, totals, person }) => <div key={key}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[13px] font-medium text-slate-800 dark:text-zinc-100">
            <span className="rounded-full p-[2px]" style={{ backgroundColor: color }}><PeerAvatar name={person.name} url={person.avatarUrl} size="sm" className="!h-6 !w-6 !rounded-full ring-2 ring-white dark:ring-[#242424]" /></span>{label}
          </span>
          <span className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">{totals.total}</span>
        </div>
        <div className="flex h-4 gap-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="img"
          aria-label={`${label}: ${LEVELS.map((level) => `${totals[level.toLowerCase()]} ${level}`).join(', ')}`} style={{ width: '100%' }}>
          {LEVELS.map((level) => {
            const value = totals[level.toLowerCase()];
            return value ? <span key={level} title={`${level}: ${value}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: DIFFICULTY_THEME[level].color }} /> : null;
          })}
        </div>
      </div>)}
    </div>
    <dl className="mt-5 grid grid-cols-3 gap-2">
      {LEVELS.map((level) => {
        const key = level.toLowerCase();
        const lead = you.totals[key] - mate.totals[key];
        return <div key={level} className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]">
          <dt className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500 dark:text-zinc-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: DIFFICULTY_THEME[level].color }} />{level}</dt>
          <dd className="mt-1 text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">
            <span style={{ color: YOU_COLOR }}>{you.totals[key]}</span><span className="mx-1 text-[12px] font-medium text-slate-300 dark:text-zinc-600">vs</span><span style={{ color: MATE_COLOR }}>{mate.totals[key]}</span>
          </dd>
          <dd className="text-[11px] text-slate-500 dark:text-zinc-400">{lead === 0 ? 'Level' : lead > 0 ? `You +${lead}` : `${mateName} +${-lead}`}</dd>
        </div>;
      })}
    </dl>
  </div>;
}

/** Top topics, you to the left and your Prep Mate to the right of the topic name. */
export function TopicButterfly({ topics = [], mateName }) {
  if (!topics.length) return <p className="py-8 text-center text-[13px] text-slate-500 dark:text-zinc-400">No topics solved yet by either of you.</p>;
  const max = Math.max(1, ...topics.flatMap((topic) => [topic.you, topic.mate]));
  const bar = (value, color, side) => <div className={`flex min-w-0 flex-1 items-center gap-2 ${side === 'left' ? 'flex-row-reverse' : ''}`}>
    <span className={`h-3 rounded-full ${side === 'left' ? 'rounded-l-full' : ''}`} style={{ width: `${(value / max) * 100}%`, minWidth: value ? 6 : 0, backgroundColor: color }} aria-hidden="true" />
    <span className={`shrink-0 text-[12px] tabular-nums ${value ? 'font-semibold text-slate-800 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-500'}`}>{value}</span>
  </div>;
  return <div>
    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
      <span style={{ color: YOU_COLOR }}>You</span><span style={{ color: MATE_COLOR }}>{mateName}</span>
    </div>
    <ul className="space-y-2.5">
      {topics.map((topic) => <li key={topic.tag} className="flex items-center gap-3" aria-label={`${topic.tag}: you ${topic.you}, ${mateName} ${topic.mate}`}>
        {bar(topic.you, YOU_COLOR, 'left')}
        <span className="w-[92px] shrink-0 truncate rounded-full bg-slate-100 px-2 py-0.5 text-center text-[11.5px] font-medium text-slate-700 sm:w-[120px] dark:bg-white/[0.06] dark:text-zinc-200" title={topic.tag}>{topic.tag}</span>
        {bar(topic.mate, MATE_COLOR, 'right')}
      </li>)}
    </ul>
  </div>;
}

/** The last 30 days, one cell per day, for each of you; days you both practised are counted. */
export function ConsistencyGrid({ you, mate, mateName }) {
  const both = you.days30.filter((day, index) => day.active && mate.days30[index]?.active).length;
  const row = (label, person, color) => <div className="flex items-center gap-3">
    <span className="w-16 shrink-0 truncate text-[12px] font-medium text-slate-600 dark:text-zinc-300">{label}</span>
    <ol className="grid flex-1 grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]" aria-label={`${label}: practised on ${person.activeDays30} of the last 30 days`}>
      {person.days30.map((day) => <li key={day.day} title={`${new Date(`${day.day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${day.active ? 'practised' : 'no practice'}`}
        className={`aspect-square max-h-5 rounded-[4px] ${day.active ? '' : 'bg-slate-100 dark:bg-white/[0.06]'}`} style={day.active ? { backgroundColor: color } : undefined} />)}
    </ol>
    <span className="w-14 shrink-0 text-right text-[12px] text-slate-500 dark:text-zinc-400"><b className="text-[14px] tabular-nums text-slate-900 dark:text-white">{person.activeDays30}</b> days</span>
  </div>;
  return <div className="space-y-2.5">
    {row('You', you, YOU_COLOR)}
    {row(mateName, mate, MATE_COLOR)}
    <div className="flex items-center justify-between pl-[76px] pr-[68px] text-[10.5px] text-slate-400 dark:text-zinc-500"><span>30 days ago</span><span>Today</span></div>
    <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600 dark:bg-white/[0.04] dark:text-zinc-300">You both practised on <b className="text-slate-900 dark:text-white">{both}</b> of the same days.</p>
  </div>;
}
