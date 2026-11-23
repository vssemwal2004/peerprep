import { useId, useMemo, useState } from 'react';
import { useWidth } from '../peers/useWidth';
import { shortDay, smoothPath, TRACK_META, TRACK_ORDER } from './readinessModel';

const HEIGHT = 260;
const PAD = { top: 18, right: 56, bottom: 34, left: 38 };
const niceStep = (span) => [1, 2, 2.5, 5, 10, 20, 25].find((step) => span / step <= 5) || 25;

function ScaleToggle({ fit, onChange }) {
  const item = (value, label) => (
    <button type="button" aria-pressed={fit === value} onClick={() => onChange(value)}
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${fit === value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}>
      {label}
    </button>
  );
  return <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="group" aria-label="Chart scale">{item(true, 'Fit')}{item(false, '0–100')}</div>;
}

/**
 * Service-Based and Product-Based readiness over time. "Fit" zooms the axis to the data so daily
 * ups and downs are visible (targets above the view become chips); "0–100" shows the full scale
 * with the target lines. Policy publications are amber markers, rebuilt history a light band,
 * and a hover readout gives each day's values and change; a table mirrors it for screen readers.
 * growth: { days: [{ day, sbc, pbc, version, reconstructed }], publications: [{ day, version }] }
 */
export default function ReadinessGrowthChart({ growth, cutoffs = { sbc: 70, pbc: 75 } }) {
  const [ref, width] = useWidth(720);
  const [hover, setHover] = useState(null);
  const [fit, setFit] = useState(true);
  const raw = useId().replace(/:/g, '');
  const days = useMemo(() => growth?.days || [], [growth]);
  if (!days.length) return <p className="py-10 text-center text-[12.5px] text-slate-500 dark:text-zinc-400">No history yet. Solve a problem to start your line.</p>;

  const peak = Math.max(...days.flatMap((row) => TRACK_ORDER.map((key) => Number(row[key]) || 0)));
  const headroom = peak * 1.25 || 10;
  const top = fit ? Math.min(100, Math.max(10, Math.ceil(headroom / niceStep(headroom)) * niceStep(headroom))) : 100;
  const step = niceStep(top);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => Math.round(index * step * 10) / 10);
  const innerWidth = Math.max(120, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index) => PAD.left + (days.length <= 1 ? innerWidth / 2 : (index / (days.length - 1)) * innerWidth);
  const y = (value) => PAD.top + innerHeight - (Math.max(0, Math.min(top, value)) / top) * innerHeight;
  const line = (key) => smoothPath(days.map((row, index) => [x(index), y(row[key])]));
  const lastReconstructed = days.reduce((last, row, index) => (row.reconstructed ? index : last), -1);
  const indexOf = (day) => days.findIndex((row) => row.day === day);
  const last = days.at(-1);
  const active = hover == null ? null : days[hover];
  const previous = hover ? days[hover - 1] : null;
  const hiddenTargets = TRACK_ORDER.filter((key) => cutoffs[key] > top);
  const dateTicks = days.length <= 1 ? [0] : [...new Set(Array.from({ length: Math.min(5, days.length) }, (_, index) => Math.round((index / (Math.min(5, days.length) - 1)) * (days.length - 1))))];
  // End labels never overlap: the lower one moves down when they are close.
  const ends = Object.fromEntries(TRACK_ORDER.map((key) => [key, y(last[key])]));
  if (Math.abs(ends.sbc - ends.pbc) < 14) {
    const [high, low] = ends.sbc <= ends.pbc ? ['sbc', 'pbc'] : ['pbc', 'sbc'];
    ends[high] -= 7; ends[low] = ends[high] + 14;
  }
  const moveTo = (clientX, element) => {
    const box = element.getBoundingClientRect();
    const relative = ((clientX - box.left) / box.width) * width - PAD.left;
    const index = Math.round((relative / innerWidth) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, index)));
  };

  return (
    <div ref={ref} className="relative w-full">
      <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
        {fit && hiddenTargets.length ? (
          <span className="mr-auto flex flex-wrap gap-1.5 text-[11px]">
            {hiddenTargets.map((key) => (
              <span key={key} className={`rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${TRACK_META[key].soft}`}>
                {TRACK_META[key].word} target {cutoffs[key]} ↑ <span className="font-normal opacity-80">{Math.max(0, cutoffs[key] - last[key]).toFixed(1)} to go</span>
              </span>
            ))}
          </span>
        ) : null}
        <ScaleToggle fit={fit} onChange={setFit} />
      </div>
      <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${raw}-title`} className="block select-none overflow-visible"
        onMouseMove={(event) => moveTo(event.clientX, event.currentTarget)} onMouseLeave={() => setHover(null)}
        onTouchStart={(event) => { if (event.touches[0]) moveTo(event.touches[0].clientX, event.currentTarget); }}>
        <title id={`${raw}-title`}>{`Readiness from ${shortDay(days[0].day)} to ${shortDay(last.day)}: Service-Based ${last.sbc.toFixed(1)}, Product-Based ${last.pbc.toFixed(1)}`}</title>
        <defs>
          {TRACK_ORDER.map((key) => (
            <linearGradient key={key} id={`${raw}-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TRACK_META[key].color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={TRACK_META[key].color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* History rebuilt from earlier solves (their real dates): a light band, not a pattern. */}
        {lastReconstructed >= 0 ? (
          <g>
            <rect x={PAD.left} y={PAD.top} width={Math.max(2, x(lastReconstructed) - PAD.left)} height={innerHeight} className="fill-slate-50 dark:fill-white/[0.025]" />
            <text x={PAD.left + 6} y={PAD.top + 12} className="fill-slate-400 text-[10px] dark:fill-zinc-500">Rebuilt from earlier solves</text>
          </g>
        ) : null}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'stroke-slate-200 dark:stroke-white/15' : 'stroke-slate-100 dark:stroke-white/[0.06]'} />
            <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" className="fill-slate-400 text-[10.5px] tabular-nums dark:fill-zinc-500">{tick}</text>
          </g>
        ))}
        {/* Targets inside the view */}
        {TRACK_ORDER.filter((key) => cutoffs[key] <= top).map((key) => (
          <g key={`target-${key}`}>
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(cutoffs[key])} y2={y(cutoffs[key])} stroke={TRACK_META[key].color} strokeDasharray="5 4" strokeOpacity="0.6" />
            <text x={PAD.left + innerWidth + 6} y={y(cutoffs[key]) + (key === 'sbc' ? 11 : -3)} className="text-[10px] font-semibold" fill={TRACK_META[key].color}>Target {cutoffs[key]}</text>
          </g>
        ))}
        {(growth.publications || []).map((item) => {
          const index = indexOf(item.day);
          if (index < 0) return null;
          return (
            <g key={`pub-${item.day}`}>
              <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-amber-400" strokeDasharray="2 3" />
              <text x={x(index) + 3} y={PAD.top + 10} className="fill-amber-600 text-[10px] font-semibold dark:fill-amber-300">v{item.version}</text>
            </g>
          );
        })}
        {TRACK_ORDER.map((key) => (
          <g key={key}>
            <path d={`${line(key)} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${raw}-${key})`} />
            <path d={line(key)} fill="none" stroke={TRACK_META[key].color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(days.length - 1)} cy={y(last[key])} r="7" fill={TRACK_META[key].color} opacity="0.15" />
            <circle cx={x(days.length - 1)} cy={y(last[key])} r="4" fill={TRACK_META[key].color} stroke="white" strokeWidth="1.5" />
            <text x={x(days.length - 1) + 10} y={ends[key] + 4} className="text-[11.5px] font-bold tabular-nums" fill={TRACK_META[key].color}>{last[key].toFixed(1)}</text>
          </g>
        ))}
        {dateTicks.map((index) => (
          <text key={index} x={x(index)} y={HEIGHT - 10} textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[10.5px] dark:fill-zinc-400">{shortDay(days[index].day)}</text>
        ))}
        {active ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-slate-300 dark:stroke-white/25" strokeDasharray="3 3" />
            {TRACK_ORDER.map((key) => <circle key={key} cx={x(hover)} cy={y(active[key])} r="4" fill={TRACK_META[key].color} stroke="white" strokeWidth="1.5" />)}
          </g>
        ) : null}
      </svg>
      {active ? (
        <div className="pointer-events-none absolute top-9 w-[172px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11.5px] shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-900/95"
          style={{ left: Math.min(width - 176, Math.max(0, x(hover) + (x(hover) > width / 2 ? -184 : 12))) }}>
          <p className="font-semibold text-slate-800 dark:text-zinc-100">{shortDay(active.day)}{active.reconstructed ? <span className="font-normal text-slate-400"> · rebuilt</span> : null}</p>
          {TRACK_ORDER.map((key) => {
            const delta = previous ? active[key] - previous[key] : 0;
            return (
              <p key={key} className="mt-1 flex items-center justify-between gap-2 tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: TRACK_META[key].color }} />{TRACK_META[key].word}</span>
                <span className="font-bold" style={{ color: TRACK_META[key].color }}>{active[key].toFixed(1)}
                  {Math.abs(delta) >= 0.05 ? <span className={`ml-1 text-[10.5px] font-semibold ${delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}</span> : null}
                </span>
              </p>
            );
          })}
          {growth.publications?.length ? <p className="mt-1 text-[10.5px] text-slate-400">Policy v{active.version}</p> : null}
        </div>
      ) : null}
      <table className="sr-only" data-no-serial>
        <caption>Readiness by day</caption>
        <thead><tr><th>Date</th><th>Service-Based</th><th>Product-Based</th><th>Policy</th></tr></thead>
        <tbody>{days.map((row) => <tr key={row.day}><td>{row.day}{row.reconstructed ? ' (rebuilt)' : ''}</td><td>{row.sbc.toFixed(2)}</td><td>{row.pbc.toFixed(2)}</td><td>v{row.version}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
