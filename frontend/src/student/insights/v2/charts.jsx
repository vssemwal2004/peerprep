// Prep Analysis v2 charts in SVG/HTML (no chart library), styled like the profile cards: smooth
// curves with gradient fills and a glowing end point, gradient bars, soft bubbles. Each draws in
// once (≤700 ms) and respects reduced motion.
import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { flowGeometry, packBubbles, signedScore, trendGeometry, waterfallScale } from "../analysisModel";
import { POINT_KINDS } from "../../prepScore/pointKinds";
import { smoothPath } from "../../readiness/readinessModel";
import { muted } from "./parts";

const EASE = [0.22, 1, 0.36, 1];
const fmt = (value, places = 2) => (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: places });
const dayText = (day) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const useGradientId = () => useId().replace(/:/g, "");

/**
 * A left-to-right reveal for lines in a stretched SVG (pathLength mis-measures there because the
 * stroke does not scale): a clip rectangle that grows to the full width once.
 */
function RevealClip({ id, width, height, reduce }) {
  return (
    <clipPath id={id}>
      <motion.rect x="0" y="-20" height={height + 40} initial={reduce ? false : { width: 0 }} animate={{ width: width + 20 }} transition={{ duration: 0.8, ease: EASE }} width={width + 20} />
    </clipPath>
  );
}

/** Smooth area + line + glowing end dot. `light` for gradient cards (white line). */
export function AreaTrend({ values = [], light = false, height = "h-16", color = "#0284c7", label }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  if (values.length < 2) return <div className={height} aria-hidden="true" />;
  const W = 300, H = 100, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(0.0001, max - min) || 1;
  const points = values.map((value, index) => [(index / (values.length - 1)) * W, pad + (H - pad * 2) * (1 - (value - min) / span)]);
  const line = smoothPath(points);
  const last = points.at(-1);
  const stroke = light ? "#ffffff" : color;
  return (
    <div className={`relative ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity={light ? 0.32 : 0.22} /><stop offset="100%" stopColor={stroke} stopOpacity="0" /></linearGradient>
          <RevealClip id={`${id}-clip`} width={W} height={H} reduce={reduce} />
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id}-fill)`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%`, backgroundColor: stroke, boxShadow: `0 0 0 4px ${light ? "rgba(255,255,255,0.25)" : "rgba(2,132,199,0.18)"}` }} aria-hidden="true" />
    </div>
  );
}

/** Score over time: smooth line with gradient fill, and below it each day's gains and losses. */
export function ScoreTrend({ days = [] }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  const geometry = useMemo(() => trendGeometry(days, { width: 600, height: 190, pad: 14 }), [days]);
  if (days.length < 2) return <p className={`py-10 text-center text-[13px] ${muted}`}>Not enough days in this period to draw a line yet.</p>;
  const line = smoothPath(geometry.points.map((point) => [point.x, point.y]));
  const active = hover === null ? null : geometry.points[hover];
  const maxSwing = Math.max(0.01, ...days.map((day) => Math.max(day.gained || 0, day.lost || 0)));
  const column = 600 / geometry.points.length;
  const barWidth = Math.max(2, Math.min(12, column * 0.55));
  return (
    <div className="flex gap-3">
      <div className={`flex flex-col justify-between pb-[86px] text-right text-[11.5px] tabular-nums ${muted}`} aria-hidden="true"><span>{fmt(geometry.max)}</span><span>{fmt((geometry.max + geometry.min) / 2)}</span><span>{fmt(geometry.min)}</span></div>
      <div className="relative min-w-0 flex-1">
        <svg viewBox="0 0 600 270" preserveAspectRatio="none" className="block h-[270px] w-full" role="img"
          aria-label={`Prep Score from ${fmt(days[0].total)} to ${fmt(days.at(-1).total)} over ${days.length} days`}>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0ea5e9" stopOpacity="0.28" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient>
            <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
            <RevealClip id={`${id}-clip`} width={600} height={190} reduce={reduce} />
          </defs>
          {[0.25, 0.5, 0.75].map((share) => <line key={share} x1="0" x2="600" y1={190 * share} y2={190 * share} className="stroke-slate-200 dark:stroke-white/[0.07]" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />)}
          <g clipPath={`url(#${id}-clip)`}>
            <path d={`${line} L600 190 L0 190 Z`} fill={`url(#${id}-area)`} />
            <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
          <line x1="0" x2="600" y1="232" y2="232" className="stroke-slate-200 dark:stroke-white/10" vectorEffect="non-scaling-stroke" />
          {geometry.points.map((point, index) => {
            const up = ((point.gained || 0) / maxSwing) * 32;
            const down = ((point.lost || 0) / maxSwing) * 32;
            const faded = hover !== null && hover !== index;
            return (
              <g key={point.day} opacity={faded ? 0.4 : 1}>
                {up > 0 && <rect x={point.x - barWidth / 2} y={232 - up} width={barWidth} height={up} rx={Math.min(3, barWidth / 2)} className="fill-emerald-500" />}
                {down > 0 && <rect x={point.x - barWidth / 2} y={232} width={barWidth} height={down} rx={Math.min(3, barWidth / 2)} className="fill-rose-500" />}
              </g>
            );
          })}
          {active && <line x1={active.x} x2={active.x} y1="0" y2="268" className="stroke-slate-300 dark:stroke-white/20" vectorEffect="non-scaling-stroke" />}
        </svg>
        {active && <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-[3px] ring-violet-500" style={{ left: `${(active.x / 600) * 100}%`, top: `${(active.y / 270) * 270}px` }} aria-hidden="true" />}
        <div className="absolute inset-x-0 top-0 flex h-[270px]">
          {geometry.points.map((point, index) => (
            <button key={point.day} type="button" aria-label={`${dayText(point.day)}: ${fmt(point.total)}`} className="h-full focus:outline-none focus-visible:bg-sky-500/10"
              style={{ width: `${100 / geometry.points.length}%` }} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />
          ))}
        </div>
        {active && (
          <div role="tooltip" className="pointer-events-none absolute top-1 z-10 w-56 -translate-x-1/2 rounded-xl border border-[#e9eaee] bg-white/95 px-3 py-2.5 text-[12px] shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#2c2c2c]/95"
            style={{ left: `${Math.min(86, Math.max(14, (active.x / 600) * 100))}%` }}>
            <p className="flex justify-between font-semibold text-slate-900 dark:text-white"><span>{dayText(active.day)}</span><span className="tabular-nums">{fmt(active.total)}</span></p>
            {Object.entries(active.byKind || {}).filter(([, value]) => value).map(([kind, value]) => (
              <p key={kind} className="mt-0.5 flex justify-between gap-2 text-slate-600 dark:text-zinc-300"><span>{POINT_KINDS[kind]?.label || kind}</span><span className={`font-semibold tabular-nums ${value > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{signedScore(value)}</span></p>
            ))}
            {!Object.values(active.byKind || {}).some(Boolean) && <p className={`mt-0.5 ${muted}`}>No change this day</p>}
          </div>
        )}
        <div className={`mt-1 flex justify-between text-[11.5px] ${muted}`} aria-hidden="true"><span>{dayText(days[0].day)}</span><span>{dayText(days[Math.floor(days.length / 2)].day)}</span><span>{dayText(days.at(-1).day)}</span></div>
      </div>
    </div>
  );
}

const STEP_STYLE = {
  total: "bg-gradient-to-t from-sky-600 to-sky-400 dark:from-sky-500 dark:to-sky-300",
  gain: "bg-gradient-to-t from-emerald-600 to-emerald-400",
  loss: "bg-gradient-to-b from-rose-600 to-rose-400",
};
const STEP_TEXT = { total: "text-slate-900 dark:text-zinc-100", gain: "text-emerald-700 dark:text-emerald-300", loss: "text-rose-700 dark:text-rose-300" };

/** Start → each kind of change → now, as floating gradient bars joined by dashed steps. */
export function Waterfall({ steps = [] }) {
  const reduce = useReducedMotion();
  const { min, max } = waterfallScale(steps);
  const span = max - min || 1;
  const label = steps.map((step) => `${step.label} ${step.kind === "total" ? fmt(step.value) : signedScore(step.value)}`).join(", ");
  const level = (value) => ((max - value) / span) * 100;
  return (
    <div role="img" aria-label={`How the score was built: ${label}`}>
      <div className="grid h-[230px] gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const low = step.kind === "total" ? min : Math.min(step.from, step.to);
          const high = step.kind === "total" ? step.to : Math.max(step.from, step.to);
          const top = level(high);
          const height = Math.max(1.8, ((high - low) / span) * 100);
          const end = step.kind === "total" ? step.to : step.to;
          return (
            <div key={step.key} className="relative h-full">
              <span className={`absolute inset-x-0 text-center text-[12px] font-bold tabular-nums ${STEP_TEXT[step.kind]}`} style={{ top: `calc(${top}% - 20px)` }}>{step.kind === "total" ? fmt(step.value) : signedScore(step.value)}</span>
              <motion.span className={`absolute inset-x-[12%] origin-bottom rounded-lg shadow-[0_6px_14px_-8px_rgba(15,23,42,0.45)] ${STEP_STYLE[step.kind]}`} style={{ top: `${top}%`, height: `${height}%` }}
                initial={reduce ? false : { scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.5, delay: reduce ? 0 : index * 0.06, ease: EASE }} />
              {index < steps.length - 1 && <span className="absolute left-[88%] right-[-12%] border-t-2 border-dashed border-slate-300 dark:border-white/20" style={{ top: `${level(end)}%` }} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid gap-2 border-t border-[#e9eaee] pt-2 dark:border-white/[0.07]" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step) => <span key={step.key} className={`text-center text-[11.5px] font-medium leading-4 ${muted}`}>{step.label}</span>)}
      </div>
    </div>
  );
}

/** Gains right of the centre line, losses left: one row per kind. */
export function DivergingBars({ rows = [] }) {
  const reduce = useReducedMotion();
  const max = Math.max(0.01, ...rows.map((row) => Math.abs(row.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((row, index) => {
        const width = `${(Math.abs(row.value) / max) * 50}%`;
        const gain = row.value > 0;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_56px] items-center gap-3 text-[12.5px]">
            <span className="truncate text-slate-700 dark:text-zinc-300">{row.label}</span>
            <span className="relative h-3 rounded-full bg-[#f1f3f6] dark:bg-white/[0.06]">
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-slate-300 dark:bg-white/20" aria-hidden="true" />
              <motion.span className={`absolute inset-y-0 rounded-full ${gain ? "left-1/2 bg-gradient-to-r from-emerald-400 to-emerald-600" : "right-1/2 bg-gradient-to-l from-rose-400 to-rose-600"}`}
                initial={reduce ? false : { width: 0 }} animate={{ width }} transition={{ duration: 0.6, delay: reduce ? 0 : index * 0.05, ease: EASE }} />
            </span>
            <span className={`text-right font-bold tabular-nums ${gain ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{signedScore(row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Bubble colours: a calm multi-hue set, each a light-to-deep radial gradient.
const BUBBLE_HUES = [["#7dd3fc", "#0284c7"], ["#c4b5fd", "#7c3aed"], ["#5eead4", "#0d9488"], ["#a5b4fc", "#4f46e5"], ["#fcd34d", "#d97706"], ["#f9a8d4", "#db2777"], ["#86efac", "#16a34a"], ["#fdba74", "#ea580c"]];
const STATE_HUES = { strong: ["#6ee7b7", "#059669"], building: ["#7dd3fc", "#0284c7"], needsWork: ["#fda4af", "#e11d48"], notStarted: ["#e2e8f0", "#94a3b8"] };

/** Bubbles: area = value. Items: [{ key, label, value, display, state? }]. `byState` colours by topic state. */
export function BubblePack({ items = [], onPick, byState = false, height = 280 }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const circles = useMemo(() => packBubbles(items, { width: 560, height }), [items, height]);
  if (!circles.length) return <p className={`py-10 text-center text-[13px] ${muted}`}>Nothing to show yet: solve problems and your topics appear here.</p>;
  return (
    <svg viewBox={`0 0 560 ${height}`} className="mx-auto block h-auto w-full max-w-[660px] overflow-visible" role="img" aria-label={circles.map((circle) => `${circle.label} ${circle.display}`).join(", ")}>
      <defs>
        {circles.map((circle, index) => {
          const [light, deep] = byState ? STATE_HUES[circle.state] || STATE_HUES.building : BUBBLE_HUES[index % BUBBLE_HUES.length];
          return <radialGradient key={circle.key} id={`${id}-b${index}`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={light} /><stop offset="1" stopColor={deep} /></radialGradient>;
        })}
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.18" /></filter>
      </defs>
      {circles.map((circle, index) => {
        const chars = Math.max(3, Math.floor(circle.r / 4.1));
        const short = circle.label.length > chars ? `${circle.label.slice(0, chars - 1)}…` : circle.label;
        const dark = byState && circle.state === "notStarted";
        return (
          <motion.g key={circle.key} initial={reduce ? false : { opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18, delay: reduce ? 0 : index * 0.035 }}
            style={{ transformOrigin: `${circle.x}px ${circle.y}px` }} className={onPick ? "cursor-pointer" : ""} onClick={onPick ? () => onPick(circle) : undefined} whileHover={reduce ? undefined : { scale: 1.06 }}>
            <title>{`${circle.label}: ${circle.display}`}</title>
            <circle cx={circle.x} cy={circle.y} r={circle.r} fill={`url(#${id}-b${index})`} filter={`url(#${id}-shadow)`} />
            {circle.r >= 22 && <text x={circle.x} y={circle.y - (circle.r >= 30 ? 3 : -4)} textAnchor="middle" className={`${dark ? "fill-slate-700" : "fill-white"} text-[12px] font-semibold`}>{short}</text>}
            {circle.r >= 30 && <text x={circle.x} y={circle.y + 13} textAnchor="middle" className={`${dark ? "fill-slate-600" : "fill-white"} text-[11.5px] tabular-nums`} opacity="0.92">{circle.display}</text>}
          </motion.g>
        );
      })}
    </svg>
  );
}

const FLOW_COLORS = ["#0ea5e9", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#64748b"];

/** Coins: where they came from (left) and where they went (right), as gradient ribbons. */
export function CoinFlow({ sources = [], sinks = [] }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const geometry = useMemo(() => flowGeometry(sources, sinks, { width: 520, height: 230 }), [sources, sinks]);
  if (!sources.length) return <p className={`py-10 text-center text-[13px] ${muted}`}>No coins earned yet.</p>;
  return (
    <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_minmax(0,130px)] items-stretch gap-3">
      <ul className="flex h-[230px] flex-col justify-center gap-2.5" aria-label="Where coins came from">
        {geometry.left.map((item, index) => (
          <li key={item.label} className="flex min-w-0 items-start justify-end gap-2 text-right">
            <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-slate-800 dark:text-zinc-100">{item.label}</span><span className={`block text-[11.5px] tabular-nums ${muted}`}>{item.amount} coins</span></span>
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: FLOW_COLORS[index % FLOW_COLORS.length] }} aria-hidden="true" />
          </li>
        ))}
      </ul>
      <svg viewBox="0 0 520 230" preserveAspectRatio="none" className="h-[230px] w-full" aria-hidden="true">
        <defs>
          {geometry.ribbons.map((ribbon, index) => (
            <linearGradient key={index} id={`${id}-r${index}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={FLOW_COLORS[ribbon.from % FLOW_COLORS.length]} stopOpacity="0.55" />
              <stop offset="1" stopColor={geometry.right[ribbon.to]?.wallet ? "#10b981" : "#94a3b8"} stopOpacity="0.4" />
            </linearGradient>
          ))}
        </defs>
        {geometry.ribbons.map((ribbon, index) => (
          <motion.path key={index} d={ribbon.d} fill={`url(#${id}-r${index})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: reduce ? 0 : index * 0.04 }} />
        ))}
        {geometry.left.map((item, index) => <rect key={`l${index}`} x="0" y={item.y} width="14" height={item.h} rx="4" fill={FLOW_COLORS[index % FLOW_COLORS.length]} />)}
        {geometry.right.map((item, index) => <rect key={`r${index}`} x="506" y={item.y} width="14" height={item.h} rx="4" className={item.wallet ? "fill-emerald-500" : "fill-slate-400 dark:fill-zinc-500"} />)}
      </svg>
      <ul className="flex h-[230px] flex-col justify-center gap-2.5" aria-label="Where coins went">
        {geometry.right.map((item) => (
          <li key={item.label} className="flex min-w-0 items-start gap-2">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.wallet ? "bg-emerald-500" : "bg-slate-400 dark:bg-zinc-500"}`} aria-hidden="true" />
            <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-slate-800 dark:text-zinc-100">{item.label}</span><span className={`block text-[11.5px] tabular-nums ${muted}`}>{item.amount} coins</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LEVELS = [["Easy", "#10b981", "#34d399"], ["Medium", "#f59e0b", "#fbbf24"], ["Hard", "#e11d48", "#fb7185"]];

/** Solved by difficulty as a gradient donut (3 parts of one whole), the total in the middle. */
export function DifficultyDonut({ levels = {}, size = 172, light = false }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = LEVELS.reduce((sum, [level]) => sum + (levels[level]?.solved || 0), 0);
  const gap = total ? Math.min(6, circumference * 0.015) : 0;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Solved: ${LEVELS.map(([level]) => `${level} ${levels[level]?.solved || 0}`).join(", ")}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>{LEVELS.map(([level, deep, lightStop]) => <linearGradient key={level} id={`${id}-${level}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={lightStop} /><stop offset="1" stopColor={deep} /></linearGradient>)}</defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={light ? "stroke-white/10" : "stroke-slate-100 dark:stroke-white/[0.07]"} />
        {total ? LEVELS.map(([level], index) => {
          const solved = levels[level]?.solved || 0;
          if (!solved) return null;
          const length = Math.max(0, (solved / total) * circumference - gap);
          const start = offset;
          offset += (solved / total) * circumference;
          return (
            <motion.circle key={level} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke={`url(#${id}-${level})`}
              strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-start}
              initial={reduce ? false : { opacity: 0, strokeDasharray: `0 ${circumference}` }} animate={{ opacity: 1, strokeDasharray: `${length} ${circumference}` }} transition={{ duration: 0.8, delay: reduce ? 0 : index * 0.15, ease: EASE }} />
          );
        }) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[30px] font-bold leading-none tabular-nums ${light ? "text-white" : "text-slate-950 dark:text-zinc-50"}`}>{total}</span>
        <span className={`mt-1 text-[11.5px] font-medium ${light ? "text-white/70" : muted}`}>solved</span>
      </div>
    </div>
  );
}

/** Daily practice: submissions as soft bars, accepted as a smooth emerald line, with a hover card. */
export function PracticeChart({ daily = [] }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  if (!daily.length) return <p className={`py-10 text-center text-[13px] ${muted}`}>No submissions in this period.</p>;
  const W = 600, H = 200, pad = 10;
  const max = Math.max(1, ...daily.map((day) => day.attempts));
  const column = W / daily.length;
  const barWidth = Math.max(3, Math.min(18, column * 0.6));
  const x = (index) => column * index + column / 2;
  const y = (value) => H - pad - (value / max) * (H - pad * 2);
  const accepted = smoothPath(daily.map((day, index) => [x(index), y(day.accepted)]));
  const active = hover === null ? null : daily[hover];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[200px] w-full" role="img" aria-label={`Daily practice: ${daily.reduce((sum, day) => sum + day.attempts, 0)} submissions, ${daily.reduce((sum, day) => sum + day.accepted, 0)} accepted`}>
        <defs>
          <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity="0.85" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0.25" /></linearGradient>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity="0.22" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></linearGradient>
          <RevealClip id={`${id}-clip`} width={W} height={H} reduce={reduce} />
        </defs>
        {[0.33, 0.66].map((share) => <line key={share} x1="0" x2={W} y1={H * share} y2={H * share} className="stroke-slate-200 dark:stroke-white/[0.07]" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />)}
        {daily.map((day, index) => (
          <motion.rect key={day.date} x={x(index) - barWidth / 2} width={barWidth} rx={Math.min(4, barWidth / 2)} fill={`url(#${id}-bar)`} opacity={hover !== null && hover !== index ? 0.45 : 1}
            initial={reduce ? false : { y: H - pad, height: 0 }} animate={{ y: y(day.attempts), height: Math.max(0, H - pad - y(day.attempts)) }} transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(0.4, index * 0.01), ease: EASE }} />
        ))}
        <g clipPath={`url(#${id}-clip)`}>
          <path d={`${accepted} L${x(daily.length - 1)},${H - pad} L${x(0)},${H - pad} Z`} fill={`url(#${id}-area)`} />
          <path d={accepted} fill="none" stroke="#10b981" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <div className="absolute inset-x-0 top-0 flex h-[200px]">
        {daily.map((day, index) => <button key={day.date} type="button" aria-label={`${dayText(day.date)}: ${day.attempts} submissions, ${day.accepted} accepted`} className="h-full focus:outline-none focus-visible:bg-sky-500/10" style={{ width: `${100 / daily.length}%` }} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />)}
      </div>
      {active && (
        <div role="tooltip" className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-xl border border-[#e9eaee] bg-white/95 px-3 py-2 text-[12px] shadow-xl dark:border-white/10 dark:bg-[#2c2c2c]/95" style={{ left: `${Math.min(88, Math.max(12, ((x(hover)) / W) * 100))}%` }}>
          <p className="font-semibold text-slate-900 dark:text-white">{dayText(active.date)}</p>
          <p className="mt-0.5 flex justify-between text-slate-600 dark:text-zinc-300"><span>Submissions</span><b className="tabular-nums">{active.attempts}</b></p>
          <p className="flex justify-between text-emerald-700 dark:text-emerald-300"><span>Accepted</span><b className="tabular-nums">{active.accepted}</b></p>
        </div>
      )}
      <div className={`mt-1 flex justify-between text-[11.5px] ${muted}`} aria-hidden="true"><span>{dayText(daily[0].date)}</span><span>{dayText(daily.at(-1).date)}</span></div>
    </div>
  );
}

const OUTCOME = { AC: ["Accepted", "bg-emerald-500"], WA: ["Wrong answer", "bg-rose-500"], TLE: ["Too slow", "bg-amber-500"], RE: ["Crashed", "bg-violet-500"], CE: ["Did not compile", "bg-slate-400"] };

/** How submissions ended, as one 100% bar with a legend. Verdicts: [{ key, name, value }]. */
export function OutcomeBar({ verdicts = [] }) {
  const reduce = useReducedMotion();
  const total = verdicts.reduce((sum, verdict) => sum + verdict.value, 0);
  if (!total) return <p className={`text-[13px] ${muted}`}>No submissions in this period.</p>;
  const rows = verdicts.filter((verdict) => verdict.value > 0).sort((a, b) => b.value - a.value);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full ring-1 ring-inset ring-black/[0.04]" role="img" aria-label={rows.map((row) => `${row.name} ${row.value}`).join(", ")}>
        {rows.map((row, index) => (
          <motion.span key={row.key} className={`${OUTCOME[row.key]?.[1] || "bg-slate-400"} h-full first:rounded-l-full last:rounded-r-full`}
            initial={reduce ? false : { width: 0 }} animate={{ width: `${(row.value / total) * 100}%` }} transition={{ duration: 0.6, delay: reduce ? 0 : index * 0.06, ease: EASE }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 rounded-lg bg-[#f6f7f9] px-2.5 py-2 text-[12.5px] dark:bg-white/[0.04]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${OUTCOME[row.key]?.[1] || "bg-slate-400"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-zinc-300">{OUTCOME[row.key]?.[0] || row.name}</span>
            <span className="font-bold tabular-nums text-slate-900 dark:text-zinc-100">{Math.round((row.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Scores in order (tests, mock interviews) on a 0–100 scale: smooth line, gradient fill, a dot per
 * attempt (green at or above the mark, red below) and a dashed pass line. Points: [{ label, value, at }].
 */
export function ScoreLine({ points = [], target = null, unit = "%" }) {
  const id = useGradientId();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  if (!points.length) return <p className={`py-10 text-center text-[13px] ${muted}`}>Nothing taken in this period yet.</p>;
  const W = 600, H = 200, pad = 16;
  const x = (index) => (points.length === 1 ? W / 2 : pad + (index / (points.length - 1)) * (W - pad * 2));
  const y = (value) => pad + (1 - Math.max(0, Math.min(100, value)) / 100) * (H - pad * 2);
  const xy = points.map((point, index) => [x(index), y(point.value)]);
  const line = smoothPath(xy);
  const active = hover === null ? null : points[hover];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[200px] w-full" role="img" aria-label={points.map((point) => `${point.label} ${point.value}${unit}`).join(", ")}>
        <defs>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0.22" /><stop offset="1" stopColor="#0ea5e9" stopOpacity="0" /></linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0ea5e9" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
          <RevealClip id={`${id}-clip`} width={W} height={H} reduce={reduce} />
        </defs>
        {[25, 50, 75].map((mark) => <line key={mark} x1="0" x2={W} y1={y(mark)} y2={y(mark)} className="stroke-slate-200 dark:stroke-white/[0.07]" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />)}
        {target !== null && <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="stroke-amber-500" strokeWidth="1.6" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
        {points.length > 1 && (
          <g clipPath={`url(#${id}-clip)`}>
            <path d={`${line} L${xy.at(-1)[0]},${H} L${xy[0][0]},${H} Z`} fill={`url(#${id}-area)`} />
            <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {points.map((point, index) => {
        const pass = target === null || point.value >= target;
        return (
          <button key={`${point.label}-${index}`} type="button" aria-label={`${point.label}: ${point.value}${unit}`} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white transition-transform hover:scale-125 focus:outline-none focus-visible:ring-sky-400 dark:ring-[#242424] ${pass ? "bg-emerald-500" : "bg-rose-500"}`}
            style={{ left: `${(x(index) / W) * 100}%`, top: `${y(point.value)}px` }} />
        );
      })}
      {target !== null && <span className="pointer-events-none absolute right-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" style={{ top: `${y(target) - 22}px` }}>Pass {target}{unit}</span>}
      {active && (
        <div role="tooltip" className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 rounded-xl border border-[#e9eaee] bg-white/95 px-3 py-2 text-[12px] shadow-xl dark:border-white/10 dark:bg-[#2c2c2c]/95" style={{ left: `${Math.min(86, Math.max(14, (x(hover) / W) * 100))}%`, top: `${Math.max(0, y(active.value) - 70)}px` }}>
          <p className="truncate font-semibold text-slate-900 dark:text-white">{active.label}</p>
          <p className="mt-0.5 flex justify-between text-slate-600 dark:text-zinc-300"><span>{active.at ? new Date(active.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</span><b className="tabular-nums">{active.value}{unit}</b></p>
        </div>
      )}
    </div>
  );
}

/** Skill ratings (1–5) as rounded gradient bars with the value. Ratings: [{ key, label, value }]. */
export function RatingBars({ ratings = [], max = 5 }) {
  const reduce = useReducedMotion();
  const rated = ratings.filter((rating) => Number(rating.value) > 0);
  if (!rated.length) return <p className={`py-6 text-center text-[13px] ${muted}`}>No rated interviews in this period.</p>;
  const lowest = [...rated].sort((a, b) => a.value - b.value)[0];
  return (
    <ul className="space-y-3">
      {ratings.map((rating, index) => {
        const value = Number(rating.value) || 0;
        const weak = rating.key === lowest.key;
        return (
          <li key={rating.key}>
            <div className="mb-1 flex justify-between text-[12.5px]"><span className={`font-semibold ${weak ? "text-rose-700 dark:text-rose-300" : "text-slate-800 dark:text-zinc-200"}`}>{rating.label}{weak ? " · work on this" : ""}</span><span className="font-bold tabular-nums text-slate-900 dark:text-zinc-100">{value ? value.toFixed(1) : "–"}<span className={`font-medium ${muted}`}> / {max}</span></span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]">
              <motion.div className={`h-full rounded-full bg-gradient-to-r ${weak ? "from-rose-400 to-rose-600" : "from-violet-400 to-violet-600"}`} initial={reduce ? false : { width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: 0.6, delay: reduce ? 0 : index * 0.05, ease: EASE }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** When you practise: a 7 × 24 punch card, dot size = submissions in that hour. */
export function PunchCard({ cells = [] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const lookup = new Map(cells.map((cell) => [`${cell.day}-${cell.hour}`, cell.count]));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {DAYS.map((name, day) => (
          <div key={name} className="flex items-center gap-2">
            <span className={`w-9 shrink-0 text-[11.5px] ${muted}`}>{name}</span>
            <div className="grid flex-1 grid-cols-24 gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = lookup.get(`${day}-${hour}`) || 0;
                const size = count ? 6 + (count / max) * 14 : 3;
                return (
                  <span key={hour} className="flex h-6 items-center justify-center" title={count ? `${name} ${hour}:00 — ${count} submission${count === 1 ? "" : "s"}` : undefined}>
                    <motion.span className={`block rounded-full ${count ? "bg-gradient-to-br from-sky-400 to-violet-600" : "bg-slate-200 dark:bg-white/10"}`} style={{ width: size, height: size }}
                      initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4, delay: reduce ? 0 : (day * 24 + hour) * 0.002 }} />
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <div className={`ml-11 mt-1 flex justify-between text-[11px] ${muted}`} aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
      </div>
    </div>
  );
}
