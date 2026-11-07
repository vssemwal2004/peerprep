import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptBucketOf, assignedCountOf, attemptCountFields, isGraded, passPercentageOf, percentOf, summarizeAttempts,
} from '../src/services/assessmentAttemptCounts.js';

const row = (studentId, status, extra = {}) => ({ studentId, status, evaluationStatus: 'completed', maxMarks: 100, ...extra });

test('statuses fall into exactly one bucket; unknown or missing status never counts as started', () => {
  assert.equal(attemptBucketOf('not_started'), 'notStarted');
  assert.equal(attemptBucketOf(undefined), 'notStarted');
  assert.equal(attemptBucketOf('mystery'), 'notStarted');
  assert.equal(attemptBucketOf('in_progress'), 'inProgress');
  for (const status of ['submitted', 'expired', 'violation', 'incomplete']) assert.equal(attemptBucketOf(status), 'finished');
});

test('isGraded needs a terminal status, completed evaluation and a finite score', () => {
  assert.equal(isGraded(row('a', 'submitted', { score: 0 })), true);
  assert.equal(isGraded(row('a', 'expired', { score: 5, evaluationStatus: undefined })), true);
  assert.equal(isGraded(row('a', 'violation', { score: 5 })), true);
  assert.equal(isGraded(row('a', 'incomplete', { score: 5 })), false);
  assert.equal(isGraded(row('a', 'in_progress', { score: 5 })), false);
  assert.equal(isGraded(row('a', 'not_started', { score: 5 })), false);
  assert.equal(isGraded(row('a', 'submitted', { score: 5, evaluationStatus: 'processing' })), false);
  assert.equal(isGraded(row('a', 'submitted', { score: 5, evaluationStatus: 'failed' })), false);
  assert.equal(isGraded(row('a', 'submitted', { score: null })), false);
  assert.equal(isGraded(row('a', 'submitted', {})), false);
  assert.equal(isGraded(row('a', 'submitted', { score: Number.NaN })), false);
});

test('pass mark: assessment setting clamped to 0..100, otherwise 40 (null is "unset", not 0)', () => {
  assert.equal(passPercentageOf({}), 40);
  assert.equal(passPercentageOf(undefined), 40);
  assert.equal(passPercentageOf({ passPercentage: null }), 40);
  assert.equal(passPercentageOf({ passPercentage: 'abc' }), 40);
  assert.equal(passPercentageOf({ passPercentage: 60 }), 60);
  assert.equal(passPercentageOf({ passPercentage: 150 }), 100);
  assert.equal(passPercentageOf({ passPercentage: -5 }), 0);
  assert.equal(percentOf(3, 4), 75);
  assert.equal(percentOf(5, 0), null);
  assert.equal(percentOf(500, 100), 100);
});

test('summarizeAttempts: every status, ungraded rows stay out of scores and pass decisions', () => {
  const rows = [
    row('s1', 'submitted', { score: 80 }),
    row('s2', 'submitted', { score: 20 }),
    row('s3', 'expired', { score: 70, isLate: true }),
    row('s4', 'violation', { evaluationStatus: 'processing' }),
    row('s5', 'submitted', { evaluationStatus: 'failed', score: 90 }),
    row('s6', 'incomplete', { score: 99 }),
    row('s7', 'in_progress', { score: 50 }),
    row('s8', 'not_started'),
  ];
  const counts = summarizeAttempts(rows, { passPercentage: 60 });
  assert.deepEqual(
    { candidates: counts.candidates, started: counts.started, notStarted: counts.notStarted, inProgress: counts.inProgress, finished: counts.finished },
    { candidates: 8, started: 7, notStarted: 1, inProgress: 1, finished: 6 },
  );
  assert.deepEqual(
    { submitted: counts.submitted, expired: counts.expired, violation: counts.violation, incomplete: counts.incomplete },
    { submitted: 3, expired: 1, violation: 1, incomplete: 1 },
  );
  assert.equal(counts.graded, 3);
  assert.equal(counts.evaluating, 1);
  assert.equal(counts.failedEvaluation, 1);
  assert.equal(counts.passed, 2);
  assert.equal(counts.failed, 1);
  assert.equal(counts.passRate, 66.7);
  assert.equal(counts.avgScore, 56.67);
  assert.equal(counts.minScore, 20);
  assert.equal(counts.maxScore, 80);
  assert.equal(counts.avgPercentage, 56.7);
  assert.equal(counts.late, 1);
  assert.equal(counts.passPercentage, 60);
});

test('default pass mark 40 versus custom 60 changes only the pass decision', () => {
  const rows = [row('a', 'submitted', { score: 45 }), row('b', 'submitted', { score: 40 }), row('c', 'submitted', { score: 39.99 })];
  assert.equal(summarizeAttempts(rows).passed, 2);
  assert.equal(summarizeAttempts(rows, { passPercentage: 60 }).passed, 0);
  assert.equal(summarizeAttempts(rows, { passPercentage: 60 }).graded, 3);
});

test('max marks fall back to the assessment total; no positive max means never passed', () => {
  const rows = [{ studentId: 'a', status: 'submitted', score: 3 }, { studentId: 'b', status: 'submitted', score: 3, maxMarks: 0 }];
  const counts = summarizeAttempts(rows, { passPercentage: 50, totalMarks: 4 });
  assert.equal(counts.graded, 2);
  assert.equal(counts.passed, 1);
  assert.equal(counts.failed, 1);
  assert.equal(counts.avgPercentage, 75);
});

test('zero graded rows give null rates and averages, not zeros', () => {
  const counts = summarizeAttempts([row('a', 'in_progress'), row('b', 'not_started')]);
  assert.equal(counts.graded, 0);
  assert.equal(counts.passRate, null);
  assert.equal(counts.avgScore, null);
  assert.equal(counts.minScore, null);
  assert.equal(counts.maxScore, null);
  assert.equal(counts.avgPercentage, null);
  assert.equal(counts.failed, 0);
  const empty = summarizeAttempts([]);
  assert.deepEqual([empty.candidates, empty.started, empty.notStarted, empty.passRate], [0, 0, 0, null]);
});

test('duplicate rows of one student collapse to the furthest-along row; other assessments stay separate', () => {
  const counts = summarizeAttempts([
    row('a', 'not_started'),
    row('a', 'submitted', { score: 70 }),
    row('a', 'in_progress'),
    row('b', 'in_progress'),
  ], { passPercentage: 60 });
  assert.equal(counts.candidates, 2);
  assert.equal(counts.finished, 1);
  assert.equal(counts.inProgress, 1);
  assert.equal(counts.passed, 1);
  const twoExams = summarizeAttempts([
    row('a', 'submitted', { assessmentId: 'x', score: 70 }),
    row('a', 'submitted', { assessmentId: 'y', score: 10 }),
  ]);
  assert.equal(twoExams.candidates, 2);
  assert.equal(twoExams.graded, 2);
});

test('assigned students without a document are candidates who have not started', () => {
  const counts = summarizeAttempts([row('a', 'submitted', { score: 90 }), row('b', 'not_started')], { assignedCount: 5 });
  assert.equal(counts.candidates, 5);
  assert.equal(counts.started, 1);
  assert.equal(counts.notStarted, 4);
  assert.equal(summarizeAttempts([row('a', 'submitted', { score: 90 })], { assignedCount: 0 }).candidates, 1);
  assert.equal(assignedCountOf({ targetType: 'selected', assignedStudents: ['a', 'b', 'a'] }, 99), 2);
  assert.equal(assignedCountOf({ targetType: 'all', assignedStudents: [] }, 7), 7);
  assert.equal(assignedCountOf({ targetType: 'all', assignedStudents: ['a'] }, 7), 1);
});

test('flat fields keep the legacy names with the canonical meaning', () => {
  const counts = summarizeAttempts([row('a', 'submitted', { score: 80 }), row('b', 'expired'), row('c', 'not_started')], { assignedCount: 4 });
  const flat = attemptCountFields(counts);
  assert.equal(flat.submissionCount, 2);
  assert.equal(flat.startedCount, 2);
  assert.equal(flat.completedCount, 2);
  assert.equal(flat.finishedCount, 2);
  assert.equal(flat.submittedCount, 1);
  assert.equal(flat.candidateCount, 4);
  assert.equal(flat.notStartedCount, 2);
  assert.equal(flat.passCount, flat.passedCount);
  assert.equal(flat.failCount, flat.failedCount);
});
