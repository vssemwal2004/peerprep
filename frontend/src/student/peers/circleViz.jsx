import { useEffect, useRef, useState } from 'react';

// Two series only, everywhere in Prep Mates: YOU (PeerPrep sky) and YOUR PREP MATE (amber).
// sky-600 / amber-600 pass the palette checks (lightness, CVD and contrast) on both the light
// (#ffffff) and dark (#242424) card surfaces, so the same pair is used in both themes.
export const YOU_COLOR = '#0284c7';
export const MATE_COLOR = '#d97706';
const EMPTY_TRACK = 'bg-slate-100 dark:bg-white/[0.06]';

export function Swatch({ color, label }) {
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-zinc-300">
    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} aria-hidden="true" />{label}
  </span>;
}

/** Legend for the two series; always shown above a two-series chart. */
export function DuelLegend({ youLabel = 'You', mateLabel }) {
  return <div className="flex flex-wrap items-center gap-4"><Swatch color={YOU_COLOR} label={youLabel} /><Swatch color={MATE_COLOR} label={mateLabel} /></div>;
}

/**
 * One measure, head to head: values on each side and a bar split by share (2px gap between).
 * The larger value is bold; ties and zeros read as even.
 */
export function DuelRow({ label, you = 0, mate = 0, format = (value) => value, mateName = 'Mate' }) {
  const total = you + mate;
  const youShare = total ? (you / total) * 100 : 50;
  const lead = you === mate ? null : you > mate ? 'you' : 'mate';
  return <div className="py-2.5" role="group" aria-label={`${label}: you ${format(you)}, ${mateName} ${format(mate)}`}>
    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
      <span className={`tabular-nums ${lead === 'you' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-300'}`}>{format(you)}</span>
      <span className="truncate text-center text-[12px] text-slate-500 dark:text-zinc-400">{label}</span>
      <span className={`tabular-nums ${lead === 'mate' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-300'}`}>{format(mate)}</span>
    </div>
    {total ? <div className="flex h-2 gap-[2px]" aria-hidden="true">
      {you > 0 && <span className="h-full rounded-l-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${youShare}%`, backgroundColor: YOU_COLOR, borderRadius: mate > 0 ? '9999px 2px 2px 9999px' : '9999px' }} />}
      {mate > 0 && <span className="h-full flex-1 rounded-r-full" style={{ backgroundColor: MATE_COLOR, borderRadius: you > 0 ? '2px 9999px 9999px 2px' : '9999px' }} />}
    </div> : <div className={`h-2 rounded-full ${EMPTY_TRACK}`} aria-hidden="true" />}
  </div>;
}

const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function niceMax(value) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 2.5, 5, 10]) if (factor * step >= value) return factor * step;
  return value;
}

/** Problems solved per week, last 8 weeks: grouped bars (you, mate) with a hover tooltip. */
export function WeeklyDuelChart({ you = [], mate = [], mateName }) {
  const [hover, setHover] = useState(null);
  // Drawn at the container's real pixel width, so axis text stays 11px at any card size.
  const box = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const weeks = you.map((row, index) => ({ weekStart: row.weekStart, you: row.solved, mate: mate[index]?.solved || 0 }));
  const max = niceMax(Math.max(1, ...weeks.flatMap((week) => [week.you, week.mate])));
  const height = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const group = plotW / Math.max(1, weeks.length);
  const barW = Math.max(4, Math.min(22, (group - 14) / 2));
  const y = (value) => pad.top + plotH - (value / max) * plotH;
  const ticks = [0, max / 2, max];
  // Bars grow from the baseline with a 4px rounded top.
  const bar = (x, value) => {
    const top = y(value);
    const h = pad.top + plotH - top;
    if (h <= 0) return null;
    const r = Math.min(4, h, barW / 2);
    return `M${x},${pad.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.top + plotH} Z`;
  };
  return <div ref={box} className="relative">
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block max-w-full" role="img" aria-label={`Problems solved per week, you and ${mateName}, last ${weeks.length} weeks`}>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" strokeDasharray={tick ? '3 4' : undefined} />
        <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px] dark:fill-zinc-500">{Math.round(tick)}</text>
      </g>)}
      {weeks.map((week, index) => {
        const x0 = pad.left + index * group + (group - (barW * 2 + 2)) / 2;
        const active = hover === index;
        return <g key={week.weekStart} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} tabIndex={0} className="outline-none">
          <rect x={pad.left + index * group} y={pad.top} width={group} height={plotH} className={active ? 'fill-slate-100 dark:fill-white/[0.04]' : 'fill-transparent'} />
          {bar(x0, week.you) && <path d={bar(x0, week.you)} fill={YOU_COLOR} />}
          {bar(x0 + barW + 2, week.mate) && <path d={bar(x0 + barW + 2, week.mate)} fill={MATE_COLOR} />}
          {/* Narrow cards label every other week (counting back from this week) so labels never collide. */}
          {(group >= 56 || (weeks.length - 1 - index) % 2 === 0) && <text x={pad.left + index * group + group / 2} y={height - 8} textAnchor="middle" className={`text-[11px] ${index === weeks.length - 1 ? 'fill-slate-700 font-semibold dark:fill-zinc-200' : 'fill-slate-400 dark:fill-zinc-500'}`}>
            {index === weeks.length - 1 ? (group >= 56 ? 'This week' : 'Now') : weekLabel(week.weekStart)}
          </text>}
        </g>;
      })}
    </svg>
    {hover !== null && weeks[hover] && <div role="tooltip" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-lg dark:border-white/10 dark:bg-zinc-900"
      style={{ left: `${((pad.left + hover * group + group / 2) / width) * 100}%` }}>
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{hover === weeks.length - 1 ? 'This week' : `Week of ${weekLabel(weeks[hover].weekStart)}`}</p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: YOU_COLOR }} />You <b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{weeks[hover].you}</b></p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: MATE_COLOR }} />{mateName} <b className="ml-auto pl-3 tabular-nums text-slate-900 dark:text-white">{weeks[hover].mate}</b></p>
    </div>}
    <table className="sr-only">
      <caption>Problems solved per week</caption>
      <thead><tr><th>Week starting</th><th>You</th><th>{mateName}</th></tr></thead>
      <tbody>{weeks.map((week) => <tr key={week.weekStart}><td>{week.weekStart}</td><td>{week.you}</td><td>{week.mate}</td></tr>)}</tbody>
    </table>
  </div>;
}

/** Topics side by side: your bar grows left, your Prep Mate's grows right, topic in the middle. */
export function MirrorBars({ rows = [], mateName }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.you, row.mate]));
  return <ul className="space-y-2">
    {rows.map((row) => <li key={row.tag} className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)]" aria-label={`${row.tag}: you ${row.you}, ${mateName} ${row.mate}`}>
      <span className="flex items-center justify-end gap-2">
        <span className="text-[12px] tabular-nums text-slate-600 dark:text-zinc-300">{row.you || ''}</span>
        <span className="h-2.5 rounded-l-full rounded-r-[2px]" style={{ width: `${(row.you / max) * 100}%`, minWidth: row.you ? 4 : 0, backgroundColor: YOU_COLOR }} aria-hidden="true" />
      </span>
      <span className={`truncate text-center text-[12px] ${row.you > row.mate ? 'font-semibold text-slate-900 dark:text-white' : row.mate > row.you ? 'text-slate-500 dark:text-zinc-400' : 'text-slate-600 dark:text-zinc-300'}`} title={row.tag}>{row.tag}</span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 rounded-r-full rounded-l-[2px]" style={{ width: `${(row.mate / max) * 100}%`, minWidth: row.mate ? 4 : 0, backgroundColor: MATE_COLOR }} aria-hidden="true" />
        <span className="text-[12px] tabular-nums text-slate-600 dark:text-zinc-300">{row.mate || ''}</span>
      </span>
    </li>)}
  </ul>;
}
