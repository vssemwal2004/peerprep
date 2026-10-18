import crypto from 'node:crypto';
import { HttpError } from '../utils/errors.js';
import { PlatformAccountCreationLock, University } from './models.js';

const localTails = new Map();
const LIMIT_FIELDS = { student: 'studentLimit', coordinator: 'coordinatorLimit' };
const LEASE_MS = 120_000;

export function accountLimit(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new HttpError(400, `Enter a valid ${label}`);
  const raw = String(value).trim();
  if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) > 10_000_000) {
    throw new HttpError(400, `Enter a whole-number ${label} from 0 to 10000000`);
  }
  return Number(raw);
}

async function acquireLock(universityId, role) {
  if (!LIMIT_FIELDS[role]) throw new Error('Invalid account role');
  const key = `${universityId}:${role}`;
  const preceding = localTails.get(key) || Promise.resolve();
  let releaseLocal;
  const tail = new Promise((resolve) => { releaseLocal = resolve; });
  localTails.set(key, tail);
  await preceding;
  const owner = crypto.randomUUID();
  const deadline = Date.now() + 30_000;
  try {
    while (Date.now() < deadline) {
      try {
        const lock = await PlatformAccountCreationLock.findOneAndUpdate(
          { _id: key, expiresAt: { $lte: new Date() } },
          { $set: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } },
          { upsert: true, new: true },
        ).lean();
        if (lock?.owner === owner) {
          const renewal = setInterval(() => {
            void PlatformAccountCreationLock.updateOne({ _id: key, owner }, { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
          }, 30_000);
          renewal.unref?.();
          return async () => {
            clearInterval(renewal);
            try { await PlatformAccountCreationLock.deleteOne({ _id: key, owner }).catch(() => {}); }
            finally {
              releaseLocal();
              if (localTails.get(key) === tail) localTails.delete(key);
            }
          };
        }
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new HttpError(503, 'Account creation is busy. Please retry in a moment.');
  } catch (error) {
    releaseLocal();
    if (localTails.get(key) === tail) localTails.delete(key);
    throw error;
  }
}

export async function withAccountCreationLocks(universityId, roles, work) {
  const releases = [];
  try {
    for (const role of [...new Set(roles)].sort()) releases.push(await acquireLock(universityId, role));
    return await work();
  } finally {
    for (const release of releases.reverse()) await release();
  }
}

export async function reserveAccountSlot(universityId, role, countAccounts) {
  const release = await acquireLock(universityId, role);
  try {
    const university = await University.findOne({ universityId, deletedAt: null }).select(LIMIT_FIELDS[role]).lean();
    if (!university) throw new HttpError(503, 'University account limits are unavailable');
    const limit = university[LIMIT_FIELDS[role]];
    if (limit != null) {
      const used = await countAccounts(role);
      if (used >= limit) throw new HttpError(409, `${role === 'student' ? 'Student' : 'Coordinator'} limit reached (${used}/${limit}). Ask the PeerPrep superadmin to increase the limit.`);
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}
