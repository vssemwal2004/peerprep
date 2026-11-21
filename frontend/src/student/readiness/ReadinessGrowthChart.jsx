import { useId, useMemo, useState } from 'react';
import { useWidth } from '../peers/useWidth';
import { shortDay, TRACK_META, TRACK_ORDER } from './readinessModel';

const HEIGHT = 230;
const PAD = { top: 16, right: 64, bottom: 30, left: 36 };

/**
 * SBC and PBC readiness over time on one 0–100 axis, with the 70 / 75 targets, policy
 * publications (each day is scored under the policy serving then), the reconstructed part of
 * history shaded, a hover readout and a table equivalent for screen readers.
 * growth: { days: [{ day, sbc, pbc, version, reconstructed }], publications: [{ day, version }] }
 */
export default function ReadinessGrowthChart({ growth, cutoffs = { sbc: 70, pbc: 75 } }) {
  const [ref, width] = useWidth(720);
  const [hover, setHover] = useState(null);
  const raw = useId().replace(/:/g, '');
  const days = useMemo(() => growth?.days || [], [growth]);
  const innerWidth = Math.max(120, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index) => PAD.left + (days.length <= 1 ? innerWidth / 2 : (index / (days.length - 1)) * innerWidth);
  const y = (value) => PAD.top + innerHeight - (Math.max(0, Math.min(100, value)) / 100) * innerHeight;
  const path = (key) => days.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
  const lastReconstructed = days.reduce((last, row, index) => (row.reconstructed ? index : last), -1);
  const indexOf = (day) => days.findIndex((row) => row.day === day);
  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - box.left) / box.width) * width - PAD.left;
    const index = Math.round((relative / innerWidth) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, index)));
  };
  if (!days.length) return <p className="py-10 text-center text-[12.5px] text-slate-500 dark:text-zinc-400">No history yet.</p>;
  const last = days.at(-1);
  const active = hover == null ? null : days[hover];

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${raw}-title`} className="block select-none overflow-visible"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <title id={`${raw}-title`}>{`Readiness from ${shortDay(days[0].day)} to ${shortDay(last.day)}: Service-Based ${last.sbc.toFixed(1)}, Product-Based ${last.pbc.toFixed(1)}`}</title>
        <defs>
          {TRACK_ORDER.map((key) => (
            <linearGradient key={key} id={`${raw}-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TRACK_META[key].color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={TRACK_META[key].color} stopOpacity="0" />
            </linearGradient>
          ))}
          <pattern id={`${raw}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.2" className="text-slate-300/70 dark:text-white/10" />
          </pattern>
        </defs>
        {/* Reconstructed history (rebuilt from earlier solves, real solve dates). */}
        {lastReconstructed >= 0 ? (
          <g>
            <rect x={PAD.left} y={PAD.top} width={Math.max(2, x(lastReconstructed) - PAD.left)} height={innerHeight} fill={`url(#${raw}-hatch)`} />
            <text x={PAD.left + 6} y={PAD.top + 12} className="fill-slate-500 text-[10px] dark:fill-zinc-400">Reconstructed</text>
          </g>
        ) : null}
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(tick)} y2={y(tick)} className="stroke-slate-100 dark:stroke-white/[0.06]" />
            <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" className="fill-slate-400 text-[10.5px] tabular-nums dark:fill-zinc-500">{tick}</text>
          </g>
        ))}
        {/* Targets */}
        {TRACK_ORDER.map((key) => (
          <g key={`target-${key}`}>
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(cutoffs[key])} y2={y(cutoffs[key])} stroke={TRACK_META[key].color} strokeDasharray="5 4" strokeOpacity="0.55" />
            <text x={PAD.left + innerWidth + 6} y={y(cutoffs[key]) + (key === 'sbc' ? 10 : -3)} className="text-[10px] font-semibold" fill={TRACK_META[key].color}>{TRACK_META[key].word} {cutoffs[key]}</text>
          </g>
        ))}
        {/* Policy publications */}
        {(growth.publications || []).map((item) => {
          const index = indexOf(item.day);
          if (index < 0) return null;
          return (
            <g key={`pub-${item.day}`}>
              <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-amber-400" strokeDasharray="2 3" />
              <text x={x(index) + 3} y={PAD.top + innerHeight - 4} className="fill-amber-600 text-[10px] font-semibold dark:fill-amber-300">v{item.version}</text>
            </g>
          );
        })}
        {TRACK_ORDER.map((key) => (
          <g key={key}>
            <path d={`${path(key)} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${raw}-${key})`} />
            <path d={path(key)} fill="none" stroke={TRACK_META[key].color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={key === 'pbc' ? '0' : undefined} />
            <circle cx={x(days.length - 1)} cy={y(last[key])} r="4" fill={TRACK_META[key].color} stroke="white" strokeWidth="1.5" />
            <text x={x(days.length - 1) + 8} y={y(last[key]) + (key === 'sbc' ? -6 : 13)} className="text-[11px] font-bold tabular-nums" fill={TRACK_META[key].color}>{last[key].toFixed(1)}</text>
          </g>
        ))}
        {/* Endpoint dates */}
        <text x={PAD.left} y={HEIGHT - 8} className="fill-slate-500 text-[10.5px] dark:fill-zinc-400">{shortDay(days[0].day)}</text>
        <text x={PAD.left + innerWidth} y={HEIGHT - 8} textAnchor="end" className="fill-slate-500 text-[10.5px] dark:fill-zinc-400">{shortDay(last.day)}</text>
        {active ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-slate-300 dark:stroke-white/25" />
            {TRACK_ORDER.map((key) => <circle key={key} cx={x(hover)} cy={y(active[key])} r="3.5" fill={TRACK_META[key].color} stroke="white" strokeWidth="1.2" />)}
          </g>
        ) : null}
      </svg>
      {active ? (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11.5px] shadow-lg dark:border-white/10 dark:bg-zinc-900/95"
          style={{ left: Math.min(width - 150, Math.max(0, x(hover) - 70)) }}>
          <p className="font-semibold text-slate-800 dark:text-zinc-100">{shortDay(active.day)}{active.reconstructed ? ' · reconstructed' : ''}</p>
          {TRACK_ORDER.map((key) => <p key={key} className="tabular-nums" style={{ color: TRACK_META[key].color }}>{TRACK_META[key].label} {active[key].toFixed(2)}</p>)}
          <p className="text-[10.5px] text-slate-400">Policy v{active.version}</p>
        </div>
      ) : null}
      <table className="sr-only" data-no-serial>
        <caption>Readiness by day</caption>
        <thead><tr><th>Date</th><th>Service-Based</th><th>Product-Based</th><th>Policy</th></tr></thead>
        <tbody>{days.map((row) => <tr key={row.day}><td>{row.day}{row.reconstructed ? ' (reconstructed)' : ''}</td><td>{row.sbc.toFixed(2)}</td><td>{row.pbc.toFixed(2)}</td><td>v{row.version}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
