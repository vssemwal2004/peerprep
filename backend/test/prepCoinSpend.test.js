import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PlatformAudit, PlatformCoinCharge, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinWallet, University } from '../src/platform/models.js';
import { allocateCoins, topUpUniversity, walletBalance } from '../src/platform/coins.js';
import {
  captureCharge, chargeFeature, clearCoinPricingCache, featureQuote, quotaMonth, refundCharge, refundResource, saveCoinPricing, sweepPendingCharges,
} from '../src/platform/coinSpend.js';
import { requireCoins } from '../src/middleware/requireCoins.js';
import { errorHandler } from '../src/utils/errors.js';
import { runForTenant } from '../src/platform/tenantContext.js';

let mongo;
let skipped = false;
const admin = new mongoose.Types.ObjectId();
const AI = 'ai_interview.start';
const MOCK = 'mock_interview.join';

before(async () => {
  try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } }); }
  catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri());
  await Promise.all([University, PlatformCoinWallet, PlatformCoinMovement, PlatformCoinCharge, PlatformCoinPricing].map((model) => model.createIndexes()));
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  if (skipped) return;
  await Promise.all([University, PlatformCoinWallet, PlatformCoinMovement, PlatformCoinCharge, PlatformCoinPricing, PlatformAudit].map((model) => model.deleteMany({})));
  clearCoinPricingCache();
  await University.create({ universityId: 'north', name: 'North' });
});

async function studentWith(coins) {
  const student = new mongoose.Types.ObjectId();
  const coordinator = new mongoose.Types.ObjectId();
  if (coins) {
    await topUpUniversity({ universityId: 'north', amount: coins, actorId: admin, requestId: crypto.randomUUID() });
    await allocateCoins({ universityId: 'north', actorId: admin, fromRole: 'university', toRole: 'coordinator', toUserId: coordinator, amount: coins, requestId: crypto.randomUUID() });
    await allocateCoins({ universityId: 'north', actorId: coordinator, fromRole: 'coordinator', fromUserId: coordinator, toRole: 'student', toUserId: student, amount: coins, requestId: crypto.randomUUID() });
  }
  return student;
}
const balance = (student) => walletBalance('north', { role: 'student', _id: student });
const price = (features, version = 0) => saveCoinPricing({ features, expectedVersion: version, reason: 'test', actorId: admin });
const charge = (student, resourceKey, extra = {}) => chargeFeature({ scope: 'north', userId: student, featureKey: AI, resourceKey, ...extra });

test('unpriced features are free and leave no trace', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const student = await studentWith(0);
  assert.equal(await charge(student, 'i1'), null);
  assert.equal(await PlatformCoinCharge.countDocuments(), 0);
  assert.equal(await PlatformCoinMovement.countDocuments({ kind: 'student_spend' }), 0);
});

test('free monthly uses come first, then coins; a short balance changes nothing', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 5, freePerMonth: 1 } });
  const student = await studentWith(7);
  assert.deepEqual(await featureQuote({ scope: 'north', userId: student, featureKey: AI }), { featureKey: AI, price: 5, freePerMonth: 1, freeLeft: 1, cost: 0, balance: 7 });
  const free = await charge(student, 'i1');
  assert.equal(free.charge.freeQuota, true);
  assert.equal(await balance(student), 7, 'the free use costs nothing');
  const paid = await charge(student, 'i2', { expectedCost: 5 });
  assert.equal(paid.charge.price, 5);
  assert.equal(await balance(student), 2);
  await assert.rejects(charge(student, 'i3'), (error) => error.status === 402 && error.details.required === 5 && error.details.balance === 2);
  assert.equal(await balance(student), 2);
  assert.equal(await PlatformCoinCharge.countDocuments({ resourceKey: 'i3' }), 0);
  // Next month the free use is back.
  const nextMonth = new Date(Date.now() + 32 * 86_400_000);
  assert.notEqual(quotaMonth(nextMonth), quotaMonth());
  assert.equal((await charge(student, 'i4', { now: nextMonth })).charge.freeQuota, true);
});

test('a changed price is refused, and retries of the same action pay once', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 4 } });
  const student = await studentWith(20);
  await assert.rejects(charge(student, 'i1', { expectedCost: 3 }), (error) => error.status === 409 && error.details.cost === 4);
  const results = await Promise.all(Array.from({ length: 10 }, () => charge(student, 'same')));
  assert.equal(results.filter((result) => result?.charge && !result.alreadyEntitled).length, 1);
  assert.equal(await balance(student), 16, 'ten parallel clicks debit once');
});

test('parallel charges on different items never overdraw the wallet', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 5 } });
  const student = await studentWith(15);
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, (unused, index) => charge(student, `i${index}`)));
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 3);
  assert.equal(await balance(student), 0);
});

test('refunds are exact and idempotent; a refunded item can be bought again', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 5 } });
  const student = await studentWith(10);
  const first = await charge(student, 'i1');
  assert.equal(await refundCharge(first.charge._id), true);
  assert.equal(await refundCharge(first.charge._id), false);
  assert.equal(await balance(student), 10);
  const again = await charge(student, 'i1');
  assert.equal(again.charge.attempt, 2);
  await captureCharge(again.charge._id);
  assert.equal(await refundResource({ scope: 'north', featureKey: AI, resourceKey: 'i1', reason: 'Cancelled' }), 1);
  assert.equal(await balance(student), 10);
  // Ledger invariant: the wallet equals coins received - spent + refunded.
  const sum = async (kind, field) => (await PlatformCoinMovement.find({ kind, [field]: student }).lean()).reduce((total, row) => total + row.amount, 0);
  assert.equal(await sum('coordinator_to_student', 'toUserId') - await sum('student_spend', 'fromUserId') + await sum('student_refund', 'toUserId'), await balance(student));
});

test('the sweeper settles charges a crash left pending', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 2 }, [MOCK]: { price: 3 } });
  const student = await studentWith(10);
  const done = await charge(student, 'happened');
  const lost = await chargeFeature({ scope: 'north', userId: student, featureKey: MOCK, resourceKey: 'never' });
  const later = new Date(Date.now() + 10 * 60_000);
  const settled = await sweepPendingCharges({ scope: 'north', now: later, verifiers: { [AI]: async () => true, [MOCK]: async () => false } });
  assert.equal(settled, 2);
  assert.equal((await PlatformCoinCharge.findById(done.charge._id).lean()).status, 'captured');
  assert.equal((await PlatformCoinCharge.findById(lost.charge._id).lean()).status, 'refunded');
  assert.equal(await balance(student), 8);
});

test('prices save with version checks and an audit record', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const saved = await price({ [AI]: { price: 5, freePerMonth: 2 } });
  assert.equal(saved.version, 1);
  await assert.rejects(price({ [AI]: { price: 9 } }, 0), (error) => error.status === 409);
  await assert.rejects(price({ unknown: { price: 1 } }, 1), /Unknown feature/);
  await assert.rejects(price({ [AI]: { price: 1.5 } }, 1), /whole numbers/);
  await assert.rejects(price({ [AI]: { price: -1 } }, 1), /whole numbers/);
  assert.equal(await PlatformAudit.countDocuments({ action: 'prep_coin.pricing_updated' }), 1);
});

test('the route guard captures on success, refunds on failure and sends the shortfall', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  await price({ [AI]: { price: 4 } });
  const student = await studentWith(5);
  const app = express();
  // A request inside the north university, as tenant routing would run it.
  app.use((req, res, next) => { req.user = { _id: student, role: 'student' }; runForTenant({ universityId: 'north', connection: mongoose.connection }, next); });
  let fail = false;
  app.post('/start/:id', requireCoins(AI, { resourceKey: (req) => req.params.id }), (req, res) => (fail ? res.status(400).json({ error: 'nope' }) : res.json({ ok: true })));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const call = (id) => fetch(`http://127.0.0.1:${server.address().port}/start/${id}`, { method: 'POST' });
  const settledFor = async (id, status) => {
    for (let wait = 0; wait < 50; wait += 1) {
      if (await PlatformCoinCharge.exists({ resourceKey: id, status })) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  try {
    assert.equal((await call('ok')).status, 200);
    assert.ok(await settledFor('ok', 'captured'));
    assert.equal(await balance(student), 1);
    const short = await call('second');
    assert.equal(short.status, 402);
    assert.deepEqual(await short.json(), { code: 'INSUFFICIENT_PREP_COINS', required: 4, balance: 1, error: 'This needs 4 Prep Coins.' });
    fail = true;
    await PlatformCoinWallet.updateOne({ universityId: 'north', userId: student }, { $inc: { balance: 10 } });
    assert.equal((await call('bad')).status, 400);
    assert.ok(await settledFor('bad', 'refunded'));
    assert.equal(await balance(student), 11);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
