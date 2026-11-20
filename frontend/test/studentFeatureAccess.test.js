import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPT_IN_STUDENT_FEATURES,
  STANDARD_STUDENT_FEATURES,
  featureForStudentPath,
  firstStudentFeaturePath,
  hasStudentFeature,
  normalizeStudentAccess,
} from '../src/student/studentFeatureAccess.js';

test('missing access data keeps every standard module; opt-in Prep Mates and Prep Mock need an admin to turn them on', () => {
  assert.deepEqual(normalizeStudentAccess(), { mode: 'all', features: STANDARD_STUDENT_FEATURES });
  assert.equal(hasStudentFeature({ role: 'student' }, 'prep_coding'), true);
  assert.deepEqual(OPT_IN_STUDENT_FEATURES, ['peers', 'prep_mock']);
  assert.equal(hasStudentFeature({ role: 'student' }, 'prep_mock'), false, '"All access" does not include Prep Mock');
  assert.equal(hasStudentFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['prep_mock'] } }, 'prep_mock'), true);
  assert.equal(hasStudentFeature({ role: 'student' }, 'peers'), false, '"All access" does not include Prep Mates');
  assert.equal(hasStudentFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['peers'] } }, 'peers'), true);
});

test('custom access selects the first permitted landing page', () => {
  const user = { role: 'student', featureAccess: { mode: 'custom', features: ['learning', 'resume'] } };
  // The catalogue follows the student sidebar order, where Resume comes before Learning.
  assert.equal(firstStudentFeaturePath(user), '/student/resume');
  assert.equal(firstStudentFeaturePath({ role: 'student', featureAccess: { mode: 'custom', features: ['learning'] } }), '/student/learning');
  assert.equal(hasStudentFeature(user, 'dashboard'), false);
});

test('student routes map to their protected feature', () => {
  assert.equal(featureForStudentPath('/problems/shared/abc'), 'prep_coding');
  assert.equal(featureForStudentPath('/student/assessment/abc'), 'assessments');
  assert.equal(featureForStudentPath('/student/ai-interviews/room/abc'), 'ai_interviews');
  assert.equal(featureForStudentPath('/student/profile'), null);
});
