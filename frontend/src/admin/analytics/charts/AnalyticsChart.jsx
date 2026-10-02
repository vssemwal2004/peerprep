import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart } from "echarts/charts";
import { AriaComponent, CalendarComponent, DataZoomComponent, GridComponent, LegendComponent, PolarComponent, RadarComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart,
  AriaComponent, CalendarComponent, DataZoomComponent, GridComponent, LegendComponent,
  PolarComponent, RadarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer,
]);

const COLORS = ["#0284c7", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0891b2"];
const rowsOf = (payload) => Array.isArray(payload?.data) ? payload.data : payload?.data?.rows || payload?.data?.items || payload?.data?.points || [];
const labelOf = (row, key) => row?.[key] ?? row?.label ?? row?.name ?? row?.topic ?? row?.studentName ?? row?.title ?? row?.subject ?? row?.band ?? row?.group ?? row?.date ?? row?.bucket ?? row?.stage ?? "";
const numericKeys = (rows) => [...new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => typeof row[key] === "number" && !/id/i.test(key))))];
const seriesKeys = (payload, fallback = []) => Array.isArray(payload?.config?.series) && payload.config.series.length ? payload.config.series.map((item) => typeof item === "string" ? item : item.key).filter(Boolean) : fallback;
const seriesLabel = (payload, key) => {
  const match = payload?.config?.series?.find?.((item) => typeof item === "object" && item.key === key);
  return match?.label || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
};

function chartTheme() {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return { dark, text: dark ? "#cbd5e1" : "#475569", muted: dark ? "#64748b" : "#94a3b8", grid: dark ? "rgba(148,163,184,.16)" : "rgba(148,163,184,.22)", surface: dark ? "#111827" : "#ffffff" };
}

function zoomFor(length, orientation = "horizontal") {
  if (length <= 10) return [];
  const end = Math.max(12, Math.min(100, Math.round((10 / length) * 100)));
  return orientation === "vertical"
    ? [{ type: "inside", yAxisIndex: 0, start: 0, end }, { type: "slider", yAxisIndex: 0, right: 2, width: 12, start: 0, end, brushSelect: false }]
    : [{ type: "inside", xAxisIndex: 0, start: 0, end }, { type: "slider", xAxisIndex: 0, bottom: 4, height: 14, start: 0, end, brushSelect: false }];
}

function baseOption({ legend = false, dense = false } = {}) {
  const theme = chartTheme();
  return {
    animationDuration: 380,
    color: COLORS,
    aria: { enabled: true, decal: { show: true } },
    textStyle: { fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif", color: theme.text },
    tooltip: { trigger: "axis", confine: true, backgroundColor: theme.surface, borderColor: theme.grid, textStyle: { color: theme.text, fontSize: 11 }, extraCssText: "box-shadow:0 10px 30px rgba(15,23,42,.14);border-radius:10px" },
    legend: legend ? { top: 0, type: "scroll", textStyle: { color: theme.text, fontSize: 10 }, itemWidth: 10, itemHeight: 7 } : undefined,
    grid: { top: legend ? 38 : 18, right: dense ? 34 : 18, bottom: dense ? 48 : 30, left: 48, containLabel: true },
  };
}

function categoryAxis(data, { rotate = 0, inverse = false } = {}) {
  const theme = chartTheme();
  return { type: "category", data, inverse, axisLine: { lineStyle: { color: theme.grid } }, axisTick: { show: false }, axisLabel: { color: theme.text, fontSize: 10, rotate, hideOverlap: true, width: 110, overflow: "truncate" } };
}

function valueAxis({ percent = false } = {}) {
  const theme = chartTheme();
  return { type: "value", min: 0, max: percent ? 100 : undefined, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.text, fontSize: 10, formatter: percent ? "{value}%" : "{value}" }, splitLine: { lineStyle: { color: theme.grid } } };
}

function lineOption(payload, assessment = false) {
  const rows = rowsOf(payload);
  const fallback = assessment ? ["average", "median", "participationRate"] : numericKeys(rows).slice(0, 5);
  const keys = seriesKeys(payload, fallback.filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  const labels = rows.map((row) => labelOf(row, payload?.config?.labelKey));
  return { ...baseOption({ legend: keys.length > 1, dense: rows.length > 10 }), xAxis: categoryAxis(labels, { rotate: rows.length > 8 ? 25 : 0 }), yAxis: valueAxis({ percent: assessment }), dataZoom: zoomFor(rows.length), series: keys.map((key) => ({ name: seriesLabel(payload, key), type: "line", data: rows.map((row) => row[key] ?? null), smooth: true, connectNulls: true, showSymbol: rows.length < 16, symbolSize: 6, lineStyle: { width: 2.5 }, emphasis: { focus: "series" } })) };
}

function rankingOption(payload) {
  const rows = rowsOf(payload); const key = payload?.config?.valueKey || (rows.some((row) => Number.isFinite(row.value)) ? "value" : numericKeys(rows)[0]);
  return { ...baseOption({ dense: rows.length > 10 }), grid: { top: 12, right: 28, bottom: 28, left: 18, containLabel: true }, xAxis: valueAxis({ percent: true }), yAxis: categoryAxis(rows.map((row) => labelOf(row)), { inverse: true }), dataZoom: zoomFor(rows.length, "vertical"), series: [{ type: "bar", name: payload?.config?.valueLabel || "Score", data: rows.map((row) => row[key]), barMaxWidth: 20, itemStyle: { borderRadius: [0, 5, 5, 0] }, label: { show: rows.length <= 10, position: "right", formatter: "{c}", color: chartTheme().text, fontSize: 9 } }] };
}

function heatmapOption(payload) {
  const source = payload?.data || {}; const rows = Array.isArray(source) ? source : source.rows || [];
  const columns = (Array.isArray(source) ? payload?.config?.topics : source.columns) || [...new Set(rows.flatMap((row) => (row.cells || row.values || []).map((cell) => cell.topic || cell.label)))];
  const points = [];
  rows.forEach((row, y) => columns.forEach((column, x) => { const cells = row.cells || row.values || []; const cell = cells.find((item) => (item.topic || item.label) === column); const value = cell?.value ?? row[column]; if (value != null) points.push([x, y, value]); }));
  const theme = chartTheme();
  return { ...baseOption({ dense: columns.length > 10 }), tooltip: { ...baseOption().tooltip, position: "top", formatter: ({ value }) => `${rows[value[1]] ? labelOf(rows[value[1]]) : "Student"}<br/>${columns[value[0]]}: <b>${value[2]}%</b>` }, grid: { top: 15, right: 55, bottom: columns.length > 8 ? 74 : 42, left: 16, containLabel: true }, xAxis: categoryAxis(columns, { rotate: columns.length > 6 ? 35 : 0 }), yAxis: categoryAxis(rows.map((row) => labelOf(row)), { inverse: true }), dataZoom: zoomFor(columns.length), visualMap: { min: 0, max: 100, calculable: false, orient: "vertical", right: 0, top: "middle", textStyle: { color: theme.text, fontSize: 9 }, inRange: { color: ["#e11d48", "#f59e0b", "#0ea5e9", "#059669"] } }, series: [{ type: "heatmap", data: points, label: { show: rows.length * columns.length <= 80, color: "#fff", fontSize: 9 }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(15,23,42,.3)" } } }] };
}

function barOption(payload, renderer) {
  let rows = rowsOf(payload); let keys;
  const defaults = { topic: ["rate"], assessmentTopic: ["score", "participationRate"], distribution: ["count"], comparison: ["value"], hierarchy: ["completionRate", "engagementRate"], conversion: ["conversionRate"] }[renderer] || [];
  if (renderer === "difficulty" && payload?.config?.stackBy === "difficulty") {
    const pivot = new Map(); rows.forEach((row) => { const entry = pivot.get(labelOf(row)) || { topic: labelOf(row) }; entry[row.difficulty] = row.successRate; pivot.set(labelOf(row), entry); }); rows = [...pivot.values()]; keys = ["Easy", "Medium", "Hard", "easy", "medium", "hard"].filter((key) => rows.some((row) => Number.isFinite(row[key])));
  } else keys = seriesKeys(payload, defaults.filter((key) => rows.some((row) => Number.isFinite(row[key]))));
  if (!keys.length) keys = numericKeys(rows).slice(0, 1);
  const horizontal = ["topic", "assessmentTopic", "hierarchy", "conversion"].includes(renderer);
  const percent = renderer !== "distribution";
  const option = { ...baseOption({ legend: keys.length > 1, dense: rows.length > 10 }), dataZoom: zoomFor(rows.length, horizontal ? "vertical" : "horizontal"), series: keys.map((key) => ({ type: "bar", name: seriesLabel(payload, key), data: rows.map((row) => row[key] ?? null), barMaxWidth: 28, itemStyle: { borderRadius: horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0] }, emphasis: { focus: "series" } })) };
  if (horizontal) { option.xAxis = valueAxis({ percent }); option.yAxis = categoryAxis(rows.map((row) => labelOf(row, payload?.config?.labelKey)), { inverse: true }); option.grid = { top: keys.length > 1 ? 38 : 12, right: 26, bottom: 28, left: 18, containLabel: true }; }
  else { option.xAxis = categoryAxis(rows.map((row) => labelOf(row, payload?.config?.labelKey)), { rotate: rows.length > 6 ? 25 : 0 }); option.yAxis = valueAxis({ percent }); }
  return option;
}

function radarOption(payload) {
  const rows = rowsOf(payload); const key = payload?.config?.valueKey || numericKeys(rows)[0];
  return { ...baseOption({ legend: false }), tooltip: { ...baseOption().tooltip, trigger: "item" }, radar: { radius: "67%", indicator: rows.map((row) => ({ name: labelOf(row), max: 100 })), splitNumber: 4, axisName: { color: chartTheme().text, fontSize: 10 }, splitLine: { lineStyle: { color: chartTheme().grid } }, splitArea: { areaStyle: { color: ["transparent"] } } }, series: [{ type: "radar", data: [{ value: rows.map((row) => row[key]), name: payload?.config?.valueLabel || "Score", areaStyle: { opacity: .2 }, lineStyle: { width: 2.5 } }], symbolSize: 5 }] };
}

function funnelOption(payload) {
  const rows = rowsOf(payload);
  return { ...baseOption(), tooltip: { ...baseOption().tooltip, trigger: "item", formatter: "{b}<br/><b>{c}</b> students" }, series: [{ type: "funnel", top: 10, bottom: 10, left: "10%", width: "80%", minSize: "18%", maxSize: "100%", sort: "none", gap: 3, label: { show: true, position: "inside", formatter: "{b}  {c}", color: "#fff", fontSize: 10, fontWeight: 700 }, itemStyle: { borderColor: chartTheme().surface, borderWidth: 1 }, data: rows.map((row) => ({ name: labelOf(row), value: row.value ?? row.count ?? 0 })) }] };
}

function calendarOption(payload) {
  const rows = rowsOf(payload); const values = rows.map((row) => [row.date || labelOf(row), Number(row.value ?? row.count ?? row.activeStudents ?? 0)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); const max = Math.max(...values.map((item) => item[1]), 1); const range = values.length ? [values[0][0], values[values.length - 1][0]] : String(new Date().getFullYear()); const theme = chartTheme();
  return { ...baseOption(), tooltip: { ...baseOption().tooltip, trigger: "item", formatter: ({ value }) => `${value[0]}<br/><b>${value[1]}</b> active students` }, visualMap: { min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: theme.text, fontSize: 9 }, inRange: { color: ["#e0f2fe", "#38bdf8", "#0369a1"] } }, calendar: { top: 35, left: 35, right: 20, range, cellSize: ["auto", 16], itemStyle: { color: theme.surface, borderWidth: 2, borderColor: theme.surface }, dayLabel: { color: theme.text, fontSize: 9 }, monthLabel: { color: theme.text, fontSize: 10 }, yearLabel: { show: false } }, series: [{ type: "heatmap", coordinateSystem: "calendar", data: values }] };
}

function scatterOption(payload) {
  const rows = rowsOf(payload); const keys = numericKeys(rows); const x = payload?.config?.xKey || (rows.some((row) => Number.isFinite(row.effort)) ? "effort" : keys[0]); const y = payload?.config?.yKey || (rows.some((row) => Number.isFinite(row.score)) ? "score" : keys[1]);
  return { ...baseOption(), tooltip: { ...baseOption().tooltip, trigger: "item", formatter: ({ data }) => `${data[2]}<br/>${payload?.config?.xLabel || x}: <b>${data[0]}</b><br/>${payload?.config?.yLabel || y}: <b>${data[1]}</b>` }, xAxis: { ...valueAxis(), name: payload?.config?.xLabel || "Effort", nameLocation: "middle", nameGap: 24 }, yAxis: { ...valueAxis({ percent: true }), name: payload?.config?.yLabel || "Score" }, series: [{ type: "scatter", symbolSize: 9, data: rows.map((row) => [row[x], row[y], labelOf(row)]), itemStyle: { opacity: .78 } }] };
}

function donutOption(payload) {
  const rows = rowsOf(payload); const key = numericKeys(rows)[0];
  return { ...baseOption({ legend: true }), tooltip: { ...baseOption().tooltip, trigger: "item", formatter: "{b}<br/><b>{c}</b> ({d}%)" }, legend: { ...baseOption({ legend: true }).legend, bottom: 0, top: undefined }, series: [{ type: "pie", radius: ["46%", "70%"], center: ["50%", "45%"], avoidLabelOverlap: true, itemStyle: { borderColor: chartTheme().surface, borderWidth: 2, borderRadius: 4 }, label: { formatter: "{b}\n{d}%", color: chartTheme().text, fontSize: 10 }, data: rows.map((row) => ({ name: labelOf(row), value: row[key] })) }] };
}

function optionFor(definition, payload) {
  const renderer = definition.renderer;
  if (renderer === "trend") return lineOption(payload);
  if (renderer === "assessmentTrend") return lineOption(payload, true);
  if (renderer === "ranking") return rankingOption(payload);
  if (renderer === "heatmap") return heatmapOption(payload);
  if (["difficulty", "topic", "assessmentTopic", "distribution", "comparison", "hierarchy", "conversion"].includes(renderer)) return barOption(payload, renderer);
  if (renderer === "radar") return radarOption(payload);
  if (renderer === "funnel") return funnelOption(payload);
  if (renderer === "calendar") return calendarOption(payload);
  if (renderer === "scatter") return scatterOption(payload);
  if (renderer === "donut") return donutOption(payload);
  return { ...baseOption(), graphic: { type: "text", left: "center", top: "middle", style: { text: "No chart-ready evidence returned.", fill: chartTheme().muted, fontSize: 12 } } };
}

function EChart({ option, height, label }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!hostRef.current) return undefined;
    const chart = echarts.init(hostRef.current, undefined, { renderer: "canvas", useDirtyRect: true });
    chartRef.current = chart;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = () => chart.setOption({ ...option, animation: !media.matches }, { notMerge: true, lazyUpdate: true });
    render();
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => chart.resize()) : null;
    resizeObserver?.observe(hostRef.current);
    const onResize = () => chart.resize(); const onMotion = () => render();
    window.addEventListener("resize", onResize); media.addEventListener?.("change", onMotion);
    return () => { resizeObserver?.disconnect(); window.removeEventListener("resize", onResize); media.removeEventListener?.("change", onMotion); chart.dispose(); chartRef.current = null; };
  }, [option]);
  return <div ref={hostRef} role="img" aria-label={label} style={{ width: "100%", height }} />;
}

export default function AnalyticsChart({ definition, payload, expanded = false }) {
  const option = useMemo(() => optionFor(definition, payload), [definition, payload]);
  return <EChart option={option} height={expanded ? 500 : 300} label={`${definition.title}. ${definition.description}`} />;
}
