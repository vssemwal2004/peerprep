import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import {
  PrepScoreAllocation, PrepScoreTopicSlot, ReadinessEvidence, ReadinessPolicy, ReadinessTopicMapping,
} from '../src/models/PrepReadiness.js';
import { loadPointFacts } from '../src/services/prepScore/pointFacts.js';
import { buildPointLedger, ledgerFor } from '../src/services/prepScore/points.js';
import { DEFAULT_PREP_SCORE_CONFIG, normalizePrepScoreConfig } from '../src/services/prepScore/policy.js';
import { allocateAcceptedSolve } from '../src/services/prepScore/allocation.js';
import { allocateSolve, quotaTags } from '../src/services/prepScore/quotaRules.js';
import { syncEvidence } from '../src/services/prepReadiness/evidence.js';
import {
  clearReadinessPolicyCache, getActiveReadinessPolicy, publishReadinessPolicy, saveReadinessDraft,
} from '../src/services/prepReadiness/policy.js';
import { growthSeries } from '../src/services/prepReadiness/readiness.js';
import { recommendPractice } from '../src/services/prepReadiness/recommend.js';
import { defaultPolicy } from '../src/services/prepReadiness/engine.js';

const id = () => new mongoose.Types.ObjectId();
// IST clock time on a day → Date (IST = UTC+5:30).
const ist = (day, hh = 10, mm = 0) => new Date(new Date(`${day}T00:00:00Z`).getTime() + ((hh * 60 + mm) - 330) * 60_000);
let mongo;
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_readiness_flow_test' });
  await Promise.all([PrepScoreAllocation.init(), PrepScoreTopicSlot.init(), ReadinessEvidence.init(), ReadinessPolicy.init(), ReadinessTopicMapping.init()]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});
beforeEach(async () => {
  await Promise.all([User, Problem, Submission, PrepScoreAllocation, PrepScoreTopicSlot, ReadinessEvidence, ReadinessPolicy, ReadinessTopicMapping].map((model) => model.deleteMany({})));
  clearReadinessPolicyCache();
});

const configWith = (limit) => {
  const config = normalizePrepScoreConfig(DEFAULT_PREP_SCORE_CONFIG);
  config.points.topicLimitFrom = '2026-01-01';
  config.points.allocationFrom = '2026-01-01';
  config.modules.coding.dailyTopicLimit = limit;
  return config;
};
async function problem(tags, difficulty = 'Medium', extra = {}) {
  const problemId = id();
  await Problem.collection.insertOne({ _id: problemId, title: `P ${problemId}`, difficulty, status: 'published', visibility: 'public', tags, ...extra });
  return problemId;
}
async function student() {
  const studentId = id();
  await User.collection.insertOne({ _id: studentId, name: 'S', email: `${studentId}@x.test`, role: 'student', isActive: true });
  return { _id: studentId, role: 'student' };
}
/** Accepts a problem at `at`, then allocates like the submit path does. */
async function accept(who, problemId, at, config) {
  await Submission.collection.insertOne({ _id: id(), user: who._id, problem: problemId, mode: 'submit', assessmentId: null, status: 'AC', createdAt: at, updatedAt: at });
  const facts = (await loadPointFacts([who._id], { coding: true })).get(String(who._id));
  const ledger = ledgerFor(facts, { config }, { now: at });
  return allocateAcceptedSolve({ student: who, source: 'local', problemId: String(problemId), ledger, config, now: at });
}
const partsOf = (receipt) => Object.fromEntries(receipt.parts.map((part) => [part.label, part.points]));

test('allocation rule: Medium Array + DP — both open, one full, both full', () => {
  const tags = quotaTags(['Array', 'Dynamic Programming']);
  const both = allocateSolve({ base: 8, tags, used: new Map(), limit: 3 });
  assert.deepEqual(both.parts.map((part) => [part.topic, part.share]), [['Array', 4], ['Dynamic Programming', 4]]);
  const oneFull = allocateSolve({ base: 8, tags, used: new Map([['array', 3]]), limit: 3 });
  assert.deepEqual(oneFull.parts.map((part) => [part.topic, part.share, part.counted]), [['Array', 0, false], ['Dynamic Programming', 8, true]]);
  assert.equal(oneFull.points, 8);
  const allFull = allocateSolve({ base: 8, tags, used: new Map([['array', 3], ['dynamic-programming', 3]]), limit: 3 });
  assert.equal(allFull.points, 0);
  assert.deepEqual(allFull.fullTags, ['Array', 'Dynamic Programming']);
  // Aliases share one quota key; a cap of 2 fills sooner.
  assert.equal(quotaTags(['DP', 'Dynamic Programming', 'dp']).length, 1);
  assert.equal(allocateSolve({ base: 8, tags, used: new Map([['array', 2]]), limit: 2 }).parts[0].counted, false);
});

test('receipt: first solve stored once; retry and re-accept return the same receipt without a second slot', async () => {
  const config = configWith(3);
  const who = await student();
  const p = await problem(['Array', 'Dynamic Programming']);
  const first = await accept(who, p, ist('2026-11-23', 10), config);
  assert.equal(first.created, true);
  assert.deepEqual(partsOf(first.receipt), { Array: 4, 'Dynamic Programming': 4 });
  const again = await accept(who, p, ist('2026-11-23', 11), config);
  assert.equal(again.created, false);
  assert.equal(String(again.receipt._id), String(first.receipt._id));
  assert.equal(await PrepScoreAllocation.countDocuments({ studentId: who._id }), 1);
  const slot = await PrepScoreTopicSlot.findOne({ studentId: who._id, topic: 'array' }).lean();
  assert.equal(slot.used, 1);
  // The next day the same problem is not a new first solve.
  const nextDay = await accept(who, p, ist('2026-11-24', 10), config);
  assert.equal(nextDay.created, false);
});

test('partial quota moves the full share; all full pays 0 base points but keeps the solve', async () => {
  const config = configWith(2);
  const who = await student();
  const day = '2026-11-23';
  for (let index = 0; index < 2; index += 1) await accept(who, await problem(['Array']), ist(day, 9, index), config);
  const partial = await accept(who, await problem(['Array', 'Dynamic Programming']), ist(day, 10), config);
  assert.deepEqual(partsOf(partial.receipt), { 'Dynamic Programming': 8 });
  assert.deepEqual(partial.receipt.fullTags, ['Array']);
  await accept(who, await problem(['Dynamic Programming']), ist(day, 11), config);
  const capped = await accept(who, await problem(['Array', 'Dynamic Programming']), ist(day, 12), config);
  assert.equal(capped.receipt.points, 0);
  assert.deepEqual(capped.receipt.parts, []);
  // The ledger reads the receipts back: 2×4 (Array) + 8 (DP split) + 8 (DP) + 0.
  const facts = (await loadPointFacts([who._id], { coding: true })).get(String(who._id));
  const ledger = buildPointLedger(facts, { ...config.points, curve: { scale: 1, exponent: 1 }, lossFloorShare: 0, inactivity: { graceDays: 3, perDay: 0, monthlyCap: 0 } }, { now: ist(day, 23), limit: 2 });
  assert.equal(ledger.rawTotal, 8 + 8 + 8 + 8);
});

test('two solves racing for the last Array slot: exactly one gets it', async () => {
  const config = configWith(3);
  const who = await student();
  const day = '2026-11-23';
  for (let index = 0; index < 2; index += 1) await accept(who, await problem(['Array']), ist(day, 9, index), config);
  const [a, b] = [await problem(['Array', 'Hash Table']), await problem(['Array', 'String'])];
  const at = ist(day, 10);
  await Submission.collection.insertMany([a, b].map((problemId) => ({ _id: id(), user: who._id, problem: problemId, mode: 'submit', assessmentId: null, status: 'AC', createdAt: at, updatedAt: at })));
  const facts = (await loadPointFacts([who._id], { coding: true })).get(String(who._id));
  const ledger = ledgerFor(facts, { config }, { now: at });
  const results = await Promise.all([a, b].map((problemId) => allocateAcceptedSolve({ student: who, source: 'local', problemId: String(problemId), ledger, config, now: at })));
  const gotArray = results.filter((result) => result.receipt.parts.some((part) => part.topic === 'array'));
  assert.equal(gotArray.length, 1);
  const slot = await PrepScoreTopicSlot.findOne({ studentId: who._id, day, topic: 'array' }).lean();
  assert.equal(slot.used, 3);
});

test('IST midnight: the quota resets at 00:00 IST', async () => {
  const config = configWith(1);
  const who = await student();
  await accept(who, await problem(['Array']), ist('2026-11-23', 23, 59), config);
  const late = await accept(who, await problem(['Array', 'String']), ist('2026-11-23', 23, 59), config);
  assert.deepEqual(partsOf(late.receipt), { String: 8 });
  const nextDay = await accept(who, await problem(['Array']), ist('2026-11-24', 0, 1), config);
  assert.deepEqual(partsOf(nextDay.receipt), { Array: 8 });
  assert.equal(nextDay.receipt.day, '2026-11-24');
});

test('evidence: verified local/shared copies merge, repeats count once, unmapped resolves after mapping', async () => {
  const who = await student();
  const shared = { _id: id(), questionType: 'coding', sourceNumber: 70, difficulty: 'Easy', tags: ['Dynamic Programming'], questionData: { problemDataSnapshot: { title: 'Climbing Stairs' } } };
  const local = await problem(['Dynamic Programming', 'Math'], 'Easy', { sourceNumber: 70, title: 'Climbing Stairs' });
  const sameTitle = await problem(['Array'], 'Easy', { title: 'Climbing Stairs' });
  const unmapped = await problem(['Shell'], 'Medium');
  const at = ist('2026-11-20', 10);
  for (const problemId of [local, local, sameTitle, unmapped]) {
    await Submission.collection.insertOne({ _id: id(), user: who._id, problem: problemId, mode: 'submit', assessmentId: null, status: 'AC', createdAt: at, updatedAt: at });
  }
  await Submission.collection.insertOne({ _id: id(), user: who._id, problem: local, mode: 'run', assessmentId: null, status: 'AC', createdAt: at });
  await Submission.collection.insertOne({ _id: id(), user: who._id, problem: await problem(['Graph']), mode: 'submit', assessmentId: id(), status: 'AC', createdAt: at });
  await mongoose.connection.collection('questionpracticeattempts').insertOne({ studentId: who._id, questionId: shared._id, source: 'shared', questionType: 'coding', result: 'correct', createdAt: ist('2026-11-21', 10) });
  const first = (await syncEvidence([who._id], { sharedCatalog: [shared], now: ist('2026-11-23') })).get(String(who._id));
  const keys = first.map((row) => row.problemKey).sort();
  assert.equal(first.length, 3); // lc:70 (both copies), the same-title problem, the unmapped one
  assert.ok(keys.includes('lc:70'));
  const dp = first.find((row) => row.problemKey === 'lc:70');
  assert.equal(dp.topic, 'dynamic-programming');
  assert.deepEqual(dp.sourceKeys.sort(), [`local:${local}`, `shared:${shared._id}`].sort());
  assert.equal(dp.reconstructed, true);
  const shell = first.find((row) => row.problemKey === `local:${unmapped}`);
  assert.equal(shell.topic, null);
  assert.deepEqual(shell.unmappedTags, ['Shell']);
  await ReadinessTopicMapping.create({ problemKey: `local:${unmapped}`, topic: 'general-programming' });
  const second = (await syncEvidence([who._id], { sharedCatalog: [shared], now: ist('2026-11-23') })).get(String(who._id));
  const resolved = second.find((row) => row.problemKey === `local:${unmapped}`);
  assert.equal(resolved.topic, 'general-programming');
  assert.equal(resolved.attribution, 'admin');
  // Stored attribution never changes when tags change later.
  await Problem.updateOne({ _id: local }, { $set: { tags: ['Math'] } });
  const third = (await syncEvidence([who._id], { sharedCatalog: [shared], now: ist('2026-11-23') })).get(String(who._id));
  assert.equal(third.find((row) => row.problemKey === 'lc:70').topic, 'dynamic-programming');
});

test('policy: draft revision conflict and publish conflict keep the draft; priority-only change keeps scores', async () => {
  const admin = id();
  const draft = await saveReadinessDraft({ topics: [{ key: 'dynamic-programming', pbc: { priority: 3 } }], changeReason: 'try' }, admin);
  assert.equal(draft.revision, 1);
  await assert.rejects(saveReadinessDraft({ topics: [], revision: 0 }, admin), (error) => error.status === 409);
  const second = await saveReadinessDraft({ topics: [{ key: 'array', sbc: { target: 0 } }], revision: 1 }, admin).catch((error) => error);
  assert.equal(second.status, 400); // positive weight needs a positive target
  const ok = await saveReadinessDraft({ topics: [{ key: 'array', sbc: { target: 35 } }], revision: 1 }, admin);
  assert.equal(ok.revision, 2);
  await assert.rejects(publishReadinessPolicy({ revision: 1, changeReason: 'stale editor' }, admin), (error) => error.status === 409);
  assert.equal(await ReadinessPolicy.countDocuments({ status: 'draft' }), 1);
  const published = await publishReadinessPolicy({ revision: 2, changeReason: 'Array SBC target 35' }, admin);
  assert.equal(published.status, 'active');
  const active = await getActiveReadinessPolicy({ fresh: true });
  assert.equal(active.topics.find((topic) => topic.key === 'array').sbc.target, 35);
  assert.equal(active.topics.find((topic) => topic.key === 'dynamic-programming').pbc.priority, 3);
  await assert.rejects(publishReadinessPolicy({ revision: 2, changeReason: 'again please' }, admin), (error) => error.status === 409);
});

test('growth history scores each day under the policy serving then and marks publications', () => {
  const evidence = [{ topic: 'array', difficulty: 'Medium', solvedAt: ist('2026-11-10') }, { topic: 'array', difficulty: 'Medium', solvedAt: ist('2026-11-20') }];
  const changed = defaultPolicy();
  changed.version = 2;
  changed.topics.find((topic) => topic.key === 'array').sbc.target = 5;
  const published = [{ version: 1, from: null, policy: defaultPolicy() }, { version: 2, from: ist('2026-11-15', 12), policy: changed }];
  const { days, publications } = growthSeries(evidence, published, { days: 14, now: ist('2026-11-21', 12), firstRecordedAt: ist('2026-11-18') });
  assert.equal(days.length, 14);
  assert.equal(days.at(-1).day, '2026-11-21');
  assert.deepEqual(publications, [{ day: '2026-11-15', version: 2 }]);
  const on14 = days.find((row) => row.day === '2026-11-14');
  const on15 = days.find((row) => row.day === '2026-11-15');
  assert.equal(on14.version, 1);
  assert.equal(on15.version, 2);
  assert.ok(on15.sbc > on14.sbc); // same evidence, smaller target under v2
  assert.equal(days.find((row) => row.day === '2026-11-17').reconstructed, true);
  assert.equal(days.find((row) => row.day === '2026-11-18').reconstructed, false);
});

test('recommendations: real problems only, open quota first, capped topics skipped, stable order', async () => {
  const policy = defaultPolicy();
  // 12 Medium × 2.5 = 30 = Array's SBC target.
  const capped = Array.from({ length: 12 }, (_, index) => ({ problemKey: `x${index}`, topic: 'array', difficulty: 'Medium', solvedAt: new Date() }));
  const arrayOnly = await problem(['Array'], 'Easy');
  const dpFull = await problem(['Dynamic Programming'], 'Easy');
  const stringOpen = await problem(['String'], 'Easy');
  const first = await recommendPractice({ policy, track: 'sbc', evidence: capped, usage: new Map([['dynamic-programming', 3]]), limit: 3, shared: false, count: 5 });
  const ids = first.items.map((item) => item.id);
  assert.ok(!ids.includes(String(arrayOnly)), 'array is already at its SBC target');
  assert.equal(ids[0], String(stringOpen), 'open quota and priority 5 first');
  assert.ok(!ids.includes(String(dpFull)) || first.items.find((item) => item.id === String(dpFull)).quota.state !== 'full');
  assert.ok(first.items.every((item) => item.reason.length > 20));
  const again = await recommendPractice({ policy, track: 'sbc', evidence: capped, usage: new Map([['dynamic-programming', 3]]), limit: 3, shared: false, count: 5 });
  assert.deepEqual(again.items.map((item) => item.id), ids);
});
