// Prep Coins a student EARNS for their own work: the first app open of the day, a counted solve,
// a badge level. The platform mints them (ledger kinds earn_*); no university balance pays.
//
// Every earning has a deterministic request ID (earn:<kind>:<scope>:<user>:<key>), and the ledger's
// unique requestId makes retries, parallel tabs and job re-runs pay exactly once.
import mongoose from 'mongoose';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { getIo } from '../utils/io.js';
import { personalRoom } from '../utils/realtime.js';
import { studentHasFeature } from '../services/studentFeatureAccess.js';
import { PlatformAudit, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinWallet } from './models.js';
import { PLATFORM_WALLET_SCOPE } from './coins.js';
import { currentTenant } from './tenantContext.js';

export const EARN_KINDS = Object.freeze(['login', 'solve', 'badge']);
export const BADGE_LEVELS = 10;
export const DEFAULT_EARNING = Object.freeze({ login: 1, solve: 2, badgeLevels: Object.freeze([1, 2, 3, 4, 6, 8, 10, 13, 16, 20]) });
const MAX_EARN = 1_000;
const CACHE_MS = 15_000;
const EARNING_DOC = 'earning';

const earnScope = () => currentTenant()?.universityId || PLATFORM_WALLET_SCOPE;

const whole = (value, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_EARN) throw new HttpError(400, `${label} must be a whole number from 0 to ${MAX_EARN}.`);
  return number;
};

/** Validated earning amounts. Badge levels must not drop as levels get harder. */
export function normalizeEarning(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const levels = Array.isArray(input.badgeLevels) ? input.badgeLevels : DEFAULT_EARNING.badgeLevels;
  if (levels.length !== BADGE_LEVELS) throw new HttpError(400, `Set coins for all ${BADGE_LEVELS} badge levels.`);
  const badgeLevels = levels.map((amount, index) => whole(amount, `Badge level ${index + 1} coins`));
  if (badgeLevels.some((amount, index) => index && amount < badgeLevels[index - 1])) throw new HttpError(400, 'Harder badge levels cannot pay fewer coins than easier ones.');
  return {
    login: whole(input.login ?? DEFAULT_EARNING.login, 'Daily login coins'),
    solve: whole(input.solve ?? DEFAULT_EARNING.solve, 'Coins per solve'),
    badgeLevels,
  };
}

let cache = null;
let cachedAt = 0;
export function clearEarningCache() { cache = null; cachedAt = 0; }

export async function getEarningConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const row = await PlatformCoinPricing.findById(EARNING_DOC).lean();
  cache = { version: row?.version || 0, earning: normalizeEarning(row?.earning || {}), updatedAt: row?.updatedAt || null };
  cachedAt = Date.now();
  return cache;
}

/** Master Admin save with optimistic concurrency, like feature prices. */
export async function saveEarningConfig({ earning, expectedVersion, reason, actorId }) {
  const normalized = normalizeEarning(earning);
  const before = await getEarningConfig({ fresh: true });
  if (Number(expectedVersion) !== before.version) throw new HttpError(409, 'Earning amounts were changed elsewhere. Reload to see the latest.');
  const filter = before.version ? { _id: EARNING_DOC, version: before.version } : { _id: EARNING_DOC, $or: [{ version: 0 }, { version: { $exists: false } }] };
  try {
    const saved = await PlatformCoinPricing.findOneAndUpdate(filter, {
      $set: { earning: normalized, updatedBy: actorId, reason: String(reason || '').trim().slice(0, 300) }, $inc: { version: 1 },
    }, { upsert: true, new: true }).lean();
    await PlatformAudit.create({ actor: String(actorId), action: 'prep_coin.earning_updated', details: { before: before.earning, after: normalized, version: saved.version } });
    clearEarningCache();
    return getEarningConfig({ fresh: true });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'Earning amounts were changed elsewhere. Reload to see the latest.');
    throw error;
  }
}

/** Whether this user can hold earned coins: an active, full student with Prep Coin turned on. */
async function earningStudent(user) {
  const row = user && typeof user === 'object' && user.role
    ? user
    : await User.findById(user).select('role isActive accessScope featureAccess').lean();
  if (!row || row.role !== 'student' || row.isActive === false || row.accessScope === 'assessment_only') return null;
  return studentHasFeature(row, 'prep_coins') ? row : null;
}

/**
 * Mints `amount` coins to a student once per (kind, key). Returns
 * { amount, balance, kind, note } when paid, { duplicate: true } when already paid, or null when
 * nothing applies (not a student, Prep Coin off, amount 0).
 */
export async function creditEarning({ user, kind, key, amount, note = '' }) {
  if (!EARN_KINDS.includes(kind)) throw new Error(`Unknown earning kind ${kind}`);
  const coins = Number(amount);
  if (!Number.isSafeInteger(coins) || coins < 1) return null;
  const student = await earningStudent(user);
  if (!student) return null;
  const userId = new mongoose.Types.ObjectId(String(student._id));
  const scope = earnScope();
  const requestId = `earn:${kind}:${scope}:${userId}:${key}`;
  if (await PlatformCoinMovement.exists({ requestId })) return { duplicate: true };
  let balance = 0;
  try {
    await mongoose.connection.transaction(async (session) => {
      balance = 0;
      if (await PlatformCoinMovement.exists({ requestId }).session(session)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const wallet = await PlatformCoinWallet.findOneAndUpdate(
        { universityId: scope, userId },
        { $setOnInsert: { role: 'student' }, $inc: { balance: coins } },
        { upsert: true, new: true, session, setDefaultsOnInsert: false },
      );
      if (wallet.role !== 'student') throw new HttpError(409, 'Wallet is unavailable');
      balance = wallet.balance;
      await PlatformCoinMovement.create([{
        universityId: scope, requestId, kind: `earn_${kind}`, amount: coins, actorId: userId,
        fromRole: 'platform', toRole: 'student', toUserId: userId, note: String(note).slice(0, 120),
      }], { session });
    });
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
  const paid = { kind, amount: coins, balance, note: String(note).slice(0, 120) };
  // A hint for open tabs: the header counter and coin popup update at once.
  getIo()?.to(personalRoom(String(userId))).emit('prepcoin:earned', paid);
  return paid;
}

/** Earnings never block the action that earned them: errors are logged, never thrown. */
export async function creditEarningSafely(input) {
  try {
    return await creditEarning(input);
  } catch (error) {
    console.warn(`[PrepCoin] ${input.kind} earning for ${input.user?._id || input.user} failed: ${error.message}`);
    return null;
  }
}
