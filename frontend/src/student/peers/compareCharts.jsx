import { useMemo, useState } from 'react';
import { MATE_COLOR, YOU_COLOR } from './circleViz';
import { useWidth } from './useWidth';

// Charts for the Prep Mates comparison page. Two series only: you (sky) and your Prep Mate (amber).
// Every chart has a legend or direct labels, a hover read-out and a screen-reader table.

const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
function niceMax(value) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 2.5, 5, 10]) if (factor * step >= value) return factor * step;
  return value;
}

/** Smooth path through points (monotone-ish cubic, never overshoots the baseline). */
function smoothPath(points) {
  if (!points.length) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const mid = (x1 - x0) / 2;
    d += ` C${x0 + mid},${y0} ${x1 - mid},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Problems solved per week (or running total) for both of you: smooth areas with a crosshair. */
export function MomentumChart({ you = [], mate = [], mateName, mode = 'weekly' }) {
  const [ref, width] = useWidth(640);
  const [hover, setHover] = useState(null);
  const series = useMemo(() => {
    let a = 0;
    let b = 0;
    return you.map((row, index) => {
      const youValue = row.solved;
      const mateValue = mate[index]?.solved || 0;
      a += youValue;
      b += mateValue;
      return { weekStart: row.weekStart, you: mode === 'cumulative' ? a : youValue, mate: mode === 'cumulative' ? b : mateValue };
    });
  }, [you, mate, mode]);
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((row) => [row.you, row.mate])));
  const x = (index) => pad.left + (series.length > 1 ? (index / (series.length - 1)) * plotW : plotW / 2);
  const y = (value) => pad.top + plotH - (value / max) * plotH;
  const line = (key) => smoothPath(series.map((row, index) => [x(index), y(row[key])]));
  const area = (key) => `${line(key)} L${x(series.length - 1)},${pad.top + plotH} L${x(0)},${pad.top + plotH} Z`;
  const step = plotW / Math.max(1, series.length - 1);
  const labelEvery = step < 52 ? 2 : 1;
  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    setHover(Math.max(0, Math.min(series.length - 1, Math.round((px - pad.left) / step))));
  };
  const active = hover !== null ? series[hover] : null;
  return <div ref={ref} className="relative">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full touch-none" role="img"
      aria-label={`Problems solved ${mode === 'cumulative' ? 'in total' : 'per week'}, you and ${mateName}, last ${series.length} weeks`}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="pm-you-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={YOU_COLOR} stopOpacity="0.32" /><stop offset="100%" stopColor={YOU_COLOR} stopOpacity="0" /></linearGradient>
        <linearGradient id="pm-mate-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={MATE_COLOR} stopOpacity="0.26" /><stop offset="100%" stopColor={MATE_COLOR} stopOpacity="0" /></linearGradient>
      </defs>
      {[0, max / 2, max].map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-white/[0.08]" strokeDasharray={tick ? '3 5' : undefined} />
        <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px] dark:fill-zinc-500">{Math.round(tick)}</text>
      </g>)}
      <path d={area('mate')} fill="url(#pm-mate-fill)" />
      <path d={area('you')} fill="url(#pm-you-fill)" />
      <path d={line('mate')} fill="none" stroke={MATE_COLOR} strokeWidth="2.25" strokeLinecap="round" />
      <path d={line('you')} fill="none" stroke={YOU_COLOR} strokeWidth="2.25" strokeLinecap="round" />
      {series.map((row, index) => (index === series.length - 1 || (series.length - 1 - index) % labelEvery === 0) && <text key={row.weekStart} x={x(index)} y={height - 8} textAnchor="middle"
        className={`text-[11px] ${index === series.length - 1 ? 'fill-slate-700 font-semibold dark:fill-zinc-200' : 'fill-slate-400 dark:fill-zinc-500'}`}>{index === series.length - 1 ? 'Now' : weekLabel(row.weekStart)}</text>)}
      {active && <g pointerEvents="none">
        <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} className="stroke-slate-300 dark:stroke-white/20" />
        <circle cx={x(hover)} cy={y(active.mate)} r="5" fill={MATE_COLOR} className="stroke-white dark:stroke-[#262626]" strokeWidth="2" />
        <circle cx={x(hover)} cy={y(active.you)} r="5" fill={YOU_COLOR} className="stroke-white dark:stroke-[#262626]" strokeWidth="2" />
      </g>}
      {/* Direct labels at the line ends. */}
      {!active && series.length > 0 && <g pointerEvents="none" className="text-[11px] font-semibold">
        <circle cx={x(series.length - 1)} cy={y(series.at(-1).you)} r="4" fill={YOU_COLOR} />
        <circle cx={x(series.length - 1)} cy={y(series.at(-1).mate)} r="4" fill={MATE_COLOR} />
      </g>}
    </svg>
    {active && <div role="tooltip" className="pointer-events-none absolute top-1 z-10 min-w-[150px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[12px] shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#262626]/95"
      style={{ left: `${Math.min(88, Math.max(12, (x(hover) / width) * 100))}%` }}>
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{hover === series.length - 1 ? 'This week' : `Week of ${weekLabel(active.weekStart)}`}</p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: YOU_COLOR }} />You<b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{active.you}</b></p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: MATE_COLOR }} />{mateName}<b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{active.mate}</b></p>
    </div>}
    <table className="sr-only" data-no-serial><caption>Problems solved per week</caption><thead><tr><th>Week starting</th><th>You</th><th>{mateName}</th></tr></thead>
      <tbody>{series.map((row) => <tr key={row.weekStart}><td>{row.weekStart}</td><td>{row.you}</td><td>{row.mate}</td></tr>)}</tbody></table>
  </div>;
}

/** Topic strengths as a radar: one polygon each, scaled to the larger of you two per chart. */
export function SkillRadar({ topics = [], mateName }) {
  const [ref, width] = useWidth(360);
  const [hover, setHover] = useState(null);
  const axes = topics.slice(0, 6);
  if (axes.length < 3) {
    return <p className="py-10 text-center text-[13px] text-slate-500 dark:text-zinc-400">Solve problems in at least three topics to see your skill shape.</p>;
  }
  const size = Math.min(width, 400);
  const center = size / 2;
  // Room around the rings for topic names.
  const radius = size / 2 - 74;
  const max = Math.max(1, ...axes.flatMap((row) => [row.you, row.mate]));
  const angle = (index) => -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
  const point = (index, value) => [center + Math.cos(angle(index)) * radius * value, center + Math.sin(angle(index)) * radius * value];
  const polygon = (key) => axes.map((row, index) => point(index, row[key] / max).join(',')).join(' ');
  return <div ref={ref} className="flex w-full min-w-0 justify-center">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible" role="img" aria-label={`Topic strengths, you and ${mateName}`}>
      {[0.25, 0.5, 0.75, 1].map((ring) => <polygon key={ring} points={axes.map((_, index) => point(index, ring).join(',')).join(' ')} fill="none" className="stroke-slate-200 dark:stroke-white/[0.08]" />)}
      {axes.map((row, index) => {
        const [ex, ey] = point(index, 1);
        const [lx, ly] = point(index, 1.2);
        return <g key={row.tag} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
          <line x1={center} y1={center} x2={ex} y2={ey} className="stroke-slate-200 dark:stroke-white/[0.08]" />
          <text x={lx} y={ly} textAnchor={Math.abs(lx - center) < 8 ? 'middle' : lx > center ? 'start' : 'end'} dominantBaseline="middle"
            className={`text-[11px] ${hover === index ? 'fill-slate-900 font-semibold dark:fill-white' : 'fill-slate-500 dark:fill-zinc-400'}`}>{row.tag.length > 13 ? `${row.tag.slice(0, 12)}…` : row.tag}</text>
        </g>;
      })}
      <polygon points={polygon('mate')} fill={MATE_COLOR} fillOpacity="0.16" stroke={MATE_COLOR} strokeWidth="2" strokeLinejoin="round" />
      <polygon points={polygon('you')} fill={YOU_COLOR} fillOpacity="0.2" stroke={YOU_COLOR} strokeWidth="2" strokeLinejoin="round" />
      {axes.map((row, index) => <g key={`dots-${row.tag}`}>
        <circle cx={point(index, row.mate / max)[0]} cy={point(index, row.mate / max)[1]} r="4" fill={MATE_COLOR} className="stroke-white dark:stroke-[#262626]" strokeWidth="1.5" />
        <circle cx={point(index, row.you / max)[0]} cy={point(index, row.you / max)[1]} r="4" fill={YOU_COLOR} className="stroke-white dark:stroke-[#262626]" strokeWidth="1.5" />
      </g>)}
      {hover !== null && <g pointerEvents="none">
        <rect x={center - 62} y={center - 24} width="124" height="48" rx="10" className="fill-white stroke-slate-200 dark:fill-[#262626] dark:stroke-white/10" />
        <text x={center} y={center - 6} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold dark:fill-white">{axes[hover].tag.slice(0, 18)}</text>
        <text x={center} y={center + 12} textAnchor="middle" className="text-[11px]"><tspan fill={YOU_COLOR} fontWeight="700">{axes[hover].you}</tspan><tspan className="fill-slate-400"> vs </tspan><tspan fill={MATE_COLOR} fontWeight="700">{axes[hover].mate}</tspan></text>
      </g>}
    </svg>
    <table className="sr-only" data-no-serial><caption>Problems solved per topic</caption><thead><tr><th>Topic</th><th>You</th><th>{mateName}</th></tr></thead>
      <tbody>{axes.map((row) => <tr key={row.tag}><td>{row.tag}</td><td>{row.you}</td><td>{row.mate}</td></tr>)}</tbody></table>
  </div>;
}

const DIFFICULTY = [
  { key: 'easy', label: 'Easy', color: '#10b981' },
  { key: 'medium', label: 'Medium', color: '#f97316' },
  { key: 'hard', label: 'Hard', color: '#f43f5e' },
];

/** A difficulty mix donut for one person: Easy / Medium / Hard with 2px gaps and the total inside. */
export function DifficultyDonut({ totals, label, accent }) {
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = totals.total || 0;
  let offset = 0;
  return <figure className="flex flex-col items-center">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${DIFFICULTY.map((row) => `${totals[row.key]} ${row.label}`).join(', ')}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.06]" />
      {total > 0 && DIFFICULTY.map((row) => {
        const share = totals[row.key] / total;
        if (!share) return null;
        const length = Math.max(0, share * circumference - (share < 1 ? 2 : 0));
        const dash = <circle key={row.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={row.color} strokeWidth={stroke} strokeLinecap="butt"
          strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        offset += share * circumference;
        return dash;
      })}
      <text x="50%" y="47%" textAnchor="middle" className="fill-slate-900 text-[24px] font-black dark:fill-white">{total}</text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-slate-400 text-[10.5px] dark:fill-zinc-500">solved</text>
    </svg>
    <figcaption className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-zinc-200"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />{label}</figcaption>
  </figure>;
}

export function DifficultyLegend({ you, mate, mateName }) {
  return <table className="w-full text-[12.5px]" data-no-serial>
    <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-zinc-500"><th className="pb-1.5 text-left font-semibold">Level</th><th className="pb-1.5 text-right font-semibold">You</th><th className="pb-1.5 text-right font-semibold">{mateName}</th></tr></thead>
    <tbody>{DIFFICULTY.map((row) => <tr key={row.key} className="border-t border-slate-100 dark:border-white/[0.06]">
      <td className="py-1.5"><span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: row.color }} aria-hidden="true" />{row.label}</span></td>
      <td className={`py-1.5 text-right tabular-nums ${you[row.key] > mate[row.key] ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}>{you[row.key]}</td>
      <td className={`py-1.5 text-right tabular-nums ${mate[row.key] > you[row.key] ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}>{mate[row.key]}</td>
    </tr>)}</tbody>
  </table>;
}

/** Last 30 days of practice for one person: a row of squares, filled on days they practised. */
export function ConsistencyStrip({ days = [], color, label }) {
  const active = days.filter((day) => day.active).length;
  return <div>
    <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
      <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-zinc-200"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{label}</span>
      <span className="tabular-nums text-slate-500 dark:text-zinc-400"><b className="text-slate-900 dark:text-white">{active}</b> of 30 days</span>
    </div>
    <ol className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]" aria-label={`${label}: practised on ${active} of the last 30 days`}>
      {days.map((day) => <li key={day.day} title={`${new Date(`${day.day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${day.active ? 'practised' : 'no practice'}`}
        className={`aspect-square rounded-[3px] ${day.active ? '' : 'bg-slate-100 dark:bg-white/[0.06]'}`} style={day.active ? { backgroundColor: color } : undefined} />)}
    </ol>
  </div>;
}

/** Share of all problems solved between the two of you, as a split ring. */
export function ShareRing({ you, mate, size = 112 }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = you + mate;
  const youLength = total ? (you / total) * circumference : circumference / 2;
  const gap = total && you && mate ? 3 : 0;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.06]" />
    {total > 0 && <>
      {you > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={YOU_COLOR} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${Math.max(0, youLength - gap)} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      {mate > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MATE_COLOR} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${Math.max(0, circumference - youLength - gap)} ${circumference}`} strokeDashoffset={-youLength} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </>}
  </svg>;
}
