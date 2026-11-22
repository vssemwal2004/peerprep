// Prep Readiness scoring: pure functions, no database. Everything here is deterministic so the
// same evidence and policy always give the same numbers (tests: backend/test/prepReadinessEngine.test.js).
//
// For each canonical topic t and track (SBC, PBC):
//   topic points        = E·mE + M·mM + H·mH          (track multipliers)
//   topic progress      = min(1, points / target_t)
//   topic contribution  = 100 · weight_t · progress / Σ active weights
//   track readiness     = Σ contributions             (0–100)
// Zero-weight topics are excluded from the track and its denominator. Values are never rounded
// before a cutoff decision; displayScore() shows "<75" when a value just below the cutoff would
// round up to it.
import { CATEGORIES, SEED_TOPICS, TOPIC_ALIASES, TRACK_KEYS, TRACKS } from './seed.js';

export const DIFFICULTIES = Object.freeze(['Easy', 'Medium', 'Hard']);

/** Lower-case, "&" → "and", every run of punctuation/space → one space. */
export function normaliseTag(raw) {
  return String(raw ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * The canonical key of a problem across catalogues: 'lc:<LeetCode number>' when the problem carries
 * one (local and shared copies merge), else '<source>:<id>'.
 */
export function canonicalProblemKey({ source, id, sourceNumber }) {
  const number = Number(sourceNumber);
  if (Number.isInteger(number) && number > 0) return `lc:${number}`;
  return `${source}:${id}`;
}

export function normaliseDifficulty(value) {
  const text = String(value || '').toLowerCase();
  if (text.startsWith('h')) return 'Hard';
  if (text.startsWith('m')) return 'Medium';
  if (text.startsWith('e')) return 'Easy';
  return null;
}

/** The default policy (version 1) built from the seed. */
export function defaultPolicy() {
  return {
    version: 1,
    topics: SEED_TOPICS.map((topic) => ({ key: topic.key, label: topic.label, category: topic.category, pbc: { ...topic.pbc }, sbc: { ...topic.sbc } })),
    tracks: Object.fromEntries(TRACK_KEYS.map((key) => [key, { cutoff: TRACKS[key].cutoff, multipliers: { ...TRACKS[key].multipliers } }])),
  };
}

// ---------------------------------------------------------------------------------------------
// Topic recognition and primary-topic attribution

const SEED_ORDER = new Map(SEED_TOPICS.map((topic, index) => [topic.key, index]));
const SEED_CATEGORY = new Map(SEED_TOPICS.map((topic) => [topic.key, topic.category]));
/**
 * Primary topic rule for a problem without a publisher-approved primary: the most specific
 * recognised tag wins. Category order (most specific first), then the fixed seed order as the
 * stable tie-breaker. It depends only on the canonical keys, never on live weights or catalogue
 * counts, so a policy change cannot silently move old evidence to another topic.
 */
export const PRIMARY_CATEGORY_ORDER = Object.freeze(['high-signal', 'patterns', 'mid-tier', 'advanced', 'core']);

/** Map(normalised name → canonical key) for the policy's topics and the aliases. */
export function topicIndex(policy = defaultPolicy()) {
  const index = new Map();
  for (const [alias, key] of Object.entries(TOPIC_ALIASES)) index.set(normaliseTag(alias), key);
  for (const topic of policy.topics) {
    index.set(normaliseTag(topic.key), topic.key);
    index.set(normaliseTag(topic.label), topic.key);
  }
  return index;
}

export function canonicalTopic(raw, index = topicIndex()) {
  return index.get(normaliseTag(raw)) || null;
}

/** { keys: unique canonical keys in input order, unmapped: raw tags that matched nothing } */
export function canonicalTags(tags = [], index = topicIndex()) {
  const keys = [];
  const unmapped = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!String(tag ?? '').trim()) continue;
    const key = canonicalTopic(tag, index);
    if (key) { if (!keys.includes(key)) keys.push(key); } else if (!unmapped.includes(String(tag).trim())) unmapped.push(String(tag).trim());
  }
  return { keys, unmapped };
}

const specificity = (key) => {
  const rank = PRIMARY_CATEGORY_ORDER.indexOf(SEED_CATEGORY.get(key));
  return rank === -1 ? PRIMARY_CATEGORY_ORDER.length : rank;
};

/**
 * The one readiness topic a problem counts toward.
 * { primary?: publisher-approved topic, tags: raw tags } → { topic, source: 'publisher' | 'rule' | null, unmapped }
 */
export function primaryTopic({ primary = null, tags = [] } = {}, index = topicIndex()) {
  const { keys, unmapped } = canonicalTags(tags, index);
  const approved = primary ? canonicalTopic(primary, index) : null;
  if (approved) return { topic: approved, source: 'publisher', keys, unmapped };
  if (!keys.length) return { topic: null, source: null, keys, unmapped };
  const [best] = [...keys].sort((a, b) => specificity(a) - specificity(b) || (SEED_ORDER.get(a) ?? 1e6) - (SEED_ORDER.get(b) ?? 1e6) || a.localeCompare(b));
  return { topic: best, source: 'rule', keys, unmapped };
}

// ---------------------------------------------------------------------------------------------
// Policy validation

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** { ok, errors: [{ topic?, track?, field, message }], totals } */
export function validatePolicy(policy) {
  const errors = [];
  const seen = new Set();
  const known = new Set(SEED_TOPICS.map((topic) => topic.key));
  for (const topic of policy?.topics || []) {
    if (!topic?.key || !known.has(topic.key)) errors.push({ topic: topic?.key, field: 'key', message: `Unknown topic "${topic?.key}"` });
    if (seen.has(topic?.key)) errors.push({ topic: topic.key, field: 'key', message: `Duplicate topic "${topic.key}"` });
    seen.add(topic?.key);
    for (const track of TRACK_KEYS) {
      const row = topic?.[track] || {};
      for (const field of ['weight', 'target', 'priority']) {
        if (!finite(row[field])) errors.push({ topic: topic?.key, track, field, message: `${field} must be a number` });
        else if (row[field] < 0) errors.push({ topic: topic?.key, track, field, message: `${field} cannot be negative` });
      }
      if (finite(row.weight) && row.weight > 0) {
        if (!(finite(row.target) && row.target > 0)) errors.push({ topic: topic?.key, track, field: 'target', message: 'A topic with weight needs a target above 0' });
        if (!(Number.isInteger(row.priority) && row.priority >= 1 && row.priority <= 5)) errors.push({ topic: topic?.key, track, field: 'priority', message: 'Priority must be a whole number from 1 to 5' });
      }
    }
  }
  for (const key of known) if (!seen.has(key)) errors.push({ topic: key, field: 'key', message: `Missing topic "${key}"` });
  const totals = policyTotals(policy);
  for (const track of TRACK_KEYS) {
    if (!(totals[track].weight > 0)) errors.push({ track, field: 'weight', message: `${TRACKS[track].short} needs at least one topic with weight` });
    const multipliers = policy?.tracks?.[track]?.multipliers || {};
    for (const level of DIFFICULTIES) if (!(finite(multipliers[level]) && multipliers[level] >= 0)) errors.push({ track, field: 'multipliers', message: `${TRACKS[track].short} ${level} multiplier is invalid` });
    if (!finite(policy?.tracks?.[track]?.cutoff)) errors.push({ track, field: 'cutoff', message: `${TRACKS[track].short} cutoff is invalid` });
  }
  return { ok: errors.length === 0, errors, totals };
}

/** Σ weight and Σ target over the active (weight > 0) topics of each track. */
export function policyTotals(policy) {
  return Object.fromEntries(TRACK_KEYS.map((track) => {
    let weight = 0; let target = 0; let active = 0;
    for (const topic of policy?.topics || []) {
      const row = topic?.[track];
      if (row && finite(row.weight) && row.weight > 0) { weight += row.weight; target += Number(row.target) || 0; active += 1; }
    }
    return [track, { weight, target, active }];
  }));
}

// ---------------------------------------------------------------------------------------------
// Scoring

const emptyCounts = () => ({ Easy: 0, Medium: 0, Hard: 0 });

/** Topic counts from evidence rows [{ topic, difficulty }] → Map(topic → { Easy, Medium, Hard }). */
export function countsFromEvidence(evidence = []) {
  const counts = new Map();
  for (const row of evidence) {
    const level = normaliseDifficulty(row?.difficulty);
    if (!row?.topic || !level) continue;
    const entry = counts.get(row.topic) || emptyCounts();
    entry[level] += 1;
    counts.set(row.topic, entry);
  }
  return counts;
}

export function topicPoints(counts, multipliers) {
  const entry = counts || emptyCounts();
  return (entry.Easy || 0) * multipliers.Easy + (entry.Medium || 0) * multipliers.Medium + (entry.Hard || 0) * multipliers.Hard;
}

/**
 * One track. counts: Map(topic → {Easy, Medium, Hard}).
 * → { track, score, cutoff, met, totalWeight, evidence, topics: [{ key, label, category, weight, target,
 *     priority, excluded, counts, points, progress, contribution, maxContribution, complete }] }
 */
export function scoreTrack(policy, track, counts = new Map()) {
  const settings = policy.tracks[track];
  const totals = policyTotals(policy)[track];
  const topics = policy.topics.map((topic) => {
    const row = topic[track];
    const entry = counts.get(topic.key) || emptyCounts();
    const excluded = !(row.weight > 0);
    const points = topicPoints(entry, settings.multipliers);
    const progress = excluded ? 0 : Math.min(1, points / row.target);
    const contribution = excluded || !totals.weight ? 0 : (100 * row.weight * progress) / totals.weight;
    const maxContribution = excluded || !totals.weight ? 0 : (100 * row.weight) / totals.weight;
    return {
      key: topic.key, label: topic.label, category: topic.category, weight: row.weight, target: row.target, priority: row.priority,
      excluded, counts: { ...entry }, points, progress, contribution, maxContribution, complete: !excluded && progress >= 1,
    };
  });
  const score = topics.reduce((sum, topic) => sum + topic.contribution, 0);
  const evidence = [...counts.values()].reduce((sum, entry) => sum + (entry.Easy || 0) + (entry.Medium || 0) + (entry.Hard || 0), 0);
  return { track, score, cutoff: settings.cutoff, met: score >= settings.cutoff, totalWeight: totals.weight, evidence, topics };
}

export function scoreReadiness(policy, counts) {
  return Object.fromEntries(TRACK_KEYS.map((track) => [track, scoreTrack(policy, track, counts)]));
}

/** What one more solve of `difficulty` in `topic` would add to the track score (0 when capped/excluded). */
export function marginalGain(policy, track, counts, topic, difficulty) {
  const row = policy.topics.find((entry) => entry.key === topic)?.[track];
  const level = normaliseDifficulty(difficulty);
  const totals = policyTotals(policy)[track];
  if (!row || !(row.weight > 0) || !level || !totals.weight) return 0;
  const multipliers = policy.tracks[track].multipliers;
  const before = topicPoints(counts.get(topic), multipliers);
  const after = before + multipliers[level];
  return (100 * row.weight * (Math.min(1, after / row.target) - Math.min(1, before / row.target))) / totals.weight;
}

/**
 * Display text for a score: one decimal, but never shows the cutoff (or more) for a value below
 * it — 74.96 against 75 reads "<75".
 */
export function displayScore(score, cutoff, decimals = 1) {
  if (!Number.isFinite(score)) return '—';
  const factor = 10 ** decimals;
  const rounded = Math.round(score * factor) / factor;
  if (score < cutoff && rounded >= cutoff) return `<${cutoff}`;
  return rounded.toFixed(decimals);
}

export const categoryLabel = (key) => CATEGORIES.find((category) => category.key === key)?.label || key;
