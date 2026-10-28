import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmitApiResponse } from '../src/services/compilerExecutionWorkflowService.js';
import { concealHiddenSubmitResult, serializeStudentSubmission, HIDDEN_RUNTIME_ERROR_MESSAGE } from '../src/controllers/compilerHelpers.js';
import { normalizeAssessmentAnswerChanges, TEXT_ANSWER_MAX_CHARS } from '../src/services/assessmentPersistenceService.js';
import { getApiRateLimitKey } from '../src/middleware/rateLimiter.js';
import { getAssessmentAttemptDeadline, SECURITY_PAUSE_CREDIT_CAP_MS } from '../src/services/assessmentExpiryPolicy.js';

const judged = (status, failedCase, extra = {}) => ({
  status, failedCase, totalTestCases: 5, passedTestCases: 1, executionTimeMs: 10, memoryUsedKb: 1, ...extra,
});
const hiddenCase = { index: 3, hidden: true, input: 'SECRET INPUT', expectedOutput: 'SECRET OUT', actualOutput: 'mine' };

test('submit responses never carry a hidden case input, expected output or runtime stderr', () => {
  const wrong = buildSubmitApiResponse(judged('WA', hiddenCase));
  assert.deepEqual(wrong.failedTestCase, { index: 3, hidden: true });
  assert.doesNotMatch(JSON.stringify(wrong), /SECRET/);

  const crashed = buildSubmitApiResponse(judged('RE', hiddenCase, { stderr: 'echo: SECRET INPUT' }));
  assert.equal(crashed.error, HIDDEN_RUNTIME_ERROR_MESSAGE);
  assert.deepEqual(crashed.failedTestCase, { index: 3, hidden: true });
  assert.doesNotMatch(JSON.stringify(crashed), /SECRET/);

  // Legacy failures without the flag count as hidden.
  const legacy = buildSubmitApiResponse(judged('WA', { index: 2, input: 'SECRET', expectedOutput: 'x' }));
  assert.deepEqual(legacy.failedTestCase, { index: 2, hidden: true });

  const compile = buildSubmitApiResponse(judged('CE', hiddenCase, { compileOutput: 'main.c:1: error' }));
  assert.equal(compile.error, 'main.c:1: error');
});

test('sample failures stay visible, and practice-only reveal keeps the hidden case details', () => {
  const sample = buildSubmitApiResponse(judged('WA', { ...hiddenCase, hidden: false }));
  assert.equal(sample.failedTestCase.input, 'SECRET INPUT');
  assert.equal(sample.failedTestCase.hidden, false);
  const sampleCrash = buildSubmitApiResponse(judged('RE', { ...hiddenCase, hidden: false }, { stderr: 'trace' }));
  assert.equal(sampleCrash.error, 'trace');
  const practice = buildSubmitApiResponse(judged('RE', hiddenCase, { stderr: 'trace' }), { revealHidden: true });
  assert.equal(practice.error, 'trace');
  // An infrastructure failure has no failing case and keeps its message.
  assert.equal(buildSubmitApiResponse(judged('RE', undefined, { stderr: 'Execution failed unexpectedly.' })).error, 'Execution failed unexpectedly.');
});

test('stored results and student submission lists conceal hidden failures', () => {
  const stored = { status: 'Wrong Answer', failedTestCase: { index: 4, input: 'SECRET', expected: 'x', actual: 'y' } };
  assert.deepEqual(concealHiddenSubmitResult(stored).failedTestCase, { index: 4, hidden: true });
  const legacyCrash = { status: 'Runtime Error', error: 'SECRET in stderr' };
  assert.equal(concealHiddenSubmitResult(legacyCrash, { legacyRuntime: true }).error, HIDDEN_RUNTIME_ERROR_MESSAGE);
  assert.equal(concealHiddenSubmitResult(legacyCrash).error, 'SECRET in stderr');

  const submission = { mode: 'submit', status: 'RE', stderr: 'SECRET', failedCase: { index: 1 } };
  assert.equal(serializeStudentSubmission({ ...submission, assessmentId: 'a1' }).stderr, HIDDEN_RUNTIME_ERROR_MESSAGE);
  assert.equal(serializeStudentSubmission(submission, { concealHidden: true }).stderr, HIDDEN_RUNTIME_ERROR_MESSAGE);
  assert.equal(serializeStudentSubmission(submission).stderr, 'SECRET');
  assert.equal(serializeStudentSubmission({ ...submission, assessmentId: 'a1', failedCase: { index: 1, hidden: false } }).stderr, 'SECRET');
});

test('answers are validated by delivered question type; long text is cut, not rejected', () => {
  const sections = [
    { type: 'mcq', questions: [{ type: 'mcq', options: ['A', 'B', 'C'] }, { type: 'mcq', options: ['A', 'B'], allowMultipleAnswers: true }] },
    { type: 'short', questions: [{ type: 'one_line' }, { type: 'short' }] },
  ];
  const write = (sectionIndex, questionIndex, answer) => normalizeAssessmentAnswerChanges([{ sectionIndex, questionIndex, answer }], sections)[0].answer;
  assert.equal(write(0, 0, 2), 2);
  assert.equal(write(0, 0, '1'), '1');
  assert.equal(write(0, 0, null), null);
  assert.equal(write(0, 0, ''), '');
  assert.deepEqual(write(0, 1, [0, 1]), [0, 1]);
  for (const [questionIndex, bad] of [[0, 3], [0, -1], [0, 1.5], [0, 'B'], [0, true], [0, { index: 1 }], [1, [0, 1, 2]], [1, [0, 5]]]) {
    assert.throws(() => write(0, questionIndex, bad), { status: 400, code: 'INVALID_ANSWER' }, `mcq answer ${JSON.stringify(bad)}`);
  }
  assert.equal(write(1, 0, 'x'.repeat(5000)).length, TEXT_ANSWER_MAX_CHARS.one_line);
  assert.equal(write(1, 1, 'y'.repeat(50000)).length, TEXT_ANSWER_MAX_CHARS.short);
  assert.equal(write(1, 1, 'fine'), 'fine');
  assert.throws(() => write(1, 0, { keywords: ['a'] }), { status: 400, code: 'INVALID_ANSWER' });
  assert.throws(() => write(1, 1, ['a', 'b']), { status: 400, code: 'INVALID_ANSWER' });
});

test('the global API limiter ignores a client-chosen body identity except on anonymous login/reset', () => {
  const req = (path, email) => ({ path, ip: '10.0.0.1', originalUrl: `/api${path}`, headers: {}, body: { email } });
  assert.equal(getApiRateLimitKey(req('/student/assessment/x/answers', 'a@x.com')), getApiRateLimitKey(req('/student/assessment/x/answers', 'b@x.com')));
  assert.notEqual(getApiRateLimitKey(req('/auth/login', 'a@x.com')), getApiRateLimitKey(req('/auth/login', 'b@x.com')));
  assert.notEqual(getApiRateLimitKey(req('/u/geu-1/auth/password/request-reset', 'a@x.com')), getApiRateLimitKey(req('/u/geu-1/auth/password/request-reset', 'b@x.com')));
});

test('an unresolved security pause adds at most the credit cap, and none after the deadline', () => {
  const assessment = { duration: 30, endTime: new Date('2026-09-23T12:00:00.000Z'), settings: { securityRecheckTimeoutSec: 1800 } };
  const startedAt = new Date('2026-09-23T09:00:00.000Z');
  const base = new Date('2026-09-23T09:30:00.000Z').getTime();
  const before = getAssessmentAttemptDeadline(assessment, { startedAt, pauseStartedAt: new Date('2026-09-23T09:20:00.000Z') });
  assert.equal(before.getTime(), base + SECURITY_PAUSE_CREDIT_CAP_MS);
  const after = getAssessmentAttemptDeadline(assessment, { startedAt, pauseStartedAt: new Date('2026-09-23T09:30:05.000Z') });
  assert.equal(after.getTime(), base);
});
