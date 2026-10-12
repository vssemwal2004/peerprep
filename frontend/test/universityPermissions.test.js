import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleForPath, pathAllowed } from '../src/platform/universityPermissions.js';

const university = { university: true };
const policy = { questions: false, assessments: true, events: false, interviews: true, learning: false, resumes: false };

test('QuickPrep and legacy quest routes require question sheets access, not challenge access', () => {
  for (const path of ['/student/quickprep', '/student/quickprep/arrays', '/student/quests', '/student/quests/arrays']) {
    assert.equal(moduleForPath(path), 'questions');
    assert.equal(pathAllowed(path, { learning: true }, 'student', '', university), false);
    assert.equal(pathAllowed(path, { questions: true }, 'student', '', university), true);
  }
});

test('university admins never see QuickPrep management; only the super admin or a standalone admin does', () => {
  const everything = { questions: true, coding: true, assessments: true, events: true, interviews: true, learning: true, resumes: true };
  for (const path of ['/admin/quickprep', '/admin/quickprep/new', '/admin/quickprep/insights', '/admin/quickprep/abc', '/admin/quickprep/abc/edit', '/admin/quests']) {
    assert.equal(pathAllowed(path, everything, 'admin', '', university), false, `${path} is hidden on a university`);
    assert.equal(pathAllowed(path, everything, 'admin', '', { university: false }), true, `${path} stays available centrally and on standalone`);
  }
  assert.equal(pathAllowed('/admin/library', everything, 'admin', '', university), true, 'The university Question Library itself is unaffected');
  assert.equal(pathAllowed('/student/quickprep', everything, 'student', '', university), true, 'Students still receive the central QuickPreps');
});

test('suggested interview companies are moderated only by the super admin or a standalone admin', () => {
  const everything = { questions: true, coding: true, assessments: true, events: true, interviews: true, learning: true, resumes: true };
  for (const path of ['/admin/settings/suggested-companies', '/admin/settings/suggested-companies/']) {
    assert.equal(pathAllowed(path, everything, 'admin', '', university), false, `${path} is hidden on a university`);
    assert.equal(pathAllowed(path, everything, 'admin', '', { university: false }), true, `${path} stays available centrally and on standalone`);
  }
  assert.equal(pathAllowed('/admin/settings/master-data', everything, 'admin', '', university), true, 'Other settings pages are unaffected');
});

test('challenge navigation requires at least one allocated supported module', () => {
  assert.equal(moduleForPath('/student/challenges?period=monthly'), 'challenges');
  assert.equal(pathAllowed('/student/challenges', {}, 'student', '', university), false);
  for (const name of ['questions', 'learning', 'assessments', 'events', 'interviews']) {
    assert.equal(pathAllowed('/student/challenges', { [name]: true }, 'student', '', university), true);
  }
  assert.equal(pathAllowed('/student/challenges', { resumes: true }, 'student', '', university), false);
});

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
