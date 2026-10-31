// One plain sentence per chart that says what stands out, so an admin does not
// have to read the chart to get the point. Only counts and individual students:
// never an average across students.

import { formatScore } from "../../../student/prepScore/formatScore.js";
import { LANGUAGE_LABELS } from "./chartOptions.js";

const INACTIVE_AFTER_DAYS = 14;
const number = (value) => Number(value || 0).toLocaleString();
const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (count, word) => `${number(count)} ${word}${count === 1 ? "" : "s"}`;
const dayText = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const maxBy = (list, read) => list.reduce((best, item) => (best === null || read(item) > read(best) ? item : best), null);

function weekChange(data) {
  const values = data.series?.[0]?.values || [];
  const name = (data.series?.[0]?.name || "").toLowerCase();
  if (!values.length) return null;
  const last = values.at(-1);
  if (values.length < 2) return `${number(last)} ${name} in the latest week.`;
  const before = values.at(-2);
  if (!before) return last ? `${number(last)} ${name} in the latest week, up from none the week before.` : null;
  const change = Math.round(((last - before) / before) * 100);
  if (change === 0) return `${number(last)} ${name} in the latest week, the same as the week before.`;
  return `${number(last)} ${name} in the latest week, ${change > 0 ? "up" : "down"} ${Math.abs(change)}% on the week before.`;
}

function biggestDrop(stages = []) {
  let worst = null;
  for (let index = 1; index < stages.length; index += 1) {
    const before = stages[index - 1].value;
    if (!before) continue;
    const lost = before - stages[index].value;
    const share = lost / before;
    if (lost > 0 && (!worst || share > worst.share)) worst = { from: stages[index - 1].name, to: stages[index].name, lost, share };
  }
  if (!worst) return stages[0]?.value ? "Every student who started has reached the last step." : null;
  return `Biggest drop: “${worst.from}” to “${worst.to}”, where ${plural(worst.lost, "student")} (${Math.round(worst.share * 100)}%) stop.`;
}

function attentionLine(items, what) {
  if (!items?.length) return null;
  if (!items.some((item) => "daysSinceActive" in item)) return `Lowest: ${items[0].name}.`;
  const idle = items.filter((item) => item.daysSinceActive === null || item.daysSinceActive > INACTIVE_AFTER_DAYS).length;
  const period = `in the last ${INACTIVE_AFTER_DAYS} days`;
  if (items.length === 1) return idle ? `This student has not ${what} ${period}.` : `This student has ${what} ${period}.`;
  if (!idle) return `All ${items.length} of these students have ${what} ${period}.`;
  if (idle === items.length) return `None of these ${items.length} students have ${what} ${period}.`;
  return `${idle} of these ${items.length} students have not ${what} ${period}.`;
}

function largestBand(bins, label) {
  const top = maxBy(bins || [], (bin) => bin.count);
  if (!top?.count) return null;
  return `Most students (${number(top.count)}) are in the ${top.label} band of ${label.toLowerCase()}.`;
}

function finishedAndUntouched(groups, thing) {
  if (!groups?.length) return null;
  const finished = maxBy(groups, (group) => group.values.Finished || 0);
  const untouched = maxBy(groups, (group) => group.values["Not started"] || 0);
  const parts = [];
  if (finished?.values.Finished) parts.push(`Most finished: ${finished.label} (${plural(finished.values.Finished, "student")}).`);
  if (untouched?.values["Not started"]) parts.push(`Most not started: ${untouched.label} (${number(untouched.values["Not started"])}).`);
  return parts.join(" ") || `No ${thing} started yet.`;
}

const BY_ID = {
  "top-students": ({ items }) => {
    const first = items?.[0];
    if (!first) return null;
    const hard = first.solved?.Hard || 0;
    return `${first.name} leads with a Prep Score of ${formatScore(first.score)}${hard ? `, with ${plural(hard, "Hard problem")} solved` : ""}.`;
  },
  "difficulty-split": ({ items }) => {
    const total = (items || []).reduce((sum, item) => sum + item.value, 0);
    if (!total) return null;
    const share = (key) => percentOf(items.find((item) => item.key === key)?.value || 0, total);
    return `${share("Easy")}% of solved problems are Easy, ${share("Medium")}% Medium and ${share("Hard")}% Hard.`;
  },
  "practice-trend": weekChange,
  "learning-trend": weekChange,
  "practice-funnel": ({ stages }) => biggestDrop(stages),
  "learning-funnel": ({ stages }) => biggestDrop(stages),
  "quickprep-funnel": ({ stages }) => biggestDrop(stages),
  "topic-strength": ({ items, cohort }) => (items?.[0] ? `${items[0].name} has the most students solving problems: ${number(items[0].value)}${cohort ? ` of ${number(cohort)} (${items[0].pct}%)` : ""}.` : null),
  "needs-attention": ({ items }) => attentionLine(items, "practised"),
  "learning-needs-attention": ({ items }) => attentionLine(items, "studied"),
  "quickprep-needs-attention": ({ items }) => attentionLine(items, "opened a sheet"),
  "activity-calendar": (data) => calendarLine(data),
  "learning-calendar": (data) => calendarLine(data),
  "student-profile": ({ mode, student, missing, indicators, values, topics, cohort }) => {
    if (missing) return "The chosen student is not in the current filter. Clear the student or change the filter.";
    if (mode === "cohort") {
      if (!topics?.length) return null;
      const top = topics[0];
      const low = topics.reduce((least, topic) => (topic.pct < least.pct ? topic : least), topics[0]);
      return `${top.pct}% of these students (${number(top.students)} of ${number(cohort)}) have solved ${top.name}; ${low.name} is the least covered here (${low.pct}%).`;
    }
    if (!student || !indicators?.length) return null;
    const pairs = indicators.map((indicator, index) => ({ name: indicator.name, value: values[index] || 0 }));
    const strongest = maxBy(pairs, (pair) => pair.value);
    const weakest = pairs.reduce((low, pair) => (pair.value < low.value ? pair : low), pairs[0]);
    return strongest.value === weakest.value
      ? `${student.name} has solved ${plural(strongest.value, "problem")} in each of these topics.`
      : `${student.name} is strongest in ${strongest.name} (${strongest.value} solved) and weakest in ${weakest.name} (${weakest.value}).`;
  },
  "failure-reasons": ({ items }) => {
    const total = (items || []).reduce((sum, item) => sum + item.value, 0);
    const failures = (items || []).filter((item) => item.key !== "AC");
    const top = maxBy(failures, (item) => item.value);
    if (!total || !top) return total ? "Every submission was accepted." : null;
    return `“${top.name}” is the most common failure: ${percentOf(top.value, total)}% of all submissions.`;
  },
  "language-usage": ({ items }) => {
    const top = items?.[0];
    return top ? `${LANGUAGE_LABELS[top.name] || top.name} is the most used language (${plural(top.value, "student")}).` : null;
  },
  "score-spread": ({ bins, label }) => largestBand(bins, label || "Prep Score"),
  "learning-spread": ({ bins, label }) => largestBand(bins, label || "Course completed"),
  "quickprep-spread": ({ bins, label }) => largestBand(bins, label || "Sheet progress"),
  "tough-problems": ({ items }) => (items?.[0] ? `“${items[0].name}” has the most failed attempts (${number(items[0].value)})${items[0].note ? `; ${items[0].note}` : ""}.` : null),
  "group-breakdown": ({ groups }) => {
    const totals = (groups || []).map((group) => ({ label: group.label, total: Object.values(group.values).reduce((sum, value) => sum + value, 0), students: group.students }));
    const top = maxBy(totals, (group) => group.total);
    return top?.total ? `${top.label} has solved the most problems (${number(top.total)}, from ${plural(top.students, "student")}).` : null;
  },
  "learning-subjects": ({ groups }) => finishedAndUntouched(groups, "subject"),
  "quickprep-sheets": ({ groups }) => finishedAndUntouched(groups, "sheet"),
  "topic-heatmap": ({ columns, cells, students }) => {
    if (!columns?.length || !students?.length) return null;
    const totals = columns.map((name, x) => ({ name, total: cells.filter((cell) => cell[0] === x).reduce((sum, cell) => sum + cell[2], 0) }));
    const top = maxBy(totals, (entry) => entry.total);
    const gap = totals.reduce((low, entry) => (entry.total < low.total ? entry : low), totals[0]);
    return top.name === gap.name ? null : `These students have solved the most in ${top.name} and the least in ${gap.name}.`;
  },
  "quickprep-matrix": ({ cells, students }) => {
    if (!students?.length) return null;
    const finishers = new Set((cells || []).filter((cell) => cell[2] >= 100).map((cell) => cell[1])).size;
    return `${finishers} of these ${plural(students.length, "student")} have finished at least one of these sheets.`;
  },
  "assessment-tests": ({ groups }) => {
    if (!groups?.length) return null;
    const missed = maxBy(groups, (group) => group.values.Missed || 0);
    const failed = maxBy(groups, (group) => group.values.Failed || 0);
    const parts = [];
    if (failed?.values.Failed) parts.push(`Most students below the pass mark: ${failed.label} (${number(failed.values.Failed)}).`);
    if (missed?.values.Missed) parts.push(`Most missed: ${missed.label} (${number(missed.values.Missed)}).`);
    return parts.join(" ") || "Every student who took these tests passed.";
  },
  "assessment-scores": ({ groups }) => {
    if (!groups?.length) return null;
    const top = maxBy(groups, (group) => group.values["80–100%"] || 0);
    const low = maxBy(groups, (group) => group.values["Below 40%"] || 0);
    const parts = [`${plural(groups.length, "test")} conducted.`];
    if (top?.values["80–100%"]) parts.push(`Most 80%+ scores: ${top.label} (${number(top.values["80–100%"])}).`);
    if (low?.values["Below 40%"]) parts.push(`Most below 40%: ${low.label} (${number(low.values["Below 40%"])}).`);
    return parts.join(" ");
  },
  "assessment-by-class": ({ groups }) => {
    const missed = maxBy(groups || [], (group) => group.values.Missed || 0);
    const passed = maxBy(groups || [], (group) => group.values.Passed || 0);
    const parts = [];
    if (passed?.values.Passed) parts.push(`${passed.label} passed the most tests (${number(passed.values.Passed)}).`);
    if (missed?.values.Missed) parts.push(`${missed.label} missed the most (${number(missed.values.Missed)}).`);
    return parts.join(" ") || null;
  },
  "assessment-funnel": ({ stages }) => biggestDrop(stages),
  "assessment-trend": weekChange,
  "assessment-calendar": (data) => calendarLine(data),
  "assessment-spread": ({ bins, label }) => largestBand(bins, label || "Test score"),
  "assessment-leaders": ({ items }) => (items?.[0] ? `${items[0].name} scores highest across their tests (${items[0].value}%).` : null),
  "assessment-needs-attention": ({ items }) => attentionLine(items, "taken a test"),
  "interview-funnel": ({ stages }) => biggestDrop(stages),
  "interview-trend": weekChange,
  "interview-calendar": (data) => calendarLine(data),
  "interview-spread": ({ bins, label }) => largestBand(bins, label || "Mock score"),
  "interview-leaders": ({ items }) => (items?.[0] ? `${items[0].name} has the highest mock interview score (${items[0].value}%).` : null),
  "interview-needs-attention": ({ items }) => attentionLine(items, "had an interview"),
  "interview-mix": ({ items }) => {
    const total = (items || []).reduce((sum, item) => sum + item.value, 0);
    const mock = items?.find((item) => item.key === "Mock")?.value || 0;
    return total ? `${percentOf(mock, total)}% of interviews done were mock interviews, ${100 - percentOf(mock, total)}% AI interviews.` : null;
  },
  "interview-ratings": ({ groups }) => {
    const lowShare = (group) => {
      const total = Object.values(group.values).reduce((sum, value) => sum + value, 0);
      return total ? ((group.values["Rated 1"] || 0) + (group.values["Rated 2"] || 0)) / total : 0;
    };
    const weakest = maxBy((groups || []).filter((group) => group.students), lowShare);
    return weakest && lowShare(weakest) > 0 ? `${weakest.label} gets the most low ratings (1 or 2): ${Math.round(lowShare(weakest) * 100)}% of its ratings.` : null;
  },
  "learning-leaders": ({ items }) => (items?.[0] ? `${items[0].name} has completed the most topics (${number(items[0].value)}).` : null),
  "quickprep-leaders": ({ items }) => (items?.[0] ? `${items[0].name} has finished the most sheets (${number(items[0].value)}).` : null),
};

function calendarLine({ days, unit }) {
  if (!days?.length) return null;
  const busiest = maxBy(days, ([, value]) => value);
  return `Active on ${plural(days.length, "day")} in the last year. Busiest: ${dayText(busiest[0])} (${number(busiest[1])} ${unit || ""}).`.replace(" )", ")");
}

/** "Needs attention" lists: how many are listed and how many never started, in the chips' words. */
function attentionChips({ chips, items, valueLabel }) {
  if (!chips?.length) return null;
  const [listed, never] = chips;
  const lead = `${number(listed.value)} ${listed.label.toLowerCase()}; ${number(never.value)} ${never.label.toLowerCase()}.`;
  // Only the practice list is ordered by time away.
  const longest = valueLabel?.startsWith("days") ? items?.[0] : null;
  return longest ? `${lead} Longest away: ${longest.name} (${number(longest.value)} days).` : lead;
}

/** What stands out in a chart, in one sentence, or null when nothing does. */
export function chartInsight(chart) {
  if (!chart?.data) return null;
  try {
    if (chart.data.chips?.length) return attentionChips(chart.data);
    return BY_ID[chart.id]?.(chart.data) || null;
  } catch {
    return null;
  }
}
