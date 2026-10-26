import User from '../models/User.js';
import StudentAccessPolicy from '../models/StudentAccessPolicy.js';
import { invalidateUserCache } from '../middleware/auth.js';
import { logActivity } from './adminActivityController.js';
import {
  STUDENT_FEATURES,
  normalizeStudentFeatures,
  normalizeStudentFeatureAccess,
  parseStudentFeatureAccess,
} from '../services/studentFeatureAccess.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';

const serializePolicy = (policy) => ({
  defaultMode: policy?.defaultMode === 'custom' ? 'custom' : 'all',
  defaultFeatures: policy?.defaultMode === 'custom'
    ? normalizeStudentFeatures(policy.defaultFeatures)
    : [...STUDENT_FEATURES],
  updatedAt: policy?.updatedAt || null,
  updatedByEmail: policy?.updatedByEmail || '',
});

export async function getStudentAccessPolicy(req, res) {
  const policy = await StudentAccessPolicy.findOne({ key: 'default' }).lean();
  res.set('Cache-Control', 'private, no-store').json({
    policy: serializePolicy(policy),
    features: STUDENT_FEATURES,
  });
}

export async function updateStudentAccessPolicy(req, res) {
  const defaultMode = req.body?.defaultMode === 'custom' ? 'custom' : 'all';
  const defaultFeatures = defaultMode === 'custom'
    ? normalizeStudentFeatures(req.body?.defaultFeatures)
    : [...STUDENT_FEATURES];
  if (defaultMode === 'custom' && defaultFeatures.length === 0) {
    return res.status(400).json({ error: 'Enable at least one feature for the default student access.' });
  }
  const policy = await StudentAccessPolicy.findOneAndUpdate(
    { key: 'default' },
    { $set: { defaultMode, defaultFeatures, updatedBy: req.user._id, updatedByEmail: req.user.email } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'STUDENT_ACCESS_POLICY',
    targetId: 'default',
    description: `Updated default student access to ${defaultMode === 'all' ? 'all features' : `${defaultFeatures.length} selected features`}`,
    metadata: { defaultMode, defaultFeatures },
    req,
  });
  return res.json({ policy: serializePolicy(policy), features: STUDENT_FEATURES });
}

export async function resolveNewStudentFeatureAccess(requestedAccess, actor) {
  if (requestedAccess !== undefined && requestedAccess !== null && requestedAccess !== '') {
    const access = parseStudentFeatureAccess(requestedAccess);
    return {
      ...access,
      source: 'manual',
      updatedBy: actor?._id,
      updatedAt: new Date(),
    };
  }
  const policy = await StudentAccessPolicy.findOne({ key: 'default' }).lean();
  const mode = policy?.defaultMode === 'custom' ? 'custom' : 'all';
  return {
    mode,
    features: mode === 'custom' ? normalizeStudentFeatures(policy?.defaultFeatures) : [...STUDENT_FEATURES],
    source: 'default',
    updatedBy: actor?._id,
    updatedAt: new Date(),
  };
}

export async function getStudentAccess(req, res) {
  const student = await User.findOne({ _id: req.params.studentId, role: 'student' })
    .select('_id name email studentId accessScope featureAccess')
    .lean();
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  return res.json({
    student: { id: student._id, name: student.name, email: student.email, studentId: student.studentId },
    access: normalizeStudentFeatureAccess(student.featureAccess, { legacyAccessScope: student.accessScope }),
    features: STUDENT_FEATURES,
  });
}

export async function updateStudentAccess(req, res) {
  const normalized = parseStudentFeatureAccess(req.body?.access || req.body);
  if (normalized.mode === 'custom' && normalized.features.length === 0) {
    return res.status(400).json({ error: 'Enable at least one feature for this student.' });
  }
  const student = await User.findOneAndUpdate(
    { _id: req.params.studentId, role: 'student' },
    {
      $set: {
        featureAccess: {
          ...normalized,
          source: 'manual',
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
        // Per-feature permissions supersede the old assessment-only account switch.
        accessScope: 'full',
      },
    },
    { new: true },
  ).select('_id name email studentId featureAccess');
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  invalidateUserCache(student._id);
  getIo()?.to(personalRoom(student._id)).emit('student-access-updated', { access: normalized, updatedAt: new Date().toISOString() });
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'STUDENT_ACCESS',
    targetId: String(student._id),
    description: `Updated feature access for ${student.name || student.email}`,
    metadata: normalized,
    req,
  });
  return res.json({
    message: 'Student access updated successfully.',
    student: { id: student._id, name: student.name, email: student.email, studentId: student.studentId },
    access: normalized,
    features: STUDENT_FEATURES,
  });
}
