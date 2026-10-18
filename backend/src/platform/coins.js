import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import { PlatformCoinMovement, PlatformCoinWallet, University } from './models.js';

const MAX_ALLOCATION = 1_000_000_000;
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

export function coinAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_ALLOCATION) {
    throw new HttpError(400, `Enter a whole number of PeerPrep coins from 1 to ${MAX_ALLOCATION}`);
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

async function existingMovement(requestId, expected) {
  const movement = await PlatformCoinMovement.findOne({ requestId }).lean();
  if (!movement) return null;
  const same = movement.universityId === expected.universityId
    && movement.kind === expected.kind
    && movement.amount === expected.amount
    && String(movement.actorId) === String(expected.actorId)
    && String(movement.toUserId || '') === String(expected.toUserId || '');
  if (!same) throw new HttpError(409, 'This request ID was used for a different coin allocation');
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

export async function topUpUniversity({ universityId, amount, actorId, requestId }) {
  const expected = { universityId, kind: 'topup', amount: coinAmount(amount), actorId, toUserId: null };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  await transaction(async (session) => {
    if (await PlatformCoinMovement.findOne({ requestId: id }).session(session)) return;
    const university = await University.findOne({ universityId, deletedAt: null }).session(session);
    if (!university) throw new HttpError(404, 'University not found');
    if ((university.coinBalance || 0) > MAX_BALANCE - expected.amount) throw new HttpError(409, 'University wallet limit reached');
    university.coinBalance = (university.coinBalance || 0) + expected.amount;
    await university.save({ session });
    await PlatformCoinMovement.create([{
      ...expected, requestId: id, fromRole: 'superadmin', toRole: 'university',
    }], { session });
  });
  return { alreadyProcessed: false };
}

export async function allocateCoins({ universityId, actorId, fromRole, fromUserId, toRole, toUserId, amount, requestId }) {
  const kind = fromRole === 'superadmin' ? 'superadmin_to_coordinator'
    : fromRole === 'university' ? 'admin_to_coordinator' : 'coordinator_to_student';
  const expected = { universityId, kind, amount: coinAmount(amount), actorId, toUserId };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  await transaction(async (session) => {
    if (await PlatformCoinMovement.findOne({ requestId: id }).session(session)) return;
    if (fromRole === 'university') {
      const sender = await University.findOne({ universityId, deletedAt: null }).session(session);
      if (!sender) throw new HttpError(404, 'University not found');
      if ((sender.coinBalance || 0) < expected.amount) throw new HttpError(409, 'Not enough PeerPrep coins in the university wallet');
      sender.coinBalance -= expected.amount;
      await sender.save({ session });
    } else if (fromRole === 'coordinator') {
      const sender = await PlatformCoinWallet.findOne({ universityId, userId: fromUserId, role: 'coordinator' }).session(session);
      if (!sender || sender.balance < expected.amount) throw new HttpError(409, 'Not enough PeerPrep coins in your wallet');
      sender.balance -= expected.amount;
      await sender.save({ session });
    }
    const recipient = await PlatformCoinWallet.findOneAndUpdate(
      { universityId, userId: toUserId },
      { $setOnInsert: { role: toRole }, $inc: { balance: expected.amount } },
      { upsert: true, new: true, session, setDefaultsOnInsert: true },
    );
    if (recipient.role !== toRole || recipient.balance > MAX_BALANCE) throw new HttpError(409, 'Recipient wallet is unavailable');
    await PlatformCoinMovement.create([{
      ...expected, requestId: id, fromRole, fromUserId: fromUserId || undefined, toRole,
    }], { session });
  });
  return { alreadyProcessed: false };
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
  const scope = user.role === 'admin' ? {} : user.role === 'coordinator'
    ? { $or: [{ fromUserId: user._id }, { toUserId: user._id }] }
    : { toUserId: user._id };
  return PlatformCoinMovement.find({ universityId, ...scope }).sort({ createdAt: -1 }).limit(limit).lean();
}
