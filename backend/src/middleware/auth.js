import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import crypto from 'crypto';
import { hasCoordinatorPermission } from '../services/coordinatorPermissions.js';

/**
 * Simple in-memory cache for user data to reduce database hits
 * Cache expires after 60 seconds
 */
const userCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds
// Session state changes rarely, but requireAuth runs once for every dashboard
// request. Keep a deliberately short cache so a burst of parallel requests
// performs one MongoDB read instead of one read per request.
const SESSION_CACHE_TTL = Number(process.env.AUTH_SESSION_CACHE_TTL_MS || 5000);
const sessionCache = new Map();

function getCachedUser(userId) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  userCache.delete(userId);
  return null;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, timestamp: Date.now() });
}

export function invalidateUserCache(userId) {
  if (!userId) return;
  const key = String(userId);
  userCache.delete(key);
  sessionCache.delete(key);
}

// Clean up expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, cached] of userCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      userCache.delete(userId);
    }
  }
  for (const [userId, cached] of sessionCache.entries()) {
    if (now - cached.timestamp > SESSION_CACHE_TTL) sessionCache.delete(userId);
  }
}, 5 * 60 * 1000);

async function getSessionState(userId) {
  const key = String(userId);
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) return cached.value;
  const value = await User.findById(userId)
    .select('_id activeSessionToken passwordChangedAt isActive')
    .lean();
  if (value) sessionCache.set(key, { value, timestamp: Date.now() });
  return value;
}

/**
 * SECURITY: JWT Authentication from HttpOnly Cookies
 * 
 * Reads JWT from HttpOnly cookie instead of Authorization header
 * This protects against XSS token theft
 * 
 * WHY SAFE: Preserves all authentication logic, only changes token source
 * Falls back to Authorization header for backwards compatibility during migration
 */
export async function requireAuth(req, res, next) {
  // SECURITY: Try to read token from HttpOnly cookie first (preferred)
  let token = req.cookies?.accessToken;
  
  // Fallback to Authorization header for backwards compatibility
  if (!token) {
    const auth = req.headers.authorization || '';
    token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  }
  
  if (!token) throw new HttpError(401, 'Missing token');
  
  const payload = verifyToken(token);

  // Session-sensitive fields must be read fresh. If activeSessionToken is
  // cached, a just-created login token can be rejected against the old token.
  const sessionState = await getSessionState(payload.sub);
  if (!sessionState) throw new HttpError(401, 'User not found');

  // Try to get stable profile/authorization fields from cache first.
  let user = getCachedUser(payload.sub);
  
  if (!user) {
    // All tokens now resolve to the unified User model
    // Use lean() + select() for faster query - only fetch needed fields
    user = await User.findById(payload.sub)
      .select('_id email name role semester activeSessionToken passwordChangedAt avatarUrl coordinatorId teacherIds studentId course branch college group department phone isSpecialStudent isActive coordinatorPermissions')
      .lean();
    if (!user) throw new HttpError(401, 'User not found');
    
    // Cache the user data
    setCachedUser(payload.sub, user);
  }
  user = {
    ...user,
    activeSessionToken: sessionState.activeSessionToken,
    passwordChangedAt: sessionState.passwordChangedAt,
    isActive: sessionState.isActive,
  };
  if (user.role === 'coordinator' && user.isActive === false) throw new HttpError(403, 'Coordinator account disabled');
  
  // SECURITY: Check if this is the active session for this user
  // When user logs in from a new device, old sessions become invalid
  const currentTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  if (user.activeSessionToken && user.activeSessionToken !== currentTokenHash) {
    // This session was invalidated by a login from another device
    throw new HttpError(401, 'Your account was accessed from another device. Please login again.', { 
      code: 'SESSION_REPLACED'
    });
  }
  
  // SECURITY: Check if password was changed after token was issued
  // This invalidates sessions after password change
  if (user.passwordChangedAt && payload.iat) {
    const passwordChangedTime = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < passwordChangedTime) {
      // Token was issued before password change - invalidate session
      throw new HttpError(401, 'Session expired. Please login again.');
    }
  }
  
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') throw new HttpError(403, 'Admin only');
  next();
}

export function requireAdminOrStudent(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'student')) {
    throw new HttpError(403, 'Admin or Student only');
  }
  next();
}
export function requireAdminCoordinatorOrStudent(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'coordinator' && req.user.role !== 'student')) {
    throw new HttpError(403, 'Admin, Coordinator, or Student only');
  }
  next();
}
export function requireAdminOrCoordinator(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'coordinator')) {
    throw new HttpError(403, 'Admin or Coordinator only');
  }
  next();
}

export function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student') throw new HttpError(403, 'Student only');
  next();
}

export function requireCoordinator(req, res, next) {
  if (!req.user || req.user.role !== 'coordinator') throw new HttpError(403, 'Coordinator only');
  next();
}

export function requireCoordinatorPermission(permission) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Unauthorized');
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'coordinator') throw new HttpError(403, 'Coordinator only');
    if (!hasCoordinatorPermission(req.user, permission)) {
      throw new HttpError(403, 'Coordinator permission required');
    }
    return next();
  };
}


