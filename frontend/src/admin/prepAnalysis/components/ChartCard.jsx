import { useCallback, useMemo, useRef, useState } from "react";
import {
  BarChart3, Download, EyeOff, Filter, Image as ImageIcon, Maximize2, MoreHorizontal, SlidersHorizontal, Sparkles,
} from "lucide-react";
import EChart from "../charts/EChart";
import { chartInsight } from "../charts/chartInsights";
import { buildChartOption, chartCsv, chartHeight, chartTable, viewsFor } from "../charts/chartOptions";
import { chartTheme, isDarkMode } from "../charts/chartTheme";
import { sectionStyle } from "./sectionStyles";
import { IconButton, Popover, focusRing } from "./ui";

const SIZE_SPANS = {
  sm: "col-span-12 md:col-span-6 xl:col-span-4",
  md: "col-span-12 md:col-span-6",
  lg: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};
const SIZES = [{ value: "sm", label: "Small" }, { value: "md", label: "Half" }, { value: "lg", label: "Wide" }, { value: "full", label: "Full" }];

const studentIdAt = (chart, index) => (["rankedStackedBar", "barList"].includes(chart.type) ? chart.data?.items?.[index]?.id : null);

function saveFile(name, href) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
const fileName = (chart, extension) => `${chart.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${extension}`;

/** The chart's numbers as a small table (the "Table" view). */
export function ChartTable({ chart, height, onStudent }) {
  const { columns, rows, ids = [] } = useMemo(() => chartTable(chart), [chart]);
  if (!rows.length) return <EmptyChart height={height} />;
  return (
    <div style={{ maxHeight: height }} className="overflow-auto rounded-lg border border-slate-100 dark:border-white/[0.06]">
      <table data-no-serial className="min-w-full text-[11.5px]">
        <thead className="sticky top-0 bg-slate-50 text-[10.5px] text-slate-500 dark:bg-gray-900 dark:text-slate-400">
          <tr>{columns.map((column) => <th key={column.label} scope="col" className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${column.numeric ? "text-right" : "text-left"}`}>{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {rows.map((row, index) => {
            const id = ids[index];
            return (
              <tr key={index} onClick={id && onStudent ? () => onStudent(id) : undefined}
                className={`${id && onStudent ? "cursor-pointer hover:bg-sky-50/60 dark:hover:bg-sky-500/10" : "hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"}`}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={`px-2.5 py-1.5 ${columns[cellIndex]?.numeric ? "text-right font-semibold tabular-nums text-slate-900 dark:text-white" : "max-w-[260px] truncate text-slate-700 dark:text-slate-200"}`}>
                    {typeof cell === "number" ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart({ height }) {
  return (
    <div style={{ height }} className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-slate-50/70 text-center dark:bg-white/[0.02]">
      <BarChart3 className="h-5 w-5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">Nothing to show yet</p>
      <p className="max-w-[240px] text-[10.5px] leading-4 text-slate-400">These students have no matching activity in this period. Try a longer period or fewer filters.</p>
    </div>
  );
}

export function ChartBody({ chart, height, view = "chart", onStudent, instanceRef }) {
  const buildOption = useCallback((theme) => buildChartOption(chart, theme, view), [chart, view]);
  const hasData = useMemo(() => Boolean(buildChartOption(chart, chartTheme(false), view === "table" ? "chart" : view)), [chart, view]);
  const onClick = useCallback((params) => {
    const id = studentIdAt(chart, params.dataIndex);
    if (id && onStudent) onStudent(id);
  }, [chart, onStudent]);
  if (view === "table") return <ChartTable chart={chart} height={height} onStudent={onStudent} />;
  if (!hasData) return <EmptyChart height={height} />;
  return <EChart buildOption={buildOption} height={height} ariaLabel={`${chart.title}: ${chart.question}`} onClick={onClick} instanceRef={instanceRef} />;
}

function MenuItem({ icon: Icon, children, onClick, tone }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium ${tone === "danger" ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]"} ${focusRing}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />{children}
    </button>
  );
}

function CardMenu({ chart, size, onSize, onSettings, onExpand, onRemove, instanceRef }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const run = (action) => () => { setOpen(false); action(); };
  const saveImage = () => {
    const url = instanceRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: isDarkMode() ? "#111827" : "#ffffff" });
    if (url) saveFile(fileName(chart, "png"), url);
  };
  const saveData = () => {
    const url = URL.createObjectURL(new Blob([chartCsv(chart)], { type: "text/csv;charset=utf-8" }));
    saveFile(fileName(chart, "csv"), url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <span ref={anchorRef} className="inline-flex"><IconButton label="More options" onClick={() => setOpen(true)}><MoreHorizontal className="h-4 w-4" /></IconButton></span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={220} label={`${chart.title} options`}>
        <div className="p-1.5">
          <MenuItem icon={SlidersHorizontal} onClick={run(onSettings)}>Chart settings and filters</MenuItem>
          <MenuItem icon={Maximize2} onClick={run(onExpand)}>Open larger</MenuItem>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <p className="px-2.5 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Width</p>
          <div className="grid grid-cols-4 gap-1 px-1.5 pb-1">
            {SIZES.map((entry) => (
              <button key={entry.value} type="button" aria-pressed={size === entry.value} onClick={() => onSize(entry.value)}
                className={`h-7 rounded-md text-[11px] font-semibold ${size === entry.value ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300"} ${focusRing}`}>
                {entry.label}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <MenuItem icon={ImageIcon} onClick={run(saveImage)}>Save as image</MenuItem>
          <MenuItem icon={Download} onClick={run(saveData)}>Download this chart's data</MenuItem>
          <div className="my-1 border-t border-slate-100 dark:border-gray-700" />
          <MenuItem icon={EyeOff} tone="danger" onClick={run(onRemove)}>Hide this chart</MenuItem>
        </div>
      </Popover>
    </>
  );
}

/** One chart: what it shows, what stands out, a choice of how to show it, and its menu. */
export default function ChartCard({ chart, entry, onSettings, onExpand, onRemove, onChange, onStudent }) {
  const instanceRef = useRef(null);
  const views = viewsFor(chart.type);
  const view = views.some((option) => option.value === entry?.view) ? entry.view : "chart";
  const size = entry?.size || chart.size;
  const style = sectionStyle(chart.section);
  const SectionIcon = style.Icon;
  const insight = useMemo(() => chartInsight(chart), [chart]);
  const clickable = Boolean(onStudent) && ["rankedStackedBar", "barList"].includes(chart.type) && chart.data?.items?.some((item) => item.id);
  return (
    <article className={`${SIZE_SPANS[size] || SIZE_SPANS.md} group flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(15,23,42,0.07)] dark:border-gray-800 dark:bg-gray-900`}>
      <header className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`}><SectionIcon className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{chart.title}</h3>
            {chart.filtered && (
              <button type="button" onClick={onSettings} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300" title="This chart shows only some of the students on the page. Click to change.">
                <Filter className="h-2.5 w-2.5" />Some students
              </button>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400" title={chart.question}>{chart.question}</p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          {views.length > 1 && (
            <div role="radiogroup" aria-label="Show as" className="hidden rounded-lg bg-slate-100 p-0.5 sm:inline-flex dark:bg-white/[0.06]">
              {views.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={view === option.value} onClick={() => onChange({ view: option.value })}
                  className={`h-6 rounded-md px-2 text-[10.5px] font-semibold transition-colors ${view === option.value ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"} ${focusRing}`}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <CardMenu chart={chart} size={size} instanceRef={instanceRef} onSize={(next) => onChange({ size: next })} onSettings={onSettings} onExpand={() => onExpand(view)} onRemove={onRemove} />
        </div>
      </header>
      {insight && (
        <p className={`mt-2.5 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[1.45] ${style.note}`}>
          <Sparkles className={`mt-[2px] h-3 w-3 shrink-0 ${style.spark}`} aria-hidden="true" /><span>{insight}</span>
        </p>
      )}
      <div className="mt-2.5 min-w-0 flex-1">
        <ChartBody chart={chart} view={view} height={chartHeight({ ...chart, size })} onStudent={onStudent} instanceRef={instanceRef} />
      </div>
      <footer className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-slate-400">
        <span>{chart.studentCount.toLocaleString()} student{chart.studentCount === 1 ? "" : "s"}</span>
        {clickable && <span className="hidden opacity-0 transition-opacity group-hover:opacity-100 sm:inline">Click a student to see their details</span>}
      </footer>
    </article>
  );
}
