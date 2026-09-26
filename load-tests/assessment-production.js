import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';
import { buildAnswerCatalog, changedAnswerBatch, answersMatch } from './assessment-workload.js';

// Remote writes require an explicit URL and a confirmation tied to one fixture.
const baseUrl = String(__ENV.BASE_URL || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
const assessmentId = String(__ENV.ASSESSMENT_ID || '').trim();
const vus = Math.max(1, Number.parseInt(__ENV.VUS || '10', 10));
const activeSeconds = Math.max(30, Number.parseInt(__ENV.ACTIVE_SECONDS || '180', 10));
const spread = Math.max(0, Number.parseInt(__ENV.START_SPREAD_SECONDS || '30', 10));
const submitWave = __ENV.SUBMIT_WAVE === 'true';
const assessmentPassword = String(__ENV.ASSESSMENT_PASSWORD || '');
const accounts = new SharedArray('load-test-accounts', () => {
  const parsed = JSON.parse(open(__ENV.USERS_FILE || './users.local.json'));
  if (!Array.isArray(parsed)) throw new Error('USERS_FILE must contain a JSON array of dedicated test accounts.');
  return parsed;
});
const heartbeatDuration = new Trend('assessment_heartbeat_duration', true);
const autosaveDuration = new Trend('assessment_autosave_duration', true);
const submitDuration = new Trend('assessment_submit_duration', true);
const businessFailures = new Rate('assessment_business_failures');
const persistedAnswers = new Rate('assessment_persisted_answers');
const completedUsers = new Counter('assessment_completed_users');

export const options = {
  scenarios: { assessment: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: `${activeSeconds + spread + 300}s` } },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    assessment_heartbeat_duration: ['p(95)<1000'],
    assessment_autosave_duration: ['p(95)<2000'],
    assessment_submit_duration: ['p(95)<5000'],
    assessment_business_failures: [{ threshold: 'rate==0', abortOnFail: true, delayAbortEval: '30s' }],
    assessment_persisted_answers: ['rate==1'],
    assessment_completed_users: [`count==${vus}`],
  },
  userAgent: 'PeerPrep-Controlled-Load-Test/2.0',
};

function request(method, path, body, operation) {
  return http.request(method, `${baseUrl}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' }, tags: { operation }, timeout: '15s',
  });
}
function requireSuccess(response, operation) {
  const success = check(response, { [`${operation}: HTTP 2xx`]: (value) => value.status >= 200 && value.status < 300 });
  businessFailures.add(!success, { operation });
  if (!success) fail(`${operation}: HTTP ${response.status}. Inspect server logs; body omitted to avoid leaking credentials.`);
  try { return response.json(); } catch { fail(`${operation}: response is not JSON`); }
}
function requireBusiness(condition, message) {
  businessFailures.add(!condition);
  if (!condition) fail(message);
}

export function setup() {
  if (!/^[0-9a-f]{24}$/i.test(assessmentId)) throw new Error('Set ASSESSMENT_ID to a dedicated load-test assessment.');
  if (__ENV.CONFIRM_LOAD_TEST !== assessmentId) throw new Error('Set CONFIRM_LOAD_TEST to the exact ASSESSMENT_ID. This script creates real attempts.');
  if (!Number.isFinite(vus) || accounts.length < vus) throw new Error(`Need at least ${vus} distinct test accounts.`);
  const identifiers = accounts.slice(0, vus).map((entry) => String(entry.identifier || '').toLowerCase());
  if (new Set(identifiers).size !== vus || identifiers.some((value) => !value)) throw new Error('Each VU requires a distinct test account.');
  if (accounts.slice(0, vus).some((entry) => !entry.password)) throw new Error('Every test account needs a password.');
  completedUsers.add(0);
  requireSuccess(request('GET', '/health/ready', undefined, 'readiness'), 'readiness');
  const now = Date.now();
  return { runId: `assessment-load-${now}`, submitAt: now + (spread + activeSeconds + 30) * 1000 };
}

export default function runAssessment(data) {
  const account = accounts[__VU - 1];
  if (spread) sleep(Math.random() * spread);
  requireSuccess(request('POST', '/auth/login', { identifier: account.identifier, password: account.password }, 'login'), 'login');
  const listing = requireSuccess(request('GET', '/student/assessments', undefined, 'list'), 'list');
  const list = Array.isArray(listing) ? listing : listing.assessments || [];
  const target = list.find((item) => String(item._id || item.id) === assessmentId);
  requireBusiness(Boolean(target && /^(\[)?LOAD[ -]TEST/i.test(String(target.title || ''))), 'Target title must start LOAD TEST.');
  const start = requireSuccess(request('POST', `/student/assessment/${assessmentId}/start`, { password: assessmentPassword }, 'start'), 'start');
  requireBusiness(start.submission?.status === 'not_started', 'Use a fresh assessment per run; attempt is already active or completed.');
  requireBusiness(!start.assessment?.settings?.questionSelectionEnabled, 'Use a fixture without question-selection limits.');
  requireBusiness((start.requiredSecuritySteps || []).every((step) => ['environment', 'final'].includes(step)),
    'HTTP test requires camera/location/fullscreen disabled on its fixture. Browser proctoring needs a separate test.');
  const sessionId = `${data.runId}-${__VU}`;
  const attemptGeneration = Number(start.submission?.attemptGeneration || 1);
  const context = { sessionId, attemptGeneration, submissionId: start.submission?._id };
  for (const step of start.requiredSecuritySteps || []) {
    requireSuccess(request('POST', `/student/assessment/${assessmentId}/setup-step`, { ...context, step }, 'setup'), 'setup');
  }
  const begin = requireSuccess(request('POST', `/student/assessment/${assessmentId}/begin`, context, 'begin'), 'begin');
  const catalog = buildAnswerCatalog(begin.assessment || start.assessment);
  requireBusiness(catalog.length > 0, 'Fixture needs MCQ/written questions; coding execution is a separate workload.');
  let sequence = Number(begin.submission?.lastAcceptedBatch?.sequence || 0);
  const answerMap = new Map();
  const finishAt = submitWave ? data.submitAt : Date.now() + activeSeconds * 1000;
  let nextSaveAt = 0;
  let cycle = 0;
  while (Date.now() < finishAt) {
    const heartbeat = request('POST', `/student/assessment/${assessmentId}/heartbeat`, {
      ...context, status: { fullscreen: true, tabActive: true, cameraActive: true, idle: false, duplicateTab: false },
      violationScore: 0, pauseCount: 0, cameraFlags: 0,
    }, 'heartbeat');
    heartbeatDuration.add(heartbeat.timings.duration);
    requireSuccess(heartbeat, 'heartbeat');
    if (Date.now() >= nextSaveAt) {
      const changes = changedAnswerBatch(catalog, cycle, `${data.runId}-${__VU}`);
      changes.forEach((answer) => answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer));
      sequence += 1;
      const save = request('PATCH', `/student/assessment/${assessmentId}/answers`, {
        ...context, mutationId: `${sessionId}-save-${sequence}`, saveSequence: sequence, answers: changes,
      }, 'autosave');
      autosaveDuration.add(save.timings.duration);
      const saved = requireSuccess(save, 'autosave');
      requireBusiness(saved.acceptedSequence === sequence && saved.answersAccepted !== false, 'Save acknowledgement incorrect or rejected.');
      nextSaveAt = Date.now() + 25000 + Math.random() * 10000;
      cycle += 1;
    }
    if (cycle % 3 === 0) {
      requireSuccess(request('POST', `/student/assessment/${assessmentId}/monitoring`, {
        ...context, eventId: `${sessionId}-event-${Date.now()}`,
        event: { eventId: `${sessionId}-event-${Date.now()}`, type: 'load_test_heartbeat', at: new Date().toISOString(), message: 'Dedicated load-test event.', meta: { runId: data.runId } },
      }, 'monitoring'), 'monitoring');
    }
    sleep(Math.max(0, Math.min(15 + Math.random() * 5, (finishAt - Date.now()) / 1000)));
  }
  // Final snapshot includes a last edit not previously autosaved.
  changedAnswerBatch(catalog, cycle + 1, `${data.runId}-${__VU}`, catalog.length)
    .forEach((answer) => answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer));
  const answers = [...answerMap.values()];
  const finalPayload = { assessmentId, ...context, mutationId: `${sessionId}-final`, saveSequence: sequence + 1, status: 'submitted', answers };
  const submitted = request('POST', '/student/assessment/submit', finalPayload, 'submit');
  submitDuration.add(submitted.timings.duration);
  const final = requireSuccess(submitted, 'submit');
  requireBusiness(Boolean(final.submissionReceipt || final.receipt) && final.answersAccepted !== false, 'Final answers were not accepted with a receipt.');
  const duplicate = requireSuccess(request('POST', '/student/assessment/submit', finalPayload, 'duplicate_submit'), 'duplicate_submit');
  requireBusiness(JSON.stringify(duplicate.submissionReceipt || duplicate.receipt) === JSON.stringify(final.submissionReceipt || final.receipt), 'Duplicate submit returned a different receipt.');
  const readBack = requireSuccess(request('GET', `/student/assessment/${assessmentId}`, undefined, 'verify'), 'verify');
  const verified = readBack.submission?.status === 'submitted' && answersMatch(answers, readBack.submission?.answers || []);
  persistedAnswers.add(verified);
  requireBusiness(verified, 'Persisted answer mismatch: test failed despite successful HTTP responses.');
  completedUsers.add(1);
}
