// Turns a chart payload from /admin/prep-analysis/query into an ECharts option.
// Each chart type can be shown a few ways ("views"); every chart can also be a
// plain table (chartTable). Builders return null when there is nothing to draw,
// so the card can show an honest empty state instead of an empty axis.

import { formatScore } from "../../../student/prepScore/formatScore.js";
import { CATEGORICAL, DIFFICULTY_COLORS, OUTCOME_COLORS, SECTION_ACCENTS, SERIES_COLORS, alpha } from "./chartTheme.js";

const FONT = "Manrope, ui-sans-serif, system-ui, sans-serif";
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const LANGUAGE_LABELS = Object.freeze({
  python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++", c: "C", typescript: "TypeScript",
  csharp: "C#", php: "PHP", go: "Go", rust: "Rust", kotlin: "Kotlin", ruby: "Ruby", swift: "Swift", r: "R", sql: "SQL",
});
// Combo charts: outcome-like bar names keep a fixed meaning; lines are violet, then amber.
const COMBO_BAR_COLORS = { Finished: "#10b981", "In progress": "#38bdf8", Solved: "#10b981", "Not solved yet": "#cbd5e1" };
const COMBO_LINE_COLORS = ["#7c3aed", "#f59e0b"];
const TREND_NAME_COLORS = { Accepted: "#10b981", "Not accepted": "#f43f5e" };
const truncate = (text, size = 18) => (String(text).length > size ? `${String(text).slice(0, size - 1)}…` : String(text));
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const weekLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const dot = (color) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color}"></span>`;

/** Ways each chart type can be shown. "table" is always last. */
export const CHART_VIEWS = Object.freeze({
  rankedStackedBar: [{ value: "chart", label: "Bars" }, { value: "mix", label: "Difficulty mix" }, { value: "table", label: "Table" }],
  barList: [{ value: "chart", label: "Bars" }, { value: "lollipop", label: "Lollipop" }, { value: "treemap", label: "Treemap" }, { value: "table", label: "Table" }],
  bubble: [{ value: "chart", label: "Bubbles" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
  donut: [{ value: "chart", label: "Donut" }, { value: "rose", label: "Rose" }, { value: "treemap", label: "Treemap" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
  trend: [{ value: "chart", label: "Line" }, { value: "bars", label: "Bars" }, { value: "combo", label: "Bars and line" }, { value: "table", label: "Table" }],
  funnel: [{ value: "chart", label: "Steps" }, { value: "funnel", label: "Funnel" }, { value: "drop", label: "Drop-off" }, { value: "table", label: "Table" }],
  histogram: [{ value: "chart", label: "Bars" }, { value: "curve", label: "Curve" }, { value: "table", label: "Table" }],
  stackedBar: [{ value: "chart", label: "Counts" }, { value: "percent", label: "Percent" }, { value: "grouped", label: "Side by side" }, { value: "heat", label: "Heat grid" }, { value: "table", label: "Table" }],
  heatmap: [{ value: "chart", label: "Grid" }, { value: "table", label: "Table" }],
  calendar: [{ value: "chart", label: "Calendar" }, { value: "weekly", label: "By week" }, { value: "weekday", label: "By weekday" }, { value: "table", label: "Table" }],
  radar: [{ value: "chart", label: "Radar" }, { value: "polar", label: "Radial" }, { value: "bars", label: "Bars" }, { value: "table", label: "Table" }],
  scatter: [{ value: "chart", label: "Dots" }, { value: "table", label: "Table" }],
  boxplot: [{ value: "chart", label: "Box plot" }, { value: "table", label: "Table" }],
  combo: [{ value: "chart", label: "Bars and lines" }, { value: "table", label: "Table" }],
});
export const viewsFor = (type) => CHART_VIEWS[type] || [{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }];

function base(theme, extra = {}) {
  return {
    animationDuration: 500,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: FONT, color: theme.text, fontSize: 11 },
    tooltip: {
      // Drawn on <body>, not inside the card: Safari clips anything inside a rounded,
      // overflow-hidden or transformed card, which hid tooltips there. Touch: tap shows it.
      appendToBody: true,
      confine: false,
      triggerOn: "mousemove|click",
      transitionDuration: 0.15,
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

export const keyColor = (key, index = 0) => DIFFICULTY_COLORS[key] || OUTCOME_COLORS[key] || CATEGORICAL[index % CATEGORICAL.length];
const itemName = (item) => LANGUAGE_LABELS[item.name] || item.name;

/**
 * Row labels that report their row when clicked: the category values are row indexes (so two
 * students with the same name stay apart) and the label shows the name.
 */
const rowAxis = (theme, names, size = 24, labelWidth = null) => categoryAxis(theme, names.map((_, index) => String(index)), {
  inverse: true, axisLine: { show: false }, triggerEvent: true,
  axisLabel: {
    color: theme.text, fontSize: 10.5, interval: 0, formatter: (value) => truncate(names[Number(value)] ?? "", size),
    // In an aligned chart the label column has one fixed width; longer names end in "…".
    ...(labelWidth ? { width: labelWidth, overflow: "truncate", ellipsis: "…" } : {}),
  },
});

// Every ranked-bar chart shares one layout: a fixed label column on the left and a fixed figures
// column on the right, so bars start and figures end at the same place on every card.
const LABEL_COLUMN = 124;
const VALUE_COLUMN = 88;
// Count and share are two columns ("9" and "1.5%"), never one "9 · 1.5%" string.
const COUNT_COLUMN = 64;
const SHARE_COLUMN = 90;
const alignedGrid = (extra = {}) => grid({ left: LABEL_COLUMN, right: VALUE_COLUMN, containLabel: false, ...extra });
const capitalize = (text) => (text ? String(text)[0].toUpperCase() + String(text).slice(1) : "");

/** A small column heading above a chart's label or figures column ("TOPIC", "STUDENTS", "% OF STUDENTS"). */
const columnHeading = (theme, text, position) => ({
  text: String(text || "").toUpperCase(), top: 2, ...position,
  textStyle: { color: theme.muted, fontSize: 9.5, fontWeight: 700, fontFamily: FONT },
});
const plain = (value) => (typeof value === "number" ? value.toLocaleString() : value);

/**
 * A second row axis on the right that shows each row's value ("77 · 10.8%"), right-aligned in one
 * column at the chart edge, instead of a label floating at the end of each bar.
 */
const valueColumn = (theme, texts, column = null) => {
  // Aligned charts: the figures' right edge is the card's right edge, in a column of fixed width.
  const width = column ? column - 4 : Math.max(24, ...texts.map((text) => String(text).length * 6.3)) + 6;
  return categoryAxis(theme, texts.map((_, index) => String(index)), {
    inverse: true, position: "right", axisLine: { show: false }, axisTick: { show: false },
    axisLabel: {
      color: theme.strong, fontSize: 10.5, fontWeight: 700, align: "right", margin: width, interval: 0, formatter: (value) => texts[Number(value)] ?? "",
      ...(column ? { width: column - 8, overflow: "truncate", ellipsis: "…" } : {}),
    },
  });
};

/**
 * Horizontal ranked bars: [{ name, value, color?, note?, pct? }]. Shared by several views.
 * Figures sit in their own columns under headings: the count, and (when there is one) its share
 * as a second column. `share(item)` overrides the share text; `headings` names the columns.
 */
function horizontalBars(theme, items, { color, unit = "", max, valueLabel = "", tooltip, share, headings = {} } = {}) {
  const count = (item) => `${plain(item.value)}${unit}`;
  const shareOf = share || ((item) => (item.pct !== undefined && item.pct !== null && !unit ? `${item.pct}%` : ""));
  const shares = items.map(shareOf);
  const twoColumns = shares.some(Boolean);
  // Kept for the tooltip: "1,175 · 39%".
  const label = (item) => [count(item), shareOf(item)].filter(Boolean).join(" · ");
  const right = twoColumns ? COUNT_COLUMN + SHARE_COLUMN : VALUE_COLUMN;
  const titles = [
    ...(headings.label ? [columnHeading(theme, headings.label, { left: LABEL_COLUMN - 10, textAlign: "right" })] : []),
    // Each heading's right edge is its column's right edge (figures are right-aligned 4px in).
    // `right` already places the heading's right edge; a textAlign as well would shift it twice.
    columnHeading(theme, headings.count || capitalize(valueLabel) || "Value", { right: twoColumns ? SHARE_COLUMN + 4 : 4 }),
    ...(twoColumns ? [columnHeading(theme, headings.share || "Share", { right: 4 })] : []),
  ];
  return base(theme, {
    title: titles,
    grid: alignedGrid({ top: 24, bottom: 4, right }),
    tooltip: {
      ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(color, 0.06) } },
      formatter: tooltip || ((params) => {
        const item = items[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b><br/>${dot(item.color || color)}${label(item)} ${escapeHtml(valueLabel)}${item.note ? `<br/><span style="opacity:.75">${escapeHtml(item.note)}</span>` : ""}`;
      }),
    },
    xAxis: valueAxis(theme, { splitLine: { show: false }, axisLabel: { show: false }, ...(max ? { max } : {}) }),
    // Values sit in one right-aligned column; the grey track runs the full width up to it.
    yAxis: [
      rowAxis(theme, items.map((item) => item.name), 40, LABEL_COLUMN - 10),
      valueColumn(theme, items.map(count), twoColumns ? COUNT_COLUMN : VALUE_COLUMN),
      // The share column sits just right of the counts, lighter, under its own heading.
      ...(twoColumns ? [{ ...valueColumn(theme, shares, SHARE_COLUMN), offset: COUNT_COLUMN, axisLabel: { ...valueColumn(theme, shares, SHARE_COLUMN).axisLabel, color: theme.muted, fontWeight: 600 } }] : []),
    ],
    series: [{
      type: "bar", barWidth: 12, cursor: "pointer",
      showBackground: true, backgroundStyle: { color: theme.empty, borderRadius: 6 },
      itemStyle: { borderRadius: 6 },
      data: items.map((item) => ({ value: item.value, itemStyle: { color: gradient(item.color || color, true) } })),
    }],
  });
}

// Topic bubbles: priority colours (see TOPIC_TIERS on the server).
export const TIER_COLORS = Object.freeze({ strong: "#10b981", growing: "#0ea5e9", focus: "#f59e0b" });

const builders = {
  /**
   * Packed bubbles, one per item: area grows with the value, colour is the item's priority tier.
   * data: { items: [{ key, name, value, pct?, accuracy?, tier }], tiers: [{ key, label, hint }], valueLabel }.
   */
  bubble(data, theme) {
    const items = data.items || [];
    if (!items.length) return null;
    const most = Math.max(1, ...items.map((item) => item.value));
    const count = items.length;
    // Fewer topics, bigger bubbles; many topics still fit the card.
    const maxSize = count > 80 ? 56 : count > 40 ? 68 : count > 15 ? 84 : 104;
    const minSize = count > 80 ? 15 : count > 40 ? 18 : 24;
    const sizeOf = (value) => Math.round(minSize + (maxSize - minSize) * Math.sqrt(value / most));
    const tiers = data.tiers?.length ? data.tiers : [{ key: "strong", label: "Most practised" }, { key: "growing", label: "Growing" }, { key: "focus", label: "Needs focus" }];
    const tierIndex = new Map(tiers.map((tier, index) => [tier.key, index]));
    const tierLabel = new Map(tiers.map((tier) => [tier.key, tier.label]));
    const valueName = data.valueLabel || "students";
    return base(theme, {
      legend: { ...legend(theme), data: tiers.map((tier) => tier.label), selectedMode: false },
      tooltip: {
        ...base(theme).tooltip, trigger: "item",
        formatter: (params) => {
          const item = items[params.dataIndex];
          if (!item) return "";
          const color = TIER_COLORS[item.tier] || CATEGORICAL[0];
          return `<b>${escapeHtml(item.name)}</b><br/>${dot(color)}<b>${plain(item.value)}</b> ${escapeHtml(valueName)}`
            + `${item.pct !== undefined ? ` · ${item.pct}% of ${data.cohort ? plain(data.cohort) : "students"}` : ""}`
            + `${item.accuracy !== undefined ? `<br/><span style="opacity:.75">${item.accuracy}% of submissions accepted</span>` : ""}`
            + `<br/><span style="opacity:.75">Priority: ${escapeHtml(tierLabel.get(item.tier) || "—")}</span>`;
        },
      },
      series: [{
        type: "graph", layout: "force", roam: false, draggable: false, cursor: "pointer",
        top: 30, bottom: 6, left: 6, right: 6,
        categories: tiers.map((tier) => ({ name: tier.label, itemStyle: { color: TIER_COLORS[tier.key] || CATEGORICAL[0] } })),
        force: { repulsion: maxSize * 2.4, gravity: 0.14, edgeLength: 1, friction: 0.3, layoutAnimation: true },
        emphasis: { scale: 1.06, label: { show: true } },
        labelLayout: { hideOverlap: true },
        links: [],
        data: items.map((item) => {
          const size = sizeOf(item.value);
          const color = TIER_COLORS[item.tier] || CATEGORICAL[0];
          const big = size >= 52;
          // Rich-text markers in a name would break the label: keep its text only.
          const safeName = String(item.name).replace(/[{}|]/g, "");
          return {
            id: String(item.key), name: item.name, value: item.value, symbolSize: size, category: tierIndex.get(item.tier) ?? 0,
            itemStyle: {
              color: { type: "radial", x: 0.35, y: 0.3, r: 0.85, colorStops: [{ offset: 0, color: alpha(color, 0.72) }, { offset: 1, color }] },
              borderColor: theme.surface, borderWidth: 2, shadowBlur: 8, shadowColor: alpha(color, 0.35),
            },
            label: {
              show: size >= 34, position: "inside", width: size - 10, overflow: "truncate", ellipsis: "…", lineHeight: 13,
              formatter: () => (big ? `{name|${safeName}}\n{count|${plain(item.value)}}` : `{name|${safeName}}`),
              rich: {
                name: { color: "#fff", fontSize: big ? 11 : 9.5, fontWeight: 700, fontFamily: FONT },
                count: { color: "rgba(255,255,255,.88)", fontSize: 10, fontWeight: 600, fontFamily: FONT },
              },
            },
          };
        }),
      }],
    });
  },

  rankedStackedBar(data, theme) {
    const items = data.items || [];
    if (!items.length) return null;
    const inset = 8;
    const scoreColumn = 82;
    const desktopLeft = 156;
    const mobileLeft = 112;
    const studentAxis = rowAxis(theme, items.map((item) => `${item.position}. ${item.name}`), Infinity);
    const scoreAxis = rowAxis(theme, items.map((item) => formatScore(item.score)));
    const studentLabel = (left) => ({
      ...studentAxis.axisLabel,
      align: "left", margin: left - inset, width: left - inset - 12, overflow: "truncate",
    });
    const columnLayout = (left) => ({ grid: { left }, yAxis: [{ axisLabel: studentLabel(left) }, {}] });
    const headings = [
      { text: "Student", left: inset },
      { text: "Prep Score", right: inset },
    ].map((heading) => ({
      ...heading, top: 3, padding: 0, textStyle: { color: theme.text, fontSize: 11, fontWeight: 700 },
    }));
    return base(theme, {
      title: headings,
      grid: grid({ top: 26, left: desktopLeft, right: scoreColumn, bottom: 24, containLabel: false }),
      media: [{ query: { maxWidth: 430 }, option: columnLayout(mobileLeft) }, { option: columnLayout(desktopLeft) }],
      tooltip: {
        ...base(theme).tooltip, trigger: "item",
        formatter: ({ dataIndex }) => {
          const item = items[dataIndex];
          return item ? `<b>${escapeHtml(item.name)}</b><br/>Prep Score <b>${formatScore(item.score)}</b><br/>Click to see student details` : "";
        },
      },
      xAxis: valueAxis(theme, { splitNumber: 4, axisLabel: { color: theme.muted, fontSize: 10, hideOverlap: true } }),
      yAxis: [
        { ...studentAxis, axisLabel: studentLabel(desktopLeft) },
        {
          ...scoreAxis,
          position: "right",
          axisLabel: { ...scoreAxis.axisLabel, color: theme.strong, fontSize: 11, fontWeight: 700, align: "right", margin: scoreColumn - inset },
        },
      ],
      series: DIFFICULTIES.map((key, index) => ({
        name: key, type: "bar", stack: "score", barWidth: 14, cursor: "pointer",
        showBackground: index === 0, backgroundStyle: { color: theme.empty, borderRadius: 5 },
        itemStyle: { color: DIFFICULTY_COLORS[key], borderColor: theme.surface, borderWidth: 1 },
        data: items.map((item) => item.segments[key]),
      })),
    });
  },

  donut(data, theme) {
    const items = (data.items || []).filter((item) => item.value > 0);
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + item.value, 0);
    // The legend is HTML beside the chart (each chip opens its part), so the ring is centred.
    return base(theme, {
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ name: label, value, percent, color }) => `${dot(color)}${escapeHtml(label)}<br/><b>${value.toLocaleString()}</b> · ${percent}%` },
      title: {
        // The anchor is the ring's centre; textAlign centres the text on it.
        text: total.toLocaleString(), subtext: data.centerLabel || "", left: "50%", top: "40%", textAlign: "center", itemGap: 2,
        textStyle: { fontSize: 20, fontWeight: 800, color: theme.strong }, subtextStyle: { fontSize: 10, color: theme.muted },
      },
      series: [
        {
          type: "pie", radius: ["58%", "82%"], center: ["50%", "52%"], avoidLabelOverlap: true, padAngle: 2, cursor: "pointer",
          itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 7 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 14, shadowColor: "rgba(15,23,42,0.22)" } },
          data: items.map((item, index) => ({ name: itemName(item), value: item.value, itemStyle: { color: keyColor(item.key, index) } })),
        },
        // A thin, pale outer ring in the same colours: only decoration, so it takes no clicks.
        {
          type: "pie", radius: ["86%", "89%"], center: ["50%", "52%"], silent: true, padAngle: 2, label: { show: false }, tooltip: { show: false },
          itemStyle: { borderColor: theme.surface, borderWidth: 1 },
          data: items.map((item, index) => ({ name: itemName(item), value: item.value, itemStyle: { color: alpha(keyColor(item.key, index), 0.28) } })),
        },
      ],
    });
  },

  trend(data, theme, { accent }) {
    if (!data.labels?.length) return null;
    const left = data.series.filter((series) => series.axis !== "right");
    // Left-axis series take sky, emerald, violet in turn; the right-axis line is slate.
    // Outcome names keep their meaning (accepted green, not accepted red) whatever their order.
    const colors = data.series.map((series) => (series.axis === "right" ? "#64748b" : TREND_NAME_COLORS[series.name] || SERIES_COLORS[left.indexOf(series) % SERIES_COLORS.length] || accent));
    const hasRight = data.series.some((series) => series.axis === "right");
    return base(theme, {
      legend: legend(theme),
      grid: grid({ right: hasRight ? 38 : 22 }),
      // Smooth hover: the guide line snaps to the nearest week (or day) and glides there, and one
      // tooltip lists every line for that point; no series dimming while the pointer moves.
      tooltip: {
        ...base(theme).tooltip, trigger: "axis",
        axisPointer: { type: "line", snap: true, animation: true, animationDurationUpdate: 140, lineStyle: { color: alpha(colors[0] || accent, 0.55), width: 1.5, type: "dashed" } },
        formatter: (params) => {
          const index = params[0]?.dataIndex ?? 0;
          const day = data.labels[index];
          const heading = data.interval === "day"
            ? new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
            : `Week of ${weekLabel(day)}`;
          const rows = params.map((point) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:3px">`
            + `<span>${dot(colors[point.seriesIndex])}${escapeHtml(point.seriesName)}</span><b>${plain(point.value)}</b></div>`).join("");
          return `<div style="font-weight:700;margin-bottom:2px">${escapeHtml(heading)}</div>${rows}`;
        },
      },
      xAxis: categoryAxis(theme, data.labels.map(weekLabel), { boundaryGap: false }),
      yAxis: [valueAxis(theme, { minInterval: 1 }), ...(hasRight ? [valueAxis(theme, { splitLine: { show: false }, minInterval: 1 })] : [])],
      series: data.series.map((series, index) => ({
        name: series.name, type: "line", smooth: 0.35, yAxisIndex: series.axis === "right" ? 1 : 0,
        // Parts of one whole (accepted + not accepted = submissions) stack.
        ...(series.stack ? { stack: series.stack } : {}),
        symbol: "circle", symbolSize: 6, showSymbol: data.labels.length <= 12,
        lineStyle: { width: series.axis === "right" ? 1.5 : 2.5, color: colors[index], ...(series.axis === "right" ? { type: "dashed" } : {}) },
        itemStyle: { color: colors[index], borderColor: theme.surface, borderWidth: 1.5 },
        // Hovered points grow a little; nothing else fades (that fading made the hover flicker).
        emphasis: { focus: "none", scale: 1.6, lineStyle: { width: series.axis === "right" ? 1.5 : 2.5 } },
        ...(series.axis !== "right" ? { areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(colors[index], 0.28) }, { offset: 1, color: alpha(colors[index], 0) }] } } } : {}),
        ...(index === 0 ? {
          endLabel: { show: true, color: theme.strong, fontWeight: 700, fontSize: 10.5 },
          // The busiest week, as a pin, once there are enough weeks for a peak to mean something.
          ...(data.labels.length > 3 && Math.max(...series.values) > 0 && series.values.indexOf(Math.max(...series.values)) < series.values.length - 1 ? {
            markPoint: { symbol: "pin", symbolSize: 36, data: [{ type: "max", name: "Peak" }], itemStyle: { color: colors[0] }, label: { color: "#fff", fontSize: 9.5, fontWeight: 700 }, silent: true },
          } : {}),
        } : {}),
        data: series.values,
      })),
    });
  },

  /**
   * Bars and lines together: counts as (stacked) bars on the left axis, rates as lines on a 0–100%
   * right axis. data: { categories: [{ key, label, students, note? }], bars: [{ name, values, stack? }],
   * lines: [{ name, values, unit: "%" }], barLabel }.
   */
  combo(data, theme) {
    const categories = data.categories || [];
    const bars = data.bars || [];
    const lines = data.lines || [];
    if (!categories.length || !bars.some((bar) => bar.values.some((value) => value > 0))) return null;
    const many = categories.length > 6;
    const barColor = (name, index) => COMBO_BAR_COLORS[name] || SERIES_COLORS[index % SERIES_COLORS.length];
    // Only the top segment of each stack gets rounded corners.
    const topOfStack = new Map(bars.map((bar, index) => [bar.stack || `solo-${index}`, index]));
    return base(theme, {
      legend: legend(theme),
      grid: grid({ top: 34, right: lines.length ? 10 : 14, bottom: many ? 4 : 6 }),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha("#0ea5e9", 0.06) } },
        formatter: (params) => {
          const index = params[0]?.dataIndex ?? 0;
          const category = categories[index];
          const rows = [
            ...bars.map((bar, barIndex) => `${dot(barColor(bar.name, barIndex))}${escapeHtml(bar.name)} <b>${plain(bar.values[index] ?? 0)}</b>`),
            ...lines.map((line, lineIndex) => `${dot(COMBO_LINE_COLORS[lineIndex % COMBO_LINE_COLORS.length])}${escapeHtml(line.name)} <b>${line.values[index] ?? 0}${line.unit || ""}</b>`),
          ];
          return `<b>${escapeHtml(category?.label || "")}</b><br/>${rows.join("<br/>")}${category?.note ? `<br/><span style="opacity:.75">${escapeHtml(category.note)}</span>` : ""}`;
        },
      },
      xAxis: categoryAxis(theme, categories.map((_, index) => String(index)), {
        axisLabel: { color: theme.text, fontSize: 10.5, interval: 0, rotate: many ? 28 : 0, formatter: (value) => truncate(categories[Number(value)]?.label ?? "", many ? 12 : 18) },
      }),
      yAxis: [
        valueAxis(theme, { minInterval: 1, name: data.barLabel || "", nameTextStyle: { color: theme.muted, fontSize: 10, align: "left" } }),
        ...(lines.length ? [valueAxis(theme, { max: 100, splitLine: { show: false }, axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" } })] : []),
      ],
      series: [
        ...bars.map((bar, index) => {
          const stack = bar.stack || `solo-${index}`;
          const top = topOfStack.get(stack) === index;
          return {
            name: bar.name, type: "bar", stack: bar.stack, barMaxWidth: 34, cursor: "pointer",
            itemStyle: { color: gradient(barColor(bar.name, index)), borderRadius: top ? [6, 6, 0, 0] : 0, borderColor: theme.surface, borderWidth: bar.stack ? 1 : 0 },
            emphasis: { focus: "series" },
            data: bar.values,
          };
        }),
        ...lines.map((line, index) => {
          const color = COMBO_LINE_COLORS[index % COMBO_LINE_COLORS.length];
          return {
            name: line.name, type: "line", yAxisIndex: 1, smooth: 0.3, z: 5, cursor: "pointer",
            symbol: "circle", symbolSize: 8, lineStyle: { width: 2.5, color, ...(index ? { type: "dashed" } : {}) },
            itemStyle: { color, borderColor: theme.surface, borderWidth: 2 },
            label: { show: categories.length <= 8 && index === 0, position: "top", color, fontSize: 10, fontWeight: 700, formatter: ({ value }) => `${value}${line.unit || ""}` },
            data: line.values,
          };
        }),
      ],
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
    const option = horizontalBars(theme, items, {
      color: accent, max: top, valueLabel: "students", share: (item) => `${percentOf(item.value, top)}%`,
      headings: { label: "Step", count: "Students", share: "% of first" },
    });
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
      // Short headings that fit their columns: "Students" next to "% of students".
      headings: { label: data.itemLabel || "", count: data.countLabel || (items.some((item) => item.pct !== undefined) && !unit ? "Students" : capitalize(data.valueLabel || "")), share: "% of students" },
      tooltip: (params) => {
        const item = items[params[0].dataIndex];
        const share = item.pct !== undefined ? ` (${item.pct}% of ${data.cohort ? data.cohort.toLocaleString() : "students in view"})` : "";
        return `<b>${escapeHtml(item.name)}</b>${item.difficulty ? ` · ${escapeHtml(item.difficulty)}` : ""}<br/>${plain(item.value)}${unit} ${escapeHtml(data.valueLabel || "")}${share}`
          + `${item.note ? `<br/><span style="opacity:.75">${escapeHtml(item.note)}</span>` : ""}`;
      },
    });
  },

  calendar(data, theme) {
    if (!data.days?.length) return null;
    const step = Math.max(1, Math.ceil((data.max || 1) / 4));
    // Every day of the range, 0 where nothing happened: hovering (or tapping) any day says so.
    const counts = new Map(data.days.map(([day, value]) => [day, value]));
    const allDays = [];
    for (let time = Date.parse(`${data.from}T00:00:00Z`), end = Date.parse(`${data.to}T00:00:00Z`); time <= end; time += 86400000) {
      const day = new Date(time).toISOString().slice(0, 10);
      allDays.push([day, counts.get(day) || 0]);
    }
    return base(theme, {
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ value }) => `${new Date(`${value[0]}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}<br/><b>${value[1]}</b> ${escapeHtml(data.unit || "submissions")}` },
      visualMap: {
        type: "piecewise", orient: "horizontal", right: 0, bottom: 0, itemWidth: 10, itemHeight: 10, itemGap: 4,
        textStyle: { color: theme.muted, fontSize: 10 },
        pieces: [{ value: 0, color: theme.empty, label: "0" }, ...[1, 2, 3, 4].map((index) => ({ min: (index - 1) * step + 1, max: index === 4 ? undefined : index * step, color: theme.sequential[index] }))],
      },
      calendar: {
        range: [data.from, data.to], top: 22, left: 34, right: 8, bottom: 26, cellSize: ["auto", 13],
        splitLine: { show: false },
        itemStyle: { color: theme.empty, borderColor: theme.surface, borderWidth: 3 },
        dayLabel: { firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"], color: theme.muted, fontSize: 9.5 },
        monthLabel: { color: theme.text, fontSize: 10 },
        yearLabel: { show: false },
      },
      series: [{ type: "heatmap", coordinateSystem: "calendar", data: allDays.length ? allDays : data.days }],
    });
  },

  // Cohort mode: % of the filtered students who solved in each topic. Student mode: that
  // student's solves per topic over the filtered students' average.
  radar(data, theme, { accent }) {
    const indicators = data.indicators || [];
    if (indicators.length < 3) return null;
    const topics = data.topics || [];
    const cohort = data.mode === "cohort" || !data.student;
    // Shares sit close together in a large cohort; a fixed 0–100% ring would draw them as a dot,
    // so the ring runs to the next 10% above the largest share and says so.
    const ceiling = cohort ? Math.min(100, Math.max(10, Math.ceil(Math.max(...data.values, 0) / 10) * 10)) : null;
    const title = cohort
      ? { text: "All students in view", subtext: `${(data.cohort || 0).toLocaleString()} students · % who solved each topic (scale 0–${ceiling}%)` }
      : { text: truncate(data.student.name, 26), subtext: `Prep Score ${formatScore(data.student.score)} · dashed: average of students in view` };
    const line = (topic, index) => (cohort
      ? `${escapeHtml(topic?.name || indicators[index].name)}: <b>${data.values[index]}%</b> (${(topic?.students || 0).toLocaleString()} of ${(data.cohort || 0).toLocaleString()})`
        + `${topic ? ` · avg ${topic.avgSolved} solved · ${topic.accuracy}% accurate` : ""}`
      : `${escapeHtml(indicators[index].name)}: <b>${data.values[index]}</b> solved · average ${data.average?.[index] ?? 0}`);
    const series = [{ value: data.values, name: cohort ? "Students who solved (%)" : data.student.name, lineStyle: { color: accent, width: 2 }, itemStyle: { color: accent }, areaStyle: { color: alpha(accent, 0.22) } }];
    if (!cohort && data.average) series.push({ value: data.average, name: "Average of students in view", lineStyle: { color: theme.muted, width: 1.5, type: "dashed" }, itemStyle: { color: theme.muted }, symbolSize: 4 });
    return base(theme, {
      title: { ...title, left: 0, top: 0, textStyle: { fontSize: 11.5, fontWeight: 700, color: theme.strong }, subtextStyle: { fontSize: 10, color: theme.muted } },
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: () => indicators.map((_, index) => line(topics[index], index)).join("<br/>") },
      radar: {
        // Full names (a click on a name reports it); only the label is shortened.
        indicator: indicators.map((indicator) => ({ name: indicator.name, max: ceiling ?? indicator.max })),
        radius: "60%", center: ["50%", "58%"], splitNumber: 4, shape: "polygon", triggerEvent: true,
        axisName: { color: theme.text, fontSize: 10, formatter: (name) => truncate(name, 14) },
        splitLine: { lineStyle: { color: theme.grid } },
        splitArea: { areaStyle: { color: theme.dark ? ["rgba(255,255,255,0.01)", "rgba(255,255,255,0.03)"] : ["#ffffff", "#f8fafc"] } },
        axisLine: { lineStyle: { color: theme.grid } },
      },
      series: [{ type: "radar", symbol: "circle", symbolSize: 6, data: series }],
    });
  },

  histogram(data, theme, { accent }) {
    const bins = data.bins || [];
    if (!bins.some((bin) => bin.count)) return null;
    const label = data.label || "Prep Score";
    const counted = bins.reduce((sum, bin) => sum + bin.count, 0);
    // Running share of students up to and including each band (the line), and the band where it
    // passes half: that is where the middle student sits.
    let running = 0;
    const cumulative = bins.map((bin) => { running += bin.count; return percentOf(running, counted); });
    const medianBand = cumulative.findIndex((share) => share >= 50);
    return base(theme, {
      legend: legend(theme),
      grid: grid({ top: 44, right: 40, bottom: 20 }),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(accent, 0.06) } },
        formatter: (points) => {
          const index = points[0].dataIndex;
          return `<b>${escapeHtml(label)} ${escapeHtml(bins[index].label)}</b><br/>${dot(accent)}<b>${plain(bins[index].count)}</b> students · ${percentOf(bins[index].count, counted)}%`
            + `<br/><span style="opacity:.75">${cumulative[index]}% of students are at or below this band</span>`;
        },
      },
      xAxis: categoryAxis(theme, bins.map((bin) => bin.label), { name: label, nameLocation: "middle", nameGap: 24, nameTextStyle: { color: theme.muted, fontSize: 10 } }),
      yAxis: [valueAxis(theme, { minInterval: 1 }), valueAxis(theme, { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" } })],
      series: [
        {
          name: "Students", type: "bar", barCategoryGap: "16%", cursor: "pointer",
          itemStyle: { borderRadius: [7, 7, 0, 0] },
          label: { show: true, position: "top", color: theme.muted, fontSize: 10, fontWeight: 600, formatter: ({ value }) => (value ? `${plain(value)}` : "") },
          // Low bands in amber, strong bands in the section colour, so weak clusters stand out.
          data: bins.map((bin, index) => ({ value: bin.count, itemStyle: { color: gradient(index < 3 ? "#f59e0b" : index < 6 ? alpha(accent, 0.7) : accent) } })),
          ...(medianBand >= 0 ? {
            markLine: {
              silent: true, symbol: "none", animation: false,
              lineStyle: { color: theme.muted, type: "dashed", width: 1 },
              label: { position: "end", formatter: "Middle student", color: theme.muted, fontSize: 9.5, fontWeight: 600 },
              data: [{ xAxis: medianBand }],
            },
          } : {}),
        },
        {
          name: "Cumulative share", type: "line", yAxisIndex: 1, smooth: 0.3, symbol: "circle", symbolSize: 5, cursor: "pointer",
          lineStyle: { width: 2, color: "#8b5cf6" }, itemStyle: { color: "#8b5cf6", borderColor: theme.surface, borderWidth: 1.5 },
          emphasis: { focus: "series" },
          data: cumulative,
        },
      ],
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
    // The colour legend is HTML above the chart; each chip opens that series for every group.
    return base(theme, {
      grid: grid({ top: 8 }),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (params) => {
          const group = groups[params[0].dataIndex];
          return `<b>${escapeHtml(group.label)}</b> · ${group.students} students<br/>${series.map((key, index) => `${dot(keyColor(key, index))}${escapeHtml(key)}: <b>${group.values[key]}</b> (${percentOf(group.values[key] || 0, total(group))}%)`).join("<br/>")}`;
        },
      },
      ...(horizontal
        ? { xAxis: values, yAxis: rowAxis(theme, groups.map((group) => group.label), 22) }
        : { xAxis: categoryAxis(theme, labels), yAxis: values }),
      series: series.map((key, index) => {
        const last = index === series.length - 1;
        const radius = horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0];
        return {
          name: key, type: "bar", cursor: "pointer", ...(stacked ? { stack: "total" } : {}), barMaxWidth: horizontal ? (stacked ? 16 : 9) : (stacked ? 30 : 14),
          itemStyle: { color: keyColor(key, index), borderRadius: !stacked || last ? radius : 0, borderColor: theme.surface, borderWidth: stacked ? 1 : 0 },
          emphasis: { focus: "series" },
          data: groups.map((group) => valueOf(group, key)),
        };
      }),
    });
  },

  // One dot per student (or attempt): x against y, sized by `size`, coloured by `group`, with
  // dashed guide lines at the middle student and any reference such as a pass mark.
  scatter(data, theme) {
    const items = data.items || [];
    if (!items.length) return null;
    const groups = data.groups?.length ? data.groups : ["Students"];
    const sizes = items.map((item) => item.size).filter(Number.isFinite);
    const maxSize = Math.max(1, ...sizes);
    const radius = (item) => (Number.isFinite(item.size) ? 7 + Math.sqrt(Math.max(0, item.size) / maxSize) * 11 : 9);
    // Labels sit inside the plot along the line (up the line for a vertical one), clear of the title and legend.
    const guide = (axis, value, text, color = theme.muted) => ({
      [axis]: value, lineStyle: { color, type: "dashed", width: 1 },
      label: { formatter: text, position: axis === "yAxis" ? "end" : "insideEndTop", color, fontSize: 9.5, fontWeight: 600 },
    });
    const guides = [
      ...(Number.isFinite(data.medianX) && data.medianX > 0 ? [guide("xAxis", data.medianX, `Middle: ${plain(data.medianX)} ${(data.xLabel || "").toLowerCase()}`)] : []),
      ...(Number.isFinite(data.medianY) && data.medianY > 0 ? [guide("yAxis", data.medianY, `Middle: ${plain(data.medianY)}`)] : []),
      ...(data.referenceY ? [guide("yAxis", data.referenceY.value, data.referenceY.label, "#f43f5e")] : []),
    ];
    const guideOwner = groups.findIndex((group) => items.some((item) => (item.group || groups[0]) === group));
    const count = data.total > data.shown ? `showing ${data.shown.toLocaleString()} of ${data.total.toLocaleString()}, highest first` : `${(data.total ?? items.length).toLocaleString()} dots`;
    const note = `${data.yLabel || "y"} (up) against ${(data.xLabel || "x").toLowerCase()} (across) · ${count}${data.sizeLabel ? ` · size = ${data.sizeLabel}` : ""}`;
    return base(theme, {
      legend: groups.length > 1 ? legend(theme) : undefined,
      title: { subtext: note, left: 0, top: 2, subtextStyle: { fontSize: 10, color: theme.muted } },
      // Horizontal guide lines label themselves past the right edge, so that side needs room.
      grid: grid({ top: 40, right: guides.some((line) => line.yAxis !== undefined) ? 92 : 20, bottom: 22 }),
      tooltip: {
        ...base(theme).tooltip, trigger: "item",
        formatter: ({ data: point }) => (point?.item
          ? `<b>${escapeHtml(point.item.name)}</b>${point.item.group ? ` · ${escapeHtml(point.item.group)}` : ""}<br/>${escapeHtml(data.xLabel || "x")}: <b>${plain(point.item.x)}</b> · ${escapeHtml(data.yLabel || "y")}: <b>${plain(point.item.y)}</b>`
            + `${point.item.note ? `<br/><span style="opacity:.75">${escapeHtml(point.item.note)}</span>` : ""}<br/><span style="opacity:.6">Click to open the student</span>`
          : ""),
      },
      xAxis: valueAxis(theme, { name: data.xLabel, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: theme.muted, fontSize: 10 }, axisLabel: { color: theme.muted, fontSize: 10 }, splitLine: { lineStyle: { color: theme.grid, type: "dashed" } } }),
      yAxis: valueAxis(theme, data.yMax ? { max: data.yMax } : {}),
      series: groups.map((group, index) => {
        const color = keyColor(group, index);
        return {
          name: group, type: "scatter", cursor: "pointer", z: 3,
          data: items.filter((item) => (item.group || groups[0]) === group).map((item) => ({ value: [item.x, item.y], item })),
          symbolSize: (_, params) => radius(params.data.item),
          itemStyle: { color: alpha(color, 0.62), borderColor: color, borderWidth: 1.4 },
          emphasis: { scale: 1.25, itemStyle: { color: alpha(color, 0.9), shadowBlur: 14, shadowColor: alpha(color, 0.5) } },
          ...(index === guideOwner && guides.length ? { markLine: { silent: true, symbol: "none", animation: false, data: guides } } : {}),
        };
      }),
    });
  },

  // Spread per group: the box is the middle half of students, the line inside it the median,
  // the whiskers the lowest and highest, the diamond the average.
  boxplot(data, theme, { accent }) {
    const groups = data.groups || [];
    if (!groups.some((group) => group.count)) return null;
    const percent = data.unit === "%";
    const text = (value) => `${plain(value)}${percent ? "%" : ""}`;
    const tip = (index) => {
      const group = groups[index];
      return `<b>${escapeHtml(group.label)}</b> · ${plain(group.students)} students<br/>`
        + `Highest <b>${text(group.max)}</b><br/>Upper quarter starts at <b>${text(group.q3)}</b><br/>Middle student <b>${text(group.median)}</b><br/>`
        + `Lower quarter ends at <b>${text(group.q1)}</b><br/>Lowest <b>${text(group.min)}</b><br/><span style="opacity:.75">Average ${text(group.mean)}</span>`;
    };
    return base(theme, {
      title: { subtext: "Box: middle half of students · line: median · ◆ average", left: 0, top: 0, subtextStyle: { fontSize: 10, color: theme.muted } },
      grid: grid({ top: 34, right: data.passMark ? 86 : 18, bottom: 6 }),
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ dataIndex }) => tip(dataIndex) },
      xAxis: categoryAxis(theme, groups.map((group) => truncate(group.label, 14)), { axisLabel: { color: theme.text, fontSize: 10.5, interval: 0, hideOverlap: true } }),
      yAxis: valueAxis(theme, percent ? { min: 0, max: 100, axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" } } : { min: 0 }),
      series: [
        {
          name: "Spread", type: "boxplot", cursor: "pointer", boxWidth: [14, 44],
          itemStyle: { color: alpha(accent, 0.2), borderColor: accent, borderWidth: 1.8 },
          emphasis: { itemStyle: { color: alpha(accent, 0.36), borderColor: accent, borderWidth: 2.2, shadowBlur: 10, shadowColor: alpha(accent, 0.35) } },
          data: groups.map((group) => [group.min, group.q1, group.median, group.q3, group.max]),
          ...(data.passMark ? {
            markLine: {
              silent: true, symbol: "none", animation: false, lineStyle: { color: "#f43f5e", type: "dashed", width: 1 },
              label: { formatter: `Pass mark ${data.passMark}%`, position: "end", color: "#f43f5e", fontSize: 9.5, fontWeight: 600 },
              data: [{ yAxis: data.passMark }],
            },
          } : {}),
        },
        {
          name: "Average", type: "scatter", symbol: "diamond", symbolSize: 10, cursor: "pointer", z: 5,
          itemStyle: { color: "#f59e0b", borderColor: theme.surface, borderWidth: 1.5 },
          data: groups.map((group, index) => [index, group.mean]),
        },
      ],
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

/**
 * Boxes sized by value: [{ name, value, color }]. ECharts puts a hidden root before the boxes, so
 * its `dataIndex` is off by one and skips boxes that cannot be drawn; each box carries its own
 * `rowIndex` (its place in `nodes`) and tooltips and clicks use that. A zero cannot be drawn, so a
 * zero row gets a thin sliver (and a list of only zeros equal boxes); labels always show the real value.
 */
function treemapOption(theme, nodes, { unit = "", valueLabel = "", tooltip } = {}) {
  if (!nodes.length) return null;
  const floor = Math.max(1, ...nodes.map((node) => node.value)) * (nodes.some((node) => node.value > 0) ? 0.015 : 1);
  const boxes = nodes.map((node, rowIndex) => ({ ...node, rowIndex, size: node.value > 0 ? node.value : floor }));
  return base(theme, {
    tooltip: {
      ...base(theme).tooltip, trigger: "item",
      formatter: tooltip ? ({ data }) => tooltip(data.rowIndex) : ({ data }) => `<b>${escapeHtml(nodes[data.rowIndex].name)}</b><br/>${dot(nodes[data.rowIndex].color)}${plain(nodes[data.rowIndex].value)}${unit} ${escapeHtml(valueLabel)}`,
    },
    series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, right: 0, top: 2, bottom: 2, cursor: "pointer", squareRatio: 1.1,
      label: { show: true, position: "insideTopLeft", padding: [6, 8], color: "#fff", fontSize: 11, fontWeight: 700, overflow: "truncate", formatter: ({ name, data }) => `${truncate(name, 24)}\n{v|${plain(data.real)}${unit}}`, rich: { v: { fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 22 } } },
      itemStyle: { borderColor: theme.surface, borderWidth: 3, gapWidth: 3, borderRadius: 8 },
      emphasis: { itemStyle: { shadowBlur: 14, shadowColor: "rgba(15,23,42,0.25)" } },
      data: boxes.map((node) => ({ name: node.name, value: node.size, real: node.value, rowIndex: node.rowIndex, itemStyle: { color: node.color } })),
    }],
  });
}

/** A horizontal "stick and dot" per row: reads like bars but keeps the eye on the value. */
function lollipopOption(theme, items, { color, unit = "", max, valueLabel = "", tooltip } = {}) {
  // The values come from horizontalBars' right-aligned column, so the dots carry no labels.
  const option = horizontalBars(theme, items, { color, unit, max, valueLabel, tooltip });
  option.series = [
    { type: "bar", barWidth: 3, cursor: "pointer", silent: false, itemStyle: { borderRadius: 3 }, data: items.map((item) => ({ value: item.value, itemStyle: { color: alpha(item.color || color, 0.55) } })) },
    {
      type: "scatter", cursor: "pointer", symbolSize: 15, z: 4,
      itemStyle: { borderColor: theme.surface, borderWidth: 2.5, shadowBlur: 6, shadowColor: "rgba(15,23,42,0.18)" },
      emphasis: { scale: 1.2 },
      data: items.map((item, index) => ({ value: [item.value, String(index)], itemStyle: { color: item.color || color } })),
    },
  ];
  return option;
}

/** A tone per row from how large the value is, so the biggest rows read first. */
const shade = (color, value, max) => alpha(color, 0.5 + 0.5 * (max ? value / max : 0));

// Other ways to show a chart type ("type:view").
const viewBuilders = {
  // The topic bubbles as ranked bars (Topic · Students · % of students).
  "bubble:bars": (data, theme, context) => builders.barList(data, theme, context),
  "rankedStackedBar:mix": (data, theme) => {
    const option = builders.rankedStackedBar(data, theme);
    if (!option) return null;
    const items = data.items || [];
    // Each bar is 100%: how much of that student's Prep Score comes from Easy, Medium and Hard.
    option.xAxis = { ...option.xAxis, max: 100, axisLabel: { ...option.xAxis.axisLabel, formatter: "{value}%" } };
    option.series = option.series.map((series) => ({ ...series, data: items.map((item) => percentOf(item.segments?.[series.name] || 0, item.score)) }));
    return option;
  },
  "barList:lollipop": (data, theme, { accent }) => {
    const items = data.items || [];
    if (!items.length) return null;
    const tone = { warning: "#f59e0b", danger: "#f43f5e" }[data.tone] || accent;
    const unit = data.unit === "%" ? "%" : "";
    const list = items.map((item) => ({ ...item, color: item.difficulty ? DIFFICULTY_COLORS[item.difficulty] || tone : tone }));
    return lollipopOption(theme, list, {
      color: tone, unit, max: unit ? 100 : undefined, valueLabel: data.valueLabel || "",
      tooltip: (params) => {
        const item = items[params[0].dataIndex];
        return `<b>${escapeHtml(item.name)}</b>${item.difficulty ? ` · ${escapeHtml(item.difficulty)}` : ""}<br/>${plain(item.value)}${unit} ${escapeHtml(data.valueLabel || "")}${item.note ? `<br/><span style="opacity:.75">${escapeHtml(item.note)}</span>` : ""}`;
      },
    });
  },
  "barList:treemap": (data, theme, { accent }) => {
    const items = data.items || [];
    const tone = { warning: "#f59e0b", danger: "#f43f5e" }[data.tone] || accent;
    const unit = data.unit === "%" ? "%" : "";
    const top = Math.max(1, ...items.map((item) => item.value));
    const nodes = items.map((item) => ({ name: item.name, value: item.value, color: item.difficulty ? DIFFICULTY_COLORS[item.difficulty] || tone : shade(tone, item.value, top) }));
    return treemapOption(theme, nodes, {
      unit, valueLabel: data.valueLabel || "",
      tooltip: (index) => `<b>${escapeHtml(items[index].name)}</b><br/>${plain(items[index].value)}${unit} ${escapeHtml(data.valueLabel || "")}${items[index].note ? `<br/><span style="opacity:.75">${escapeHtml(items[index].note)}</span>` : ""}`,
    });
  },
  "donut:rose": (data, theme) => {
    const option = builders.donut(data, theme);
    if (!option) return null;
    const ring = option.series[0].data;
    delete option.title;
    option.series = [{
      type: "pie", roseType: "area", radius: ["12%", "92%"], center: ["50%", "52%"], padAngle: 2, cursor: "pointer", label: { show: false },
      itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 8 }, emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 14, shadowColor: "rgba(15,23,42,0.22)" } },
      data: ring,
    }];
    return option;
  },
  "donut:treemap": (data, theme) => {
    const items = (data.items || []).filter((item) => item.value > 0);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return treemapOption(theme, items.map((item, index) => ({ name: itemName(item), value: item.value, color: keyColor(item.key, index) })), {
      tooltip: (index) => `${dot(keyColor(items[index].key, index))}${escapeHtml(itemName(items[index]))}<br/><b>${plain(items[index].value)}</b> · ${percentOf(items[index].value, total)}%`,
    });
  },
  "trend:combo": (data, theme, context) => {
    const option = builders.trend(data, theme, context);
    if (!option) return null;
    option.xAxis.boundaryGap = true;
    let first = true;
    option.series = option.series.map((series) => {
      if (series.yAxisIndex) return series;
      if (first) {
        first = false;
        return { ...series, type: "bar", smooth: undefined, areaStyle: undefined, endLabel: undefined, barMaxWidth: 26, itemStyle: { ...series.itemStyle, color: gradient(series.itemStyle.color), borderRadius: [5, 5, 0, 0], borderWidth: 0 } };
      }
      return { ...series, areaStyle: undefined, endLabel: undefined, markPoint: undefined, z: 4 };
    });
    return option;
  },
  // Each step's students, and the ones lost since the step before.
  "funnel:drop": (data, theme, { accent }) => {
    const stages = data.stages || [];
    if (!stages[0]?.value) return null;
    const top = stages[0].value;
    // Exact counts from the server when it sends them (steps need not be nested), else the difference.
    const lost = (index) => (index ? (data.drops?.[index - 1]?.students ?? Math.max(0, stages[index - 1].value - stages[index].value)) : 0);
    return base(theme, {
      legend: legend(theme),
      // Separate columns under headings; the drop itself is the red bar (and its tooltip).
      title: [
        // Under the legend (top row).
        columnHeading(theme, "Step", { left: LABEL_COLUMN - 10, textAlign: "right", top: 26 }),
        columnHeading(theme, "Students", { right: SHARE_COLUMN + 4, top: 26 }),
        columnHeading(theme, "% of first", { right: 4, top: 26 }),
      ],
      grid: alignedGrid({ top: 46, right: COUNT_COLUMN + SHARE_COLUMN }),
      tooltip: {
        ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(accent, 0.06) } },
        formatter: (params) => {
          const index = params[0].dataIndex;
          const stage = stages[index];
          return `<b>${escapeHtml(stage.name)}</b><br/>${dot(accent)}${plain(stage.value)} students · ${percentOf(stage.value, top)}% of the first step`
            + `${index ? `<br/>${dot("#fb7185")}${plain(lost(index))} lost since “${escapeHtml(stages[index - 1].name)}” (${percentOf(lost(index), stages[index - 1].value)}%)` : ""}`;
        },
      },
      xAxis: valueAxis(theme, { splitLine: { show: false }, axisLabel: { show: false }, max: top }),
      yAxis: [
        rowAxis(theme, stages.map((stage) => stage.name), 40, LABEL_COLUMN - 10),
        valueColumn(theme, stages.map((stage) => plain(stage.value)), COUNT_COLUMN),
        { ...valueColumn(theme, stages.map((stage) => `${percentOf(stage.value, top)}%`), SHARE_COLUMN), offset: COUNT_COLUMN },
      ],
      series: [
        {
          name: "Reached", type: "bar", stack: "step", barWidth: 16, cursor: "pointer", showBackground: false,
          itemStyle: { color: gradient(accent, true), borderRadius: [8, 0, 0, 8] },
          data: stages.map((stage) => stage.value),
        },
        {
          name: "Lost since the step before", type: "bar", stack: "step", barWidth: 16, cursor: "pointer",
          itemStyle: { color: alpha("#fb7185", 0.38), borderRadius: [0, 8, 8, 0] },
          data: stages.map((_, index) => lost(index)),
        },
      ],
    });
  },
  "histogram:curve": (data, theme, { accent }) => {
    const bins = data.bins || [];
    if (!bins.some((bin) => bin.count)) return null;
    const label = data.label || "Prep Score";
    const counted = bins.reduce((sum, bin) => sum + bin.count, 0);
    return base(theme, {
      grid: grid({ top: 22, right: 22 }),
      tooltip: { ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: theme.axis } }, formatter: ([point]) => `${escapeHtml(label)} ${point.name}<br/><b>${plain(point.value)}</b> students · ${percentOf(point.value, counted)}%` },
      xAxis: categoryAxis(theme, bins.map((bin) => bin.label), { boundaryGap: false, name: label, nameLocation: "middle", nameGap: 24, nameTextStyle: { color: theme.muted, fontSize: 10 } }),
      yAxis: valueAxis(theme, { minInterval: 1 }),
      series: [{
        type: "line", smooth: 0.42, symbol: "circle", symbolSize: 8, cursor: "pointer",
        lineStyle: { width: 3, color: accent }, itemStyle: { color: accent, borderColor: theme.surface, borderWidth: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(accent, 0.34) }, { offset: 1, color: alpha(accent, 0.02) }] } },
        label: { show: true, position: "top", color: theme.muted, fontSize: 10, fontWeight: 600, formatter: ({ value }) => (value ? plain(value) : "") },
        emphasis: { focus: "series", scale: 1.3 },
        data: bins.map((bin) => bin.count),
      }],
    });
  },
  // Every group against every series as a grid of counts: easy to scan when there are many groups.
  "stackedBar:heat": (data, theme, { accent }) => {
    const groups = data.groups || [];
    const series = data.series || DIFFICULTIES;
    if (!groups.some((group) => series.some((key) => group.values[key] > 0))) return null;
    const max = Math.max(1, ...groups.flatMap((group) => series.map((key) => group.values[key] || 0)));
    const cells = groups.flatMap((group, y) => series.map((key, x) => {
      const value = group.values[key] || 0;
      return { value: [x, y, value], label: { color: value / max > 0.5 ? "#fff" : theme.strong } };
    }));
    return base(theme, {
      grid: grid({ top: 28, bottom: 40, left: 4 }),
      tooltip: { ...base(theme).tooltip, trigger: "item", formatter: ({ value }) => `<b>${escapeHtml(groups[value[1]].label)}</b> · ${groups[value[1]].students} students<br/>${escapeHtml(series[value[0]])}: <b>${plain(value[2])}</b>` },
      xAxis: categoryAxis(theme, series, { position: "top", axisLine: { show: false }, axisLabel: { color: theme.text, fontSize: 10.5, interval: 0, fontWeight: 600 } }),
      yAxis: rowAxis(theme, groups.map((group) => group.label), 22),
      visualMap: { min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 110, textStyle: { color: theme.muted, fontSize: 10 }, inRange: { color: [theme.dark ? "#0c4a6e" : "#f0f9ff", accent] } },
      series: [{
        type: "heatmap", data: cells, cursor: "pointer",
        itemStyle: { borderColor: theme.surface, borderWidth: 3, borderRadius: 6 },
        label: { show: true, fontSize: 10.5, fontWeight: 700, formatter: ({ value }) => (value[2] ? plain(value[2]) : "") },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(15,23,42,0.25)" } },
      }],
    });
  },
  // Which days of the week are busy: totals per weekday over the year, with the average as a guide.
  "calendar:weekday": (data, theme, { accent }) => {
    if (!data.days?.length) return null;
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const totals = names.map(() => 0);
    for (const [day, value] of data.days) totals[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7] += value;
    const all = totals.reduce((sum, value) => sum + value, 0);
    const top = Math.max(...totals);
    const unit = data.unit || "submissions";
    return base(theme, {
      grid: grid({ top: 22 }),
      tooltip: { ...base(theme).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(accent, 0.06) } }, formatter: ([point]) => `<b>${point.name}</b><br/>${dot(accent)}<b>${plain(point.value)}</b> ${escapeHtml(unit)} · ${percentOf(point.value, all)}%` },
      xAxis: categoryAxis(theme, names),
      yAxis: valueAxis(theme, { minInterval: 1 }),
      series: [{
        type: "bar", barMaxWidth: 46, itemStyle: { borderRadius: [8, 8, 0, 0] },
        label: { show: true, position: "top", color: theme.muted, fontSize: 10, fontWeight: 600, formatter: ({ value }) => (value ? plain(value) : "") },
        data: totals.map((value) => ({ value, itemStyle: { color: gradient(value === top ? accent : alpha(accent, 0.55)) } })),
        markLine: { silent: true, symbol: "none", animation: false, lineStyle: { color: theme.muted, type: "dashed", width: 1 }, label: { position: "insideEndTop", formatter: "Average day", color: theme.muted, fontSize: 9.5, fontWeight: 600 }, data: [{ yAxis: Math.round((all / 7) * 10) / 10 }] },
      }],
    });
  },
  // Radar topics as a ring of bars: easier to compare lengths than the corners of a polygon.
  "radar:polar": (data, theme, { accent }) => {
    const indicators = data.indicators || [];
    if (indicators.length < 3) return null;
    const cohort = data.mode === "cohort" || !data.student;
    const topics = data.topics || [];
    const ceiling = cohort ? Math.min(100, Math.max(10, Math.ceil(Math.max(...data.values, 0) / 10) * 10)) : undefined;
    return base(theme, {
      tooltip: {
        ...base(theme).tooltip, trigger: "item",
        formatter: ({ dataIndex }) => (cohort
          ? `<b>${escapeHtml(indicators[dataIndex].name)}</b><br/>${dot(accent)}<b>${data.values[dataIndex]}%</b> of students solved (${(topics[dataIndex]?.students || 0).toLocaleString()} of ${(data.cohort || 0).toLocaleString()})`
          : `<b>${escapeHtml(indicators[dataIndex].name)}</b><br/>${dot(accent)}<b>${data.values[dataIndex]}</b> solved · average ${data.average?.[dataIndex] ?? 0}`),
      },
      polar: { radius: ["16%", "74%"], center: ["50%", "54%"] },
      angleAxis: { type: "category", data: indicators.map((indicator) => indicator.name), startAngle: 90, axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.text, fontSize: 10, formatter: (name) => truncate(name, 13) } },
      radiusAxis: { max: ceiling, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: theme.grid, type: "dashed" } } },
      series: [{
        type: "bar", coordinateSystem: "polar", roundCap: true, cursor: "pointer",
        itemStyle: { borderRadius: 6 }, emphasis: { itemStyle: { shadowBlur: 12, shadowColor: alpha(accent, 0.4) } },
        label: { show: false },
        data: data.values.map((value, index) => ({ value, itemStyle: { color: alpha(accent, 0.45 + 0.55 * (index % 2 ? 0.75 : 1)) } })),
      }],
    });
  },
  "donut:bars": (data, theme) => {
    const items = (data.items || []).filter((item) => item.value > 0);
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return horizontalBars(theme, items.map((item, index) => ({ name: itemName(item), value: item.value, color: keyColor(item.key, index) })), {
      color: CATEGORICAL[0], valueLabel: data.centerLabel || "", share: (item) => `${percentOf(item.value, total)}%`,
      headings: { count: capitalize(data.centerLabel || "Count"), share: "% of total" },
    });
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
    if (!indicators.length) return null;
    const cohort = data.mode === "cohort" || !data.student;
    return horizontalBars(theme, indicators.map((indicator, index) => ({
      name: indicator.name, value: data.values[index],
      note: cohort ? `${(data.topics?.[index]?.students || 0).toLocaleString()} of ${(data.cohort || 0).toLocaleString()} students` : `average ${data.average?.[index] ?? 0}`,
    })), cohort
      ? { color: accent, unit: "%", max: 100, valueLabel: "of students solved", headings: { label: "Topic", count: "% of students solved" } }
      : { color: accent, valueLabel: "solved", headings: { label: "Topic", count: "Solved" } });
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
export const rankedChartHeight = (rows) => 52 + rows * 28;

export function chartHeight(chart) {
  if (chart.type === "heatmap") return Math.max(240, Math.min(720, 80 + (chart.data?.students?.length || 0) * 22));
  if (chart.type === "rankedStackedBar") return Math.min(420, rankedChartHeight(chart.data?.items?.length || 0));
  if (chart.type === "barList") return Math.max(220, Math.min(420, 40 + (chart.data?.items?.length || 0) * 26));
  // The funnel with gaps: a 40px band per step and a 40px neck between two, plus its headings.
  if (chart.type === "funnel" && chart.data?.drops?.length) return 32 + (chart.data.stages?.length || 0) * 40 + chart.data.drops.length * 40;
  // Bubbles need room to spread: taller with more topics.
  if (chart.type === "bubble") return Math.max(320, Math.min(460, 280 + (chart.data?.items?.length || 0) * 3));
  if (chart.type === "stackedBar" && chart.data?.horizontal) return Math.max(220, Math.min(460, 60 + (chart.data?.groups?.length || 0) * 28));
  if (chart.type === "calendar") return 170;
  if (chart.type === "scatter") return { sm: 280, md: 320, lg: 340, full: 380 }[chart.size] || 340;
  return { sm: 240, md: 270, lg: 280, full: 300 }[chart.size] || 270;
}

// ---------------------------------------------------------------- the same data as a table

const dayText = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Any chart's data as { columns: [{ label, numeric }], rows: [[cell]] }, for the
 * "Table" view. Downloads are built on the server (prepAnalysis.export.js).
 */
export function chartTable(chart) {
  const data = chart?.data || {};
  const text = (label) => ({ label, numeric: false });
  const number = (label) => ({ label, numeric: true });
  switch (chart?.type) {
    case "rankedStackedBar":
      // Easy/Medium/Hard: problems solved in the period, the same numbers as the student drawer.
      return {
        columns: [number("#"), text("Student"), number("Prep Score"), ...DIFFICULTIES.map((level) => number(`${level} solved`))],
        rows: (data.items || []).map((item) => [item.position, item.name, item.score, ...DIFFICULTIES.map((level) => item.solved?.[level] ?? 0)]),
        ids: (data.items || []).map((item) => item.id),
      };
    case "bubble": {
      const items = data.items || [];
      const tierLabel = new Map((data.tiers || []).map((tier) => [tier.key, tier.label]));
      return {
        columns: [text(data.itemLabel || "Name"), number(capitalize(data.valueLabel || "Value")), number("% of students"), number("Accepted %"), text("Priority")],
        rows: items.map((item) => [item.name, item.value, item.pct ?? 0, item.accuracy ?? 0, tierLabel.get(item.tier) || ""]),
      };
    }
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
      return { columns: [text(data.interval === "day" ? "Day" : "Week of"), ...(data.series || []).map((series) => number(series.name))], rows: (data.labels || []).map((label, index) => [dayText(label), ...(data.series || []).map((series) => series.values[index] ?? 0)]) };
    case "funnel": {
      const stages = data.stages || [];
      const top = stages[0]?.value || 0;
      return { columns: [text("Step"), number("Students"), number("% of first step"), number("% of step before")], rows: stages.map((stage, index) => [stage.name, stage.value, percentOf(stage.value, top), index ? percentOf(stage.value, stages[index - 1].value) : 100]) };
    }
    case "histogram":
      return { columns: [text(data.label || "Band"), number("Students")], rows: (data.bins || []).map((bin) => [bin.label, bin.count]) };
    case "combo":
      return {
        columns: [text(data.categoryLabel || "Group"), ...(data.bars || []).map((bar) => number(bar.name)), ...(data.lines || []).map((line) => number(`${line.name}${line.unit ? ` (${line.unit})` : ""}`))],
        rows: (data.categories || []).map((category, index) => [category.label, ...(data.bars || []).map((bar) => bar.values[index] ?? 0), ...(data.lines || []).map((line) => line.values[index] ?? 0)]),
      };
    case "stackedBar": {
      const series = data.series || DIFFICULTIES;
      return { columns: [text("Group"), ...series.map(number), number("Total")], rows: (data.groups || []).map((group) => [group.label, ...series.map((key) => group.values[key] || 0), series.reduce((sum, key) => sum + (group.values[key] || 0), 0)]) };
    }
    case "scatter":
      return {
        columns: [text("Student"), number(data.xLabel || "x"), number(data.yLabel || "y"), text("Group"), text("Note")],
        rows: (data.items || []).map((item) => [item.name, item.x, item.y, item.group || "", item.note || ""]),
        ids: (data.items || []).map((item) => item.id),
      };
    case "boxplot": {
      const unit = data.unit === "%" ? " (%)" : "";
      return {
        columns: [text("Group"), number("Students"), number(`Lowest${unit}`), number(`Lower quartile${unit}`), number(`Median${unit}`), number(`Upper quartile${unit}`), number(`Highest${unit}`), number(`Average${unit}`)],
        rows: (data.groups || []).map((group) => [group.label, group.students, group.min, group.q1, group.median, group.q3, group.max, group.mean]),
      };
    }
    case "heatmap": {
      const columns = data.columns || data.topics || [];
      const percent = String(data.unit || "").startsWith("%");
      const cells = new Map((data.cells || []).map(([x, y, value]) => [`${x}:${y}`, value]));
      return { columns: [text("Student"), ...columns.map((column) => number(percent ? `${column} (%)` : column))], rows: (data.students || []).map((name, y) => [name, ...columns.map((_, x) => cells.get(`${x}:${y}`) ?? 0)]) };
    }
    case "calendar":
      return { columns: [text("Day"), number(data.unit ? data.unit[0].toUpperCase() + data.unit.slice(1) : "Total")], rows: [...(data.days || [])].sort(([left], [right]) => right.localeCompare(left)).map(([day, value]) => [dayText(day), value]) };
    case "radar": {
      const topics = data.topics || [];
      if (data.mode === "cohort" || !data.student) {
        return {
          columns: [text("Topic"), number("Students who solved"), number("Of students (%)"), number("Avg solved per student"), number("Accuracy (%)")],
          rows: topics.map((topic) => [topic.name, topic.students, topic.pct, topic.avgSolved, topic.accuracy]),
        };
      }
      return {
        columns: [text("Topic"), number(`${data.student.name}: solved`), number("Average solved (students in view)"), number("Accuracy, all students in view (%)")],
        rows: (data.indicators || []).map((indicator, index) => [indicator.name, data.values?.[index] ?? 0, data.average?.[index] ?? 0, topics[index]?.accuracy ?? 0]),
      };
    }
    default:
      return { columns: [], rows: [] };
  }
}
