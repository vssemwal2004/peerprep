// A student's own analysis for a period: preparation estimate, topic coverage, next steps and
// one section per feature they can use. Feature figures come from the same loaders and row
// builder as the admin Prep Analysis, run for this one student, so both views always agree.
// A feature the student cannot use is never loaded, so it can never leak into the response.

import mongoose from 'mongoose';
import Assessment from '../../models/Assessment.js';
import AssessmentSubmission from '../../models/AssessmentSubmission.js';
import Feedback from '../../models/Feedback.js';
import Progress from '../../models/Progress.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import Submission from '../../models/Submission.js';
import User from '../../models/User.js';
import { InterviewEngagementReceipt } from '../../models/AdaptiveEngagement.js';
import { isUniversity } from '../../platform/deployment.js';
import { sharedAssessments } from '../../platform/sharedContent.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { engagementTenant } from '../../services/engagementPolicyService.js';
import { storedScoresFor } from '../../services/prepScore/sync.js';
import { HttpError } from '../../utils/errors.js';
import { isStudentAssignedToAssessment } from '../../utils/assessmentAssignment.js';
import { loadCodingFacts, loadProblemTimes } from '../prepAnalysis/codingFacts.js';
import { loadQuickPrepFacts, sheetVisibleTo } from '../prepAnalysis/quickPrepFacts.js';
import { loadLearningFacts } from '../prepAnalysis/learningFacts.js';
import { loadAssessmentFacts, PASS_PERCENT } from '../prepAnalysis/assessmentFacts.js';
import { loadInterviewFacts } from '../prepAnalysis/interviewFacts.js';
import { buildStudentRows } from '../prepAnalysis/studentRows.js';
import { buildStudentProfile, normalizeRange, previousRange } from '../prepAnalysis/prepAnalysis.service.js';
import { buildStudentReport, STUDENT_REPORT_TYPES } from '../prepAnalysis/studentReport.js';
import { anyInsightAccess, studentInsightAccess } from './access.js';
import { buildCoachSteps } from './coach.js';
import { codingBreakdown, personalRecords, preparationGrowth, recentSolves, solveMilestones } from './extras.js';
import { buildCoverage, loadPracticeLibrary, loadStudentPractice, questionLink, topicDetail } from './practiceCoverage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_MS = 20_000;
const CACHE_MS = 60_000;
const CACHE_ENTRIES = 500;
export const STUDENT_PERIODS = Object.freeze(['7d', '30d', '90d', '180d', '365d', 'all', 'custom']);
const STUDENT_FIELDS = '_id name email studentId semester group branch course college teacherIds uploadBatchIds isActive accessScope avatarUrl';
const EMPTY_CODING = { byStudent: new Map(), days: new Map(), problems: new Map(), topics: new Map() };
const cache = new Map();

const round1 = (value) => Math.round(value * 10) / 10;
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const inRange = (date, range) => Boolean(date) && (!range?.from || new Date(date) >= range.from) && (!range?.to || new Date(date) <= range.to);
const dayInRange = (day, range) => (!range?.from || day >= dayKey(range.from)) && (!range?.to || day <= dayKey(range.to));
const sumDays = (days, range) => [...(days || new Map()).entries()].reduce((sum, [day, value]) => sum + (dayInRange(day, range) ? Number(value) || 0 : 0), 0);

/** The period from the query string: ?period=30d, or ?period=custom&from=…&to=…. Defaults to 30 days. */
export function studentRange(query = {}) {
  const preset = String(query.period || '30d');
  if (!STUDENT_PERIODS.includes(preset)) throw new HttpError(400, 'Unknown period.');
  return normalizeRange(preset === 'custom' ? { preset, from: query.from || null, to: query.to || null } : { preset });
}

/** Tests this student was given (the student test list's own rule), as assessment definitions. */
export async function loadStudentTests(student, now = new Date()) {
  const local = await Assessment.find({
    lifecycleStatus: { $ne: 'draft' }, isVisible: { $ne: false }, startTime: { $ne: null }, endTime: { $ne: null },
    // Company mocks (kind "mock") are Prep Mock, analysed on their own.
    kind: { $ne: 'mock' },
    $or: [{ targetType: 'all' }, { assignedStudents: student._id }],
  }).select('_id title assessmentType lifecycleStatus isVisible manuallyCompletedAt startTime endTime targetType assignedStudents')
    .maxTimeMS(MAX_QUERY_MS).lean();
  const shared = await sharedAssessments().catch(() => []);
  return new Map([...local, ...(shared || [])]
    .filter((test) => test.lifecycleStatus !== 'draft' && test.isVisible !== false && test.startTime && test.endTime)
    .filter((test) => isStudentAssignedToAssessment(test, student))
    .map((test) => [String(test._id), {
      id: String(test._id),
      title: String(test.title || 'Test').trim(),
      type: test.assessmentType || 'mixed',
      visible: true,
      ended: Boolean(test.manuallyCompletedAt) || new Date(test.endTime) <= now,
      startTime: test.startTime,
      endTime: test.endTime,
      forEveryone: true,
      assigned: new Set(),
    }]));
}

/**
 * Prep Mock tests this student has taken (company mocks, kind "mock"), as assessment definitions.
 * Only taken mocks: which mocks a student may start is the Prep Mock page's own rule.
 */
export async function loadStudentMocks(student) {
  const taken = new Set((await AssessmentSubmission.distinct('assessmentId', { studentId: student._id }).maxTimeMS(MAX_QUERY_MS)).map(String));
  if (!taken.size) return new Map();
  const local = isUniversity() ? [] : await Assessment.find({ kind: 'mock', _id: { $in: [...taken].map(oid) } })
    .select('_id title assessmentType startTime endTime manuallyCompletedAt').maxTimeMS(MAX_QUERY_MS).lean();
  const shared = await sharedAssessments('mock', { includeHistorical: true }).catch(() => []);
  return new Map([...local, ...(shared || [])]
    .filter((test) => taken.has(String(test._id)))
    .map((test) => [String(test._id), {
      id: String(test._id), title: String(test.title || 'Mock').trim(), type: test.assessmentType || 'mixed', visible: true,
      ended: true, startTime: test.startTime || null, endTime: test.endTime || null, forEveryone: true, assigned: new Set(),
    }]));
}

/** Coding, test, interview and Prep Mock facts for one period (the parts that change with the period). */
async function loadPeriodFacts(id, access, range, tests, mocks = new Map()) {
  const [coding, assessment, interview, prepmock] = await Promise.all([
    access.coding ? loadCodingFacts({ studentIds: [id], range }) : EMPTY_CODING,
    access.assessment ? loadAssessmentFacts({ user: null, studentIds: [id], range, tests }) : null,
    access.mock || access.ai ? loadInterviewFacts({ studentIds: [id], range, peer: access.mock, ai: access.ai }) : null,
    access.prepmock && mocks.size ? loadAssessmentFacts({ user: null, studentIds: [id], range, tests: mocks }) : null,
  ]);
  return { coding, assessment, interview, prepmock };
}

/** Active days of the last 12 months per feature, for the heatmap, the streak and the weekday pattern. */
async function loadActivityYear(id, access, now) {
  const since = new Date(now.getTime() - 364 * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);
  const student = oid(id);
  const count = (model, match, field) => model.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: field } }, count: { $sum: 1 } } },
  ]).option({ maxTimeMS: MAX_QUERY_MS });
  const none = Promise.resolve([]);
  const [submissions, attempts, lessons, tests, mocks, ai] = await Promise.all([
    access.coding ? count(Submission, { user: student, mode: 'submit', status: { $in: ['AC', 'Accepted', 'WA', 'TLE', 'RE', 'CE'] }, createdAt: { $gte: since } }, '$createdAt') : none,
    access.coding ? count(QuestionPracticeAttempt, { studentId: student, createdAt: { $gte: since } }, '$createdAt') : none,
    access.learning ? count(Progress, { studentId: student, completed: true, completedAt: { $gte: since } }, '$completedAt') : none,
    access.assessment ? count(AssessmentSubmission, { studentId: student, status: { $in: ['submitted', 'violation'] }, submittedAt: { $gte: since } }, '$submittedAt') : none,
    access.mock ? count(Feedback, { to: student, createdAt: { $gte: since } }, '$createdAt') : none,
    access.ai ? count(InterviewEngagementReceipt, { ...(isUniversity() ? { tenantKey: engagementTenant({}) } : {}), studentId: student, completedAt: { $gte: since } }, '$completedAt') : none,
  ]);
  const days = new Map();
  const add = (rows, field) => rows.forEach((row) => {
    if (!row._id) return;
    const entry = days.get(row._id) || { date: row._id, coding: 0, learning: 0, tests: 0, interviews: 0 };
    entry[field] += row.count;
    days.set(row._id, entry);
  });
  add(submissions, 'coding'); add(attempts, 'coding'); add(lessons, 'learning'); add(tests, 'tests'); add(mocks, 'interviews'); add(ai, 'interviews');
  return { from: dayKey(since), to: dayKey(now), days };
}

/** Current and best streak (consecutive active days), days since the last active day, weekday pattern. */
export function activitySummary(year, now = new Date()) {
  const active = [...year.days.values()].map((day) => ({ ...day, total: day.coding + day.learning + day.tests + day.interviews }))
    .filter((day) => day.total > 0).sort((left, right) => left.date.localeCompare(right.date));
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of active) {
    const time = Date.parse(`${day.date}T00:00:00Z`);
    run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
  const last = active.length ? Date.parse(`${active.at(-1).date}T00:00:00Z`) : null;
  // The current streak stays alive until a whole day is missed.
  const current = last !== null && today - last <= DAY_MS ? run : 0;
  const weekdays = Array.from({ length: 7 }, () => 0);
  for (const day of active) weekdays[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7] += day.total;
  return {
    from: year.from, to: year.to, days: active,
    streak: { current, best },
    daysSinceActive: last === null ? null : Math.round((today - last) / DAY_MS),
    weekdays,
  };
}

/** One KPI: value now, value for the previous period (null when there is none), and the change. */
function kpi(key, label, value, previous, { unit = '', section = null, hint = '' } = {}) {
  const known = (number) => typeof number === 'number' && Number.isFinite(number);
  return {
    key, label, value: known(value) ? value : null, previous: known(previous) ? previous : null,
    change: known(value) && known(previous) ? round1(value - previous) : null, unit, section, hint,
  };
}

function quickPrepSection(row, sheets, semester) {
  const started = [...row.quickprep.bySheet.values()].map((entry) => {
    const sheet = sheets.get(entry.sheetId);
    return {
      id: entry.sheetId, title: sheet?.title || 'QuickPrep sheet', slug: sheet?.slug || null,
      solved: entry.solved, total: entry.total, finished: Boolean(entry.finished),
      progress: entry.total ? Math.round((entry.solved / entry.total) * 100) : 0,
      lastViewedAt: entry.lastViewedAt ? new Date(entry.lastViewedAt).toISOString() : null,
    };
  }).sort((left, right) => Number(left.finished) - Number(right.finished) || right.progress - left.progress || left.title.localeCompare(right.title));
  const notStarted = [...sheets.values()]
    .filter((sheet) => sheet.published && sheetVisibleTo(sheet, semester) && !row.quickprep.bySheet.has(sheet.id))
    .map((sheet) => ({ id: sheet.id, title: sheet.title, slug: sheet.slug || null, items: sheet.items }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const { quickprep } = row;
  return { progress: quickprep.progress, solved: quickprep.solved, total: quickprep.total, started: quickprep.started, finished: quickprep.finished, available: started.length + notStarted.length, sheets: started, notStarted };
}

function upcomingTests(tests, takenIds, now) {
  return [...tests.values()]
    .filter((test) => !test.ended && new Date(test.endTime) > now && !takenIds.has(test.id))
    .sort((left, right) => new Date(left.startTime) - new Date(right.startTime))
    .slice(0, 5)
    .map((test) => ({ id: test.id, title: test.title, startTime: new Date(test.startTime).toISOString(), endTime: new Date(test.endTime).toISOString(), live: new Date(test.startTime) <= now }));
}

/**
 * Prep Mock in the period: the same figures as Prep Assessment (taken, average, best, each mock's
 * score) from the admin profile builder's own Prep Mock part. `everTaken` counts all time.
 */
function prepMockSection(profileMock, previousRow, mocks) {
  const { calendar, upcoming, missedTests, missed, ...tested } = profileMock || {};
  const empty = { taken: 0, passed: 0, failed: 0, averageScore: null, bestScore: null, lastScore: null, passRate: null, minutes: 0, tests: [] };
  return {
    ...empty, ...tested,
    everTaken: mocks.size,
    previous: previousRow?.prepmock ? { taken: previousRow.prepmock.taken, averageScore: previousRow.prepmock.averageScore } : null,
  };
}

async function computeInsights(user, permissions, range) {
  const access = studentInsightAccess(user, permissions);
  if (!anyInsightAccess(access)) throw new HttpError(403, 'No analysis features are enabled for your account.');
  const now = new Date();
  const student = await User.findById(user._id).select(STUDENT_FIELDS).lean();
  if (!student) throw new HttpError(404, 'Student not found.');
  const id = String(student._id);
  const previous = previousRange(range, now);
  const [tests, mocks] = await Promise.all([
    access.assessment ? loadStudentTests(student, now) : new Map(),
    access.prepmock ? loadStudentMocks(student).catch(() => new Map()) : new Map(),
  ]);

  const [period, before, quickprep, learning, library, year, stored] = await Promise.all([
    loadPeriodFacts(id, access, range, tests, mocks),
    previous ? loadPeriodFacts(id, access, previous, tests, mocks) : null,
    // Sheet and course progress is where the student stands now, whatever the period.
    access.quickprep ? loadQuickPrepFacts({ studentIds: [id], range: {} }) : null,
    access.learning ? loadLearningFacts({ studentIds: [id], range: {} }) : null,
    access.coding ? loadPracticeLibrary() : [],
    loadActivityYear(id, access, now),
    access.rankings ? storedScoresFor([id]).catch(() => null) : null,
  ]);
  const [work, rhythm] = access.coding ? await Promise.all([loadStudentPractice(id, library), loadRhythm(id, now)]) : [new Map(), null];

  const buildRow = (facts, rowRange, extras = {}) => buildStudentRows({
    students: [student], facts: facts.coding, problems: facts.coding.problems, now,
    assessment: facts.assessment, interview: facts.interview, prepmock: facts.prepmock, range: rowRange, ...extras,
  })[0];
  const row = buildRow(period, range, { quickprep, learning });
  const previousRow = before ? buildRow(before, previous) : null;
  const modules = new Set(['coding', ...(access.learning ? ['learning'] : []), ...(access.assessment ? ['assessment'] : []), ...(access.mock || access.ai ? ['interview'] : []), ...(access.prepmock ? ['prepmock'] : [])]);
  const profile = buildStudentProfile(row, { range, modules, sheets: quickprep?.sheets, tests, mocks });

  const coverage = access.coding ? buildCoverage(library, work, { range, now }) : null;
  const firstSolves = (window) => [...work.values()].filter((entry) => entry.solved && inRange(entry.firstSolvedAt, window)).length;
  const retryItems = access.coding ? library.filter((item) => work.has(item.key) && !work.get(item.key).solved)
    .sort((left, right) => new Date(work.get(right.key).lastAt || 0) - new Date(work.get(left.key).lastAt || 0)) : [];
  const retry = retryItems.length ? {
    count: retryItems.length,
    items: retryItems.slice(0, 6).map((item) => ({ id: item.id, title: item.title, difficulty: item.difficulty, to: questionLink(item), lastAt: work.get(item.key).lastAt })),
  } : { count: 0, items: [] };

  const activity = activitySummary(year, now);
  const activeIn = (window) => (window ? activity.days.filter((day) => dayInRange(day.date, window)).length : null);
  const sections = {};
  const headline = [];

  if (coverage) {
    headline.push(kpi('preparation', 'Preparation', coverage.preparation.percent, coverage.preparation.atPeriodStart, { unit: '%', section: 'topics', hint: `Core topics · ${coverage.preparation.coreTopics}` }));
    headline.push(kpi('solved', 'New solves', firstSolves(range), previous ? firstSolves(previous) : null, { section: 'coding' }));
    headline.push(kpi('accuracy', 'Accuracy', row.coding.accuracy, previousRow?.coding.submissions ? previousRow.coding.accuracy : null, { unit: '%', section: 'coding' }));
    const coding = profile.coding;
    sections.coding = {
      solved: coding.solved, accuracy: coding.accuracy, submissions: coding.submissions, accepted: coding.accepted, attempted: coding.attempted,
      activeDays: coding.activeDays, daysSinceActive: coding.daysSinceActive, status: coding.practiceStatus,
      languages: coding.languages, verdicts: coding.verdicts,
      daily: [...row.days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, attempts: value.attempts, accepted: value.accepted })),
      retry,
      breakdown: codingBreakdown(row),
      milestones: solveMilestones(library, work),
      recent: recentSolves(library, work),
      growth: preparationGrowth(library, work, coverage, { range, now }),
      rhythm,
      previous: previousRow ? { solved: previousRow.coding.solved.total, accuracy: previousRow.coding.accuracy, submissions: previousRow.coding.submissions } : null,
    };
  }
  headline.push(kpi('activeDays', 'Active days', activeIn(range) ?? activity.days.length, activeIn(previous), { section: 'activity', hint: range.from ? '' : 'Last 12 months' }));
  if (access.quickprep && row.quickprep) sections.quickprep = quickPrepSection(row, quickprep.sheets, student.semester);
  if (access.learning && row.learning) {
    const lessons = profile.learning;
    const inPeriod = sumDays(row.learning.days, range);
    sections.learning = {
      progress: lessons.progress, completedTopics: lessons.completedTopics, availableTopics: lessons.availableTopics, videoMinutes: lessons.videoMinutes,
      daysSinceActive: lessons.daysSinceActive, status: lessons.status, subjects: lessons.subjects,
      inPeriod, previousInPeriod: previous ? sumDays(row.learning.days, previous) : null,
      daily: [...row.learning.days.entries()].filter(([day]) => dayInRange(day, range)).sort(([left], [right]) => left.localeCompare(right)).map(([date, completed]) => ({ date, completed })),
    };
    headline.push(kpi('lessons', 'Lessons done', inPeriod, sections.learning.previousInPeriod, { section: 'learning' }));
  }
  if (access.assessment && row.assessment) {
    const { calendar, ...tested } = profile.assessment;
    const taken = new Set(row.assessment.takenIds);
    // Upcoming tests ignore the period: a test next week matters whatever range is shown.
    const allTaken = await AssessmentSubmission.distinct('assessmentId', { studentId: student._id, status: { $in: ['submitted', 'violation', 'expired'] } }).maxTimeMS(MAX_QUERY_MS);
    allTaken.forEach((value) => taken.add(String(value)));
    sections.assessment = {
      ...tested, upcoming: upcomingTests(tests, taken, now),
      previous: previousRow?.assessment ? { taken: previousRow.assessment.taken, averageScore: previousRow.assessment.averageScore } : null,
    };
    headline.push(kpi('testScore', 'Test average', tested.taken ? tested.averageScore : null, previousRow?.assessment?.taken ? previousRow.assessment.averageScore : null, { unit: '%', section: 'assessment', hint: `${tested.taken} taken` }));
  }
  if ((access.mock || access.ai) && row.interview) {
    const { calendar, ...interview } = profile.interview;
    sections.interview = {
      mock: access.mock ? {
        done: interview.mockDone, score: interview.mockScore, best: interview.bestMockScore, last: interview.lastMockScore,
        ratings: interview.ratings, mocks: interview.mocks, given: interview.given, scheduled: interview.scheduled,
      } : null,
      ai: access.ai ? { started: interview.aiStarted, completed: interview.aiCompleted } : null,
      previous: previousRow?.interview ? { mockDone: previousRow.interview.mockDone, mockScore: previousRow.interview.mockScore, aiCompleted: previousRow.interview.aiCompleted } : null,
    };
    const done = (target) => (access.mock ? target.mockDone : 0) + (access.ai ? target.aiCompleted : 0);
    headline.push(kpi('interviews', 'Interviews', done(row.interview), previousRow?.interview ? done(previousRow.interview) : null, { section: 'interview' }));
  }

  if (access.prepmock) sections.prepmock = prepMockSection(profile.prepmock, previousRow, mocks);

  const latestTest = sections.assessment?.tests?.[0] || null;
  const coach = buildCoachSteps({
    now,
    coverage,
    coding: access.coding ? sections.coding : null,
    retry: retry.count ? { count: retry.count, first: retry.items[0] } : null,
    quickprep: sections.quickprep || null,
    learning: sections.learning || null,
    assessment: sections.assessment ? {
      upcoming: sections.assessment.upcoming[0] || null,
      latest: latestTest ? { ...latestTest, percent: round1(latestTest.percent) } : null,
      missed: sections.assessment.missed, passPercent: PASS_PERCENT,
    } : null,
    interview: sections.interview?.mock ? { ...sections.interview.mock, mockDone: sections.interview.mock.done } : null,
    ai: sections.interview?.ai || null,
    activity,
  });

  return {
    generatedAt: now.toISOString(),
    range: {
      preset: range.preset, from: range.from?.toISOString() || null, to: (range.to || now).toISOString(),
      previous: previous ? { from: previous.from.toISOString(), to: previous.to.toISOString(), label: previous.label } : null,
    },
    access,
    student: {
      name: student.name || '', studentId: student.studentId || '', semester: student.semester ?? null,
      course: student.course || '', branch: student.branch || '', avatarUrl: student.avatarUrl || null,
    },
    prepScore: access.rankings ? { total: stored?.scores?.get(id)?.total ?? 0 } : null,
    headline,
    coach,
    coverage: coverage ? { totals: coverage.totals, preparation: coverage.preparation, topics: coverage.topics } : null,
    sections,
    activity,
    records: personalRecords({ activity, sections, coverage, milestones: sections.coding?.milestones }),
  };
}

/**
 * When the student practises: submissions and practice answers of the last 12 months by weekday
 * (Monday first) and hour, in India time, with how many were correct.
 */
async function loadRhythm(id, now) {
  const since = new Date(now.getTime() - 365 * DAY_MS);
  const student = oid(id);
  const group = (dateField, correct) => ({ $group: {
    _id: { day: { $isoDayOfWeek: { date: dateField, timezone: 'Asia/Kolkata' } }, hour: { $hour: { date: dateField, timezone: 'Asia/Kolkata' } } },
    count: { $sum: 1 }, correct: { $sum: { $cond: [correct, 1, 0] } },
  } });
  const [submissions, attempts] = await Promise.all([
    Submission.aggregate([{ $match: { user: student, mode: 'submit', status: { $in: ['AC', 'Accepted', 'WA', 'TLE', 'RE', 'CE'] }, createdAt: { $gte: since } } }, group('$createdAt', { $in: ['$status', ['AC', 'Accepted']] })]).option({ maxTimeMS: MAX_QUERY_MS }),
    QuestionPracticeAttempt.aggregate([{ $match: { studentId: student, createdAt: { $gte: since } } }, group('$createdAt', { $eq: ['$result', 'correct'] })]).option({ maxTimeMS: MAX_QUERY_MS }),
  ]);
  const cells = new Map();
  for (const row of [...submissions, ...attempts]) {
    const key = `${row._id.day - 1}:${row._id.hour}`;
    const cell = cells.get(key) || { day: row._id.day - 1, hour: row._id.hour, count: 0, correct: 0 };
    cell.count += row.count;
    cell.correct += row.correct;
    cells.set(key, cell);
  }
  const list = [...cells.values()];
  const byHour = Array.from({ length: 24 }, (_, hour) => list.filter((cell) => cell.hour === hour).reduce((sum, cell) => ({ count: sum.count + cell.count, correct: sum.correct + cell.correct }), { count: 0, correct: 0 }));
  const busiest = byHour.reduce((best, value, hour) => (value.count > (byHour[best]?.count || 0) ? hour : best), 0);
  const sharp = byHour.map((value, hour) => ({ hour, ...value })).filter((value) => value.count >= 5).sort((left, right) => right.correct / right.count - left.correct / left.count)[0];
  return { cells: list, total: list.reduce((sum, cell) => sum + cell.count, 0), busiestHour: list.length ? busiest : null, sharpestHour: sharp ? { hour: sharp.hour, accuracy: round1((sharp.correct / sharp.count) * 100) } : null };
}

/** The student's analysis for the period; repeated loads within a minute share one computation. */
export async function getStudentInsights({ user, permissions, query = {}, refresh = false }) {
  const range = studentRange(query);
  const access = studentInsightAccess(user, permissions);
  const key = [currentTenant()?.universityId || 'platform', String(user._id), range.preset, range.from?.toISOString() || '', range.to?.toISOString() || '', JSON.stringify(access)].join('|');
  const cached = cache.get(key);
  // Presets move with the clock, so a cached preset answer is only reused briefly.
  if (!refresh && cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = computeInsights(user, permissions, range);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return promise;
}

/** One topic of the PrepCoding library in detail, for this student. */
export async function getStudentTopic({ user, permissions, key }) {
  const access = studentInsightAccess(user, permissions);
  if (!access.coding) throw new HttpError(403, 'PrepCoding is not enabled for your account.');
  const text = String(key || '').trim();
  if (!text || text.length > 120) throw new HttpError(400, 'Unknown topic.');
  const library = await loadPracticeLibrary();
  const work = await loadStudentPractice(String(user._id), library);
  const detail = topicDetail(library, work, text);
  if (!detail) throw new HttpError(404, 'Topic not found.');
  return detail;
}

/** The student's own full report for the period (Excel or PDF), limited to their features. */
export async function exportStudentInsights({ user, permissions, query = {} }) {
  const type = STUDENT_REPORT_TYPES[String(query.format || '')];
  if (!type) throw new HttpError(400, 'Choose Excel or PDF.');
  const access = studentInsightAccess(user, permissions);
  if (!anyInsightAccess(access)) throw new HttpError(403, 'No analysis features are enabled for your account.');
  const range = studentRange(query);
  const now = new Date();
  const student = await User.findById(user._id).select(STUDENT_FIELDS).lean();
  if (!student) throw new HttpError(404, 'Student not found.');
  const id = String(student._id);
  const tests = access.assessment ? await loadStudentTests(student, now) : new Map();
  const [facts, quickprep, learning, times, stored] = await Promise.all([
    loadPeriodFacts(id, access, range, tests),
    access.quickprep ? loadQuickPrepFacts({ studentIds: [id], range }) : null,
    access.learning ? loadLearningFacts({ studentIds: [id], range }) : null,
    access.coding ? loadProblemTimes({ studentId: id, range }) : new Map(),
    access.rankings ? storedScoresFor([id]).catch(() => null) : null,
  ]);
  const row = buildStudentRows({
    students: [student], facts: facts.coding, problems: facts.coding.problems, now, range,
    assessment: facts.assessment, interview: facts.interview, quickprep, learning,
  })[0];
  row.scores = { total: access.rankings ? stored?.scores?.get(id)?.total ?? 0 : 0, features: {} };
  const modules = new Set(['coding', ...(access.learning ? ['learning'] : []), ...(access.assessment ? ['assessment'] : []), ...(access.mock || access.ai ? ['interview'] : [])]);
  const profile = buildStudentProfile(row, { range, modules, sheets: quickprep?.sheets, tests });
  if (!access.coding) profile.coding = null;
  const report = buildStudentReport({ row, profile, times, range, generatedAt: now, forStudent: true });
  if (!access.rankings) report.sections = report.sections.filter((section) => section.title !== 'Prep Score');
  const buffer = await type.render(report);
  const safeName = String(student.name || 'student').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'student';
  return { buffer, contentType: type.contentType, filename: `prep-report-${safeName}-${now.toISOString().slice(0, 10)}.${type.extension}` };
}

export function resetStudentInsightsCache() { cache.clear(); }
