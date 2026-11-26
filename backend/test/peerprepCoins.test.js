import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { University, PlatformCoinWallet, PlatformCoinMovement } from '../src/platform/models.js';
import User from '../src/models/User.js';
import { topUpUniversity, allocateCoins, creditPlatformUser, PLATFORM_WALLET_SCOPE, walletBalance } from '../src/platform/coins.js';
import { encryptTenantSecret } from '../src/platform/tenantSecrets.js';
import { closeTenantConnections, getTenant, testTenantConnection } from '../src/platform/tenantConnections.js';
import { runForTenant } from '../src/platform/tenantContext.js';

test('the Master Admin gives any university student coins directly, with no university balance used', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } }); }
  catch (error) { if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox'); throw error; }
  const previousKey = process.env.PEERPREP_TENANT_SECRET_KEY;
  process.env.PEERPREP_TENANT_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');
  await mongoose.connect(mongo.getUri('central'));
  try {
    await Promise.all([University.createIndexes(), PlatformCoinWallet.createIndexes(), PlatformCoinMovement.createIndexes()]);
    const uri = mongo.getUri('north_db');
    await testTenantConnection(uri, 'north', { claim: true });
    await University.create({ universityId: 'north', name: 'North', apiKeyHash: 'a'.repeat(64), active: true, dbUriEncrypted: encryptTenantSecret(uri) });
    const student = await runForTenant(await getTenant('north'), () => User.create({ role: 'student', name: 'North student', email: 'north-student@example.com', studentId: 'N-1', passwordHash: 'test' }));
    const superadmin = new mongoose.Types.ObjectId();
    const requestId = crypto.randomUUID();
    await creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 500, requestId, scope: 'north' });
    assert.equal((await creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 500, requestId, scope: 'north' })).alreadyProcessed, true, 'a retried click pays once');
    assert.equal(await walletBalance('north', { role: 'student', _id: student._id }), 500, 'the student sees it in their university wallet');
    assert.equal(await walletBalance('north', { role: 'admin' }), 0, 'no university balance is used');
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, { role: 'student', _id: student._id }), 0);
    assert.equal(await PlatformCoinMovement.countDocuments({ universityId: 'north', kind: 'superadmin_to_student' }), 1);
    await assert.rejects(creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 5, requestId: crypto.randomUUID() }), /unavailable/, 'not a PeerPrep (main database) student');
    await assert.rejects(creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 5, requestId: crypto.randomUUID(), scope: 'missing-uni' }), /unavailable/);
  } finally {
    await closeTenantConnections();
    await mongoose.disconnect();
    await mongo.stop();
    if (previousKey === undefined) delete process.env.PEERPREP_TENANT_SECRET_KEY; else process.env.PEERPREP_TENANT_SECRET_KEY = previousKey;
  }
});

test('issuing coins works on a database without transactions (local standalone MongoDB)', async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } }); }
  catch (error) { if (error?.code === 'EPERM') return t.skip('Local sockets are unavailable in this sandbox'); throw error; }
  await mongoose.connect(mongo.getUri());
  try {
    await Promise.all([University.createIndexes(), PlatformCoinWallet.createIndexes(), PlatformCoinMovement.createIndexes()]);
    await University.create({ universityId: 'north', name: 'North' });
    const superadmin = new mongoose.Types.ObjectId();
    const student = await User.create({ role: 'student', name: 'Main student', email: 'solo@example.com', studentId: 'S-1', passwordHash: 'test' });
    const requestId = crypto.randomUUID();
    await creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 40, requestId });
    assert.equal((await creditPlatformUser({ actorId: superadmin, toUserId: student._id, toRole: 'student', amount: 40, requestId })).alreadyProcessed, true);
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 40);
    const topUp = crypto.randomUUID();
    await topUpUniversity({ universityId: 'north', amount: 300, actorId: superadmin, requestId: topUp });
    assert.equal((await topUpUniversity({ universityId: 'north', amount: 300, actorId: superadmin, requestId: topUp })).alreadyProcessed, true);
    assert.equal(await walletBalance('north', { role: 'admin' }), 300);
    await assert.rejects(topUpUniversity({ universityId: 'gone', amount: 5, actorId: superadmin, requestId: crypto.randomUUID() }), /not found/);
    assert.equal(await PlatformCoinMovement.countDocuments({ universityId: 'gone' }), 0, 'a failed issue leaves no ledger row');

    // Spending (e.g. ANVI JD Match) and refunds also work without transactions.
    const { chargeFeature, refundCharge, resetTransactionSupportCache, clearCoinPricingCache } = await import('../src/platform/coinSpend.js');
    resetTransactionSupportCache(); clearCoinPricingCache();
    const spend = (resourceKey, extra = {}) => chargeFeature({ scope: PLATFORM_WALLET_SCOPE, userId: student._id, featureKey: 'resume.jd_match', resourceKey, ...extra });
    const first = await spend('m1', { expectedCost: 10, note: 'SDE · Acme' });
    assert.equal(first.charge.price, 10);
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 30);
    assert.equal((await spend('m1')).alreadyEntitled, true, 'the same check pays once');
    await assert.rejects(spend('m2', { expectedCost: 7 }), (error) => error.status === 409);
    await spend('m3'); await spend('m4'); await spend('m5');
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 0);
    await assert.rejects(spend('m6'), (error) => error.status === 402);
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 0, 'a short balance takes nothing');
    assert.equal(await refundCharge(first.charge._id, 'test'), true);
    assert.equal(await refundCharge(first.charge._id, 'test'), false, 'refunded once');
    assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 10);
    assert.equal(await PlatformCoinMovement.countDocuments({ kind: 'student_refund' }), 1);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

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
