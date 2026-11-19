import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MousePointerClick } from "lucide-react";
import { heatmapModel } from "./heatmapModel";
import useWidth from "./useWidth";

// Square dots, GitHub-style. High contrast: an empty day is a pale outlined square, and each level
// is a clearly darker sky (lighter in dark mode, where brighter means more).
const LEVEL_CLASSES = [
  "bg-slate-100 ring-1 ring-inset ring-slate-200/80 dark:bg-white/[0.05] dark:ring-white/[0.06]",
  "bg-sky-300 dark:bg-sky-900",
  "bg-sky-500 dark:bg-sky-700",
  "bg-sky-700 dark:bg-sky-500",
  "bg-sky-950 dark:bg-sky-300",
];
const DAY_LABEL_WIDTH = 24;
const MIN_CELL = 8;
// Largest day square: compact; on a wide card the weeks still spread across the full width.
const MAX_CELL = 14;
// Space between two months (on top of the normal gap between columns).
const MONTH_GAP = 6;
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const longDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const plain = (value) => Number(value || 0).toLocaleString();

/**
 * The daily activity heat map across the full card width: one square per day of the last year
 * (darker = more), months on top, Mon/Wed/Fri on the side. No count boxes beside it (the line
 * above the card already names the busiest day). Hover (or tap) a day for its count; click a day
 * with activity to list its students. data: { from, to, unit, days: [[day, value]], max }.
 */
export default function ActivityHeatmap({ chart, onPart }) {
  const model = useMemo(() => heatmapModel(chart.data), [chart.data]);
  const [boxRef, width] = useWidth();
  const scrollRef = useRef(null);
  const [tip, setTip] = useState(null);
  const unit = chart.data?.unit || "submissions";
  const blocks = useMemo(() => model?.columns || [], [model]);
  const monthGaps = blocks.filter((column) => column.startsMonth).length;
  // Each day column gets an equal share of the width left after the month gaps; days are square,
  // up to MAX_CELL. Too narrow for 8 px days: fixed small squares that scroll sideways instead.
  const share = Math.floor((width - DAY_LABEL_WIDTH - monthGaps * (MONTH_GAP + 3)) / Math.max(1, blocks.length || 53));
  const GAP = share >= 18 ? 4 : 3;
  const fits = share - GAP >= MIN_CELL;
  const cell = fits ? Math.min(MAX_CELL, share - GAP) : MIN_CELL;
  // Grid tracks: the weekday labels, then each day column, with a narrow empty track before the
  // first column of every month. trackOf[i] is the grid column (1-based) of day column i.
  const { template, trackOf } = useMemo(() => {
    const day = fits ? `minmax(${MIN_CELL}px, 1fr)` : `${cell}px`;
    const tracks = [`${DAY_LABEL_WIDTH}px`];
    const positions = [];
    blocks.forEach((column) => {
      if (column.startsMonth) tracks.push(`${MONTH_GAP}px`);
      tracks.push(day);
      positions.push(tracks.length);
    });
    return { template: tracks.join(" "), trackOf: positions };
  }, [blocks, fits, cell]);

  // The latest weeks are the ones that matter: a narrow card starts scrolled to the right.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [model, cell]);
  const hideTip = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip) return undefined;
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", hideTip);
    return () => { window.removeEventListener("scroll", hideTip, true); window.removeEventListener("resize", hideTip); };
  }, [tip, hideTip]);

  if (!model) return null;
  const { stats } = model;
  const busiestDay = stats.busiest?.day || null;
  const cellAt = (event) => event.target?.closest?.("[data-day]");
  const showTip = (node) => {
    if (!node) { hideTip(); return; }
    const rect = node.getBoundingClientRect();
    setTip({ day: node.dataset.day, value: Number(node.dataset.value), x: rect.left + rect.width / 2, y: rect.top });
  };
  const open = (node) => {
    const value = Number(node?.dataset.value);
    if (!node || !(value > 0) || !onPart) return;
    onPart({ key: node.dataset.day, label: longDate(node.dataset.day), value, unit });
  };
  const radius = "rounded-[3px]";

  return (
    <div ref={boxRef} className="min-w-0">
      <div>
        <div className="min-w-0">
          <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
            onPointerOver={(event) => { if (event.pointerType !== "touch") showTip(cellAt(event)); }}
            onPointerLeave={(event) => { if (event.pointerType !== "touch") hideTip(); }}
            onClick={(event) => {
              const node = cellAt(event);
              // Touch: the first tap shows the day, a second tap on it lists its students.
              if (event.nativeEvent?.pointerType === "touch" && tip?.day !== node?.dataset.day) { showTip(node); return; }
              open(node);
            }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { const node = cellAt(event); if (node) { event.preventDefault(); open(node); } } }}
            onFocus={(event) => showTip(cellAt(event))} onBlur={hideTip}>
            <div data-tour="heat-grid" className={fits ? "grid w-full" : "inline-grid"} style={{ gridTemplateColumns: template, gridTemplateRows: `14px repeat(7, ${cell}px)`, gap: GAP }} role="grid" aria-label={`${chart.title}: ${plain(stats.total)} ${unit} on ${plain(stats.activeDays)} days`}>
              {blocks.map((column, index) => column.label && (
                <span key={`label-${column.month}`} style={{ gridColumn: `${trackOf[index]} / span 3`, gridRow: 1 }}
                  className="self-end whitespace-nowrap text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400">{column.label}</span>
              ))}
              {/* Weekday names stay put while a narrow card scrolls the weeks under them. */}
              <span aria-hidden="true" style={{ gridColumn: 1, gridRow: "1 / span 8", width: DAY_LABEL_WIDTH + GAP, gridTemplateRows: `14px repeat(7, ${cell}px)`, rowGap: GAP }}
                className="sticky left-0 z-[1] grid bg-white dark:bg-gray-900">
                {WEEKDAYS.map((label, index) => <span key={index} className="flex items-center text-[9.5px] leading-none text-slate-400 dark:text-slate-500" style={{ gridRow: index + 2 }}>{label}</span>)}
              </span>
              {blocks.flatMap((column, columnIndex) => column.cells.map((day, weekday) => day && (
                <span key={day.day} data-day={day.day} data-value={day.value} role="gridcell" data-tour={day.day === busiestDay ? "heat-busiest" : undefined} tabIndex={day.value > 0 && onPart ? 0 : -1}
                  aria-label={`${longDate(day.day)}: ${plain(day.value)} ${unit}`}
                  // Always a square: centred in its (possibly wider) column.
                  style={{ gridColumn: trackOf[columnIndex], gridRow: weekday + 2, width: cell, height: cell, justifySelf: "center" }}
                  className={`${radius} ${LEVEL_CLASSES[day.level]} ${day.value > 0 && onPart ? "cursor-pointer" : ""} ${tip?.day === day.day ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900" : "hover:ring-2 hover:ring-sky-400/70"} outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-sky-500`} />
              )))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] text-slate-500 dark:text-slate-400" style={{ paddingLeft: DAY_LABEL_WIDTH }}>
            {onPart ? <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" aria-hidden="true" />Click a day to see who practised</span> : <span />}
            <span className="inline-flex items-center gap-1" aria-label={`Less to more ${unit} per day`} data-tour="heat-legend">
              Less
              {model.legend.map((entry) => <span key={entry.level} title={`${entry.label} ${unit}`} className={`h-[10px] w-[10px] rounded-[3px] ${LEVEL_CLASSES[entry.level]}`} />)}
              More
            </span>
          </div>
        </div>
      </div>

      {tip && typeof document !== "undefined" && createPortal(
        <div role="tooltip" className="pointer-events-none fixed z-[10000] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-slate-300"
          style={{ left: Math.min(Math.max(tip.x, 90), window.innerWidth - 90), top: tip.y - 6 }}>
          <span className="font-semibold text-slate-900 dark:text-white">{longDate(tip.day)}</span>
          <span className="block"><b className="tabular-nums text-slate-900 dark:text-white">{plain(tip.value)}</b> {unit}{tip.value > 0 && onPart ? " · click to see who" : ""}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}
