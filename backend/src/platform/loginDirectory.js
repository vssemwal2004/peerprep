import crypto from 'node:crypto';
import { PlatformLoginIdentity, PlatformLoginDirectoryState } from './models.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { getTenant, listActiveUniversityIds } from './tenantConnections.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';

export function normalizedLoginEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

export function loginEmailKey(value) {
  const email = normalizedLoginEmail(value);
  if (!email) return '';
  return crypto.createHmac('sha256', Buffer.from(process.env.PEERPREP_TENANT_SECRET_KEY || '', 'base64'))
    .update(email).digest('hex');
}

export async function syncTenantLoginIdentity(user, universityId = currentTenant()?.universityId) {
  if (!universityId || !user?._id) return;
  const filter = { universityId, userId: user._id };
  const emailKey = loginEmailKey(user.email);
  if (!emailKey) {
    await PlatformLoginIdentity.deleteOne(filter);
    return;
  }
  await PlatformLoginIdentity.updateOne(filter, { $set: { emailKey } }, { upsert: true });
}

export async function removeTenantLoginIdentity(userId, universityId = currentTenant()?.universityId) {
  if (universityId && userId) await PlatformLoginIdentity.deleteOne({ universityId, userId });
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
  const scanAll = !(await loginDirectoryComplete());
  const ids = scanAll ? await listActiveUniversityIds() : [...new Set(indexed.map((row) => row.universityId))];
  const results = [];
  let unavailable = false;
  // Bound cold-start/backfill lookups so one login cannot open every tenant pool at once.
  for (let offset = 0; offset < ids.length; offset += 3) {
    const batch = await Promise.all(ids.slice(offset, offset + 3).map(async (id) => {
      try {
        const tenant = await getTenant(id);
        const user = await runForTenant(tenant, () => User.findOne({ email: normalized })
          .select('_id email role').lean().maxTimeMS(3000));
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
      await PlatformLoginIdentity.deleteOne({ _id: row._id });
    }
  }
  return results;
}

export async function backfillTenantLoginDirectory(tenant) {
  let lastId;
  while (true) {
    const users = await runForTenant(tenant, () => User.find({ email: { $type: 'string', $ne: '' },
      ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 }).limit(250).select('_id email').lean());
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
  await PlatformLoginDirectoryState.updateOne({ _id: 'email' }, { $set: { completedAt: new Date() } }, { upsert: true });
}
