import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Submission from '../src/models/Submission.js';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import StudentActivity from '../src/models/StudentActivity.js';
import { buildOverview, trendDays } from '../src/services/overviewInsights.js';
import { platformCentralSummary } from '../src/platform/platformInsights.js';

const now = new Date('2026-10-11T12:00:00Z');
const hoursAgo = (hours) => new Date(now.getTime() - hours * 3_600_000);
const id = () => new mongoose.Types.ObjectId();
const admin = { _id: id(), role: 'admin', email: 'admin@test.edu' };
const coordinator = {
  _id: id(), role: 'coordinator', email: 'coord@test.edu', coordinatorId: 'C1', coordinatorDataScope: 'own',
  coordinatorPermissions: ['coordinator.dashboard.overview', 'coordinator.students.view', 'coordinator.assessment.view'],
};
const mine = id();
const other = id();
let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'overview_insights_test' });
  await User.collection.insertMany([
    { _id: mine, role: 'student', name: 'Asha', email: 'asha@test.edu', teacherIds: ['C1'], createdAt: hoursAgo(48) },
    { _id: other, role: 'student', name: 'Ravi', email: 'ravi@test.edu', teacherIds: ['C2'], mustChangePassword: true, createdAt: hoursAgo(24 * 60) },
    { _id: coordinator._id, role: 'coordinator', name: 'Coord', email: coordinator.email, coordinatorId: 'C1' },
  ]);
  const submission = (user, status, at) => ({ user, status, mode: 'submit', assessmentId: null, problemSnapshot: { difficulty: 'Easy' }, createdAt: at, updatedAt: at });
  await Submission.collection.insertMany([
    submission(mine, 'AC', hoursAgo(1)),
    submission(mine, 'WA', hoursAgo(24)),
    submission(other, 'AC', hoursAgo(2)),
  ]);
  const ownAssessment = id();
  await Assessment.collection.insertMany([
    { _id: ownAssessment, title: 'Arrays test', createdBy: coordinator._id, lifecycleStatus: 'published', startTime: hoursAgo(3), endTime: new Date(now.getTime() + 3_600_000) },
    { _id: id(), title: 'Draft test', createdBy: admin._id, lifecycleStatus: 'draft' },
  ]);
  await AssessmentSubmission.collection.insertMany([
    { assessmentId: ownAssessment, studentId: mine, status: 'submitted', score: 80, maxMarks: 100, submittedAt: hoursAgo(1), updatedAt: hoursAgo(1) },
    { assessmentId: ownAssessment, studentId: other, status: 'submitted', score: 20, maxMarks: 100, submittedAt: hoursAgo(1), updatedAt: hoursAgo(1) },
  ]);
  await StudentActivity.collection.insertOne({ studentId: other, studentModel: 'User', activityType: 'LOGIN', date: hoursAgo(1) });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('admin overview counts every student, module and pending item', async () => {
  const data = await buildOverview(admin, now);
  assert.deepEqual(data.partial, []);
  assert.equal(data.people.students, 2);
  assert.equal(data.people.activeWeek, 2);
  assert.equal(data.people.activeToday, 2);
  assert.equal(data.coding.attempts, 3);
  assert.equal(data.coding.accepted, 2);
  assert.equal(data.coding.acceptanceRate, 66.7);
  assert.equal(data.assessments.published, 1);
  assert.equal(data.assessments.drafts, 1);
  assert.equal(data.assessments.live, 1);
  assert.equal(data.assessments.submissions, 2);
  assert.equal(data.assessments.averageScore, 50);
  assert.deepEqual(data.assessments.scoreBands, [1, 0, 0, 1, 0]);
  assert.equal(data.pending.draftAssessments, 1);
  assert.equal(data.pending.closingSoon, 1);
  assert.equal(data.pending.notActivated, 1);
  const days = trendDays(now);
  assert.equal(data.trend.length, 14);
  assert.equal(data.trend.at(-1).date, days.at(-1));
  assert.equal(data.trend.at(-1).coding, 2);
  assert.equal(data.trend.at(-2).coding, 1);
  assert.equal(data.trend.at(-1).logins, 1);
  assert.equal(data.upcoming[0].title, 'Arrays test');
  assert.equal(data.upcoming[0].live, true);
});

test('the Master Admin central summary counts platform-owned content and accounts', async () => {
  const summary = await platformCentralSummary(now);
  assert.deepEqual(summary.accounts, { admins: 0, coordinators: 1, students: 2 });
  assert.equal(summary.content.assessments.published, 1);
  assert.equal(summary.content.assessments.draft, 1);
  assert.equal(summary.prepScore.version, null);
  assert.equal(summary.coins.trend.length, 30);
  assert.equal(summary.coins.pricedFeatures, 0);
});

test('a coordinator sees only granted modules, assigned students and their own content', async () => {
  const data = await buildOverview(coordinator, now);
  assert.equal(data.ownScope, true);
  assert.equal(data.coding, undefined, 'no compiler permission, no coding section');
  assert.equal(data.mockInterviews, undefined);
  assert.equal(data.learning, undefined);
  assert.equal(data.people.students, 1);
  assert.equal(data.people.coordinators, null);
  assert.equal(data.assessments.drafts, 0, 'another user\'s draft is not counted');
  assert.equal(data.assessments.submissions, 1, 'only assigned students\' submissions');
  assert.equal(data.assessments.averageScore, 80);
  assert.equal(data.pending.notActivated, 0);
  assert.deepEqual(data.recent, [], 'activity needs its own permission');
  assert.equal(data.trend.at(-1).coding, 0);
});
