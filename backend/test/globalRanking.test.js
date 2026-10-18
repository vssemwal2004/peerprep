import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { University } from '../src/platform/models.js';
import User from '../src/models/User.js';
import StudentChallenge from '../src/models/StudentChallenge.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import { getStudentGlobalRanking } from '../src/services/globalStudentRankingService.js';
import { GLOBAL_RANK_VERSION, GlobalRankSnapshot, rankingPolicyKey, validateRankSnapshot, saveRankSnapshot, readGlobalRank, summarizeGlobalRank, SNAPSHOT_MAX_AGE } from '../src/platform/globalRanking.js';

let mongo;
const now = new Date('2026-10-12T12:00:00Z');
const policy = { permissions: { questions: true, learning: true, assessments: true, interviews: true, events: true }, sources: { questions: 'university', learning: 'university' } };
const body = (buckets, date = now) => ({ version: GLOBAL_RANK_VERSION, generatedAt: date.toISOString(), policyKey: rankingPolicyKey(policy), buckets });
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all([University.deleteMany({}), GlobalRankSnapshot.deleteMany({})]); });
async function university(universityId) {
  return University.create({ universityId, name: universityId, apiKeyHash: 'test-only', ...policy });
}

test('snapshot is an aggregate allowlist without student identity or client awards', () => {
  const sanitized = validateRankSnapshot({ ...body([{ score: 100, count: 2, email: 'never-store', studentId: 'secret' }]), name: 'private', studentId: 'secret' }, now);
  assert.deepEqual(Object.keys(sanitized).sort(), ['buckets', 'generatedAt', 'policyKey', 'version']);
  assert.deepEqual(sanitized.buckets, [{ score: 100, count: 2 }]);
  for (const buckets of [[{ score: -1, count: 1 }], [{ score: 1, count: 0 }], [{ score: 1.5, count: 1 }], [{ score: 1, count: 1 }, { score: 1, count: 2 }]]) {
    assert.throws(() => validateRankSnapshot(body(buckets), now));
  }
  assert.throws(() => validateRankSnapshot(body([], new Date(+now - SNAPSHOT_MAX_AGE - 1)), now));
  assert.throws(() => validateRankSnapshot(body([], new Date(+now + 120_000)), now));
});

test('equal scores share competition rank across campuses and response exposes only own standing', async () => {
  const a = await university('campus-a'), b = await university('campus-b');
  await saveRankSnapshot(a, body([{ score: 100, count: 2 }, { score: 0, count: 1 }]), now);
  await saveRankSnapshot(b, body([{ score: 200, count: 1 }, { score: 100, count: 1 }]), now);
  const result = await readGlobalRank(a, { score: 100, generatedAt: now.toISOString() }, now);
  assert.equal(result.rank, 2); assert.equal(result.totalStudents, 5); assert.equal(result.tied, true);
  assert.equal(result.universities, 2); assert.equal(result.partial, false);
  assert.deepEqual(Object.keys(result).sort(), ['status', 'rank', 'totalStudents', 'tied', 'score', 'universities', 'totalUniversities', 'updatedAt', 'oldestSnapshotAt', 'partial'].sort());
  assert.deepEqual(summarizeGlobalRank([{ buckets: [{ score: 50, count: 2 }, { score: 10, count: 1 }] }], 10), { rank: 3, totalStudents: 3, tied: false });
});

test('inactive, deleted, stale and changed-policy campuses are excluded with honest coverage', async () => {
  const a = await university('campus-a'), b = await university('campus-b');
  await saveRankSnapshot(a, body([{ score: 100, count: 1 }]), now);
  await saveRankSnapshot(b, body([{ score: 200, count: 1 }]), now);
  await University.updateOne({ _id: b._id }, { $set: { 'permissions.questions': false } });
  let rank = await readGlobalRank(a, { score: 100, generatedAt: now }, now);
  assert.equal(rank.rank, 1); assert.equal(rank.partial, true); assert.equal(rank.totalUniversities, 2);
  await University.updateOne({ _id: b._id }, { $set: { active: false } });
  rank = await readGlobalRank(a, { score: 100, generatedAt: now }, now);
  assert.equal(rank.totalUniversities, 1); assert.equal(rank.partial, false);
  await University.updateOne({ _id: b._id }, { $set: { active: true, deletedAt: now } });
  assert.equal((await readGlobalRank(a, { score: 100, generatedAt: now }, now)).totalUniversities, 1);
  assert.equal((await readGlobalRank(a, { score: 100, generatedAt: now }, new Date(+now + SNAPSHOT_MAX_AGE + 1))).status, 'syncing');
});

test('snapshots replace a campus, never add duplicates, reject rollback and scope to authenticated tenant', async () => {
  const a = await university('campus-a'), b = await university('campus-b');
  const first = body([{ score: 10, count: 3 }]);
  await saveRankSnapshot(a, { ...first, universityId: b.universityId }, now);
  await saveRankSnapshot(a, first, now);
  await assert.rejects(saveRankSnapshot(a, body([{ score: 999, count: 1 }]), now), /newer ranking snapshot/);
  assert.equal(await GlobalRankSnapshot.countDocuments(), 1);
  const later = new Date(+now + 1000);
  await saveRankSnapshot(a, body([{ score: 20, count: 1 }], later), later);
  await assert.rejects(saveRankSnapshot(a, first, later), /newer ranking snapshot/);
  assert.equal((await readGlobalRank(a, { score: 10, generatedAt: now }, later)).status, 'syncing');
  assert.equal((await readGlobalRank(a, { score: 20, generatedAt: later }, later)).totalStudents, 1);
  assert.equal(await GlobalRankSnapshot.findById(b.universityId), null);
  await assert.rejects(saveRankSnapshot(a, { ...first, policyKey: 'a'.repeat(64) }, now), /policy changed/);
});

test('university service syncs verified server scores without identities or restricted students', async () => {
  const names = ['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_CONTROL_URL', 'PEERPREP_UNIVERSITY_ID', 'PEERPREP_SHARED_API_KEY'];
  const saved = names.map((name) => process.env[name]);
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'university', PEERPREP_CONTROL_URL: 'http://localhost', PEERPREP_UNIVERSITY_ID: 'campus-a', PEERPREP_SHARED_API_KEY: 'test-only-not-a-real-key-1234567890' });
    const own = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
    await User.collection.insertMany([
      { _id: own, role: 'student', isActive: true, accessScope: 'full', name: 'Private name', email: 'private@example.invalid' },
      { _id: other, role: 'student', isActive: true, accessScope: 'full' },
      { role: 'student', isActive: true, accessScope: 'assessment_only' },
      { role: 'student', isActive: false, accessScope: 'full' },
    ]);
    // Challenge XP does not count toward rank; one 50% test on the only licensed module is 1 x 100 x (50 - 40) / 60 = 16.67,
    // synced as 17 whole points and shown exactly.
    await StudentChallenge.collection.insertOne({ studentId: own, kind: 'daily', earnedAt: new Date(), rewardPoints: 20 });
    await AssessmentSubmission.collection.insertOne({ studentId: own, assessmentId: new mongoose.Types.ObjectId(), status: 'submitted', evaluationStatus: 'completed', score: 50, maxMarks: 100, submittedAt: new Date() });
    const campus = await University.create({ universityId: 'campus-a', name: 'Campus', apiKeyHash: 'test-only', permissions: {}, sources: policy.sources });
    let transmitted;
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/policy')) return { ok: true, json: async () => ({ active: true, permissions: { assessments: true }, sources: policy.sources }) };
      if (parsed.pathname.endsWith('/rankings/snapshot')) {
        transmitted = JSON.parse(options.body);
        return { ok: true, json: async () => saveRankSnapshot(campus, transmitted) };
      }
      if (parsed.pathname.endsWith('/rankings/self')) return { ok: true, json: async () => readGlobalRank(campus, Object.fromEntries(parsed.searchParams)) };
      throw new Error('Unexpected network request');
    };
    // Empty mongoose permissions default to true; explicitly align this fixture's allocation.
    for (const key of ['questions', 'learning', 'interviews', 'events']) campus.permissions[key] = false;
    campus.permissions.assessments = true;
    await campus.save();
    const rank = await getStudentGlobalRanking({ _id: own, score: 99999 });
    assert.equal(rank.status, 'ready'); assert.equal(rank.score, 16.67, 'Prep Score from the test (ranked in whole points, shown exactly); challenge XP is not added'); assert.equal(rank.rank, 1); assert.equal(rank.totalStudents, 2);
    assert.doesNotMatch(JSON.stringify(transmitted), /Private|private@|studentId|99999/);
    assert.equal((await getStudentGlobalRanking({ _id: other })).status, 'unranked');
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
});

test('tenant HTTP routes reject missing/wrong keys and cannot overwrite another campus', async () => {
  const previousRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  const express = (await import('express')).default;
  const router = (await import('../src/platform/routes.js')).default;
  const app = express(); app.use(express.json()); app.use(router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const key = 'only-a-local-test-key-123456789012345';
    const campus = await university('campus-a');
    await University.updateOne({ _id: campus._id }, { $set: { apiKeyHash: crypto.createHash('sha256').update(key).digest('hex') } });
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/tenant/rankings/self`)).status, 401);
    const headers = { 'Content-Type': 'application/json', 'X-PeerPrep-University': 'campus-a', 'X-PeerPrep-Key': key };
    assert.equal((await fetch(`${base}/tenant/rankings/self`, { headers: { ...headers, 'X-PeerPrep-Key': 'x'.repeat(40) } })).status, 401);
    const edition = new Date();
    const response = await fetch(`${base}/tenant/rankings/snapshot`, { method: 'POST', headers, body: JSON.stringify({ ...body([{ score: 10, count: 1 }], edition), universityId: 'campus-b' }) });
    assert.equal(response.status, 200);
    assert.equal(await GlobalRankSnapshot.findById('campus-b'), null);
    const rank = await fetch(`${base}/tenant/rankings/self?score=10&generatedAt=${edition.toISOString()}`, { headers });
    assert.equal(rank.status, 200); assert.equal((await rank.json()).rank, 1);
    assert.match(rank.headers.get('cache-control'), /no-store/);
    await University.updateOne({ _id: campus._id }, { $set: { active: false } });
    assert.equal((await fetch(`${base}/tenant/rankings/self`, { headers })).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE; else process.env.PEERPREP_DEPLOYMENT_ROLE = previousRole;
  }
});
