import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import routes from './routes/index.js';
import { notFound, errorHandler } from './utils/errors.js';
import { mongoSanitizeMiddleware, xssProtectionMiddleware } from './middleware/sanitization.js';
import { apiLimiter } from './middleware/rateLimiter.js';

const app = express();

// Gzip/Brotli compression - reduces response size by 3-5x
app.use(compression());

// Security headers - helmet with safe defaults
app.use(helmet({
  contentSecurityPolicy: false, // Don't break existing frontend
  crossOriginEmbedderPolicy: false // Don't break existing functionality
}));

// CORS - already configured correctly, just preserving it
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || true, credentials: true }));

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
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/compiler') ||
    req.path.startsWith('/compiler') ||
    req.path.startsWith('/api/email-templates')
  ) {
    return next();
  }
  return xssProtectionMiddleware(req, res, next);
});

// Request logging - use 'combined' in production, 'dev' in development
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// General API rate limiting (generous limits)
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
