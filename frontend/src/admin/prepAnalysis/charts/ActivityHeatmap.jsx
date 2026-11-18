import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, CalendarCheck2, CalendarDays, Flame, History, MousePointerClick, Sigma, Users } from "lucide-react";
import { heatmapModel } from "./heatmapModel";
import useWidth from "./useWidth";

// Small square dots, GitHub-style, with dark-mode shades; level 0 is an empty day.
const LEVEL_CLASSES = [
  "bg-slate-100 dark:bg-white/[0.06]",
  "bg-sky-200 dark:bg-sky-900",
  "bg-sky-400 dark:bg-sky-700",
  "bg-sky-600 dark:bg-sky-500",
  "bg-sky-800 dark:bg-sky-300",
];
const GAP = 3;
const DAY_LABEL_WIDTH = 24;
// Figures beside the grid only when both fit (a full-width card); otherwise they go below it.
const RAIL_FROM = 1080;
const RAIL_MIN = 320;
const RAIL_GAP = 20;
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
// The boxes' words per heat map (keyed by the data's unit).
const WORDS = {
  submissions: { thing: "Submissions", who: "Students who practised", last: "Last submission", days: "Days with practice" },
  "topics completed": { thing: "Topics completed", who: "Students who completed a topic", last: "Last topic completed", days: "Days with learning" },
  "sheets started or finished": { thing: "Sheets started/finished", who: "Students who worked on a sheet", last: "Last sheet activity", days: "Days with sheet work" },
  "tests taken": { thing: "Tests taken", who: "Students who took a test", last: "Last test taken", days: "Days with a test" },
  interviews: { thing: "Interviews", who: "Students who had an interview", last: "Last interview", days: "Days with an interview" },
};
const longDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const plain = (value) => Number(value || 0).toLocaleString();

function Stat({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="flex min-h-[32px] items-start gap-1.5 text-[11.5px] font-semibold leading-4 text-slate-600 dark:text-slate-300">
        <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" /><span className="line-clamp-3" title={label}>{label}</span>
      </p>
      {/* Numbers line up across a row even when one label wraps longer. */}
      <p className="mt-auto truncate pt-0.5 text-[18px] font-extrabold tabular-nums leading-6 text-slate-900 dark:text-white">{value}</p>
      {note && <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={note}>{note}</p>}
    </div>
  );
}

/**
 * The daily activity heat map: one small dot per day of the last year (darker = more), months on
 * top, Mon/Wed/Fri on the side, and the period's figures beside it on wide cards (below on narrow
 * ones). Hover (or tap) a day for its count; click a day with activity to list its students.
 * data: { from, to, unit, days: [[day, value]], max }.
 */
export default function ActivityHeatmap({ chart, onPart }) {
  const model = useMemo(() => heatmapModel(chart.data), [chart.data]);
  const [boxRef, width] = useWidth();
  const scrollRef = useRef(null);
  const [tip, setTip] = useState(null);
  const unit = chart.data?.unit || "submissions";
  const wide = width >= RAIL_FROM;
  const weeks = model?.weeks.length || 53;
  // The grid takes what the figures leave; dots stay small (8–12 px) whatever the card's width.
  const gridRoom = (wide ? width - RAIL_GAP - RAIL_MIN : width) - DAY_LABEL_WIDTH;
  const cell = Math.max(8, Math.min(12, Math.floor(gridRoom / weeks) - GAP));
  const railWidth = width - (DAY_LABEL_WIDTH + weeks * (cell + GAP)) - RAIL_GAP;

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
  const columns = `${DAY_LABEL_WIDTH}px repeat(${weeks}, ${cell}px)`;

  // Plain counts an admin reads at a glance. The line above the card names the busiest date, so
  // it is not repeated here. "Students" comes from the chart summary (who did anything on the map).
  // Every label is a full phrase in the feature's own words, so a box reads on its own:
  // "Tests taken in the last 30 days: 0 (since 19 Oct)".
  const words = WORDS[unit] || { thing: unit.charAt(0).toUpperCase() + unit.slice(1), who: "Students with any activity", last: "Last activity", days: "Days with any activity" };
  const students = chart.summary?.students;
  const cohort = chart.summary?.cohort ?? chart.studentCount;
  const lastNote = stats.daysSinceActive === null ? "nothing yet" : stats.daysSinceActive === 0 ? "today" : stats.daysSinceActive === 1 ? "yesterday" : `${plain(stats.daysSinceActive)} days ago`;
  const since = (back) => `since ${shortDate(new Date(Date.parse(`${chart.data.to}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10))}`;
  const figures = (
    <div className={`grid gap-2 ${(wide ? railWidth : width) >= 500 ? "grid-cols-3" : "grid-cols-2"} ${wide ? "flex-1" : ""}`}>
      <Stat icon={Sigma} tone="text-sky-500" label={`${words.thing} in the last 12 months`} value={plain(stats.total)} note="all students together" />
      {Number.isFinite(students)
        ? <Stat icon={Users} tone="text-violet-500" label={words.who} value={plain(students)} note={`out of ${plain(cohort)} students`} />
        : <Stat icon={Flame} tone="text-violet-500" label="Most days in a row" value={`${plain(stats.bestStreak)} ${stats.bestStreak === 1 ? "day" : "days"}`} note="in the last 12 months" />}
      <Stat icon={History} tone="text-slate-500" label={words.last} value={stats.lastActive ? shortDate(stats.lastActive) : "None yet"} note={lastNote} />
      <Stat icon={CalendarDays} tone="text-emerald-500" label={`${words.thing} in the last 7 days`} value={plain(stats.last7)} note={since(6)} />
      <Stat icon={Activity} tone="text-cyan-500" label={`${words.thing} in the last 30 days`} value={plain(stats.last30)} note={since(29)} />
      <Stat icon={CalendarCheck2} tone="text-amber-500" label={words.days} value={plain(stats.activeDays)} note={`out of the last ${plain(stats.days)} days`} />
    </div>
  );

  return (
    <div ref={boxRef} className="min-w-0">
      <div className={wide ? "flex items-start gap-5" : "space-y-3"}>
        <div className="min-w-0 shrink-0">
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
            <div className="inline-grid" style={{ gridTemplateColumns: columns, gridTemplateRows: `14px repeat(7, ${cell}px)`, gap: GAP }} role="grid" aria-label={`${chart.title}: ${plain(stats.total)} ${unit} on ${plain(stats.activeDays)} days`}>
              {model.months.map((month) => (
                <span key={`${month.index}-${month.label}`} style={{ gridColumn: `${month.index + 2} / span 4`, gridRow: 1 }}
                  className="self-end whitespace-nowrap text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400">{month.label}</span>
              ))}
              {/* Weekday names stay put while a narrow card scrolls the weeks under them. */}
              <span aria-hidden="true" style={{ gridColumn: 1, gridRow: "1 / span 8", width: DAY_LABEL_WIDTH + GAP, gridTemplateRows: `14px repeat(7, ${cell}px)`, rowGap: GAP }}
                className="sticky left-0 z-[1] grid bg-white dark:bg-gray-900">
                {WEEKDAYS.map((label, index) => <span key={index} className="flex items-center text-[9.5px] leading-none text-slate-400 dark:text-slate-500" style={{ gridRow: index + 2 }}>{label}</span>)}
              </span>
              {model.weeks.flatMap((week, weekIndex) => week.map((day, weekday) => day && (
                <span key={day.day} data-day={day.day} data-value={day.value} role="gridcell" tabIndex={day.value > 0 && onPart ? 0 : -1}
                  aria-label={`${longDate(day.day)}: ${plain(day.value)} ${unit}`}
                  style={{ gridColumn: weekIndex + 2, gridRow: weekday + 2 }}
                  className={`rounded-[3px] ${LEVEL_CLASSES[day.level]} ${day.value > 0 && onPart ? "cursor-pointer" : ""} ${tip?.day === day.day ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900" : "hover:ring-2 hover:ring-sky-400/70"} outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-sky-500`} />
              )))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] text-slate-500 dark:text-slate-400" style={{ paddingLeft: DAY_LABEL_WIDTH }}>
            {onPart ? <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" aria-hidden="true" />Click a day to see who practised</span> : <span />}
            <span className="inline-flex items-center gap-1" aria-label={`Less to more ${unit} per day`}>
              Less
              {model.legend.map((entry) => <span key={entry.level} title={`${entry.label} ${unit}`} className={`h-[10px] w-[10px] rounded-[3px] ${LEVEL_CLASSES[entry.level]}`} />)}
              More
            </span>
          </div>
        </div>
        {figures}
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
