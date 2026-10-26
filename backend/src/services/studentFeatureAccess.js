export const STUDENT_FEATURES = Object.freeze([
  'dashboard',
  'quickprep',
  'analysis',
  'rankings',
  'interviews',
  'ai_interviews',
  'assessments',
  'learning',
  'prep_coding',
  'resume',
  'prep_coins',
]);

export const STUDENT_FEATURE_SET = new Set(STUDENT_FEATURES);

export function normalizeStudentFeatures(features) {
  if (!Array.isArray(features)) return [];
  return [...new Set(features.map((value) => String(value || '').trim()).filter((value) => STUDENT_FEATURE_SET.has(value)))];
}

export function normalizeStudentFeatureAccess(value, { legacyAccessScope = 'full' } = {}) {
  if (legacyAccessScope === 'assessment_only') {
    return { mode: 'custom', features: ['assessments'] };
  }
  if (!value || value.mode !== 'custom') {
    return { mode: 'all', features: [...STUDENT_FEATURES] };
  }
  return { mode: 'custom', features: normalizeStudentFeatures(value.features) };
}

export function studentHasFeature(user, feature) {
  if (!user || user.role !== 'student') return true;
  if (!STUDENT_FEATURE_SET.has(feature)) return false;
  return normalizeStudentFeatureAccess(user.featureAccess, { legacyAccessScope: user.accessScope }).features.includes(feature);
}

export function studentFeatureQuery(feature) {
  if (!STUDENT_FEATURE_SET.has(feature)) return { _id: null };
  return { $or: [{ 'featureAccess.mode': { $ne: 'custom' } }, { 'featureAccess.features': feature }] };
}

export function parseStudentFeatureAccess(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = { mode: 'custom', features: value.split(',') }; }
  }
  if (Array.isArray(parsed)) parsed = { mode: 'custom', features: parsed };
  return normalizeStudentFeatureAccess(parsed);
}
