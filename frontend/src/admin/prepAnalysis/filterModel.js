// The Prep Analysis filter, in the simplest form that still covers any combination:
//
//   - Pick the feature to analyse (All, Prep Coding with its Quick Prep sheets, …).
//   - Describe the students you want as a GROUP: tap options in each filter
//     ("Semester 5, 6", "Prep Score 75 or more"). Several options in one filter
//     mean "any of them"; different filters all apply together.
//   - Need a second kind of student too? Add another group: students who fit
//     group A OR group B are shown. Any filter can be flipped to "not these".
//   - Top / bottom rules run last (top 10, bottom 5%, …).
//
// Groups OR'd together, each an AND of filters, can express any combination
// without asking anyone to think in AND / OR.
//
// State:  { area, range, groups: [group], rank: { join, rules: [rankRule] } }
// group:  { id, rules: [rule] }          (at most one rule per field)
// rule:   { id, field, operator, value, labels, qualifiers }
// rankRule: { id, direction: "top" | "bottom", value, unit: "count" | "percent", metric }

// Operator words, used when a filter is written out (summaries and downloads).
export const OPERATORS = Object.freeze({
  enum: [{ value: "anyOf", label: "is" }, { value: "noneOf", label: "is not" }],
  set: [{ value: "anyOf", label: "includes" }, { value: "allOf", label: "includes all of" }, { value: "noneOf", label: "does not include" }],
  number: [{ value: "gte", label: "at least" }, { value: "lte", label: "at most" }, { value: "between", label: "between" }, { value: "eq", label: "exactly" }],
  percent: [{ value: "gte", label: "at least" }, { value: "lte", label: "at most" }, { value: "between", label: "between" }, { value: "eq", label: "exactly" }],
  text: [{ value: "contains", label: "contains" }],
});

export const RANGE_PRESETS = Object.freeze([
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 6 months" },
  { value: "365d", label: "Last year" },
  { value: "all", label: "All time" },
]);

export const MAX_GROUPS = 6;
export const MAX_RANK_RULES = 6;
const LIST_OPERATORS = ["anyOf", "noneOf", "allOf"];

let sequence = 0;
export const nodeId = () => `n${Date.now().toString(36)}${(sequence += 1).toString(36)}`;
export const groupName = (index) => `Group ${String.fromCharCode(65 + index)}`;

export const operatorLabel = (field, operator) => (OPERATORS[field?.kind] || []).find((entry) => entry.value === operator)?.label || operator;

export function defaultValue(operator) {
  if (LIST_OPERATORS.includes(operator)) return [];
  if (operator === "between") return ["", ""];
  return "";
}

export const newGroup = (rules = []) => ({ id: nodeId(), rules });
export const newRankRule = (metric, direction = "top") => ({ id: nodeId(), direction, value: 10, unit: "count", metric });

export function defaultFilterState(area = "coding") {
  return { area, range: { preset: "all" }, groups: [newGroup()], rank: { join: "and", rules: [] } };
}

// ---------------------------------------------------------------- features and fields

/** The modules a feature covers: "all" is every licensed feature. */
export const areaModules = (area, catalog) => (area === "all"
  ? (catalog?.areas || []).map((entry) => entry.key).filter((key) => key !== "all")
  : [area]);

/** The chosen feature's own fields (Quick Prep fields belong to Prep Coding). */
export function featureFields(catalog, area) {
  const modules = new Set(areaModules(area, catalog));
  return catalog.fields.filter((field) => field.module !== "student" && modules.has(field.module));
}

export const studentFields = (catalog) => catalog.fields.filter((field) => field.module === "student");
/** Measures a top / bottom rule can rank by: the overall Prep Score, then the feature's own measures. */
export const rankMetrics = (catalog, area) => [
  ...catalog.fields.filter((field) => field.key === "student.prepScore"),
  ...featureFields(catalog, area).filter((field) => field.rankable),
];

// The filters shown straight away; the rest sit under "More filters".
const MAIN_FIELDS = new Set([
  "student.semester", "student.branch", "student.course", "student.group", "student.prepScore",
  "learning.prepScore", "interview.prepScore", "assessment.prepScore",
  "coding.practiceStatus", "coding.prepScore", "coding.solved", "coding.solvedHard", "coding.solvedTopics", "quickprep.status", "quickprep.progress",
  "learning.status", "learning.progress", "learning.subjects",
  "interview.status", "interview.done", "interview.mockScore", "interview.aiCompleted",
  "assessment.status", "assessment.averageScore", "assessment.missed", "assessment.takenTests",
]);
export const isMainField = (field) => MAIN_FIELDS.has(field.key);

// ---------------------------------------------------------------- one group

export const ruleFor = (group, key) => group.rules.find((rule) => rule.field === key) || null;

/** The group with `key`'s filter replaced, or removed when `rule` is null. */
export function setRule(group, key, rule) {
  const rest = group.rules.filter((entry) => entry.field !== key);
  return { ...group, rules: rule ? [...rest, { ...rule, field: key, id: rule.id || nodeId() }] : rest };
}

export function listRule(field, values, operator = "anyOf", labels = {}, base = null) {
  if (!values.length) return null;
  return { id: base?.id || nodeId(), field: field.key, operator, value: values, labels: { ...(base?.labels || {}), ...labels }, qualifiers: {} };
}

// ---------------------------------------------------------------- number filters

const COUNT_PRESETS = [
  { label: "Zero (none yet)", from: "", to: "0" },
  { label: "1 or more", from: "1", to: "" },
  { label: "5 or more", from: "5", to: "" },
  { label: "10 or more", from: "10", to: "" },
  { label: "25 or more", from: "25", to: "" },
];
const PERCENT_PRESETS = [
  { label: "Under 25%", from: "", to: "25" },
  { label: "25–50%", from: "25", to: "50" },
  { label: "50–75%", from: "50", to: "75" },
  { label: "75% or more", from: "75", to: "" },
];
// Prep Score has no ceiling (a well-prepared student earns about 500 per feature).
const SCORE_PRESETS = [
  { label: "Under 50", from: "", to: "49.9" },
  { label: "50–250", from: "50", to: "250" },
  { label: "250–1,000", from: "250", to: "1000" },
  { label: "1,000 or more", from: "1000", to: "" },
];
const DAY_PRESETS = [
  { label: "Within 7 days", from: "", to: "7" },
  { label: "Within 14 days", from: "", to: "14" },
  { label: "Over 14 days", from: "15", to: "" },
  { label: "Over 30 days", from: "31", to: "" },
];
const RATING_PRESETS = [
  { label: "Under 3", from: "", to: "2.9" },
  { label: "3 or more", from: "3", to: "" },
  { label: "4 or more", from: "4", to: "" },
];

/** One-tap ranges for a number filter, in that field's own scale. */
export function numberPresets(field) {
  if (field.key.endsWith(".prepScore")) return SCORE_PRESETS;
  if (field.unit === "/ 5") return RATING_PRESETS;
  if (field.kind === "percent") return PERCENT_PRESETS;
  if (field.unit === "days" && field.key.endsWith("daysSinceActive")) return DAY_PRESETS;
  return COUNT_PRESETS;
}

/** { from, to } (strings, "" = open) of a number filter. */
export function rangeOf(rule) {
  if (!rule) return { from: "", to: "" };
  if (rule.operator === "between") return { from: String(rule.value?.[0] ?? ""), to: String(rule.value?.[1] ?? "") };
  if (rule.operator === "gte") return { from: String(rule.value ?? ""), to: "" };
  if (rule.operator === "lte") return { from: "", to: String(rule.value ?? "") };
  if (rule.operator === "eq") return { from: String(rule.value ?? ""), to: String(rule.value ?? "") };
  return { from: "", to: "" };
}

const isNumber = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));

/** A number filter for "from … to …" (either side open), or null when both are empty. */
export function rangeRule(field, from, to, base = null) {
  const hasFrom = isNumber(from);
  const hasTo = isNumber(to);
  if (!hasFrom && !hasTo) return null;
  const common = { id: base?.id || nodeId(), field: field.key, labels: {}, qualifiers: base?.qualifiers || {} };
  if (hasFrom && hasTo) {
    const [low, high] = Number(from) <= Number(to) ? [from, to] : [to, from];
    return { ...common, operator: "between", value: [String(low), String(high)] };
  }
  return hasFrom ? { ...common, operator: "gte", value: String(from) } : { ...common, operator: "lte", value: String(to) };
}

// ---------------------------------------------------------------- stored state

const asRule = (entry) => (entry?.field ? { labels: {}, qualifiers: {}, ...entry, id: entry.id || nodeId() } : null);
const treeRules = (node) => (!node ? [] : node.type === "group" || Array.isArray(node.children)
  ? (node.children || []).flatMap(treeRules)
  : [asRule(node)].filter(Boolean));
const onePerField = (rules) => [...new Map(rules.map((rule) => [rule.field, rule])).values()];

function cleanRank(input) {
  return {
    join: input?.join === "or" ? "or" : "and",
    rules: (Array.isArray(input?.rules) ? input.rules : []).filter((rule) => rule?.metric).slice(0, MAX_RANK_RULES)
      .map((rule) => ({ id: rule.id || nodeId(), direction: rule.direction === "bottom" ? "bottom" : "top", value: rule.value ?? 10, unit: rule.unit === "percent" ? "percent" : "count", metric: rule.metric })),
  };
}

/** Saved pages from every earlier version open as groups instead of breaking. */
export function normalizeState(stored, fallbackArea = "coding") {
  const base = defaultFilterState(fallbackArea);
  if (!stored || typeof stored !== "object") return base;
  let groups;
  if (Array.isArray(stored.groups)) {
    groups = stored.groups.slice(0, MAX_GROUPS).map((group) => ({ id: group?.id || nodeId(), rules: onePerField((group?.rules || []).map(asRule).filter(Boolean)) }));
  } else {
    // Version 4 kept feature and student condition trees; version 3 a flat list.
    const rules = [...treeRules(stored.feature), ...treeRules(stored.students), ...(Array.isArray(stored.filters) ? stored.filters.map(asRule).filter(Boolean) : [])];
    groups = [newGroup(onePerField(rules))];
  }
  let rank = cleanRank(stored.rank);
  if (!rank.rules.length && stored.ranking?.mode && stored.ranking.mode !== "everyone" && stored.ranking.metric) {
    rank = cleanRank({ rules: [{ direction: stored.ranking.mode, value: stored.ranking.value, unit: stored.ranking.unit, metric: stored.ranking.metric }] });
  }
  return {
    area: typeof stored.area === "string" ? stored.area : base.area,
    range: stored.range?.preset ? stored.range : base.range,
    groups: groups.length ? groups : [newGroup()],
    rank,
  };
}

/** Changing the feature keeps student filters and drops the old feature's filters and rankings. */
export function switchArea(state, area, fieldMap, catalog) {
  const modules = new Set(["student", ...areaModules(area, catalog)]);
  const keep = (key) => modules.has(fieldMap.get(key)?.module);
  return {
    ...state,
    area,
    groups: state.groups.map((group) => ({ ...group, rules: group.rules.filter((rule) => keep(rule.field)) })),
    rank: { ...state.rank, rules: state.rank.rules.filter((rule) => keep(rule.metric)) },
  };
}

// ---------------------------------------------------------------- request shape

const filled = (value) => value !== "" && value !== null && value !== undefined;

export function isRuleComplete(rule, field) {
  if (!field || !rule?.operator) return false;
  const { operator, value } = rule;
  if (LIST_OPERATORS.includes(operator)) return Array.isArray(value) && value.length > 0;
  if (operator === "between") return Array.isArray(value) && value.length === 2 && value.every((entry) => filled(entry) && Number.isFinite(Number(entry))) && Number(value[0]) <= Number(value[1]);
  if (field.kind === "number" || field.kind === "percent") return filled(value) && Number.isFinite(Number(value));
  return filled(String(value ?? "").trim());
}

const castEnum = (field, entry) => (field.valueType === "number" ? Number(entry) : entry);

function requestValue(rule, field) {
  if (rule.operator === "between") return rule.value.map(Number);
  if (Array.isArray(rule.value)) return rule.value.map((entry) => castEnum(field, entry));
  if (field.kind === "number" || field.kind === "percent") return Number(rule.value);
  return String(rule.value).trim();
}

function requestQualifiers(qualifiers) {
  const entries = Object.entries(qualifiers || {}).filter(([, values]) => Array.isArray(values) && values.length);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const completeRules = (group, fieldMap) => (group?.rules || []).filter((rule) => isRuleComplete(rule, fieldMap.get(rule.field)));

/** One group's filters, all applied together, or null when it has none. */
export function toRequestGroup(group, fieldMap) {
  const children = completeRules(group, fieldMap).map((rule) => {
    const field = fieldMap.get(rule.field);
    const qualifiers = field.qualifiers ? requestQualifiers(rule.qualifiers) : undefined;
    return { type: "rule", field: rule.field, operator: rule.operator, value: requestValue(rule, field), ...(qualifiers ? { qualifiers } : {}) };
  });
  return children.length ? { type: "group", join: "and", children } : null;
}

/** Students who fit any group. Groups with nothing chosen yet are left out (no filter at all when none has a filter). */
export function toRequestFilter(state, fieldMap) {
  const groups = state.groups.map((group) => toRequestGroup(group, fieldMap)).filter(Boolean);
  if (!groups.length) return { type: "group", join: "and", children: [] };
  return groups.length === 1 ? groups[0] : { type: "group", join: "or", children: groups };
}

const isRankComplete = (rule) => Boolean(rule.metric) && Number(rule.value) > 0 && (rule.unit === "percent" ? Number(rule.value) <= 100 : Number.isInteger(Number(rule.value)));

export function toRequestRank(rank) {
  const cuts = (rank?.rules || []).filter(isRankComplete)
    .map((rule) => ({ metric: rule.metric, direction: rule.direction === "bottom" ? "bottom" : "top", unit: rule.unit === "percent" ? "percent" : "count", value: Number(rule.value) }));
  return { join: rank?.join === "or" ? "or" : "and", cuts };
}

/** The /query (and /count, /export) body for the filters, the chart layout and the table view. */
export function toQueryRequest({ state, layout = [], table }, fieldMap) {
  return {
    module: state.area,
    range: state.range,
    filter: toRequestFilter(state, fieldMap),
    rank: toRequestRank(state.rank),
    charts: layout.map((entry) => {
      const filter = toRequestGroup(entry.filter, fieldMap);
      const options = Object.fromEntries(Object.entries(entry.options || {}).filter(([, value]) => value !== "" && value != null));
      return { id: entry.id, ...(filter ? { filter } : {}), ...(Object.keys(options).length ? { options } : {}) };
    }),
    ...(table ? { table } : {}),
  };
}

export const countRules = (group, fieldMap) => completeRules(group, fieldMap).length;
export const countRankRules = (rank) => (rank?.rules || []).filter(isRankComplete).length;
export const countActive = (state, fieldMap) => state.groups.reduce((sum, group) => sum + countRules(group, fieldMap), 0) + countRankRules(state.rank);

// ---------------------------------------------------------------- in words

const UNIT_TEXT = { days: " days", min: " min", "/ 5": " of 5" };
const unitOf = (field) => (field.kind === "percent" ? "%" : UNIT_TEXT[field.unit] || "");

/** (field, value) → label from the catalog's fixed lists (status names, semesters, languages). */
export const optionLookup = (catalog) => (field, value) => catalog?.staticOptions?.[field.options]?.find((option) => String(option.value) === String(value))?.label;

/** "Semester 5" → "5" after "Semester"; "Stopped (no practice…)" → "Stopped". */
export function compactOption(label, field) {
  let text = String(label ?? "").replace(/\s*\(.*\)\s*$/, "");
  const prefix = `${field?.label || ""} `;
  if (field && text.toLowerCase().startsWith(prefix.toLowerCase()) && text.length > prefix.length) text = text.slice(prefix.length);
  return text;
}

/** A filter in a few plain words: "Semester 5 or 6", "Prep Score 75 or more", "Branch not CSE". */
export function ruleText(rule, fieldMap, lookup = () => undefined, { max = 3 } = {}) {
  const field = fieldMap.get(rule.field);
  if (!isRuleComplete(rule, field)) return "";
  const unit = unitOf(field);
  if (Array.isArray(rule.value) && rule.operator !== "between") {
    const names = rule.value.map((value) => compactOption(rule.labels?.[value] ?? lookup(field, value) ?? value, field));
    const shown = names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max} more` : names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
    if (rule.operator === "noneOf") return `${field.label}: not ${names.length > max ? shown : names.join(", ")}`;
    if (rule.operator === "allOf") return `${field.label}: all of ${names.join(", ")}`;
    return `${field.label}: ${shown}`;
  }
  if (field.kind === "text") return `${field.label} contains “${String(rule.value).trim()}”`;
  const { from, to } = rangeOf(rule);
  const only = Object.values(rule.qualifiers || {}).flat().filter(Boolean);
  const suffix = only.length ? ` (counting only ${only.join(", ")})` : "";
  if (from && to) return `${field.label}: ${from === to ? `${from}${unit}` : `${from} to ${to}${unit}`}${suffix}`;
  if (!from && Number(to) === 0) return `${field.label}: 0${suffix}`;
  return `${field.label}: ${from ? `${from}${unit} or more` : `up to ${to}${unit}`}${suffix}`;
}

/**
 * What a closed filter dropdown shows: { text, extra } such as { "Arrays", 2 } for
 * "Arrays +2", "Not CSE", "75 or more", or { "Any", 0 } when nothing is chosen.
 */
export function valueParts(rule, field, lookup = () => undefined) {
  if (!field || !isRuleComplete(rule, field)) return { text: "Any", extra: 0 };
  if (Array.isArray(rule.value) && rule.operator !== "between") {
    const names = rule.value.map((value) => compactOption(rule.labels?.[value] ?? lookup(field, value) ?? value, field));
    const prefix = rule.operator === "noneOf" ? "Not " : rule.operator === "allOf" ? "All of " : "";
    return { text: `${prefix}${names[0]}`, extra: names.length - 1 };
  }
  if (field.kind === "text") return { text: `“${String(rule.value).trim()}”`, extra: 0 };
  const { from, to } = rangeOf(rule);
  const only = Object.values(rule.qualifiers || {}).flat().filter(Boolean);
  const note = only.length ? ` (only ${only.slice(0, 2).join(", ")}${only.length > 2 ? "…" : ""})` : "";
  const preset = numberPresets(field).find((entry) => entry.from === from && entry.to === to);
  if (preset) return { text: `${preset.label}${note}`, extra: 0 };
  const unit = unitOf(field);
  if (from && to) return { text: `${from === to ? `${from}${unit}` : `${from} to ${to}${unit}`}${note}`, extra: 0 };
  return { text: `${from ? `${from}${unit} or more` : `Up to ${to}${unit}`}${note}`, extra: 0 };
}

/** A group as one line: "Semester: 5 or 6 · Prep Score: 75 or more", or "" for everyone. */
export const groupText = (group, fieldMap, lookup, options) => completeRules(group, fieldMap).map((rule) => ruleText(rule, fieldMap, lookup, options)).join(" · ");

export const rankRuleText = (rule, metricLabel) => `${rule.direction === "bottom" ? "Bottom" : "Top"} ${rule.value}${rule.unit === "percent" ? "%" : ""} by ${metricLabel(rule.metric)}`;

export function rankText(rank, metricLabel) {
  return (rank?.rules || []).filter(isRankComplete).map((rule) => rankRuleText(rule, metricLabel)).join(rank?.join === "or" ? ", or " : ", and ");
}

/** The whole filter in plain sentences, for the top of a downloaded file. */
export function summaryLines(state, fieldMap, metricLabel, lookup) {
  const lines = [];
  const groups = state.groups.map((group) => groupText(group, fieldMap, lookup, { max: 20 })).filter(Boolean);
  if (groups.length === 1) lines.push(`Students: ${groups[0]}`);
  if (groups.length > 1) groups.forEach((text, index) => lines.push(`${index ? "Or " : ""}${groupName(index)}: ${text}`));
  const ranking = rankText(state.rank, metricLabel);
  if (ranking) lines.push(`Showing: ${ranking}`);
  return lines;
}

// ---------------------------------------------------------------- clickable headline numbers

const KPI_RULES = Object.freeze({
  "coding.active": { field: "coding.practiceStatus", operator: "anyOf", value: ["active"] },
  "coding.stopped": { field: "coding.practiceStatus", operator: "anyOf", value: ["inactive", "never"] },
  "coding.hard": { field: "coding.solvedHard", operator: "gte", value: "1" },
  "coding.sheetStarted": { field: "quickprep.status", operator: "anyOf", value: ["finished", "inProgress"] },
  "coding.sheetFinished": { field: "quickprep.status", operator: "anyOf", value: ["finished"] },
  "learning.active": { field: "learning.status", operator: "anyOf", value: ["active"] },
  "learning.halfway": { field: "learning.progress", operator: "gte", value: "50" },
  "assessment.passedStudents": { field: "assessment.passed", operator: "gte", value: "1" },
  "learning.stopped": { field: "learning.status", operator: "anyOf", value: ["inactive", "never"] },
  "interview.students": { field: "interview.done", operator: "gte", value: "1" },
  "interview.strong": { field: "interview.mockScore", operator: "gte", value: "60" },
  "interview.scheduled": { field: "interview.scheduled", operator: "gte", value: "1" },
  "interview.never": { field: "interview.status", operator: "anyOf", value: ["never"] },
  "assessment.students": { field: "assessment.taken", operator: "gte", value: "1" },
  "assessment.missed": { field: "assessment.missed", operator: "gte", value: "1" },
  "assessment.never": { field: "assessment.status", operator: "anyOf", value: ["never"] },
});

const same = (left, right) => JSON.stringify([].concat(left).map(String).sort()) === JSON.stringify([].concat(right).map(String).sort());
const matches = (rule, wanted) => Boolean(rule) && rule.operator === wanted.operator && same(rule.value, wanted.value);

/** The filter behind a headline number, or null when it is not clickable. */
export function kpiRule(section, kpiId, fieldMap) {
  const rule = KPI_RULES[`${section}.${kpiId}`];
  return rule && (!fieldMap || fieldMap.has(rule.field)) ? rule : null;
}

export const isKpiActive = (rule, state) => Boolean(rule) && state.groups.every((group) => matches(ruleFor(group, rule.field), rule));

/** Sets the number's filter in every group, or removes it when it is already set. */
export function toggleKpi(rule, state) {
  const active = isKpiActive(rule, state);
  return {
    ...state,
    groups: state.groups.map((group) => setRule(group, rule.field, active ? null : { id: nodeId(), field: rule.field, operator: rule.operator, value: rule.value, labels: {}, qualifiers: {} })),
  };
}
