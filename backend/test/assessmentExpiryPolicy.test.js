import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssessmentAttemptDeadline,
  getAssessmentAttemptTimeTakenSec,
  getAssessmentSubmitGraceMs,
  isAssessmentAttemptExpired,
} from '../src/services/assessmentExpiryPolicy.js';
import { filterTimedAssessmentAnswerChanges, getActiveAssessmentElapsedMs, isAssessmentSectionOpen } from '../src/services/assessmentSectionTiming.js';

test('attempt deadline uses the earlier duration or assessment closing time', () => {
  const startedAt = new Date('2026-09-23T09:00:00.000Z');
  const deadline = getAssessmentAttemptDeadline(
    { duration: 60, endTime: new Date('2026-09-23T09:40:00.000Z') },
    { status: 'in_progress', startedAt },
  );
  assert.equal(deadline.toISOString(), '2026-09-23T09:40:00.000Z');
});

test('abandoned in-progress attempt expires once the submit grace after its deadline has passed', () => {
  const assessment = { duration: 30, endTime: new Date('2026-09-23T12:00:00.000Z') };
  const submission = { status: 'in_progress', startedAt: new Date('2026-09-23T09:00:00.000Z') };
  assert.equal(getAssessmentAttemptDeadline(assessment, submission).toISOString(), '2026-09-23T09:30:00.000Z');
  assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:30:00.000Z')), false);
  assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:30:14.999Z')), false);
  assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:30:15.000Z')), true);
});

test('submit grace is configurable and never applies to a manually completed assessment', () => {
  const assessment = { duration: 30, endTime: new Date('2026-09-23T12:00:00.000Z') };
  const submission = { status: 'in_progress', startedAt: new Date('2026-09-23T09:00:00.000Z') };
  const previous = process.env.ASSESSMENT_SUBMIT_GRACE_MS;
  try {
    process.env.ASSESSMENT_SUBMIT_GRACE_MS = '0';
    assert.equal(getAssessmentSubmitGraceMs(assessment), 0);
    assert.equal(isAssessmentAttemptExpired(assessment, submission, new Date('2026-09-23T09:30:00.000Z')), true);
    process.env.ASSESSMENT_SUBMIT_GRACE_MS = '5000';
    assert.equal(getAssessmentSubmitGraceMs(assessment), 5000);
    delete process.env.ASSESSMENT_SUBMIT_GRACE_MS;
    assert.equal(getAssessmentSubmitGraceMs(assessment), 15000);
    const closed = { ...assessment, manuallyCompletedAt: new Date('2026-09-23T09:10:00.000Z') };
    assert.equal(getAssessmentSubmitGraceMs(closed), 0);
    assert.equal(isAssessmentAttemptExpired(closed, submission, new Date('2026-09-23T09:10:00.000Z')), true);
    assert.equal(getAssessmentAttemptDeadline({ ...assessment, manuallyCompletedAt: null }, submission).toISOString(), '2026-09-23T09:30:00.000Z');
  } finally {
    if (previous === undefined) delete process.env.ASSESSMENT_SUBMIT_GRACE_MS;
    else process.env.ASSESSMENT_SUBMIT_GRACE_MS = previous;
  }
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

test('a section first-visit clock uses the capped security pause credit and locks at its exact limit', () => {
  const startedAt = new Date('2026-09-23T09:00:00.000Z');
  const submission = {
    startedAt, sectionTimeStarts: { 0: 30000 }, pausedDurationMs: 10000,
    pauseStartedAt: new Date(startedAt.getTime() + 50000), securityPauseReason: 'tab_switch',
  };
  const settings = { sectionWiseLock: true, sectionGraceSec: 30 };
  const section = { timeLimitMinutes: 1 };
  assert.equal(getActiveAssessmentElapsedMs(submission, new Date(startedAt.getTime() + 75000)), 40000);
  assert.equal(isAssessmentSectionOpen(settings, section, submission, 0, new Date(startedAt.getTime() + 129999)), true);
  assert.equal(isAssessmentSectionOpen(settings, section, submission, 0, new Date(startedAt.getTime() + 130000)), false);
  assert.equal(isAssessmentSectionOpen(settings, section, submission, 1, new Date(startedAt.getTime() + 65000)), false);
});

test('answer batches preserve accepted timed answers and allow untimed sections after a section expires', () => {
  const startedAt = new Date('2026-09-23T09:00:00.000Z');
  const assessment = { settings: { sectionWiseLock: true }, sections: [{ timeLimitMinutes: 1 }, {}, { timeLimitMinutes: 1 }] };
  const submission = { startedAt, sectionTimeStarts: { 0: 0 }, answers: [{ sectionIndex: 0, questionIndex: 1, answer: 'saved' }] };
  const answer = (sectionIndex, questionIndex, value) => ({ sectionIndex, questionIndex, answer: value });
  const final = [answer(0, 0, 'late'), answer(0, 1, 'saved'), answer(1, 0, 'on time'), answer(2, 0, 'never opened')];
  const result = filterTimedAssessmentAnswerChanges(assessment, submission, final, new Date(startedAt.getTime() + 240000));
  assert.deepEqual(result, { answers: [final[2]], ignoredSectionIndexes: [0, 2] });
});
