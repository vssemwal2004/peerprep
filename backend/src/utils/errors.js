export function notFound(req, res, next) {
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(err, req, res, next) {
  // Normalize common Mongoose casting errors so they don't appear as opaque 500s
  if (err?.name === 'CastError') {
    err.status = 400;
    err.message = 'Invalid identifier';
  }

  const status = err.status || 500;

  // SECURITY: Log server-side but avoid scary logs for expected auth failures
  const logPayload = {
    message: err.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    user: req.user?._id
  };

  // Only include stack traces for 5xx or unexpected 4xx
  const includeStack = status >= 500 || (status >= 400 && status !== 401 && status !== 403);
  if (includeStack) logPayload.stack = err.stack;

  if (status === 401 || status === 403) {
    console.warn('[AUTH]', logPayload);
  } else if (status >= 400 && status < 500) {
    console.warn('[WARN]', logPayload);
  } else {
    console.error('[ERROR]', logPayload);
  }
  
  // SECURITY: In production, hide internal error details
  // Development: show full error for debugging
  if (process.env.NODE_ENV === 'production' && status === 500) {
    // Generic message for 500 errors in production
    res.status(500).json({ error: 'Internal server error' });
  } else {
    // Show actual error message for client errors (4xx) or in development
    res.status(status).json({ error: err.message || 'Server Error' });
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
