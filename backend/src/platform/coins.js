import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import User from '../models/User.js';
import { PlatformCoinMovement, PlatformCoinWallet, University } from './models.js';

// University IDs accept only lowercase letters, digits and hyphens, so this
// scope cannot collide with a university wallet.
export const PLATFORM_WALLET_SCOPE = '__peerprep_platform__';
const MAX_ALLOCATION = 1_000_000_000;
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

export function coinAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_ALLOCATION) {
    throw new HttpError(400, `Enter a whole number of Prep Coins from 1 to ${MAX_ALLOCATION}`);
  }
  return amount;
}

export function coinRequestId(value) {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, 'A valid request ID is required');
  }
  return id;
}

function assertSameMovement(movement, expected) {
  const same = movement.universityId === expected.universityId
    && movement.kind === expected.kind
    && movement.amount === expected.amount
    && String(movement.actorId) === String(expected.actorId)
    && String(movement.toUserId || '') === String(expected.toUserId || '');
  if (!same) throw new HttpError(409, 'This request ID was used for a different coin allocation');
}

async function existingMovement(requestId, expected) {
  const movement = await PlatformCoinMovement.findOne({ requestId }).lean();
  if (!movement) return null;
  assertSameMovement(movement, expected);
  return movement;
}

async function transaction(work) {
  try {
    return await mongoose.connection.transaction(work);
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'This coin allocation was already processed. Refresh the wallet.');
    throw error;
  }
}

export async function topUpUniversity({ universityId, amount, actorId, requestId, kind = 'topup' }) {
  if (!['topup', 'initial'].includes(kind)) throw new HttpError(400, 'Invalid coin credit type');
  const expected = { universityId, kind, amount: coinAmount(amount), actorId, toUserId: null };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  let alreadyProcessed = false;
  await transaction(async (session) => {
    const movement = await PlatformCoinMovement.findOne({ requestId: id }).session(session);
    if (movement) {
      assertSameMovement(movement, expected);
      alreadyProcessed = true;
      return;
    }
    const university = await University.findOne({ universityId, deletedAt: null }).session(session);
    if (!university) throw new HttpError(404, 'University not found');
    if ((university.coinBalance || 0) > MAX_BALANCE - expected.amount) throw new HttpError(409, 'University wallet limit reached');
    university.coinBalance = (university.coinBalance || 0) + expected.amount;
    await university.save({ session });
    await PlatformCoinMovement.create([{
      ...expected, requestId: id, fromRole: 'superadmin', toRole: 'university',
    }], { session });
  });
  return { alreadyProcessed };
}

export async function creditPlatformUser({ actorId, toUserId, toRole, amount, requestId }) {
  if (!['coordinator', 'student'].includes(toRole) || !mongoose.isValidObjectId(toUserId)) {
    throw new HttpError(400, 'Choose a valid PeerPrep coordinator or student');
  }
  const expected = {
    universityId: PLATFORM_WALLET_SCOPE,
    kind: toRole === 'coordinator' ? 'superadmin_to_coordinator' : 'superadmin_to_student',
    amount: coinAmount(amount), actorId, toUserId,
  };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  let alreadyProcessed = false;
  await transaction(async (session) => {
    const movement = await PlatformCoinMovement.findOne({ requestId: id }).session(session);
    if (movement) {
      assertSameMovement(movement, expected);
      alreadyProcessed = true;
      return;
    }
    const target = await User.findOne({ _id: toUserId, role: toRole, isActive: { $ne: false } })
      .select('_id').session(session).lean();
    if (!target) throw new HttpError(404, 'PeerPrep recipient is unavailable');
    const wallet = await PlatformCoinWallet.findOneAndUpdate(
      { universityId: PLATFORM_WALLET_SCOPE, userId: target._id },
      { $setOnInsert: { role: toRole }, $inc: { balance: expected.amount } },
      { upsert: true, new: true, session, setDefaultsOnInsert: false },
    );
    if (wallet.role !== toRole || wallet.balance > MAX_BALANCE) throw new HttpError(409, 'Recipient wallet is unavailable');
    await PlatformCoinMovement.create([{
      ...expected, requestId: id, fromRole: 'superadmin', toRole,
    }], { session });
  });
  return { alreadyProcessed };
}

export async function allocateCoins({ universityId, actorId, fromRole, fromUserId, toRole, toUserId, amount, requestId }) {
  if (!['university', 'coordinator'].includes(fromRole)
    || (fromRole === 'university' && toRole !== 'coordinator')
    || (fromRole === 'coordinator' && toRole !== 'student')) {
    throw new HttpError(403, 'This coin transfer is not allowed');
  }
  const kind = fromRole === 'university' ? 'admin_to_coordinator' : 'coordinator_to_student';
  const expected = { universityId, kind, amount: coinAmount(amount), actorId, toUserId };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  let alreadyProcessed = false;
  await transaction(async (session) => {
    const movement = await PlatformCoinMovement.findOne({ requestId: id }).session(session);
    if (movement) {
      assertSameMovement(movement, expected);
      alreadyProcessed = true;
      return;
    }
    if (fromRole === 'university') {
      const sender = await University.findOne({ universityId, deletedAt: null }).session(session);
      if (!sender) throw new HttpError(404, 'University not found');
      if ((sender.coinBalance || 0) < expected.amount) throw new HttpError(409, 'Not enough Prep Coins in the university wallet');
      sender.coinBalance -= expected.amount;
      await sender.save({ session });
    } else if (fromRole === 'coordinator') {
      const sender = await PlatformCoinWallet.findOne({ universityId, userId: fromUserId, role: 'coordinator' }).session(session);
      if (!sender || sender.balance < expected.amount) throw new HttpError(409, 'Not enough Prep Coins in your wallet');
      sender.balance -= expected.amount;
      await sender.save({ session });
    }
    const recipient = await PlatformCoinWallet.findOneAndUpdate(
      { universityId, userId: toUserId },
      { $setOnInsert: { role: toRole }, $inc: { balance: expected.amount } },
      { upsert: true, new: true, session, setDefaultsOnInsert: false },
    );
    if (recipient.role !== toRole || recipient.balance > MAX_BALANCE) throw new HttpError(409, 'Recipient wallet is unavailable');
    await PlatformCoinMovement.create([{
      ...expected, requestId: id, fromRole, fromUserId: fromUserId || undefined, toRole,
    }], { session });
  });
  return { alreadyProcessed };
}

export async function walletBalance(universityId, user) {
  if (user.role === 'admin') {
    const university = await University.findOne({ universityId, deletedAt: null }).select('coinBalance').lean();
    if (!university) throw new HttpError(404, 'University not found');
    return university.coinBalance || 0;
  }
  const wallet = await PlatformCoinWallet.findOne({ universityId, userId: user._id }).select('balance').lean();
  return wallet?.balance || 0;
}

export async function walletMovements(universityId, user, limit = 20) {
  // Admins see the university's flow; coordinators and students see coins in and out of their own wallet.
  const scope = user.role === 'admin' ? {} : { $or: [{ fromUserId: user._id }, { toUserId: user._id }] };
  return PlatformCoinMovement.find({ universityId, ...scope }).sort({ createdAt: -1 }).limit(limit).lean();
}
