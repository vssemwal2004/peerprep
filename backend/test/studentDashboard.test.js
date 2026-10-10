import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Problem from '../src/models/Problem.js';
import Submission from '../src/models/Submission.js';
import Progress from '../src/models/Progress.js';
import Semester from '../src/models/Subject.js';
import StudentProblemView from '../src/models/StudentProblemView.js';
import QuestionPracticeAttempt from '../src/models/QuestionPracticeAttempt.js';
import StudentActivity from '../src/models/StudentActivity.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import { getStudentStats, getStudentActivity } from '../src/controllers/activityController.js';
import { recordStudentTopicView, recordStudentProblemView } from '../src/controllers/studentDashboardController.js';
import {
  calculateActivityStreak, scoreStudentProgress, rankStudentProgress, universityCohort,
  buildCurriculumTopicMap, learningResumeItem, combineResumeItems, getStudentDashboardData, getStudentUniversityRanking, buildLearningSubjectCards,
} from '../src/services/studentDashboardService.js';
import { computeAwards } from '../../frontend/src/student/profile/achievements.js';
import { getLearnerLevel } from '../../frontend/src/student/profileBadge.js';

const now = new Date('2026-10-11T12:00:00Z');
const id = () => new mongoose.Types.ObjectId();

function assertProfileProgressContract(ranking) {
  assert.equal(computeAwards(ranking.badgeMetrics).earnedCount, ranking.earnedBadges);
  const profileLevel = getLearnerLevel(ranking.levelMetrics);
  assert.equal(profileLevel.level, ranking.level.level);
  assert.equal(profileLevel.title, ranking.level.title);
}

test('rank derives verified progress, preserves ties, and never returns another student identity', () => {
  const rows = [
    { studentId: 'a', easySolved: 1 }, { studentId: 'b', easySolved: 1 },
    { studentId: 'c', mediumSolved: 1 }, { studentId: 'idle', learnerProgress: { awards: [{ id: 'solver-50' }], celebratedLevel: 6 } },
  ];
  const own = rankStudentProgress(rows, 'a', 'Example University', now);
  assert.equal(own.rank, 2);
  assert.equal(own.tied, true);
  assert.equal(own.totalStudents, 4);
  assert.equal(own.score, 35);
  assert.equal(own.percentile, 33);
  assert.equal(own.earnedBadges, 1);
  assert.equal(Object.hasOwn(own, 'studentId'), false);
  assert.equal(Object.hasOwn(own, 'students'), false);
  const idle = rankStudentProgress(rows, 'idle', 'Example University', now);
  assert.equal(idle.rank, null);
  assert.equal(idle.score, 0);
  assert.equal(idle.level.level, 1);
  assert.deepEqual(idle.badgeMetrics, { solved: 0, hardSolved: 0, bestStreak: 0, activeDays: 0, languages: 0, assessments: 0, interviews: 0 });
  assert.deepEqual(idle.levelMetrics, { solvedCount: 0, streak: 0, assessmentScore: null, interviewScore: 0, challengePoints: 0 });
  const missing = rankStudentProgress([], 'unknown', 'Example University', now);
  assert.deepEqual(missing.badgeMetrics, idle.badgeMetrics);
  assert.deepEqual(missing.levelMetrics, idle.levelMetrics);
  assert.equal(rankStudentProgress(rows, 'a', '', now).rank, null);
  assert.equal(scoreStudentProgress({ completedTopics: 2, assessmentPoints: 67, assessmentsCompleted: 1 }, now).score, 102);
});

test('university matching is exact, escapes regex names, excludes disabled and assessment-only accounts', () => {
  const scope = universityCohort({ college: '  Example (North) + College  ' }, false);
  const pattern = new RegExp(scope.college.$regex, scope.college.$options);
  assert.ok(pattern.test(' example (north) + college '));
  assert.ok(!pattern.test('Example North College'));
  assert.ok(!pattern.test('Example (North) + College Annex'));
  assert.equal(scope.role, 'student');
  assert.deepEqual(scope.isActive, { $ne: false });
  assert.deepEqual(scope.accessScope, { $ne: 'assessment_only' });
  assert.equal(universityCohort({ college: '' }, false), null);
  assert.equal(Object.hasOwn(universityCohort({ college: '' }, true), 'college'), false);
});

test('compact cached cohort summaries retain ties and accept a freshly updated own progress row', () => {
  const raw = [
    { studentId: 'own', easySolved: 1, activityByDate: { '2026-10-10': 1 } },
    { studentId: 'tie', easySolved: 1, activityByDate: { '2026-10-10': 1 } },
    { studentId: 'higher', mediumSolved: 1, activityByDate: { '2026-10-10': 1 } },
  ];
  const cached = raw.map((row) => ({ studentId: row.studentId, rankingSummary: scoreStudentProgress(row, now) }));
  assert.ok(cached.every((row) => !Object.hasOwn(row, 'activityByDate')));
  assert.deepEqual(rankStudentProgress(cached, 'own', 'Example University', now), rankStudentProgress(raw, 'own', 'Example University', now));
  const own = { ...raw[0], mediumSolved: 1 };
  const mixed = [...cached.filter((row) => row.studentId !== 'own'), own];
  const freshRaw = raw.map((row) => row.studentId === 'own' ? own : row);
  const result = rankStudentProgress(mixed, 'own', 'Example University', now);
  assert.deepEqual(result, rankStudentProgress(freshRaw, 'own', 'Example University', now));
  assert.equal(result.rank, 1);
  assert.equal(result.score, 55);
  assert.equal(result.tied, false);
  assert.ok(!JSON.stringify(result).includes('higher'));
});

test('streak tolerates yesterday, resets after a gap, and ignores zero activity', () => {
  assert.deepEqual(calculateActivityStreak({ '2026-10-08': 1, '2026-10-09': 1, '2026-10-10': 2, '2026-10-11': 0 }, now), { current: 3, best: 3, activeDays: 3 });
  assert.equal(calculateActivityStreak({ '2026-10-08': 1 }, now).current, 0);
});

test('learning resumes use the actual topic/asset and no invented completion percentage', () => {
  const topic = { topicId: 't', title: 'Arrays', semesterId: 's', semesterName: 'Semester 1', subjectId: 'su', subjectName: 'Data Structures', coordinatorId: 'teacher-1', chapterName: 'Basics', hasVideo: true, hasNotes: true };
  assert.equal(learningResumeItem({ completed: true }, topic), null);
  assert.equal(learningResumeItem({ completed: false }, null), null);
  const notes = learningResumeItem({ videoWatchedSeconds: 90, videoDuration: 100, lastViewedContentType: 'notes', lastAccessedAt: now }, topic);
  assert.equal(notes.progressPercent, null);
  assert.match(notes.href, /contentType=notes/);
  assert.match(notes.href, /topicId=t/);
  const video = learningResumeItem({ videoWatchedSeconds: 200, videoDuration: 100, lastAccessedAt: now }, topic);
  assert.equal(video.progressPercent, 99);
  assert.equal(learningResumeItem({ lastAccessedAt: now }, topic).progressPercent, null);
  assert.equal(combineResumeItems([{ ...notes, updatedAt: '2026-10-09' }, notes, video]).length, 1);
});

test('learning discovery counts real topic completion, stays bounded, and builds working subject destinations', () => {
  const semesters = [{ _id: 'semester-1', semesterName: 'Semester 1', coordinatorId: 'teacher-one', subjects: [
    { _id: 'arrays', subjectName: 'Arrays and Lists', chapters: [{ _id: 'chapter', chapterName: 'Basics', topics: [{ _id: 'a1' }, { _id: 'a2' }] }] },
    { _id: 'complete', subjectName: 'Completed Subject', chapters: [{ _id: 'chapter', topics: [{ _id: 'c1' }] }] },
    { _id: 'fresh', subjectName: 'Fresh Subject', chapters: [{ _id: 'chapter', topics: [{ _id: 'f1' }] }] },
    { _id: 'empty', subjectName: 'Empty Subject', chapters: [] },
  ] }, { _id: 'semester-2', semesterName: 'Semester 2', coordinatorId: 'teacher-two', subjects: [{ _id: 'future', subjectName: 'Future Subject', chapters: [{ _id: 'chapter', topics: [{ _id: 'future-topic' }] }] }] }];
  const topics = buildCurriculumTopicMap(semesters, { semester: 1 });
  const cards = buildLearningSubjectCards(topics, ['a1', 'a1', 'c1', 'deleted-topic']);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].title, 'Arrays and Lists');
  assert.equal(cards[0].totalTopics, 2);
  assert.equal(cards[0].completedTopics, 1);
  assert.equal(cards[0].progressPercent, 50);
  assert.equal(cards[1].progressPercent, 0);
  assert.equal(cards[2].progressPercent, 100);
  assert.ok(cards.every((card) => card.title !== 'Future Subject' && card.title !== 'Empty Subject'));
  assert.match(cards[0].href, /\/student\/learning\/Semester%201\/Arrays%20and%20Lists\/teacher-one\?/);
  assert.deepEqual(cards[0].state, { semesterId: 'semester-1', subjectId: 'arrays', coordinatorId: 'teacher-one' });
  assert.equal(buildLearningSubjectCards(topics, [], 1).length, 1);
});

let mongo;
const originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
const students = { own: id(), tie: id(), higher: id(), other: id(), inactive: id(), assessmentOnly: id() };
const problems = { easy: id(), newEasy: id(), medium: id(), hard: id(), private: id(), draft: id() };
const semesterId = id(), subjectId = id(), chapterId = id(), topicId = id(), higherTopicId = id();
let ownStudent;
before(async () => {
  // Test-owned local database only. Application setup and backend .env are never loaded.
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri(), { dbName: 'student_dashboard_test' });
  await Promise.all([StudentProblemView.init(), Progress.init()]);
  await User.collection.insertMany(Object.entries(students).map(([key, studentId]) => ({
    _id: studentId, role: 'student', college: key === 'other' ? 'Example University Annex' : 'Example University',
    semester: 1, isActive: key !== 'inactive', accessScope: key === 'assessmentOnly' ? 'assessment_only' : 'full',
  })));
  ownStudent = await User.findById(students.own).lean();
  await Problem.collection.insertMany(Object.entries(problems).map(([key, problemId]) => ({
    _id: problemId, title: `${key} problem`, difficulty: key.includes('Easy') || key === 'easy' ? 'Easy' : key === 'medium' ? 'Medium' : 'Hard',
    status: key === 'draft' ? 'draft' : 'published', visibility: key === 'private' ? 'private' : 'public',
  })));
  const submission = (studentId, problem, status, createdAt, mode = 'submit') => ({ _id: id(), user: studentId, problem, status, mode, language: 'python', createdAt: new Date(createdAt), passedTestCases: 1, totalTestCases: 4 });
  await Submission.collection.insertMany([
    submission(students.own, problems.easy, 'AC', '2026-10-07'),
    submission(students.own, problems.easy, 'AC', '2026-10-07T12:00:00Z'),
    submission(students.tie, problems.easy, 'AC', '2026-10-07'),
    submission(students.higher, problems.medium, 'AC', '2026-10-07'),
    submission(students.own, problems.medium, 'WA', '2026-10-10'),
    submission(students.own, problems.hard, 'AC', '2026-10-08', 'run'),
    submission(students.own, problems.private, 'AC', '2026-10-07'),
    submission(students.own, problems.draft, 'AC', '2026-10-07'),
    submission(students.other, problems.hard, 'AC', '2026-10-07'),
    submission(students.inactive, problems.hard, 'AC', '2026-10-07'),
    submission(students.assessmentOnly, problems.hard, 'AC', '2026-10-07'),
  ]);
  await Semester.collection.insertMany([
    { _id: semesterId, semesterName: 'Semester 1', coordinatorId: 'teacher-1', subjects: [{ _id: subjectId, subjectName: 'Data Structures', chapters: [{ _id: chapterId, chapterName: 'Basics', topics: [{ _id: topicId, topicName: 'Arrays', topicVideoLink: 'https://youtube.com/watch?v=example', notesPDF: 'https://example.com/notes.pdf' }] }] }] },
    { _id: id(), semesterName: 'Semester 2', coordinatorId: 'teacher-1', subjects: [{ _id: id(), subjectName: 'Advanced', chapters: [{ _id: id(), chapterName: 'Trees', topics: [{ _id: higherTopicId, topicName: 'Trees', topicVideoLink: 'https://youtube.com/watch?v=example' }] }] }] },
  ]);
  await StudentProblemView.collection.insertMany([
    { studentId: students.own, problemId: problems.newEasy, source: 'university', lastViewedAt: new Date('2026-10-11T10:00:00Z') },
    { studentId: students.own, problemId: problems.easy, source: 'university', lastViewedAt: new Date('2026-10-11T11:00:00Z') },
  ]);
  await Progress.collection.insertOne({ studentId: students.own, semesterId, subjectId, chapterId, topicId, coordinatorId: 'teacher-1', completed: false, videoWatchedSeconds: 40, videoDuration: 100, lastAccessedAt: new Date('2026-10-09'), lastViewedContentType: 'notes' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
});

test('dashboard counts distinct public accepted problems, scopes ranking, and resumes actual unsolved visits', async () => {
  const dashboard = await getStudentDashboardData(ownStudent, now);
  assert.equal(dashboard.coding.totalSolved, 1);
  assert.equal(dashboard.coding.hardSolved, 0);
  assert.deepEqual(dashboard.coding.totalsByDifficulty, { easy: 2, medium: 1, hard: 1 });
  assert.equal(dashboard.coding.totalProblems, 4);
  assert.equal(dashboard.ranking.rank, 2);
  assert.equal(dashboard.ranking.tied, true);
  assert.equal(dashboard.ranking.totalStudents, 3);
  assert.equal(dashboard.learning.totalTopics, 1);
  assert.equal(dashboard.learning.completedTopics, 0);
  assert.equal(dashboard.resumeItems[0].title, 'newEasy problem');
  assert.equal(dashboard.resumeItems[0].status, 'viewed');
  assert.ok(dashboard.resumeItems.every((item) => item.title !== 'easy problem'));
  assert.ok(dashboard.resumeItems.some((item) => item.type === 'learning' && item.contentType === 'notes'));
  assert.ok(!JSON.stringify(dashboard).includes(String(students.other)));
  assert.deepEqual(dashboard.suggestedPractice, []); // Every remaining local problem already has a resume card.
  assert.ok(dashboard.suggestedPractice.every((item) => !dashboard.resumeItems.some((resume) => resume.href === item.href)));
  assert.equal(dashboard.learningSubjects.length, 1);
  assert.equal(dashboard.learningSubjects[0].title, 'Data Structures');
  assert.equal(dashboard.learningSubjects[0].totalTopics, 1);
  assert.equal(dashboard.learningSubjects[0].completedTopics, 0);
  assert.equal(dashboard.learningSubjects[0].progressPercent, 0);
});

test('profile and dashboard share catalog difficulty totals and accepted-problem counts', async () => {
  let payload;
  await getStudentStats({ user: ownStudent, params: {} }, { json: (value) => { payload = value; } });
  assert.equal(payload.stats.totalQuestionsSolved, 1);
  assert.equal(payload.stats.totalProblems, 4);
  assert.deepEqual(payload.stats.totalProblemsByDifficulty, { easy: 2, medium: 1, hard: 1 });
  assert.deepEqual(payload.stats.solvedByDifficulty, { easy: 1, medium: 0, hard: 0 });
});

test('recording a learning view cannot create watch time, completion, or rank points', async () => {
  const res = { status(value) { assert.equal(value, 204); return this; }, end() {} };
  const body = { topicId, semesterId, subjectId, chapterId, coordinatorId: 'teacher-1', contentType: 'video' };
  const learner = { ...ownStudent, _id: students.tie };
  await recordStudentTopicView({ user: learner, body }, res);
  const progress = await Progress.findOne({ studentId: students.tie, topicId }).lean();
  assert.equal(progress.videoWatchedSeconds, 0);
  assert.equal(progress.completed, false);
  assert.equal(progress.lastViewedContentType, 'video');
  assert.ok(progress.lastAccessedAt);
  await assert.rejects(recordStudentTopicView({ user: learner, body: { ...body, chapterId: id() } }, res), /Learning content not found/);
  await assert.rejects(recordStudentTopicView({ user: learner, body: { ...body, contentType: 'questions' } }, res), /Learning content not found/);
  const semesters = await Semester.find().lean();
  assert.ok(!buildCurriculumTopicMap(semesters, learner).has(String(higherTopicId)));
});

test('problem navigation tracking rejects unpublished/private content and upserts only the caller', async () => {
  const res = { status(value) { assert.equal(value, 204); return this; }, end() {} };
  await recordStudentProblemView({ user: ownStudent, body: { problemId: problems.newEasy } }, res);
  assert.equal(await StudentProblemView.countDocuments({ studentId: students.own, problemId: problems.newEasy }), 1);
  await assert.rejects(recordStudentProblemView({ user: ownStudent, body: { problemId: problems.private } }, res), /Problem not found/);
  await assert.rejects(recordStudentProblemView({ user: ownStudent, body: { problemId: 'invalid' } }, res), /valid problem ID/);
});

test('profile and dashboard refresh the current score within cohort cache TTL; missing college retains actual points', async () => {
  await Submission.collection.insertOne({ _id: id(), user: students.own, problem: problems.medium, mode: 'submit', status: 'AC', language: 'python', createdAt: new Date('2026-10-11T11:00:00Z') });
  const profileRank = await getStudentUniversityRanking(ownStudent, null, now);
  const dashboard = await getStudentDashboardData(ownStudent, now);
  assert.equal(profileRank.rank, 1);
  assert.equal(profileRank.score, 55);
  assert.deepEqual(profileRank, dashboard.ranking);
  const unscoped = await getStudentUniversityRanking({ ...ownStudent, college: '' }, null, now);
  assert.equal(unscoped.rank, null);
  assert.equal(unscoped.score, 55);
  assert.equal(unscoped.hasProgress, true);
  assert.equal(unscoped.totalStudents, 0);
  assert.deepEqual(unscoped.badgeMetrics, profileRank.badgeMetrics);
  assert.deepEqual(unscoped.levelMetrics, profileRank.levelMetrics);
  const joinedId = id();
  await User.collection.insertOne({ _id: joinedId, role: 'student', college: 'Example University', semester: 1, isActive: true, accessScope: 'full' });
  await Submission.collection.insertOne({ user: joinedId, problem: problems.hard, mode: 'submit', status: 'AC', language: 'python', createdAt: now });
  const joinedRank = await getStudentUniversityRanking({ ...ownStudent, _id: joinedId }, null, now);
  assert.equal(joinedRank.rank, 1);
  assert.equal(joinedRank.totalStudents, 4);
});

test('dashboard and profile use the same activity streak including feedback and session activities', async () => {
  await StudentActivity.collection.insertMany([
    { studentId: students.own, studentModel: 'User', activityType: 'FEEDBACK_SUBMITTED', date: new Date('2026-10-09') },
    { studentId: students.own, studentModel: 'User', activityType: 'SESSION_SCHEDULED', date: new Date('2026-10-10') },
  ]);
  const dashboard = await getStudentDashboardData(ownStudent);
  let activity;
  await getStudentActivity({ user: ownStudent }, { json: (value) => { activity = value; } });
  assert.deepEqual(activity.activityByDate, dashboard.activityByDate);
  assert.equal(activity.stats.currentStreak, dashboard.coding.streak.current);
  assert.equal(activity.stats.bestStreak, dashboard.coding.streak.best);
});

test('shared coding is counted from judged practice attempts, tracked, resumed and included consistently on profile', async () => {
  const sharedHard = id(), sharedEasy = id(), sharedMedium = id();
  const catalog = [
    { _id: String(sharedHard), questionType: 'coding', status: 'published', visibility: 'public', sourceType: 'compiler', difficulty: 'Hard', questionText: 'Shared hard problem' },
    { _id: String(sharedEasy), questionType: 'coding', status: 'published', visibility: 'public', sourceType: 'compiler', difficulty: 'Easy', questionText: 'Shared easy problem' },
    { _id: String(sharedMedium), questionType: 'coding', status: 'published', visibility: 'public', sourceType: 'compiler', difficulty: 'Medium', questionText: 'Shared medium problem' },
  ];
  await QuestionPracticeAttempt.collection.insertMany([
    { studentId: students.own, questionId: sharedHard, source: 'shared', questionType: 'coding', result: 'correct', language: 'java', createdAt: new Date('2026-10-07') },
    { studentId: students.own, questionId: sharedHard, source: 'shared', questionType: 'coding', result: 'correct', language: 'cpp', createdAt: new Date('2026-10-07') },
    { studentId: students.own, questionId: sharedEasy, source: 'shared', questionType: 'coding', result: 'incorrect', language: 'cpp', createdAt: new Date('2026-10-11T11:30:00Z') },
  ]);
  const savedFetch = globalThis.fetch;
  const savedControlUrl = process.env.PEERPREP_CONTROL_URL;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_CONTROL_URL = 'http://127.0.0.1';
  globalThis.fetch = async (url) => {
    const payload = String(url).endsWith('/policy')
      ? { permissions: { questions: true, assessments: true, learning: true, interviews: true, events: true }, sources: { learning: 'university' } }
      : String(url).endsWith('/questions') ? { questions: catalog } : null;
    assert.ok(payload, `Unexpected test network request: ${url}`);
    return { ok: true, json: async () => payload };
  };
  try {
    const res = { status(value) { assert.equal(value, 204); return this; }, end() {} };
    await recordStudentProblemView({ user: ownStudent, body: { problemId: sharedEasy, source: 'shared' } }, res);
    const dashboard = await getStudentDashboardData(ownStudent, now);
    assert.equal(dashboard.coding.totalSolved, 3);
    assert.equal(dashboard.coding.hardSolved, 1);
    assert.equal(dashboard.ranking.badgeMetrics.languages, 3);
    assert.equal(dashboard.ranking.badgeMetrics.solved, 3);
    assert.equal(dashboard.ranking.badgeMetrics.hardSolved, 1);
    assert.equal(dashboard.ranking.earnedBadges, 3); // First Accept, Hard Hitter, Polyglot.
    assert.equal(dashboard.ranking.levelMetrics.solvedCount, dashboard.coding.totalSolved);
    assert.equal(dashboard.ranking.levelMetrics.streak, dashboard.coding.streak.current);
    assertProfileProgressContract(dashboard.ranking);
    assert.deepEqual(dashboard.coding.totalsByDifficulty, { easy: 3, medium: 2, hard: 2 });
    assert.ok(dashboard.resumeItems.some((item) => item.href === `/problems/shared/${sharedEasy}`));
    assert.ok(!dashboard.resumeItems.some((item) => item.href === `/problems/shared/${sharedHard}`));
    assert.ok(dashboard.suggestedPractice.some((item) => item.href === `/problems/shared/${sharedMedium}` && item.source === 'shared'));
    assert.ok(!dashboard.suggestedPractice.some((item) => item.href === `/problems/shared/${sharedEasy}`));
    assert.ok(!dashboard.suggestedPractice.some((item) => item.href === `/problems/shared/${sharedHard}`));
    let profile;
    await getStudentStats({ user: ownStudent, params: {} }, { json: (value) => { profile = value; } });
    assert.equal(profile.stats.totalQuestionsSolved, dashboard.coding.totalSolved);
    assert.deepEqual(profile.stats.totalProblemsByDifficulty, dashboard.coding.totalsByDifficulty);
    let activity;
    await getStudentActivity({ user: ownStudent }, { json: (value) => { activity = value; } });
    const liveDashboard = await getStudentDashboardData(ownStudent);
    assert.deepEqual(activity.activityByDate, liveDashboard.activityByDate);
  } finally {
    globalThis.fetch = savedFetch;
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
    if (savedControlUrl === undefined) delete process.env.PEERPREP_CONTROL_URL;
    else process.env.PEERPREP_CONTROL_URL = savedControlUrl;
  }
});

test('discovery caps useful practice at three and ignores orphaned curriculum progress', async () => {
  await Problem.collection.insertMany(Array.from({ length: 4 }, (_, index) => ({
    _id: id(), title: `Next easy ${index + 1}`, difficulty: 'Easy', status: 'published', visibility: 'public',
  })));
  await Progress.collection.updateOne({ studentId: students.own, topicId }, { $set: { completed: true, completedAt: now } });
  await Progress.collection.insertOne({ studentId: students.own, semesterId, subjectId, chapterId, topicId: id(), coordinatorId: 'teacher-1', completed: true, completedAt: now });
  const dashboard = await getStudentDashboardData(ownStudent, now);
  assert.equal(dashboard.suggestedPractice.length, 3);
  assert.ok(dashboard.suggestedPractice.every((item) => item.difficulty === 'Easy'));
  assert.ok(dashboard.suggestedPractice.every((item) => item.href !== `/problems/${problems.easy}` && item.href !== `/problems/${problems.medium}`));
  assert.equal(dashboard.learningSubjects.length, 1);
  assert.equal(dashboard.learningSubjects[0].totalTopics, 1);
  assert.equal(dashboard.learningSubjects[0].completedTopics, 1);
  assert.equal(dashboard.learningSubjects[0].progressPercent, 100);
  assert.ok(!dashboard.resumeItems.some((item) => item.type === 'learning'));
});

test('discovery omits disabled modules without invented cards, progress, or problem suggestions', async () => {
  const savedFetch = globalThis.fetch;
  const savedControlUrl = process.env.PEERPREP_CONTROL_URL;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'university';
  process.env.PEERPREP_CONTROL_URL = 'http://127.0.0.1';
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith('/policy'), `Disabled discovery must not fetch a catalog: ${url}`);
    return { ok: true, json: async () => ({ permissions: { questions: false, learning: false, events: false, interviews: false, assessments: true } }) };
  };
  try {
    const dashboard = await getStudentDashboardData(ownStudent, now);
    assert.deepEqual(dashboard.suggestedPractice, []);
    assert.deepEqual(dashboard.learningSubjects, []);
    assert.equal(dashboard.coding, null);
    assert.equal(dashboard.learning, null);
  } finally {
    globalThis.fetch = savedFetch;
    process.env.PEERPREP_DEPLOYMENT_ROLE = 'standalone';
    if (savedControlUrl === undefined) delete process.env.PEERPREP_CONTROL_URL;
    else process.env.PEERPREP_CONTROL_URL = savedControlUrl;
  }
});

test('practice discovery falls back to actual unsolved Hard problems after Easy and Medium are complete', async () => {
  const studentId = id();
  const learner = { _id: studentId, role: 'student', college: 'Practice Regression University', semester: 1, isActive: true, accessScope: 'full' };
  await User.collection.insertOne(learner);
  const easierProblems = await Problem.find({ status: 'published', visibility: 'public', difficulty: { $in: ['Easy', 'Medium'] } }).select('_id').lean();
  await Submission.collection.insertMany(easierProblems.map((problem) => ({
    user: studentId, problem: problem._id, mode: 'submit', status: 'AC', language: 'python', createdAt: now,
  })));
  const dashboard = await getStudentDashboardData(learner, now);
  assert.equal(dashboard.resumeItems.length, 0);
  assert.equal(dashboard.suggestedPractice.length, 1);
  assert.equal(dashboard.suggestedPractice[0].difficulty, 'Hard');
  assert.equal(dashboard.suggestedPractice[0].href, `/problems/${problems.hard}`);
});

test('assessment badge metrics exclude violations and level average ignores unscored submitted attempts', async () => {
  const scoredStudentId = id(), violationOnlyStudentId = id(), unscoredStudentId = id();
  await User.collection.insertMany([scoredStudentId, violationOnlyStudentId, unscoredStudentId].map((studentId) => ({
    _id: studentId, role: 'student', college: 'Assessment Regression University', semester: 1, isActive: true, accessScope: 'full',
  })));
  await AssessmentSubmission.collection.insertMany([
    { assessmentId: id(), studentId: scoredStudentId, status: 'submitted', evaluationStatus: 'completed', score: 10, maxMarks: 10, submittedAt: now },
    { assessmentId: id(), studentId: scoredStudentId, status: 'submitted', evaluationStatus: 'completed', maxMarks: 10, submittedAt: now },
    { assessmentId: id(), studentId: scoredStudentId, status: 'submitted', evaluationStatus: 'completed', score: 10, maxMarks: 0, submittedAt: now },
    { assessmentId: id(), studentId: scoredStudentId, status: 'violation', evaluationStatus: 'completed', score: 0, maxMarks: 10, submittedAt: now },
    { assessmentId: id(), studentId: violationOnlyStudentId, status: 'violation', evaluationStatus: 'completed', score: 10, maxMarks: 10, submittedAt: now },
    { assessmentId: id(), studentId: unscoredStudentId, status: 'submitted', evaluationStatus: 'completed', maxMarks: 10, submittedAt: now },
  ]);
  const learner = { ...ownStudent, _id: scoredStudentId, college: 'Assessment Regression University' };
  const rank = await getStudentUniversityRanking(learner, null, now);
  assert.equal(rank.badgeMetrics.assessments, 3);
  assert.equal(rank.levelMetrics.assessmentScore, 100);
  assert.equal(rank.scoreBreakdown.assessments, 100);
  assert.equal(rank.earnedBadges, 1);
  assert.equal(rank.level.title, 'Consistent Performer');
  assertProfileProgressContract(rank);
  const dashboard = await getStudentDashboardData(learner, now);
  assert.deepEqual(dashboard.ranking.levelMetrics, rank.levelMetrics);
  assert.deepEqual(dashboard.ranking.badgeMetrics, rank.badgeMetrics);
  const violation = await getStudentUniversityRanking({ ...learner, _id: violationOnlyStudentId }, null, now);
  assert.equal(violation.badgeMetrics.assessments, 0);
  assert.equal(violation.earnedBadges, 0);
  assert.equal(violation.levelMetrics.assessmentScore, null);
  assert.equal(violation.rank, null);
  assertProfileProgressContract(violation);
  const unscored = await getStudentUniversityRanking({ ...learner, _id: unscoredStudentId }, null, now);
  assert.equal(unscored.badgeMetrics.assessments, 1);
  assert.equal(unscored.levelMetrics.assessmentScore, null);
  assert.equal(unscored.scoreBreakdown.assessments, 0);
  assertProfileProgressContract(unscored);
});
