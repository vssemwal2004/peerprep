import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = String(__ENV.BASE_URL || 'https://peerprep.co.in/api').replace(/\/$/, '');
const assessmentId = String(__ENV.ASSESSMENT_ID || '').trim();
const vus = Math.max(1, Number.parseInt(__ENV.VUS || '50', 10));
const activeSeconds = Math.max(30, Number.parseInt(__ENV.ACTIVE_SECONDS || '180', 10));
const startSpreadSeconds = Math.max(0, Number.parseInt(__ENV.START_SPREAD_SECONDS || '30', 10));
const assessmentPassword = String(__ENV.ASSESSMENT_PASSWORD || '');

const accounts = new SharedArray('load-test-accounts', () => {
  const parsed = JSON.parse(open(__ENV.USERS_FILE || './users.production.json'));
  if (!Array.isArray(parsed)) throw new Error('USERS_FILE must contain a JSON array.');
  return parsed;
});

const heartbeatDuration = new Trend('assessment_heartbeat_duration', true);
const autosaveDuration = new Trend('assessment_autosave_duration', true);
const submitDuration = new Trend('assessment_submit_duration', true);
const businessFailures = new Rate('assessment_business_failures');
const completedUsers = new Counter('assessment_completed_users');

export const options = {
  scenarios: {
    assessment: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: `${activeSeconds + startSpreadSeconds + 180}s`,
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: ['p(95)<1500'],
    assessment_heartbeat_duration: [{ threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '60s' }],
    assessment_autosave_duration: ['p(95)<2000'],
    assessment_submit_duration: ['p(95)<5000'],
    assessment_business_failures: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
  },
  noConnectionReuse: false,
  userAgent: 'PeerPrep-Controlled-Load-Test/1.0',
};

function jsonPost(path, body, tags) {
  return jsonRequest('POST', path, body, tags);
}

function jsonPatch(path, body, tags) {
  return jsonRequest('PATCH', path, body, tags);
}

function jsonRequest(method, path, body, tags) {
  return http.request(method, `${baseUrl}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    tags,
    timeout: '15s',
  });
}

function requireSuccess(response, label) {
  const ok = check(response, {
    [`${label} returned 2xx`]: (res) => res.status >= 200 && res.status < 300,
  });
  businessFailures.add(!ok, { operation: label });
  if (!ok) {
    const body = String(response.body || '').slice(0, 300);
    fail(`${label} failed: HTTP ${response.status} ${body}`);
  }
}

export function setup() {
  if (!assessmentId.match(/^[0-9a-f]{24}$/i)) {
    throw new Error('Set ASSESSMENT_ID to the dedicated production load-test assessment id.');
  }
  if (accounts.length < vus) {
    throw new Error(`USERS_FILE has ${accounts.length} accounts but VUS=${vus}.`);
  }
  return { runId: `prod-load-${Date.now()}` };
}

export default function runAssessment(data) {
  const account = accounts[__VU - 1];
  if (!account?.identifier || !account?.password) {
    fail(`Missing identifier/password for VU ${__VU}.`);
  }

  // Avoid a single artificial login spike; normal candidates join over time.
  if (startSpreadSeconds > 0) sleep(Math.random() * startSpreadSeconds);

  const sessionId = `${data.runId}-${__VU}`;
  const answers = account.answers && typeof account.answers === 'object' ? account.answers : {};
  const login = jsonPost('/auth/login', {
    identifier: account.identifier,
    password: account.password,
  }, { operation: 'login' });
  requireSuccess(login, 'login');

  const start = jsonPost(`/student/assessment/${assessmentId}/start`, {
    password: assessmentPassword,
  }, { operation: 'start' });
  requireSuccess(start, 'start');

  const begin = jsonPost(`/student/assessment/${assessmentId}/begin`, {
    sessionId,
  }, { operation: 'begin' });
  requireSuccess(begin, 'begin');

  const startedAt = Date.now();
  let cycle = 0;
  while ((Date.now() - startedAt) / 1000 < activeSeconds) {
    const heartbeat = jsonPost(`/student/assessment/${assessmentId}/heartbeat`, {
      status: {
        fullscreen: true,
        tabActive: true,
        cameraActive: true,
        idle: false,
        duplicateTab: false,
      },
      violationScore: 0,
      pauseCount: 0,
      cameraFlags: 0,
      sessionId,
    }, { operation: 'heartbeat' });
    heartbeatDuration.add(heartbeat.timings.duration);
    requireSuccess(heartbeat, 'heartbeat');

    if (cycle % 2 === 0) {
      const autosave = jsonPatch(`/student/assessment/${assessmentId}/answers`, {
        answers,
        status: 'in_progress',
        tabSwitches: 0,
        fullscreenExits: 0,
        copyPasteCount: 0,
        cameraFlags: 0,
        violationScore: 0,
        pauseCount: 0,
        violations: [],
        sessionId,
      }, { operation: 'autosave' });
      autosaveDuration.add(autosave.timings.duration);
      requireSuccess(autosave, 'autosave');
    }

    if (cycle % 3 === 0) {
      const monitoring = jsonPost(`/student/assessment/${assessmentId}/monitoring`, {
        event: {
          type: 'load_test_heartbeat',
          at: new Date().toISOString(),
          message: 'Controlled production load-test event.',
          meta: { runId: data.runId },
        },
      }, { operation: 'monitoring' });
      requireSuccess(monitoring, 'monitoring');
    }

    cycle += 1;
    sleep(10);
  }

  const submitted = jsonPost('/student/assessment/submit', {
    assessmentId,
    answers,
    status: 'submitted',
    tabSwitches: 0,
    fullscreenExits: 0,
    copyPasteCount: 0,
    cameraFlags: 0,
    violationScore: 0,
    pauseCount: 0,
    violations: [],
    sessionId,
  }, { operation: 'submit' });
  submitDuration.add(submitted.timings.duration);
  requireSuccess(submitted, 'submit');
  completedUsers.add(1);
}
