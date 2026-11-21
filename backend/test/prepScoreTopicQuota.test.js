import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import PrepScorePolicy from '../src/models/PrepScorePolicy.js';
import { PrepScoreState, StudentPrepScore } from '../src/models/StudentPrepScore.js';
import { PrepScoreSolve, PrepScoreTopicDay } from '../src/models/PrepScoreTopicQuota.js';
import { getStudentUniversityRanking } from '../src/services/studentDashboardService.js';
import { calculateModule } from '../src/services/prepScore/engine.js';
import { clearPrepScorePolicyCache, DEFAULT_PREP_SCORE_CONFIG } from '../src/services/prepScore/policy.js';
import {
  clearTagFrequencyCache, GENERAL_TOPIC, istDay, nextResetAt, pickPrimaryTopic, quotaForProblem, recordAcceptedSolve,
} from '../src/services/prepScore/topicQuota.js';

const id = () => new mongoose.Types.ObjectId();
let mongo;
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;

before(async () => {
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_score_topic_quota_test' });
  await Promise.all([StudentPrepScore.init(), PrepScoreSolve.init(), PrepScoreTopicDay.init()]);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});
beforeEach(async () => {
  await Promise.all([User, Problem, Submission, PrepScorePolicy, StudentPrepScore, PrepScoreState, PrepScoreSolve, PrepScoreTopicDay].map((model) => model.deleteMany({})));
  clearPrepScorePolicyCache();
  clearTagFrequencyCache();
});

async function problem(tags, extra = {}) {
  const problemId = id();
  await Problem.collection.insertOne({ _id: problemId, title: `P ${problemId}`, difficulty: 'Easy', status: 'published', visibility: 'public', tags, ...extra });
  return problemId;
}

test('the primary topic is the override, else the rarest tag, else General', () => {
  const frequencies = new Map([['Array', 2263], ['Hash Table', 808], ['Sorting', 509]]);
  assert.equal(pickPrimaryTopic(['Array', 'Hash Table', 'Sorting'], '', frequencies), 'Sorting');
  assert.equal(pickPrimaryTopic(['Array', 'Hash Table'], 'array', frequencies), 'Array', 'override wins, matched case-insensitively');
  assert.equal(pickPrimaryTopic(['Array', 'Sorting'], 'Graph', frequencies), 'Sorting', 'an override that is not a tag is ignored');
  assert.equal(pickPrimaryTopic(['B', 'A'], '', new Map()), 'A', 'ties break alphabetically');
  assert.equal(pickPrimaryTopic([], '', frequencies), GENERAL_TOPIC);
});

test('the quota day and reset follow IST midnight', () => {
  // 18:29 UTC = 23:59 IST; 18:30 UTC = 00:00 IST next day.
  assert.equal(istDay(new Date('2026-11-19T18:29:00Z')), '2026-11-19');
  assert.equal(istDay(new Date('2026-11-19T18:30:00Z')), '2026-11-20');
  assert.equal(nextResetAt(new Date('2026-11-19T10:00:00Z')).toISOString(), '2026-11-19T18:30:00.000Z');
});

test('only 3 first solves per topic per day count; the 4th is saved but earns nothing; next day resets', async () => {
  const studentId = id();
  // "Array" is on every problem, "Sorting" on two only: Sorting is the rarer, so it is the topic.
  const sorting = await Promise.all(Array.from({ length: 5 }, () => problem(['Array', 'Sorting'])));
  await Promise.all(Array.from({ length: 5 }, () => problem(['Array'])));
  const day = new Date('2026-11-19T06:00:00Z');
  const outcomes = [];
  for (const problemId of sorting.slice(0, 4)) {
    outcomes.push(await recordAcceptedSolve({ studentId, source: 'local', problemId, now: day }));
  }
  assert.deepEqual(outcomes.map((row) => row.topic), ['Sorting', 'Sorting', 'Sorting', 'Sorting']);
  assert.deepEqual(outcomes.map((row) => row.counted), [true, true, true, false]);
  assert.deepEqual(outcomes.map((row) => row.remaining), [2, 1, 0, 0]);

  // Solving the same problem again never counts twice and takes no slot.
  const again = await recordAcceptedSolve({ studentId, source: 'local', problemId: sorting[0], now: day });
  assert.equal(again.alreadySolved, true);
  assert.equal(again.counted, true);
  // A problem first solved before the quota existed (alreadySolved) records nothing.
  const old = await recordAcceptedSolve({ studentId, source: 'local', problemId: sorting[4], alreadySolved: true, now: day });
  assert.equal(old.alreadySolved, true);
  assert.equal(await PrepScoreSolve.countDocuments({ problemKey: `local:${sorting[4]}` }), 0);

  const page = await quotaForProblem(studentId, 'local', sorting[4], day);
  assert.equal(page.topic, 'Sorting');
  assert.equal(page.remaining, 0);
  const tomorrow = await quotaForProblem(studentId, 'local', sorting[4], new Date('2026-11-19T19:00:00Z'));
  assert.equal(tomorrow.remaining, 3, 'a new IST day starts with a full quota');
});

test('simultaneous accepted solves never take more than the limit', async () => {
  const studentId = id();
  const problems = await Promise.all(Array.from({ length: 8 }, () => problem(['Graph'])));
  const now = new Date('2026-11-19T06:00:00Z');
  const results = await Promise.all(problems.map((problemId) => recordAcceptedSolve({ studentId, source: 'local', problemId, now })));
  assert.equal(results.filter((row) => row.counted).length, 3);
  assert.equal((await PrepScoreTopicDay.findOne({ studentId, topic: 'Graph' }).lean()).used, 3);
});

test('a limit of 0 turns the quota off', async () => {
  await PrepScorePolicy.create({ version: 6, status: 'active', createdBy: id(), config: { ...structuredClone(DEFAULT_PREP_SCORE_CONFIG), modules: { ...structuredClone(DEFAULT_PREP_SCORE_CONFIG.modules), coding: { ...structuredClone(DEFAULT_PREP_SCORE_CONFIG.modules.coding), dailyTopicLimit: 0 } } } });
  clearPrepScorePolicyCache();
  const studentId = id();
  const problems = await Promise.all(Array.from({ length: 5 }, () => problem(['Graph'])));
  const results = [];
  for (const problemId of problems) results.push(await recordAcceptedSolve({ studentId, source: 'local', problemId }));
  assert.ok(results.every((row) => row.counted && row.unlimited));
});

test('the stored Prep Score leaves out over-limit solves but keeps older solves', async () => {
  const studentId = id();
  await User.collection.insertOne({ _id: studentId, role: 'student', college: 'Q', semester: 1, isActive: true, accessScope: 'full' });
  const problems = await Promise.all(Array.from({ length: 5 }, () => problem(['Graph'])));
  // problems[0] was solved before the quota existed (no ledger row); the other four after it.
  await Submission.collection.insertMany(problems.map((problemId) => ({ user: studentId, problem: problemId, mode: 'submit', status: 'AC', language: 'python' })));
  for (const problemId of problems.slice(1)) await recordAcceptedSolve({ studentId, source: 'local', problemId });
  const ranking = await getStudentUniversityRanking(await User.findById(studentId).lean());
  // Activity metric (formula): 1 old + 3 counted = 4 Easy solves; the over-limit solve is left out.
  const expected = calculateModule({ Easy: 4 }, DEFAULT_PREP_SCORE_CONFIG.modules.coding.points, DEFAULT_PREP_SCORE_CONFIG.formula).score;
  assert.equal(ranking.prepScore.features.coding.score, expected);
  assert.equal(ranking.prepScore.features.coding.counts.Easy, 4);
  // Prep Score (v6 points): all five are today's Graph solves; only 3 per topic per day pay (Easy 4
  // each = 12 activity points), shown on the growth curve.
  const { scale, exponent } = DEFAULT_PREP_SCORE_CONFIG.points.curve;
  assert.equal(ranking.score, Math.round(scale * (3 * DEFAULT_PREP_SCORE_CONFIG.points.solve.Easy) ** exponent * 100) / 100);
});
