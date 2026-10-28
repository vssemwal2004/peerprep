import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ROSTER_FILTERS, computeRosterStats, filterRosterRows, formatRelativeAge,
  hasActiveRosterFilters, legacyReportRowToRoster, mergeRosterRows, paginateRows,
  rowEvaluationState, rowOutcome, sortRosterRows,
} from '../src/admin/reports/rosterModel.js';
import { assessmentEvaluationLabel, isResultAnnounced } from '../src/utils/assessmentEvaluation.js';

// Synthetic roster rows only; no database or API is involved.
const row = (overrides) => ({
  key: overrides.submissionId || overrides.studentId,
  submissionId: null,
  studentId: 'u0',
  name: 'Student',
  email: '',
  rollNo: '',
  status: 'not_started',
  evaluationStatus: null,
  score: null,
  maxMarks: 20,
  percentage: null,
  passed: null,
  isLate: false,
  flagged: false,
  tabSwitches: 0,
  fullscreenExits: 0,
  cameraFlags: 0,
  aiViolationCount: 0,
  violationScore: 0,
  ...overrides,
});

const roster = [
  row({ submissionId: 's1', studentId: 'u1', name: 'Asha Rao', rollNo: 'R-101', email: 'asha@uni.test', status: 'submitted', evaluationStatus: 'completed', score: 18, percentage: 90, passed: true, timeTakenSec: 1200 }),
  row({ submissionId: 's2', studentId: 'u2', name: 'Bilal Khan', rollNo: 'R-102', status: 'submitted', evaluationStatus: 'completed', score: 4, percentage: 20, passed: false, isLate: true, tabSwitches: 3, flagged: true }),
  row({ submissionId: 's3', studentId: 'u3', name: 'Chen Li', rollNo: 'R-103', status: 'submitted', evaluationStatus: 'processing' }),
  row({ submissionId: 's4', studentId: 'u4', name: 'Divya Nair', rollNo: 'R-104', status: 'in_progress', answeredCount: 3, totalQuestions: 10 }),
  row({ studentId: 'u5', name: 'Elan Das', rollNo: 'R-105' }),
  row({ submissionId: 's6', studentId: 'u6', name: 'Farah Ali', rollNo: 'R-106', status: 'expired', evaluationStatus: 'failed', cameraFlags: 1 }),
  row({ submissionId: 's7', studentId: 'u7', name: 'Gita Sen', rollNo: 'R-107', status: 'submitted', evaluationStatus: 'completed', score: 12, percentage: 60, passed: true }),
];

test('full merge replaces the roster and reports only rows that changed', () => {
  const first = mergeRosterRows([], roster, { full: true });
  assert.equal(first.rows.length, roster.length);
  assert.equal(first.changedKeys.length, roster.length);

  const same = mergeRosterRows(first.rows, roster.map((r) => ({ ...r })), { full: true });
  assert.deepEqual(same.changedKeys, []);
  assert.equal(same.rows[0], first.rows[0], 'unchanged rows keep identity so React can skip them');

  const shrunk = mergeRosterRows(first.rows, roster.slice(0, 2), { full: true });
  assert.equal(shrunk.rows.length, 2, 'rows absent from a full response are dropped');
});

test('delta merge upserts by key and replaces the not-started placeholder of the same student', () => {
  const base = mergeRosterRows([], roster, { full: true }).rows;
  const delta = [
    { ...roster[3], answeredCount: 4, lastSavedAt: '2035-01-01T10:00:00Z' },
    row({ submissionId: 's5', studentId: 'u5', name: 'Elan Das', rollNo: 'R-105', status: 'in_progress', answeredCount: 0 }),
  ];
  const { rows, changedKeys } = mergeRosterRows(base, delta, { full: false });
  assert.deepEqual(changedKeys.sort(), ['s4', 's5']);
  assert.equal(rows.length, roster.length, 'placeholder u5 is replaced, not duplicated');
  assert.ok(!rows.some((r) => r.key === 'u5'));
  assert.equal(rows.find((r) => r.key === 's4').answeredCount, 4);
  assert.deepEqual(mergeRosterRows(rows, [delta[0]], { full: false }).changedKeys, [], 'repeated delta is a no-op');
});

test('evaluation state and outcome distinguish evaluating, needs review, in progress and not started', () => {
  assert.equal(rowEvaluationState(roster[0]), 'graded');
  assert.equal(rowEvaluationState(roster[2]), 'evaluating');
  assert.equal(rowEvaluationState(roster[5]), 'needs_review');
  assert.equal(rowEvaluationState(roster[3]), 'not_submitted');
  assert.equal(rowOutcome(roster[1]), 'failed');
  assert.equal(rowOutcome(roster[3]), 'in_progress');
  assert.equal(rowOutcome(roster[4]), 'not_started');
  // A graded row without a server pass flag falls back to the assessment pass mark.
  assert.equal(rowOutcome({ ...roster[6], passed: null }, 70), 'failed');
  assert.equal(rowOutcome({ ...roster[6], passed: null }, 50), 'passed');
});

test('filters cover search, status multi-select, evaluation, submission type, score range, flags', () => {
  const keys = (filters) => filterRosterRows(roster, { ...DEFAULT_ROSTER_FILTERS, ...filters }).map((r) => r.key);
  assert.deepEqual(keys({ query: 'r-103' }), ['s3']);
  assert.deepEqual(keys({ query: 'ASHA@uni' }), ['s1']);
  assert.deepEqual(keys({ query: 'u5' }), ['u5'], 'student id is searchable');
  assert.deepEqual(keys({ statuses: ['in_progress', 'not_started'] }), ['s4', 'u5']);
  assert.deepEqual(keys({ evaluation: 'evaluating' }), ['s3']);
  assert.deepEqual(keys({ evaluation: 'needs_review' }), ['s6']);
  assert.deepEqual(keys({ submissionType: 'late' }), ['s2']);
  assert.deepEqual(keys({ submissionType: 'on_time' }), ['s1', 's3', 's6', 's7']);
  assert.deepEqual(keys({ scoreMin: '50', scoreMax: '95' }), ['s1', 's7'], 'score range uses percentage, not raw marks');
  assert.deepEqual(keys({ flaggedOnly: true }), ['s2']);
  assert.deepEqual(keys({ hasViolations: true }), ['s2', 's6']);
  assert.equal(hasActiveRosterFilters(DEFAULT_ROSTER_FILTERS), false);
  assert.equal(hasActiveRosterFilters({ ...DEFAULT_ROSTER_FILTERS, statuses: ['submitted'] }), true);
});

test('sort works on every column, keeps missing values last and is stable', () => {
  const byScoreDesc = sortRosterRows(roster, { key: 'score', dir: 'desc' }).map((r) => r.key);
  assert.deepEqual(byScoreDesc.slice(0, 3), ['s1', 's7', 's2']);
  const byScoreAsc = sortRosterRows(roster, { key: 'score', dir: 'asc' }).map((r) => r.key);
  assert.deepEqual(byScoreAsc.slice(0, 3), ['s2', 's7', 's1'], 'ungraded rows stay last in both directions');

  const byStatus = sortRosterRows(roster, { key: 'status', dir: 'asc' }).map((r) => r.key);
  assert.equal(byStatus[0], 's4', 'in-progress attempts sort first');
  assert.equal(byStatus.at(-1), 'u5', 'not-started students sort last');
  assert.deepEqual(byStatus.slice(1, 4), ['s1', 's2', 's3'], 'equal status ties break by name');

  for (const key of ['name', 'rollNo', 'email', 'evaluation', 'progress', 'timeTakenSec', 'startedAt', 'submittedAt', 'lastSavedAt', 'violations', 'violationScore', 'flagged']) {
    const asc = sortRosterRows(roster, { key, dir: 'asc' });
    assert.equal(asc.length, roster.length, `${key} sort keeps every row`);
    assert.deepEqual(sortRosterRows([...roster].reverse(), { key, dir: 'asc' }).map((r) => r.key), asc.map((r) => r.key), `${key} sort is deterministic`);
  }
});

test('client pagination clamps the page and reports the slice start', () => {
  const rows = Array.from({ length: 230 }, (_, i) => ({ key: `k${i}` }));
  const page = paginateRows(rows, 3, 100);
  assert.equal(page.rows.length, 30);
  assert.equal(page.start, 200);
  assert.equal(page.totalPages, 3);
  assert.equal(paginateRows(rows, 9, 200).page, 2);
  assert.equal(paginateRows([], 4, 25).page, 1);
});

test('stats are percentage based with correct pass rate and outcome counts', () => {
  const stats = computeRosterStats(roster, { passPercentage: 40 });
  assert.equal(stats.total, 7);
  assert.equal(stats.notStarted, 1);
  assert.equal(stats.inProgress, 1);
  assert.equal(stats.submitted, 5);
  assert.equal(stats.started, 6);
  assert.equal(stats.graded, 3);
  assert.equal(stats.evaluating, 1);
  assert.equal(stats.needsReview, 1);
  assert.equal(stats.avgPercentage, 56.7);
  assert.equal(stats.minPercentage, 20);
  assert.equal(stats.maxPercentage, 90);
  assert.equal(stats.passRate, 66.7, 'passed over graded');
  assert.deepEqual(stats.distribution, [1, 0, 1, 1], '20% -> 0-25, 60% -> 51-75, 90% -> 76-100');
  assert.deepEqual(stats.outcome, { passed: 2, failed: 1, graded: 0, evaluating: 1, needs_review: 1, in_progress: 1, not_started: 1 });
  assert.equal(stats.flaggedSessions, 2);
  assert.equal(stats.topViolator.key, 's2');

  const empty = computeRosterStats([]);
  assert.equal(empty.avgPercentage, null);
  assert.equal(empty.passRate, null);
});

test('legacy report rows map to roster rows with percentages from raw marks', () => {
  const mapped = legacyReportRowToRoster({ _id: 'sub-9', studentName: 'Hari', studentId: 'R-9', status: 'submitted', score: 15, totalMarks: 30, evaluationStatus: 'completed', tabSwitches: 2 }, { passPercentage: 40 });
  assert.equal(mapped.key, 'sub-9');
  assert.equal(mapped.rollNo, 'R-9');
  assert.equal(mapped.percentage, 50);
  assert.equal(mapped.passed, true);
  const processing = legacyReportRowToRoster({ _id: 'sub-10', status: 'submitted', score: 0, totalMarks: 30, evaluationStatus: 'processing' });
  assert.equal(processing.score, null, 'unevaluated legacy rows carry no score');
});

test('admin evaluation labels only flag submitted attempts', () => {
  assert.equal(assessmentEvaluationLabel({ status: 'submitted', evaluationStatus: 'processing' }), 'Evaluating…');
  assert.equal(assessmentEvaluationLabel({ status: 'submitted', evaluationStatus: 'failed' }), 'Needs review');
  assert.equal(assessmentEvaluationLabel({ status: 'in_progress', evaluationStatus: 'processing' }), '');
  assert.equal(assessmentEvaluationLabel({ status: 'submitted', evaluationStatus: 'completed' }), '');
});

test('students see a result only when released, evaluated and scored', () => {
  const released = { permissions: { resultReleased: true }, evaluationStatus: 'completed', score: 7 };
  assert.equal(isResultAnnounced(released), true);
  assert.equal(isResultAnnounced({ ...released, permissions: { resultReleased: false } }), false);
  assert.equal(isResultAnnounced({ ...released, evaluationStatus: 'processing' }), false);
  assert.equal(isResultAnnounced({ ...released, score: null }), false);
  assert.equal(isResultAnnounced({ ...released, score: 0 }), true, 'a zero score is still a result');
});

test('relative age label for the live indicator', () => {
  assert.equal(formatRelativeAge(null), 'never');
  assert.equal(formatRelativeAge(1000, 3000), 'just now');
  assert.equal(formatRelativeAge(0, 12000), '12s ago');
  assert.equal(formatRelativeAge(0, 125000), '2m ago');
});
