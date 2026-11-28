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

/** A standalone MongoDB (e.g. a local copy) cannot run transactions. */
const transactionsUnsupported = (error) => error?.code === 20 || /Transaction numbers are only allowed|replica set member or mongos/i.test(String(error?.message || ''));

/**
 * Coins the Master Admin creates for one wallet (nothing is debited anywhere). Runs in a transaction;
 * where the database has none, the ledger row is written first (its unique request ID makes a retry
 * pay once) and removed again if the wallet cannot be credited.
 */
async function mintToWallet({ expected, requestId, toRole, fromRole = 'superadmin' }) {
  const credit = (session = null) => PlatformCoinWallet.findOneAndUpdate(
    { universityId: expected.universityId, userId: expected.toUserId },
    { $setOnInsert: { role: toRole }, $inc: { balance: expected.amount } },
    { upsert: true, new: true, setDefaultsOnInsert: false, ...(session ? { session } : {}) },
  );
  const row = { ...expected, requestId, fromRole, toRole };
  try {
    let alreadyProcessed = false;
    await transaction(async (session) => {
      const movement = await PlatformCoinMovement.findOne({ requestId }).session(session);
      if (movement) { assertSameMovement(movement, expected); alreadyProcessed = true; return; }
      const wallet = await credit(session);
      if (wallet.role !== toRole || wallet.balance > MAX_BALANCE) throw new HttpError(409, 'Recipient wallet is unavailable');
      await PlatformCoinMovement.create([row], { session });
    });
    return { alreadyProcessed };
  } catch (error) {
    if (!transactionsUnsupported(error)) throw error;
  }
  try {
    await PlatformCoinMovement.create(row);
  } catch (error) {
    if (error?.code === 11000) { await existingMovement(requestId, expected); return { alreadyProcessed: true }; }
    throw error;
  }
  try {
    const wallet = await credit();
    if (wallet.role !== toRole || wallet.balance > MAX_BALANCE) {
      await PlatformCoinWallet.updateOne({ _id: wallet._id }, { $inc: { balance: -expected.amount } });
      throw new HttpError(409, 'Recipient wallet is unavailable');
    }
  } catch (error) {
    await PlatformCoinMovement.deleteOne({ requestId }).catch(() => {});
    throw error;
  }
  return { alreadyProcessed: false };
}

/** The coordinator or student `toUserId` in `scope` (PeerPrep's own database or one university's). */
async function findRecipient(scope, toUserId, toRole, { includeInactive = false } = {}) {
  const find = () => User.findOne({ _id: toUserId, role: toRole, ...(includeInactive ? {} : { isActive: { $ne: false } }) }).select('_id name').lean();
  if (scope === PLATFORM_WALLET_SCOPE) {
    const { runForPlatform } = await import('./tenantContext.js');
    return runForPlatform(find);
  }
  const [{ runForTenant }, { getTenant }] = await Promise.all([import('./tenantContext.js'), import('./tenantConnections.js')]);
  let tenant;
  try { tenant = await getTenant(scope, { includeInactive }); } catch { throw new HttpError(404, 'This university is unavailable'); }
  return runForTenant(tenant, find);
}

export async function topUpUniversity({ universityId, amount, actorId, requestId, kind = 'topup' }) {
  if (!['topup', 'initial'].includes(kind)) throw new HttpError(400, 'Invalid coin credit type');
  const expected = { universityId, kind, amount: coinAmount(amount), actorId, toUserId: null };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  let alreadyProcessed = false;
  try {
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
  } catch (error) {
    if (!transactionsUnsupported(error)) throw error;
  }
  // No transactions (standalone database): ledger row first, then the wallet; undo the row on failure.
  try {
    await PlatformCoinMovement.create({ ...expected, requestId: id, fromRole: 'superadmin', toRole: 'university' });
  } catch (error) {
    if (error?.code === 11000) { await existingMovement(id, expected); return { alreadyProcessed: true }; }
    throw error;
  }
  const updated = await University.updateOne(
    { universityId, deletedAt: null, $or: [{ coinBalance: { $exists: false } }, { coinBalance: { $lte: MAX_BALANCE - expected.amount } }] },
    { $inc: { coinBalance: expected.amount } },
  ).catch(async (error) => { await PlatformCoinMovement.deleteOne({ requestId: id }).catch(() => {}); throw error; });
  if (!updated.matchedCount) {
    await PlatformCoinMovement.deleteOne({ requestId: id }).catch(() => {});
    throw new HttpError(404, 'University not found or its wallet limit is reached');
  }
  return { alreadyProcessed: false };
}

/**
 * Master Admin: give coins to any coordinator or student, in PeerPrep's own database (`scope` =
 * PLATFORM_WALLET_SCOPE) or in any university (`scope` = its ID). Coins are created, so there is
 * no balance to run out; each issue is at most MAX_ALLOCATION and a retried request pays once.
 */
export async function creditPlatformUser({ actorId, toUserId, toRole, amount, requestId, scope = PLATFORM_WALLET_SCOPE }) {
  if (!['coordinator', 'student'].includes(toRole) || !mongoose.isValidObjectId(toUserId)) {
    throw new HttpError(400, 'Choose a valid coordinator or student');
  }
  const universityId = String(scope || PLATFORM_WALLET_SCOPE);
  const expected = {
    universityId,
    kind: toRole === 'coordinator' ? 'superadmin_to_coordinator' : 'superadmin_to_student',
    amount: coinAmount(amount), actorId, toUserId: new mongoose.Types.ObjectId(String(toUserId)),
  };
  const id = coinRequestId(requestId);
  if (await existingMovement(id, expected)) return { alreadyProcessed: true };
  const target = await findRecipient(universityId, toUserId, toRole);
  if (!target) throw new HttpError(404, 'This coordinator or student is unavailable');
  return mintToWallet({ expected, requestId: id, toRole });
}

/** Master Admin removes available coins from a university or student, leaving historical charges intact. */
export async function removeCoins({ scope, targetRole, targetUserId, amount, actorId, requestId, reason }) {
  if (!['university', 'student'].includes(targetRole)) throw new HttpError(400, 'Choose a university or student wallet');
  const count = coinAmount(amount);
  const id = coinRequestId(requestId);
  const note = String(reason || '').trim();
  if (note.length < 3 || note.length > 200) throw new HttpError(400, 'Enter a reason from 3 to 200 characters');
  const universityId = String(scope || '');
  const studentId = targetRole === 'student' && mongoose.isValidObjectId(targetUserId)
    ? new mongoose.Types.ObjectId(String(targetUserId)) : null;
  if (targetRole === 'student' && !studentId) throw new HttpError(400, 'Choose a valid student');
  if (targetRole === 'university') {
    if (universityId === PLATFORM_WALLET_SCOPE || !(await University.exists({ universityId, deletedAt: null }))) throw new HttpError(404, 'University not found');
  } else if (!(await findRecipient(universityId, studentId, 'student', { includeInactive: true }))) {
    throw new HttpError(404, 'Student not found');
  }
  const expected = {
    universityId, requestId: id, kind: targetRole === 'student' ? 'superadmin_remove_student' : 'superadmin_remove_university',
    amount: count, actorId, fromRole: targetRole, ...(studentId ? { fromUserId: studentId } : {}), toRole: 'platform', note,
  };
  const same = (row) => row.universityId === universityId && row.kind === expected.kind && row.amount === count
    && String(row.actorId) === String(actorId) && String(row.fromUserId || '') === String(studentId || '') && row.note === note;
  const prior = await PlatformCoinMovement.findOne({ requestId: id }).lean();
  if (prior) {
    if (!same(prior)) throw new HttpError(409, 'This request ID was used for a different coin adjustment');
    return { alreadyProcessed: true };
  }
  const debit = (session = null) => targetRole === 'university'
    ? University.findOneAndUpdate({ universityId, deletedAt: null, coinBalance: { $gte: count } }, { $inc: { coinBalance: -count } }, { new: true, ...(session ? { session } : {}) })
    : PlatformCoinWallet.findOneAndUpdate({ universityId, userId: studentId, role: 'student', balance: { $gte: count } }, { $inc: { balance: -count } }, { new: true, ...(session ? { session } : {}) });
  const restore = () => targetRole === 'university'
    ? University.updateOne({ universityId }, { $inc: { coinBalance: count } })
    : PlatformCoinWallet.updateOne({ universityId, userId: studentId }, { $inc: { balance: count } });
  const insufficient = () => new HttpError(409, `This wallet has fewer than ${count} Prep Coins. Refresh the balance and try again.`, { code: 'INSUFFICIENT_PREP_COINS' });
  try {
    let alreadyProcessed = false;
    await mongoose.connection.transaction(async (session) => {
      const existing = await PlatformCoinMovement.findOne({ requestId: id }).session(session);
      if (existing) {
        if (!same(existing)) throw new HttpError(409, 'This request ID was used for a different coin adjustment');
        alreadyProcessed = true;
        return;
      }
      if (!(await debit(session))) throw insufficient();
      await PlatformCoinMovement.create([expected], { session });
    });
    return { alreadyProcessed };
  } catch (error) {
    if (!transactionsUnsupported(error)) {
      if (error?.code === 11000) {
        const existing = await PlatformCoinMovement.findOne({ requestId: id }).lean();
        if (existing && same(existing)) return { alreadyProcessed: true };
      }
      throw error;
    }
  }
  // Standalone MongoDB: the conditional debit is atomic; undo it if the ledger write fails.
  if (!(await debit())) throw insufficient();
  try {
    await PlatformCoinMovement.create(expected);
  } catch (error) {
    await restore();
    if (error?.code === 11000) {
      const existing = await PlatformCoinMovement.findOne({ requestId: id }).lean();
      if (existing && same(existing)) return { alreadyProcessed: true };
    }
    throw error;
  }
  return { alreadyProcessed: false };
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
