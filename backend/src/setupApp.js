import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import routes from './routes/index.js';
import { HttpError, notFound, errorHandler } from './utils/errors.js';
import { mongoSanitizeMiddleware, xssProtectionMiddleware } from './middleware/sanitization.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { apiRequestTimeout } from './middleware/requestTimeout.js';

const app = express();

const configuredOrigins = String(process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('FRONTEND_ORIGIN must be configured in production');
}

if (process.env.TRUST_PROXY) {
  const trustProxy = /^\d+$/.test(process.env.TRUST_PROXY)
    ? Number(process.env.TRUST_PROXY)
    : process.env.TRUST_PROXY;
  app.set('trust proxy', trustProxy);
}

// Gzip/Brotli compression - reduces response size by 3-5x
app.use(compression());

// Security headers - helmet with safe defaults
app.use(helmet({
  contentSecurityPolicy: false, // Don't break existing frontend
  crossOriginEmbedderPolicy: false // Don't break existing functionality
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && configuredOrigins.length === 0)) {
      return callback(null, true);
    }
    return callback(new HttpError(403, 'Origin not allowed by CORS'));
  },
  credentials: true,
}));

// SECURITY: Cookie parser for HttpOnly JWT cookies
app.use(cookieParser());

// Body parsing with size limits (already safe at 2mb)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Input sanitization - prevents NoSQL injection and XSS
app.use(mongoSanitizeMiddleware);
// NOTE: Do not sanitize compiler payloads with xss-clean.
// It escapes angle brackets in source code (e.g., <bits/stdc++.h> -> &lt;bits...),
// which breaks compilation and makes Judge0 output confusing.
function collectExecutableCodeFields(value, path = [], preserved = []) {
  if (!value || typeof value !== 'object') return preserved;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectExecutableCodeFields(entry, [...path, index], preserved));
    return preserved;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    const nextPath = [...path, key];
    const isCodeMap = ['codeTemplates', 'referenceSolutions', 'templates'].includes(key)
      && entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue);
    const isDirectSource = ['sourceCode', 'source_code'].includes(key) && typeof entryValue === 'string';
    const isLanguageCode = key === 'code' && typeof entryValue === 'string' && typeof value.language === 'string';

    if (isCodeMap || isDirectSource || isLanguageCode) {
      preserved.push({ path: nextPath, value: isCodeMap ? { ...entryValue } : entryValue });
      return;
    }
    collectExecutableCodeFields(entryValue, nextPath, preserved);
  });

  return preserved;
}

function restoreExecutableCodeFields(root, preserved = []) {
  preserved.forEach(({ path, value }) => {
    let target = root;
    for (let index = 0; index < path.length - 1; index += 1) {
      if (!target || typeof target !== 'object') return;
      target = target[path[index]];
    }
    if (target && typeof target === 'object') {
      target[path[path.length - 1]] = value;
    }
  });
}

app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/compiler') ||
    req.path.startsWith('/api/execute') ||
    req.path.startsWith('/compiler') ||
    req.path.startsWith('/api/email-templates')
  ) {
    return next();
  }
  const preservedCode = collectExecutableCodeFields(req.body);
  return xssProtectionMiddleware(req, res, () => {
    restoreExecutableCodeFields(req.body, preservedCode);
    next();
  });
});

// Request logging - use 'combined' in production, 'dev' in development
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Platform-wide request time budget. Slow endpoints fail fast instead of
// tying up production workers and making dashboards wait indefinitely.
app.use('/api', apiRequestTimeout);

// General API rate limiting (generous limits)
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
