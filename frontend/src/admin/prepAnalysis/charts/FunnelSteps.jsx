import { useId } from "react";
import { ChevronRight, TrendingDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import useWidth from "./useWidth";

const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const plain = (value) => Number(value || 0).toLocaleString();
// One colour per step, from sky to violet, so each band reads as its own step.
const STEP_COLORS = ["#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#c026d3"];
// Slim bands with room between them for the drop-off pill.
const BAND_HEIGHT = 26;
const NECK_HEIGHT = 36;
// Width of a band in % of the funnel column. A square-root scale with a floor keeps small steps
// visible (25 of 589 is not a 4% sliver); the real numbers are always in the figures columns.
const widthOf = (value, top) => (top ? 14 + 86 * Math.sqrt(Math.max(0, value) / top) : 14);

/** The curved neck between two bands: from width `a` (top) to width `b` (bottom), in a 0–100 box. */
const neckPath = (a, b) => {
  const left = (width) => 50 - width / 2;
  const right = (width) => 50 + width / 2;
  return `M ${left(a)} 0 C ${left(a)} 55, ${left(b)} 45, ${left(b)} 100 L ${right(b)} 100 C ${right(b)} 45, ${right(a)} 55, ${right(a)} 0 Z`;
};

// Below this card width (phones, narrow grid cells) the columns shrink and the gap buttons go short.
const COMPACT_BELOW = 560;

/**
 * A step-by-step funnel ("Practice journey" and the other features' journeys): a numbered step
 * name on the left, a slim band per step narrowing through curved necks, and fixed "Students" and
 * "% of all" columns on the right. In each neck, "Spot the gap" lists exactly the students who
 * reached the step above but not the one below (to download or email them).
 * data: { stages: [{ name, value }], drops: [{ key, from, to, label?, students }] }.
 */
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
  const gapText = (drop) => drop.label || `Reached “${drop.from}”, not “${drop.to}”`;
  const openDrop = (drop) => onPart?.({ key: drop.key, label: gapText(drop), value: drop.students, unit: "students", students: drop.students });
  const nameColumn = compact ? 112 : 176;
  const figureColumn = compact ? 64 : 132;
  const columns = `grid items-center ${compact ? "gap-2" : "gap-4"}`;
  const template = { gridTemplateColumns: `${nameColumn}px minmax(0,1fr) ${figureColumn}px` };
  // The funnel column's width in px, so a band only carries its % label when the label fits.
  const funnelPx = boxWidth ? boxWidth - nameColumn - figureColumn - (compact ? 16 : 32) : 0;
  const labelFits = (index) => (funnelPx ? (widths[index] / 100) * funnelPx >= 56 : widths[index] >= 30);
  const figures = compact ? "flex flex-col items-end text-right leading-tight" : "grid grid-cols-[60px_72px] items-center text-right";

  return (
    <div ref={boxRef} style={{ minHeight: height }} className="flex flex-col justify-center" role="list" aria-label={chart.title}>
      <div className={`${columns} border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:border-white/[0.06] dark:text-slate-400`} style={template} aria-hidden="true">
        <span>Step</span>
        <span className="truncate text-center">{compact ? "Students" : "Students reaching each step"}</span>
        {compact ? <span className="text-right">Count</span> : <span className={figures}><span>Students</span><span>% of all</span></span>}
      </div>

      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          {stages.slice(1).map((_, index) => (
            <linearGradient key={index} id={`${gradientId}-neck-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color(index)} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color(index + 1)} stopOpacity="0.22" />
            </linearGradient>
          ))}
        </defs>
      </svg>

      <div className="pt-2">
        {stages.map((stage, index) => {
          const share = percentOf(stage.value, top);
          const drop = index ? drops[index - 1] : null;
          return (
            <div key={stage.name} role="listitem">
              {drop && (
                <div className={columns} style={{ ...template, height: NECK_HEIGHT }}>
                  <span aria-hidden="true" />
                  <div className="relative h-full">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                      <path d={neckPath(widths[index - 1], widths[index])} fill={`url(#${gradientId}-neck-${index - 1})`} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      {drop.students > 0 && onPart ? (
                        <button type="button" onClick={() => openDrop(drop)} data-tour={`funnel-gap-${index}`}
                          title={`${gapText(drop)}: ${plain(drop.students)} students. Open the list to download or email them`}
                          aria-label={`${plain(drop.students)} students: ${gapText(drop)}. Spot the gap`}
                          className={`group relative z-10 inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-rose-200 bg-white text-[12px] font-semibold text-slate-700 shadow-[0_4px_14px_-6px_rgba(244,63,94,0.45)] transition hover:-translate-y-px hover:border-rose-300 hover:shadow-[0_8px_20px_-8px_rgba(244,63,94,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-500/40 dark:bg-gray-900 dark:text-slate-200 ${compact ? "gap-1 pl-2 pr-1" : "gap-1.5 pl-3 pr-1"}`}>
                          <TrendingDown className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                          <b className="tabular-nums text-rose-600 dark:text-rose-400">{plain(drop.students)}</b>
                          {!compact && <span className="text-slate-500 dark:text-slate-400">stopped · {percentOf(drop.students, stages[index - 1].value)}%</span>}
                          <span className="ml-0.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white group-hover:bg-rose-600">
                            Spot the gap<ChevronRight className="h-3 w-3" aria-hidden="true" />
                          </span>
                        </button>
                      ) : (
                        <span className="relative z-10 shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{compact ? "No drop" : "No one stopped here"}</span>
                      )}
                    </div>
                  </div>
                  <span aria-hidden="true" />
                </div>
              )}

              <button type="button" onClick={() => openStep(stage, index)} disabled={!onPart} data-tour={`funnel-step-${index}`}
                className={`${columns} group w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default`}
                style={{ ...template, height: BAND_HEIGHT }}
                title={onPart ? `See the ${plain(stage.value)} students who reached “${stage.name}”` : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white" style={{ backgroundColor: color(index) }} aria-hidden="true">{index + 1}</span>
                  <span className={`min-w-0 font-semibold text-slate-800 group-hover:text-slate-950 dark:text-slate-100 dark:group-hover:text-white ${compact ? "line-clamp-2 text-[12px] leading-tight" : "truncate text-[13.5px]"}`}>{stage.name}</span>
                </span>
                <span className="relative block h-full">
                  <motion.span
                    className="absolute inset-y-0 left-1/2 flex items-center justify-center overflow-hidden rounded-full shadow-[0_4px_12px_-6px_rgba(15,23,42,0.45)] transition-[filter] group-hover:brightness-110"
                    style={{ backgroundImage: `linear-gradient(90deg, ${color(index)}d9, ${color(index)} 50%, ${color(index)}d9)` }}
                    initial={reduced ? false : { width: 0, x: "-50%" }}
                    animate={{ width: `${widths[index]}%`, x: "-50%" }}
                    transition={{ duration: 0.65, delay: reduced ? 0 : index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {labelFits(index) && <span className="px-2 text-[11.5px] font-bold tabular-nums text-white">{share}%</span>}
                  </motion.span>
                </span>
                <span className={`${figures} tabular-nums`} data-tour={`funnel-figures-${index}`}>
                  <span className="text-[14px] font-bold text-slate-900 dark:text-white">{plain(stage.value)}</span>
                  <span className={`${compact ? "text-[11px]" : "text-[13px]"} font-semibold text-slate-500 dark:text-slate-400`}>{share}%</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
