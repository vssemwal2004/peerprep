import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_STUDENT_FEATURES,
  featureForStudentPath,
  firstStudentFeaturePath,
  hasStudentFeature,
  normalizeStudentAccess,
} from '../src/student/studentFeatureAccess.js';

test('missing access data remains backward-compatible with full access', () => {
  assert.deepEqual(normalizeStudentAccess(), { mode: 'all', features: ALL_STUDENT_FEATURES });
  assert.equal(hasStudentFeature({ role: 'student' }, 'prep_coding'), true);
});

test('custom access selects the first permitted landing page', () => {
  const user = { role: 'student', featureAccess: { mode: 'custom', features: ['learning', 'resume'] } };
  assert.equal(firstStudentFeaturePath(user), '/student/learning');
  assert.equal(hasStudentFeature(user, 'dashboard'), false);
});

test('student routes map to their protected feature', () => {
  assert.equal(featureForStudentPath('/problems/shared/abc'), 'prep_coding');
  assert.equal(featureForStudentPath('/student/assessment/abc'), 'assessments');
  assert.equal(featureForStudentPath('/student/ai-interviews/room/abc'), 'ai_interviews');
  assert.equal(featureForStudentPath('/student/profile'), null);
});
