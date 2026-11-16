import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import { University, PlatformCoinMovement, PlatformCoinWallet } from '../src/platform/models.js';
import { PLATFORM_WALLET_SCOPE } from '../src/platform/coins.js';
import { coinAccounts, coinConsoleSummary, coinLedger, coinRange } from '../src/platform/coinConsole.js';

const now = new Date('2026-10-19T12:00:00Z');
const at = (hours) => new Date(now.getTime() - hours * 3_600_000);
const id = () => new mongoose.Types.ObjectId();
const admin = id();
const student = id();
const coordinator = id();
let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'coin_console_test' });
  await User.collection.insertMany([
    { _id: student, role: 'student', name: 'Asha Verma', email: 'asha@peerprep.test', studentId: 'PP-1' },
    { _id: coordinator, role: 'coordinator', name: 'Ravi Kumar', email: 'ravi@peerprep.test', coordinatorId: 'C-1' },
  ]);
  await University.collection.insertOne({ universityId: 'north', name: 'North University', coinBalance: 900, active: true, deletedAt: null });
  await PlatformCoinWallet.collection.insertMany([
    { universityId: PLATFORM_WALLET_SCOPE, userId: student, role: 'student', balance: 40 },
    { universityId: PLATFORM_WALLET_SCOPE, userId: coordinator, role: 'coordinator', balance: 10 },
    { universityId: 'north', userId: id(), role: 'student', balance: 25 },
  ]);
  const move = (extra) => ({ requestId: String(id()), actorId: admin, ...extra });
  await PlatformCoinMovement.collection.insertMany([
    move({ universityId: 'north', kind: 'topup', amount: 1000, fromRole: 'superadmin', toRole: 'university', createdAt: at(30) }),
    move({ universityId: 'north', kind: 'admin_to_coordinator', amount: 100, fromRole: 'university', toRole: 'coordinator', toUserId: id(), createdAt: at(20) }),
    move({ universityId: PLATFORM_WALLET_SCOPE, kind: 'superadmin_to_student', amount: 50, fromRole: 'superadmin', toRole: 'student', toUserId: student, createdAt: at(10) }),
    move({ universityId: PLATFORM_WALLET_SCOPE, kind: 'student_spend', amount: 10, fromRole: 'student', fromUserId: student, toRole: 'platform', featureKey: 'ai_interview.start', createdAt: at(2) }),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('summary totals wallets, the last 30 days and spending per feature', async () => {
  const summary = await coinConsoleSummary(now);
  assert.deepEqual(summary.totals, { universityWallets: 900, universityAccounts: 25, mainAccounts: 50, holders: 3, students: 65, coordinators: 10 });
  assert.equal(summary.month.issued, 1050);
  assert.equal(summary.month.spent, 10);
  assert.equal(summary.trend.length, 30);
  assert.equal(summary.trend.reduce((sum, day) => sum + day.issued, 0), 1050);
  assert.equal(summary.trend.reduce((sum, day) => sum + day.shared, 0), 100);
  const ai = summary.features.find((feature) => feature.key === 'ai_interview.start');
  assert.deepEqual([ai.spent, ai.uses], [10, 1]);
  assert.equal(summary.universities[0].distributed30d, 100);
  assert.equal(summary.topHolders[0].name, 'Asha Verma');
  assert.equal(summary.topHolders[0].scope, 'PeerPrep main');
  assert.equal(summary.recent[0].kind, 'student_spend');
  assert.equal(summary.recent[0].from, 'Asha Verma');
  assert.equal(summary.recent[0].feature, 'AI interview');
  assert.equal(summary.recent.at(-1).to, 'North University wallet');
});

test('a chosen period limits the flow, spending and distribution (IST days)', async () => {
  const summary = await coinConsoleSummary(now, coinRange({ range: 'custom', from: '2026-10-19', to: '2026-10-19' }, now));
  assert.deepEqual(summary.range, { range: 'custom', from: '2026-10-19', to: '2026-10-19' });
  assert.deepEqual(summary.trend.map((day) => day.date), ['2026-10-19']);
  assert.equal(summary.month.issued, 50, 'the 1000 top-up was on 18 October');
  assert.equal(summary.month.spent, 10);
  assert.equal(summary.universities[0].distributed30d, 0);
  assert.equal(summary.totals.mainAccounts, 50, 'balances are always current');
  const week = await coinConsoleSummary(now, coinRange({ range: '7d' }, now));
  assert.equal(week.trend.length, 7);
  assert.equal(week.month.issued, 1050);
  assert.throws(() => coinRange({ range: 'all' }, now), (error) => error.status === 400);
});

test('ledger filters by type group and wallet scope, and pages with a cursor', async () => {
  const spent = await coinLedger({ kind: 'spent' });
  assert.deepEqual(spent.entries.map((row) => row.kind), ['student_spend']);
  const north = await coinLedger({ scope: 'north' });
  assert.equal(north.entries.length, 2);
  assert.equal(north.entries[0].to, 'Coordinator', 'an unreachable university falls back to a neutral name');
  const first = await coinLedger({ limit: 2 });
  assert.equal(first.entries.length, 2);
  const second = await coinLedger({ limit: 2, before: first.nextCursor });
  assert.equal(second.entries.length, 2);
  assert.equal(second.nextCursor, null);
  await assert.rejects(() => coinLedger({ kind: 'bogus' }), /Invalid movement type/);
});

test('accounts lists main-database wallets, largest first, with search', async () => {
  const all = await coinAccounts({});
  assert.deepEqual(all.accounts.map((row) => row.name), ['Asha Verma', 'Ravi Kumar']);
  const found = await coinAccounts({ search: 'ravi' });
  assert.deepEqual(found.accounts.map((row) => row.accountId), ['C-1']);
  assert.equal((await coinAccounts({ role: 'student' })).total, 1);
});

test('accounts sort by a whitelisted column and page size; the ledger pages by number', async () => {
  const names = async (query) => (await coinAccounts(query)).accounts.map((row) => row.name);
  assert.deepEqual(await names({ sortBy: 'balance', sortOrder: 'asc' }), ['Ravi Kumar', 'Asha Verma']);
  assert.deepEqual(await names({ sortBy: 'account', sortOrder: 'desc' }), ['Ravi Kumar', 'Asha Verma']);
  assert.deepEqual(await names({ sortBy: 'account', sortOrder: 'asc' }), ['Asha Verma', 'Ravi Kumar']);
  assert.deepEqual(await names({ sortBy: 'type', sortOrder: 'asc' }), ['Ravi Kumar', 'Asha Verma'], 'coordinator before student');
  assert.deepEqual(await names({ sortBy: 'account', sortOrder: 'asc', page: 2, limit: 10 }), []);
  const small = await coinAccounts({ sortBy: 'account', sortOrder: 'asc', limit: 10 });
  assert.deepEqual([small.pageSize, small.total], [10, 2]);
  assert.equal((await coinAccounts({ limit: 7 })).pageSize, 25, 'unknown page sizes fall back to 25');
  assert.deepEqual(await names({ sortBy: '__proto__', sortOrder: 'asc' }), ['Asha Verma', 'Ravi Kumar'], 'unknown columns keep balance order');

  const first = await coinLedger({ page: 1, limit: 3 });
  assert.deepEqual([first.entries.length, first.total, first.page, first.pageSize], [3, 4, 1, 3]);
  assert.equal(first.entries[0].kind, 'student_spend', 'newest first');
  const last = await coinLedger({ page: 2, limit: 3 });
  assert.deepEqual(last.entries.map((row) => row.kind), ['topup']);
});
