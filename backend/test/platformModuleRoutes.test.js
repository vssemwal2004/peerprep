import test from 'node:test';
import assert from 'node:assert/strict';
import { routeModule } from '../src/platform/enforcePolicy.js';

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
