<<<<<<< Updated upstream
// The Prep Analysis filter, in the simplest form that still covers any combination:
//
//   - Pick the feature to analyse (All, Prep Coding with its Quick Prep sheets, …).
//   - Describe the students you want as a GROUP: tap options in each filter
//     ("Semester 5, 6", "Prep Score 250 or more"). Several options in one filter
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
=======
// The Prep Analysis filter, built the way an admin thinks about it:
//
//   1. Feature   which part of prep to analyse (All, Prep Coding, Prep Learning, …)
//                and conditions on that feature (Quick Prep is part of Prep Coding).
//   2. Students  conditions on the students themselves (semester, branch, …).
//   3. Top / bottom rules, applied after the filters (top 10, bottom 5%, …).
//
// Sections 1 and 2 are condition groups: rows joined with AND or OR, with
// sub-groups and sub-sub-groups for combinations such as
//   Semester is 5  AND  (Branch is CSE  OR  (Branch is IT AND Section is A)).
//
// State:  { area, range, feature: group, students: group, rank: { join, rules: [rankRule] } }
// group:  { id, type: "group", join: "and" | "or", negate, children: [group | rule] }
// rule:   { id, type: "rule", field, operator, value, labels, qualifiers }
// rankRule: { id, direction: "top" | "bottom", value, unit: "count" | "percent", metric }

// Plain operator names per field kind (all supported by the API).
export const OPERATORS = Object.freeze({
  enum: [{ value: "anyOf", label: "is any of" }, { value: "noneOf", label: "is none of" }],
  set: [{ value: "anyOf", label: "has any of" }, { value: "allOf", label: "has all of" }, { value: "noneOf", label: "has none of" }],
  number: [
    { value: "gte", label: "is at least" }, { value: "lte", label: "is at most" }, { value: "between", label: "is between" },
    { value: "eq", label: "is exactly" }, { value: "gt", label: "is more than" }, { value: "lt", label: "is less than" }, { value: "neq", label: "is not" },
  ],
  percent: [
    { value: "gte", label: "is at least" }, { value: "lte", label: "is at most" }, { value: "between", label: "is between" },
    { value: "eq", label: "is exactly" }, { value: "gt", label: "is more than" }, { value: "lt", label: "is less than" },
  ],
  text: [{ value: "contains", label: "contains" }, { value: "notContains", label: "does not contain" }, { value: "equals", label: "is exactly" }, { value: "startsWith", label: "starts with" }],
>>>>>>> Stashed changes
});

export const RANGE_PRESETS = Object.freeze([
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 6 months" },
  { value: "365d", label: "Last year" },
  { value: "all", label: "All time" },
]);

<<<<<<< Updated upstream
export const MAX_GROUPS = 6;
export const MAX_RANK_RULES = 6;
const LIST_OPERATORS = ["anyOf", "noneOf", "allOf"];

let sequence = 0;
export const nodeId = () => `n${Date.now().toString(36)}${(sequence += 1).toString(36)}`;
export const groupName = (index) => `Group ${String.fromCharCode(65 + index)}`;

=======
// Section groups nest two more levels: group > sub-group > sub-sub-group.
export const MAX_GROUP_DEPTH = 3;
export const MAX_RANK_RULES = 6;

let sequence = 0;
export const nodeId = () => `n${Date.now().toString(36)}${(sequence += 1).toString(36)}`;

const LIST_OPERATORS = ["anyOf", "noneOf", "allOf"];
>>>>>>> Stashed changes
export const operatorLabel = (field, operator) => (OPERATORS[field?.kind] || []).find((entry) => entry.value === operator)?.label || operator;

export function defaultValue(operator) {
  if (LIST_OPERATORS.includes(operator)) return [];
  if (operator === "between") return ["", ""];
  return "";
}

<<<<<<< Updated upstream
export const newGroup = (rules = []) => ({ id: nodeId(), rules });
export const newRankRule = (metric, direction = "top") => ({ id: nodeId(), direction, value: 10, unit: "count", metric });

export function defaultFilterState(area = "coding") {
  return { area, range: { preset: "all" }, groups: [newGroup()], rank: { join: "and", rules: [] } };
}

// ---------------------------------------------------------------- features and fields

/** The modules a feature covers: "all" is every licensed feature. */
=======
export function newRule(field = null) {
  const operator = field ? OPERATORS[field.kind]?.[0]?.value || "anyOf" : "";
  return { id: nodeId(), type: "rule", field: field?.key || "", operator, value: defaultValue(operator), labels: {}, qualifiers: {} };
}

export const newGroup = (join = "and", children = []) => ({ id: nodeId(), type: "group", join, negate: false, children });

export function newRankRule(metric, direction = "top") {
  return { id: nodeId(), direction, value: 10, unit: "count", metric };
}

export function defaultFilterState(area = "coding") {
  return { area, range: { preset: "all" }, feature: newGroup(), students: newGroup(), rank: { join: "and", rules: [] } };
}

// ---------------------------------------------------------------- areas and fields

/** The modules an area covers: "all" is every licensed feature. */
>>>>>>> Stashed changes
export const areaModules = (area, catalog) => (area === "all"
  ? (catalog?.areas || []).map((entry) => entry.key).filter((key) => key !== "all")
  : [area]);

<<<<<<< Updated upstream
/** The chosen feature's own fields (Quick Prep fields belong to Prep Coding). */
=======
/** Fields for section 1: the chosen feature's own fields (Quick Prep fields belong to Prep Coding). */
>>>>>>> Stashed changes
export function featureFields(catalog, area) {
  const modules = new Set(areaModules(area, catalog));
  return catalog.fields.filter((field) => field.module !== "student" && modules.has(field.module));
}

<<<<<<< Updated upstream
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
  { label: "Under 50", from: "", to: "49.99" },
  { label: "50–250", from: "50", to: "249.99" },
  { label: "250–1,000", from: "250", to: "999.99" },
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
=======
/** Fields for section 2: details of the student. */
export const studentFields = (catalog) => catalog.fields.filter((field) => field.module === "student");

/** Measures a top / bottom rule can rank by in an area. */
export const rankMetrics = (catalog, area) => featureFields(catalog, area).filter((field) => field.rankable);

// ---------------------------------------------------------------- tree editing (immutable)

/** A copy of `group` with `fn` applied to the node `id` (fn may return null to remove it). */
export function updateNode(group, id, fn) {
  if (group.id === id) return fn(group);
  let changed = false;
  const children = [];
  for (const child of group.children) {
    const next = child.id === id ? fn(child) : child.type === "group" ? updateNode(child, id, fn) : child;
    if (next !== child) changed = true;
    if (next) children.push(next);
  }
  return changed ? { ...group, children } : group;
}

export const removeNode = (group, id) => updateNode(group, id, () => null);
export const addChild = (group, parentId, node) => updateNode(group, parentId, (parent) => ({ ...parent, children: [...parent.children, node] }));

/** A deep copy with fresh ids (for "Duplicate"). */
export function cloneNode(node) {
  return node.type === "group"
    ? { ...node, id: nodeId(), children: node.children.map(cloneNode) }
    : { ...node, id: nodeId(), value: Array.isArray(node.value) ? [...node.value] : node.value, labels: { ...node.labels }, qualifiers: { ...node.qualifiers } };
}

export function duplicateNode(group, id) {
  const visit = (parent) => {
    const index = parent.children.findIndex((child) => child.id === id);
    if (index >= 0) {
      const children = [...parent.children];
      children.splice(index + 1, 0, cloneNode(children[index]));
      return { ...parent, children };
    }
    let changed = false;
    const children = parent.children.map((child) => {
      if (child.type !== "group") return child;
      const next = visit(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...parent, children } : parent;
  };
  return visit(group);
}

/** Removes rules whose field fails `keep`, and groups left empty. */
export function pruneTree(group, keep) {
  const children = group.children
    .map((child) => (child.type === "group" ? pruneTree(child, keep) : child))
    .filter((child) => (child.type === "group" ? child.children.length > 0 : keep(child)));
  return { ...group, children };
}

/** Rules in a tree, depth first. */
export const rulesOf = (group) => group.children.flatMap((child) => (child.type === "group" ? rulesOf(child) : [child]));

// ---------------------------------------------------------------- stored state

function cleanGroup(input, depth = 1) {
  if (!input || input.type !== "group" || depth > MAX_GROUP_DEPTH) return newGroup();
  return {
    id: input.id || nodeId(),
    type: "group",
    join: input.join === "or" ? "or" : "and",
    negate: input.negate === true,
    children: (Array.isArray(input.children) ? input.children : [])
      .map((child) => (child?.type === "group" ? (depth < MAX_GROUP_DEPTH ? cleanGroup(child, depth + 1) : null) : child?.field ? { labels: {}, qualifiers: {}, ...child, id: child.id || nodeId(), type: "rule" } : null))
      .filter(Boolean),
  };
}

/** Older or broken saved states are repaired (and older flat filter lists moved into the sections). */
export function normalizeState(stored, fallbackArea = "coding") {
  const base = defaultFilterState(fallbackArea);
  if (!stored || typeof stored !== "object") return base;
  const state = {
    area: typeof stored.area === "string" ? stored.area : base.area,
    range: stored.range?.preset ? stored.range : base.range,
    feature: cleanGroup(stored.feature),
    students: cleanGroup(stored.students),
    rank: {
      join: stored.rank?.join === "or" ? "or" : "and",
      rules: (Array.isArray(stored.rank?.rules) ? stored.rank.rules : []).filter((rule) => rule?.metric).slice(0, MAX_RANK_RULES)
        .map((rule) => ({ id: rule.id || nodeId(), direction: rule.direction === "bottom" ? "bottom" : "top", value: rule.value ?? 10, unit: rule.unit === "percent" ? "percent" : "count", metric: rule.metric })),
    },
  };
  // Version 3 kept one flat list of filters and one "Show" choice.
  if (Array.isArray(stored.filters)) {
    for (const filter of stored.filters.filter((entry) => entry?.field)) {
      const rule = { labels: {}, qualifiers: {}, ...filter, id: filter.id || nodeId(), type: "rule" };
      const target = filter.field.startsWith("student.") ? "students" : "feature";
      state[target] = { ...state[target], children: [...state[target].children, rule] };
    }
  }
  if (stored.ranking?.mode && stored.ranking.mode !== "everyone" && stored.ranking.metric && !state.rank.rules.length) {
    state.rank.rules = [{ id: nodeId(), direction: stored.ranking.mode === "bottom" ? "bottom" : "top", value: stored.ranking.value ?? 10, unit: stored.ranking.unit === "percent" ? "percent" : "count", metric: stored.ranking.metric }];
  }
  return state;
}

/** Changing the feature keeps student conditions and drops the old feature's conditions and rankings. */
export function switchArea(state, area, fieldMap, catalog) {
  const modules = new Set(areaModules(area, catalog));
  const keep = (rule) => modules.has(fieldMap.get(rule.field)?.module);
  return {
    ...state,
    area,
    feature: pruneTree(state.feature, (rule) => !rule.field || keep(rule)),
    rank: { ...state.rank, rules: state.rank.rules.filter((rule) => modules.has(fieldMap.get(rule.metric)?.module)) },
  };
}

// ---------------------------------------------------------------- completeness and request shape
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
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
=======
/** The API shape of a group, or null when it holds no finished condition. */
export function toRequestGroup(group, fieldMap) {
  if (!group) return null;
  const children = group.children.map((child) => {
    if (child.type === "group") return toRequestGroup(child, fieldMap);
    const field = fieldMap.get(child.field);
    if (!isRuleComplete(child, field)) return null;
    const qualifiers = field.qualifiers ? requestQualifiers(child.qualifiers) : undefined;
    return { type: "rule", field: child.field, operator: child.operator, value: requestValue(child, field), ...(qualifiers ? { qualifiers } : {}) };
  }).filter(Boolean);
  if (!children.length) return null;
  return { type: "group", join: group.join === "or" ? "or" : "and", ...(group.negate ? { negate: true } : {}), children };
}

/** Feature conditions AND student conditions. */
export function toRequestFilter(state, fieldMap) {
  const children = [toRequestGroup(state.feature, fieldMap), toRequestGroup(state.students, fieldMap)].filter(Boolean);
  return { type: "group", join: "and", children };
}

const isRankComplete = (rule) => Boolean(rule.metric) && Number(rule.value) > 0 && (rule.unit !== "percent" || Number(rule.value) <= 100) && (rule.unit === "percent" || Number.isInteger(Number(rule.value)));
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
export const countRules = (group, fieldMap) => completeRules(group, fieldMap).length;
export const countRankRules = (rank) => (rank?.rules || []).filter(isRankComplete).length;
export const countActive = (state, fieldMap) => state.groups.reduce((sum, group) => sum + countRules(group, fieldMap), 0) + countRankRules(state.rank);

// ---------------------------------------------------------------- in words

const UNIT_TEXT = { days: " days", min: " min", "/ 5": " of 5" };
=======
export const countConditions = (group, fieldMap) => (group ? rulesOf(group).filter((rule) => isRuleComplete(rule, fieldMap.get(rule.field))).length : 0);
export const countRankRules = (rank) => (rank?.rules || []).filter(isRankComplete).length;
export const countActive = (state, fieldMap) => countConditions(state.feature, fieldMap) + countConditions(state.students, fieldMap) + countRankRules(state.rank);

// ---------------------------------------------------------------- in words

const UNIT_TEXT = { days: " days", min: " min" };
>>>>>>> Stashed changes
const unitOf = (field) => (field.kind === "percent" ? "%" : UNIT_TEXT[field.unit] || "");

/** (field, value) → label from the catalog's fixed lists (status names, semesters, languages). */
export const optionLookup = (catalog) => (field, value) => catalog?.staticOptions?.[field.options]?.find((option) => String(option.value) === String(value))?.label;

<<<<<<< Updated upstream
/** "Semester 5" → "5" after "Semester"; "Stopped (no practice…)" → "Stopped". */
=======
/** "Semester 5" → "5" after "Semester is any of"; "Stopped (no practice…)" → "Stopped". */
>>>>>>> Stashed changes
export function compactOption(label, field) {
  let text = String(label ?? "").replace(/\s*\(.*\)\s*$/, "");
  const prefix = `${field?.label || ""} `;
  if (field && text.toLowerCase().startsWith(prefix.toLowerCase()) && text.length > prefix.length) text = text.slice(prefix.length);
  return text;
}

<<<<<<< Updated upstream
/** A filter in a few plain words: "Semester 5 or 6", "Prep Score 250 or more", "Branch not CSE". */
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
=======
/** The value of a rule in words: "5, 6", "50%", "20 and 60 days". */
export function valueWords(rule, field, lookup = () => undefined, { max = 3 } = {}) {
  if (!field || !isRuleComplete(rule, field)) return "";
  const unit = unitOf(field);
  if (rule.operator === "between") return `${rule.value[0]} and ${rule.value[1]}${unit}`;
  if (Array.isArray(rule.value)) {
    const names = rule.value.map((value) => compactOption(rule.labels?.[value] ?? lookup(field, value) ?? value, field));
    return names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", ");
  }
  if (field.kind === "text") return `“${String(rule.value).trim()}”`;
  return `${rule.value}${unit}`;
}

const onlyWords = (rule) => {
  const only = Object.values(rule.qualifiers || {}).flat().filter(Boolean);
  return only.length ? ` (counting only ${only.join(", ")})` : "";
};

/** "Prep Score is at least 50", or "" for an unfinished rule. */
export function ruleText(rule, fieldMap, lookup, options) {
  const field = fieldMap.get(rule.field);
  if (!isRuleComplete(rule, field)) return "";
  return `${field.label} ${operatorLabel(field, rule.operator)} ${valueWords(rule, field, lookup, options)}${onlyWords(rule)}`;
}

/** A whole group in words, with brackets for sub-groups: "A and (B or C)". */
export function groupText(group, fieldMap, lookup, options) {
  if (!group) return "";
  const parts = group.children.map((child) => {
    if (child.type === "rule") return ruleText(child, fieldMap, lookup, options);
    const inner = groupText(child, fieldMap, lookup, options);
    const count = child.children.filter((entry) => entry.type === "group" || isRuleComplete(entry, fieldMap.get(entry.field))).length;
    return inner && count > 1 ? `(${inner})` : inner;
  }).filter(Boolean);
  const text = parts.join(group.join === "or" ? " OR " : " AND ");
  return text && group.negate ? `NOT (${text})` : text;
}

export function rankRuleText(rule, metricLabel) {
  return `${rule.direction === "bottom" ? "Bottom" : "Top"} ${rule.value}${rule.unit === "percent" ? "%" : ""} by ${metricLabel(rule.metric)}`;
}

export function rankText(rank, metricLabel) {
  return (rank?.rules || []).filter(isRankComplete).map((rule) => rankRuleText(rule, metricLabel)).join(rank?.join === "or" ? " OR " : " AND ");
}

/** The whole filter in plain sentences, for the top of a downloaded file. */
export function summaryLines(state, fieldMap, metricLabel, lookup, areaLabel = "") {
  const lines = [];
  if (areaLabel) lines.push(`Analysing: ${areaLabel}`);
  const feature = groupText(state.feature, fieldMap, lookup, { max: 20 });
  const students = groupText(state.students, fieldMap, lookup, { max: 20 });
  const ranking = rankText(state.rank, metricLabel);
  if (feature) lines.push(`${areaLabel || "Feature"} filters: ${feature}`);
  if (students) lines.push(`Student filters: ${students}`);
  if (ranking) lines.push(`Top / bottom: ${ranking}`);
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  "assessment.passedStudents": { field: "assessment.passed", operator: "gte", value: "1" },
=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
const matches = (rule, wanted) => Boolean(rule) && rule.operator === wanted.operator && same(rule.value, wanted.value);

/** The filter behind a headline number, or null when it is not clickable. */
=======
const matches = (rule, wanted) => rule.type === "rule" && rule.field === wanted.field && rule.operator === wanted.operator && same(rule.value, wanted.value);

/** The condition behind a headline number, or null when it is not clickable. */
>>>>>>> Stashed changes
export function kpiRule(section, kpiId, fieldMap) {
  const rule = KPI_RULES[`${section}.${kpiId}`];
  return rule && (!fieldMap || fieldMap.has(rule.field)) ? rule : null;
}

<<<<<<< Updated upstream
export const isKpiActive = (rule, state) => Boolean(rule) && state.groups.every((group) => matches(ruleFor(group, rule.field), rule));

/** Sets the number's filter in every group, or removes it when it is already set. */
export function toggleKpi(rule, state) {
  const active = isKpiActive(rule, state);
  return {
    ...state,
    groups: state.groups.map((group) => setRule(group, rule.field, active ? null : { id: nodeId(), field: rule.field, operator: rule.operator, value: rule.value, labels: {}, qualifiers: {} })),
  };
=======
export const isKpiActive = (rule, state) => Boolean(rule) && state.feature.children.some((child) => matches(child, rule));

/** Adds the condition at the top of the feature section, or removes it when it is there. */
export function toggleKpi(rule, state) {
  if (isKpiActive(rule, state)) return { ...state, feature: { ...state.feature, children: state.feature.children.filter((child) => !matches(child, rule)) } };
  const condition = { ...newRule(), field: rule.field, operator: rule.operator, value: rule.value };
  const feature = state.feature.join === "and" || !state.feature.children.length
    ? { ...state.feature, children: [...state.feature.children, condition] }
    : newGroup("and", [state.feature, condition]);
  return { ...state, feature };
>>>>>>> Stashed changes
}
