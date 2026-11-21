import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Activity from '../src/models/Activity.js';
import { PlatformAudit } from '../src/platform/models.js';
import { masterActivityFeed } from '../src/platform/masterActivity.js';

const NOW = new Date('2026-11-21T09:00:00Z'); // 14:30 IST
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000);
let mongo;
const role = process.env.PEERPREP_DEPLOYMENT_ROLE;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'master_activity_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (role === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE; else process.env.PEERPREP_DEPLOYMENT_ROLE = role;
});
beforeEach(async () => { await Promise.all([User, Activity, PlatformAudit].map((model) => model.deleteMany({}))); });

async function admin(name) {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id, role: 'admin', name, email: `${name.toLowerCase()}@peerprep.test`, isActive: true });
  return { _id, email: `${name.toLowerCase()}@peerprep.test` };
}
const activity = (who, actionType, targetType, description, at) => Activity.collection.insertOne({ userEmail: who.email, userRole: 'admin', actionType, targetType, description, createdAt: at, updatedAt: at });
const audit = (who, action, at, details = {}) => PlatformAudit.collection.insertOne({ actor: String(who._id), action, details, createdAt: at, updatedAt: at });

test('one timeline from workspace actions and platform settings, every Master Admin listed', async () => {
  const [asha, ravi] = [await admin('Asha'), await admin('Ravi')];
  await admin('Idle');
  await activity(asha, 'LOGIN', 'ADMIN', 'Signed in', hoursAgo(1));
  await activity(asha, 'UPDATE', 'ASSESSMENT', 'Assessment published', hoursAgo(2));
  await activity(ravi, 'BULK_DELETE', 'STUDENT', 'Deleted 3 students', hoursAgo(30));
  await audit(ravi, 'prep_readiness.policy_published', hoursAgo(3), { reason: 'Raise DP target' });
  await audit(asha, 'university.updated', hoursAgo(24 * 20)); // outside 10 days
  await Activity.collection.insertOne({ userEmail: 'coord@x.test', userRole: 'coordinator', actionType: 'UPDATE', targetType: 'TOPIC', description: 'not master', createdAt: hoursAgo(1) });

  const feed = await masterActivityFeed({}, NOW);
  assert.equal(feed.total, 4, 'coordinator and out-of-window rows are excluded');
  assert.deepEqual(feed.entries.map((row) => row.source), ['workspace', 'workspace', 'platform', 'workspace'], 'newest first across sources');
  assert.equal(feed.entries[2].detail, 'Raise DP target');
  assert.equal(feed.today, 3);
  assert.equal(feed.sensitive, 1, 'bulk delete');
  assert.equal(feed.byDay.length, 10);
  assert.equal(feed.byDay.at(-1).count, 3);
  const ops = Object.fromEntries(feed.operators.map((op) => [op.name, [op.actions, op.logins]]));
  assert.deepEqual(ops, { Asha: [1, 1], Ravi: [2, 0], Idle: [0, 0] });

  assert.equal((await masterActivityFeed({ category: 'login' }, NOW)).total, 1);
  assert.equal((await masterActivityFeed({ category: 'prep_readiness' }, NOW)).entries[0].source, 'platform');
  assert.equal((await masterActivityFeed({ actor: ravi.email }, NOW)).total, 2);
  assert.equal((await masterActivityFeed({ source: 'platform' }, NOW)).total, 1);
  assert.equal((await masterActivityFeed({ q: 'published' }, NOW)).total, 2, 'search covers descriptions and actions');
  assert.equal((await masterActivityFeed({ days: 30 }, NOW)).total, 5);
});

test('pages older activity with a cursor and no repeats', async () => {
  const asha = await admin('Asha');
  for (let index = 0; index < 7; index += 1) await activity(asha, 'UPDATE', 'ASSESSMENT', `Edit ${index}`, hoursAgo(index + 1));
  const first = await masterActivityFeed({ limit: 5 }, NOW);
  assert.equal(first.entries.length, 5);
  assert.ok(first.nextCursor);
  const second = await masterActivityFeed({ limit: 5, before: first.nextCursor }, NOW);
  assert.equal(second.entries.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.entries, ...second.entries].map((row) => row.id)).size, 7);
});
