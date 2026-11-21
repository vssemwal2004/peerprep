import mongoose from 'mongoose';
import User from '../models/User.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import Progress from '../models/Progress.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Pair from '../models/Pair.js';
import StudentActivity from '../models/StudentActivity.js';
import StudentProblemView from '../models/StudentProblemView.js';
import StudentChallenge from '../models/StudentChallenge.js';
import { EngagementReward, InterviewEngagementReceipt, StudentProgression } from '../models/AdaptiveEngagement.js';
import Assessment from '../models/Assessment.js';
import AIInterview from '../models/AIInterview.js';
import { aiInterviewLevel, assessmentLevel, prepScore, scoreFeatures } from './prepScore/engine.js';
import { ensurePrepScoreStore, rankFromStore, saveOwnScore, servingPolicy } from './prepScore/sync.js';
import { uncountedSolvesFor } from './prepScore/topicQuota.js';
import { ledgerFor, summarizeLedger } from './prepScore/points.js';
import { loadPointFacts } from './prepScore/pointFacts.js';
import { prepStreakFor } from './prepStreak.js';
import { LEVELS } from './adaptiveEngagementRules.js';
import { engagementTenant } from './engagementPolicyService.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Semester from '../models/Subject.js';
import { learningSemesters, sharedQuestions } from '../platform/sharedContent.js';
import { isUniversity } from '../platform/deployment.js';
import { currentTenant } from '../platform/tenantContext.js';
import { universityPolicy } from '../platform/client.js';

const DAY_MS = 86_400_000;
const QUERY_TIMEOUT_MS = 8_000;
const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
const publicProblemMatch = {
  status: { $in: ['published', 'Active', 'active'] },
  $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
};
const count = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};
const nullableScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : null;
};
const dateKey = (date) => new Date(date).toISOString().slice(0, 10);
const dateExpression = (field) => ({ $dateToString: { date: field, format: '%Y-%m-%d', timezone: 'UTC' } });
const acceptedExpression = { $in: [{ $toUpper: { $ifNull: ['$status', ''] } }, ACCEPTED] };
const objectId = (value) => new mongoose.Types.ObjectId(String(value));
const aggregate = (model, pipeline) => model.aggregate(pipeline).option({ maxTimeMS: QUERY_TIMEOUT_MS });
const QUESTION_LEVEL_FIELDS = ['marksPerQuestion', 'questions.type', 'questions.difficulty', 'questions.coding.difficulty', 'questions.marks', 'questions.points'];
const ASSESSMENT_LEVEL_FIELDS = [...QUESTION_LEVEL_FIELDS.map((field) => `sections.${field}`), ...QUESTION_LEVEL_FIELDS.map((field) => `questionSets.sections.${field}`)].join(' ');

/** Map(id -> Easy/Medium/Hard) for independent assessment and interview activity metrics. */
async function contentLevels(model, rawIds, fields, levelOf) {
  const ids = [...new Set(rawIds.filter((id) => id && mongoose.isValidObjectId(id)).map(String))];
  if (!ids.length) return new Map();
  const rows = await model.find({ _id: { $in: ids.map(objectId) } }).select(fields).maxTimeMS(QUERY_TIMEOUT_MS).lean();
  return new Map(rows.map((row) => [String(row._id), levelOf(row)]));
}

export function publicCodingProblemStages(problemField = 'problem') {
  return [
    { $lookup: { from: Problem.collection.name, localField: problemField, foreignField: '_id', as: 'codingProblem' } },
    { $unwind: '$codingProblem' },
    { $match: { 'codingProblem.status': publicProblemMatch.status, $or: [{ 'codingProblem.visibility': 'public' }, { 'codingProblem.visibility': { $exists: false } }] } },
  ];
}

export async function dashboardPermissions(student) {
  if (student.accessScope === 'assessment_only') {
    return { questions: false, learning: false, interviews: false, events: false, assessments: true };
  }
  if (!isUniversity()) return { questions: true, learning: true, interviews: true, events: true, assessments: true };
  return (await universityPolicy()).permissions || {};
}

export function calculateActivityStreak(activityByDate, now = new Date()) {
  const keys = Object.keys(activityByDate || {}).filter((key) => count(activityByDate[key]) > 0).sort();
  let best = 0;
  let run = 0;
  let previous = null;
  keys.forEach((key) => {
    const time = new Date(`${key}T00:00:00Z`).getTime();
    run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  });
  let cursor = dateKey(now);
  if (!count(activityByDate?.[cursor])) cursor = dateKey(new Date(now.getTime() - DAY_MS));
  let current = 0;
  while (count(activityByDate?.[cursor])) {
    current += 1;
    cursor = dateKey(new Date(new Date(`${cursor}T00:00:00Z`).getTime() - DAY_MS));
  }
  return { current, best, activeDays: keys.length };
}

// Classic learner levels (students without the adaptive Quick Prep ladder, and staff views).
// Levels 1–7: any ONE requirement. Levels 8–12 (elite): ALL requirements together, on the best
// streak so a broken streak never drops a level. Mirror: frontend/src/student/profileBadge.js.
export const CLASSIC_LEVELS = Object.freeze([
  { title: 'Rising Learner' },
  { title: 'Quick Solver', score: 65, solved: 30, streak: 7 },
  { title: 'Consistent Performer', score: 100, solved: 80, assessment: 70 },
  { title: 'Skill Champion', score: 135, streak: 21 },
  { title: 'Problem Master', score: 170, solved: 180 },
  { title: 'Elite Coder', score: 220, solved: 260 },
  { title: 'Algorithm Architect', score: 300, solved: 350, streak: 45 },
  { title: 'Code Strategist', all: true, score: 400, solved: 450, bestStreak: 60 },
  { title: 'Placement Ace', all: true, score: 520, solved: 600, bestStreak: 90 },
  { title: 'Grandmaster', all: true, score: 680, solved: 800, bestStreak: 120 },
  { title: 'Legend', all: true, score: 850, solved: 1000, bestStreak: 180 },
  { title: 'Hall of Fame', all: true, score: 1100, solved: 1300, bestStreak: 365 },
]);

export function learnerLevel({ solved, streak, bestStreak = streak, assessmentScore, interviewScore, challengePoints = 0 }) {
  const score = solved * 0.5 + streak * 1.75 + assessmentScore * 0.35 + interviewScore * 0.2 + challengePoints * 0.1;
  const values = { score, solved, streak, assessment: assessmentScore, bestStreak: Math.max(bestStreak || 0, streak || 0) };
  for (let index = CLASSIC_LEVELS.length - 1; index > 0; index -= 1) {
    const tier = CLASSIC_LEVELS[index];
    const checks = ['score', 'solved', 'streak', 'assessment', 'bestStreak'].filter((key) => tier[key] !== undefined).map((key) => values[key] >= tier[key]);
    if (tier.all ? checks.every(Boolean) : checks.some(Boolean)) return { level: index + 1, title: tier.title };
  }
  return { level: 1, title: CLASSIC_LEVELS[0].title };
}

/**
 * Prep Score for a progress row. The total is the v6 points ledger replayed from the row's
 * `pointFacts` (prepScore/points.js); the formula modules stay as admin activity metrics.
 */
export function scoresForRow(metrics = {}, policy = {}) {
  const features = metrics.scoreFeatures || scoreFeatures(null);
  const score = prepScore(metrics.scoreEvidence || {}, features, policy);
  if (!metrics.pointFacts) return score;
  const ledger = ledgerFor(metrics.pointFacts, policy, { now: metrics.scoredAt || new Date(), features });
  return { ...score, total: ledger.total };
}

// The acknowledgement endpoint is cosmetic; none of its client-reported awards enters ranking.
// The rank score is the Prep Score: only the student's own verified work, per licensed feature.
export function scoreStudentProgress(metrics = {}, now = new Date(), policy = {}) {
  const easy = count(metrics.easySolved);
  const medium = count(metrics.mediumSolved);
  const hard = count(metrics.hardSolved);
  const solved = easy + medium + hard;
  const streak = calculateActivityStreak(metrics.activityByDate || {}, now);
  const badgeMetrics = {
    solved, hardSolved: hard, bestStreak: streak.best, activeDays: streak.activeDays,
    languages: count(metrics.languages), assessments: count(metrics.assessmentsCompleted), interviews: count(metrics.interviews),
  };
  const levelMetrics = {
    solvedCount: solved, streak: streak.current, bestStreak: streak.best, assessmentScore: nullableScore(metrics.assessmentScore), interviewScore: count(metrics.interviewScore),
    challengePoints: count(metrics.challengePoints),
  };
  const earned = [
    ['first-accept', badgeMetrics.solved >= 1], ['solver-10', badgeMetrics.solved >= 10], ['solver-50', badgeMetrics.solved >= 50],
    ['hard-1', badgeMetrics.hardSolved >= 1], ['streak-7', badgeMetrics.bestStreak >= 7], ['streak-30', badgeMetrics.bestStreak >= 30],
    ['active-30', badgeMetrics.activeDays >= 30], ['polyglot', badgeMetrics.languages >= 3],
    ['assessment-1', badgeMetrics.assessments >= 1], ['interview-1', badgeMetrics.interviews >= 1],
  ].filter(([, qualifies]) => qualifies).map(([id]) => id);
  const score = scoresForRow(metrics, policy);
  const scoreBreakdown = Object.fromEntries(Object.entries(score.features).map(([key, feature]) => [key, feature.score]));
  return {
    score: score.total,
    prepScore: score,
    scoreFeatures: metrics.scoreFeatures || scoreFeatures(null),
    scoreBreakdown,
    earnedBadges: earned.length + count(metrics.challengeBadges),
    milestoneBadges: earned.length,
    challengeBadges: count(metrics.challengeBadges),
    badgeMetrics, levelMetrics,
    level: metrics.adaptiveLevel || learnerLevel({ solved: levelMetrics.solvedCount, streak: levelMetrics.streak, bestStreak: streak.best, assessmentScore: levelMetrics.assessmentScore ?? 0, interviewScore: levelMetrics.interviewScore, challengePoints: levelMetrics.challengePoints }),
    // Coding solves count as progress even when a quota or rule awards no points yet.
    hasProgress: score.hasProgress,
  };
}

const rankable = (student) => student.isActive !== false && student.accessScope !== 'assessment_only' && (!student.role || student.role === 'student');

function universityNameFor(student) {
  return String(student.college || (isUniversity() ? currentTenant()?.universityId || process.env.PEERPREP_UNIVERSITY_NAME || process.env.PEERPREP_UNIVERSITY_ID : '')).trim();
}

/**
 * The student's own Prep Score (computed fresh at the serving policy version) and their place in
 * the university, counted from the stored scores of everyone else.
 */
async function rankOwnProgress(student, own, now) {
  const state = await ensurePrepScoreStore();
  const policy = await servingPolicy(state);
  const progress = scoreStudentProgress(own || {}, now, policy);
  const universityName = universityNameFor(student);
  const cohort = universityName ? universityCohort(student) : null;
  if (rankable(student)) await saveOwnScore(student, progress.prepScore, policy.version);
  const base = { ...progress, rank: null, percentile: null, tied: false, universityName, totalStudents: 0, unit: 'prep-score', policyVersion: policy.version };
  if (!cohort) return base;
  const position = await rankFromStore(student, { total: progress.score }, policy.version, cohort);
  if (!progress.hasProgress || !rankable(student)) return { ...base, totalStudents: position.totalStudents };
  return { ...base, ...position };
}

export function universityCohort(student, universityDeployment = isUniversity()) {
  const base = { role: 'student', isActive: { $ne: false }, accessScope: { $ne: 'assessment_only' } };
  if (universityDeployment) return base;
  const college = String(student.college || '').trim();
  if (!college) return null;
  // Exact escaped match: similar names must never mix two universities.
  const escaped = college.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { ...base, college: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' } };
}

export function buildCurriculumTopicMap(semesters = [], student = {}) {
  const topics = new Map();
  for (const semester of semesters) {
    const semesterNumber = Number(String(semester.semesterName || '').match(/\d+/)?.[0]);
    if (Number(student.semester) > 0 && semesterNumber > Number(student.semester)) continue;
    for (const subject of semester.subjects || []) {
      for (const chapter of subject.chapters || []) {
        for (const topic of chapter.topics || []) {
          topics.set(String(topic._id), {
            topicId: String(topic._id), title: topic.topicName,
            semesterId: String(semester._id), semesterName: semester.semesterName,
            subjectId: String(subject._id), subjectName: subject.subjectName,
            chapterId: String(chapter._id), chapterName: chapter.chapterName,
            coordinatorId: String(semester.coordinatorId), hasVideo: Boolean(topic.topicVideoLink),
            difficultyLevel: topic.difficultyLevel || null,
            hasNotes: Boolean(topic.notesPDF), hasQuestions: Boolean(topic.questionPDF),
          });
        }
      }
    }
  }
  return topics;
}

export function learningResumeItem(progress, topic) {
  if (!topic || progress.completed) return null;
  const watchedSeconds = count(progress.videoWatchedSeconds);
  const durationSeconds = count(progress.videoDuration);
  const requestedContentType = progress.lastViewedContentType || (topic.hasVideo ? 'video' : 'topic');
  const availableContent = { video: topic.hasVideo, notes: topic.hasNotes, questions: topic.hasQuestions, topic: true };
  const contentType = availableContent[requestedContentType] ? requestedContentType : 'topic';
  const query = new URLSearchParams({ semesterId: topic.semesterId, subjectId: topic.subjectId, topicId: topic.topicId, contentType });
  return {
    id: `learning:${topic.topicId}`, type: 'learning', title: topic.title,
    subtitle: `${topic.subjectName} · ${topic.chapterName}`,
    href: `/student/learning/${encodeURIComponent(topic.semesterName)}/${encodeURIComponent(topic.subjectName)}/${encodeURIComponent(topic.coordinatorId)}?${query}`,
    state: { semesterId: topic.semesterId, subjectId: topic.subjectId, coordinatorId: topic.coordinatorId },
    updatedAt: progress.lastAccessedAt || progress.updatedAt,
    progressPercent: contentType === 'video' && durationSeconds > 0 ? Math.min(99, Math.round((watchedSeconds / durationSeconds) * 100)) : null,
    watchedSeconds, durationSeconds, status: watchedSeconds > 0 ? 'in_progress' : 'viewed', contentType,
  };
}

export function combineResumeItems(items, limit = 4) {
  const unique = new Map();
  for (const item of items.filter(Boolean)) {
    const previous = unique.get(item.id);
    if (!previous || new Date(item.updatedAt) > new Date(previous.updatedAt)) unique.set(item.id, item);
  }
  return [...unique.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, limit);
}

async function curriculum() {
  return (await learningSemesters()) ?? Semester.find().select('semesterName coordinatorId subjects').maxTimeMS(QUERY_TIMEOUT_MS).lean();
}

export async function getSharedCodingCatalog() {
  if (!isUniversity()) return [];
  return (await sharedQuestions() || []).filter((question) => question.questionType === 'coding'
    && question.status === 'published' && question.visibility !== 'private' && question.sourceType !== 'assessment');
}

function codingTotals(localTotals, sharedCatalog) {
  const totals = { easy: 0, medium: 0, hard: 0 };
  for (const entry of localTotals) {
    const key = String(entry._id).toLowerCase();
    if (Object.hasOwn(totals, key)) totals[key] += entry.count;
  }
  for (const question of sharedCatalog) {
    const key = String(question.difficulty || question.questionData?.problemDataSnapshot?.difficulty || '').toLowerCase();
    if (Object.hasOwn(totals, key)) totals[key] += 1;
  }
  return totals;
}

export async function getAccessibleCurriculumTopic(student, topicId) {
  return buildCurriculumTopicMap(await curriculum(), student).get(String(topicId)) || null;
}

async function getActivityRows(studentIds, permissions, now) {
  const start = new Date(now.getTime() - 364 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const dayGroups = (id, field) => [
    { $group: { _id: { studentId: id, day: dateExpression(field) }, count: { $sum: 1 } } },
  ];
  const promises = [];
  if (permissions.questions) {
    promises.push(aggregate(Submission, [{ $match: { user: { $in: studentIds }, mode: 'submit', createdAt: { $gte: start, $lte: now } } }, ...dayGroups('$user', '$createdAt')]));
    promises.push(aggregate(QuestionPracticeAttempt, [{ $match: { studentId: { $in: studentIds }, source: 'shared', questionType: 'coding', createdAt: { $gte: start, $lte: now } } }, ...dayGroups('$studentId', '$createdAt')]));
  }
  const activityTypes = ['LOGIN', ...(permissions.learning ? ['VIDEO_WATCH', 'TOPIC_COMPLETED', 'COURSE_ENROLLED'] : []), ...(permissions.events ? ['FEEDBACK_SUBMITTED', 'SESSION_SCHEDULED'] : [])];
  promises.push(aggregate(StudentActivity, [{ $match: { studentId: { $in: studentIds }, date: { $gte: start, $lte: now }, activityType: { $in: activityTypes } } }, ...dayGroups('$studentId', '$date')]));
  if (permissions.learning) {
    promises.push(aggregate(Progress, [{ $match: { studentId: { $in: studentIds }, completed: true, completedAt: { $gte: start, $lte: now } } }, ...dayGroups('$studentId', '$completedAt')]));
  }
  if (permissions.events) promises.push(aggregate(Pair, [
    { $match: { $or: [{ interviewer: { $in: studentIds } }, { interviewee: { $in: studentIds } }], finalConfirmedTime: { $gte: start, $lte: now } } },
    { $project: { students: ['$interviewer', '$interviewee'], finalConfirmedTime: 1 } }, { $unwind: '$students' },
    { $match: { students: { $in: studentIds } } }, ...dayGroups('$students', '$finalConfirmedTime'),
  ]));
  const maps = new Map();
  for (const source of await Promise.all(promises)) {
    for (const entry of source) {
      const id = String(entry._id.studentId);
      if (!maps.has(id)) maps.set(id, {});
      const days = maps.get(id);
      days[entry._id.day] = (days[entry._id.day] || 0) + entry.count;
    }
  }
  return maps;
}

export async function getStudentActivitySummary(student, now = new Date()) {
  const permissions = await dashboardPermissions(student);
  const studentId = objectId(student._id);
  const start = new Date(now.getTime() - 364 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const [rows, localSubmissions, sharedSubmissions] = await Promise.all([
    getActivityRows([studentId], permissions, now),
    permissions.questions ? Submission.countDocuments({ user: studentId, mode: 'submit', createdAt: { $gte: start, $lte: now } }).maxTimeMS(QUERY_TIMEOUT_MS) : 0,
    permissions.questions ? QuestionPracticeAttempt.countDocuments({ studentId, source: 'shared', questionType: 'coding', createdAt: { $gte: start, $lte: now } }).maxTimeMS(QUERY_TIMEOUT_MS) : 0,
  ]);
  const activityByDate = rows.get(String(studentId)) || {};
  return { activityByDate, streak: calculateActivityStreak(activityByDate, now), totalCompilerSubmissions: localSubmissions + sharedSubmissions };
}

async function loadProgressRows(students, permissions, semesters, now, sharedCatalog = [], includeActivity = true, includeDiscovery = false, includePoints = true) {
  const ids = students.map((student) => objectId(student._id));
  if (!ids.length) return [];
  const adaptiveScopes = students.map((student) => ({ studentId: objectId(student._id), tenantKey: engagementTenant(student) }));
  const curriculumTopicIds = permissions.learning ? [...buildCurriculumTopicMap(semesters).keys()].map(objectId) : [];
  const [coding, learning, assessments, interviews, activities, sharedCoding, challenges, missionRewards, progressions, aiInterviews] = await Promise.all([
    permissions.questions ? aggregate(Submission, [
      // Practice only: solves inside a test already count towards Prep Assessment.
      { $match: { user: { $in: ids }, mode: 'submit', assessmentId: null } },
      { $group: { _id: { studentId: '$user', problem: '$problem' }, accepted: { $max: { $cond: [acceptedExpression, 1, 0] } }, submissions: { $sum: 1 }, acceptedSubmissions: { $sum: { $cond: [acceptedExpression, 1, 0] } }, languages: { $addToSet: '$language' } } },
      ...publicCodingProblemStages('_id.problem'),
      { $group: { _id: '$_id.studentId', attemptedProblems: { $sum: 1 }, submissions: { $sum: '$submissions' }, acceptedSubmissions: { $sum: '$acceptedSubmissions' }, easySolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Easy'] }] }, 1, 0] } }, mediumSolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Medium'] }] }, 1, 0] } }, hardSolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Hard'] }] }, 1, 0] } }, languageSets: { $push: '$languages' },
        ...(includeDiscovery ? { acceptedProblemIds: { $addToSet: { $cond: [{ $eq: ['$accepted', 1] }, '$_id.problem', null] } } } : {}),
      } },
    ]) : [],
    permissions.learning ? aggregate(Progress, [
      { $match: { studentId: { $in: ids }, completed: true, topicId: { $in: curriculumTopicIds } } },
      { $group: { _id: '$studentId', topics: { $addToSet: '$topicId' } } },
    ]) : [],
    permissions.assessments ? aggregate(AssessmentSubmission, [
      { $match: { studentId: { $in: ids }, status: 'submitted', evaluationStatus: { $nin: ['failed', 'processing'] } } },
      { $set: { percentage: { $cond: [{ $and: [{ $isNumber: '$score' }, { $gt: ['$maxMarks', 0] }] }, { $min: [100, { $max: [0, { $multiply: [{ $divide: ['$score', '$maxMarks'] }, 100] }] }] }, null] } } },
      { $group: { _id: '$studentId', assessmentsCompleted: { $sum: 1 }, assessmentsScored: { $sum: { $cond: [{ $isNumber: '$percentage' }, 1, 0] } }, assessmentPoints: { $sum: '$percentage' }, assessmentScore: { $avg: '$percentage' }, assessmentAttempts: { $push: { assessmentId: '$assessmentId', percent: '$percentage' } } } },
    ]) : [],
    permissions.events ? aggregate(Feedback, [
      { $match: { to: { $in: ids } } },
      // Detailed feedback stores marks as the 5-25 sum of five ratings; older feedback stored 0-100.
      { $set: { mockPercent: { $cond: [
        { $or: [{ $gt: [{ $ifNull: ['$totalMarks', 0] }, 0] }, { $and: [{ $lte: ['$marks', 25] }, { $gt: [{ $ifNull: ['$communication', 0] }, 0] }] }] },
        { $multiply: [{ $divide: ['$marks', 25] }, 100] }, '$marks',
      ] } } },
      { $set: { mockPercent: { $min: [100, { $max: [0, '$mockPercent'] }] } } },
      { $group: { _id: '$to', interviews: { $sum: 1 }, interviewScore: { $avg: '$marks' }, mockAverage: { $avg: '$mockPercent' }, mockPercents: { $push: '$mockPercent' } } },
    ]) : [],
    includeActivity ? getActivityRows(ids, permissions, now) : new Map(),
    permissions.questions && sharedCatalog.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', questionId: { $in: sharedCatalog.map((row) => objectId(row._id)) } } },
      { $group: { _id: { studentId: '$studentId', questionId: '$questionId' }, accepted: { $max: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } }, attempts: { $sum: 1 }, correct: { $sum: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } }, languages: { $addToSet: '$language' } } },
    ]) : [],
    aggregate(StudentChallenge, [{ $match: { studentId: { $in: ids }, earnedAt: { $ne: null } } }, { $group: { _id: '$studentId', challengePoints: { $sum: '$rewardPoints' }, challengeBadges: { $sum: { $cond: [{ $in: ['$kind', ['weekly', 'monthly']] }, 1, 0] } } } }]),
    aggregate(EngagementReward, [{ $match: { $or: adaptiveScopes } }, { $group: { _id: '$studentId', points: { $sum: '$points' } } }]),
    StudentProgression.find({ $or: adaptiveScopes }).select('studentId level').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    // AI interview completions come from verified receipts (their scores live in the interview service).
    permissions.interviews ? aggregate(InterviewEngagementReceipt, [{ $match: { $or: adaptiveScopes, completedAt: { $ne: null } } }, { $group: { _id: '$studentId', aiInterviews: { $sum: 1 }, interviewIds: { $push: '$interviewId' } } }]) : [],
  ]);
  const aiMap = new Map(aiInterviews.map((entry) => [String(entry._id), entry]));
  // The Prep Score points ledger is replayed from these facts (scoresForRow).
  const pointFacts = includePoints ? await loadPointFacts(ids, { coding: permissions.questions === true, sharedCatalog }) : null;
  // Solves past the daily topic limit stay solved but add nothing to the Prep Score.
  const uncounted = permissions.questions ? await uncountedSolvesFor(ids) : new Map();
  const uncountedLocalIds = [...new Set([...uncounted.values()].flat().filter((key) => key.startsWith('local:')).map((key) => key.slice(6)))]
    .filter((id) => mongoose.isValidObjectId(id));
  const uncountedLocalLevels = uncountedLocalIds.length
    ? new Map((await Problem.find({ _id: { $in: uncountedLocalIds.map(objectId) } }).select('difficulty').maxTimeMS(QUERY_TIMEOUT_MS).lean()).map((problem) => [String(problem._id), problem.difficulty]))
    : new Map();
  const [testLevels, aiLevels] = await Promise.all([
    contentLevels(Assessment, assessments.flatMap((entry) => entry.assessmentAttempts.map((attempt) => attempt.assessmentId)), ASSESSMENT_LEVEL_FIELDS, assessmentLevel),
    contentLevels(AIInterview, aiInterviews.flatMap((entry) => entry.interviewIds), 'data.difficulty publishedSnapshot.data.difficulty', aiInterviewLevel),
  ]);
  const features = scoreFeatures(permissions);
  const maps = [coding, assessments, interviews].map((source) => new Map(source.map((entry) => [String(entry._id), entry])));
  const challengeMap = new Map(challenges.map((entry) => [String(entry._id), entry]));
  for (const reward of missionRewards) {
    const key = String(reward._id), row = challengeMap.get(key) || {};
    challengeMap.set(key, { ...row, challengePoints: count(row.challengePoints) + reward.points });
  }
  const progressionMap = new Map(progressions.map((row) => [String(row.studentId), LEVELS[row.level - 1]]));
  const completedByStudent = new Map();
  const sharedByStudent = new Map();
  const sharedMap = new Map(sharedCatalog.map((question) => [String(question._id), question]));
  for (const entry of sharedCoding) {
    const key = String(entry._id.studentId);
    if (!sharedByStudent.has(key)) sharedByStudent.set(key, []);
    sharedByStudent.get(key).push(entry);
  }
  for (const progress of learning) {
    completedByStudent.set(String(progress._id), new Set(progress.topics.map(String)));
  }
  return students.map((student) => {
    const id = String(student._id);
    const codingRow = { ...(maps[0].get(id) || {}) };
    const languages = new Set((codingRow.languageSets || []).flat().filter(Boolean));
    const acceptedSharedQuestionIds = [];
    for (const entry of sharedByStudent.get(id) || []) {
      const question = sharedMap.get(String(entry._id.questionId));
      const difficulty = String(question?.difficulty || question?.questionData?.problemDataSnapshot?.difficulty || '').toLowerCase();
      codingRow.attemptedProblems = count(codingRow.attemptedProblems) + 1;
      codingRow.submissions = count(codingRow.submissions) + count(entry.attempts);
      codingRow.acceptedSubmissions = count(codingRow.acceptedSubmissions) + count(entry.correct);
      if (entry.accepted && ['easy', 'medium', 'hard'].includes(difficulty)) codingRow[`${difficulty}Solved`] = count(codingRow[`${difficulty}Solved`]) + 1;
      else if (entry.accepted) codingRow.unknownSolved = count(codingRow.unknownSolved) + 1;
      if (includeDiscovery && entry.accepted) acceptedSharedQuestionIds.push(String(entry._id.questionId));
      entry.languages.filter(Boolean).forEach((language) => languages.add(language));
    }
    const topics = permissions.learning ? buildCurriculumTopicMap(semesters, student) : new Map();
    const completedTopicIds = [...(completedByStudent.get(id) || [])].filter((topicId) => topics.has(topicId));
    const completedTopics = completedTopicIds.length;
    const { assessmentAttempts = [], ...assessmentRow } = maps[1].get(id) || {};
    const { mockPercents = [], ...interviewRow } = maps[2].get(id) || {};
    const ai = aiMap.get(id);
    const notCounted = { easy: 0, medium: 0, hard: 0, unknown: 0 };
    for (const key of uncounted.get(id) || []) {
      const [source, problemId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (source === 'local') {
        const level = String(uncountedLocalLevels.get(problemId) || '').toLowerCase();
        if (level in notCounted) notCounted[level] += 1;
      } else if (source === 'shared' && sharedMap.has(problemId)) {
        const question = sharedMap.get(problemId);
        const level = String(question?.difficulty || question?.questionData?.problemDataSnapshot?.difficulty || '').toLowerCase();
        notCounted[['easy', 'medium', 'hard'].includes(level) ? level : 'unknown'] += 1;
      }
    }
    const scored = (field, level) => Math.max(0, count(codingRow[field]) - notCounted[level]);
    return {
      studentId: id, ...codingRow, ...assessmentRow, ...interviewRow, ...challengeMap.get(id),
      adaptiveLevel: progressionMap.get(id),
      languages: languages.size,
      completedTopics, totalTopics: topics.size, activityByDate: activities.get(id) || {},
      aiInterviews: ai?.aiInterviews || 0, scoreFeatures: features,
      ...(pointFacts ? { pointFacts: pointFacts.get(id), scoredAt: now } : {}),
      scoreEvidence: {
        problemSolved: [
          { level: 'Easy', count: scored('easySolved', 'easy') }, { level: 'Medium', count: scored('mediumSolved', 'medium') },
          { level: 'Hard', count: scored('hardSolved', 'hard') }, { level: null, count: scored('unknownSolved', 'unknown') },
        ].filter((item) => item.count > 0),
        codingSolvedTotal: ['easySolved', 'mediumSolved', 'hardSolved', 'unknownSolved'].reduce((sum, field) => sum + count(codingRow[field]), 0),
        assessmentCompleted: assessmentAttempts.map((attempt) => ({ level: testLevels.get(String(attempt.assessmentId)) || null, percent: attempt.percent })),
        mockCompleted: mockPercents.map((percent) => ({ percent })),
        aiCompleted: (ai?.interviewIds || []).map((interviewId) => ({ level: aiLevels.get(String(interviewId)) || null })),
        videoCompleted: completedTopicIds.map((topicId) => ({ topicLevel: topics.get(topicId)?.difficultyLevel || null })),
      },
      ...(includeDiscovery ? { completedTopicIds, acceptedSharedQuestionIds } : {}),
    };
  });
}

/** Prep Score rows for the store: { studentId, score } computed at the given policy. */
export async function computePrepScoreRows(students, permissions, policy, now = new Date()) {
  const [semesters, sharedCatalog] = await Promise.all([permissions.learning ? curriculum() : [], permissions.questions ? getSharedCodingCatalog() : []]);
  const rows = await loadProgressRows(students, permissions, semesters, now, sharedCatalog, false);
  return rows.map((row) => ({ studentId: row.studentId, score: scoresForRow(row, policy) }));
}

async function loadOwnRow(student, permissions, now) {
  const [semesters, sharedCatalog] = await Promise.all([permissions.learning ? curriculum() : [], permissions.questions ? getSharedCodingCatalog() : []]);
  const [own] = await loadProgressRows([student], permissions, semesters, now, sharedCatalog);
  return { own: own || {} };
}

/** Badges, level and their metrics for the student's own work, without touching ranks. */
export async function getStudentProgressSummary(student, permissions = null, now = new Date()) {
  const allowed = permissions || await dashboardPermissions(student);
  const { own } = await loadOwnRow(student, allowed, now);
  const state = await ensurePrepScoreStore();
  return scoreStudentProgress(own, now, await servingPolicy(state));
}

/**
 * Read-only progress for a peer profile: the same metrics and Prep Score the student sees on their
 * own profile, plus coding totals. Never saves a score or computes a rank.
 */
export async function getPeerProgressSnapshot(student, now = new Date()) {
  const permissions = await dashboardPermissions(student);
  const [semesters, sharedCatalog, problemTotals] = await Promise.all([
    permissions.learning ? curriculum() : [],
    permissions.questions ? getSharedCodingCatalog() : [],
    permissions.questions ? aggregate(Problem, [{ $match: publicProblemMatch }, { $group: { _id: '$difficulty', count: { $sum: 1 } } }]) : [],
  ]);
  const [row = {}] = await loadProgressRows([student], permissions, semesters, now, sharedCatalog);
  const state = await ensurePrepScoreStore();
  const progress = scoreStudentProgress(row, now, await servingPolicy(state));
  return { permissions, row, progress, sharedCatalog, codingTotals: permissions.questions ? codingTotals(problemTotals, sharedCatalog) : null };
}

/** Prep Streak for the dashboard and profile (activeDays stays the practice-day count). */
export async function prepStreakView(student, activityByDate = {}, now = new Date()) {
  const prep = await prepStreakFor(student._id, now);
  return { current: prep.current, best: prep.best, todayDone: prep.todayDone, recent: prep.recent, activeDays: calculateActivityStreak(activityByDate, now).activeDays, kind: 'prep' };
}

const HISTORY_RANGES = { '7d': 7, '30d': 30, '90d': 90, all: null };

/**
 * The student's own Prep Score history (profile graph): per-day gains/losses and running total,
 * where points came from (by kind) and which topics earned them. Same ledger as the stored score.
 */
export async function getStudentPrepScoreHistory(student, { range = '30d' } = {}, now = new Date()) {
  const permissions = await dashboardPermissions(student);
  const sharedCatalog = permissions.questions ? await getSharedCodingCatalog() : [];
  const state = await ensurePrepScoreStore();
  const policy = await servingPolicy(state);
  const facts = (await loadPointFacts([student._id], { coding: permissions.questions === true, sharedCatalog })).get(String(student._id));
  const ledger = ledgerFor(facts, policy, { now, features: scoreFeatures(permissions) });
  const key = Object.hasOwn(HISTORY_RANGES, range) ? range : '30d';
  const days = HISTORY_RANGES[key];
  const from = days ? new Date(now.getTime() - (days - 1) * DAY_MS + 330 * 60_000).toISOString().slice(0, 10) : null;
  const summary = summarizeLedger(ledger, { from, places: policy.config?.points?.decimalPlaces ?? 2 });
  return {
    range: key, from, to: new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10),
    total: ledger.total, startTotal: summary.startTotal, activityPoints: ledger.rawTotal,
    change: Math.round((ledger.total - summary.startTotal) * 100) / 100,
    series: summary.series, byKind: summary.byKind, topics: summary.topics.slice(0, 12),
    // The live rules, so the "How it works" box always matches what the Master Admin published.
    rules: (({ points: p = {}, modules = {} }) => ({
      solve: p.solve, dailyTopicLimit: modules.coding?.dailyTopicLimit ?? 0, dailyChallenge: p.dailyChallenge, sheetCompleted: p.sheetCompleted,
      login: p.login, monthlyBadgeLevel: p.monthlyBadgeLevel, wrongSubmission: p.wrongSubmission, wrongDailyCap: p.wrongDailyCap,
      refundSameDay: p.refundSameDay, inactivity: p.inactivity, lossFloorShare: p.lossFloorShare, curve: p.curve,
    }))(policy.config || {}),
  };
}

export async function getStudentUniversityRanking(student, permissions = null, now = new Date()) {
  const allowed = permissions || await dashboardPermissions(student);
  const { own } = await loadOwnRow(student, allowed, now);
  return rankOwnProgress(student, own, now);
}

export async function getStudentCodingSummary(student, now = new Date()) {
  const sharedCatalog = await getSharedCodingCatalog();
  const [rows, totals] = await Promise.all([
    loadProgressRows([student], { questions: true }, [], now, sharedCatalog, false, false, false),
    aggregate(Problem, [{ $match: publicProblemMatch }, { $group: { _id: '$difficulty', count: { $sum: 1 } } }]),
  ]);
  const own = rows[0] || {};
  const totalsByDifficulty = codingTotals(totals, sharedCatalog);
  return {
    totalSolved: count(own.easySolved) + count(own.mediumSolved) + count(own.hardSolved),
    attemptedProblems: count(own.attemptedProblems), totalsByDifficulty,
    totalProblems: Object.values(totalsByDifficulty).reduce((sum, total) => sum + total, 0),
    solvedByDifficulty: { easy: count(own.easySolved), medium: count(own.mediumSolved), hard: count(own.hardSolved) },
  };
}

/** Language and test counts from the student's most recent run, only when that run was judged. */
function lastRunDetails(attempt) {
  if (!attempt) return {};
  const total = count(attempt.total);
  return {
    language: attempt.language || null,
    ...(total > 0 ? { passedTests: Math.min(total, count(attempt.passed)), totalTests: total } : {}),
  };
}

const PREVIEW_SKIP = /^\s*(#include|import\s|from\s+\S+\s+import|using\s+namespace|package\s|#!|\/\/\s*@|'use strict'|"use strict")/;

/**
 * A few meaningful lines of the student's own last code for the resume card. Boilerplate headers
 * are skipped, lines are capped in width, and nothing is returned for empty or binary-looking input.
 */
export function codePreviewLines(source, maxLines = 6, maxWidth = 72) {
  const text = String(source || '');
  if (!text.trim() || text.includes('\u0000')) return null;
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  let start = lines.findIndex((line) => line.trim() && !PREVIEW_SKIP.test(line));
  if (start < 0) start = 0;
  const preview = lines.slice(start).filter((line, index, all) => line.trim() || (index > 0 && all[index - 1].trim()))
    .slice(0, maxLines).map((line) => (line.length > maxWidth ? `${line.slice(0, maxWidth - 1)}…` : line).replace(/\s+$/, ''));
  while (preview.length && !preview[preview.length - 1].trim()) preview.pop();
  return preview.length ? { lines: preview, startLine: start + 1 } : null;
}

/** Only the newest resume item needs code, so one indexed lookup replaces carrying source for all. */
async function attachCodePreview(item, studentId) {
  const match = /^\/problems\/([a-f\d]{24})$/i.exec(item?.href || '');
  if (!item || item.type !== 'coding' || item.status !== 'in_progress' || !match) return item;
  try {
    const latest = await Submission.findOne({ user: studentId, problem: objectId(match[1]), assessmentId: null })
      .sort({ createdAt: -1, _id: -1 }).select('sourceCode language').maxTimeMS(QUERY_TIMEOUT_MS).lean();
    const preview = codePreviewLines(latest?.sourceCode);
    return preview ? { ...item, codePreview: { ...preview, language: latest.language || item.language || null } } : item;
  } catch {
    return item; // The preview is decoration; the resume card still works without it.
  }
}

async function codingResumeItems(studentId) {
  const [attempts, visits] = await Promise.all([
    aggregate(Submission, [
      { $match: { user: studentId, assessmentId: null } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$problem', updatedAt: { $first: '$createdAt' }, status: { $first: '$status' }, language: { $first: '$language' }, passed: { $first: '$passedTestCases' }, total: { $first: '$totalTestCases' }, solved: { $max: { $cond: [{ $and: [{ $eq: ['$mode', 'submit'] }, acceptedExpression] }, 1, 0] } } } },
      { $match: { solved: 0 } }, { $sort: { updatedAt: -1, _id: 1 } }, { $limit: 12 },
    ]),
    StudentProblemView.find({ studentId, source: { $ne: 'shared' } }).sort({ lastViewedAt: -1, _id: 1 }).limit(12).select('problemId lastViewedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
  ]);
  const ids = [...new Set([...attempts.map((row) => String(row._id)), ...visits.map((row) => String(row.problemId))])].map(objectId);
  if (!ids.length) return [];
  const [problems, accepted] = await Promise.all([
    Problem.find({ _id: { $in: ids }, ...publicProblemMatch }).select('title difficulty').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
    Submission.distinct('problem', { user: studentId, problem: { $in: ids }, mode: 'submit', status: { $in: ACCEPTED } }).maxTimeMS(QUERY_TIMEOUT_MS),
  ]);
  const solved = new Set(accepted.map(String));
  const problemMap = new Map(problems.map((row) => [String(row._id), row]));
  const attemptMap = new Map(attempts.map((row) => [String(row._id), row]));
  const visitMap = new Map(visits.map((row) => [String(row.problemId), row]));
  return ids.flatMap((id) => {
    const key = String(id);
    const problem = problemMap.get(key);
    if (!problem || solved.has(key)) return [];
    const attempt = attemptMap.get(key);
    const visit = visitMap.get(key);
    return [{
      id: `coding:${key}`, type: 'coding', title: problem.title, subtitle: `${problem.difficulty} · Coding practice`,
      difficulty: problem.difficulty, href: `/problems/${key}`,
      updatedAt: visit && (!attempt || new Date(visit.lastViewedAt) > new Date(attempt.updatedAt)) ? visit.lastViewedAt : attempt.updatedAt,
      progressPercent: count(attempt?.total) > 0 ? Math.min(99, Math.round((count(attempt.passed) / count(attempt.total)) * 100)) : null,
      status: attempt ? 'in_progress' : 'viewed', lastVerdict: attempt?.status || null,
      ...lastRunDetails(attempt),
    }];
  });
}

async function sharedCodingResumeItems(studentId, sharedCatalog) {
  if (!sharedCatalog.length) return [];
  const [attempts, visits] = await Promise.all([
    aggregate(QuestionPracticeAttempt, [
      { $match: { studentId, source: 'shared', questionType: 'coding', questionId: { $in: sharedCatalog.map((row) => objectId(row._id)) } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$questionId', updatedAt: { $first: '$createdAt' }, result: { $first: '$result' }, language: { $first: '$language' }, passed: { $first: '$passedTestCases' }, total: { $first: '$totalTestCases' }, solved: { $max: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } } } },
      { $match: { solved: 0 } }, { $sort: { updatedAt: -1, _id: 1 } }, { $limit: 12 },
    ]),
    StudentProblemView.find({ studentId, source: 'shared' }).sort({ lastViewedAt: -1, _id: 1 }).limit(12).select('problemId lastViewedAt').maxTimeMS(QUERY_TIMEOUT_MS).lean(),
  ]);
  const catalog = new Map(sharedCatalog.map((question) => [String(question._id), question]));
  const candidateIds = [...new Set([...attempts.map((row) => String(row._id)), ...visits.map((row) => String(row.problemId))])];
  const accepted = candidateIds.length ? await QuestionPracticeAttempt.distinct('questionId', { studentId, source: 'shared', questionType: 'coding', questionId: { $in: candidateIds.map(objectId) }, result: 'correct' }).maxTimeMS(QUERY_TIMEOUT_MS) : [];
  const solved = new Set(accepted.map(String));
  const attemptMap = new Map(attempts.map((row) => [String(row._id), row]));
  const visitMap = new Map(visits.map((row) => [String(row.problemId), row]));
  return candidateIds.flatMap((key) => {
    const question = catalog.get(key);
    if (!question || solved.has(key)) return [];
    const attempt = attemptMap.get(key);
    const visit = visitMap.get(key);
    const difficulty = question.difficulty || question.questionData?.problemDataSnapshot?.difficulty || '';
    return [{ id: `coding:shared:${key}`, type: 'coding', title: question.questionData?.problemDataSnapshot?.title || question.questionText,
      subtitle: `${difficulty} · Shared coding practice`, difficulty, href: `/problems/shared/${key}`,
      updatedAt: visit && (!attempt || new Date(visit.lastViewedAt) > new Date(attempt.updatedAt)) ? visit.lastViewedAt : attempt.updatedAt,
      progressPercent: null, status: attempt ? 'in_progress' : 'viewed', lastVerdict: attempt ? (attempt.result === 'incorrect' ? 'WA' : 'PENDING') : null,
      ...lastRunDetails(attempt) }];
  });
}

async function suggestedPracticeItems(own, sharedCatalog, resumeItems = [], limit = 3) {
  const resumeHrefs = new Set(resumeItems.filter((item) => item.type === 'coding').map((item) => item.href));
  const resumedLocalIds = [...resumeHrefs].flatMap((href) => {
    const match = /^\/problems\/([a-f\d]{24})$/i.exec(href);
    return match ? [objectId(match[1])] : [];
  });
  const local = await aggregate(Problem, [
    { $match: {
      ...publicProblemMatch,
      _id: { $nin: [...(own.acceptedProblemIds || []).filter(Boolean), ...resumedLocalIds] },
      difficulty: { $in: ['Easy', 'Medium', 'Hard'] },
    } },
    { $set: { difficultyPriority: { $switch: { branches: [
      { case: { $eq: ['$difficulty', 'Easy'] }, then: 0 },
      { case: { $eq: ['$difficulty', 'Medium'] }, then: 1 },
    ], default: 2 } } } },
    { $sort: { difficultyPriority: 1, title: 1, _id: 1 } },
    { $limit: limit }, { $project: { title: 1, difficulty: 1 } },
  ]);
  const acceptedShared = new Set(own.acceptedSharedQuestionIds || []);
  const candidates = local.map((problem) => ({
    id: `coding:university:${problem._id}`, type: 'coding', title: problem.title,
    difficulty: problem.difficulty, source: 'university', href: `/problems/${problem._id}`,
  }));
  for (const question of sharedCatalog) {
    if (acceptedShared.has(String(question._id)) || resumeHrefs.has(`/problems/shared/${question._id}`)) continue;
    const difficulty = String(question.difficulty || question.questionData?.problemDataSnapshot?.difficulty || '').toLowerCase();
    if (!['easy', 'medium', 'hard'].includes(difficulty)) continue;
    candidates.push({
      id: `coding:shared:${question._id}`, type: 'coding', source: 'shared',
      title: question.questionData?.problemDataSnapshot?.title || question.questionText,
      difficulty: difficulty === 'easy' ? 'Easy' : difficulty === 'medium' ? 'Medium' : 'Hard', href: `/problems/shared/${question._id}`,
    });
  }
  const difficultyOrder = { Easy: 0, Medium: 1, Hard: 2 };
  return candidates.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, limit);
}

export function buildLearningSubjectCards(accessibleTopics, completedTopicIds = [], limit = 3) {
  const completed = new Set(completedTopicIds.map(String));
  const subjects = new Map();
  for (const topic of accessibleTopics.values()) {
    const key = `${topic.semesterId}:${topic.subjectId}`;
    if (!subjects.has(key)) {
      const query = new URLSearchParams({ semesterId: topic.semesterId, subjectId: topic.subjectId });
      subjects.set(key, {
        id: `learning:${key}`, title: topic.subjectName, semesterName: topic.semesterName,
        coordinatorId: topic.coordinatorId, totalTopics: 0, completedTopics: 0, videoCount: 0, notesCount: 0, chapterIds: new Set(), nextTopic: null,
        href: `/student/learning/${encodeURIComponent(topic.semesterName)}/${encodeURIComponent(topic.subjectName)}/${encodeURIComponent(topic.coordinatorId)}?${query}`,
        state: { semesterId: topic.semesterId, subjectId: topic.subjectId, coordinatorId: topic.coordinatorId },
      });
    }
    const subject = subjects.get(key);
    subject.totalTopics += 1;
    subject.chapterIds.add(topic.chapterId);
    if (topic.hasVideo) subject.videoCount += 1;
    if (topic.hasNotes) subject.notesCount += 1;
    if (completed.has(topic.topicId)) subject.completedTopics += 1;
    // Curriculum order is preserved by the topic map, so the first unfinished topic is what comes next.
    else if (!subject.nextTopic) {
      const contentType = topic.hasVideo ? 'video' : 'topic';
      const query = new URLSearchParams({ semesterId: topic.semesterId, subjectId: topic.subjectId, topicId: topic.topicId, contentType });
      subject.nextTopic = {
        id: topic.topicId, title: topic.title || 'Untitled topic', chapterName: topic.chapterName || null, contentType,
        href: `/student/learning/${encodeURIComponent(topic.semesterName)}/${encodeURIComponent(topic.subjectName)}/${encodeURIComponent(topic.coordinatorId)}?${query}`,
      };
    }
  }
  const sectionOrder = (subject) => subject.completedTopics > 0 && subject.completedTopics < subject.totalTopics ? 0 : subject.completedTopics === 0 ? 1 : 2;
  const semesterNumber = (subject) => Number(String(subject.semesterName || '').match(/\d+/)?.[0]) || 0;
  return [...subjects.values()]
    .sort((a, b) => sectionOrder(a) - sectionOrder(b) || semesterNumber(b) - semesterNumber(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ chapterIds, ...subject }) => ({ ...subject, chapterCount: chapterIds.size, progressPercent: Math.round((subject.completedTopics / subject.totalTopics) * 100) }));
}

export async function getStudentDashboardData(student, now = new Date()) {
  const permissions = await dashboardPermissions(student);
  const [semesters, sharedCatalog] = await Promise.all([permissions.learning ? curriculum() : [], permissions.questions ? getSharedCodingCatalog() : []]);
  const accessibleTopics = buildCurriculumTopicMap(semesters, student);
  const [ownRows, totals, codingResume, learningProgress, sharedResume] = await Promise.all([
    loadProgressRows([student], permissions, semesters, now, sharedCatalog, true, true),
    permissions.questions ? aggregate(Problem, [{ $match: publicProblemMatch }, { $group: { _id: '$difficulty', count: { $sum: 1 } } }]) : [],
    permissions.questions ? codingResumeItems(objectId(student._id)) : [],
    permissions.learning ? Progress.find({ studentId: student._id, completed: { $ne: true }, topicId: { $in: [...accessibleTopics.keys()].map(objectId) } }).sort({ lastAccessedAt: -1, _id: 1 }).limit(20).select('topicId completed videoWatchedSeconds videoDuration lastAccessedAt updatedAt lastViewedContentType').maxTimeMS(QUERY_TIMEOUT_MS).lean() : [],
    permissions.questions ? sharedCodingResumeItems(objectId(student._id), sharedCatalog) : [],
  ]);
  const own = ownRows[0] || {};
  const activityByDate = own.activityByDate || {};
  const totalsByDifficulty = codingTotals(totals, sharedCatalog);
  const topics = buildCurriculumTopicMap(semesters, student);
  const learningResume = learningProgress.map((row) => learningResumeItem(row, topics.get(String(row.topicId))));
  const ranking = await rankOwnProgress(student, own, now);
  const resumeItems = combineResumeItems([...codingResume, ...sharedResume, ...learningResume]);
  if (resumeItems[0]) resumeItems[0] = await attachCodePreview(resumeItems[0], objectId(student._id));
  const suggestedPractice = permissions.questions ? await suggestedPracticeItems(own, sharedCatalog, resumeItems) : [];
  const learningSubjects = permissions.learning ? buildLearningSubjectCards(accessibleTopics, own.completedTopicIds) : [];
  return {
    coding: permissions.questions ? {
      totalSolved: count(own.easySolved) + count(own.mediumSolved) + count(own.hardSolved),
      totalProblems: Object.values(totalsByDifficulty).reduce((sum, total) => sum + total, 0), totalsByDifficulty,
      easySolved: count(own.easySolved), mediumSolved: count(own.mediumSolved), hardSolved: count(own.hardSolved),
      // The one streak students see: the Prep Streak (daily challenges completed in a row).
      attemptedProblems: count(own.attemptedProblems), streak: await prepStreakView(student, activityByDate, now), activity: activityByDate,
    } : null,
    learning: permissions.learning ? { completedTopics: count(own.completedTopics), totalTopics: count(own.totalTopics), completionPercent: own.totalTopics > 0 ? Math.round((own.completedTopics / own.totalTopics) * 100) : 0 } : null,
    activityByDate, ranking,
    resumeItems, generatedAt: now.toISOString(),
    suggestedPractice, learningSubjects,
  };
}

export { publicProblemMatch };
