import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionAllowed, routeModule } from '../src/platform/enforcePolicy.js';

test('module API gate covers practice, assessment and event endpoints', () => {
  assert.equal(routeModule('/compiler/run'), 'questions');
  assert.equal(routeModule('/compiler/run', { assessmentId: 'exam-id' }), 'assessments');
  assert.equal(routeModule('/execute'), 'questions');
  assert.equal(routeModule('/problem-lists'), 'questions');
  assert.equal(routeModule('/admin/assessment-feedback'), 'assessments');
  assert.equal(routeModule('/student/assessment-reports'), 'assessments');
  assert.equal(routeModule('/feedback'), 'events');
  assert.equal(routeModule('/ai-interviews'), 'interviews');
});

test('QuickPrep and PrepMock use independent university switches and their parent modules', () => {
  assert.equal(routeModule('/quests'), 'quickprep');
  assert.equal(routeModule('/engagement'), 'quickprep');
  assert.equal(routeModule('/admin/library/questions', { scope: 'mock' }), 'prepmock');
  assert.equal(routeModule('/admin/assessment/mock-companies'), 'prepmock');
  assert.equal(routeModule('/admin/assessment/create', { kind: 'mock' }), 'prepmock');
  assert.equal(routeModule('/student/assessment-dashboard', { kind: 'mock' }), 'prepmock');
  assert.equal(permissionAllowed({ questions: true, quickprep: false }, 'quickprep'), false);
  assert.equal(permissionAllowed({ questions: false, quickprep: true }, 'quickprep'), false);
  assert.equal(permissionAllowed({ questions: true }, 'quickprep'), true);
  assert.equal(permissionAllowed({ assessments: true, prepmock: false }, 'prepmock'), false);
  assert.equal(permissionAllowed({ assessments: false, prepmock: true }, 'prepmock'), false);
  assert.equal(permissionAllowed({ assessments: true }, 'prepmock'), true);
});
