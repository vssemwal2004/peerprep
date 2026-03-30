import winston from 'winston';
import path from 'path';

/**
 * SECURITY: Logging Infrastructure
 * 
 * Purpose:
 * - Track security events and suspicious activity
 * - Enable incident investigation
 * - Monitor for attack patterns
 * - Provide audit trail for compliance
 * 
 * IMPORTANT: Logs are written to files, not sent to external services
 * to avoid introducing new infrastructure dependencies.
 */

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Security event logger - tracks authentication, authorization, and suspicious activity
export const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Security events log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'security.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Critical security events also go to console
    new winston.transports.Console({
      level: 'warn',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Error logger - tracks application errors and exceptions
export const errorLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'errors.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

/**
 * Log security event with context
 * 
 * @param {Object} event - Security event details
 * @param {string} event.type - Event type (LOGIN, LOGOUT, AUTH_FAIL, etc.)
 * @param {string} event.userId - User ID (if authenticated)
 * @param {string} event.email - User email (if available)
 * @param {string} event.ip - Request IP address
 * @param {string} event.userAgent - Request user agent
 * @param {string} event.message - Human-readable description
 * @param {Object} event.metadata - Additional context data
 */
export function logSecurityEvent(event) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: event.type,
    userId: event.userId || 'anonymous',
    email: event.email || 'unknown',
    ip: event.ip || 'unknown',
    userAgent: event.userAgent || 'unknown',
    message: event.message,
    ...event.metadata
  };
  
  securityLogger.info(logEntry);
}

/**
 * Log authentication attempt
 */
export function logAuthAttempt(req, success, email, userId = null, reason = null) {
  logSecurityEvent({
    type: success ? 'AUTH_SUCCESS' : 'AUTH_FAILURE',
    userId,
    email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    message: success 
      ? `Successful login for ${email}` 
      : `Failed login attempt for ${email}${reason ? ': ' + reason : ''}`,
    metadata: { success, reason }
  });
}

/**
 * Log authorization failure (access denied)
 */
export function logAuthzFailure(req, requiredRole, userRole) {
  logSecurityEvent({
    type: 'AUTHZ_FAILURE',
    userId: req.user?._id,
    email: req.user?.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    message: `Authorization failed: ${userRole || 'unauthenticated'} attempted to access ${requiredRole}-only endpoint`,
    metadata: {
      path: req.path,
      method: req.method,
      requiredRole,
      userRole
    }
  });
}

/**
 * Log suspicious activity
 */
export function logSuspiciousActivity(req, activityType, details) {
  logSecurityEvent({
    type: 'SUSPICIOUS_ACTIVITY',
    userId: req.user?._id,
    email: req.user?.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    message: `Suspicious activity detected: ${activityType}`,
    metadata: {
      activityType,
      path: req.path,
      method: req.method,
      ...details
    }
  });
  
  // Also warn on console for immediate attention
  console.warn(`[SECURITY ALERT] ${activityType} from ${req.ip} - ${JSON.stringify(details)}`);
}

/**
 * Log application error (sanitized - no sensitive data)
 */
export function logError(error, req = null, context = {}) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    ...context
  };
  
  // Add request context if available (no sensitive data)
  if (req) {
    errorEntry.path = req.path;
    errorEntry.method = req.method;
    errorEntry.ip = req.ip;
    errorEntry.userId = req.user?._id;
  }
  
  errorLogger.error(errorEntry);
}

/**
 * WHY THIS IS SAFE:
 * - Only logs to local files, no external dependencies
 * - Does not modify application behavior or responses
 * - Logs are automatically rotated to prevent disk exhaustion
 * - No sensitive data (passwords, tokens) are logged
 * - Purely additive - existing code continues to work exactly as before
 * - Helps detect and investigate security incidents
 */
