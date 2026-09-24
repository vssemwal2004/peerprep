const DEFAULT_SLOW_REQUEST_MS = 750;

export function requestPerformance(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const originalEnd = res.end.bind(res);

  res.end = function endWithTiming(...args) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
    }

    const slowRequestMs = Number(process.env.SLOW_REQUEST_THRESHOLD_MS || DEFAULT_SLOW_REQUEST_MS);
    if (durationMs >= slowRequestMs && process.env.NODE_ENV !== 'test') {
      console.warn(`[Performance] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    }
    return originalEnd(...args);
  };

  next();
}

