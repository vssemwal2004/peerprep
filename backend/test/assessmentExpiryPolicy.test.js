import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssessmentAttemptDeadline,
  getAssessmentAttemptTimeTakenSec,
  isAssessmentAttemptExpired,
} from '../src/services/assessmentExpiryPolicy.js';

test('attempt deadline uses the earlier duration or assessment closing time', () => {
  const startedAt = new Date('2026-09-23T09:00:00.000Z');
  const deadline = getAssessmentAttemptDeadline(
    { duration: 60, endTime: new Date('2026-09-23T09:40:00.000Z') },
    { status: 'in_progress', startedAt },
  );
  assert.equal(deadline.toISOString(), '2026-09-23T09:40:00.000Z');
});

test('abandoned in-progress attempt expires at its individual deadline', () => {
  const assessment = { duration: 30, endTime: new Date('2026-09-23T12:00:00.000Z') };
  const submission = { status: 'in_progress', startedAt: new Date('2026-09-23T09:00:00.000Z') };
  assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:29:59.000Z')), false);
  assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:30:00.000Z')), true);
});

test('completed pause extends deadline and is removed from time taken', () => {
  const assessment = { duration: 30, endTime: new Date('2026-09-23T12:00:00.000Z') };
  const submission = {
    status: 'in_progress',
    startedAt: new Date('2026-09-23T09:00:00.000Z'),
    pausedDurationMs: 120000,
  };
  const deadline = getAssessmentAttemptDeadline(assessment, submission);
  assert.equal(deadline.toISOString(), '2026-09-23T09:32:00.000Z');
  assert.equal(getAssessmentAttemptTimeTakenSec(submission, deadline), 1800);
});

test('unresolved security pause expires at the configured recheck timeout', () => {
  const assessment = {
    duration: 60,
    endTime: new Date('2026-09-23T12:00:00.000Z'),
    settings: { securityRecheckTimeoutSec: 120 },
  };
  const submission = {
    status: 'in_progress',
    startedAt: new Date('2026-09-23T09:00:00.000Z'),
    pauseStartedAt: new Date('2026-09-23T09:10:00.000Z'),
  };
  assert.equal(getAssessmentAttemptDeadline(assessment, submission).toISOString(), '2026-09-23T09:12:00.000Z');
});
