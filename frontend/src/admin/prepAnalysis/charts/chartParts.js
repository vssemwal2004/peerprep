// Which part of a chart a click points at (a difficulty, a topic, a week, one student's Hard
// problems…), the legend chips that stand for parts, and how tall a chart is on its full page.
// A part is { key, label, color?, value?, unit?, students?, studentId? }; its key is what the
// server's drill for that chart understands (backend/src/modules/prepAnalysis/drill.js).

import { LANGUAGE_LABELS, keyColor } from "./chartOptions.js";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
/** The part key for "every student the chart covers", whatever their activity (backend drill.js). */
export const ALL_STUDENTS = "__all__";
const partName = (name) => LANGUAGE_LABELS[name] || name;

/** The part a trend chart's column stands for (its week), by index. */
export function trendPart(chart, index) {
  const data = chart?.data || {};
  const week = data.labels?.[index];
  if (!week) return null;
  const students = data.series?.find((series) => series.axis === "right")?.values?.[index];
  const first = data.series?.[0];
  return { key: week, label: `Week of ${week}`, value: first?.values?.[index], unit: first?.name?.toLowerCase(), students };
}

/**
 * The part under a click (ECharts params), or null when the click is not on a part with
 * students behind it. Student rows of ranked lists are not parts: they open the student.
 */
export function chartPartAt(chart, view, params) {
  const data = chart?.data || {};
  // A row's label (category values are row indexes) stands for the whole row.
  if (params?.componentType === "yAxis") return rowAt(chart, view, Number(params.value))?.part || null;
  const index = params?.dataIndex;
  switch (chart?.type) {
    case "rankedStackedBar": {
      // One bar segment: that student's work at that difficulty.
      const item = data.items?.[index];
      const level = params?.seriesName;
      if (!item?.id || !DIFFICULTIES.includes(level)) return null;
      return { key: `${item.id}|${level}`, label: `${item.name} · ${level}`, color: keyColor(level), value: item.solved?.[level] ?? 0, unit: `${level} solved`, students: 1, studentId: item.id };
    }
    case "donut": {
      const items = (data.items || []).filter((entry) => entry.value > 0);
      const item = items[index];
      return item ? { key: item.key, label: partName(item.name), color: keyColor(item.key, index), value: item.value, unit: data.centerLabel, students: item.students } : null;
    }
    case "barList": {
      const item = data.items?.[index];
      if (!item?.key) return null;
      return { key: item.key, label: item.name, value: item.value, unit: data.valueLabel, students: item.students ?? (data.valueLabel === "students solving" ? item.value : undefined) };
    }
    case "histogram": {
      const bin = data.bins?.[index];
      return bin ? { key: bin.key ?? String(index), label: `${data.label || "Band"} ${bin.label}`, value: bin.count, unit: "students", students: bin.count } : null;
    }
    case "funnel": {
      const stage = data.stages?.[index];
      return stage ? { key: String(index), label: stage.name, value: stage.value, unit: "students", students: stage.value } : null;
    }
    case "trend":
      return trendPart(chart, index);
    case "calendar": {
      const day = view === "chart" ? params?.value?.[0] : null;
      return day ? { key: day, label: day, value: params.value[1], unit: data.unit } : null;
    }
    case "radar": {
      // The bar view's bars, or a topic name on the radar itself.
      const name = view === "bars" ? data.indicators?.[index]?.name : params?.componentType === "radar" ? params.name : null;
      if (!name) return null;
      const topic = (data.topics || []).find((entry) => entry.name === name);
      return { key: name, label: name, value: topic?.students, unit: "students solved", students: topic?.students };
    }
    case "stackedBar": {
      const group = data.groups?.[index];
      if (!group) return null;
      const series = params?.seriesName;
      return series
        ? { key: `${group.label}|${series}`, label: `${group.label} · ${series}`, color: keyColor(series, (data.series || DIFFICULTIES).indexOf(series)), value: group.values?.[series], unit: data.unit || "" }
        : { key: group.label, label: group.label, students: group.students };
    }
    case "heatmap": {
      const column = (data.columns || data.topics || [])[params?.value?.[0]];
      return column ? { key: column, label: column } : null;
    }
    default:
      return null;
  }
}

/**
 * What a whole row of a horizontal chart stands for (a click anywhere on it, its label, or a
 * bar too short to hit): { studentId } for a student row, { part } for a part, or null.
 */
export function rowAt(chart, view, index) {
  const data = chart?.data || {};
  if (!Number.isInteger(index) || index < 0) return null;
  if (chart.type === "rankedStackedBar") return data.items?.[index]?.id ? { studentId: data.items[index].id } : null;
  if (chart.type === "barList") {
    const item = data.items?.[index];
    if (!item) return null;
    return item.key ? { part: chartPartAt(chart, view, { dataIndex: index }) } : item.id ? { studentId: item.id } : null;
  }
  if (chart.type === "stackedBar") return data.groups?.[index] ? { part: chartPartAt(chart, view, { dataIndex: index }) } : null;
  // Other views drawn as rows: funnel steps, a donut or radar as bars.
  const part = chartPartAt(chart, view, { dataIndex: index });
  return part ? { part } : null;
}

/** Charts drawn as one row per item, which a card scrolls when there are many rows. */
export function rowCount(chart, view) {
  const data = chart?.data || {};
  if (view === "table") return 0;
  if (chart?.type === "rankedStackedBar" || chart?.type === "barList") return data.items?.length || 0;
  if (chart?.type === "stackedBar" && data.horizontal && view !== "grouped") return data.groups?.length || 0;
  if (chart?.type === "heatmap") return data.students?.length || 0;
  return 0;
}

/** The height that gives every row room (28px a row), or null for charts that are not rows. */
export function naturalHeight(chart, view) {
  const rows = rowCount(chart, view);
  if (!rows) return null;
  const perRow = chart.type === "heatmap" ? 26 : chart.type === "stackedBar" ? 30 : 28;
  return (chart.type === "heatmap" ? 100 : 48) + rows * perRow;
}

const CHIP_COLORS = { warning: "#f59e0b", muted: "#94a3b8" };

/**
 * Legend chips that stand for parts, for charts whose colours are parts: { key, label, color,
 * value?, share? }. Empty for charts whose legend only names lines.
 */
export function legendParts(chart) {
  const data = chart?.data || {};
  switch (chart?.type) {
    case "barList":
      // "Needs attention" lists: who the bars are, and who never started (not drawn as bars).
      return (data.chips || []).map((chip) => ({ key: chip.key, label: chip.label, color: CHIP_COLORS[chip.tone] || CHIP_COLORS.muted, value: chip.value, students: chip.value }));
    case "donut": {
      const items = (data.items || []).filter((item) => item.value > 0);
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return items.map((item, index) => ({ key: item.key, label: partName(item.name), color: keyColor(item.key, index), value: item.value, share: total ? Math.round((item.value / total) * 100) : 0, students: item.students, unit: data.centerLabel }));
    }
    case "rankedStackedBar":
      return (data.items || []).length ? DIFFICULTIES.map((level) => ({ key: `*|${level}`, label: level, color: keyColor(level) })) : [];
    case "stackedBar": {
      const series = data.series || DIFFICULTIES;
      return (data.groups || []).length ? series.map((name, index) => ({ key: `*|${name}`, label: name, color: keyColor(name, index), value: (data.groups || []).reduce((sum, group) => sum + (group.values?.[name] || 0), 0) })) : [];
    }
    default:
      return [];
  }
}

/** The part each row of a chart's table stands for (same order as chartTable rows), or []. */
export function chartTableKeys(chart) {
  const data = chart?.data || {};
  switch (chart?.type) {
    case "donut": return (data.items || []).filter((item) => item.value > 0).map((item) => item.key);
    case "barList": return (data.items || []).map((item) => item.key || null);
    case "histogram": return (data.bins || []).map((bin, index) => bin.key ?? String(index));
    case "funnel": return (data.stages || []).map((_, index) => String(index));
    case "trend": return [...(data.labels || [])];
    case "radar": return (data.indicators || []).map((indicator) => indicator.name);
    case "stackedBar": return (data.groups || []).map((group) => group.label);
    case "calendar": return [...(data.days || [])].sort(([left], [right]) => right.localeCompare(left)).map(([day]) => day);
    default: return [];
  }
}

/** Height for a chart on its full page: tall enough that every bar or row is readable. */
export function fullPageHeight(chart) {
  const items = chart?.data?.items?.length || 0;
  if (chart?.type === "rankedStackedBar" || chart?.type === "barList") return Math.max(420, 48 + items * 28);
  if (chart?.type === "heatmap") return Math.max(420, 100 + (chart.data?.students?.length || 0) * 26);
  if (chart?.type === "stackedBar" && chart.data?.horizontal) return Math.max(420, 70 + (chart.data?.groups?.length || 0) * 32);
  if (chart?.type === "calendar") return 220;
  if (chart?.type === "radar") return 520;
  return 480;
}
