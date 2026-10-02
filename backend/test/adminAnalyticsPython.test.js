import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  createAnalyticsPythonClient, createAnalyticsRuntimeToken, resolveAnalyticsPythonConfig,
} from '../src/modules/adminAnalytics/analyticsPython.client.js';
import {
  buildAnalyticsIntelligence, mapAnalyticsContextToPython,
} from '../src/modules/adminAnalytics/analyticsPython.mapper.js';

const SECRET = 'dedicated-analytics-runtime-secret-1234567890';

function env(overrides = {}) {
  return {
    ANALYTICS_PYTHON_ENABLED: 'true', ANALYTICS_PYTHON_URL: 'http://127.0.0.1:8000',
    ANALYTICS_PYTHON_JWT_SECRET: SECRET, ANALYTICS_PYTHON_BREAKER_THRESHOLD: '2',
    ANALYTICS_PYTHON_BREAKER_COOLDOWN_MS: '1000', ...overrides,
  };
}

function responseBody() {
  return {
    api_version: 'v1', formula: { version: 'python-analytics-v1' }, metrics: [], insights: [],
    risk_signals: [],
  };
}

function okResponse(body = responseBody()) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('runtime JWT is short-lived HS256 with the dedicated issuer and audience', () => {
  const token = createAnalyticsRuntimeToken({ secret: SECRET, correlationId: 'request-123', ttlSeconds: 30 });
  const decoded = jwt.verify(token, SECRET, {
    algorithms: ['HS256'], issuer: 'peerprep-api', audience: 'peerprep-analytics-runtime', subject: 'peerprep-api',
  });
  assert.equal(decoded.jti, 'request-123');
  assert.equal(decoded.correlation_id, 'request-123');
  assert.equal(decoded.scope, 'analytics:analyze');
  assert.ok(decoded.exp - decoded.iat <= 30);
  assert.throws(() => createAnalyticsRuntimeToken({ secret: 'too-short', correlationId: 'x' }), /too short/);
});

test('runtime URL validation rejects unsafe origins and accepts explicit private HTTP opt-in', () => {
  assert.throws(() => resolveAnalyticsPythonConfig(env({ ANALYTICS_PYTHON_URL: 'file:///tmp/runtime' })), /HTTP or HTTPS/);
  assert.throws(() => resolveAnalyticsPythonConfig(env({ ANALYTICS_PYTHON_URL: 'https://user:pass@example.com' })), /credentials/);
  assert.throws(() => resolveAnalyticsPythonConfig(env({ ANALYTICS_PYTHON_URL: 'https://example.com/internal' })), /without a path/);
  assert.throws(() => resolveAnalyticsPythonConfig(env({ ANALYTICS_PYTHON_URL: 'http://analytics.internal:8000' })), /must use HTTPS/);
  const config = resolveAnalyticsPythonConfig(env({
    ANALYTICS_PYTHON_URL: 'http://analytics.internal:8000', ANALYTICS_PYTHON_ALLOW_INSECURE_HTTP: 'true',
  }));
  assert.equal(config.analyzeUrl, 'http://analytics.internal:8000/v1/analyze');
});

test('client sends a bounded authenticated request with a matching correlation ID', async () => {
  let captured;
  const client = createAnalyticsPythonClient({
    env: env(), randomUUID: () => 'f1747042-42f4-4f9d-92c7-8e90578b70b1',
    fetchImpl: async (url, options) => { captured = { url, options }; return okResponse(); },
  });
  const result = await client.analyze({ rows: [] });
  assert.equal(result.status, 'ready');
  assert.equal(captured.url, 'http://127.0.0.1:8000/v1/analyze');
  assert.equal(captured.options.headers['x-correlation-id'], 'f1747042-42f4-4f9d-92c7-8e90578b70b1');
  const token = captured.options.headers.authorization.replace('Bearer ', '');
  const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'], issuer: 'peerprep-api', audience: 'peerprep-analytics-runtime' });
  assert.equal(decoded.jti, captured.options.headers['x-correlation-id']);
});

test('client opens its circuit after failures and permits one half-open recovery probe', async () => {
  let time = 10000;
  let calls = 0;
  let recover = false;
  const client = createAnalyticsPythonClient({
    env: env(), now: () => time,
    fetchImpl: async () => { calls += 1; return recover ? okResponse() : new Response('down', { status: 503 }); },
  });
  assert.equal((await client.analyze({ rows: [] })).reason, 'runtime_unavailable');
  assert.equal((await client.analyze({ rows: [] })).reason, 'runtime_unavailable');
  assert.equal((await client.analyze({ rows: [] })).reason, 'circuit_open');
  assert.equal(calls, 2);
  time += 1001; recover = true;
  assert.equal((await client.analyze({ rows: [] })).status, 'ready');
  assert.equal(client.health().status, 'closed');
  assert.equal(calls, 3);
});

test('client rejects oversized payloads and malformed responses with safe reason codes', async () => {
  let calls = 0;
  const bounded = createAnalyticsPythonClient({
    env: env({ ANALYTICS_PYTHON_MAX_PAYLOAD_BYTES: '65536' }),
    fetchImpl: async () => { calls += 1; return okResponse(); },
  });
  assert.equal((await bounded.analyze({ value: 'x'.repeat(70000) })).reason, 'payload_too_large');
  assert.equal(calls, 0);

  const malformed = createAnalyticsPythonClient({
    env: env(), fetchImpl: async () => new Response('<html>bad gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  assert.equal((await malformed.analyze({ rows: [] })).reason, 'invalid_response');
});

test('mapper sends only authorized identifiers, names, and normalized metric rows', () => {
  const student = { _id: 'student-1', name: 'Aman', email: 'private@example.com', studentId: 'ROLL-7' };
  const studentMetrics = new Map([['student-1', {
    coding: { mastery: 75, acceptanceRate: 80, distinctProblems: 3, attempts: 5 },
    assessment: { normalizedScore: -5, completedAttempts: 1 },
    learning: { completionRate: 50, eligibleTopics: 4 }, consistency: 40, activeDays: 8,
    overall: { value: 63, isOverall: true, sourceFamilies: 3 },
  }]]);
  const payload = mapAnalyticsContextToPython({
    students: [student], studentMetrics, analysisId: 'fingerprint',
    query: { sources: ['coding', 'assessment', 'learning'], date: { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') } },
  });
  assert.equal(payload.rows.length, 6);
  assert.equal(payload.rows.find((row) => row.metric_key === 'assessment_score').value, 0);
  assert.deepEqual(new Set(payload.metrics.map((metric) => metric.key)), new Set(['coding_mastery', 'coding_acceptance', 'assessment_score', 'learning_completion', 'consistency', 'overall']));
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /student-1/);
  assert.match(serialized, /Aman/);
  assert.doesNotMatch(serialized, /private@example\.com|ROLL-7/);
});

test('intelligence falls back safely without breaking the dashboard contract', async () => {
  const base = {
    students: [{ _id: 'student-1', name: 'Aman' }],
    studentMetrics: new Map([['student-1', {
      coding: {}, assessment: {}, learning: {}, consistency: null, activeDays: 0,
      overall: { value: null, isOverall: false, sourceFamilies: 0 },
    }]]),
    query: { sources: ['coding'], date: { from: new Date('2026-09-01'), to: new Date('2026-09-30') } },
    analysisId: 'analysis-1',
  };
  const fallback = await buildAnalyticsIntelligence({ ...base, client: async () => { throw new Error('private runtime error'); } });
  assert.deepEqual(fallback, {
    status: 'fallback', formulaVersion: null, metrics: [], insights: [], riskSignals: [], reason: 'request_failed',
  });
  const disabled = await buildAnalyticsIntelligence({ ...base, client: async () => ({ status: 'disabled', reason: 'not_configured' }) });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.reason, 'not_configured');
});
