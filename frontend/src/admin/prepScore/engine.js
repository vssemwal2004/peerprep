// Client copy of the Prep Score arithmetic for the Master Admin simulator, so values update as
// they are typed. backend/test/prepScoreEngineParity.test.js keeps it identical to
// backend/src/services/prepScore/engine.js; students never load this file.
export const LEVELS = ['Easy', 'Medium', 'Hard'];
export const MODULES = [
  { key: 'coding', label: 'Prep Coding', symbol: 'C' },
  { key: 'assessment', label: 'Prep Assessment', symbol: 'A' },
  { key: 'interview', label: 'Prep Interview', symbol: 'I' },
  { key: 'learning', label: 'Prep Learning', symbol: 'L' },
];

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
export const roundScore = (value, places) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function moduleScore(counts = {}, points = {}, formula = {}) {
  const volume = LEVELS.reduce((sum, level) => sum + count(counts[level]), 0);
  if (!volume) return 0;
  const averagePoints = LEVELS.reduce((sum, level) => sum + count(counts[level]) * count(points[level]), 0) / volume;
  return count(formula.scale) * (volume ** count(formula.volumeExponent)) * (averagePoints ** count(formula.qualityExponent));
}

/** { total, modules: { coding } }: the Prep Score is the Prep Coding score alone (2026-11). */
export function simulate(config, counts = {}) {
  const places = config.formula.decimalPlaces;
  const coding = roundScore(moduleScore(counts.coding, config.modules.coding.points, config.formula), places);
  return { total: coding, modules: { coding } };
}

/** The first problem with a config, phrased for the admin, or '' when it can be saved. */
const hasBlank = (value) => (typeof value === 'number' ? !Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).some(hasBlank) : false);

export function configProblem(config) {
  if (hasBlank(config)) return 'Fill in every value before saving.';
  const { points, dailyTopicLimit } = config.modules.coding;
  if (LEVELS.some((level) => !(Number(points[level]) > 0))) return 'Every difficulty needs points above 0.';
  if (!(points.Easy <= points.Medium && points.Medium <= points.Hard)) return 'Points must rise from Easy to Medium to Hard.';
  const limit = Number(dailyTopicLimit ?? 0);
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) return 'Daily solves per topic must be a whole number from 0 to 100.';
  return '';
}
