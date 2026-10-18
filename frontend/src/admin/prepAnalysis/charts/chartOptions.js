// Turns a chart payload from /admin/prep-analysis/query into an ECharts option.
// Each chart type can be shown a few ways ("views"); every chart can also be a
// plain table (chartTable). Builders return null when there is nothing to draw,
// so the card can show an honest empty state instead of an empty axis.

import { CATEGORICAL, DIFFICULTY_COLORS, OUTCOME_COLORS, SECTION_ACCENTS, alpha } from "./chartTheme.js";

const FONT = "Manrope, ui-sans-serif, system-ui, sans-serif";
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const LANGUAGE_LABELS = Object.freeze({
  python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++", c: "C", typescript: "TypeScript",
  csharp: "C#", php: "PHP", go: "Go", rust: "Rust", kotlin: "Kotlin", ruby: "Ruby", swift: "Swift", r: "R", sql: "SQL",
});
const truncate = (text, size = 18) => (String(text).length > size ? `${String(text).slice(0, size - 1)}…` : String(text));
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const dot = (color) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color}"></span>`;

/** Ways each chart type can be shown. "table" is always last. */
export const CHART_VIEWS = Object.freeze({
  rankedStackedBar: [{ value: "chart", label: "Bars" }, { value: "table", label: "Table" }],
  barList: [{ value: "chart", label: "Bars" }, { value: "table", label: "Table" }],
  donut: [{ value: "chart", label: "Donut" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
  trend: [{ value: "chart", label: "Line" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
  funnel: [{ value: "chart", label: "Steps" }, { value: "funnel", label: "Funnel" }, { value: "table", label: "Table" }],
  histogram: [{ value: "chart", label: "Bars" }, { value: "table", label: "Table" }],
  stackedBar: [{ value: "chart", label: "Counts" }, { value: "percent", label: "Percent" }, { value: "grouped", label: "Side by side" }, { value: "table", label: "Table" }],
  heatmap: [{ value: "chart", label: "Grid" }, { value: "table", label: "Table" }],
  calendar: [{ value: "chart", label: "Calendar" }, { value: "weekly", label: "By week" }, { value: "table", label: "Table" }],
  radar: [{ value: "chart", label: "Radar" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
});
export const viewsFor = (type) => CHART_VIEWS[type] || [{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }];

function base(theme, extra = {}) {
  return {
    animationDuration: 500,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: FONT, color: theme.text, fontSize: 11 },
    tooltip: {
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      padding: [8, 11],
      textStyle: { color: theme.strong, fontSize: 11, fontFamily: FONT },
      extraCssText: "box-shadow:0 10px 30px rgba(15,23,42,.14);border-radius:10px;",
    },
    ...extra,
  };
}

const legend = (theme, extra = {}) => ({
  top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 8, itemGap: 14,
  textStyle: { color: theme.text, fontSize: 10.5 }, ...extra,
});

const grid = (extra = {}) => ({ top: 30, left: 6, right: 14, bottom: 6, containLabel: true, ...extra });

const categoryAxis = (theme, data, extra = {}) => ({
  type: "category", data,
  axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false },
  axisLabel: { color: theme.text, fontSize: 10.5, hideOverlap: true },
  ...extra,
});

const valueAxis = (theme, extra = {}) => ({
  type: "value",
  axisLine: { show: false }, axisTick: { show: false },
  axisLabel: { color: theme.muted, fontSize: 10 },
  splitLine: { lineStyle: { color: theme.grid, type: "dashed" } },
  ...extra,
});

/** A soft two-stop gradient for a bar (along its length) or an area. */
const gradient = (color, horizontal = false, from = 0.55) => ({
  type: "linear", x: 0, y: horizontal ? 0 : 1, x2: horizontal ? 1 : 0, y2: 0,
  colorStops: [{ offset: 0, color: alpha(color, from) }, { offset: 1, color }],
});

const keyColor = (key, index) => DIFFICULTY_COLORS[key] || OUTCOME_COLORS[key] || CATEGORICAL[index % CATEGORICAL.length];
const itemName = (item) => LANGUAGE_LABELS[item.name] || item.name;

/** Horizontal ranked bars: [{ name, value, color?, note? }]. Shared by several views. */
function horizontalBars(theme, items, { color, unit = "", max, valueLabel = "", tooltip } = {}) {
  return base(theme, {
    grid: grid({ top: 4, right: 48 }),
    tooltip: {
      ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(color, 0.06) } },
      formatter: tooltip || ((params) => {
        const item = items[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b><br/>${dot(item.color || color)}${item.value}${unit} ${escapeHtml(valueLabel)}${item.note ? `<br/><span style="opacity:.75">${escapeHtml(item.note)}</span>` : ""}`;
      }),
    },
    xAxis: valueAxis(theme, { splitLine: { show: false }, axisLabel: { show: false }, ...(max ? { max } : {}) }),
    yAxis: categoryAxis(theme, items.map((item) => truncate(item.name, 24)), { inverse: true, axisLine: { show: false }, axisLabel: { color: theme.text, fontSize: 10.5, interval: 0 } }),
    series: [{
      type: "bar", barWidth: 11,
      showBackground: true, backgroundStyle: { color: theme.empty, borderRadius: 6 },
      itemStyle: { borderRadius: 6 },
      label: { show: true, position: "right", color: theme.strong, fontSize: 10.5, fontWeight: 700, formatter: ({ value }) => `${value}${unit}` },
      data: items.map((item) => ({ value: item.value, itemStyle: { color: gradient(item.color || color, true) } })),
    }],
  });
}

const builders = {
  rankedStackedBar(data, theme) {
    const items = data.items || [];
    if (!items.length) return null;
    const keys = ["Easy", "Medium", "Hard", "Accuracy"];
    return base(theme, {
      legend: legend(theme, { data: keys }),
      grid: grid({ right: 40 }),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = items[params[0].dataIndex];
          const solved = item.solved || {};
          return `<b>${escapeHtml(item.name)}</b><br/>Prep Score <b>${item.score}</b> / 100<br/>`
            + `${DIFFICULTIES.map((key) => `${dot(DIFFICULTY_COLORS[key])}${solved[key] || 0} ${key}`).join(" &nbsp;")}`
            + "<br/><span style=\"opacity:.7\">Click to open this student</span>";
        },
      },
      xAxis: valueAxis(theme, { max: 100 }),
      yAxis: categoryAxis(theme, items.map((item) => `${item.position}. ${truncate(item.name, 20)}`), { inverse: true, axisLine: { show: false } }),
      series: keys.map((key, index) => ({
        name: key, type: "bar", stack: "score", barWidth: 13, cursor: "pointer",
        itemStyle: { color: DIFFICULTY_COLORS[key], borderRadius: index === keys.length - 1 ? [0, 6, 6, 0] : index === 0 ? [6, 0, 0, 6] : 0, borderColor: theme.surface, borderWidth: 1 },
        emphasis: { focus: "series" },
        data: items.map((item) => item.segments[key]),
        ...(index === keys.length - 1 ? { label: { show: true, position: "right", color: theme.strong, fontWeight: 800, fontSize: 10.5, formatter: ({ dataIndex }) => items[dataIndex].score } } : {}),
      })),
    });
  },

  donut(data, theme) {
    const items = (data.items || []).filter((item) => item.value > 0);
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const shares = new Map(items.map((item) => [itemName(item), item.value]));
    return base(theme, {
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ name: label, value, percent, color }) => `${dot(color)}${escapeHtml(label)}<br/><b>${value.toLocaleString()}</b> · ${percent}%` },
      legend: legend(theme, {
        type: "scroll", orient: "vertical", top: "middle", right: 0, itemGap: 9,
        formatter: (label) => `${truncate(label, 13)}  ${percentOf(shares.get(label) || 0, total)}%`,
      }),
      title: {
        text: total.toLocaleString(), subtext: data.centerLabel || "", left: "34%", top: "38%", textAlign: "center",
        textStyle: { fontSize: 20, fontWeight: 800, color: theme.strong }, subtextStyle: { fontSize: 10, color: theme.muted },
      },
      series: [{
        type: "pie", radius: ["58%", "84%"], center: ["35%", "52%"], avoidLabelOverlap: true, padAngle: 2,
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 6 },
        label: { show: false },
        emphasis: { scale: true, scaleSize: 5 },
        data: items.map((item, index) => ({ name: itemName(item), value: item.value, itemStyle: { color: keyColor(item.key, index) } })),
      }],
    });
  },

  trend(data, theme, { accent }) {
    if (!data.labels?.length) return null;
    const colors = [accent, "#7dd3fc", "#64748b"];
    const hasRight = data.series.some((series) => series.axis === "right");
    return base(theme, {
      legend: legend(theme),
      grid: grid({ right: hasRight ? 38 : 22 }),
      tooltip: { ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: theme.axis } } },
      xAxis: categoryAxis(theme, data.labels.map(weekLabel), { boundaryGap: false }),
      yAxis: [valueAxis(theme, { minInterval: 1 }), ...(hasRight ? [valueAxis(theme, { splitLine: { show: false }, minInterval: 1 })] : [])],
      series: data.series.map((series, index) => ({
        name: series.name, type: "line", smooth: 0.35, yAxisIndex: series.axis === "right" ? 1 : 0,
        symbol: "circle", symbolSize: 6, showSymbol: data.labels.length <= 12,
        lineStyle: { width: series.axis === "right" ? 1.5 : 2.5, color: colors[index], ...(series.axis === "right" ? { type: "dashed" } : {}) },
        itemStyle: { color: colors[index], borderColor: theme.surface, borderWidth: 1.5 },
        emphasis: { focus: "series" },
        ...(series.axis !== "right" ? { areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(colors[index], 0.28) }, { offset: 1, color: alpha(colors[index], 0) }] } } } : {}),
        ...(index === 0 ? { endLabel: { show: true, color: theme.strong, fontWeight: 700, fontSize: 10.5 } } : {}),
        data: series.values,
      })),
    });
  },

  // Default funnel view: one bar per stage with "how many · % of the first".
  funnel(data, theme, { accent }) {
    const stages = data.stages || [];
    if (!stages[0]?.value) return null;
    const top = stages[0].value;
    const items = stages.map((stage, index) => ({
      name: stage.name, value: stage.value,
      note: index ? `${percentOf(stage.value, top)}% of ${stages[0].name.toLowerCase()} · ${percentOf(stage.value, stages[index - 1].value)}% of the step before` : "",
    }));
    const option = horizontalBars(theme, items, { color: accent, max: top, valueLabel: "students" });
    option.series[0].label.formatter = ({ value }) => `${value.toLocaleString()} · ${percentOf(value, top)}%`;
    option.grid.right = 78;
    option.series[0].barWidth = 16;
    return option;
  },

  barList(data, theme, { accent }) {
    const items = data.items || [];
    if (!items.length) return null;
    const tone = { warning: "#f59e0b", danger: "#f43f5e" }[data.tone] || accent;
    const unit = data.unit === "%" ? "%" : "";
    return horizontalBars(theme, items.map((item) => ({ ...item, color: item.difficulty ? DIFFICULTY_COLORS[item.difficulty] || tone : tone })), {
      color: tone, unit, max: unit ? 100 : undefined, valueLabel: data.valueLabel || "",
      tooltip: (params) => {
        const item = items[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b>${item.difficulty ? ` · ${escapeHtml(item.difficulty)}` : ""}<br/>${item.value}${unit} ${escapeHtml(data.valueLabel || "")}`
          + `${item.note ? `<br/><span style="opacity:.75">${escapeHtml(item.note)}</span>` : ""}${item.id ? "<br/><span style=\"opacity:.7\">Click to open this student</span>" : ""}`;
      },
    });
  },

  calendar(data, theme) {
    if (!data.days?.length) return null;
    const step = Math.max(1, Math.ceil((data.max || 1) / 4));
    return base(theme, {
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ value }) => `${new Date(`${value[0]}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}<br/><b>${value[1]}</b> ${escapeHtml(data.unit || "submissions")}` },
      visualMap: {
        type: "piecewise", orient: "horizontal", right: 0, bottom: 0, itemWidth: 10, itemHeight: 10, itemGap: 4,
        textStyle: { color: theme.muted, fontSize: 10 },
        pieces: [1, 2, 3, 4].map((index) => ({ min: (index - 1) * step + 1, max: index === 4 ? undefined : index * step, color: theme.sequential[index] })),
      },
      calendar: {
        range: [data.from, data.to], top: 22, left: 34, right: 8, bottom: 26, cellSize: ["auto", 13],
        splitLine: { show: false },
        itemStyle: { color: theme.empty, borderColor: theme.surface, borderWidth: 3 },
        dayLabel: { firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"], color: theme.muted, fontSize: 9.5 },
        monthLabel: { color: theme.text, fontSize: 10 },
        yearLabel: { show: false },
      },
      series: [{ type: "heatmap", coordinateSystem: "calendar", data: data.days }],
    });
  },

  radar(data, theme, { accent }) {
    const indicators = data.indicators || [];
    if (!data.student || indicators.length < 3) return null;
    return base(theme, {
      title: { text: truncate(data.student.name, 26), subtext: `Prep Score ${data.student.score}`, left: 0, top: 0, textStyle: { fontSize: 11.5, fontWeight: 700, color: theme.strong }, subtextStyle: { fontSize: 10, color: theme.muted } },
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: () => indicators.map((indicator, index) => `${escapeHtml(indicator.name)}: <b>${data.values[index]}</b> solved`).join("<br/>") },
      radar: {
        indicator: indicators.map((indicator) => ({ name: truncate(indicator.name, 14), max: indicator.max })),
        radius: "60%", center: ["50%", "58%"], splitNumber: 4, shape: "polygon",
        axisName: { color: theme.text, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.grid } },
        splitArea: { areaStyle: { color: theme.dark ? ["rgba(255,255,255,0.01)", "rgba(255,255,255,0.03)"] : ["#ffffff", "#f8fafc"] } },
        axisLine: { lineStyle: { color: theme.grid } },
      },
      series: [{
        type: "radar", symbol: "circle", symbolSize: 6,
        data: [{ value: data.values, name: data.student.name, lineStyle: { color: accent, width: 2 }, itemStyle: { color: accent }, areaStyle: { color: alpha(accent, 0.22) } }],
      }],
    });
  },

  histogram(data, theme, { accent }) {
    const bins = data.bins || [];
    if (!bins.some((bin) => bin.count)) return null;
    const label = data.label || "Prep Score";
    return base(theme, {
      grid: grid({ top: 16 }),
      tooltip: { ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ([point]) => `${escapeHtml(label)} ${point.name}<br/><b>${point.value}</b> students` },
      xAxis: categoryAxis(theme, bins.map((bin) => bin.label), { name: label, nameLocation: "middle", nameGap: 24, nameTextStyle: { color: theme.muted, fontSize: 10 } }),
      yAxis: valueAxis(theme, { minInterval: 1 }),
      series: [{
        type: "bar", barCategoryGap: "16%",
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        label: { show: true, position: "top", color: theme.muted, fontSize: 10, fontWeight: 600, formatter: ({ value }) => (value || "") },
        // Low bands in amber, strong bands in the section colour, so weak clusters stand out.
        data: bins.map((bin, index) => ({ value: bin.count, itemStyle: { color: gradient(index < 3 ? "#f59e0b" : index < 6 ? alpha(accent, 0.7) : accent) } })),
      }],
    });
  },

  stackedBar(data, theme, { view = "chart" } = {}) {
    const groups = data.groups || [];
    const series = data.series || DIFFICULTIES;
    if (!groups.some((group) => series.some((key) => group.values[key] > 0))) return null;
    const horizontal = Boolean(data.horizontal);
    const percent = view === "percent";
    const stacked = view !== "grouped";
    const labels = groups.map((group) => truncate(group.label, horizontal ? 22 : 12));
    const total = (group) => series.reduce((sum, key) => sum + (group.values[key] || 0), 0);
    const valueOf = (group, key) => (percent ? percentOf(group.values[key] || 0, total(group)) : group.values[key]);
    const values = valueAxis(theme, { minInterval: 1, ...(percent ? { max: 100, axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" } } : {}) });
    return base(theme, {
      legend: legend(theme),
      grid: grid(),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (params) => {
          const group = groups[params[0].dataIndex];
          return `<b>${escapeHtml(group.label)}</b> · ${group.students} students<br/>${series.map((key, index) => `${dot(keyColor(key, index))}${escapeHtml(key)}: <b>${group.values[key]}</b> (${percentOf(group.values[key] || 0, total(group))}%)`).join("<br/>")}`;
        },
      },
      ...(horizontal
        ? { xAxis: values, yAxis: categoryAxis(theme, labels, { inverse: true, axisLine: { show: false }, axisLabel: { color: theme.text, fontSize: 10.5, interval: 0 } }) }
        : { xAxis: categoryAxis(theme, labels), yAxis: values }),
      series: series.map((key, index) => {
        const last = index === series.length - 1;
        const radius = horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0];
        return {
          name: key, type: "bar", ...(stacked ? { stack: "total" } : {}), barMaxWidth: horizontal ? (stacked ? 16 : 9) : (stacked ? 30 : 14),
          itemStyle: { color: keyColor(key, index), borderRadius: !stacked || last ? radius : 0, borderColor: theme.surface, borderWidth: stacked ? 1 : 0 },
          emphasis: { focus: "series" },
          data: groups.map((group) => valueOf(group, key)),
        };
      }),
    });
  },

  heatmap(data, theme) {
    const columns = data.columns || data.topics || [];
    if (!data.students?.length || !columns.length) return null;
    const max = data.max || Math.max(1, ...data.cells.map((cell) => cell[2]));
    const unit = data.unit || "solved";
    const percent = unit.startsWith("%");
    return base(theme, {
      grid: grid({ top: 8, bottom: 40, left: 4 }),
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ value }) => `<b>${escapeHtml(data.students[value[1]])}</b><br/>${escapeHtml(columns[value[0]])}: <b>${value[2]}${percent ? "%" : ""}</b> ${escapeHtml(percent ? unit.slice(1).trim() : unit)}` },
      xAxis: categoryAxis(theme, columns.map((column) => truncate(column, 14)), { position: "top", axisLabel: { color: theme.text, fontSize: 10, rotate: 30, interval: 0 }, axisLine: { show: false } }),
      yAxis: categoryAxis(theme, data.students.map((name) => truncate(name, 18)), { inverse: true, axisLine: { show: false }, axisLabel: { color: theme.text, fontSize: 10, interval: 0 } }),
      visualMap: { min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 110, textStyle: { color: theme.muted, fontSize: 10 }, inRange: { color: theme.sequential } },
      series: [{
        type: "heatmap", data: data.cells,
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 4 },
        label: { show: data.students.length <= 25, fontSize: 9.5, color: theme.strong, formatter: ({ value }) => (value[2] ? `${value[2]}${percent ? "%" : ""}` : "") },
      }],
    });
  },
};

// Other ways to show a chart type ("type:view").
const viewBuilders = {
  "donut:bars": (data, theme) => {
    const items = (data.items || []).filter((item) => item.value > 0);
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const option = horizontalBars(theme, items.map((item, index) => ({ name: itemName(item), value: item.value, color: keyColor(item.key, index) })), { color: CATEGORICAL[0], valueLabel: data.centerLabel || "" });
    option.series[0].label.formatter = ({ value }) => `${value.toLocaleString()} · ${percentOf(value, total)}%`;
    option.grid.right = 70;
    return option;
  },
  "trend:bars": (data, theme, context) => {
    const option = builders.trend(data, theme, context);
    if (!option) return null;
    option.xAxis.boundaryGap = true;
    option.series = option.series.map((series) => (series.yAxisIndex
      ? series
      : { ...series, type: "bar", smooth: undefined, areaStyle: undefined, endLabel: undefined, barMaxWidth: 18, itemStyle: { ...series.itemStyle, borderRadius: [4, 4, 0, 0], borderWidth: 0 } }));
    return option;
  },
  "funnel:funnel": (data, theme, { accent }) => {
    const stages = data.stages || [];
    if (!stages[0]?.value) return null;
    const top = stages[0].value;
    return base(theme, {
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ name, value }) => `${escapeHtml(name)}<br/><b>${value}</b> students · ${percentOf(value, top)}%` },
      series: [{
        type: "funnel", left: "2%", right: "2%", top: 4, bottom: 4, min: 0, max: top, sort: "none", gap: 3, minSize: "18%",
        label: { show: true, position: "inside", color: "#fff", fontSize: 10.5, fontWeight: 600, formatter: ({ name, value }) => `${name} · ${value}` },
        itemStyle: { borderWidth: 0 },
        data: stages.map((stage, index) => ({ ...stage, itemStyle: { color: alpha(accent, 1 - index * 0.15) } })),
      }],
    });
  },
  "stackedBar:percent": (data, theme) => builders.stackedBar(data, theme, { view: "percent" }),
  "stackedBar:grouped": (data, theme) => builders.stackedBar(data, theme, { view: "grouped" }),
  "calendar:weekly": (data, theme, context) => {
    if (!data.days?.length) return null;
    const weeks = new Map();
    for (const [day, value] of data.days) {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const key = date.toISOString().slice(0, 10);
      weeks.set(key, (weeks.get(key) || 0) + value);
    }
    const ordered = [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right));
    const name = data.unit ? data.unit[0].toUpperCase() + data.unit.slice(1) : "Total";
    return builders.trend({ labels: ordered.map(([week]) => week), series: [{ name, values: ordered.map(([, value]) => value) }] }, theme, context);
  },
  "radar:bars": (data, theme, { accent }) => {
    const indicators = data.indicators || [];
    if (!data.student || !indicators.length) return null;
    return horizontalBars(theme, indicators.map((indicator, index) => ({ name: indicator.name, value: data.values[index] })), { color: accent, valueLabel: "solved" });
  },
};

export const CHART_TYPES = Object.freeze(Object.keys(builders));

/** The chart's accent colour (the app's sky for every feature). */
export const accentFor = (chart) => SECTION_ACCENTS[chart?.section] || SECTION_ACCENTS.coding;

/** ECharts option for a chart payload in a view, or null when there is nothing to draw. */
export function buildChartOption(chart, theme, view = "chart") {
  if (!chart?.data) return null;
  const context = { accent: accentFor(chart), view };
  const builder = (view !== "chart" && viewBuilders[`${chart.type}:${view}`]) || builders[chart.type];
  if (!builder) return null;
  return builder(chart.data, theme, context);
}

/** Height in px for a chart card body, by chart type and data size. */
export function chartHeight(chart) {
  if (chart.type === "heatmap") return Math.max(240, Math.min(720, 80 + (chart.data?.students?.length || 0) * 22));
  if (chart.type === "rankedStackedBar" || chart.type === "barList") return Math.max(220, Math.min(420, 40 + (chart.data?.items?.length || 0) * 26));
  if (chart.type === "stackedBar" && chart.data?.horizontal) return Math.max(220, Math.min(460, 60 + (chart.data?.groups?.length || 0) * 28));
  if (chart.type === "calendar") return 170;
  return { sm: 240, md: 270, lg: 280, full: 300 }[chart.size] || 270;
}

// ---------------------------------------------------------------- the same data as a table

const dayText = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Any chart's data as { columns: [{ label, numeric }], rows: [[cell]] }, for the
 * "Table" view and the chart's CSV download.
 */
export function chartTable(chart) {
  const data = chart?.data || {};
  const text = (label) => ({ label, numeric: false });
  const number = (label) => ({ label, numeric: true });
  switch (chart?.type) {
    case "rankedStackedBar":
      return { columns: [number("#"), text("Student"), number("Prep Score"), number("Easy"), number("Medium"), number("Hard")], rows: (data.items || []).map((item) => [item.position, item.name, item.score, item.solved?.Easy || 0, item.solved?.Medium || 0, item.solved?.Hard || 0]), ids: (data.items || []).map((item) => item.id) };
    case "barList": {
      const items = data.items || [];
      const unit = data.unit === "%" ? " (%)" : "";
      const label = data.valueLabel ? data.valueLabel[0].toUpperCase() + data.valueLabel.slice(1) : "Value";
      const hasDifficulty = items.some((item) => item.difficulty);
      const hasNote = items.some((item) => item.note);
      return {
        columns: [text("Name"), ...(hasDifficulty ? [text("Difficulty")] : []), number(`${label}${unit}`), ...(hasNote ? [text("Note")] : [])],
        rows: items.map((item) => [item.name, ...(hasDifficulty ? [item.difficulty || ""] : []), item.value, ...(hasNote ? [item.note || ""] : [])]),
        ids: items.map((item) => item.id),
      };
    }
    case "donut": {
      const items = (data.items || []).filter((item) => item.value > 0);
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { columns: [text("Name"), number("Count"), number("Share (%)")], rows: items.map((item) => [itemName(item), item.value, percentOf(item.value, total)]) };
    }
    case "trend":
      return { columns: [text("Week of"), ...(data.series || []).map((series) => number(series.name))], rows: (data.labels || []).map((label, index) => [dayText(label), ...(data.series || []).map((series) => series.values[index] ?? 0)]) };
    case "funnel": {
      const stages = data.stages || [];
      const top = stages[0]?.value || 0;
      return { columns: [text("Step"), number("Students"), number("% of first step"), number("% of step before")], rows: stages.map((stage, index) => [stage.name, stage.value, percentOf(stage.value, top), index ? percentOf(stage.value, stages[index - 1].value) : 100]) };
    }
    case "histogram":
      return { columns: [text(data.label || "Band"), number("Students")], rows: (data.bins || []).map((bin) => [bin.label, bin.count]) };
    case "stackedBar": {
      const series = data.series || DIFFICULTIES;
      return { columns: [text("Group"), ...series.map(number), number("Total")], rows: (data.groups || []).map((group) => [group.label, ...series.map((key) => group.values[key] || 0), series.reduce((sum, key) => sum + (group.values[key] || 0), 0)]) };
    }
    case "heatmap": {
      const columns = data.columns || data.topics || [];
      const percent = String(data.unit || "").startsWith("%");
      const cells = new Map((data.cells || []).map(([x, y, value]) => [`${x}:${y}`, value]));
      return { columns: [text("Student"), ...columns.map((column) => number(percent ? `${column} (%)` : column))], rows: (data.students || []).map((name, y) => [name, ...columns.map((_, x) => cells.get(`${x}:${y}`) ?? 0)]) };
    }
    case "calendar":
      return { columns: [text("Day"), number(data.unit ? data.unit[0].toUpperCase() + data.unit.slice(1) : "Total")], rows: [...(data.days || [])].sort(([left], [right]) => right.localeCompare(left)).map(([day, value]) => [dayText(day), value]) };
    case "radar":
      return { columns: [text("Topic"), number("Solved")], rows: (data.indicators || []).map((indicator, index) => [indicator.name, data.values?.[index] ?? 0]) };
    default:
      return { columns: [], rows: [] };
  }
}

/** A chart's table as CSV text (Excel-friendly, formula-safe). */
export function chartCsv(chart) {
  const { columns, rows } = chartTable(chart);
  const cell = (value) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${[columns.map((column) => cell(column.label)), ...rows.map((row) => row.map(cell))].map((line) => line.join(",")).join("\r\n")}`;
}
