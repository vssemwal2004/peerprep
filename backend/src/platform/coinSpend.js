// Prep Coin spending. Coins leave the wallet when a paid action starts (status `pending`) and the
// charge is then captured on success or refunded on failure; the sweeper settles anything a crash
// left pending. One charge per (wallet scope, student, feature, resource) makes retries, double
// clicks and parallel tabs pay once. Each month's free uses are spent before any coins.
import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import { PlatformAudit, PlatformCoinCharge, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinWallet } from './models.js';
import { COIN_FEATURES, COIN_FEATURE_KEYS, MAX_FREE_PER_MONTH, MAX_PRICE } from './coinFeatures.js';

const PRICING_CACHE_MS = 15_000;
const STALE_PENDING_MS = 5 * 60_000;
let pricingCache = null;
let pricingCachedAt = 0;

export function clearCoinPricingCache() { pricingCache = null; pricingCachedAt = 0; }

/** The calendar month in India (IST), so free uses reset at local midnight on the 1st. */
export function quotaMonth(date = new Date()) {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 7);
}

function normalizeFeature(value = {}) {
  const price = Number(value.price ?? 0);
  const freePerMonth = Number(value.freePerMonth ?? 0);
  if (!Number.isSafeInteger(price) || price < 0 || price > MAX_PRICE) throw new HttpError(400, `Prices must be whole numbers from 0 to ${MAX_PRICE}.`);
  if (!Number.isSafeInteger(freePerMonth) || freePerMonth < 0 || freePerMonth > MAX_FREE_PER_MONTH) throw new HttpError(400, `Free uses must be whole numbers from 0 to ${MAX_FREE_PER_MONTH}.`);
  return { price, freePerMonth };
}

export function normalizePricing(features = {}) {
  const input = features && typeof features === 'object' ? features : {};
  const unknown = Object.keys(input).filter((key) => !COIN_FEATURE_KEYS.includes(key));
  if (unknown.length) throw new HttpError(400, `Unknown feature: ${unknown[0]}`);
  return Object.fromEntries(COIN_FEATURE_KEYS.map((key) => [key, normalizeFeature(input[key])]));
}

export async function getCoinPricing({ fresh = false } = {}) {
  if (!fresh && pricingCache && Date.now() - pricingCachedAt < PRICING_CACHE_MS) return pricingCache;
  const row = await PlatformCoinPricing.findById('current').lean();
  pricingCache = { version: row?.version || 0, features: normalizePricing(row?.features || {}), updatedAt: row?.updatedAt || null, reason: row?.reason || '' };
  pricingCachedAt = Date.now();
  return pricingCache;
}

/** Master Admin save with optimistic concurrency: a stale page cannot overwrite a newer price list. */
export async function saveCoinPricing({ features, expectedVersion, reason, actorId }) {
  const normalized = normalizePricing(features);
  const before = await getCoinPricing({ fresh: true });
  if (Number(expectedVersion) !== before.version) throw new HttpError(409, 'Prices were changed elsewhere. Reload to see the latest prices.');
  const filter = before.version ? { _id: 'current', version: before.version } : { _id: 'current', $or: [{ version: 0 }, { version: { $exists: false } }] };
  try {
    const saved = await PlatformCoinPricing.findOneAndUpdate(filter, {
      $set: { features: normalized, updatedBy: actorId, reason: String(reason || '').trim().slice(0, 300) }, $inc: { version: 1 },
    }, { upsert: true, new: true }).lean();
    await PlatformAudit.create({ actor: String(actorId), action: 'prep_coin.pricing_updated', details: { before: before.features, after: normalized, version: saved.version } });
    clearCoinPricingCache();
    return getCoinPricing({ fresh: true });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'Prices were changed elsewhere. Reload to see the latest prices.');
    throw error;
  }
}

const chargeKeyFor = (scope, userId, featureKey, resourceKey) => `${scope}:${userId}:${featureKey}:${resourceKey}`;

async function freeUsesThisMonth(scope, userId, featureKey, month, session) {
  return PlatformCoinCharge.countDocuments({ universityId: scope, userId, featureKey, quotaMonth: month, freeQuota: true, status: { $in: ['pending', 'captured'] } }).session(session);
}

/** What the student would pay right now: { price, freeLeft, freePerMonth, balance }. */
export async function featureQuote({ scope, userId, featureKey, now = new Date() }) {
  const pricing = await getCoinPricing();
  const { price, freePerMonth } = pricing.features[featureKey] || { price: 0, freePerMonth: 0 };
  const [used, wallet] = await Promise.all([
    freePerMonth ? PlatformCoinCharge.countDocuments({ universityId: scope, userId, featureKey, quotaMonth: quotaMonth(now), freeQuota: true, status: { $in: ['pending', 'captured'] } }) : 0,
    PlatformCoinWallet.findOne({ universityId: scope, userId }).select('balance').lean(),
  ]);
  const freeLeft = Math.max(0, freePerMonth - used);
  return { featureKey, price, freePerMonth, freeLeft, cost: price > 0 && freeLeft === 0 ? price : 0, balance: wallet?.balance || 0 };
}

/**
 * Charges one use of a feature. Returns null when it is free (no price), `{ alreadyEntitled }`
 * when this student already holds a live charge for the resource, or the pending charge.
 * Throws 402 when the balance is short and 409 when the price the student saw has changed.
 */
export async function chargeFeature({ scope, userId, featureKey, resourceKey, expectedCost, now = new Date() }) {
  if (!COIN_FEATURE_KEYS.includes(featureKey)) throw new Error(`Unknown coin feature ${featureKey}`);
  const pricing = await getCoinPricing();
  const { price, freePerMonth } = pricing.features[featureKey];
  if (!price) return null;
  const user = new mongoose.Types.ObjectId(String(userId));
  const chargeKey = chargeKeyFor(scope, user, featureKey, resourceKey);
  const month = quotaMonth(now);
  let result = null;
  try {
    await mongoose.connection.transaction(async (session) => {
      result = null;
      const existing = await PlatformCoinCharge.findOne({ chargeKey }).session(session);
      if (existing && existing.status !== 'refunded') { result = { alreadyEntitled: true, charge: existing.toObject() }; return; }
      // Touching the wallet serializes this student's charges, so two tabs cannot both use the last free use or coin.
      const touched = await PlatformCoinWallet.findOneAndUpdate(
        { universityId: scope, userId: user },
        { $setOnInsert: { role: 'student', balance: 0 }, $set: { updatedAt: now } },
        { upsert: true, new: true, session, setDefaultsOnInsert: false },
      );
      const free = freePerMonth > 0 && (await freeUsesThisMonth(scope, user, featureKey, month, session)) < freePerMonth;
      const cost = free ? 0 : price;
      if (expectedCost !== undefined && expectedCost !== null && Number(expectedCost) !== cost) {
        throw new HttpError(409, 'The price of this action has changed. Check it and try again.', { code: 'PREP_COIN_PRICE_CHANGED', cost, balance: touched.balance });
      }
      if (cost) {
        const wallet = await PlatformCoinWallet.findOneAndUpdate(
          { universityId: scope, userId: user, balance: { $gte: cost } },
          { $inc: { balance: -cost } }, { new: true, session },
        );
        if (!wallet) throw new HttpError(402, `This needs ${cost} Prep Coins.`, { code: 'INSUFFICIENT_PREP_COINS', required: cost, balance: touched.balance });
      }
      const attempt = existing ? existing.attempt + 1 : 1;
      const fields = { price: cost, freeQuota: free, pricingVersion: pricing.version, attempt, status: 'pending', quotaMonth: month, capturedAt: null, refundedAt: null, refundReason: null };
      const charge = existing
        ? await PlatformCoinCharge.findOneAndUpdate({ _id: existing._id, status: 'refunded' }, { $set: fields }, { new: true, session })
        : (await PlatformCoinCharge.create([{ universityId: scope, userId: user, featureKey, resourceKey, chargeKey, ...fields }], { session }))[0];
      if (cost) {
        await PlatformCoinMovement.create([{
          universityId: scope, requestId: `charge:${charge._id}:${attempt}:spend`, kind: 'student_spend', amount: cost,
          actorId: user, fromRole: 'student', fromUserId: user, toRole: 'platform', featureKey, chargeId: charge._id,
        }], { session });
      }
      result = { charge: charge.toObject() };
    });
  } catch (error) {
    // A parallel request created the same charge first: this one is already paid for.
    if (error?.code === 11000) return { alreadyEntitled: true };
    throw error;
  }
  return result;
}

export async function captureCharge(chargeId) {
  await PlatformCoinCharge.updateOne({ _id: chargeId, status: 'pending' }, { $set: { status: 'captured', capturedAt: new Date() } });
}

/** Returns a charge's coins (and free use). Idempotent: a settled or refunded charge is left alone. */
export async function refundCharge(chargeId, reason = 'Action did not complete') {
  let refunded = false;
  await mongoose.connection.transaction(async (session) => {
    refunded = false;
    const charge = await PlatformCoinCharge.findOneAndUpdate(
      { _id: chargeId, status: { $in: ['pending', 'captured'] } },
      { $set: { status: 'refunded', refundedAt: new Date(), refundReason: String(reason).slice(0, 200) } },
      { new: true, session },
    );
    if (!charge) return;
    refunded = true;
    if (!charge.price) return;
    await PlatformCoinWallet.updateOne({ universityId: charge.universityId, userId: charge.userId }, { $inc: { balance: charge.price } }, { session });
    await PlatformCoinMovement.create([{
      universityId: charge.universityId, requestId: `charge:${charge._id}:${charge.attempt}:refund`, kind: 'student_refund', amount: charge.price,
      actorId: charge.userId, fromRole: 'platform', toRole: 'student', toUserId: charge.userId, featureKey: charge.featureKey, chargeId: charge._id,
    }], { session });
  });
  return refunded;
}

/** Refunds every live charge on a resource (an event that was cancelled, deleted or left). */
export async function refundResource({ scope, featureKey, resourceKey, userId = null, reason }) {
  const filter = { universityId: scope, featureKey, resourceKey: String(resourceKey), status: { $in: ['pending', 'captured'] }, ...(userId ? { userId } : {}) };
  const charges = await PlatformCoinCharge.find(filter).select('_id').lean();
  let count = 0;
  for (const charge of charges) if (await refundCharge(charge._id, reason)) count += 1;
  return count;
}

/**
 * Settles charges a crash left pending: `verify(charge)` says whether the action really happened.
 * Charges whose feature has no verifier are captured (the action ran; only the settlement was lost).
 */
export async function sweepPendingCharges({ scope, verifiers = {}, now = new Date(), limit = 50 }) {
  const stale = await PlatformCoinCharge.find({ universityId: scope, status: 'pending', updatedAt: { $lt: new Date(now.getTime() - STALE_PENDING_MS) } })
    .sort({ updatedAt: 1 }).limit(limit).lean();
  for (const charge of stale) {
    const verify = verifiers[charge.featureKey];
    const happened = verify ? await verify(charge).catch(() => true) : true;
    if (happened) await captureCharge(charge._id);
    else await refundCharge(charge._id, 'Not completed');
  }
  return stale.length;
}

export const coinFeatureCatalog = () => COIN_FEATURES.map(({ key, label, detail }) => ({ key, label, detail }));
