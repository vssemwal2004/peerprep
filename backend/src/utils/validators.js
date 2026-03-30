import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * SECURITY: Validation Utilities
 * 
 * These validators ensure data integrity and prevent various injection attacks
 * without changing application functionality or API contracts.
 */

/**
 * Validates MongoDB ObjectId format
 * Prevents invalid ID attacks and injection attempts
 * 
 * WHY SAFE: Only validates format, doesn't change functionality
 * Returns same ID if valid, throws error if invalid
 */
export function validateObjectId(id, fieldName = 'ID') {
  if (!id) {
    throw new Error(`${fieldName} is required`);
  }
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    // Log suspicious activity - malformed IDs often indicate attack attempts
    console.warn(`[SECURITY] Invalid ${fieldName} format detected: ${String(id).slice(0, 50)}`);
    throw new Error(`Invalid ${fieldName} format`);
  }
  
  return id;
}

/**
 * Password strength validation
 * 
 * Enforces:
 * - Minimum 8 characters (upgrade from 6)
 * - At least one special character (@ or #)
 * - No common weak patterns
 * 
 * WHY SAFE: Only rejects weak passwords, preserves existing validation logic
 * Existing @ or # requirement is maintained
 */
export function validatePasswordStrength(password, userInputs = []) {
  const errors = [];
  
  // Minimum length - upgraded from 6 to 8 for better security
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  // Preserve existing requirement: must contain @ or #
  if (!/[#@]/.test(password)) {
    errors.push('Password must contain @ or #');
  }
  
  // Additional security: Check for common weak patterns
  const weakPatterns = [
    /^(?:password|admin|user|test|demo)/i,
    /^(?:123|abc|qwerty)/i,
    /^(.)\1{5,}/, // Repeated character (aaaaaa)
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      errors.push('Password contains common weak pattern');
      break;
    }
  }
  
  // Check if password contains user's email or name
  for (const input of userInputs) {
    if (input && password.toLowerCase().includes(input.toLowerCase().slice(0, 4))) {
      errors.push('Password should not contain personal information');
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Email format validation
 * Prevents email injection and ensures valid format
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  
  // RFC 5322 compliant regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(trimmedEmail)) {
    throw new Error('Invalid email format');
  }
  
  // Prevent excessively long emails (DoS prevention)
  if (trimmedEmail.length > 254) {
    throw new Error('Email too long');
  }
  
  return trimmedEmail;
}

/**
 * CSV field sanitization - prevents formula injection
 * 
 * Excel/CSV formula injection occurs when fields starting with =, +, -, @, etc.
 * are executed as formulas when opened in spreadsheet software.
 * 
 * Attack example: =cmd|'/c calc'!A1
 * 
 * WHY SAFE: Only prefixes dangerous fields with single quote to neutralize them.
 * Preserves all data, just makes it safe for Excel/spreadsheet software.
 * The single quote tells Excel to treat it as text, not a formula.
 */
export function sanitizeCsvField(field) {
  if (!field) return field;
  
  const fieldStr = String(field);
  
  // Check if field starts with dangerous characters
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r', '\n'];
  const startsWithDangerous = dangerousChars.some(char => 
    fieldStr.trimStart().startsWith(char)
  );
  
  if (startsWithDangerous) {
    // Prefix with single quote to neutralize formula
    // Excel treats anything starting with ' as literal text
    return "'" + fieldStr;
  }
  
  return fieldStr;
}

/**
 * Sanitize entire CSV row object
 * Applies sanitizeCsvField to all string fields
 */
export function sanitizeCsvRow(row) {
  if (!row || typeof row !== 'object') return row;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeCsvField(value);
  }
  return sanitized;
}

/**
 * Search query sanitization
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 */
export function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') return '';
  
  // Limit length to prevent DoS
  const sanitized = query.slice(0, 200).trim();
  
  // For regex searches, escape special characters
  return sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate cryptographically secure token
 * Used for password reset, email verification, etc.
 */
export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash token for storage
 * Prevents token theft if database is compromised
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate request body fields presence
 * Prevents undefined/null injection
 */
export function requireFields(body, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Sanitize string input
 * Trim whitespace and limit length
 */
export function sanitizeString(str, maxLength = 1000) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLength);
}

/**
 * Validate semester number (1-8)
 */
export function validateSemester(semester) {
  const num = Number(semester);
  if (isNaN(num) || num < 1 || num > 8 || !Number.isInteger(num)) {
    throw new Error('Semester must be an integer between 1 and 8');
  }
  return num;
}

/**
 * Validate pagination parameters
 * Prevents excessive memory usage
 */
export function validatePagination(page, limit) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  return { page: p, limit: l };
}

/**
 * SECURITY: CSV import resource limits
 * Prevents resource exhaustion attacks via large CSV uploads
 * 
 * WHY SAFE: Only validates limits, rejects oversized uploads
 * Preserves all import functionality for normal uploads
 */
export const CSV_LIMITS = {
  MAX_ROWS: 1000,              // Maximum rows per import
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB max file size
  MAX_FIELD_LENGTH: 500       // Maximum length per field
};

export function validateCsvImport(rows, fileSize) {
  const errors = [];
  
  // Check file size
  if (fileSize && fileSize > CSV_LIMITS.MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum of ${CSV_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  // Check row count
  if (rows && rows.length > CSV_LIMITS.MAX_ROWS) {
    errors.push(`CSV exceeds maximum of ${CSV_LIMITS.MAX_ROWS} rows. Please split into smaller files.`);
  }
  
  // Check individual field lengths
  if (rows && rows.length > 0) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) { // Check first 10 rows as sample
      const row = rows[i];
      for (const [key, value] of Object.entries(row || {})) {
        if (value && String(value).length > CSV_LIMITS.MAX_FIELD_LENGTH) {
          errors.push(`Row ${i + 1}: Field "${key}" exceeds maximum length of ${CSV_LIMITS.MAX_FIELD_LENGTH}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
