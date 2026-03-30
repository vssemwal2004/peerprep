import rateLimit from 'express-rate-limit';

/**
 * SECURITY: Rate Limiting Middleware
 * 
 * Protects against:
 * - Brute force attacks on authentication
 * - API abuse and resource exhaustion
 * - Automated scraping
 * - DoS attacks
 * 
 * All limits are set generously to never block legitimate users
 * while protecting against malicious patterns.
 */

/**
 * SECURITY: Per-Email Rate Limiting for Password Reset
 * 
 * This prevents email bombing attacks where an attacker repeatedly
 * requests password resets for a victim's email address.
 * 
 * Unlike IP-based limiting, this ensures:
 * - Each email can only receive X reset emails per time window
 * - One user's abuse doesn't affect other users
 * - Attackers can't spam a specific user from multiple IPs
 */
const emailResetAttempts = new Map(); // Map<email, { count: number, resetTime: number }>

const EMAIL_RESET_WINDOW_MS = 2 * 60 * 60 * 1000;  // 2 hour window
const EMAIL_RESET_MAX_ATTEMPTS = 1; // Max 1 reset email per 2 hours per email address
const MAX_TRACKED_EMAILS = 10000; // Maximum emails to track (prevents memory exhaustion)

/**
 * Clean up expired entries periodically to prevent memory leaks
 * Runs every 15 minutes - very lightweight operation
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [email, data] of emailResetAttempts.entries()) {
    if (now > data.resetTime) {
      emailResetAttempts.delete(email);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Rate Limiter] Cleaned ${cleaned} expired email entries. Current size: ${emailResetAttempts.size}`);
  }
}, 15 * 60 * 1000); // Clean up every 15 minutes

/**
 * Check if email has exceeded reset request limit
 * @param {string} email - The email address to check
 * @returns {{ allowed: boolean, remainingAttempts: number, resetTime: number }}
 */
export function checkEmailResetLimit(email) {
  if (!email) return { allowed: true, remainingAttempts: EMAIL_RESET_MAX_ATTEMPTS, resetTime: 0 };
  
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const data = emailResetAttempts.get(normalizedEmail);
  
  // No previous attempts or window expired
  if (!data || now > data.resetTime) {
    return { 
      allowed: true, 
      remainingAttempts: EMAIL_RESET_MAX_ATTEMPTS,
      resetTime: 0
    };
  }
  
  // Check if limit exceeded
  if (data.count >= EMAIL_RESET_MAX_ATTEMPTS) {
    const minutesLeft = Math.ceil((data.resetTime - now) / (60 * 1000));
    return { 
      allowed: false, 
      remainingAttempts: 0,
      resetTime: data.resetTime,
      minutesLeft
    };
  }
  
  return { 
    allowed: true, 
    remainingAttempts: EMAIL_RESET_MAX_ATTEMPTS - data.count,
    resetTime: data.resetTime
  };
}

/**
 * Record a password reset attempt for an email
 * @param {string} email - The email address that requested reset
 */
export function recordEmailResetAttempt(email) {
  if (!email) return;
  
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const data = emailResetAttempts.get(normalizedEmail);
  
  // MEMORY PROTECTION: If map is too large, clean expired entries first
  if (emailResetAttempts.size >= MAX_TRACKED_EMAILS) {
    for (const [e, d] of emailResetAttempts.entries()) {
      if (now > d.resetTime) {
        emailResetAttempts.delete(e);
      }
    }
    // If still too large after cleanup, remove oldest entries
    if (emailResetAttempts.size >= MAX_TRACKED_EMAILS) {
      const entriesToRemove = emailResetAttempts.size - MAX_TRACKED_EMAILS + 100;
      let removed = 0;
      for (const key of emailResetAttempts.keys()) {
        if (removed >= entriesToRemove) break;
        emailResetAttempts.delete(key);
        removed++;
      }
      console.warn(`[Rate Limiter] Memory limit reached, removed ${removed} oldest entries`);
    }
  }
  
  // Start new window or window expired
  if (!data || now > data.resetTime) {
    emailResetAttempts.set(normalizedEmail, {
      count: 1,
      resetTime: now + EMAIL_RESET_WINDOW_MS
    });
    return;
  }
  
  // Increment existing count
  data.count++;
  emailResetAttempts.set(normalizedEmail, data);
}

// Strict rate limiting for authentication endpoints
// Prevents brute force password attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window (generous for legitimate retries)
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests from count
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    console.warn(`[SECURITY] Rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many attempts. Please try again after 15 minutes.'
    });
  }
});

// Password reset limiter - prevent mass email bombing
// Rate limits by email address instead of IP to allow different users
// to reset passwords independently, while preventing abuse of a single email
export const passwordResetLimiter = rateLimit({
  windowMs: 2 * 60 * 60 * 1000, // 2 hours
  max: 3, // 3 password reset requests per 2 hours per email
  message: 'Too many password reset requests',
  standardHeaders: true,
  legacyHeaders: false,
  // Use email as the key instead of IP address
  keyGenerator: (req) => {
    // Extract email from request body and normalize it
    const email = req.body?.email || req.body?.identifier || '';
    return email.trim().toLowerCase() || req.ip; // Fallback to IP if no email provided
  },
  handler: (req, res) => {
    const email = req.body?.email || req.body?.identifier || '';
    console.warn(`[SECURITY] Password reset limit exceeded for email: ${email} from IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many password reset requests. Please try again later.'
    });
  }
});

// File upload limiter - prevent storage exhaustion attacks
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per 15 minutes
  message: 'Too many upload requests',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SECURITY] Upload limit exceeded for ${req.ip}`);
    res.status(429).json({
      error: 'Upload rate limit exceeded. Please wait before uploading again.'
    });
  }
});

// Strict limiter for expensive operations (bulk operations, CSV processing)
export const bulkOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 bulk operations per hour
  message: 'Too many bulk operation requests',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SECURITY] Bulk operation limit exceeded for ${req.ip}`);
    res.status(429).json({
      error: 'Bulk operation rate limit exceeded. Please wait before retrying.'
    });
  }
});

// General API rate limiter - prevents resource exhaustion
// Applied to all API routes by default
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 minutes (very generous for normal usage)
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip static health checks
  skip: (req) => req.path === '/api/health',
  handler: (req, res) => {
    console.warn(`[SECURITY] API rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Rate limit exceeded. Please slow down your requests.'
    });
  }
});

// Feedback submission limiter - prevent spam feedback
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 feedback submissions per hour (enough for legitimate use)
  message: 'Too many feedback submissions',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SECURITY] Feedback limit exceeded for user ${req.user?._id || req.ip}`);
    res.status(429).json({
      error: 'Feedback submission rate limit exceeded. Please wait before submitting again.'
    });
  }
});

// Compiler execution limiter - protects free Judge0 capacity from spam
export const compilerExecutionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 60, // 60 executions per 10 minutes per user/IP
  message: 'Too many compiler execution requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  handler: (req, res) => {
    console.warn(`[SECURITY] Compiler execution limit exceeded for ${req.user?._id || req.ip}`);
    res.status(429).json({
      error: 'Compiler rate limit exceeded. Please wait a moment before retrying.'
    });
  }
});
/**
 * WHY THIS IS SAFE:
 * - All limits are very generous and won't affect legitimate users
 * - Returns standard 429 status code (existing clients should handle gracefully)
 * - Preserves existing error format { error: "message" }
 * - Only adds headers, doesn't change response bodies
 * - No breaking changes to any existing functionality
 */

