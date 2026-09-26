import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentProtocolBackfill } from '../src/services/assessmentSchemaMigrationService.js';

test('legacy protocol backfill preserves answers and schedules only unfinished terminal grading', () => {
  const patch = assessmentProtocolBackfill({ _id: 'legacy', status: 'submitted', evaluationStatus: 'processing' });
  assert.deepEqual(patch.filter.__v, { $exists: false });
  assert.equal(patch.update.$set.pendingWork.status, 'pending');
  assert.equal(patch.update.$set.pendingWork.version, 0);
  assert.ok(patch.update.$set.submissionReceipt);
  assert.equal(patch.update.$set.answers, undefined);
  assert.equal(patch.update.$inc.__v, 1);
});
test('backfill is idempotent and never regrades a completed historical attempt', () => {
  const original = { _id: 'complete', __v: 40, status: 'submitted', evaluationStatus: 'completed', score: 80 };
  const patch = assessmentProtocolBackfill(original);
  assert.equal(patch.filter.__v, 40);
  assert.equal(patch.update.$set.pendingWork, undefined);
  assert.equal(assessmentProtocolBackfill({ ...original, ...patch.update.$set, __v: 41 }), null);
});
