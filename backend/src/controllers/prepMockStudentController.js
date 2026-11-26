import crypto from 'node:crypto';
import Papa from 'papaparse';
import User from '../models/User.js';
import { University } from '../platform/models.js';
import { currentTenant } from '../platform/tenantContext.js';
import { universityPolicy } from '../platform/client.js';
import { withAccountCreationLocks } from '../platform/accountLimits.js';
import { findPrepMockStudentSource } from '../services/prepMockIdentity.js';
import { applyStudentFeatureChange, normalizeStudentFeatureAccess } from '../services/studentFeatureAccess.js';
import { exactEmailPattern, normalizeEmailAddress } from '../utils/emailIdentity.js';
import { HttpError } from '../utils/errors.js';
import { invalidateUserCache } from '../middleware/auth.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { universityStudentLoginId } from '../platform/studentLoginId.js';

const enrolledQuery = { role: 'student', prepMockEnrolledAt: { $ne: null } };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requirePrepMockSpoc(req, _res, next) {
  if (!currentTenant() || req.user?.role !== 'admin' || req.user.adminAccess === 'limited') {
    throw new HttpError(403, 'Only this university’s SPOC can upload PrepMock students.');
  }
  universityPolicy().then((policy) => {
    if (policy.permissions?.prepmock !== true) throw new HttpError(403, 'PrepMock access is not active for this university.');
    next();
  }).catch(next);
}

async function limits() {
  const universityId = currentTenant().universityId;
  const [university, used] = await Promise.all([
    University.findOne({ universityId, deletedAt: null }).select('prepMockStudentLimit').lean(),
    User.countDocuments(enrolledQuery),
  ]);
  if (!university) throw new HttpError(404, 'University not found');
  return { limit: university.prepMockStudentLimit ?? 0, used };
}

function cleanRow(value) {
  const name = String(value?.name || '').trim().replace(/\s+/g, ' ');
  const email = normalizeEmailAddress(value?.email);
  const studentId = String(value?.studentId || value?.studentid || '').trim();
  if (name.length < 2 || name.length > 160) throw new HttpError(400, 'Enter a student name (2–160 characters).');
  if (!emailPattern.test(email || '') || email.length > 254) throw new HttpError(400, 'Enter a valid student email.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(studentId)) throw new HttpError(400, 'Enter a student ID using letters, numbers, dots, underscores, slashes or hyphens (up to 64 characters).');
  return { name, email, studentId };
}

function notifyAccess(student) {
  invalidateUserCache(student._id);
  getIo()?.to(personalRoom(student._id)).emit('student-access-updated', { updatedAt: new Date().toISOString() });
}

async function enrollOne(row, usage, actor) {
  const { name, email, studentId } = cleanRow(row);
  const local = await User.findOne({ email: exactEmailPattern(email) });
  if (local && local.role !== 'student') throw new HttpError(409, 'This email belongs to a university staff account.');
  if (local?.studentId && local.studentId !== studentId) throw new HttpError(409, 'This student’s ID differs from the existing university account.');
  const loginStudentId = universityStudentLoginId(currentTenant().universityId, studentId);
  if ((!local || !local.studentId) && await User.exists({ studentId })) throw new HttpError(409, 'This student ID belongs to another university account.');
  if (local?.prepMockEnrolledAt) {
    if (!local.studentId) { local.studentId = studentId; await local.save(); }
    return { name: local.name || name, email, studentId, loginStudentId, status: 'already_enrolled' };
  }
  if (usage.used >= usage.limit) throw new HttpError(409, `PrepMock student limit reached (${usage.used}/${usage.limit}). Ask the Master Admin to raise it.`);

  if (local) {
    if (!local.studentId) local.studentId = studentId;
    const current = normalizeStudentFeatureAccess(local.featureAccess, { legacyAccessScope: local.accessScope });
    local.featureAccess = { ...applyStudentFeatureChange(current, { type: 'grant', features: ['prep_mock'] }), source: 'manual', updatedBy: actor._id, updatedAt: new Date() };
    local.accessScope = 'full';
    local.prepMockEnrolledAt = new Date();
    await local.save();
    notifyAccess(local);
    usage.used += 1;
    return { name: local.name || name, email, studentId, loginStudentId, status: 'existing_student' };
  }

  const source = await findPrepMockStudentSource(email);
  const password = source ? null : `${crypto.randomBytes(15).toString('base64url')}@`;
  const student = await User.create({
    role: 'student', name: source?.student.name || name, email,
    studentId,
    passwordHash: source?.student.passwordHash || await User.hashPassword(password),
    mustChangePassword: !source,
    prepMockEnrolledAt: new Date(),
    ...(source ? { prepMockIdentity: source.identity } : {}),
    featureAccess: { mode: 'custom', features: ['prep_mock'], source: 'manual', updatedBy: actor._id, updatedAt: new Date() },
  });
  usage.used += 1;
  return { name: student.name, email, studentId, loginStudentId, status: source ? 'linked_student' : 'created', ...(password ? { temporaryPassword: password } : {}) };
}

export async function listPrepMockStudents(_req, res) {
  const [usage, students] = await Promise.all([
    limits(), User.find(enrolledQuery).select('name email studentId prepMockEnrolledAt prepMockIdentity featureAccess').sort({ prepMockEnrolledAt: -1 }).limit(200).lean(),
  ]);
  res.set('Cache-Control', 'private, no-store').json({ ...usage, students: students.map((student) => ({
    id: student._id, name: student.name, email: student.email, studentId: student.studentId,
    loginStudentId: universityStudentLoginId(currentTenant().universityId, student.studentId),
    enrolledAt: student.prepMockEnrolledAt, linked: Boolean(student.prepMockIdentity?.userId),
    prepMockOnly: student.featureAccess?.mode === 'custom' && student.featureAccess.features?.length === 1 && student.featureAccess.features[0] === 'prep_mock',
  })) });
}

export async function uploadPrepMockStudent(req, res) {
  const row = cleanRow(req.body);
  const universityId = currentTenant().universityId;
  const result = await withAccountCreationLocks(universityId, ['prepMock'], async () => enrollOne(row, await limits(), req.user));
  res.set('Cache-Control', 'private, no-store').status(result.status === 'created' ? 201 : 200).json(result);
}

export async function uploadPrepMockStudentsBulk(req, res) {
  if (!req.file?.buffer) throw new HttpError(400, 'Choose a CSV file.');
  const parsed = Papa.parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw new HttpError(400, `Invalid CSV: ${parsed.errors[0].message}`);
  if (!parsed.data.length || parsed.data.length > 500) throw new HttpError(400, 'Upload 1–500 students at a time.');
  const rows = parsed.data.map((row) => ({ name: row.name || row.Name, email: row.email || row.Email,
    studentId: row.studentId || row.studentid || row.student_id || row['Student ID'] }));
  const universityId = currentTenant().universityId;
  const results = await withAccountCreationLocks(universityId, ['prepMock'], async () => {
    const usage = await limits();
    const entries = [];
    for (let index = 0; index < rows.length; index += 1) {
      try { entries.push({ row: index + 2, ...await enrollOne(rows[index], usage, req.user) }); }
      catch (error) { entries.push({ row: index + 2, email: rows[index].email || '', status: 'error', error: error.message }); }
    }
    return { entries, limit: usage.limit, used: usage.used };
  });
  res.set('Cache-Control', 'private, no-store').json(results);
}
