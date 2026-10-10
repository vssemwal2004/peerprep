import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleForPath, pathAllowed } from '../src/platform/universityPermissions.js';

const university = { university: true };
const policy = { questions: false, assessments: true, events: false, interviews: true, learning: false, resumes: false };

test('disabled university modules are hidden on admin, coordinator and student routes', () => {
  for (const path of ['/admin/library', '/coordinator/library/coding/create', '/problems/shared/abc',
    '/admin/event/create', '/coordinator/interviews/scheduled', '/student/interview',
    '/admin/learning', '/coordinator/subjects', '/student/learning', '/student/resume']) {
    assert.equal(pathAllowed(path, policy, 'student', '', university), false, path);
  }
  for (const path of ['/admin/assessment/create', '/coordinator/assessment/reports',
    '/student/assessment-reports', '/student/assessments', '/student/ai-interviews']) {
    assert.equal(pathAllowed(path, policy, 'student', '', university), true, path);
  }
  assert.equal(pathAllowed('/admin/platform', policy, 'admin', '', university), false);
  assert.equal(moduleForPath('/admin/assessment-feedback'), 'assessments');
});

test('analysis sections follow the contributing module permissions', () => {
  assert.equal(pathAllowed('/student/analysis/assessments', policy, 'student', '', university), true);
  assert.equal(pathAllowed('/student/analysis/coding', policy, 'student', '', university), false);
  assert.equal(pathAllowed('/student/analysis/overview', policy, 'student', '', university), false);
  assert.equal(pathAllowed('/admin/analysis', policy, 'admin', '?source=coding', university), false);
  assert.equal(pathAllowed('/admin/analysis', policy, 'admin', '', university), true);
});
