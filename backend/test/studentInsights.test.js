import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Submission from '../src/models/Submission.js';
import Problem from '../src/models/Problem.js';
import QuestionLibrary from '../src/models/QuestionLibrary.js';
import QuestionPracticeAttempt from '../src/models/QuestionPracticeAttempt.js';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import Feedback from '../src/models/Feedback.js';
import { studentInsightAccess } from '../src/modules/studentInsights/access.js';
import { buildCoachSteps, COACH_LIMIT } from '../src/modules/studentInsights/coach.js';
import { buildCoverage, resetPracticeLibraryCache, topicState, topicTarget } from '../src/modules/studentInsights/practiceCoverage.js';
import {
  activitySummary, exportStudentInsights, getStudentInsights, getStudentTopic, resetStudentInsightsCache, studentRange,
} from '../src/modules/studentInsights/studentInsights.service.js';
import { scopeStudentAnalysis } from '../src/controllers/studentAnalysisController.js';

const ALL_MODULES = { questions: true, assessments: true, learning: true, events: true, interviews: true };
const id = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

test('a part shows only when the university has the module and the admin gave the student the feature', () => {
  const custom = { role: 'student', featureAccess: { mode: 'custom', features: ['prep_coding', 'assessments', 'analysis'] } };
  const access = studentInsightAccess(custom, ALL_MODULES);
  assert.deepEqual(
    { coding: access.coding, quickprep: access.quickprep, learning: access.learning, assessment: access.assessment, mock: access.mock, ai: access.ai, company: access.company, rankings: access.rankings },
    { coding: true, quickprep: false, learning: false, assessment: true, mock: false, ai: false, company: false, rankings: false },
  );
  // Mock interviews follow the university's "events" module, AI interviews its "interviews" module.
  const everything = { role: 'student', featureAccess: { mode: 'all' } };
  const noEvents = studentInsightAccess(everything, { ...ALL_MODULES, events: false });
  assert.equal(noEvents.mock, false);
  assert.equal(noEvents.ai, true);
  assert.equal(noEvents.company, false);
  // A standalone install has no university permissions: the student's own features decide.
  assert.equal(studentInsightAccess(everything, undefined).company, true);
});

test('the old analysis endpoint also hides features the admin did not give the student', () => {
  const analysis = { contractVersion: 1, generatedAt: 'now', problems: { attempts: 2 }, assessments: { attempts: 3 }, interviews: { total: 4 }, learning: { totalTopics: 5 }, explanations: {} };
  const user = { role: 'student', featureAccess: { mode: 'custom', features: ['prep_coding', 'learning'] } };
  const result = scopeStudentAnalysis(analysis, ALL_MODULES, user);
  assert.equal(result.problems.attempts, 2);
  assert.equal(result.learning.totalTopics, 5);
  assert.deepEqual(result.assessments, {});
  assert.deepEqual(result.interviews, {});
});

test('topic targets and states', () => {
  assert.equal(topicTarget(2), 2);
  assert.equal(topicTarget(20), 3);
  assert.equal(topicTarget(80), 8);
  assert.equal(topicTarget(2000), 15);
  assert.equal(topicState({ solved: 0, started: 0, graded: 0, accuracy: null, target: 3 }), 'notStarted');
  assert.equal(topicState({ solved: 3, started: 0, graded: 4, accuracy: 75, target: 3 }), 'strong');
  assert.equal(topicState({ solved: 3, started: 0, graded: 10, accuracy: 30, target: 3 }), 'needsWork');
  assert.equal(topicState({ solved: 0, started: 2, graded: 2, accuracy: 0, target: 3 }), 'needsWork');
  assert.equal(topicState({ solved: 1, started: 0, graded: 1, accuracy: 100, target: 3 }), 'building');
});

test('coverage counts each question once overall and once per tag, with the period and the starting estimate', () => {
  const library = [
    { key: 'university:a', tags: ['Array'], difficulty: 'Easy' },
    { key: 'university:b', tags: ['Array', 'Hash Table'], difficulty: 'Medium' },
    { key: 'university:c', tags: ['array'], difficulty: 'Hard' },
    { key: 'shared:d', tags: ['Graph'], difficulty: 'Easy' },
  ];
  const range = { from: daysAgo(7), to: null };
  const work = new Map([
    ['university:a', { graded: 2, correct: 1, solved: true, firstSolvedAt: daysAgo(30), lastAt: daysAgo(30) }],
    ['university:b', { graded: 1, correct: 1, solved: true, firstSolvedAt: daysAgo(2), lastAt: daysAgo(2) }],
    ['shared:d', { graded: 3, correct: 0, solved: false, firstSolvedAt: null, lastAt: daysAgo(1) }],
  ]);
  const coverage = buildCoverage(library, work, { range });
  assert.equal(coverage.totals.questions, 4);
  assert.equal(coverage.totals.solved, 2);
  assert.equal(coverage.totals.solvedInPeriod, 1);
  const array = coverage.topics.find((topic) => topic.key === 'array');
  assert.equal(array.name, 'Array');
  assert.equal(array.total, 3);
  assert.equal(array.solved, 2);
  assert.equal(array.solvedInPeriod, 1);
  assert.equal(array.accuracy, 66.7);
  assert.equal(array.byDifficulty.Hard.total, 1);
  assert.equal(coverage.topics.find((topic) => topic.key === 'graph').state, 'needsWork');
  // Array target 3: solved 2 now (2/3), 1 when the period began.
  assert.ok(coverage.preparation.percent > coverage.preparation.atPeriodStart);
});

test('streaks survive until a whole day is missed', () => {
  const now = new Date('2026-11-07T10:00:00Z');
  const days = new Map(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']
    .map((date) => [date, { date, coding: 1, learning: 0, tests: 0, interviews: 0 }]));
  const summary = activitySummary({ from: '2025-11-08', to: '2026-11-07', days }, now);
  assert.equal(summary.streak.current, 2);
  assert.equal(summary.streak.best, 3);
  assert.equal(summary.daysSinceActive, 1);
  assert.equal(summary.weekdays.reduce((sum, value) => sum + value, 0), 5);
});

test('next steps are ranked, one per kind, only for the features given, and link to the place to act', () => {
  const coverage = {
    totals: { byDifficulty: { Easy: { solved: 12, total: 40 }, Medium: { solved: 1, total: 40 }, Hard: { solved: 0, total: 20 } } },
    topics: [
      { key: 'array', name: 'Array', core: true, state: 'needsWork', solved: 2, started: 4, graded: 20, accuracy: 30, target: 8, total: 80 },
      { key: 'graph', name: 'Graph', core: true, state: 'notStarted', solved: 0, started: 0, graded: 0, accuracy: null, target: 3, total: 20 },
      { key: 'string', name: 'String', core: true, state: 'building', solved: 5, started: 0, graded: 6, accuracy: 83, target: 6, total: 50 },
    ],
  };
  const steps = buildCoachSteps({ coverage, activity: { daysSinceActive: 0 }, coding: {}, quickprep: null, learning: null, assessment: null, interview: null, ai: null });
  assert.ok(steps.length <= COACH_LIMIT);
  assert.equal(steps[0].kind, 'fixTopic');
  assert.equal(steps[0].action.to, '/problems?topic=Array&difficulty=Easy');
  assert.equal(new Set(steps.map((step) => step.kind)).size, steps.length);
  assert.ok(steps.some((step) => step.kind === 'growTopic' && step.title.startsWith('1 more question')));
  assert.ok(steps.some((step) => step.kind === 'stepUp'));
  assert.ok(!steps.some((step) => ['sheet', 'learning', 'mock', 'ai', 'reviewTest'].includes(step.kind)));
});

test('an unknown period is rejected', () => {
  assert.throws(() => studentRange({ period: '2d' }), { status: 400 });
  assert.equal(studentRange({}).preset, '30d');
});

// ---------------------------------------------------------------- with a database

let mongo;
const student = { _id: id(), role: 'student', name: 'Asha Rao', email: 'asha@test.edu', studentId: 'S1', semester: 3, passwordHash: 'x' };
const problems = { a: id(), b: id(), c: id() };

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'student_insights_test' });
  await User.collection.insertOne(student);
  await Problem.collection.insertMany(Object.entries(problems).map(([key, problemId]) => ({
    _id: problemId, title: `Problem ${key}`, difficulty: key === 'c' ? 'Hard' : 'Easy', tags: ['Array'], status: 'published', visibility: 'public',
  })));
  const question = (key, extra) => ({
    _id: id(), sourceKey: `q-${key}`, questionType: 'coding', status: 'published', visibility: 'public', sourceType: 'library',
    questionText: `Problem ${key}`, difficulty: key === 'c' ? 'Hard' : 'Easy', tags: ['Array'], questionData: {}, ...extra,
  });
  const mcq = { _id: id(), sourceKey: 'q-mcq', questionType: 'mcq', status: 'published', visibility: 'public', sourceType: 'library', questionText: 'Big-O of binary search?', difficulty: 'easy', tags: ['Binary Search'], questionData: {} };
  await QuestionLibrary.collection.insertMany([
    question('a', { sourceProblemId: problems.a }), question('b', { sourceProblemId: problems.b }), question('c', { sourceProblemId: problems.c }), mcq,
    { ...question('draft', { sourceProblemId: id() }), status: 'draft' },
  ]);
  const submission = (problem, status, at) => ({ _id: id(), user: student._id, problem, status, mode: 'submit', language: 'python', createdAt: at, updatedAt: at });
  await Submission.collection.insertMany([
    submission(problems.a, 'WA', daysAgo(40)), submission(problems.a, 'AC', daysAgo(40)),
    submission(problems.b, 'AC', daysAgo(3)),
    submission(problems.c, 'TLE', daysAgo(2)),
  ]);
  await QuestionPracticeAttempt.collection.insertOne({ _id: id(), studentId: student._id, questionId: mcq._id, source: 'university', questionType: 'mcq', answer: 1, result: 'correct', createdAt: daysAgo(1), updatedAt: daysAgo(1) });
  const test = (title, start, end, extra = {}) => ({ _id: id(), title, lifecycleStatus: 'published', isVisible: true, startTime: start, endTime: end, targetType: 'all', assignedStudents: [], totalMarks: 10, createdBy: id(), ...extra });
  const taken = test('Arrays quiz', daysAgo(5), daysAgo(4));
  const upcoming = test('Graphs test', new Date(Date.now() + 2 * DAY), new Date(Date.now() + 3 * DAY));
  const someoneElse = test('Other batch', new Date(Date.now() + DAY), new Date(Date.now() + 2 * DAY), { targetType: 'selected', assignedStudents: [id()] });
  await Assessment.collection.insertMany([taken, upcoming, someoneElse]);
  await AssessmentSubmission.collection.insertOne({ _id: id(), assessmentId: taken._id, studentId: student._id, status: 'submitted', evaluationStatus: 'completed', score: 3, maxMarks: 10, submittedAt: daysAgo(4), updatedAt: daysAgo(4) });
  await Feedback.collection.insertOne({ _id: id(), to: student._id, from: id(), marks: 10, communication: 2, problemSolving: 2, preparedness: 2, attitude: 2, integrity: 2, createdAt: daysAgo(6) });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const userWith = (features) => ({ ...student, featureAccess: features ? { mode: 'custom', features } : { mode: 'all' } });

test('a student given only PrepCoding gets coding and topics, and nothing about tests, lessons or interviews', async () => {
  resetStudentInsightsCache();
  resetPracticeLibraryCache();
  const insights = await getStudentInsights({ user: userWith(['prep_coding', 'analysis']), permissions: ALL_MODULES, query: { period: '30d' } });
  assert.deepEqual(Object.keys(insights.sections), ['coding']);
  assert.equal(insights.prepScore, null);
  assert.ok(!insights.headline.some((item) => ['testScore', 'lessons', 'interviews'].includes(item.key)));
  assert.ok(!insights.coach.some((step) => ['upcomingTest', 'reviewTest', 'interviewSkill', 'mock', 'learning'].includes(step.kind)));
  assert.equal(insights.activity.days.every((day) => day.tests === 0 && day.interviews === 0), true);
  const json = JSON.stringify(insights);
  assert.ok(!json.includes('Graphs test'), 'no test titles may leak');

  // The PrepCoding library: 4 published questions (the draft is not counted), 3 solved.
  assert.equal(insights.coverage.totals.questions, 4);
  assert.equal(insights.coverage.totals.solved, 3);
  const array = insights.coverage.topics.find((topic) => topic.key === 'array');
  assert.deepEqual({ total: array.total, solved: array.solved, started: array.started, solvedInPeriod: array.solvedInPeriod }, { total: 3, solved: 2, started: 1, solvedInPeriod: 1 });
  assert.equal(array.accuracy, 50);
  // New first solves in the last 30 days: b (3 days ago) and the MCQ (1 day ago).
  assert.equal(insights.headline.find((item) => item.key === 'solved').value, 2);
  assert.equal(insights.sections.coding.retry.count, 1);
  assert.equal(insights.sections.coding.retry.items[0].to, `/problems/${problems.c}`);

  // Extras: milestones, recent solves, growth, breakdowns, rhythm, records.
  const coding = insights.sections.coding;
  assert.deepEqual(coding.milestones.reached.map((milestone) => milestone.count), [1]);
  assert.deepEqual(coding.milestones.next, { count: 10, remaining: 7 });
  assert.equal(coding.recent[0].title, 'Big-O of binary search?');
  assert.equal(coding.recent.length, 3);
  assert.ok(coding.growth.length >= 4);
  assert.ok(coding.growth.at(-1).preparation >= coding.growth[0].preparation);
  assert.equal(coding.growth.at(-1).Easy + coding.growth.at(-1).Medium + coding.growth.at(-1).Hard, 3);
  // In the 30-day period: b (AC) and c (TLE).
  assert.deepEqual(coding.breakdown.difficulties.map((level) => [level.level, level.submissions, level.accepted]), [['Easy', 1, 1], ['Medium', 0, 0], ['Hard', 1, 0]]);
  assert.equal(coding.breakdown.languages[0].language, 'python');
  assert.equal(coding.rhythm.total, 5);
  assert.equal(coding.rhythm.cells.reduce((sum, cell) => sum + cell.count, 0), 5);
  assert.ok(insights.records.some((record) => record.key === 'busiestDay'));
  assert.equal(insights.student.studentId, 'S1');
});

test('a student with every feature sees their own tests (not other batches), interviews and next steps', async () => {
  resetStudentInsightsCache();
  const insights = await getStudentInsights({ user: userWith(null), permissions: ALL_MODULES, query: { period: '30d' } });
  assert.ok(['coding', 'quickprep', 'learning', 'assessment', 'interview'].every((key) => key in insights.sections));
  assert.equal(insights.sections.assessment.taken, 1);
  assert.equal(insights.sections.assessment.averageScore, 30);
  assert.deepEqual(insights.sections.assessment.upcoming.map((item) => item.title), ['Graphs test']);
  assert.equal(insights.sections.interview.mock.done, 1);
  assert.ok(insights.coach.some((step) => step.kind === 'upcomingTest' && step.action.to === '/student/assessments'));
  assert.ok(insights.coach.some((step) => step.kind === 'reviewTest'));
  assert.ok(insights.coach.length <= COACH_LIMIT);
  assert.ok(insights.prepScore && typeof insights.prepScore.total === 'number');
});

test('topic detail lists what to practise next, what to retry and what is solved, with links', async () => {
  const detail = await getStudentTopic({ user: userWith(null), permissions: ALL_MODULES, key: 'array' });
  assert.equal(detail.topic.name, 'Array');
  assert.deepEqual(detail.counts, { next: 0, retry: 1, solved: 2 });
  assert.equal(detail.retry[0].to, `/problems/${problems.c}`);
  assert.equal(detail.practiceAll, '/problems?topic=Array');
  await assert.rejects(getStudentTopic({ user: userWith(['assessments', 'analysis']), permissions: ALL_MODULES, key: 'array' }), { status: 403 });
  await assert.rejects(getStudentTopic({ user: userWith(null), permissions: ALL_MODULES, key: 'no-such-topic' }), { status: 404 });
});

test('the downloaded report holds only the student\'s own features', async () => {
  const file = await exportStudentInsights({ user: userWith(['prep_coding', 'analysis']), permissions: ALL_MODULES, query: { period: '30d', format: 'xlsx' } });
  assert.ok(file.buffer.length > 1000);
  assert.match(file.filename, /^prep-report-Asha-Rao-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheets = workbook.worksheets.map((sheet) => sheet.name);
  assert.ok(sheets.includes('Prep Coding'));
  assert.ok(!sheets.includes('Prep Assessment') && !sheets.includes('Prep Interview') && !sheets.includes('Prep Learning'));
  assert.ok(!sheets.includes('Prep Score'), 'no Prep Score without the rankings feature');
});
