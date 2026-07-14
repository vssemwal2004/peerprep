const DEFAULT_API_REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 20 * 1000);
const LONG_API_REQUEST_TIMEOUT_MS = Number(process.env.LONG_API_REQUEST_TIMEOUT_MS || 120 * 1000);
const HEALTH_REQUEST_TIMEOUT_MS = Number(process.env.HEALTH_REQUEST_TIMEOUT_MS || 5 * 1000);

const LONG_REQUEST_PATTERNS = [
  /^\/api\/admin\/assessment\/reports\/export/,
  /^\/api\/admin\/assessment\/reports\/export-data/,
  /^\/api\/students\/export/,
  /^\/api\/feedback\/.*export/,
  /^\/api\/compiler\/submit/,
  /^\/api\/compiler\/problems\/[^/]+\/submit/,
  /^\/api\/execute/,
  /^\/api\/student\/assessment\/submit/,
];

function resolveRequestTimeoutMs(req) {
  const requestPath = req.originalUrl?.split('?')[0] || req.path;
  if (requestPath === '/api/health') return HEALTH_REQUEST_TIMEOUT_MS;
  if (LONG_REQUEST_PATTERNS.some((pattern) => pattern.test(requestPath))) {
    return LONG_API_REQUEST_TIMEOUT_MS;
  }
  return DEFAULT_API_REQUEST_TIMEOUT_MS;
}

export function apiRequestTimeout(req, res, next) {
  const timeoutMs = resolveRequestTimeoutMs(req);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    next();
    return;
  }

  let timedOut = false;
  const abortController = new AbortController();
  req.abortSignal = abortController.signal;

  const timer = setTimeout(() => {
    if (res.headersSent || res.writableEnded) return;
    timedOut = true;
    abortController.abort(new Error(`Request exceeded ${timeoutMs}ms`));
    console.warn(`[SECURITY] API request timed out after ${timeoutMs}ms: ${req.method} ${req.originalUrl}`);
    res.status(503).json({
      error: 'Request timed out. Please retry in a moment.',
    });
  }, timeoutMs);

  req.setTimeout(timeoutMs + 1000);
  res.setTimeout(timeoutMs + 1000);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => {
    clearTimeout(timer);
    if (!res.writableEnded && !abortController.signal.aborted) {
      abortController.abort(new Error('Client disconnected'));
    }
  });

  if (timedOut) return;
  next();
}
