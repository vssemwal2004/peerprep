import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPT_IN_STUDENT_FEATURES,
  STANDARD_STUDENT_FEATURES,
  STUDENT_FEATURES,
  applyStudentFeatureChange,
  normalizeStudentFeatureAccess,
  normalizeStudentFeatures,
  parseStudentFeatureAccess,
  studentFeatureQuery,
  studentHasFeature,
} from '../src/services/studentFeatureAccess.js';

test('legacy students retain every standard module; opt-in Prep Mates and Prep Mock are not part of "All access"', () => {
  const access = normalizeStudentFeatureAccess(undefined);
  assert.equal(access.mode, 'all');
  assert.deepEqual(OPT_IN_STUDENT_FEATURES, ['peers', 'prep_mock', 'resume_jd_match']);
  assert.equal(studentHasFeature({ role: 'student' }, 'resume_jd_match'), false, 'ANVI JD Match is given to chosen students only');
  assert.deepEqual(access.features, STUDENT_FEATURES.filter((feature) => !OPT_IN_STUDENT_FEATURES.includes(feature)));
  assert.equal(studentHasFeature({ role: 'student' }, 'prep_mock'), false, 'Prep Mock is given to chosen students only');
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['prep_mock'] } }, 'prep_mock'), false, 'a feature toggle alone cannot bypass SPOC upload');
  assert.equal(studentHasFeature({ role: 'student', prepMockEnrolledAt: new Date(), featureAccess: { mode: 'custom', features: ['prep_mock'] } }, 'prep_mock'), true);
  assert.deepEqual(studentFeatureQuery('prep_mock'), { role: 'student', prepMockEnrolledAt: { $ne: null }, 'featureAccess.mode': 'custom', 'featureAccess.features': 'prep_mock' });
  assert.equal(studentHasFeature({ role: 'student' }, 'peers'), false, 'not on for everyone');
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'all', features: STUDENT_FEATURES } }, 'peers'), false, 'an old "all" record listing peers still does not grant it');
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['peers'] } }, 'peers'), true, 'only an explicit grant');
  assert.deepEqual(studentFeatureQuery('peers'), { 'featureAccess.mode': 'custom', 'featureAccess.features': 'peers' });
  assert.ok(studentFeatureQuery('learning').$or, 'standard modules still match "All access"');
});

test('bulk access changes: turn on / off keeps the rest, never leaves a student with nothing to check', () => {
  const all = normalizeStudentFeatureAccess(undefined);
  const withMates = applyStudentFeatureChange(all, { type: 'grant', features: ['peers'] });
  assert.deepEqual(withMates, { mode: 'custom', features: STUDENT_FEATURES.filter((feature) => !['prep_mock', 'resume_jd_match'].includes(feature)) }, 'All access + Prep Mates');
  assert.deepEqual(applyStudentFeatureChange(withMates, { type: 'grant', features: ['prep_mock', 'resume_jd_match'] }), { mode: 'custom', features: [...STUDENT_FEATURES] }, '+ Prep Mock + JD Match = every feature');
  assert.deepEqual(applyStudentFeatureChange(withMates, { type: 'revoke', features: ['peers'] }), { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] }, 'back to All access');
  assert.deepEqual(applyStudentFeatureChange(all, { type: 'grant', features: ['learning'] }), all, 'turning on what they have changes nothing');
  const custom = { mode: 'custom', features: ['learning', 'resume'] };
  assert.deepEqual(applyStudentFeatureChange(custom, { type: 'grant', features: ['peers', 'bogus'] }), { mode: 'custom', features: ['learning', 'resume', 'peers'] });
  assert.deepEqual(applyStudentFeatureChange(custom, { type: 'revoke', features: ['learning', 'resume'] }), { mode: 'custom', features: [] }, 'empty: the controller skips such students');
  assert.deepEqual(applyStudentFeatureChange(custom, { type: 'set', access: { mode: 'all' } }), all);
});

test('legacy assessment-only students retain assessment-only access', () => {
  const access = normalizeStudentFeatureAccess(undefined, { legacyAccessScope: 'assessment_only' });
  assert.deepEqual(access, { mode: 'custom', features: ['assessments'] });
});

test('custom access accepts only known unique feature keys', () => {
  assert.deepEqual(normalizeStudentFeatures(['learning', 'unknown', 'learning', 'resume']), ['learning', 'resume']);
  assert.deepEqual(parseStudentFeatureAccess('{"mode":"custom","features":["resume","bad"]}'), {
    mode: 'custom',
    features: ['resume'],
  });
});

test('student feature checks are strict while staff requests pass through', () => {
  const student = { role: 'student', featureAccess: { mode: 'custom', features: ['learning'] } };
  assert.equal(studentHasFeature(student, 'learning'), true);
  assert.equal(studentHasFeature(student, 'prep_coding'), false);
  assert.equal(studentHasFeature({ role: 'admin' }, 'prep_coding'), true);
});
