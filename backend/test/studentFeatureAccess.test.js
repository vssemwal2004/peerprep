import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_FEATURES,
  normalizeStudentFeatureAccess,
  normalizeStudentFeatures,
  parseStudentFeatureAccess,
  studentHasFeature,
} from '../src/services/studentFeatureAccess.js';

test('legacy students retain complete platform access', () => {
  const access = normalizeStudentFeatureAccess(undefined);
  assert.equal(access.mode, 'all');
  assert.deepEqual(access.features, STUDENT_FEATURES);
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
