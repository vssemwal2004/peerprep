import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';

/**
 * SECURITY: Input Sanitization Middleware
 * 
 * Protects against:
 * - NoSQL injection attacks
 * - XSS (Cross-Site Scripting) attacks
 * - Malicious operator injection ($ne, $gt, etc.)
 * 
 * This middleware sanitizes ALL incoming data (body, query, params)
 * without changing valid user input.
 */

/**
 * MongoDB Query Sanitization
 * 
 * Prevents NoSQL injection by removing or replacing MongoDB operators
 * from user input. Attackers cannot inject { "$ne": null } or similar.
 * 
 * Examples blocked:
 * - { "email": { "$ne": null } } → { "email": { "_ne": null } }
 * - { "password": { "$gt": "" } } → { "password": { "_gt": "" } }
 * 
 * WHY SAFE: Only affects malicious inputs containing MongoDB operators.
 * Normal strings, numbers, and valid data pass through unchanged.
 */
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_', // Replace $ with _ to neutralize operators
  onSanitize: ({ req, key }) => {
    // Log suspicious activity
    console.warn(`[SECURITY] Sanitized MongoDB operator injection attempt from ${req.ip} in field: ${key}`);
  }
});

/**
 * XSS Protection
 * 
 * Removes dangerous HTML/JavaScript from user input to prevent
 * stored XSS attacks. Sanitizes <script> tags, event handlers, etc.
 * 
 * Examples blocked:
 * - <script>alert('xss')</script> → &lt;script&gt;alert('xss')&lt;/script&gt;
 * - <img src=x onerror=alert(1)> → sanitized
 * 
 * WHY SAFE: Only affects HTML/JS tags and event handlers.
 * Normal text, special characters, and valid input unchanged.
 */
export const xssProtectionMiddleware = xss();

/**
 * Additional Input Validation Helpers
 */

/**
 * Validates and sanitizes file upload metadata
 * Prevents path traversal and malicious filenames
 */
export function sanitizeFilename(filename) {
  if (!filename) return null;
  
  // Remove path traversal attempts
  return filename
    .replace(/\.\./g, '') // Remove ../
    .replace(/\//g, '')   // Remove /
    .replace(/\\/g, '')   // Remove \
    .slice(0, 255);       // Limit length
}

/**
 * Validates MongoDB ObjectId format
 * Prevents invalid ID attacks that could cause crashes
 */
export function isValidObjectId(id) {
  if (!id) return false;
  return /^[0-9a-fA-F]{24}$/.test(String(id));
}

/**
 * Sanitizes search query input
 * Prevents regex DoS attacks with malicious patterns
 */
export function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') return '';
  
  // Limit length to prevent DoS
  const sanitized = query.slice(0, 200);
  
  // Escape special regex characters to prevent ReDoS
  return sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Request Size Validation Middleware
 * Already configured in setupApp.js with express.json({ limit: '2mb' })
 * This is correct and safe - prevents memory exhaustion from huge payloads
 */

/**
 * WHY THIS IS SAFE:
 * - Only blocks malicious patterns (NoSQL operators, XSS payloads)
 * - Valid user input passes through completely unchanged
 * - No modification to legitimate data or functionality
 * - Transparent to existing code - works at middleware level
 * - Mongoose queries and user data remain functional
 */
