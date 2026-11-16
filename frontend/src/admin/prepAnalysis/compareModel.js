// Compare classes: Section, Group, Campus, Branch, Semester or Course values side by side.
// Pure helpers (no React) shared by the dashboard and the tests.

import { DIFFICULTY_COLORS, alpha } from "./charts/chartTheme.js";

export const COMPARE_MIN_VALUES = 2;
export const COMPARE_MAX_VALUES = 8;

// Used when the catalog is older than the compare endpoint (it always sends compareDimensions).
export const DEFAULT_COMPARE_DIMENSIONS = Object.freeze([
  { key: "section", label: "Section", options: "sections", field: "student.section" },
  { key: "group", label: "Group", options: "groups", field: "student.group" },
  { key: "college", label: "Campus", options: "colleges", field: "student.college" },
  { key: "branch", label: "Branch", options: "branches", field: "student.branch" },
  { key: "semester", label: "Semester", options: "semesters", field: "student.semester" },
  { key: "course", label: "Course", options: "courses", field: "student.course" },
]);

export const compareDimensions = (catalog) => (catalog?.compareDimensions?.length ? catalog.compareDimensions : DEFAULT_COMPARE_DIMENSIONS);

/** { dimension, values: [{ value, label }] } → the request's compareBy. */
export const compareByRequest = (classCompare) => ({ dimension: classCompare.dimension, values: classCompare.values.map((entry) => entry.value) });

/** A chosen comparison is usable: a known dimension and 2–8 values. */
export const isCompareReady = (draft) => Boolean(draft?.dimension) && draft.values.length >= COMPARE_MIN_VALUES && draft.values.length <= COMPARE_MAX_VALUES;

/** "Section: A, B, C" for chips and file summaries. */
export function compareTitle(classCompare, catalog) {
  const dimension = compareDimensions(catalog).find((entry) => entry.key === classCompare.dimension);
  return `${dimension?.label || "Class"}: ${classCompare.values.map((entry) => entry.label).join(", ")}`;
}

/** A measure's value as shown in the table: counts with separators, one decimal, or a percent. */
export function formatCompareValue(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (format === "percent") return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (format === "decimal") return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return Number(value).toLocaleString();
}

/**
 * The table rows: one per measure, with a cell per compared value and "All selected".
 * `tone` marks the best ("best") and worst ("worst") value of a measure; neither when they tie.
 */
export function compareTableRows(comparison) {
  if (!comparison?.metrics) return [];
  return comparison.metrics.map((metric, order) => ({
    id: metric.key, order, label: metric.label, module: metric.module, moduleLabel: metric.moduleLabel, format: metric.format,
    cells: metric.values.map((value, index) => ({ value, tone: metric.best === index ? "best" : metric.worst === index ? "worst" : null })),
    total: metric.total,
  }));
}

// Measures that mean a difficulty use the platform's difficulty colours; others take these in turn
// (sky first, no indigo or violet).
const SERIES = ["#0284c7", "#10b981", "#f59e0b", "#64748b", "#0ea5e9", "#14b8a6", "#f43f5e"];
const METRIC_COLORS = { solvedEasy: DIFFICULTY_COLORS.Easy, solvedMedium: DIFFICULTY_COLORS.Medium, solvedHard: DIFFICULTY_COLORS.Hard };

/** An ECharts option for one comparison chart: a group of bars per compared value, a bar per measure. */
export function compareChartOption(chart, comparison, theme) {
  const metrics = chart.metrics.map((key) => comparison.metrics.find((metric) => metric.key === key)).filter(Boolean);
  if (!metrics.length || !comparison.columns.length) return null;
  const percent = metrics.every((metric) => metric.format === "percent");
  const labels = comparison.columns.map((column) => column.label);
  return {
    color: metrics.map((metric, index) => METRIC_COLORS[metric.key] || SERIES[index % SERIES.length]),
    grid: { top: metrics.length > 1 ? 36 : 14, left: 8, right: 12, bottom: 8, containLabel: true },
    legend: metrics.length > 1 ? { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text, fontSize: 11 } } : undefined,
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(theme.muted, 0.12) } },
      valueFormatter: (value) => formatCompareValue(value, percent ? "percent" : metrics[0].format),
    },
    xAxis: {
      type: "category", data: labels,
      axisLabel: { color: theme.text, fontSize: 11, interval: 0, width: 90, overflow: "truncate" },
      axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", max: percent ? 100 : undefined, minInterval: metrics.every((metric) => metric.format === "count") ? 1 : undefined,
      axisLabel: { color: theme.muted, fontSize: 10.5, formatter: percent ? "{value}%" : undefined },
      splitLine: { lineStyle: { color: theme.grid } },
    },
    series: metrics.map((metric) => ({
      type: "bar", name: metric.label, stack: chart.stack ? "total" : undefined, barMaxWidth: 34,
      emphasis: { focus: "series" }, cursor: "pointer",
      itemStyle: { borderRadius: chart.stack ? 0 : [4, 4, 0, 0] },
      data: metric.values.map((value) => (typeof value === "number" ? value : null)),
    })),
  };
}

/** The drill table's cells as text: numbers, percents and lists the way the page shows them. */
export function drillCellText(value, kind) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (kind === "percent") return `${value}%`;
  if (kind === "decimal" && typeof value === "number") return value.toFixed(1);
  return typeof value === "number" ? value.toLocaleString() : String(value);
}
