import PrepScorePolicy from '../../models/PrepScorePolicy.js';
import { HttpError } from '../../utils/errors.js';

// Policy rows created before configurable per-module points start after this version.
export const PREP_SCORE_POLICY_VERSION = 5;
export const MODULE_KEYS = Object.freeze(['coding', 'assessment', 'interview', 'learning']);
export const LEVELS = Object.freeze(['Easy', 'Medium', 'Hard']);
export const TOPIC_LEVELS = Object.freeze(['easy', 'easy-medium', 'medium', 'medium-hard', 'hard']);
export const ACTIVITY_KEYS = Object.freeze({
  coding: Object.freeze(['problemSolved']),
  assessment: Object.freeze(['assessmentCompleted']),
  interview: Object.freeze(['mockCompleted', 'aiCompleted']),
  learning: Object.freeze(['videoCompleted']),
});
// Mock interviews carry no difficulty of their own, so they always use the configured level.
const FIXED_LEVEL_ONLY = new Set(['mockCompleted']);

const points = () => ({ Easy: 1, Medium: 2, Hard: 4 });
const activity = (levelSource = 'content') => ({ enabled: true, units: 1, levelSource, level: 'Medium' });

export const DEFAULT_PREP_SCORE_CONFIG = deepFreeze({
  formula: { volumeExponent: 0.4, qualityExponent: 1.5, scale: 1, decimalPlaces: 2 },
  modules: {
    coding: { weight: 1, points: points(), activities: { problemSolved: activity() } },
    assessment: { weight: 1, points: points(), passPercent: 40, activities: { assessmentCompleted: activity() } },
    interview: { weight: 1, points: points(), passPercent: 40, activities: { mockCompleted: activity('fixed'), aiCompleted: activity() } },
    learning: {
      weight: 1, points: points(), completionPercent: 100,
      topicLevels: { easy: 'Easy', 'easy-medium': 'Easy', medium: 'Medium', 'medium-hard': 'Hard', hard: 'Hard' },
      activities: { videoCompleted: activity() },
    },
  },
});

function deepFreeze(value) {
  Object.values(value).forEach((child) => { if (child && typeof child === 'object') deepFreeze(child); });
  return Object.freeze(value);
}

const clone = (value) => structuredClone(value);
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const finite = (value, name, { min = 0, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, `${name} must be between ${min} and ${max}.`);
  return number;
};
const level = (value, name) => {
  if (!LEVELS.includes(value)) throw new HttpError(400, `${name} must be Easy, Medium or Hard.`);
  return value;
};

/** Policies saved before v5 had one set of points and a per-activity difficulty source. */
function upgradeLegacyConfig(input) {
  if (input.modules || !(input.difficultyWeights || input.moduleWeights || input.activities)) return input;
  const modules = {};
  MODULE_KEYS.forEach((key) => {
    const activities = {};
    ACTIVITY_KEYS[key].forEach((activityKey) => {
      const legacy = object(input.activities?.[key]?.[activityKey]);
      activities[activityKey] = { enabled: legacy.enabled, units: legacy.units, level: legacy.defaultDifficulty };
    });
    modules[key] = { weight: input.moduleWeights?.[key], points: input.difficultyWeights, activities };
  });
  const completion = input.activities?.learning?.videoCompleted?.completionPercent;
  if (completion !== undefined) modules.learning.completionPercent = completion;
  return { formula: input.formula, modules };
}

function normalizeActivity(value, fallback, name, activityKey) {
  const input = object(value);
  const source = FIXED_LEVEL_ONLY.has(activityKey) ? 'fixed' : (input.levelSource || fallback.levelSource);
  if (!['content', 'fixed'].includes(source)) throw new HttpError(400, `${name} has an invalid level source.`);
  return {
    enabled: input.enabled !== false,
    units: finite(input.units ?? fallback.units, `${name} counts as`, { min: 0, max: 100 }),
    levelSource: source,
    level: level(input.level || fallback.level, `${name} level`),
  };
}

function normalizeModule(key, value) {
  const input = object(value);
  const defaults = DEFAULT_PREP_SCORE_CONFIG.modules[key];
  const label = key[0].toUpperCase() + key.slice(1);
  const result = {
    weight: finite(input.weight ?? defaults.weight, `${label} weight`, { min: 0, max: 100 }),
    points: {},
    activities: {},
  };
  LEVELS.forEach((difficulty) => {
    result.points[difficulty] = finite(object(input.points)[difficulty] ?? defaults.points[difficulty], `${label} ${difficulty} points`, { min: 0.01, max: 1000 });
  });
  if (!(result.points.Easy <= result.points.Medium && result.points.Medium <= result.points.Hard)) {
    throw new HttpError(400, `${label} points must be ordered Easy ≤ Medium ≤ Hard.`);
  }
  ACTIVITY_KEYS[key].forEach((activityKey) => {
    result.activities[activityKey] = normalizeActivity(object(input.activities)[activityKey], defaults.activities[activityKey], `${label} ${activityKey}`, activityKey);
  });
  if (defaults.passPercent !== undefined) result.passPercent = finite(input.passPercent ?? defaults.passPercent, `${label} pass mark`, { min: 0, max: 100 });
  if (defaults.completionPercent !== undefined) result.completionPercent = finite(input.completionPercent ?? defaults.completionPercent, 'Video completion percentage', { min: 1, max: 100 });
  if (defaults.topicLevels) {
    result.topicLevels = {};
    TOPIC_LEVELS.forEach((topicLevel) => {
      result.topicLevels[topicLevel] = level(object(input.topicLevels)[topicLevel] || defaults.topicLevels[topicLevel], `Topic level ${topicLevel}`);
    });
  }
  return result;
}

export function normalizePrepScoreConfig(value = {}) {
  const input = upgradeLegacyConfig(object(value));
  const formula = object(input.formula);
  const defaults = DEFAULT_PREP_SCORE_CONFIG.formula;
  const normalized = {
    formula: {
      volumeExponent: finite(formula.volumeExponent ?? defaults.volumeExponent, 'Volume exponent (α)', { min: 0.01, max: 10 }),
      qualityExponent: finite(formula.qualityExponent ?? defaults.qualityExponent, 'Difficulty exponent (β)', { min: 0.01, max: 10 }),
      scale: finite(formula.scale ?? defaults.scale, 'Scale (S)', { min: 0.0001, max: 10000 }),
      decimalPlaces: Math.trunc(finite(formula.decimalPlaces ?? defaults.decimalPlaces, 'Decimal places', { min: 0, max: 4 })),
    },
    modules: {},
  };
  MODULE_KEYS.forEach((key) => { normalized.modules[key] = normalizeModule(key, object(input.modules)[key]); });
  if (!MODULE_KEYS.some((key) => normalized.modules[key].weight > 0)) throw new HttpError(400, 'At least one module weight must be greater than zero.');
  return normalized;
}

/** Watched share of a video needed before a topic counts as complete. */
export function videoCompletionPercent(policy) {
  return Number(policy?.config?.modules?.learning?.completionPercent) || DEFAULT_PREP_SCORE_CONFIG.modules.learning.completionPercent;
}

const CACHE_MS = 30_000;
let cached = null;
let cachedAt = 0;
const versions = new Map();

export function clearPrepScorePolicyCache() { cached = null; cachedAt = 0; versions.clear(); }

const defaultPolicy = () => ({ version: PREP_SCORE_POLICY_VERSION, config: clone(DEFAULT_PREP_SCORE_CONFIG), publishedAt: null });

export async function getActivePrepScorePolicy({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return clone(cached);
  const row = await PrepScorePolicy.findOne({ status: 'active' }).sort({ version: -1 }).lean();
  cached = row
    ? { version: row.version, config: normalizePrepScoreConfig(row.config), publishedAt: row.publishedAt || row.updatedAt }
    : defaultPolicy();
  cachedAt = Date.now();
  return clone(cached);
}

/** A published (active or archived) policy by version; scores stay on it until a rebuild finishes. */
export async function getPrepScorePolicyVersion(version) {
  const wanted = Number(version);
  const active = await getActivePrepScorePolicy();
  if (!wanted || wanted === active.version) return active;
  if (wanted === PREP_SCORE_POLICY_VERSION) return defaultPolicy();
  if (versions.has(wanted)) return clone(versions.get(wanted));
  const row = await PrepScorePolicy.findOne({ version: wanted, status: { $in: ['active', 'archived'] } }).lean();
  if (!row) return active;
  const policy = { version: row.version, config: normalizePrepScoreConfig(row.config), publishedAt: row.publishedAt || row.updatedAt };
  versions.set(wanted, policy);
  return clone(policy);
}

export async function getPrepScorePolicyWorkspace() {
  const [active, draft, history] = await Promise.all([
    getActivePrepScorePolicy({ fresh: true }),
    PrepScorePolicy.findOne({ status: 'draft' }).sort({ version: -1 }).lean(),
    PrepScorePolicy.find({ status: { $in: ['active', 'archived'] } }).sort({ version: -1 }).limit(20).lean(),
  ]);
  return {
    active,
    draft: draft ? { version: draft.version, config: normalizePrepScoreConfig(draft.config), changeReason: draft.changeReason, updatedAt: draft.updatedAt } : null,
    history: history.map((row) => ({ version: row.version, status: row.status, changeReason: row.changeReason, publishedAt: row.publishedAt, createdAt: row.createdAt })),
    defaults: clone(DEFAULT_PREP_SCORE_CONFIG),
  };
}

export async function savePrepScorePolicyDraft(config, actorId, changeReason = '') {
  const normalized = normalizePrepScoreConfig(config);
  const existing = await PrepScorePolicy.findOne({ status: 'draft' }).sort({ version: -1 });
  const highest = await PrepScorePolicy.findOne().sort({ version: -1 }).select('version').lean();
  const version = existing?.version || Math.max(PREP_SCORE_POLICY_VERSION + 1, Number(highest?.version || 0) + 1);
  const row = existing || new PrepScorePolicy({ version, status: 'draft', createdBy: actorId });
  row.config = normalized;
  row.changeReason = String(changeReason || '').trim();
  await row.save();
  return { version: row.version, config: normalized, changeReason: row.changeReason, updatedAt: row.updatedAt };
}

/** Copies a published version into the draft so it can be reviewed and published again. */
export async function restorePrepScorePolicyAsDraft(version, actorId) {
  const source = await PrepScorePolicy.findOne({ version: Number(version), status: { $in: ['active', 'archived'] } }).lean();
  if (!source) throw new HttpError(404, 'That policy version does not exist.');
  return savePrepScorePolicyDraft(source.config, actorId, `Restored from version ${source.version}`);
}

export async function publishPrepScorePolicy(actorId, changeReason) {
  const reason = String(changeReason || '').trim();
  if (reason.length < 5) throw new HttpError(400, 'Enter a publication reason of at least 5 characters.');
  const draft = await PrepScorePolicy.findOne({ status: 'draft' }).sort({ version: -1 });
  if (!draft) throw new HttpError(409, 'Create and save a draft before publishing.');
  draft.config = normalizePrepScoreConfig(draft.config);
  await PrepScorePolicy.updateMany({ status: 'active' }, { $set: { status: 'archived' } });
  draft.status = 'active';
  draft.changeReason = reason;
  draft.publishedBy = actorId;
  draft.publishedAt = new Date();
  await draft.save();
  clearPrepScorePolicyCache();
  return getActivePrepScorePolicy({ fresh: true });
}
