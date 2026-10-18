import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { University, PlatformCoinWallet, PlatformCoinMovement } from '../src/platform/models.js';
import User from '../src/models/User.js';
import { topUpUniversity, allocateCoins, creditPlatformUser, PLATFORM_WALLET_SCOPE, walletBalance } from '../src/platform/coins.js';

test('coins move atomically within one university and retries do not duplicate credits', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } }); }
  catch (error) {
    if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox');
    throw error;
  }
  await mongoose.connect(mongo.getUri());
  try {
    await Promise.all([University.createIndexes(), PlatformCoinWallet.createIndexes(), PlatformCoinMovement.createIndexes()]);
    await University.create([{ universityId: 'north', name: 'North' }, { universityId: 'south', name: 'South' }]);
    const superadmin = new mongoose.Types.ObjectId();
    const coordinator = new mongoose.Types.ObjectId();
    const student = new mongoose.Types.ObjectId();
    const firstId = crypto.randomUUID();
    await topUpUniversity({ universityId: 'north', amount: 100, actorId: superadmin, requestId: firstId });
    assert.equal((await topUpUniversity({ universityId: 'north', amount: 100, actorId: superadmin, requestId: firstId })).alreadyProcessed, true);
    await allocateCoins({ universityId: 'north', actorId: superadmin, fromRole: 'university', toRole: 'coordinator', toUserId: coordinator, amount: 60, requestId: crypto.randomUUID() });
    await allocateCoins({ universityId: 'north', actorId: coordinator, fromRole: 'coordinator', fromUserId: coordinator, toRole: 'student', toUserId: student, amount: 25, requestId: crypto.randomUUID() });
    assert.equal(await walletBalance('north', { role: 'admin' }), 40);
    assert.equal(await walletBalance('north', { role: 'coordinator', _id: coordinator }), 35);
    assert.equal(await walletBalance('north', { role: 'student', _id: student }), 25);
    assert.equal(await walletBalance('south', { role: 'student', _id: student }), 0);
    await assert.rejects(allocateCoins({ universityId: 'north', actorId: coordinator, fromRole: 'coordinator', fromUserId: coordinator, toRole: 'student', toUserId: student, amount: 36, requestId: crypto.randomUUID() }), /Not enough/);
    assert.equal(await walletBalance('north', { role: 'student', _id: student }), 25);

    const mainCoordinator = await User.create({ role: 'coordinator', name: 'Main coordinator', email: 'main-coordinator@example.com', coordinatorId: 'MAIN-1', passwordHash: 'test' });
    const mainStudent = await User.create({ role: 'student', name: 'Main student', email: 'main-student@example.com', studentId: 'MAIN-S1', teacherIds: ['MAIN-1'], passwordHash: 'test' });
    const inactiveStudent = await User.create({ role: 'student', name: 'Inactive student', email: 'inactive@example.com', studentId: 'MAIN-S2', isActive: false, passwordHash: 'test' });
    const directId = crypto.randomUUID();
    await creditPlatformUser({ actorId: superadmin, toUserId: mainCoordinator._id, toRole: 'coordinator', amount: 70, requestId: directId });
    assert.equal((await creditPlatformUser({ actorId: superadmin, toUserId: mainCoordinator._id, toRole: 'coordinator', amount: 70, requestId: directId })).alreadyProcessed, true);
    await creditPlatformUser({ actorId: superadmin, toUserId: mainStudent._id, toRole: 'student', amount: 10, requestId: crypto.randomUUID() });
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, mainCoordinator), 70);
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, mainStudent), 10);
    assert.equal(await walletBalance('north', mainStudent), 0);
    await allocateCoins({ universityId: PLATFORM_WALLET_SCOPE, actorId: mainCoordinator._id, fromRole: 'coordinator', fromUserId: mainCoordinator._id, toRole: 'student', toUserId: mainStudent._id, amount: 25, requestId: crypto.randomUUID() });
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, mainCoordinator), 45);
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, mainStudent), 35);
    assert.equal(await PlatformCoinMovement.countDocuments({ universityId: PLATFORM_WALLET_SCOPE, kind: 'superadmin_to_coordinator' }), 1);
    await assert.rejects(creditPlatformUser({ actorId: superadmin, toUserId: mainStudent._id, toRole: 'coordinator', amount: 1, requestId: crypto.randomUUID() }), /unavailable/);
    await assert.rejects(creditPlatformUser({ actorId: superadmin, toUserId: inactiveStudent._id, toRole: 'student', amount: 1, requestId: crypto.randomUUID() }), /unavailable/);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
