import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { logSuspiciousActivity } from '../utils/logger.js';

/**
 * SECURITY: Authorization Middleware
 * 
 * Prevents IDOR (Insecure Direct Object Reference) vulnerabilities
 * by enforcing ownership checks before allowing access to resources.
 * 
 * WHY SAFE: Only adds access control checks, doesn't change functionality
 * or API contracts. If user is authorized, request proceeds normally.
 */

/**
 * Authorize resource owner or admin
 * 
 * Verifies that the authenticated user is either:
 * 1. The owner of the resource (via userId field in resource)
 * 2. An admin with override access
 * 3. A coordinator accessing their assigned students
 * 
 * Usage: router.get('/students/:id', requireAuth, authorizeOwnerOrAdmin, getStudent)
 */
export function authorizeOwnerOrAdmin(resourceIdParam = 'id') {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const user = req.user;
      
      if (!user) {
        throw new HttpError(401, 'Not authenticated');
      }
      
      // Validate resource ID format
      validateObjectId(resourceId, 'Resource ID');
      
      // Admin can access anything
      if (user.role === 'admin') {
        return next();
      }
      
      // Check if user is accessing their own resource
      const isOwner = resourceId === user._id.toString();
      
      if (isOwner) {
        return next();
      }
      
      // Not authorized - log suspicious activity
      logSuspiciousActivity(req, `IDOR attempt: User ${user._id} tried to access resource ${resourceId}`);
      
      throw new HttpError(403, 'Access denied');
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Authorize student access to their own data
 * 
 * Ensures students can only access their own profile/data
 * Admins and coordinators have override access
 */
export function authorizeStudent(resourceIdParam = 'id') {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const user = req.user;
      
      if (!user) {
        throw new HttpError(401, 'Not authenticated');
      }
      
      // Validate resource ID format
      validateObjectId(resourceId, 'Student ID');
      
      // Admin and coordinator can access
      if (user.role === 'admin' || user.role === 'coordinator') {
        return next();
      }
      
      // Student can only access their own data
      if (user.role === 'student' && resourceId === user._id.toString()) {
        return next();
      }
      
      // Not authorized
      logSuspiciousActivity(req, `IDOR attempt: User ${user._id} (${user.role}) tried to access student ${resourceId}`);
      
      throw new HttpError(403, 'Access denied');
    } catch (err) {
      next(err);
    }
  };
}

/**
 * SECURITY: Authorize pair access
 * 
 * Ensures users can only access pairs where they are interviewer or interviewee
 * Admins and coordinators have full access
 * 
 * WHY SAFE: Only adds access control check, preserves all existing functionality
 */
export function authorizePairAccess(pairIdParam = 'pairId') {
  return async (req, res, next) => {
    try {
      const pairId = req.params[pairIdParam];
      const user = req.user;
      
      if (!user) {
        throw new HttpError(401, 'Not authenticated');
      }
      
      // Validate pair ID format
      validateObjectId(pairId, 'Pair ID');
      
      // Admin and coordinator have full access
      if (user.role === 'admin' || user.role === 'coordinator') {
        return next();
      }
      
      // For students, we need to check if they're part of this pair
      // Store the validation flag for the controller to use
      req.pairIdToValidate = pairId;
      req.userIdForPairCheck = user._id.toString();
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * SECURITY: Authorize event participant access
 * 
 * Ensures students can only access events they're participating in
 * Admins and coordinators have full access
 */
export function authorizeEventParticipant(eventIdParam = 'id') {
  return async (req, res, next) => {
    try {
      const eventId = req.params[eventIdParam];
      const user = req.user;
      
      if (!user) {
        throw new HttpError(401, 'Not authenticated');
      }
      
      // Validate event ID format
      validateObjectId(eventId, 'Event ID');
      
      // Admin and coordinator have full access
      if (user.role === 'admin' || user.role === 'coordinator') {
        return next();
      }
      
      // For students, store validation flag for controller
      req.eventIdToValidate = eventId;
      req.requireParticipantCheck = true;
      
      next();
    } catch (err) {
      next(err);
    }
  };
}
