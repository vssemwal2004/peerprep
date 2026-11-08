// ECharts options for the student Analysis page. Each builder takes the page data and the
// chart theme (light or dark) and returns a complete option. Colours follow Prep Analysis:
// sky for the main series, emerald / rose / amber only where they mean good / bad / warning.
import { alpha, CATEGORICAL, DIFFICULTY_COLORS, OUTCOME_COLORS } from "../../admin/prepAnalysis/charts/chartTheme.js";
import { targetProgress, TOPIC_STATES } from "./insightModel.js";

const SKY = "#0284c7";
const EMERALD = "#10b981";
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
const shortDay = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const tooltip = (theme, extra = {}) => ({
  backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, padding: [8, 10],
  textStyle: { color: theme.strong, fontSize: 12 }, extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);",
  ...extra,
});
const axisLabel = (theme, extra = {}) => ({ color: theme.text, fontSize: 11, ...extra });
const splitLine = (theme) => ({ lineStyle: { color: theme.grid } });

/**
 * Days between the period's ends with zeros filled in. Long periods are grouped by week so the
 * bars stay readable. rows: [{ date, ...values }]; returns { labels, series: { key: number[] } }.
 */
export function timeBuckets(rows, { from, to }, keys) {
  const byDay = new Map(rows.map((row) => [row.date, row]));
  const end = Date.parse(`${dayKey(to || Date.now())}T00:00:00Z`);
  const firstRow = rows.length ? Date.parse(`${rows[0].date}T00:00:00Z`) : end;
  const start = from ? Date.parse(`${dayKey(from)}T00:00:00Z`) : Math.min(firstRow, end - 29 * DAY_MS);
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const step = days > 120 ? 7 : 1;
  const labels = [];
  const series = Object.fromEntries(keys.map((key) => [key, []]));
  for (let time = start; time <= end; time += step * DAY_MS) {
    labels.push(step === 1 ? shortDay(dayKey(time)) : `Wk of ${shortDay(dayKey(time))}`);
    for (const key of keys) {
      let total = 0;
      for (let offset = 0; offset < step && time + offset * DAY_MS <= end; offset += 1) total += Number(byDay.get(dayKey(time + offset * DAY_MS))?.[key]) || 0;
      series[key].push(total);
    }
  }
  return { labels, series, weekly: step === 7 };
}

/** Coding: submissions as bars, accepted as a line, per day (or week). */
export function practiceTrendOption(daily, range, theme) {
  const { labels, series, weekly } = timeBuckets(daily, range, ["attempts", "accepted"]);
  return {
    tooltip: tooltip(theme, { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: alpha(SKY, 0.06) } } }),
    legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text, fontSize: 11 } },
    grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: { type: "value", minInterval: 1, splitLine: splitLine(theme), axisLabel: axisLabel(theme) },
    series: [
      { name: weekly ? "Submissions / week" : "Submissions", type: "bar", data: series.attempts, barMaxWidth: 18, itemStyle: { color: alpha(SKY, theme.dark ? 0.55 : 0.35), borderRadius: [4, 4, 0, 0] } },
      { name: "Accepted", type: "line", data: series.accepted, smooth: 0.35, symbol: "circle", symbolSize: 6, showSymbol: labels.length <= 31, lineStyle: { width: 2.5, color: EMERALD }, itemStyle: { color: EMERALD }, areaStyle: { color: alpha(EMERALD, 0.08) } },
    ],
  };
}

/** A donut of how submissions ended (accepted, wrong answer, too slow …). */
export function verdictOption(verdicts, theme) {
  const total = verdicts.reduce((sum, verdict) => sum + verdict.value, 0);
  return {
    tooltip: tooltip(theme, { trigger: "item", formatter: (item) => `${item.name}<br/><b>${item.value}</b> · ${item.percent}%` }),
    title: { text: String(total), subtext: "submissions", left: "center", top: "38%", textStyle: { color: theme.strong, fontSize: 22, fontWeight: 650 }, subtextStyle: { color: theme.muted, fontSize: 11 } },
    series: [{
      type: "pie", radius: ["58%", "80%"], center: ["50%", "50%"], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: theme.surface, borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: verdicts.map((verdict) => ({ name: verdict.name, value: verdict.value, itemStyle: { color: OUTCOME_COLORS[verdict.key] || "#94a3b8" } })),
    }],
  };
}

/**
 * Topic map: one bubble per started topic. Across = progress to "strong", up = accuracy,
 * size = how big the topic is, colour = its state. Guides mark the strong target and 60% accuracy.
 */
export function topicMapOption(topics, theme) {
  const started = topics.filter((topic) => topic.state !== "notStarted");
  const largest = Math.max(1, ...started.map((topic) => topic.total));
  const labelled = new Set([...started].sort((left, right) => right.total - left.total).slice(0, 10).map((topic) => topic.key));
  return {
    tooltip: tooltip(theme, {
      trigger: "item",
      formatter: (item) => {
        const topic = item.data.topic;
        return `<b>${topic.name}</b><br/>Solved ${topic.solved} of ${topic.total} · strong at ${topic.target}<br/>Accuracy ${topic.accuracy ?? "—"}%<br/><span style="color:${TOPIC_STATES[topic.state].color}">● ${TOPIC_STATES[topic.state].label}</span>`;
      },
    }),
    grid: { left: 8, right: 22, top: 28, bottom: 8, containLabel: true },
    // Headroom past 100% (and above 100% accuracy) keeps the strongest bubbles whole.
    xAxis: { type: "value", min: -6, max: 110, interval: 25, name: "Progress to strong", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: theme.muted, fontSize: 11 }, axisLabel: axisLabel(theme, { formatter: (value) => (value >= 0 && value <= 100 ? `${value}%` : "") }), splitLine: splitLine(theme) },
    yAxis: { type: "value", min: -6, max: 110, interval: 20, name: "Accuracy", nameTextStyle: { color: theme.muted, fontSize: 11, align: "left" }, axisLabel: axisLabel(theme, { formatter: (value) => (value >= 0 && value <= 100 ? `${value}%` : "") }), splitLine: splitLine(theme) },
    series: [{
      type: "scatter",
      labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
      data: started.map((topic) => ({
        value: [targetProgress(topic), topic.accuracy ?? 0],
        symbolSize: 10 + Math.sqrt(topic.total / largest) * 34,
        topic,
        itemStyle: { color: alpha(TOPIC_STATES[topic.state].color, 0.78), borderColor: TOPIC_STATES[topic.state].color, borderWidth: 1.5 },
        label: { show: labelled.has(topic.key), formatter: topic.name, position: "top", color: theme.text, fontSize: 10.5, fontWeight: 600 },
      })),
      emphasis: { focus: "self", scale: 1.15, label: { show: true } },
      markLine: {
        silent: true, symbol: "none", label: { color: theme.muted, fontSize: 10, position: "insideEndTop" },
        lineStyle: { type: "dashed", color: theme.axis },
        data: [{ xAxis: 100, label: { formatter: "Strong" } }, { yAxis: 60, label: { formatter: "60% accuracy" } }],
      },
    }],
  };
}

/** Treemap of the library: box size = questions in the topic, colour = state, label = solved/total. */
export function topicTreemapOption(topics, theme) {
  const data = topics.map((topic, rowIndex) => ({
    name: topic.name, value: topic.total, rowIndex, topic,
    itemStyle: { color: alpha(TOPIC_STATES[topic.state].color, topic.state === "notStarted" ? (theme.dark ? 0.35 : 0.45) : 0.85), borderColor: theme.surface },
  }));
  return {
    tooltip: tooltip(theme, { formatter: (item) => (item.data?.topic ? `<b>${item.data.topic.name}</b><br/>Solved ${item.data.topic.solved} of ${item.data.topic.total} (${item.data.topic.coverage}%)` : "") }),
    series: [{
      type: "treemap", data, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0,
      itemStyle: { borderWidth: 2, gapWidth: 2, borderRadius: 6 },
      label: { show: true, color: "#fff", fontSize: 11, fontWeight: 600, overflow: "truncate", formatter: (item) => `${item.name}\n${item.data.topic.solved}/${item.data.topic.total}` },
      upperLabel: { show: false },
    }],
  };
}

/** Test scores in the order taken, with the pass mark as a guide line. */
export function testTrendOption(tests, passPercent, theme) {
  const ordered = [...tests].sort((left, right) => new Date(left.at) - new Date(right.at));
  return {
    tooltip: tooltip(theme, { trigger: "axis", formatter: (items) => { const test = ordered[items[0].dataIndex]; return `<b>${test.title}</b><br/>${test.percent}% · ${test.score}/${test.maxMarks}<br/>${shortDay(dayKey(test.at))}`; } }),
    grid: { left: 8, right: 16, top: 18, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: ordered.map((test) => shortDay(dayKey(test.at))), axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: { type: "value", min: 0, max: 100, splitLine: splitLine(theme), axisLabel: axisLabel(theme, { formatter: "{value}%" }) },
    series: [{
      type: "line", data: ordered.map((test) => ({ value: test.percent, itemStyle: { color: test.passed ? EMERALD : "#f43f5e" } })),
      smooth: 0.3, symbol: "circle", symbolSize: 9, lineStyle: { width: 2.5, color: SKY }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(SKY, 0.18) }, { offset: 1, color: alpha(SKY, 0) }] } },
      markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#f59e0b" }, label: { formatter: `Pass ${passPercent}%`, color: "#b45309", fontSize: 10, position: "insideEndTop" }, data: [{ yAxis: passPercent }] },
    }],
  };
}

/** Passed / failed / missed tests. */
export function testOutcomeOption({ passed, failed, missed }, theme) {
  const data = [["Passed", passed], ["Failed", failed], ["Missed", missed]].filter(([, value]) => value > 0);
  return {
    tooltip: tooltip(theme, { trigger: "item", formatter: (item) => `${item.name}: <b>${item.value}</b>` }),
    title: { text: String(passed + failed), subtext: "taken", left: "center", top: "38%", textStyle: { color: theme.strong, fontSize: 22, fontWeight: 650 }, subtextStyle: { color: theme.muted, fontSize: 11 } },
    series: [{ type: "pie", radius: ["58%", "80%"], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: theme.surface, borderWidth: 2 }, label: { show: false }, data: data.map(([name, value]) => ({ name, value, itemStyle: { color: OUTCOME_COLORS[name] } })) }],
  };
}

/** Interviewer ratings (1–5) on the five skills. */
export function ratingsRadarOption(ratings, theme) {
  return {
    tooltip: tooltip(theme),
    radar: {
      indicator: ratings.map((rating) => ({ name: rating.label, max: 5 })), radius: "66%", splitNumber: 5,
      axisName: { color: theme.text, fontSize: 11 }, splitLine: { lineStyle: { color: theme.grid } }, splitArea: { areaStyle: { color: [alpha(SKY, 0.02), alpha(SKY, 0.05)] } }, axisLine: { lineStyle: { color: theme.grid } },
    },
    series: [{ type: "radar", data: [{ value: ratings.map((rating) => rating.value || 0), name: "Your ratings", areaStyle: { color: alpha(SKY, 0.22) }, lineStyle: { color: SKY, width: 2 }, itemStyle: { color: SKY }, symbolSize: 6 }] }],
  };
}

/** Mock interview scores over time, oldest first. */
export function mockTrendOption(mocks, theme) {
  const ordered = [...mocks].sort((left, right) => new Date(left.at) - new Date(right.at));
  return {
    tooltip: tooltip(theme, { trigger: "axis", valueFormatter: (value) => `${value}%` }),
    grid: { left: 8, right: 12, top: 14, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: ordered.map((mock) => shortDay(dayKey(mock.at))), axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: axisLabel(theme) },
    yAxis: { type: "value", min: 0, max: 100, splitLine: splitLine(theme), axisLabel: axisLabel(theme, { formatter: "{value}%" }) },
    series: [{ name: "Score", type: "bar", data: ordered.map((mock) => mock.score), barMaxWidth: 26, itemStyle: { color: SKY, borderRadius: [5, 5, 0, 0] } }],
  };
}

/** Lessons completed per day (or week) in the period. */
export function lessonsTrendOption(daily, range, theme) {
  const { labels, series } = timeBuckets(daily, range, ["completed"]);
  return {
    tooltip: tooltip(theme, { trigger: "axis" }),
    grid: { left: 8, right: 8, top: 14, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: { type: "value", minInterval: 1, splitLine: splitLine(theme), axisLabel: axisLabel(theme) },
    series: [{ name: "Lessons", type: "bar", data: series.completed, barMaxWidth: 16, itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#38bdf8" }, { offset: 1, color: SKY }] }, borderRadius: [4, 4, 0, 0] } }],
  };
}

/** Twelve months of activity as a calendar heatmap. */
export function activityCalendarOption(activity, theme, { compact = false } = {}) {
  const max = Math.max(1, ...activity.days.map((day) => day.total));
  return {
    tooltip: tooltip(theme, {
      formatter: (item) => {
        const day = activity.days.find((entry) => entry.date === item.data[0]);
        if (!day) return `${shortDay(item.data[0])}<br/>No activity`;
        const parts = [["Practice", day.coding], ["Lessons", day.learning], ["Tests", day.tests], ["Interviews", day.interviews]].filter(([, value]) => value > 0);
        return `<b>${shortDay(day.date)}</b><br/>${parts.map(([label, value]) => `${label}: ${value}`).join("<br/>")}`;
      },
    }),
    visualMap: { show: false, min: 0, max, inRange: { color: theme.dark ? ["#1e293b", "#075985", "#0284c7", "#38bdf8"] : ["#e0f2fe", "#7dd3fc", "#0ea5e9", "#0369a1"] } },
    calendar: {
      range: [activity.from, activity.to], top: 22, left: compact ? 28 : 36, right: 6, bottom: 4, cellSize: ["auto", compact ? 11 : 14],
      itemStyle: { color: theme.empty, borderColor: theme.surface, borderWidth: 3 }, splitLine: { show: false },
      dayLabel: { firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"], color: theme.muted, fontSize: 10 },
      monthLabel: { color: theme.text, fontSize: 10 }, yearLabel: { show: false },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: activity.days.map((day) => [day.date, day.total]) }],
  };
}

/** Activity by weekday (Monday first) as a radial bar. */
export function weekdayOption(weekdays, theme) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const best = Math.max(...weekdays);
  return {
    tooltip: tooltip(theme, { trigger: "item", formatter: (item) => `${names[item.dataIndex]}: <b>${item.value}</b>` }),
    polar: { radius: ["18%", "86%"] },
    angleAxis: { type: "category", data: names, startAngle: 90, axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisLabel(theme, { fontSize: 10 }) },
    radiusAxis: { show: false, max: Math.max(1, best) * 1.05 },
    series: [{ type: "bar", coordinateSystem: "polar", data: weekdays.map((value) => ({ value, itemStyle: { color: value === best && best > 0 ? SKY : alpha(SKY, 0.4) } })), roundCap: true, barWidth: 14 }],
  };
}

/** Practice languages as a small donut. */
export function languagesOption(languages, names, theme) {
  return {
    tooltip: tooltip(theme, { trigger: "item", formatter: (item) => `${item.name}: <b>${item.value}</b> (${item.percent}%)` }),
    series: [{ type: "pie", radius: ["50%", "78%"], padAngle: 2, itemStyle: { borderRadius: 5, borderColor: theme.surface, borderWidth: 2 }, label: { show: false }, data: languages.map((language, index) => ({ name: names[language.language] || language.language, value: language.submissions, itemStyle: { color: CATEGORICAL[index % CATEGORICAL.length] } })) }],
  };
}

/** Preparation estimate week by week, as a soft area line. `compact` drops the axes (sparkline). */
export function growthOption(points, theme, { compact = false } = {}) {
  const data = points.map((point) => point.preparation);
  return {
    tooltip: tooltip(theme, { trigger: "axis", valueFormatter: (value) => `${value}%` }),
    grid: compact ? { left: 0, right: 0, top: 6, bottom: 0 } : { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: points.map((point) => shortDay(point.date)), show: !compact, axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: { type: "value", min: 0, max: compact ? undefined : 100, show: !compact, splitLine: splitLine(theme), axisLabel: axisLabel(theme, { formatter: "{value}%" }) },
    series: [{
      name: "Preparation", type: "line", data, smooth: 0.4, showSymbol: !compact && data.length <= 16, symbolSize: 6,
      lineStyle: { width: compact ? 2 : 2.5, color: SKY }, itemStyle: { color: SKY },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(SKY, 0.3) }, { offset: 1, color: alpha(SKY, 0) }] } },
    }],
  };
}

/** Running total of questions solved, stacked by difficulty. */
export function cumulativeSolvesOption(points, theme) {
  return {
    tooltip: tooltip(theme, { trigger: "axis" }),
    legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text, fontSize: 11 } },
    grid: { left: 8, right: 12, top: 30, bottom: 4, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: points.map((point) => shortDay(point.date)), axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: { type: "value", minInterval: 1, splitLine: splitLine(theme), axisLabel: axisLabel(theme) },
    series: ["Easy", "Medium", "Hard"].map((level) => ({
      name: level, type: "line", stack: "solved", smooth: 0.3, showSymbol: false, data: points.map((point) => point[level]),
      lineStyle: { width: 1.5, color: DIFFICULTY_COLORS[level] }, itemStyle: { color: DIFFICULTY_COLORS[level] }, areaStyle: { color: alpha(DIFFICULTY_COLORS[level], 0.35) },
    })),
  };
}

/** When the student practises: weekday × hour heatmap (India time). */
export function rhythmOption(rhythm, theme) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, hour) => (hour % 3 === 0 ? new Date(Date.UTC(2020, 0, 1, hour)).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" }) : ""));
  const max = Math.max(1, ...rhythm.cells.map((cell) => cell.count));
  return {
    tooltip: tooltip(theme, {
      formatter: (item) => {
        const cell = rhythm.cells.find((entry) => entry.hour === item.data[0] && entry.day === item.data[1]);
        const time = new Date(Date.UTC(2020, 0, 1, item.data[0])).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" });
        return cell ? `<b>${days[item.data[1]]} · ${time}</b><br/>${cell.count} tries · ${Math.round((cell.correct / cell.count) * 100)}% correct` : `${days[item.data[1]]} · ${time}<br/>No practice`;
      },
    }),
    grid: { left: 40, right: 8, top: 8, bottom: 26 },
    xAxis: { type: "category", data: hours, splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: axisLabel(theme, { interval: 0, fontSize: 10 }) },
    yAxis: { type: "category", data: days, inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: axisLabel(theme, { fontSize: 10.5 }) },
    visualMap: { show: false, min: 0, max, inRange: { color: theme.dark ? ["#1e293b", "#075985", "#0284c7", "#38bdf8"] : ["#f0f9ff", "#7dd3fc", "#0ea5e9", "#0369a1"] } },
    series: [{
      type: "heatmap", data: Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => [hour, day, rhythm.cells.find((cell) => cell.day === day && cell.hour === hour)?.count || 0])).flat(),
      itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: SKY, borderWidth: 1 } },
    }],
  };
}

/** Coverage toward "strong" on the biggest topics, as a skill radar. */
export function skillRadarOption(topics, theme) {
  const shown = topics.slice(0, 8);
  return {
    tooltip: tooltip(theme),
    radar: {
      indicator: shown.map((topic) => ({ name: topic.name.length > 16 ? `${topic.name.slice(0, 15)}…` : topic.name, max: 100 })), radius: "64%", splitNumber: 4,
      axisName: { color: theme.text, fontSize: 10.5 }, splitLine: { lineStyle: { color: theme.grid } }, splitArea: { areaStyle: { color: [alpha(SKY, 0.02), alpha(SKY, 0.05)] } }, axisLine: { lineStyle: { color: theme.grid } },
    },
    series: [{
      type: "radar",
      data: [
        { name: "Progress to strong", value: shown.map((topic) => targetProgress(topic)), areaStyle: { color: alpha(SKY, 0.22) }, lineStyle: { color: SKY, width: 2 }, itemStyle: { color: SKY }, symbolSize: 5 },
        { name: "Accuracy", value: shown.map((topic) => topic.accuracy ?? 0), areaStyle: { color: alpha(EMERALD, 0.1) }, lineStyle: { color: EMERALD, width: 1.5, type: "dashed" }, itemStyle: { color: EMERALD }, symbolSize: 4 },
      ],
    }],
    legend: { bottom: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text, fontSize: 11 } },
  };
}

/** Weekly accuracy as a line over submission bars. */
export function weeklyAccuracyOption(weeks, theme) {
  return {
    tooltip: tooltip(theme, { trigger: "axis" }),
    grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: weeks.map((week) => shortDay(week.week)), axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: axisLabel(theme, { hideOverlap: true }) },
    yAxis: [
      { type: "value", min: 0, max: 100, alignTicks: false, splitLine: splitLine(theme), axisLabel: axisLabel(theme, { formatter: "{value}%" }) },
      { type: "value", show: false, alignTicks: false, splitLine: { show: false } },
    ],
    series: [
      { name: "Submissions", type: "bar", yAxisIndex: 1, data: weeks.map((week) => week.submissions), barMaxWidth: 22, itemStyle: { color: alpha(SKY, theme.dark ? 0.3 : 0.16), borderRadius: [4, 4, 0, 0] } },
      { name: "Accuracy", type: "line", data: weeks.map((week) => week.accuracy), smooth: 0.3, connectNulls: true, symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, color: EMERALD }, itemStyle: { color: EMERALD }, tooltip: { valueFormatter: (value) => `${value}%` } },
    ],
  };
}

/** Time spent on each test against the score, with the pass mark. */
export function testTimeOption(tests, passPercent, theme) {
  return {
    tooltip: tooltip(theme, { formatter: (item) => `<b>${item.data.test.title}</b><br/>${item.data.test.percent}% in ${item.data.test.minutes} min` }),
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: "value", name: "Minutes", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: theme.muted, fontSize: 11 }, min: 0, splitLine: splitLine(theme), axisLabel: axisLabel(theme) },
    yAxis: { type: "value", min: 0, max: 100, splitLine: splitLine(theme), axisLabel: axisLabel(theme, { formatter: "{value}%" }) },
    series: [{
      type: "scatter", symbolSize: 16,
      data: tests.filter((test) => Number.isFinite(test.minutes)).map((test) => ({ value: [test.minutes, test.percent], test, itemStyle: { color: alpha(test.passed ? EMERALD : "#f43f5e", 0.8), borderColor: test.passed ? EMERALD : "#f43f5e" } })),
      markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#f59e0b" }, label: { formatter: `Pass ${passPercent}%`, color: "#b45309", fontSize: 10, position: "insideEndTop" }, data: [{ yAxis: passPercent }] },
    }],
  };
}

export { DIFFICULTY_COLORS };
