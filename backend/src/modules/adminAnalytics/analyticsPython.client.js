import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'peerprep-api';
const AUDIENCE = 'peerprep-analytics-runtime';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'ANALYTICS_PYTHON_CONFIGURATION';
  return error;
}

export function resolveAnalyticsPythonConfig(env = process.env) {
  const isEnabled = enabled(env.ANALYTICS_PYTHON_ENABLED);
  if (!isEnabled) return { enabled: false };
  const rawUrl = String(env.ANALYTICS_PYTHON_URL || '').trim();
  if (!rawUrl || rawUrl.length > 2048) throw configurationError('ANALYTICS_PYTHON_URL is required.');
  let baseUrl;
  try { baseUrl = new URL(rawUrl); }
  catch { throw configurationError('ANALYTICS_PYTHON_URL must be an absolute URL.'); }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw configurationError('Analytics runtime URL must use HTTP or HTTPS.');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw configurationError('Analytics runtime URL cannot contain credentials, a query, or a fragment.');
  if (!baseUrl.hostname || !['', '/'].includes(baseUrl.pathname)) throw configurationError('Analytics runtime URL must be an origin without a path.');
  if (baseUrl.protocol === 'http:' && !LOOPBACK_HOSTS.has(baseUrl.hostname) && !enabled(env.ANALYTICS_PYTHON_ALLOW_INSECURE_HTTP)) {
    throw configurationError('Non-loopback analytics runtime URLs must use HTTPS.');
  }
  const secret = String(env.ANALYTICS_PYTHON_JWT_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw configurationError('ANALYTICS_PYTHON_JWT_SECRET must contain at least 32 bytes.');
  baseUrl.pathname = '/';
  return {
    enabled: true,
    analyzeUrl: new URL('v1/analyze', baseUrl).toString(),
    secret,
    timeoutMs: boundedInteger(env.ANALYTICS_PYTHON_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 250, 15000),
    maxPayloadBytes: boundedInteger(env.ANALYTICS_PYTHON_MAX_PAYLOAD_BYTES, DEFAULT_MAX_PAYLOAD_BYTES, 65536, 10 * 1024 * 1024),
    maxResponseBytes: boundedInteger(env.ANALYTICS_PYTHON_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, 65536, 5 * 1024 * 1024),
    tokenTtlSeconds: boundedInteger(env.ANALYTICS_PYTHON_JWT_TTL_SECONDS, 30, 5, 60),
    breakerThreshold: boundedInteger(env.ANALYTICS_PYTHON_BREAKER_THRESHOLD, 3, 1, 20),
    breakerCooldownMs: boundedInteger(env.ANALYTICS_PYTHON_BREAKER_COOLDOWN_MS, 30000, 1000, 300000),
  };
}

export function createAnalyticsRuntimeToken({ secret, correlationId, ttlSeconds = 30 } = {}) {
  if (Buffer.byteLength(String(secret || ''), 'utf8') < 32) throw configurationError('Analytics runtime JWT secret is too short.');
  return jwt.sign(
    { scope: 'analytics:analyze', correlation_id: correlationId },
    secret,
    {
      algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE,
      subject: ISSUER, jwtid: correlationId, expiresIn: Math.min(Math.max(ttlSeconds, 5), 60),
      header: { typ: 'JWT' },
    },
  );
}

function signRuntimeToken(config, correlationId) {
  return createAnalyticsRuntimeToken({ secret: config.secret, correlationId, ttlSeconds: config.tokenTtlSeconds });
}

async function readBoundedResponse(response, maximumBytes) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maximumBytes) throw Object.assign(new Error('Analytics response is too large.'), { code: 'RESPONSE_TOO_LARGE' });
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw Object.assign(new Error('Analytics response is too large.'), { code: 'RESPONSE_TOO_LARGE' });
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) throw Object.assign(new Error('Analytics response is too large.'), { code: 'RESPONSE_TOO_LARGE' });
  return text;
}

function validateResponse(body) {
  if (!body || body.api_version !== 'v1' || typeof body.formula?.version !== 'string'
    || !Array.isArray(body.metrics) || !Array.isArray(body.insights) || !Array.isArray(body.risk_signals)) {
    throw Object.assign(new Error('Analytics runtime returned an invalid contract.'), { code: 'INVALID_RESPONSE' });
  }
  return body;
}

function safeReason(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return 'timeout';
  if (error?.code === 'RESPONSE_TOO_LARGE') return 'response_too_large';
  if (error?.code === 'INVALID_RESPONSE' || error instanceof SyntaxError) return 'invalid_response';
  if (error?.status === 401 || error?.status === 403) return 'authentication_failed';
  if (error?.status === 413) return 'payload_rejected';
  if (error?.status === 422) return 'contract_rejected';
  if (Number(error?.status) >= 500) return 'runtime_unavailable';
  return 'request_failed';
}

export function createAnalyticsPythonClient({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), randomUUID = () => crypto.randomUUID() } = {}) {
  let config;
  let configFailure = null;
  try { config = resolveAnalyticsPythonConfig(env); }
  catch (error) { config = { enabled: true }; configFailure = error; }
  let circuit = 'closed';
  let failures = 0;
  let openUntil = 0;
  let halfOpenProbe = false;

  function fallback(reason) { return { status: 'fallback', reason }; }

  async function analyze(payload) {
    if (!config.enabled) return { status: 'disabled', reason: 'not_configured' };
    if (configFailure || typeof fetchImpl !== 'function') return fallback('configuration_error');
    let serialized;
    try { serialized = JSON.stringify(payload); }
    catch { return fallback('invalid_payload'); }
    if (Buffer.byteLength(serialized, 'utf8') > config.maxPayloadBytes) return fallback('payload_too_large');
    const currentTime = now();
    if (circuit === 'open') {
      if (currentTime < openUntil) return fallback('circuit_open');
      circuit = 'half-open';
    }
    if (circuit === 'half-open') {
      if (halfOpenProbe) return fallback('circuit_open');
      halfOpenProbe = true;
    }

    const correlationId = randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(config.analyzeUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signRuntimeToken(config, correlationId)}`,
          'content-type': 'application/json', accept: 'application/json',
          'x-correlation-id': correlationId,
        },
        body: serialized,
        signal: controller.signal,
      });
      if (!response?.ok) throw Object.assign(new Error('Analytics runtime request failed.'), { status: Number(response?.status) || 502 });
      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        throw Object.assign(new Error('Analytics runtime returned a non-JSON response.'), { code: 'INVALID_RESPONSE' });
      }
      const result = validateResponse(JSON.parse(await readBoundedResponse(response, config.maxResponseBytes)));
      failures = 0; circuit = 'closed'; openUntil = 0;
      return { status: 'ready', response: result };
    } catch (error) {
      failures += 1;
      if (circuit === 'half-open' || failures >= config.breakerThreshold) {
        circuit = 'open'; openUntil = now() + config.breakerCooldownMs;
      }
      return fallback(safeReason(error));
    } finally {
      clearTimeout(timer);
      halfOpenProbe = false;
    }
  }

  function health() {
    return {
      configured: Boolean(config.enabled),
      ready: Boolean(config.enabled && !configFailure && circuit !== 'open'),
      status: !config.enabled ? 'disabled' : (configFailure ? 'misconfigured' : circuit),
    };
  }

  return { analyze, health };
}

let defaultClient;
let defaultSignature;

function clientSignature(env) {
  return [
    'ANALYTICS_PYTHON_ENABLED', 'ANALYTICS_PYTHON_URL', 'ANALYTICS_PYTHON_ALLOW_INSECURE_HTTP',
    'ANALYTICS_PYTHON_JWT_SECRET', 'ANALYTICS_PYTHON_TIMEOUT_MS', 'ANALYTICS_PYTHON_MAX_PAYLOAD_BYTES',
    'ANALYTICS_PYTHON_MAX_RESPONSE_BYTES', 'ANALYTICS_PYTHON_JWT_TTL_SECONDS',
    'ANALYTICS_PYTHON_BREAKER_THRESHOLD', 'ANALYTICS_PYTHON_BREAKER_COOLDOWN_MS',
  ].map((key) => `${key}=${env[key] || ''}`).join('|');
}

function getDefaultClient() {
  const signature = clientSignature(process.env);
  if (!defaultClient || signature !== defaultSignature) {
    defaultClient = createAnalyticsPythonClient();
    defaultSignature = signature;
  }
  return defaultClient;
}

export function analyzeWithPython(payload) { return getDefaultClient().analyze(payload); }
export function getAnalyticsPythonDependencyHealth() { return getDefaultClient().health(); }

export function analyticsPythonCacheVariant(env = process.env) {
  try {
    const config = resolveAnalyticsPythonConfig(env);
    if (!config.enabled) return 'python-disabled-v1';
    return `python-enabled-v1-${crypto.createHash('sha256').update(`${config.analyzeUrl}:${config.secret}`).digest('hex').slice(0, 12)}`;
  } catch {
    return 'python-misconfigured-v1';
  }
}
