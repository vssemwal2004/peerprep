import { useId } from "react";
import { ChevronRight, TrendingDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import useWidth from "./useWidth";

const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const plain = (value) => Number(value || 0).toLocaleString();
// One colour per step, from sky to violet, so each band reads as its own step.
const STEP_COLORS = ["#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c026d3"];
const BAND_HEIGHT = 40;
const NECK_HEIGHT = 40;
// Width of a band in % of the funnel column. A square-root scale with a floor keeps small steps
// visible (25 of 589 is not a 4% sliver); the real numbers are always in the figures columns.
const widthOf = (value, top) => (top ? 16 + 84 * Math.sqrt(Math.max(0, value) / top) : 16);

/** The curved neck between two bands: from width `a` (top) to width `b` (bottom), in a 0–100 box. */
const neckPath = (a, b) => {
  const left = (width) => 50 - width / 2;
  const right = (width) => 50 + width / 2;
  return `M ${left(a)} 0 C ${left(a)} 55, ${left(b)} 45, ${left(b)} 100 L ${right(b)} 100 C ${right(b)} 45, ${right(a)} 55, ${right(a)} 0 Z`;
};

/**
 * "How far students get" as a real funnel: a coloured band per step, narrowing step by step through
 * curved necks. In each neck, a "Spot the gap" button lists exactly the students who reached the
 * step above but not the one below (to download or email them). Step names sit in a fixed column on
 * the left, the figures in fixed "Students" and "% of first" columns on the right.
 * data: { stages: [{ name, value }], drops: [{ key, from, to, students }] }.
 */
// Below this card width (phones, narrow grid cells) the columns shrink and the gap buttons go short.
const COMPACT_BELOW = 520;

export default function FunnelSteps({ chart, onPart, height }) {
  const reduced = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");
  const [boxRef, boxWidth] = useWidth();
  const stages = chart.data?.stages || [];
  const drops = chart.data?.drops || [];
  const top = stages[0]?.value || 0;
  if (!top) return null;
  const compact = boxWidth > 0 && boxWidth < COMPACT_BELOW;
  const widths = stages.map((stage) => widthOf(stage.value, top));
  const color = (index) => STEP_COLORS[index % STEP_COLORS.length];
  const openStep = (stage, index) => onPart?.({ key: String(index), label: stage.name, value: stage.value, unit: "students", students: stage.value });
  const openDrop = (drop) => onPart?.({ key: drop.key, label: `Reached “${drop.from}”, not “${drop.to}”`, value: drop.students, unit: "students", students: drop.students });
  const columns = compact
    ? "grid grid-cols-[minmax(64px,88px)_minmax(0,1fr)_60px] items-center gap-2"
    : "grid grid-cols-[minmax(96px,132px)_minmax(0,1fr)_118px] items-center gap-3";
  // The funnel column's width in px, so a band only carries its % label when the label fits.
  const funnelPx = boxWidth ? boxWidth - (compact ? 88 + 60 + 16 : 132 + 118 + 24) : 0;
  const labelFits = (index) => (funnelPx ? (widths[index] / 100) * funnelPx >= 52 : widths[index] >= 30);

  return (
    <div ref={boxRef} style={{ minHeight: height }} className="flex flex-col justify-center" role="list" aria-label={chart.title}>
      <div className={`${columns} pb-1 text-[9.5px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500`} aria-hidden="true">
        <span className="text-right">Step</span>
        <span className="truncate text-center">{compact ? "Funnel" : "Students at each step · gaps between"}</span>
        {compact
          ? <span className="text-right">Students</span>
          : <span className="grid grid-cols-[52px_66px] text-right"><span>Students</span><span>% of first</span></span>}
      </div>

      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          {stages.slice(1).map((_, index) => (
            <linearGradient key={index} id={`${gradientId}-neck-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color(index)} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color(index + 1)} stopOpacity="0.32" />
            </linearGradient>
          ))}
        </defs>
      </svg>

      {stages.map((stage, index) => {
        const share = percentOf(stage.value, top);
        const drop = index ? drops[index - 1] : null;
        return (
          <div key={stage.name} role="listitem">
            {drop && (
              <div className={columns} style={{ height: NECK_HEIGHT }}>
                <span aria-hidden="true" />
                <div className="relative h-full">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <path d={neckPath(widths[index - 1], widths[index])} fill={`url(#${gradientId}-neck-${index - 1})`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {drop.students > 0 && onPart ? (
                      <button type="button" onClick={() => openDrop(drop)}
                        title={`See the ${plain(drop.students)} students who reached “${drop.from}” but not “${drop.to}”, to download or email them`}
                        aria-label={`${plain(drop.students)} students dropped between “${drop.from}” and “${drop.to}”. Spot the gap`}
                        className={`group relative z-10 inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-rose-200 bg-white/95 text-[11px] font-semibold text-slate-600 shadow-[0_4px_14px_-4px_rgba(244,63,94,0.35)] backdrop-blur transition hover:-translate-y-px hover:border-rose-300 hover:shadow-[0_8px_20px_-6px_rgba(244,63,94,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-500/40 dark:bg-gray-900/95 dark:text-slate-300 ${compact ? "gap-1 pl-2 pr-1" : "gap-1.5 px-3"}`}>
                        <TrendingDown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                        <b className="tabular-nums text-rose-600 dark:text-rose-400">{plain(drop.students)}</b>
                        {!compact && <span>dropped · {percentOf(drop.students, stages[index - 1].value)}%</span>}
                        <span className="ml-0.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-rose-500 px-2 py-0.5 text-[10.5px] font-bold text-white group-hover:bg-rose-600">
                          Spot the gap<ChevronRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </button>
                    ) : (
                      <span className="relative z-10 shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{compact ? "No drop" : "No one dropped here"}</span>
                    )}
                  </div>
                </div>
                <span aria-hidden="true" />
              </div>
            )}

            <button type="button" onClick={() => openStep(stage, index)} disabled={!onPart}
              className={`${columns} group w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default`}
              style={{ height: BAND_HEIGHT }}
              title={onPart ? `See the ${plain(stage.value)} students who reached “${stage.name}”` : undefined}>
              <span className={`text-right font-semibold text-slate-700 group-hover:text-slate-950 dark:text-slate-200 dark:group-hover:text-white ${compact ? "line-clamp-2 text-[11.5px] leading-tight" : "truncate text-[12.5px]"}`}>{stage.name}</span>
              <span className="relative block h-full">
                <motion.span
                  className="absolute inset-y-0 left-1/2 flex items-center justify-center overflow-hidden rounded-xl shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)] ring-1 ring-white/40 transition-[filter] group-hover:brightness-110 dark:ring-white/10"
                  style={{ backgroundImage: `linear-gradient(90deg, ${color(index)}c7, ${color(index)} 50%, ${color(index)}c7)` }}
                  initial={reduced ? false : { width: 0, x: "-50%" }}
                  animate={{ width: `${widths[index]}%`, x: "-50%" }}
                  transition={{ duration: 0.65, delay: reduced ? 0 : index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  {labelFits(index) && <span className="px-2 text-[11px] font-bold tabular-nums text-white/95 drop-shadow-sm">{share}%</span>}
                </motion.span>
              </span>
              {compact ? (
                <span className="flex flex-col items-end text-right tabular-nums leading-tight">
                  <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{plain(stage.value)}</span>
                  <span className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">{share}%</span>
                </span>
              ) : (
                <span className="grid grid-cols-[52px_66px] text-right text-[12.5px] tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-white">{plain(stage.value)}</span>
                  <span className="font-semibold text-slate-400 dark:text-slate-500">{share}%</span>
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
