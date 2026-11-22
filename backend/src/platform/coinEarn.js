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

// 'challenge' = daily challenge completed, 'sheet' = Quick Prep sheet completed, 'milestone' =
// lifetime badge. 'solve' is kept for the ledger history only: solving a question no longer pays
// coins (2026-11-21), the daily challenge and sheets do.
// 'level' = an elite learner level reached (levels 8–12), paid once per level.
export const EARN_KINDS = Object.freeze(['login', 'solve', 'badge', 'challenge', 'sheet', 'milestone', 'level']);
export const BADGE_LEVELS = 10;
export const LEARNER_LEVELS = 12;
// Badge levels 1-2 are an honour only; coins start at level 3 and stay modest, so Prep Coins remain
// precious (2026-11-19). Master Admin can change every amount in Prep Coin pricing.
export const MILESTONE_TIERS = 5;
export const DEFAULT_EARNING = Object.freeze({
  // Daily challenge: 2 coins (2026-11-22, was 5). Solving a problem pays no coins.
  login: 1, challenge: 2, sheet: 5,
  badgeLevels: Object.freeze([0, 0, 1, 1, 2, 3, 4, 5, 7, 10]),
  // Lifetime milestone badges by tier (Bronze .. Legend).
  milestoneTiers: Object.freeze([2, 3, 5, 8, 12]),
  // Learner levels 1–12; only the elite levels (8–12) pay.
  levelCoins: Object.freeze([0, 0, 0, 0, 0, 0, 0, 10, 12, 15, 20, 25]),
});
// The previous defaults: a saved configuration still equal to them follows the new defaults.
const PREVIOUS_BADGE_DEFAULTS = Object.freeze([1, 2, 3, 4, 6, 8, 10, 13, 16, 20]);
const PREVIOUS_CHALLENGE_DEFAULT = 5;
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
  const tiers = Array.isArray(input.milestoneTiers) ? input.milestoneTiers : DEFAULT_EARNING.milestoneTiers;
  if (tiers.length !== MILESTONE_TIERS) throw new HttpError(400, `Set coins for all ${MILESTONE_TIERS} lifetime badge tiers.`);
  const milestoneTiers = tiers.map((amount, index) => whole(amount, `Lifetime badge tier ${index + 1} coins`));
  if (milestoneTiers.some((amount, index) => index && amount < milestoneTiers[index - 1])) throw new HttpError(400, 'Higher lifetime badge tiers cannot pay fewer coins.');
  const levelInput = Array.isArray(input.levelCoins) ? input.levelCoins : DEFAULT_EARNING.levelCoins;
  if (levelInput.length !== LEARNER_LEVELS) throw new HttpError(400, `Set coins for all ${LEARNER_LEVELS} learner levels.`);
  const levelCoins = levelInput.map((amount, index) => whole(amount, `Level ${index + 1} coins`));
  if (levelCoins.some((amount, index) => index && amount < levelCoins[index - 1])) throw new HttpError(400, 'Higher learner levels cannot pay fewer coins.');
  return {
    milestoneTiers,
    levelCoins,
    login: whole(input.login ?? DEFAULT_EARNING.login, 'Daily login coins'),
    challenge: whole(input.challenge ?? DEFAULT_EARNING.challenge, 'Daily challenge coins'),
    sheet: whole(input.sheet ?? DEFAULT_EARNING.sheet, 'Sheet completion coins'),
    badgeLevels,
  };
}

let cache = null;
let cachedAt = 0;
export function clearEarningCache() { cache = null; cachedAt = 0; }

export async function getEarningConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const row = await PlatformCoinPricing.findById(EARNING_DOC).lean();
  const stored = { ...(row?.earning || {}) };
  // A configuration saved with the untouched old badge amounts follows the new defaults.
  if (Array.isArray(stored.badgeLevels) && stored.badgeLevels.join(',') === PREVIOUS_BADGE_DEFAULTS.join(',')) delete stored.badgeLevels;
  // Likewise a saved daily challenge amount still at the old default (5) follows the new one (2).
  if (Number(stored.challenge) === PREVIOUS_CHALLENGE_DEFAULT) delete stored.challenge;
  cache = { version: row?.version || 0, earning: normalizeEarning(stored), updatedAt: row?.updatedAt || null };
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

// Standalone MongoDB (no replica set) rejects transactions with IllegalOperation (code 20).
let transactionsUnsupported = false;
const isNoTransactionSupport = (error) => error?.code === 20
  || /Transaction numbers are only allowed|replica set member or mongos|transactions are not supported/i.test(error?.message || '');

async function creditInTransaction(scope, userId, coins, movement) {
  let balance = 0;
  await mongoose.connection.transaction(async (session) => {
    if (await PlatformCoinMovement.exists({ requestId: movement.requestId }).session(session)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const wallet = await PlatformCoinWallet.findOneAndUpdate(
      { universityId: scope, userId },
      { $setOnInsert: { role: 'student' }, $inc: { balance: coins } },
      { upsert: true, new: true, session, setDefaultsOnInsert: false },
    );
    if (wallet.role !== 'student') throw new HttpError(409, 'Wallet is unavailable');
    balance = wallet.balance;
    await PlatformCoinMovement.create([movement], { session });
  });
  return balance;
}

/**
 * Without transactions: the ledger row goes first, so its unique requestId still guarantees a reward
 * is paid at most once (a duplicate stops before the wallet changes); then the wallet is credited.
 */
async function creditWithoutTransaction(scope, userId, coins, movement) {
  const created = await PlatformCoinMovement.create(movement);
  try {
    const wallet = await PlatformCoinWallet.findOneAndUpdate(
      { universityId: scope, userId },
      { $setOnInsert: { role: 'student' }, $inc: { balance: coins } },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
    return wallet.balance;
  } catch (error) {
    // Roll the ledger row back so a later retry can pay this reward.
    await PlatformCoinMovement.deleteOne({ _id: created._id }).catch(() => {});
    throw error;
  }
}

/** Test hook: force the no-transaction path. */
export function setEarnTransactionsUnsupported(value) { transactionsUnsupported = Boolean(value); }

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
  const movement = {
    universityId: scope, requestId, kind: `earn_${kind}`, amount: coins, actorId: userId,
    fromRole: 'platform', toRole: 'student', toUserId: userId, note: String(note).slice(0, 120),
  };
  let balance = 0;
  try {
    balance = transactionsUnsupported
      ? await creditWithoutTransaction(scope, userId, coins, movement)
      : await creditInTransaction(scope, userId, coins, movement);
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    if (!transactionsUnsupported && isNoTransactionSupport(error)) {
      // A standalone MongoDB (local development) cannot run transactions; remember and fall back.
      transactionsUnsupported = true;
      console.warn('[PrepCoin] MongoDB has no transaction support (not a replica set); earned coins use the ledger-first fallback.');
      try {
        balance = await creditWithoutTransaction(scope, userId, coins, movement);
      } catch (fallbackError) {
        if (fallbackError?.code === 11000) return { duplicate: true };
        throw fallbackError;
      }
    } else {
      throw error;
    }
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
