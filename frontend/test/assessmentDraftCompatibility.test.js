import test from 'node:test';
import assert from 'node:assert/strict';
import { isAssessmentDraftCompatible } from '../src/admin/assessment/assessmentDraftStore.js';

test('only a newer draft from the same persisted assessment version can restore', () => {
  const assessment = { version: 4, updatedAt: '2026-09-25T10:00:00.000Z' };
  assert.equal(isAssessmentDraftCompatible({ version: 4, updatedAt: Date.parse('2026-09-25T10:01:00.000Z') }, assessment), true);
  assert.equal(isAssessmentDraftCompatible({ version: 3, updatedAt: Date.parse('2026-09-25T10:02:00.000Z') }, assessment), false);
  assert.equal(isAssessmentDraftCompatible({ version: 4, updatedAt: Date.parse('2026-09-25T09:59:00.000Z') }, assessment), false);
});
