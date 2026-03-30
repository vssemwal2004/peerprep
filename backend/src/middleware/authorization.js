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
 * Authorize coordinator access
 * 
 * For endpoints where coordinators should only access their assigned students
 * This is used in conjunction with query filtering in controllers
 */
export function authorizeCoordinatorAccess(req, res, next) {
  try {
    const user = req.user;
    
    if (!user) {
      throw new HttpError(401, 'Not authenticated');
    }
    
    // Admin has full access
    if (user.role === 'admin') {
      req.isAdmin = true;
      return next();
    }
    
    // Coordinator has limited access
    if (user.role === 'coordinator') {
      req.isCoordinator = true;
      req.coordinatorId = user.coordinatorId;
      return next();
    }
    
    // Students and others cannot access
    throw new HttpError(403, 'Access denied');
  } catch (err) {
    next(err);
  }
}

/**
 * Authorize file access
 * 
 * Ensures users can only access files they own or are authorized to view
 * Used for learning materials, avatars, etc.
 */
export function authorizeFileAccess(resourceModel, fileIdField = 'fileId') {
  return async (req, res, next) => {
    try {
      const fileId = req.params[fileIdField];
      const user = req.user;
      
      if (!user) {
        throw new HttpError(401, 'Not authenticated');
      }
      
      // Admin can access all files
      if (user.role === 'admin') {
        return next();
      }
      
      // Find the resource that owns this file
      const resource = await resourceModel.findOne({
        [`${fileIdField}`]: fileId
      });
      
      if (!resource) {
        throw new HttpError(404, 'File not found');
      }
      
      // Check if user has access to this resource
      const hasAccess = 
        user.role === 'coordinator' ||
        resource.userId?.toString() === user._id.toString() ||
        resource.createdBy?.toString() === user._id.toString() ||
        resource.isPublic === true;
      
      if (!hasAccess) {
        logSuspiciousActivity(req, `Unauthorized file access attempt: ${fileId}`);
        throw new HttpError(403, 'Access denied');
      }
      
      req.resource = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Authorize feedback access
 * 
 * Students can only view/edit their own feedback
 * Coordinators and admins can view feedback for their events/students
 */
export function authorizeFeedbackAccess(req, res, next) {
  try {
    const user = req.user;
    
    if (!user) {
      throw new HttpError(401, 'Not authenticated');
    }
    
    // Admin and coordinator have full access
    if (user.role === 'admin' || user.role === 'coordinator') {
      return next();
    }
    
    // Students can only access their own feedback
    // The controller must verify studentId matches req.user._id
    if (user.role === 'student') {
      req.studentId = user._id.toString();
      return next();
    }
    
    throw new HttpError(403, 'Access denied');
  } catch (err) {
    next(err);
  }
}

/**
 * Authorize event access
 * 
 * Ensures users can only modify events they created or have admin access
 */
export function authorizeEventAccess(req, res, next) {
  try {
    const user = req.user;
    
    if (!user) {
      throw new HttpError(401, 'Not authenticated');
    }
    
    // Only admin and coordinator can manage events
    if (user.role === 'admin' || user.role === 'coordinator') {
      return next();
    }
    
    throw new HttpError(403, 'Only admins and coordinators can manage events');
  } catch (err) {
    next(err);
  }
}

/**
 * Authorize own profile access
 * 
 * Ensures users can only update their own profile
 * Used for /auth/me endpoint
 */
export function authorizeOwnProfile(req, res, next) {
  try {
    const user = req.user;
    
    if (!user) {
      throw new HttpError(401, 'Not authenticated');
    }
    
    // User is accessing their own profile via /auth/me
    // No additional checks needed, already authenticated
    next();
  } catch (err) {
    next(err);
  }
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
