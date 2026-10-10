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
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Semester from '../models/Subject.js';
import { learningSemesters, sharedQuestions } from '../platform/sharedContent.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';

const DAY_MS = 86_400_000;
const QUERY_TIMEOUT_MS = 8_000;
const ACCEPTED = ['AC', 'ACCEPTED', 'ACCEPT'];
const rankCache = new Map();
const rankLoads = new Map();
const cacheLifetimeMs = 30_000;
let challengeRankRevision = 0;
export function invalidateChallengeRanking() {
  challengeRankRevision += 1;
  rankCache.clear();
}
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

function learnerLevel({ solved, streak, assessmentScore, interviewScore, challengePoints = 0 }) {
  const score = solved * 0.5 + streak * 1.75 + assessmentScore * 0.35 + interviewScore * 0.2 + challengePoints * 0.1;
  if (solved >= 260 || score >= 220) return { level: 6, title: 'Elite Coder' };
  if (solved >= 180 || score >= 170) return { level: 5, title: 'Problem Master' };
  if (streak >= 21 || score >= 135) return { level: 4, title: 'Skill Champion' };
  if (solved >= 80 || assessmentScore >= 70 || score >= 100) return { level: 3, title: 'Consistent Performer' };
  if (solved >= 30 || streak >= 7 || score >= 65) return { level: 2, title: 'Quick Solver' };
  return { level: 1, title: 'Rising Learner' };
}

// The acknowledgement endpoint is cosmetic; none of its client-reported awards enters ranking.
export function scoreStudentProgress(metrics = {}, now = new Date()) {
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
    solvedCount: solved, streak: streak.current, assessmentScore: nullableScore(metrics.assessmentScore), interviewScore: count(metrics.interviewScore),
    challengePoints: count(metrics.challengePoints),
  };
  const earned = [
    ['first-accept', badgeMetrics.solved >= 1], ['solver-10', badgeMetrics.solved >= 10], ['solver-50', badgeMetrics.solved >= 50],
    ['hard-1', badgeMetrics.hardSolved >= 1], ['streak-7', badgeMetrics.bestStreak >= 7], ['streak-30', badgeMetrics.bestStreak >= 30],
    ['active-30', badgeMetrics.activeDays >= 30], ['polyglot', badgeMetrics.languages >= 3],
    ['assessment-1', badgeMetrics.assessments >= 1], ['interview-1', badgeMetrics.interviews >= 1],
  ].filter(([, qualifies]) => qualifies).map(([id]) => id);
  const verifiedProgress = solved > 0 || count(metrics.completedTopics) > 0 || count(metrics.assessmentsCompleted) > 0 || count(metrics.interviews) > 0 || levelMetrics.challengePoints > 0;
  const scoreBreakdown = {
    coding: easy * 10 + medium * 20 + hard * 30,
    learning: count(metrics.completedTopics) * 5,
    assessments: Math.round(count(metrics.assessmentPoints)),
    badges: verifiedProgress ? earned.length * 25 : 0,
    challenges: levelMetrics.challengePoints,
  };
  return {
    score: Object.values(scoreBreakdown).reduce((sum, points) => sum + points, 0),
    scoreBreakdown,
    earnedBadges: earned.length + count(metrics.challengeBadges),
    milestoneBadges: earned.length,
    challengeBadges: count(metrics.challengeBadges),
    badgeMetrics, levelMetrics,
    level: learnerLevel({ solved: levelMetrics.solvedCount, streak: levelMetrics.streak, assessmentScore: levelMetrics.assessmentScore ?? 0, interviewScore: levelMetrics.interviewScore, challengePoints: levelMetrics.challengePoints }),
    hasProgress: verifiedProgress,
  };
}

export function rankStudentProgress(rows, studentId, universityName, now = new Date()) {
  const scored = rows.map((row) => ({ studentId: String(row.studentId), ...(row.rankingSummary || scoreStudentProgress(row, now)) }));
  const own = scored.find((row) => row.studentId === String(studentId));
  const base = {
    rank: null, totalStudents: rows.length, universityName: universityName || '', score: 0,
    percentile: null, level: { level: 1, title: 'Rising Learner' }, earnedBadges: 0,
    scoreBreakdown: { coding: 0, learning: 0, assessments: 0, badges: 0, challenges: 0 }, hasProgress: false, tied: false,
    milestoneBadges: 0, challengeBadges: 0,
    badgeMetrics: { solved: 0, hardSolved: 0, bestStreak: 0, activeDays: 0, languages: 0, assessments: 0, interviews: 0 },
    levelMetrics: { solvedCount: 0, streak: 0, assessmentScore: null, interviewScore: 0, challengePoints: 0 },
    methodology: 'Distinct accepted problems: Easy 10, Medium 20, Hard 30 points. Completed topics: 5 points. Submitted assessments: up to 100 points each. Milestone badges: 25 points each. Challenge bonuses: daily 10, weekly 40, monthly 150 points, awarded once per edition without extra badge points. Equal points share a rank.',
  };
  if (!own) return base;
  const { studentId: ignored, ...progress } = own;
  if (!own.hasProgress || !universityName) return { ...base, ...progress, totalStudents: universityName ? rows.length : 0 };
  const higher = scored.filter((row) => row.score > own.score).length;
  const lower = scored.filter((row) => row.score < own.score).length;
  return {
    ...base, ...progress, rank: higher + 1,
    percentile: scored.length > 1 ? Math.round((lower / (scored.length - 1)) * 100) : 100,
    tied: scored.some((row) => row.studentId !== String(studentId) && row.score === own.score),
  };
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

function refreshRankingRows(rows, own, student) {
  if (student.isActive === false || student.accessScope === 'assessment_only') return rows;
  return [...rows.filter((row) => row.studentId !== String(student._id)), own];
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

async function loadProgressRows(students, permissions, semesters, now, sharedCatalog = [], includeActivity = true, includeDiscovery = false) {
  const ids = students.map((student) => objectId(student._id));
  if (!ids.length) return [];
  const curriculumTopicIds = permissions.learning ? [...buildCurriculumTopicMap(semesters).keys()].map(objectId) : [];
  const [coding, learning, assessments, interviews, activities, sharedCoding, challenges] = await Promise.all([
    permissions.questions ? aggregate(Submission, [
      { $match: { user: { $in: ids }, mode: 'submit' } },
      { $group: { _id: { studentId: '$user', problem: '$problem' }, accepted: { $max: { $cond: [acceptedExpression, 1, 0] } }, languages: { $addToSet: '$language' } } },
      ...publicCodingProblemStages('_id.problem'),
      { $group: { _id: '$_id.studentId', attemptedProblems: { $sum: 1 }, easySolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Easy'] }] }, 1, 0] } }, mediumSolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Medium'] }] }, 1, 0] } }, hardSolved: { $sum: { $cond: [{ $and: [{ $eq: ['$accepted', 1] }, { $eq: ['$codingProblem.difficulty', 'Hard'] }] }, 1, 0] } }, languageSets: { $push: '$languages' },
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
      { $group: { _id: '$studentId', assessmentsCompleted: { $sum: 1 }, assessmentPoints: { $sum: '$percentage' }, assessmentScore: { $avg: '$percentage' } } },
    ]) : [],
    permissions.events ? aggregate(Feedback, [{ $match: { to: { $in: ids } } }, { $group: { _id: '$to', interviews: { $sum: 1 }, interviewScore: { $avg: '$marks' } } }]) : [],
    includeActivity ? getActivityRows(ids, permissions, now) : new Map(),
    permissions.questions && sharedCatalog.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { studentId: { $in: ids }, source: 'shared', questionType: 'coding', questionId: { $in: sharedCatalog.map((row) => objectId(row._id)) } } },
      { $group: { _id: { studentId: '$studentId', questionId: '$questionId' }, accepted: { $max: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } }, languages: { $addToSet: '$language' } } },
    ]) : [],
    aggregate(StudentChallenge, [{ $match: { studentId: { $in: ids }, earnedAt: { $ne: null } } }, { $group: { _id: '$studentId', challengePoints: { $sum: '$rewardPoints' }, challengeBadges: { $sum: { $cond: [{ $in: ['$kind', ['weekly', 'monthly']] }, 1, 0] } } } }]),
  ]);
  const maps = [coding, assessments, interviews].map((source) => new Map(source.map((entry) => [String(entry._id), entry])));
  const challengeMap = new Map(challenges.map((entry) => [String(entry._id), entry]));
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
      if (entry.accepted && ['easy', 'medium', 'hard'].includes(difficulty)) codingRow[`${difficulty}Solved`] = count(codingRow[`${difficulty}Solved`]) + 1;
      if (includeDiscovery && entry.accepted) acceptedSharedQuestionIds.push(String(entry._id.questionId));
      entry.languages.filter(Boolean).forEach((language) => languages.add(language));
    }
    const topics = permissions.learning ? buildCurriculumTopicMap(semesters, student) : new Map();
    const completedTopicIds = [...(completedByStudent.get(id) || [])].filter((topicId) => topics.has(topicId));
    const completedTopics = completedTopicIds.length;
    return {
      studentId: id, ...codingRow, ...maps[1].get(id), ...maps[2].get(id), ...challengeMap.get(id),
      languages: languages.size,
      completedTopics, totalTopics: topics.size, activityByDate: activities.get(id) || {},
      ...(includeDiscovery ? { completedTopicIds, acceptedSharedQuestionIds } : {}),
    };
  });
}

async function loadRankRows(student, permissions, semesters, now, sharedCatalog = []) {
  const scope = universityCohort(student);
  if (!scope) return { rows: [], universityName: '' };
  const universityName = String(student.college || (isUniversity() ? process.env.PEERPREP_UNIVERSITY_NAME || process.env.PEERPREP_UNIVERSITY_ID : '')).trim();
  const key = JSON.stringify({ scope, permissions, challenges: challengeRankRevision, shared: sharedCatalog.map((row) => [String(row._id), row.difficulty]) });
  const cached = rankCache.get(key);
  if (cached && now.getTime() - cached.at < cacheLifetimeMs) return cached.value;
  if (rankLoads.has(key)) return rankLoads.get(key);
  const pending = (async () => {
    const students = await User.find(scope).select('_id semester').maxTimeMS(QUERY_TIMEOUT_MS).lean();
    const rows = await loadProgressRows(students, permissions, semesters, now, sharedCatalog);
    // Keep only compact scores and metrics for the cohort snapshot. Calendars are sorted once
    // here, rather than retained and recalculated for every student's dashboard request.
    const value = {
      rows: rows.map((row) => ({ studentId: row.studentId, rankingSummary: scoreStudentProgress(row, now) })),
      universityName,
    };
    if (rankCache.size >= 100) rankCache.delete(rankCache.keys().next().value);
    rankCache.set(key, { at: now.getTime(), value });
    return value;
  })().finally(() => rankLoads.delete(key));
  rankLoads.set(key, pending);
  return pending;
}

export async function getStudentUniversityRanking(student, permissions = null, now = new Date()) {
  const allowed = permissions || await dashboardPermissions(student);
  const [semesters, sharedCatalog] = await Promise.all([allowed.learning ? curriculum() : [], allowed.questions ? getSharedCodingCatalog() : []]);
  const [ownRows, { rows, universityName }] = await Promise.all([
    loadProgressRows([student], allowed, semesters, now, sharedCatalog),
    loadRankRows(student, allowed, semesters, now, sharedCatalog),
  ]);
  return rankStudentProgress(refreshRankingRows(rows, ownRows[0], student), student._id, universityName, now);
}

export async function getStudentCodingSummary(student, now = new Date()) {
  const sharedCatalog = await getSharedCodingCatalog();
  const [rows, totals] = await Promise.all([
    loadProgressRows([student], { questions: true }, [], now, sharedCatalog, false),
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

async function codingResumeItems(studentId) {
  const [attempts, visits] = await Promise.all([
    aggregate(Submission, [
      { $match: { user: studentId, assessmentId: null } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$problem', updatedAt: { $first: '$createdAt' }, status: { $first: '$status' }, passed: { $first: '$passedTestCases' }, total: { $first: '$totalTestCases' }, solved: { $max: { $cond: [{ $and: [{ $eq: ['$mode', 'submit'] }, acceptedExpression] }, 1, 0] } } } },
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
    }];
  });
}

async function sharedCodingResumeItems(studentId, sharedCatalog) {
  if (!sharedCatalog.length) return [];
  const [attempts, visits] = await Promise.all([
    aggregate(QuestionPracticeAttempt, [
      { $match: { studentId, source: 'shared', questionType: 'coding', questionId: { $in: sharedCatalog.map((row) => objectId(row._id)) } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$questionId', updatedAt: { $first: '$createdAt' }, result: { $first: '$result' }, solved: { $max: { $cond: [{ $eq: ['$result', 'correct'] }, 1, 0] } } } },
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
      progressPercent: null, status: attempt ? 'in_progress' : 'viewed', lastVerdict: attempt ? (attempt.result === 'incorrect' ? 'WA' : 'PENDING') : null }];
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
        coordinatorId: topic.coordinatorId, totalTopics: 0, completedTopics: 0,
        href: `/student/learning/${encodeURIComponent(topic.semesterName)}/${encodeURIComponent(topic.subjectName)}/${encodeURIComponent(topic.coordinatorId)}?${query}`,
        state: { semesterId: topic.semesterId, subjectId: topic.subjectId, coordinatorId: topic.coordinatorId },
      });
    }
    const subject = subjects.get(key);
    subject.totalTopics += 1;
    if (completed.has(topic.topicId)) subject.completedTopics += 1;
  }
  const sectionOrder = (subject) => subject.completedTopics > 0 && subject.completedTopics < subject.totalTopics ? 0 : subject.completedTopics === 0 ? 1 : 2;
  const semesterNumber = (subject) => Number(String(subject.semesterName || '').match(/\d+/)?.[0]) || 0;
  return [...subjects.values()]
    .sort((a, b) => sectionOrder(a) - sectionOrder(b) || semesterNumber(b) - semesterNumber(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((subject) => ({ ...subject, progressPercent: Math.round((subject.completedTopics / subject.totalTopics) * 100) }));
}

export async function getStudentDashboardData(student, now = new Date()) {
  const permissions = await dashboardPermissions(student);
  const [semesters, sharedCatalog] = await Promise.all([permissions.learning ? curriculum() : [], permissions.questions ? getSharedCodingCatalog() : []]);
  const accessibleTopics = buildCurriculumTopicMap(semesters, student);
  const [ownRows, rankData, totals, codingResume, learningProgress, sharedResume] = await Promise.all([
    loadProgressRows([student], permissions, semesters, now, sharedCatalog, true, true),
    loadRankRows(student, permissions, semesters, now, sharedCatalog),
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
  // Compute the current student fresh even while the cohort cache is still within its short TTL.
  const rankingRows = refreshRankingRows(rankData.rows, own, student);
  const resumeItems = combineResumeItems([...codingResume, ...sharedResume, ...learningResume]);
  const suggestedPractice = permissions.questions ? await suggestedPracticeItems(own, sharedCatalog, resumeItems) : [];
  const learningSubjects = permissions.learning ? buildLearningSubjectCards(accessibleTopics, own.completedTopicIds) : [];
  return {
    coding: permissions.questions ? {
      totalSolved: count(own.easySolved) + count(own.mediumSolved) + count(own.hardSolved),
      totalProblems: Object.values(totalsByDifficulty).reduce((sum, total) => sum + total, 0), totalsByDifficulty,
      easySolved: count(own.easySolved), mediumSolved: count(own.mediumSolved), hardSolved: count(own.hardSolved),
      attemptedProblems: count(own.attemptedProblems), streak: calculateActivityStreak(activityByDate, now), activity: activityByDate,
    } : null,
    learning: permissions.learning ? { completedTopics: count(own.completedTopics), totalTopics: count(own.totalTopics), completionPercent: own.totalTopics > 0 ? Math.round((own.completedTopics / own.totalTopics) * 100) : 0 } : null,
    activityByDate, ranking: rankStudentProgress(rankingRows, student._id, rankData.universityName, now),
    resumeItems, generatedAt: now.toISOString(),
    suggestedPractice, learningSubjects,
  };
}

export { publicProblemMatch };
