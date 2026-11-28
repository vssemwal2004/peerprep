// Pure helpers for the student Analysis page: periods, sections, topic states, filters, formatting.

export const PERIODS = Object.freeze([
  { id: "7d", label: "7 days", short: "7D" },
  { id: "30d", label: "30 days", short: "30D" },
  { id: "90d", label: "90 days", short: "90D" },
  { id: "180d", label: "6 months", short: "6M" },
  { id: "365d", label: "1 year", short: "1Y" },
  { id: "all", label: "All time", short: "All" },
]);
export const PERIOD_IDS = new Set([...PERIODS.map((period) => period.id), "custom"]);

/**
 * Prep Analysis v2 pages in tab order (2026-11-28: Quick Prep, Learning and Badges pages removed;
 * topics live in Prep Coding and Prep Readiness; companies in Prep Readiness).
 * `when(insights, features)` decides whether the student may open it: `insights.access` from the
 * server, `features` = { score, coins } from the student's own feature access.
 * `period`: whether the page follows the period filter.
 */
export const SECTIONS = Object.freeze([
  { id: "overview", label: "Overview", period: true, when: () => true },
  { id: "score", label: "Prep Score", period: true, when: (data, features = {}) => Boolean(features.score) },
  { id: "readiness", label: "Prep Readiness", period: false, when: (data) => Boolean(data.access?.coding) },
  { id: "coins", label: "Prep Coins", period: false, when: (data, features = {}) => Boolean(features.coins) },
  { id: "coding", label: "Prep Coding", period: true, when: (data) => Boolean(data.sections?.coding) },
  { id: "assessment", label: "Prep Assessment", period: true, when: (data) => Boolean(data.sections?.assessment) },
  { id: "mock", label: "Prep Mock", period: true, when: (data) => Boolean(data.access?.prepmock) },
  { id: "interview", label: "Prep Interview", period: true, when: (data) => Boolean(data.sections?.interview) },
]);

// Old addresses (/student/analysis/dsa …) still open the right page.
const SECTION_ALIASES = {
  dsa: "coding", topics: "coding", tests: "assessment", assessments: "assessment", interviews: "interview", prepmock: "mock", "prep-mock": "mock",
  placement: "readiness", companies: "readiness", "prep-readiness": "readiness", "practice-readiness": "readiness", sbc: "readiness", pbc: "readiness",
  "prep-score": "score", wallet: "coins", "prep-coins": "coins",
  quickprep: "overview", learning: "overview", learn: "overview", activity: "overview", badges: "overview", awards: "overview", coach: "overview", next: "overview",
};
export const sectionFromParam = (value) => SECTION_ALIASES[value] || (SECTIONS.some((section) => section.id === value) ? value : "overview");
export const visibleSections = (insights, features = {}) => (insights ? SECTIONS.filter((section) => section.when(insights, features)) : []);
export const sectionPath = (id) => (id === "overview" ? "/student/analysis" : `/student/analysis/${id}`);
// The KPI tiles name the backend section; the pages have their own ids.
export const KPI_SECTION = { topics: "coding", coding: "coding", learning: "overview", assessment: "assessment", interview: "interview", activity: "overview" };

/** Strongest and weakest topics among those the student has worked on. */
export function strengthsAndGaps(topics = [], limit = 4) {
  const worked = topics.filter((topic) => topic.graded > 0 || topic.solved > 0);
  const score = (topic) => (topic.accuracy ?? 0) * 0.6 + targetProgress(topic) * 0.4;
  return {
    strengths: [...worked].filter((topic) => topic.state === "strong" || score(topic) >= 60).sort((left, right) => score(right) - score(left)).slice(0, limit),
    gaps: [...worked].filter((topic) => topic.state === "needsWork" || score(topic) < 45).sort((left, right) => score(left) - score(right)).slice(0, limit),
  };
}

/** Weekly accuracy from daily coding rows: [{ label, accuracy, submissions }]. */
export function weeklyAccuracy(daily = []) {
  const weeks = new Map();
  for (const day of daily) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const week = weeks.get(monday) || { week: monday, attempts: 0, accepted: 0 };
    week.attempts += day.attempts;
    week.accepted += day.accepted;
    weeks.set(monday, week);
  }
  return [...weeks.values()].sort((left, right) => left.week.localeCompare(right.week))
    .map((week) => ({ week: week.week, submissions: week.attempts, accuracy: week.attempts ? Math.round((week.accepted / week.attempts) * 1000) / 10 : null }));
}

export const hourLabel = (hour) => (hour === null || hour === undefined ? "—" : new Date(Date.UTC(2020, 0, 1, hour)).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" }));

export const TOPIC_STATES = Object.freeze({
  strong: { label: "Strong", color: "#10b981", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20" },
  building: { label: "Building", color: "#0284c7", chip: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20" },
  needsWork: { label: "Needs work", color: "#f43f5e", chip: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20" },
  notStarted: { label: "Not started", color: "#94a3b8", chip: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10" },
});
export const STATE_ORDER = ["needsWork", "building", "strong", "notStarted"];

export const TOPIC_SORTS = Object.freeze([
  { id: "size", label: "Largest first" },
  { id: "progress", label: "Closest to strong" },
  { id: "accuracy", label: "Lowest accuracy" },
  { id: "recent", label: "Recently practised" },
  { id: "name", label: "A–Z" },
]);

/** Progress toward the topic's "strong" target, 0–100. */
export const targetProgress = (topic) => (topic.target ? Math.min(100, Math.round((topic.solved / topic.target) * 100)) : 0);

/** Topics narrowed by state, core-only and a search, then sorted. */
export function filterTopics(topics = [], { state = "all", coreOnly = false, search = "", sort = "size" } = {}) {
  const text = search.trim().toLowerCase();
  const list = topics.filter((topic) => (state === "all" || topic.state === state) && (!coreOnly || topic.core) && (!text || topic.name.toLowerCase().includes(text)));
  const sorters = {
    size: (left, right) => right.total - left.total,
    progress: (left, right) => targetProgress(right) - targetProgress(left) || right.solved - left.solved,
    accuracy: (left, right) => (left.accuracy ?? 101) - (right.accuracy ?? 101),
    recent: (left, right) => new Date(right.lastAt || 0) - new Date(left.lastAt || 0),
    name: () => 0,
  };
  return [...list].sort((left, right) => (sorters[sort] || sorters.size)(left, right) || left.name.localeCompare(right.name));
}

export const stateCounts = (topics = []) => topics.reduce((counts, topic) => ({ ...counts, [topic.state]: (counts[topic.state] || 0) + 1 }), { strong: 0, building: 0, needsWork: 0, notStarted: 0 });

export const LANGUAGE_NAMES = Object.freeze({ python: "Python", python3: "Python", java: "Java", cpp: "C++", "c++": "C++", c: "C", javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", go: "Go", csharp: "C#", kotlin: "Kotlin", rust: "Rust", ruby: "Ruby", swift: "Swift", unknown: "Other" });

/**
 * Fills the lists and objects the pages read without checking, so an answer that lacks some of
 * them (a server not yet restarted on newer code, a cached older answer) shows empty cards
 * instead of crashing the page.
 */
export function normalizeInsights(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const activity = raw.activity || {};
  const sections = { ...(raw.sections || {}) };
  if (sections.coding) {
    const coding = sections.coding;
    sections.coding = {
      ...coding,
      retry: { count: 0, items: [], ...(coding.retry || {}) },
      breakdown: { languages: [], difficulties: [], ...(coding.breakdown || {}) },
      milestones: { total: coding.solved?.total || 0, reached: [], next: null, ...(coding.milestones || {}) },
      recent: coding.recent || [],
      growth: coding.growth || [],
      rhythm: coding.rhythm || null,
    };
  }
  if (sections.assessment) sections.assessment = { ...sections.assessment, upcoming: sections.assessment.upcoming || [] };
  if (sections.prepmock) sections.prepmock = { taken: 0, ...sections.prepmock, tests: sections.prepmock.tests || [] };
  return {
    ...raw,
    coach: raw.coach || [],
    records: raw.records || [],
    sections,
    activity: {
      ...activity,
      days: activity.days || [],
      weekdays: activity.weekdays?.length === 7 ? activity.weekdays : [0, 0, 0, 0, 0, 0, 0],
      streak: { current: 0, best: 0, ...(activity.streak || {}) },
    },
  };
}

// ---------------------------------------------------------------- formatting

export const formatNumber = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 }));
export const formatPercent = (value) => (value === null || value === undefined ? "—" : `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
export const formatValue = (value, unit) => (unit === "%" ? formatPercent(value) : formatNumber(value));

/** "+3", "−2.5 pts", or "" when there is nothing to compare with. */
export function changeText(kpi) {
  if (kpi?.change === null || kpi?.change === undefined) return "";
  const sign = kpi.change > 0 ? "+" : kpi.change < 0 ? "−" : "±";
  const amount = Math.abs(kpi.change).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return `${sign}${amount}${kpi.unit === "%" ? " pts" : ""}`;
}
export const changeTone = (change) => (change > 0 ? "up" : change < 0 ? "down" : "flat");

export function daysAgoText(days) {
  if (days === null || days === undefined) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export const shortDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
export const fullDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export function periodLabel(range) {
  if (!range) return "";
  if (range.preset === "custom") return `${fullDate(range.from)} – ${fullDate(range.to)}`;
  return PERIODS.find((period) => period.id === range.preset)?.label || "";
}

/** A short line for the preparation estimate. */
export function preparationLevel(percent) {
  if (percent >= 80) return { label: "Interview ready", tone: "text-emerald-600 dark:text-emerald-400" };
  if (percent >= 55) return { label: "Well prepared", tone: "text-sky-600 dark:text-sky-400" };
  if (percent >= 30) return { label: "Building up", tone: "text-amber-600 dark:text-amber-400" };
  return { label: "Getting started", tone: "text-slate-500 dark:text-zinc-400" };
}
