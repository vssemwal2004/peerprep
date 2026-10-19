// Pure Prep Score arithmetic. No database access, so the dashboard, rank store, admin analysis
// and the Master Admin simulator all produce identical numbers for identical work.
//
// Per module:  N = E + M + H,  Q = (e·E + m·M + h·H) / N,  Score = S · N^α · Q^β  (0 when N = 0)
// Overall:     Σ W·Score / Σ W over the modules the university licenses.
import { ACTIVITY_KEYS, DEFAULT_PREP_SCORE_CONFIG, LEVELS, MODULE_KEYS, normalizePrepScoreConfig } from './policy.js';

// Marked work counts only at or above the module's pass mark.
const GATED = new Set(['assessmentCompleted', 'mockCompleted']);

export function scoreFeatures(permissions) {
  const allowed = (key) => !permissions || permissions[key] === true;
  return {
    coding: allowed('questions'),
    learning: allowed('learning'),
    interview: allowed('events') || allowed('interviews'),
    assessment: allowed('assessments'),
    mock: allowed('events'),
    ai: allowed('interviews'),
  };
}

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const emptyCounts = () => ({ Easy: 0, Medium: 0, Hard: 0 });
export const roundScore = (value, places) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/** Normalises any difficulty label ('easy', 'MEDIUM', 'Hard') to a level, or null. */
export function toLevel(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return LEVELS.find((level) => level.toLowerCase() === key) || null;
}

/**
 * A test's level: the marks-weighted average of its questions' levels (Easy 0, Medium 1, Hard 2),
 * rounded. Questions without a difficulty are ignored; null when none has one.
 */
export function assessmentLevel(assessment = {}) {
  const sections = [...(assessment.sections || []), ...(assessment.questionSets || []).flatMap((set) => set.sections || [])];
  let weighted = 0;
  let marks = 0;
  for (const section of sections) {
    for (const question of section.questions || []) {
      const level = toLevel(question.difficulty) || (question.type === 'coding' || question.coding ? toLevel(question.coding?.difficulty) : null);
      if (!level) continue;
      const weight = count(question.marks ?? question.points ?? section.marksPerQuestion ?? 1) || 1;
      weighted += LEVELS.indexOf(level) * weight;
      marks += weight;
    }
  }
  return marks ? LEVELS[Math.round(weighted / marks)] : null;
}

/** An AI interview's level from its published definition (falls back to the working draft). */
export function aiInterviewLevel(interview = {}) {
  return toLevel(interview.publishedSnapshot?.data?.difficulty) || toLevel(interview.data?.difficulty);
}

function resolveLevel(item, activity, module) {
  if (activity.levelSource === 'fixed') return activity.level;
  return toLevel(item.level) || module.topicLevels?.[String(item.topicLevel ?? '').trim().toLowerCase()] || activity.level;
}

const activityAllowed = (activityKey, features) => {
  if (activityKey === 'mockCompleted') return features.mock !== false;
  if (activityKey === 'aiCompleted') return features.ai !== false;
  return true;
};

/**
 * evidence: { [activityKey]: [{ level?, topicLevel?, percent?, count? }] } from the progress loader.
 * Returns Easy/Medium/Hard counts per module after levels, gates, toggles and "counts as" units,
 * plus whether the student did any scoreable work at all (even work that earned nothing yet).
 */
export function levelCounts(evidence = {}, config = DEFAULT_PREP_SCORE_CONFIG, features = scoreFeatures(null)) {
  const counts = Object.fromEntries(MODULE_KEYS.map((key) => [key, emptyCounts()]));
  let attempted = false;
  for (const moduleKey of MODULE_KEYS) {
    if (!features[moduleKey]) continue;
    const module = config.modules[moduleKey];
    for (const activityKey of ACTIVITY_KEYS[moduleKey]) {
      if (!activityAllowed(activityKey, features)) continue;
      const items = Array.isArray(evidence[activityKey]) ? evidence[activityKey] : [];
      if (items.some((item) => count(item.count ?? 1) > 0)) attempted = true;
      const activity = module.activities[activityKey];
      if (!activity?.enabled) continue;
      for (const item of items) {
        if (GATED.has(activityKey) && !(Number.isFinite(Number(item.percent)) && item.percent !== null && Number(item.percent) >= module.passPercent)) continue;
        counts[moduleKey][resolveLevel(item, activity, module)] += count(item.count ?? 1) * count(activity.units);
      }
    }
  }
  return { counts, attempted };
}

export function calculateModule(counts = {}, points = DEFAULT_PREP_SCORE_CONFIG.modules.coding.points, formula = DEFAULT_PREP_SCORE_CONFIG.formula) {
  const values = Object.fromEntries(LEVELS.map((key) => [key, count(counts[key])]));
  const volume = LEVELS.reduce((sum, key) => sum + values[key], 0);
  if (!volume) return { score: 0, exact: 0, volume: 0, averagePoints: 0, counts: values };
  const averagePoints = LEVELS.reduce((sum, key) => sum + values[key] * points[key], 0) / volume;
  const exact = formula.scale * (volume ** formula.volumeExponent) * (averagePoints ** formula.qualityExponent);
  return {
    score: roundScore(exact, formula.decimalPlaces), exact, volume,
    averagePoints: roundScore(averagePoints, formula.decimalPlaces), counts: values,
  };
}

/** Score from per-module level counts (the simulator and admin previews start here). */
export function scoreFromLevelCounts(counts = {}, features = scoreFeatures(null), config = DEFAULT_PREP_SCORE_CONFIG) {
  const normalized = normalizePrepScoreConfig(config);
  const modules = {};
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const key of MODULE_KEYS) {
    if (!features[key]) continue;
    const module = normalized.modules[key];
    modules[key] = calculateModule(counts[key], module.points, normalized.formula);
    weightedTotal += modules[key].exact * module.weight;
    totalWeight += module.weight;
  }
  return { total: totalWeight ? roundScore(weightedTotal / totalWeight, normalized.formula.decimalPlaces) : 0, features: modules };
}

/** Internal score object. Student responses must expose only `total`, never modules or policy. */
export function prepScore(evidence = {}, features = scoreFeatures(null), policy = {}) {
  const config = normalizePrepScoreConfig(policy.config || DEFAULT_PREP_SCORE_CONFIG);
  const { counts, attempted } = levelCounts(evidence, config, features);
  return { ...scoreFromLevelCounts(counts, features, config), hasProgress: attempted, policyVersion: Number(policy.version) || null };
}
