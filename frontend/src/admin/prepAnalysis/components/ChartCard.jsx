import { useCallback, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3, BarChartHorizontal, CalendarDays, Columns3, EyeOff, FileSpreadsheet, Filter, Funnel, Grid3x3, Image as ImageIcon, Info, LineChart,
  ListOrdered, Maximize2, MoreHorizontal, Percent, PieChart, Radar, Sheet, SlidersHorizontal, Sparkles, Table2, TrendingUp, Users,
} from "lucide-react";
import EChart from "../charts/EChart";
import { chartInsight } from "../charts/chartInsights";
import { buildChartOption, chartHeight, chartTable, viewsFor } from "../charts/chartOptions";
import { ALL_STUDENTS, chartPartAt, chartTableKeys, legendParts, naturalHeight, rowAt, trendPart } from "../charts/chartParts";
import { chartTheme, isDarkMode } from "../charts/chartTheme";
import { useChartDownload } from "../chartActions";
import { PartLegend } from "./Motion";
import { sectionStyle } from "./sectionStyles";
import { IconButton, Popover, focusRing } from "./ui";

const SIZE_SPANS = {
  sm: "col-span-12 md:col-span-6 xl:col-span-4",
  md: "col-span-12 md:col-span-6",
  lg: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};
const SIZES = [{ value: "sm", label: "Small" }, { value: "md", label: "Half" }, { value: "lg", label: "Wide" }, { value: "full", label: "Full" }];
// Each way of showing a chart as an icon; the label is its tooltip.
const CHART_ICONS = { rankedStackedBar: BarChartHorizontal, barList: BarChartHorizontal, donut: PieChart, trend: LineChart, funnel: ListOrdered, histogram: BarChart3, stackedBar: BarChart3, heatmap: Grid3x3, calendar: CalendarDays, radar: Radar };
const VIEW_ICONS = { table: Table2, bars: BarChartHorizontal, funnel: Funnel, percent: Percent, grouped: Columns3, weekly: TrendingUp };
const viewIcon = (type, view) => (view === "chart" ? CHART_ICONS[type] : VIEW_ICONS[view]) || BarChart3;

// Student rows of ranked lists open the student; every other click is about a part.
const studentIdAt = (chart, index) => (chart.type === "barList" && !chart.data?.items?.[index]?.key ? chart.data?.items?.[index]?.id : null);
const DONUT_LEGEND = new Set(["donut"]);

function saveFile(name, href) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
const fileName = (chart, extension) => `${chart.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${extension}`;

/** The chart's figures as a table. A row opens its student, or its part when it stands for one. */
export function ChartTable({ chart, height, onStudent, onPart, search = "" }) {
  const { columns, rows, ids = [] } = useMemo(() => chartTable(chart), [chart]);
  const keys = useMemo(() => (chart.drillable ? chartTableKeys(chart) : []), [chart]);
  const needle = search.trim().toLowerCase();
  const shown = useMemo(() => rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => !needle || row.some((cell) => typeof cell === "string" && cell.toLowerCase().includes(needle))), [needle, rows]);
  if (!rows.length) return <EmptyChart height={Math.min(height, 260)} />;
  return (
    <div style={{ maxHeight: height }} className="overflow-auto rounded-lg border border-slate-100 dark:border-white/[0.06]">
      <table data-no-serial className="min-w-full text-[11.5px]">
        <thead className="sticky top-0 bg-slate-50 text-[10.5px] text-slate-500 dark:bg-gray-900 dark:text-slate-400">
          <tr>{columns.map((column) => <th key={column.label} scope="col" className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${column.numeric ? "text-right" : "text-left"}`}>{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {shown.map(({ row, index }) => {
            const id = ids[index];
            const key = keys[index];
            const open = id && onStudent ? () => onStudent(id) : key && onPart ? () => onPart({ key, label: String(row[0]) }) : undefined;
            return (
              <tr key={index} onClick={open} tabIndex={open ? 0 : undefined} onKeyDown={open ? (event) => { if (event.key === "Enter") open(); } : undefined}
                className={open ? "cursor-pointer transition-colors hover:bg-sky-50/70 focus:bg-sky-50 focus:outline-none dark:hover:bg-sky-500/10" : ""}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={`px-2.5 py-1.5 ${columns[cellIndex]?.numeric ? "text-right font-semibold tabular-nums text-slate-900 dark:text-white" : "max-w-[260px] truncate text-slate-700 dark:text-slate-200"}`}>
                    {typeof cell === "number" ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            );
          })}
          {!shown.length && <tr><td colSpan={columns.length} className="px-2.5 py-4 text-center text-slate-500">Nothing matches “{search}”.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Nothing to draw. When the chart still covers students, they can be listed and downloaded. */
function EmptyChart({ height, students = 0, onList }) {
  return (
    <div style={{ height: Math.min(height, 240) }} className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-slate-50/70 text-center dark:bg-white/[0.02]">
      <BarChart3 className="h-5 w-5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">{students ? "No activity for these students" : "No activity here yet"}</p>
      {students > 0 && onList
        ? <button type="button" onClick={onList} className={`mt-1 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-sky-700 ${focusRing}`}><Users className="h-3.5 w-3.5" />See the {students.toLocaleString()} students</button>
        : <p className="max-w-[240px] text-[10.5px] leading-4 text-slate-400">Try a longer period or fewer filters.</p>}
    </div>
  );
}

// Horizontal charts whose whole row (bar, label or empty track) is one student or part.
const ROW_CHARTS = new Set(["rankedStackedBar", "barList", "stackedBar"]);
const rowView = (chart, view) => ROW_CHARTS.has(chart.type) && (chart.type !== "stackedBar" || chart.data?.horizontal) && view !== "table"
  && !(chart.type === "stackedBar" && view === "grouped");

/**
 * A chart in a view, with its colour legend. A student row opens the student (onStudent); a
 * bar, slice, legend chip, row label, topic name or week opens that part (onPart); empty
 * space calls onBlank (the card opens its full page). Long lists scroll inside `height`.
 */
export function ChartBody({ chart, height, view = "chart", onStudent, onPart, onBlank, instanceRef, search }) {
  const buildOption = useCallback((theme) => buildChartOption(chart, theme, view), [chart, view]);
  const hasData = useMemo(() => Boolean(buildChartOption(chart, chartTheme(false), view === "table" ? "chart" : view)), [chart, view]);
  const legend = useMemo(() => (view === "chart" || view === "percent" || view === "grouped" ? legendParts(chart) : []), [chart, view]);
  const partClick = chart.drillable ? onPart : undefined;
  const openRow = useCallback((row) => {
    if (row?.studentId && onStudent) { onStudent(row.studentId); return true; }
    if (row?.part && partClick) { partClick(row.part); return true; }
    return false;
  }, [onStudent, partClick]);
  const onClick = useCallback((params) => {
    if (params.componentType === "yAxis" && openRow(rowAt(chart, view, Number(params.value)))) return;
    const id = studentIdAt(chart, params.dataIndex);
    if (id && onStudent) { onStudent(id); return; }
    const part = partClick ? chartPartAt(chart, view, params) : null;
    if (part) partClick(part);
    else onBlank?.();
  }, [chart, onBlank, onStudent, openRow, partClick, view]);
  // A row's empty track is that row; a trend's whole column is its week; elsewhere opens the full page.
  const onBlankClick = useCallback((point, instance) => {
    if (instance.containPixel("grid", [point.x, point.y])) {
      // A grid finder gives [x value, y value]; on a category axis the value is the row or column index.
      const [column, row] = instance.convertFromPixel({ gridIndex: 0 }, [point.x, point.y]) || [];
      if (rowView(chart, view) && openRow(rowAt(chart, view, Math.round(row)))) return;
      if (partClick && chart.type === "trend") {
        const index = Math.round(column);
        const part = Number.isInteger(index) ? trendPart(chart, index) : null;
        if (part) { partClick(part); return; }
      }
    }
    onBlank?.();
  }, [chart, onBlank, openRow, partClick, view]);
  if (view === "table") return <ChartTable chart={chart} height={height} onStudent={onStudent} onPart={partClick} search={search} />;
  if (!hasData) return <EmptyChart height={height} students={chart.studentCount} onList={onPart ? () => onPart({ key: ALL_STUDENTS, label: "Students in view" }) : undefined} />;
  // Every row keeps its room; beyond the card's height the rows scroll.
  const natural = naturalHeight(chart, view);
  const scrolls = natural && natural > height;
  const echart = <EChart buildOption={buildOption} height={scrolls ? natural : height} ariaLabel={`${chart.title}: ${chart.question}`} onClick={onClick} onBlankClick={onBlank || partClick || onStudent ? onBlankClick : undefined} instanceRef={instanceRef} />;
  const canvas = scrolls
    ? <div style={{ maxHeight: height }} className="overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">{echart}</div>
    : echart;
  if (!legend.length) return canvas;
  if (DONUT_LEGEND.has(chart.type)) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">{canvas}</div>
        <div className="sm:w-[42%] sm:max-w-[200px]"><PartLegend parts={legend} onPart={partClick} vertical /></div>
      </div>
    );
  }
  return <div><PartLegend parts={legend} onPart={partClick} />{canvas}</div>;
}

function MenuItem({ icon: Icon, children, onClick, tone, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${tone === "danger" ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]"} ${focusRing}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />{children}
    </button>
  );
}

function CardMenu({ chart, view, size, onSize, onSettings, onOpen, onRemove, onDownload, instanceRef }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const run = (action) => () => { setOpen(false); action(); };
  const saveImage = () => {
    const url = instanceRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: isDarkMode() ? "#111827" : "#ffffff" });
    if (url) saveFile(fileName(chart, "png"), url);
  };
  return (
    <>
      <span ref={anchorRef} className="inline-flex"><IconButton label="More options" onClick={() => setOpen(true)}><MoreHorizontal className="h-4 w-4" /></IconButton></span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={220} label={`${chart.title} options`}>
        <div className="p-1.5">
          <MenuItem icon={Maximize2} onClick={run(onOpen)}>Open full page</MenuItem>
          <MenuItem icon={SlidersHorizontal} onClick={run(onSettings)}>Settings</MenuItem>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <MenuItem icon={FileSpreadsheet} onClick={run(() => onDownload("xlsx"))}>Download Excel</MenuItem>
          <MenuItem icon={Sheet} onClick={run(() => onDownload("csv"))}>Download CSV</MenuItem>
          <MenuItem icon={ImageIcon} onClick={run(saveImage)} disabled={view === "table"}>Save image</MenuItem>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <div className="grid grid-cols-4 gap-1 px-1.5 py-1" role="group" aria-label="Width">
            {SIZES.map((entry) => (
              <button key={entry.value} type="button" aria-pressed={size === entry.value} onClick={() => onSize(entry.value)}
                className={`h-7 rounded-md text-[11px] font-semibold ${size === entry.value ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300"} ${focusRing}`}>
                {entry.label}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <MenuItem icon={EyeOff} tone="danger" onClick={run(onRemove)}>Hide</MenuItem>
        </div>
      </Popover>
    </>
  );
}

/** Icon buttons for the ways a chart can be shown. */
export function ViewToggle({ type, view, onChange, size = "sm" }) {
  const views = viewsFor(type);
  if (views.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Show as" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
      {views.map((option) => {
        const Icon = viewIcon(type, option.value);
        const active = view === option.value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} aria-label={option.label} title={option.label} onClick={() => onChange(option.value)}
            className={`flex items-center justify-center rounded-md transition-colors ${size === "sm" ? "h-6 w-7" : "h-7 w-8"} ${active ? "bg-white text-sky-700 shadow-sm dark:bg-gray-800 dark:text-sky-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"} ${focusRing}`}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/** "12 / 589 · 2%" — how many of the students in view the chart is about. */
export function CoverageChip({ summary, studentCount }) {
  const students = summary?.students ?? studentCount;
  const cohort = summary?.cohort ?? studentCount;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"
      title={summary ? `${students.toLocaleString()} of ${cohort.toLocaleString()} students in view ${summary.studentsLabel}` : `${cohort.toLocaleString()} students in view`}>
      <Users className="h-3 w-3 text-slate-400" aria-hidden="true" />
      {students.toLocaleString()}{students !== cohort && <> / {cohort.toLocaleString()} · {summary?.pct ?? 0}%</>}
    </span>
  );
}

/**
 * One chart. Clicking the card opens its full page; clicking a part (bar, slice, legend
 * chip, row) opens the students behind it (onPart).
 */
/**
 * The same chart for each compared group, side by side (stacked on small cards). A part opens
 * the students behind it in that group only.
 */
export function CompareBodies({ sides, view, height, stacked, onStudent, onPart, onBlank }) {
  return (
    <div className={`grid gap-3 ${stacked ? "grid-cols-1" : "md:grid-cols-2"}`}>
      {sides.map((side, index) => (
        <div key={side.label} className="min-w-0 rounded-xl border border-slate-100 p-2.5 dark:border-white/[0.06]">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className={`flex h-4 w-4 items-center justify-center rounded text-[9.5px] font-bold text-white ${index ? "bg-amber-500" : "bg-sky-600"}`}>{index ? "B" : "A"}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-slate-800 dark:text-slate-100">{side.label}</span>
            <CoverageChip summary={side.chart.summary} studentCount={side.chart.studentCount} />
          </div>
          <ChartBody chart={side.chart} view={view} height={height} onStudent={onStudent}
            onPart={(part) => onPart(side.chart, { ...part, group: index, groupLabel: side.label })} onBlank={onBlank} />
        </div>
      ))}
    </div>
  );
}

export default function ChartCard({ chart, entry, analysis, index = 0, compareSides = null, onSettings, onOpen, onPart, onRemove, onChange, onStudent }) {
  const reduced = useReducedMotion();
  const instanceRef = useRef(null);
  const views = viewsFor(chart.type);
  const view = views.some((option) => option.value === entry?.view) ? entry.view : "chart";
  const size = entry?.size || chart.size;
  const style = sectionStyle(chart.section);
  const SectionIcon = style.Icon;
  const insight = useMemo(() => chartInsight(chart), [chart]);
  const download = useChartDownload(analysis, chart.id);
  const open = useCallback(() => onOpen(), [onOpen]);
  // Clicks on controls and on the chart itself are handled where they happen.
  const onCardClick = (event) => { if (!event.target.closest("button, a, input, select, textarea, [data-own-clicks]")) open(); };
  return (
    <motion.article layout={!reduced} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: reduced ? 0 : Math.min(index, 12) * 0.035, ease: "easeOut" }}
      onClick={onCardClick} data-chart-id={chart.id}
      className={`${SIZE_SPANS[size] || SIZE_SPANS.md} group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700`}>
      <header className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`}><SectionIcon className="h-3.5 w-3.5" /></span>
        <h3 className="min-w-0 truncate text-[13.5px] font-bold text-slate-900 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">{chart.title}</h3>
        <span className="shrink-0 text-slate-300 hover:text-slate-500 dark:text-slate-600" title={chart.question} aria-label={chart.question} data-own-clicks><Info className="h-3.5 w-3.5" /></span>
        {chart.filtered && (
          <button type="button" onClick={onSettings} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300" title="This chart has its own filter. Click to change.">
            <Filter className="h-2.5 w-2.5" />Filtered
          </button>
        )}
        <div className="-mr-1 ml-auto flex shrink-0 items-center gap-0.5">
          <span className="hidden sm:inline-flex"><ViewToggle type={chart.type} view={view} onChange={(next) => onChange({ view: next })} /></span>
          <IconButton label="Open full page" onClick={open}><Maximize2 className="h-3.5 w-3.5" /></IconButton>
          <CardMenu chart={chart} view={view} size={size} instanceRef={instanceRef} onSize={(next) => onChange({ size: next })} onSettings={onSettings}
            onOpen={open} onRemove={onRemove} onDownload={(format) => download.run(format, "", chart.title)} />
        </div>
      </header>
      {insight && !compareSides && (
        <p className={`mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[1.45] ${style.note}`}>
          <Sparkles className={`mt-[2px] h-3 w-3 shrink-0 ${style.spark}`} aria-hidden="true" /><span>{insight}</span>
        </p>
      )}
      <div className="mt-3 min-w-0 flex-1 cursor-default" data-own-clicks>
        {compareSides
          ? <CompareBodies sides={compareSides} view={view} height={chartHeight({ ...chart, size })} stacked={size === "sm"} onStudent={onStudent} onPart={onPart} onBlank={open} />
          : <ChartBody chart={chart} view={view} height={chartHeight({ ...chart, size })} onStudent={onStudent} onPart={(part) => onPart(chart, part)} onBlank={open} instanceRef={instanceRef} />}
      </div>
      <footer className="mt-2 flex items-center justify-between gap-2">
        {compareSides ? <span /> : <CoverageChip summary={chart.summary} studentCount={chart.studentCount} />}
        <span className="text-[10.5px] font-semibold text-sky-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-sky-400">Open full page →</span>
      </footer>
    </motion.article>
  );
}
