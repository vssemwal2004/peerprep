import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAssessmentCompilerStudent } from '../src/middleware/auth.js';

function invoke(user, body = {}, query = {}) {
  let continued = false;
  let error = null;
  try {
    requireAssessmentCompilerStudent({ user, body, query }, {}, () => { continued = true; });
  } catch (caught) {
    error = caught;
  }
  return { continued, error };
}

test('assessment-only students can execute code when an assessment context is supplied', () => {
  const result = invoke(
    { role: 'student', accessScope: 'assessment_only' },
    { assessmentId: '6ab282d167ad76a19eb738c8', problemId: '6ab282d167ad76a19eb7000' },
  );
  assert.equal(result.continued, true);
  assert.equal(result.error, null);
});

test('assessment-only students cannot use the standalone compiler', () => {
  const result = invoke({ role: 'student', accessScope: 'assessment_only' });
  assert.equal(result.continued, false);
  assert.equal(result.error?.status, 403);
});

test('full students retain standalone compiler access', () => {
  const result = invoke({ role: 'student', accessScope: 'full' });
  assert.equal(result.continued, true);
  assert.equal(result.error, null);
});
