import crypto from 'node:crypto';
import { PlatformLoginIdentity, PlatformLoginDirectoryState } from './models.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { getTenant, listActiveUniversityIds } from './tenantConnections.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { exactEmailPattern, normalizeEmailAddress } from '../utils/emailIdentity.js';

export function normalizedLoginEmail(value) {
  const email = normalizeEmailAddress(value) || '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

export function loginEmailKey(value) {
  const email = normalizedLoginEmail(value);
  if (!email) return '';
  return crypto.createHmac('sha256', Buffer.from(process.env.PEERPREP_TENANT_SECRET_KEY || '', 'base64'))
    .update(email).digest('hex');
}

// Student IDs are matched exactly, as the tenant login does. Bounded so a
// login request cannot carry an arbitrary payload into the lookup.
export function normalizedLoginStudentId(value) {
  const studentId = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(studentId) ? studentId : '';
}

export function loginStudentIdKey(value) {
  const studentId = normalizedLoginStudentId(value);
  if (!studentId) return '';
  return crypto.createHmac('sha256', Buffer.from(process.env.PEERPREP_TENANT_SECRET_KEY || '', 'base64'))
    .update(`student-id:${studentId}`).digest('hex');
}

export async function syncTenantLoginIdentity(user, universityId = currentTenant()?.universityId) {
  if (!universityId || !user?._id) return;
  const filter = { universityId, userId: user._id };
  const emailKey = loginEmailKey(user.email);
  const studentIdKey = user.role === 'student' ? loginStudentIdKey(user.studentId) : '';
  if (!emailKey && !studentIdKey) {
    await PlatformLoginIdentity.deleteOne(filter);
    return;
  }
  const set = {};
  const unset = {};
  if (emailKey) set.emailKey = emailKey; else unset.emailKey = '';
  if (studentIdKey) set.studentIdKey = studentIdKey; else unset.studentIdKey = '';
  await PlatformLoginIdentity.updateOne(filter, {
    $set: set,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  }, { upsert: true });
}

export async function loginDirectoryCandidates(email) {
  const emailKey = loginEmailKey(email);
  if (!emailKey) return [];
  return PlatformLoginIdentity.find({ emailKey }).select('universityId userId').lean();
}

export async function loginDirectoryComplete() {
  return Boolean((await PlatformLoginDirectoryState.findById('email').select('completedAt').lean())?.completedAt);
}

export async function findLiveLoginCandidates(email) {
  const normalized = normalizedLoginEmail(email);
  if (!normalized) return [];
  const indexed = await loginDirectoryCandidates(normalized);
  // A legacy mixed-case lookup could previously remove a valid directory row
  // after failing an exact lowercase tenant query. If no index entry remains,
  // scan once and rebuild it so existing production users recover automatically.
  const scanAll = !(await loginDirectoryComplete()) || indexed.length === 0;
  const ids = scanAll ? await listActiveUniversityIds() : [...new Set(indexed.map((row) => row.universityId))];
  const results = [];
  let unavailable = false;
  // Bound cold-start/backfill lookups so one login cannot open every tenant pool at once.
  for (let offset = 0; offset < ids.length; offset += 3) {
    const batch = await Promise.all(ids.slice(offset, offset + 3).map(async (id) => {
      try {
        const tenant = await getTenant(id);
        const user = await runForTenant(tenant, () => User.findOne({ email: exactEmailPattern(normalized) })
          .select('_id email role studentId').lean().maxTimeMS(3000));
        if (user) await syncTenantLoginIdentity(user, id);
        return user ? { universityId: id, userId: user._id } : null;
      } catch { return { unavailable: true }; }
    }));
    if (batch.some((row) => row?.unavailable)) unavailable = true;
    results.push(...batch.filter((row) => row && !row.unavailable));
  }
  if (unavailable) throw new HttpError(503, 'University login is temporarily unavailable');
  if (scanAll) return results;
  // A deleted or renamed account cannot be used to route a login.
  for (const row of indexed) {
    if (!results.some((result) => result.universityId === row.universityId && String(result.userId) === String(row.userId))) {
      // The row may still route the same user's student ID.
      await PlatformLoginIdentity.updateOne({ _id: row._id }, { $unset: { emailKey: '' } });
    }
  }
  return results;
}

export async function backfillTenantLoginDirectory(tenant) {
  let lastId;
  while (true) {
    const users = await runForTenant(tenant, () => User.find({
      $or: [{ email: { $type: 'string', $ne: '' } }, { role: 'student', studentId: { $type: 'string', $ne: '' } }],
      ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 }).limit(250).select('_id email role studentId').lean());
    if (!users.length) break;
    for (const user of users) await syncTenantLoginIdentity(user, tenant.universityId);
    lastId = users.at(-1)._id;
  }
}

export async function backfillLoginDirectory() {
  for (const id of await listActiveUniversityIds()) {
    const tenant = await getTenant(id);
    await backfillTenantLoginDirectory(tenant);
  }
  const completedAt = new Date();
  await PlatformLoginDirectoryState.updateOne({ _id: 'email' }, { $set: { completedAt } }, { upsert: true });
  await PlatformLoginDirectoryState.updateOne({ _id: 'studentId' }, { $set: { completedAt } }, { upsert: true });
}

export async function studentIdDirectoryComplete() {
  return Boolean((await PlatformLoginDirectoryState.findById('studentId').select('completedAt').lean())?.completedAt);
}

// University students whose ID matches. Same recovery rule as email: rows
// imported without save hooks (bulk uploads) are found by a bounded scan and
// written back to the directory.
export async function findLiveStudentIdCandidates(value) {
  const studentId = normalizedLoginStudentId(value);
  const studentIdKey = loginStudentIdKey(studentId);
  if (!studentIdKey) return [];
  const indexed = await PlatformLoginIdentity.find({ studentIdKey }).select('universityId userId').lean();
  const scanAll = !(await studentIdDirectoryComplete()) || indexed.length === 0;
  const ids = scanAll ? await listActiveUniversityIds() : [...new Set(indexed.map((row) => row.universityId))];
  const results = [];
  let unavailable = false;
  for (let offset = 0; offset < ids.length; offset += 3) {
    const batch = await Promise.all(ids.slice(offset, offset + 3).map(async (id) => {
      try {
        const tenant = await getTenant(id);
        const user = await runForTenant(tenant, () => User.findOne({ role: 'student', studentId })
          .select('_id email role studentId').lean().maxTimeMS(3000));
        if (user) await syncTenantLoginIdentity(user, id);
        return user ? { universityId: id, userId: user._id } : null;
      } catch { return { unavailable: true }; }
    }));
    if (batch.some((row) => row?.unavailable)) unavailable = true;
    results.push(...batch.filter((row) => row && !row.unavailable));
  }
  if (unavailable) throw new HttpError(503, 'University login is temporarily unavailable');
  if (scanAll) return results;
  for (const row of indexed) {
    if (!results.some((result) => result.universityId === row.universityId && String(result.userId) === String(row.userId))) {
      await PlatformLoginIdentity.updateOne({ _id: row._id }, { $unset: { studentIdKey: '' } });
    }
  }
  return results;
}
