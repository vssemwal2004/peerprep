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
  'peers',
  'prep_mock',
  'resume_jd_match',
]);

export const STUDENT_FEATURE_SET = new Set(STUDENT_FEATURES);

/**
 * Features a student has only when an admin turns them on for that student (or in the default for
 * new students). "All access" never includes them. Prep Mates: universities decide who may find
 * and contact classmates, so it is never on for everyone by default. Prep Mock: company mock tests
 * are given to the students an admin chooses. Resume JD Match: a paid Gemini check (Prep Coins),
 * rolled out to chosen students first; it also needs Prep Resume.
 */
export const OPT_IN_STUDENT_FEATURES = Object.freeze(['peers', 'prep_mock', 'resume_jd_match']);
/** Features that only work together with another one (the student needs both). */
export const STUDENT_FEATURE_REQUIRES = Object.freeze({ resume_jd_match: 'resume' });
const OPT_IN_SET = new Set(OPT_IN_STUDENT_FEATURES);
/** What "All access" means: every feature except the opt-in ones. */
export const STANDARD_STUDENT_FEATURES = Object.freeze(STUDENT_FEATURES.filter((feature) => !OPT_IN_SET.has(feature)));

export function normalizeStudentFeatures(features) {
  if (!Array.isArray(features)) return [];
  return [...new Set(features.map((value) => String(value || '').trim()).filter((value) => STUDENT_FEATURE_SET.has(value)))];
}

export function normalizeStudentFeatureAccess(value, { legacyAccessScope = 'full' } = {}) {
  if (legacyAccessScope === 'assessment_only') {
    return { mode: 'custom', features: ['assessments'] };
  }
  if (!value || value.mode !== 'custom') {
    return { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] };
  }
  return { mode: 'custom', features: normalizeStudentFeatures(value.features) };
}

/**
 * One bulk change applied to a student's current access (normalized):
 *   { type: 'set', access }        replace it
 *   { type: 'grant', features }    turn these on, keep everything else
 *   { type: 'revoke', features }   turn these off, keep everything else
 * Returns the new access; exactly the standard features is stored as "All access" again.
 */
export function applyStudentFeatureChange(current, change) {
  if (change.type === 'set') return normalizeStudentFeatureAccess(change.access);
  const next = new Set(current.features);
  for (const feature of normalizeStudentFeatures(change.features)) {
    if (change.type === 'grant') next.add(feature); else next.delete(feature);
  }
  const features = STUDENT_FEATURES.filter((feature) => next.has(feature));
  const isStandard = features.length === STANDARD_STUDENT_FEATURES.length && STANDARD_STUDENT_FEATURES.every((feature) => next.has(feature));
  return isStandard ? { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] } : { mode: 'custom', features };
}

export function studentHasFeature(user, feature) {
  if (!user || user.role !== 'student') return true;
  if (!STUDENT_FEATURE_SET.has(feature)) return false;
  const features = normalizeStudentFeatureAccess(user.featureAccess, { legacyAccessScope: user.accessScope }).features;
  const needs = STUDENT_FEATURE_REQUIRES[feature];
  return features.includes(feature) && (!needs || features.includes(needs));
}

export function studentFeatureQuery(feature) {
  if (!STUDENT_FEATURE_SET.has(feature)) return { _id: null };
  // An opt-in feature needs an explicit grant; "All access" does not include it.
  if (OPT_IN_SET.has(feature)) return { 'featureAccess.mode': 'custom', 'featureAccess.features': feature };
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
