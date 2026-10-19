// Validates and evaluates Prep Analysis filters.
//
// A filter is a tree of groups and rules:
//   group: { type: 'group', join: 'and' | 'or', negate?: boolean, children: [group | rule] }
//   rule:  { type: 'rule', field, operator, value, qualifiers? }
// Groups nest up to FILTER_LIMITS.maxDepth levels (filter > sub > sub-sub > sub-sub-sub).
//
// Rank cuts run after the tree, on the students it kept, so "Semester 5 AND
// top 10 by Prep Score" means the top 10 of semester 5:
//   rank: { join: 'and' | 'or', cuts: [{ metric, qualifiers?, direction: 'top' | 'bottom', unit: 'count' | 'percent', value }] }

import { SUPPORTED_LANGUAGES } from '../../models/Problem.js';
import { HttpError } from '../../utils/errors.js';
import { FIELDS, KIND_OPERATORS, QUALIFIER_SETS } from './fields.js';
import { DIFFICULTIES } from './ranking.js';

export const FILTER_LIMITS = Object.freeze({ maxDepth: 4, maxRules: 120, maxValues: 500, maxCuts: 6, maxText: 120 });

const lower = (value) => String(value ?? '').trim().toLowerCase();
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function cleanList(values, label) {
  if (!Array.isArray(values)) throw new HttpError(400, `${label} needs a list of values.`);
  const cleaned = [...new Set(values.map((value) => (typeof value === 'number' ? value : String(value ?? '').trim())).filter((value) => value !== ''))];
  if (!cleaned.length) throw new HttpError(400, `${label} needs at least one value.`);
  if (cleaned.length > FILTER_LIMITS.maxValues) throw new HttpError(400, `${label} accepts up to ${FILTER_LIMITS.maxValues} values.`);
  return cleaned;
}

function cleanNumber(value, label) {
  const number = Number(value);
  if (value === '' || value === null || !Number.isFinite(number)) throw new HttpError(400, `${label} needs a number.`);
  return number;
}

function normalizeQualifiers(field, qualifiers) {
  if (qualifiers == null) return undefined;
  if (!field.qualifiers) throw new HttpError(400, `${field.label} cannot be narrowed by topic, language or difficulty.`);
  if (!isPlainObject(qualifiers)) throw new HttpError(400, 'Qualifiers must be an object.');
  const allowed = QUALIFIER_SETS[field.qualifiers] || {};
  const result = {};
  for (const [key, values] of Object.entries(qualifiers)) {
    if (!allowed[key]) throw new HttpError(400, `Unknown qualifier: ${key}`);
    if (!Array.isArray(values) || !values.length) continue;
    const list = cleanList(values, `${field.label} ${allowed[key].label}`).map(String);
    if (key === 'difficulties' && list.some((value) => !DIFFICULTIES.includes(value))) throw new HttpError(400, 'Unknown difficulty.');
    if (key === 'languages' && list.some((value) => !SUPPORTED_LANGUAGES.includes(value))) throw new HttpError(400, 'Unknown language.');
    result[key] = list.sort();
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeValue(field, operator, value) {
  const label = field.label;
  switch (field.kind) {
    case 'enum':
      if (operator === 'is' || operator === 'isNot') {
        if (value === undefined || value === null || String(value).trim() === '') throw new HttpError(400, `${label} needs a value.`);
        return typeof value === 'number' ? value : String(value).trim();
      }
      return cleanList(value, label);
    case 'set':
      return cleanList(value, label).map(String);
    case 'text': {
      const text = String(value ?? '').trim();
      if (!text) throw new HttpError(400, `${label} needs some text.`);
      return text.slice(0, FILTER_LIMITS.maxText);
    }
    case 'number':
    case 'percent': {
      if (operator === 'between') {
        if (!Array.isArray(value) || value.length !== 2) throw new HttpError(400, `${label} "between" needs two numbers.`);
        const [low, high] = value.map((entry) => cleanNumber(entry, label));
        if (low > high) throw new HttpError(400, `${label} "between" needs the smaller number first.`);
        return [low, high];
      }
      return cleanNumber(value, label);
    }
    default:
      throw new HttpError(400, `Unsupported field type for ${label}.`);
  }
}

function resolveField(key, allowedModules) {
  const field = FIELDS.get(String(key || ''));
  if (!field) throw new HttpError(400, `Unknown filter field: ${key}`);
  if (!allowedModules.has(field.module)) throw new HttpError(403, `${field.label} belongs to a module that is not enabled.`);
  return field;
}

/** Validates a filter tree and returns a normalized copy. A missing tree is an empty AND group. */
export function normalizeFilterTree(input, { allowedModules, depth = 1, counter = { rules: 0 } } = {}) {
  if (input == null) return { type: 'group', join: 'and', negate: false, children: [] };
  if (!isPlainObject(input)) throw new HttpError(400, 'A filter group must be an object.');
  if (depth > FILTER_LIMITS.maxDepth) throw new HttpError(400, `Filters can nest up to ${FILTER_LIMITS.maxDepth} levels.`);
  const join = input.join === 'or' ? 'or' : input.join === 'and' || input.join === undefined ? 'and' : null;
  if (!join) throw new HttpError(400, 'A group joins its rules with "and" or "or".');
  const children = [];
  for (const child of Array.isArray(input.children) ? input.children : []) {
    if (child?.type === 'group') {
      const group = normalizeFilterTree(child, { allowedModules, depth: depth + 1, counter });
      if (group.children.length) children.push(group);
      continue;
    }
    counter.rules += 1;
    if (counter.rules > FILTER_LIMITS.maxRules) throw new HttpError(400, `A filter can hold up to ${FILTER_LIMITS.maxRules} rules.`);
    const field = resolveField(child?.field, allowedModules);
    const operator = String(child?.operator || '');
    if (!KIND_OPERATORS[field.kind].includes(operator)) throw new HttpError(400, `${field.label} does not support "${operator}".`);
    children.push({
      type: 'rule',
      field: field.key,
      operator,
      value: normalizeValue(field, operator, child.value),
      qualifiers: normalizeQualifiers(field, child.qualifiers),
    });
  }
  return { type: 'group', join, negate: input.negate === true, children };
}

/** Validates rank cuts (top/bottom N or N%). */
export function normalizeRankCuts(input, { allowedModules }) {
  if (input == null) return { join: 'and', cuts: [] };
  if (!isPlainObject(input)) throw new HttpError(400, 'Rank cuts must be an object.');
  const cuts = Array.isArray(input.cuts) ? input.cuts : [];
  if (cuts.length > FILTER_LIMITS.maxCuts) throw new HttpError(400, `Up to ${FILTER_LIMITS.maxCuts} rank cuts are allowed.`);
  return {
    join: input.join === 'or' ? 'or' : 'and',
    cuts: cuts.map((cut) => {
      const field = resolveField(cut?.metric, allowedModules);
      if (!field.rankable) throw new HttpError(400, `${field.label} cannot be ranked.`);
      const unit = cut.unit === 'percent' ? 'percent' : 'count';
      const value = cleanNumber(cut.value, `${field.label} rank cut`);
      if (unit === 'percent' && (value <= 0 || value > 100)) throw new HttpError(400, 'A percentage cut must be between 0 and 100.');
      if (unit === 'count' && (!Number.isInteger(value) || value < 1 || value > 100000)) throw new HttpError(400, 'A count cut must be a whole number of students.');
      return {
        metric: field.key,
        qualifiers: normalizeQualifiers(field, cut.qualifiers),
        direction: cut.direction === 'bottom' ? 'bottom' : 'top',
        unit,
        value,
      };
    }),
  };
}

const same = (left, right) => lower(left) === lower(right);

function evaluateRule(rule, row) {
  const field = FIELDS.get(rule.field);
  const actual = field.get(row, rule.qualifiers);
  const { operator, value } = rule;
  switch (field.kind) {
    case 'enum':
      if (operator === 'is') return same(actual, value);
      if (operator === 'isNot') return !same(actual, value);
      if (operator === 'anyOf') return value.some((entry) => same(actual, entry));
      return !value.some((entry) => same(actual, entry));
    case 'set': {
      const have = new Set((actual || []).map(lower));
      if (operator === 'anyOf') return value.some((entry) => have.has(lower(entry)));
      if (operator === 'allOf') return value.every((entry) => have.has(lower(entry)));
      return !value.some((entry) => have.has(lower(entry)));
    }
    case 'text': {
      const text = lower(actual);
      const needle = lower(value);
      if (operator === 'contains') return text.includes(needle);
      if (operator === 'notContains') return !text.includes(needle);
      if (operator === 'equals') return text === needle;
      return text.startsWith(needle);
    }
    default: {
      // Students with no value (e.g. never submitted) only match "is not equal to".
      if (actual === null || actual === undefined || !Number.isFinite(Number(actual))) return operator === 'neq';
      const number = Number(actual);
      switch (operator) {
        case 'eq': return number === value;
        case 'neq': return number !== value;
        case 'gt': return number > value;
        case 'gte': return number >= value;
        case 'lt': return number < value;
        case 'lte': return number <= value;
        default: return number >= value[0] && number <= value[1];
      }
    }
  }
}

/** True when the row passes the (normalized) tree. An empty group passes everyone. */
export function evaluateFilterTree(node, row) {
  if (node.type === 'rule') return evaluateRule(node, row);
  if (!node.children.length) return !node.negate;
  const result = node.join === 'or'
    ? node.children.some((child) => evaluateFilterTree(child, row))
    : node.children.every((child) => evaluateFilterTree(child, row));
  return node.negate ? !result : result;
}

/** Keeps the rows selected by the rank cuts, ordered by the first cut. */
export function applyRankCuts(rows, rank) {
  if (!rank?.cuts?.length || !rows.length) return rows;
  const selections = rank.cuts.map((cut) => {
    const field = FIELDS.get(cut.metric);
    const valueOf = (row) => Number(field.get(row, cut.qualifiers)) || 0;
    const sign = cut.direction === 'top' ? -1 : 1;
    const ordered = [...rows].sort((left, right) => (
      sign * (valueOf(left) - valueOf(right))
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id)
    ));
    const size = cut.unit === 'percent' ? Math.ceil((rows.length * cut.value) / 100) : cut.value;
    return ordered.slice(0, Math.min(rows.length, size));
  });
  const sets = selections.map((selection) => new Set(selection));
  const keep = rank.join === 'or'
    ? (row) => sets.some((set) => set.has(row))
    : (row) => sets.every((set) => set.has(row));
  const firstOrder = selections[0];
  const rest = rows.filter((row) => keep(row) && !sets[0].has(row));
  return [...firstOrder.filter(keep), ...rest];
}

/** Modules a normalized tree or cut list touches (used to enforce licensing). */
export function modulesUsed(tree, rank) {
  const used = new Set();
  const visit = (node) => {
    if (node.type === 'rule') used.add(FIELDS.get(node.field).module);
    else node.children.forEach(visit);
  };
  if (tree) visit(tree);
  (rank?.cuts || []).forEach((cut) => used.add(FIELDS.get(cut.metric).module));
  return used;
}
