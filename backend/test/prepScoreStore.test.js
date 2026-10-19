import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import PrepScorePolicy from '../src/models/PrepScorePolicy.js';
import { PrepScoreState, StudentPrepScore } from '../src/models/StudentPrepScore.js';
import { getStudentDashboardData, getStudentUniversityRanking } from '../src/services/studentDashboardService.js';
import { prepScoreSyncStatus, syncPrepScores } from '../src/services/prepScore/sync.js';
import { previewPolicyImpact } from '../src/services/prepScore/impact.js';
import {
  clearPrepScorePolicyCache, normalizePrepScoreConfig, PREP_SCORE_POLICY_VERSION, publishPrepScorePolicy, savePrepScorePolicyDraft,
} from '../src/services/prepScore/policy.js';

const id = () => new mongoose.Types.ObjectId();
const admin = id();
const college = 'Store University';
let mongo;
let problems;
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_score_store_test' });
  await StudentPrepScore.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});
beforeEach(async () => {
  await Promise.all([User, Problem, Submission, PrepScorePolicy, StudentPrepScore, PrepScoreState].map((model) => model.deleteMany({})));
  clearPrepScorePolicyCache();
  problems = { Easy: id(), Medium: id(), Hard: id(), Easy2: id() };
  await Problem.collection.insertMany(Object.entries(problems).map(([key, problemId]) => ({
    _id: problemId, title: key, difficulty: key.replace(/\d/, ''), status: 'published', visibility: 'public',
  })));
});

// Written a minute ago, outside the sync's re-read overlap, unless a test moves it.
const earlier = () => new Date(Date.now() - 60_000);

async function student(solves = [], extra = {}) {
  const studentId = id();
  await User.collection.insertOne({ _id: studentId, role: 'student', college, semester: 1, isActive: true, accessScope: 'full', updatedAt: earlier(), ...extra });
  if (solves.length) {
    await Submission.collection.insertMany(solves.map((key) => ({
      user: studentId, problem: problems[key], mode: 'submit', status: 'AC', language: 'python', createdAt: earlier(), updatedAt: earlier(),
    })));
  }
  return User.findById(studentId).lean();
}

test('the first rank request builds every student\'s stored score; equal scores share a rank', async () => {
  const top = await student(['Hard']);
  const tieA = await student(['Easy']);
  const tieB = await student(['Easy2']);
  await student([], { name: 'not started' });
  const rank = await getStudentUniversityRanking(tieA);
  assert.deepEqual([rank.rank, rank.tied, rank.totalStudents], [2, true, 4]);
  assert.equal(await StudentPrepScore.countDocuments(), 4, 'one stored row per student, built once');
  assert.equal((await getStudentUniversityRanking(tieB)).rank, 2);
  assert.equal((await getStudentUniversityRanking(top)).rank, 1);
  const state = await prepScoreSyncStatus();
  assert.equal(state.servingVersion, PREP_SCORE_POLICY_VERSION);
  assert.equal(state.rebuilding, false);
});

test('students only ever see the number and their standing, never modules, counts or policy', async () => {
  const learner = await student(['Medium', 'Hard']);
  const { ranking } = await getStudentDashboardData(learner);
  const row = await StudentPrepScore.findOne({ studentId: learner._id }).lean();
  assert.equal(row.total, ranking.score, 'the dashboard and the store agree');
  assert.ok(row.modules.coding.counts, 'module detail is kept for admins only');
  // The HTTP layer (publicRanking) strips everything else; the service total is the stored total.
  assert.equal(ranking.score, ranking.prepScore.total);
});

test('publishing a policy rebuilds stored scores, then serves the new version; deleted students drop out', async () => {
  const hardSolver = await student(['Hard']);
  const easySolver = await student(['Easy', 'Easy2']);
  const gone = await student(['Medium']);
  await getStudentUniversityRanking(hardSolver);
  const before = await StudentPrepScore.findOne({ studentId: easySolver._id }).lean();

  await User.deleteOne({ _id: gone._id });
  const config = normalizePrepScoreConfig({ modules: { coding: { points: { Easy: 1, Medium: 3.5, Hard: 9 } } } });
  await savePrepScorePolicyDraft(config, admin, 'Reward hard work more');
  const impact = await previewPolicyImpact(config);
  assert.equal(impact.studentsCompared, 2);
  // One Hard solve is 1^0.4 × 9^1.5 = 27 in Prep Coding; the overall score averages all four modules.
  assert.equal(impact.top[0].after.score, 6.75);
  assert.equal(await StudentPrepScore.countDocuments({ policyVersion: { $ne: before.policyVersion } }), 0, 'a preview never writes scores');

  const active = await publishPrepScorePolicy(admin, 'Reward hard work more');
  assert.equal((await syncPrepScores()).status, 'rebuilt');
  const state = await prepScoreSyncStatus();
  assert.equal(state.servingVersion, active.version);
  assert.equal(await StudentPrepScore.countDocuments({ policyVersion: { $ne: active.version } }), 0, 'the old version is dropped');
  assert.equal(await StudentPrepScore.countDocuments({ studentId: gone._id }), 0, 'a deleted student is no longer ranked');
  const rank = await getStudentUniversityRanking(hardSolver);
  assert.equal(rank.prepScore.features.coding.score, 27);
  assert.equal(rank.score, 6.75);
  assert.equal(rank.policyVersion, active.version);
  assert.equal((await syncPrepScores()).status, 'current', 'nothing left to do');
});

test('a change in licensed features rebuilds; a quiet pass touches nobody', async () => {
  const learner = await student(['Easy']);
  await getStudentUniversityRanking(learner);
  assert.deepEqual(await syncPrepScores(), { status: 'current', updated: 0 });
  await PrepScoreState.updateOne({ _id: 'state' }, { $set: { permissionsKey: 'licence-changed' } });
  assert.equal((await syncPrepScores()).status, 'rebuilt');
});
