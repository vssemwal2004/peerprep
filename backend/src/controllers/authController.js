import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { HttpError } from '../utils/errors.js';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { uploadAvatar, deleteAvatar, isCloudinaryConfigured } from '../utils/cloudinary.js';
import { logActivity } from './adminActivityController.js';
import { logStudentActivity } from './activityController.js';
import { autoEnrollStudentInCourses } from './learningController.js';
import { logAuthAttempt, logSuspiciousActivity } from '../utils/logger.js';
import { validatePasswordStrength, validateEmail, generateSecureToken, hashToken } from '../utils/validators.js';
import { checkEmailResetLimit, recordEmailResetAttempt } from '../middleware/rateLimiter.js';
import { createNotification } from '../services/notificationService.js';

// Change password for student (requires current password)
export async function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const currentUser = req.user;
  if (!currentUser) throw new HttpError(401, 'Unauthorized');
  
  if (currentUser.role !== 'student' && currentUser.role !== 'coordinator') throw new HttpError(403, 'Only students or coordinators can change password here');
  if (!currentPassword || !newPassword || !confirmPassword) throw new HttpError(400, 'All fields required');
  if (newPassword !== confirmPassword) throw new HttpError(400, 'New passwords do not match');
  
  // SECURITY: Enhanced password validation
  const passwordValidation = validatePasswordStrength(newPassword, [currentUser.email, currentUser.name]);
  if (!passwordValidation.valid) {
    throw new HttpError(400, passwordValidation.errors.join('; '));
  }
  
  // Fetch the actual Mongoose document (req.user is lean object)
  const user = await User.findById(currentUser._id);
  if (!user) throw new HttpError(404, 'User not found');
  
  // Verify current password
  const ok = await user.verifyPassword(currentPassword);
  if (!ok) throw new HttpError(401, 'Current password incorrect');

  // Capture whether this is the student's very first login/password change
  const wasFirstLogin = user.mustChangePassword === true && user.role === 'student';

  // Update password (all students and coordinators use User model hashing)
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  if (user.role === 'student') {
    try {
      await createNotification({
        userId: user._id,
        title: 'Password Updated',
        message: 'Your password was updated',
        type: 'SYSTEM',
        referenceId: user._id,
        actionUrl: '/student/profile'
      });
    } catch (e) {
      console.error('[changePassword] Notification error:', e.message);
    }
  }

  // Auto-enroll student in all courses for their semester on first login
  if (wasFirstLogin) {
    // Re-fetch with populated semester field (lean object from req.user may be stale)
    const freshStudent = await User.findById(user._id).lean();
    autoEnrollStudentInCourses(freshStudent).then(result => {
      console.log(`[AutoEnroll] Result for student ${user._id}:`, result);
    });
  }
  
  // Log activity
  logActivity({
    userEmail: user.email,
    userRole: user.role,
    actionType: 'UPDATE',
    targetType: user.role === 'student' ? 'STUDENT' : 'COORDINATOR',
    targetId: user._id.toString(),
    description: `Changed password`,
    metadata: {},
    req
  });
  
  res.json({ message: 'Password changed successfully' });
}

// Change password for admin (requires current password) - Separate logic for admin
export async function changeAdminPassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const currentUser = req.user;
  if (!currentUser) throw new HttpError(401, 'Unauthorized');
  
  // Verify user is admin
  if (currentUser.role !== 'admin') throw new HttpError(403, 'Only admins can use this endpoint');
  
  // Validate input
  if (!currentPassword || !newPassword || !confirmPassword) throw new HttpError(400, 'All fields required');
  if (newPassword !== confirmPassword) throw new HttpError(400, 'New passwords do not match');
  
  // SECURITY: Enhanced password validation
  const passwordValidation = validatePasswordStrength(newPassword, [currentUser.email, currentUser.name]);
  if (!passwordValidation.valid) {
    throw new HttpError(400, passwordValidation.errors.join('; '));
  }
  
  // Fetch the actual Mongoose document (req.user is lean object)
  const user = await User.findById(currentUser._id);
  if (!user) throw new HttpError(404, 'User not found');
  
  // Verify current password
  const ok = await user.verifyPassword(currentPassword);
  if (!ok) throw new HttpError(401, 'Current password incorrect');
  
  // Update admin password in database
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  
  console.log(`[Admin Password Change] Password updated for admin: ${user.email}`);
  
  // Log activity
  logActivity({
    userEmail: user.email,
    userRole: user.role,
    actionType: 'UPDATE',
    targetType: 'ADMIN',
    targetId: user._id.toString(),
    description: `Changed admin password`,
    metadata: {},
    req
  });
  
  res.json({ message: 'Admin password changed successfully', email: user.email });
}

export async function seedAdminIfNeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const emailLower = String(email).trim().toLowerCase();
  const existing = await User.findOne({ role: 'admin', email: emailLower });
  if (existing) {
    const forceReset = String(process.env.ADMIN_FORCE_RESET).toLowerCase() === 'true';
    const isDev = process.env.NODE_ENV !== 'production';

    // In development, keep env + DB in sync so local setup is frictionless.
    // In production, only reset when explicitly requested.
    if (forceReset || isDev) {
      existing.passwordHash = await User.hashPassword(password);
      existing.mustChangePassword = false;
      await existing.save();
      console.log(
        '[Admin Seed] Existing admin password synced from ENV for',
        emailLower,
        forceReset ? '(ADMIN_FORCE_RESET=true)' : '(development)'
      );
    }
    return;
  }
  const passwordHash = await User.hashPassword(password);
  await User.create({ role: 'admin', email: emailLower, name: 'Admin', passwordHash, mustChangePassword: false });
  console.log('[Admin Seed] Admin user seeded for', emailLower);
}

export async function me(req, res) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  // Return fields based on role
  const response = { 
    _id: u._id, 
    email: u.email, 
    name: u.name, 
    role: u.role, 
    avatarUrl: u.avatarUrl,
    isSpecialStudent: Boolean(u.isSpecialStudent),
  };
  
  // Add role-specific fields
  if (u.role === 'student') {
    response.studentId = u.studentId;
    response.course = u.course;
    response.branch = u.branch;
    response.college = u.college;
    response.semester = u.semester;
    
    // Fetch coordinator names from teacherIds
    if (Array.isArray(u.teacherIds) && u.teacherIds.length > 0) {
      const coordinators = await User.find({ 
        coordinatorId: { $in: u.teacherIds },
        role: 'coordinator'
      }).select('name coordinatorId').lean();
      
      const coordinatorNames = coordinators.map(c => c.name).filter(Boolean);
      response.teacherId = coordinatorNames.length > 0 ? coordinatorNames.join(', ') : 'Not Assigned';
    } else {
      response.teacherId = 'Not Assigned';
    }
  } else if (u.role === 'coordinator') {
    response.teacherId = u.coordinatorId; // Coordinators use coordinatorId as their teacherId
    response.coordinatorId = u.coordinatorId;
    response.department = u.department;
    response.college = u.college;
  }
  
  res.json(response);
}

// Update current user's profile (students, coordinators, and admins can update their name)
export async function updateMe(req, res) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  
  const { name, course, branch, college } = req.body || {};
  const trim = (v) => (typeof v === 'string' ? v.trim() : undefined);
  
  // All users can update their name
  const updates = {};
  if (name !== undefined) {
    updates.name = trim(name);
  }
  
  // Only students can update additional fields
  if (u.role === 'student') {
    if (course !== undefined) updates.course = trim(course);
    if (branch !== undefined) updates.branch = trim(branch);
    if (college !== undefined) updates.college = trim(college);
  }
  
  // Fetch the actual Mongoose document (req.user is lean object)
  const userDoc = await User.findById(u._id);
  if (!userDoc) throw new HttpError(404, 'User not found');
  
  // Persist on underlying User model
  Object.assign(userDoc, updates);
  await userDoc.save();
  
  // Log activity
  logActivity({
    userEmail: u.email,
    userRole: u.role,
    actionType: 'UPDATE',
    targetType: u.role === 'student' ? 'STUDENT' : u.role === 'coordinator' ? 'COORDINATOR' : 'ADMIN',
    targetId: u._id.toString(),
    description: `Updated profile`,
    metadata: updates,
    req
  });
  
  // Return response based on role
  const response = { message: 'Profile updated', user: { _id: userDoc._id, name: userDoc.name, email: userDoc.email, role: userDoc.role } };
  if (userDoc.role === 'student') {
    response.user.studentId = userDoc.studentId;
    response.user.course = userDoc.course;
    response.user.branch = userDoc.branch;
    response.user.college = userDoc.college;
  }
  
  res.json(response);
}

// Upload/update current user's avatar image
export async function updateMyAvatar(req, res) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  if (u.role !== 'student' && u.role !== 'coordinator' && u.role !== 'admin') {
    return res.status(403).json({ error: 'Not allowed' });
  }
  
  const file = req.file; // expecting multer to populate
  if (!file) throw new HttpError(400, 'Avatar file is required');
  
  if (!isCloudinaryConfigured()) {
    throw new HttpError(500, 'Cloudinary not configured');
  }
  
  // Determine folder based on role
  const folder = u.role === 'student' ? 'student_profile' : 'teacher_profile';
  
  try {
    // Delete old avatar if exists
    if (u.avatarUrl) {
      await deleteAvatar(u.avatarUrl);
    }
    
    // Upload new avatar to Cloudinary
    const avatarUrl = await uploadAvatar(file.buffer, folder, u._id.toString());
    
    // Fetch the actual Mongoose document (req.user is lean object)
    const userDoc = await User.findById(u._id);
    if (!userDoc) throw new HttpError(404, 'User not found');
    
    // Save on user document (unified User model via req.user)
    userDoc.avatarUrl = avatarUrl;
    await userDoc.save();
    
    // Log activity
    logActivity({
      userEmail: u.email,
      userRole: u.role,
      actionType: 'UPDATE',
      targetType: u.role === 'student' ? 'STUDENT' : u.role === 'coordinator' ? 'COORDINATOR' : 'ADMIN',
      targetId: u._id.toString(),
      description: `Updated avatar`,
      metadata: {},
      req
    });
    
    // Removed PROFILE_UPDATED activity logging - not essential
    
    res.json({ message: 'Avatar updated', avatarUrl });
  } catch (e) {
    console.error('[Avatar Upload Error]', e);
    throw new HttpError(500, 'Failed to upload avatar: ' + (e.message || e));
  }
}

// Unified login: accepts either admin email or student email / studentId as 'identifier' (or legacy 'email')
export async function login(req, res) {
  const { identifier, email, password } = req.body;
  const id = (identifier || email || '').trim();
  if (!id || !password) throw new HttpError(400, 'Missing credentials');

  // Try admin first (by email only)
  const idLower = id.toLowerCase();
  const admin = await User.findOne({ role: 'admin', email: idLower });
  if (admin) {
    const ok = await admin.verifyPassword(password);
    if (!ok) {
      // SECURITY: Log failed auth attempt
      logAuthAttempt(req, false, idLower, null, 'Invalid password');
      throw new HttpError(401, 'Invalid credentials');
    }
    // SECURITY: Log successful auth
    logAuthAttempt(req, true, admin.email, admin._id);
    const token = signToken({ sub: admin._id, role: admin.role, email: admin.email });
    
    // SECURITY: Single session per user - store session token hash
    const sessionTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    admin.activeSessionToken = sessionTokenHash;
    admin.activeSessionCreatedAt = new Date();
    await admin.save();
    console.log('[Session] Admin session created:', admin.email, sessionTokenHash.substring(0, 10) + '...');
    
    // SECURITY: Store JWT in HttpOnly cookie instead of sending in response
    res.cookie('accessToken', token, {
      httpOnly: true, // Cannot be accessed via JavaScript (XSS protection)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });
    
    return res.json({ user: { id: admin._id, email: admin.email, role: admin.role, name: admin.name } });
  }

  // Try regular student by email OR studentId
  const student = await User.findOne({
    role: 'student',
    $or: [{ email: idLower }, { studentId: id }],
  });
  if (student) {
    const ok = await student.verifyPassword(password);
    if (!ok) {
      // SECURITY: Log failed auth attempt
      logAuthAttempt(req, false, student.email, null, 'Invalid password');
      throw new HttpError(401, 'Invalid credentials');
    }
    
   // SECURITY: Log successful auth
    logAuthAttempt(req, true, student.email, student._id);
    
    // Log student login activity
    await logStudentActivity({
      studentId: student._id,
      studentModel: 'User',
      activityType: 'LOGIN',
      metadata: { email: student.email, studentId: student.studentId, isSpecialStudent: Boolean(student.isSpecialStudent) }
    });
    
    const token = signToken({  
      sub: student._id, 
      role: student.role,
      email: student.email,
      studentId: student.studentId
    });
    
    // SECURITY: Single session per user - store session token hash
    const sessionTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    student.activeSessionToken = sessionTokenHash;
    student.activeSessionCreatedAt = new Date();
    await student.save();
    console.log('[Session] Student session created:', student.email, sessionTokenHash.substring(0, 10) + '...');
    
    // SECURITY: Store JWT in HttpOnly cookie
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    return res.json({ user: sanitizeUser(student) });
  }

  // Try coordinator by email OR coordinatorId
  const coordinator = await User.findOne({
    role: 'coordinator',
    $or: [
      { email: idLower },
      { coordinatorId: id },
    ],
  });
  if (coordinator) {
    const ok = await coordinator.verifyPassword(password);
    if (!ok) {
      // SECURITY: Log failed auth attempt
      logAuthAttempt(req, false, coordinator.email, null, 'Invalid password');
      throw new HttpError(401, 'Invalid credentials');
    }
    // SECURITY: Log successful auth
    logAuthAttempt(req, true, coordinator.email, coordinator._id);
    const token = signToken({ sub: coordinator._id, role: coordinator.role, email: coordinator.email });
    
    // SECURITY: Store JWT in HttpOnly cookie
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    return res.json({ user: sanitizeUser(coordinator) });
  }

  // No match found - SECURITY: Log failed attempt without revealing if user exists
  logAuthAttempt(req, false, id, null, 'User not found');
  throw new HttpError(401, 'Invalid credentials');
}

export async function forcePasswordChange(req, res) {
  const { newPassword } = req.body;
  const currentUser = req.user;
  if (!currentUser.mustChangePassword) return res.json({ message: 'No change required' });
  
  // Fetch the actual Mongoose document (req.user is lean object)
  const user = await User.findById(currentUser._id);
  if (!user) throw new HttpError(404, 'User not found');
  
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Password updated' });
}

function sanitizeUser(u) {
  return {
    id: u._id,
    role: u.role,
    name: u.name,
    email: u.email,
    studentId: u.studentId,
    mustChangePassword: u.mustChangePassword,
    course: u.course,
    branch: u.branch,
    college: u.college,
    isSpecialStudent: Boolean(u.isSpecialStudent),
  };
}

// Request password reset - generates token and sends email
export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) throw new HttpError(400, 'Email or Student ID is required');

  const identifier = email.trim().toLowerCase();
  
  // Search by email or studentId
  const user = await User.findOne({
    role: 'student',
    $or: [
      { email: identifier },
      { studentId: identifier }
    ]
  });
  
  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({ message: 'If an account exists with this email or student ID, a password reset link has been sent.' });
  }

  // Check if user has an email address
  if (!user.email) {
    return res.json({ message: 'If an account exists with this email or student ID, a password reset link has been sent.' });
  }

  // SECURITY: Per-email rate limiting to prevent email bombing
  // This protects individual users from receiving too many reset emails
  const emailLimit = checkEmailResetLimit(user.email);
  if (!emailLimit.allowed) {
    console.warn(`[SECURITY] Password reset limit exceeded for email: ${user.email}`);
    // Return generic message to prevent email enumeration while still blocking the request
    return res.status(429).json({ 
      error: 'Too many password reset requests. Please try again later.'
    });
  }

  // SECURITY: Generate secure token with shorter expiration (15 minutes)
  const resetToken = generateSecureToken();
  const resetTokenHash = hashToken(resetToken);
  
  user.passwordResetToken = resetTokenHash;
  user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes (stricter)
  user.passwordResetUsed = false; // Mark as unused
  await user.save();

  // Send email with reset link - support multiple frontend ports
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  console.log('[Password Reset] Reset URL generated:', resetUrl);
  
  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    });
    
    // SECURITY: Record this attempt for per-email rate limiting
    // Only record after successful email send to prevent false positives
    recordEmailResetAttempt(user.email);
    
    console.log('[Password Reset] Email sent successfully to:', user.email);
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    
    // Provide more helpful error message based on error type
    if (err.code === 'ESOCKET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION') {
      throw new HttpError(500, 'Email service is temporarily unavailable. Please ensure SMTP is configured correctly with a Gmail App Password, or try again later.');
    }
    throw new HttpError(500, 'Failed to send reset email. Please contact support if this persists.');
  }

  res.json({ message: 'If an account exists with this email or student ID, a password reset link has been sent.' });
}

// Reset password using token
export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    
    console.log('[Password Reset] Attempting to reset password with token:', token ? token.substring(0, 10) + '...' : 'none');
    
    if (!token || !newPassword) throw new HttpError(400, 'Token and new password are required');
    
    // SECURITY: Enhanced password validation
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new HttpError(400, passwordValidation.errors.join('; '));
    }

    const resetTokenHash = hashToken(token);
    const newPasswordHash = await User.hashPassword(newPassword);
    
    // SECURITY: Atomic token invalidation using findOneAndUpdate
    // This prevents race conditions where the same token could be used twice
    // The token is invalidated in the same atomic operation as the password change
    const user = await User.findOneAndUpdate(
      {
        passwordResetToken: resetTokenHash,
        passwordResetExpires: { $gt: Date.now() },
        passwordResetUsed: { $ne: true }
      },
      {
        $set: {
          passwordHash: newPasswordHash,
          passwordResetUsed: true,
          passwordChangedAt: new Date(),
          mustChangePassword: false
        },
        $unset: {
          passwordResetToken: 1,
          passwordResetExpires: 1
        }
      },
      { new: true }
    );

    if (!user) {
      console.log('[Password Reset] No user found with valid token');
      throw new HttpError(400, 'Invalid, expired, or already used reset token');
    }

    console.log('[Password Reset] Password reset successful for:', user.email);
    
    // SECURITY: Log password reset
    logActivity({
      userEmail: user.email,
      userRole: user.role,
      actionType: 'UPDATE',
      targetType: 'STUDENT',
      targetId: user._id.toString(),
      description: 'Password reset via email token',
      metadata: {},
      req
    });

    if (user.role === 'student') {
      try {
        await createNotification({
          userId: user._id,
          title: 'Password Updated',
          message: 'Your password was updated',
          type: 'SYSTEM',
          referenceId: user._id,
          actionUrl: '/student/profile'
        });
      } catch (e) {
        console.error('[resetPassword] Notification error:', e.message);
      }
    }
    
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('[Password Reset] Error:', err.message);
    throw err;
  }
}
