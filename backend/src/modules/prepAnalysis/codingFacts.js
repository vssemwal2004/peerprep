// Loads the cohort and its Prep Coding evidence for a period.
//
// Submissions are grouped inside MongoDB, never streamed raw:
//   pairs: one row per (student, problem, language) with attempt and verdict counts
//   days:  one row per (student, day) with attempt and accepted counts
// That keeps memory proportional to distinct work done, not to resubmissions,
// so a university with a million submissions still answers in one pass.

import mongoose from 'mongoose';
import CodingTopic from '../../models/CodingTopic.js';
import Problem from '../../models/Problem.js';
import QuestionPracticeAttempt from '../../models/QuestionPracticeAttempt.js';
import StudentUploadBatch from '../../models/StudentUploadBatch.js';
import Submission from '../../models/Submission.js';
import User from '../../models/User.js';
import { authorizedStudentBaseFilter } from '../adminAnalytics/adminAnalytics.authorization.js';
import { indexProblemMeta } from './studentRows.js';

export const GRADED_STATUSES = ['AC', 'WA', 'TLE', 'RE', 'CE'];
export const FACT_LIMITS = Object.freeze({ maxCohort: 50000, maxQueryMs: 30000, inListLimit: 5000 });

export async function loadCohort(user) {
  const students = await User.find(authorizedStudentBaseFilter(user))
    .select('_id name email studentId semester group section branch course college teacherIds uploadBatchIds isActive')
    .sort({ name: 1, _id: 1 })
    .limit(FACT_LIMITS.maxCohort + 1)
    .lean();
  const truncated = students.length > FACT_LIMITS.maxCohort;
  const cohort = students.slice(0, FACT_LIMITS.maxCohort);
  const batchIds = [...new Set(cohort.flatMap((student) => (student.uploadBatchIds || []).map(String)))];
  const batches = batchIds.length
    ? await StudentUploadBatch.find({ _id: { $in: batchIds } }).select('_id name').lean()
    : [];
  return { students: cohort, truncated, batchNames: new Map(batches.map((batch) => [String(batch._id), batch.name])) };
}

function submissionMatch({ studentIds, range }) {
  const match = { mode: 'submit', status: { $in: GRADED_STATUSES } };
  // A short id list is pushed into the query; a large cohort (usually "all
  // students") is filtered after grouping, which is cheaper than a huge $in.
  if (studentIds.length <= FACT_LIMITS.inListLimit) {
    match.user = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (range.from || range.to) {
    match.createdAt = {};
    if (range.from) match.createdAt.$gte = range.from;
    if (range.to) match.createdAt.$lte = range.to;
  }
  return match;
}

/**
 * When one student first tried, first solved and last tried each problem in the period:
 * Map(problemId -> { firstAt, firstAcceptedAt, lastAt }). One student's submissions only.
 */
export async function loadProblemTimes({ studentId, range }) {
  const rows = await Submission.aggregate([
    { $match: submissionMatch({ studentIds: [studentId], range }) },
    { $group: {
      _id: '$problem',
      firstAt: { $min: '$createdAt' },
      lastAt: { $max: '$createdAt' },
      firstAcceptedAt: { $min: { $cond: [{ $eq: ['$status', 'AC'] }, '$createdAt', null] } },
    } },
  ]).option({ maxTimeMS: FACT_LIMITS.maxQueryMs });
  return new Map(rows.map((row) => [String(row._id), { firstAt: row.firstAt, firstAcceptedAt: row.firstAcceptedAt, lastAt: row.lastAt }]));
}

const countStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

/**
 * Each student's FIRST accepted practice solve of each question, with how they worked on it
 * (Submission for library problems, QuestionPracticeAttempt for shared questions):
 * Map(studentId -> [{ key: 'local:<problemId>' | 'shared:<questionId>', at, effort | null }]).
 * The first solve is used on purpose: re-solving a problem already solved before tracking existed
 * is quick for honest reasons, so such a question is "not tracked", never "needs review".
 * All-time on purpose too; solves outside the period are dropped by the caller.
 */
export async function loadSolveEfforts({ studentIds, includeShared = true }) {
  const byStudent = new Map();
  if (!studentIds.length) return byStudent;
  const cohort = new Set(studentIds);
  const ids = studentIds.length <= FACT_LIMITS.inListLimit ? studentIds.map((id) => new mongoose.Types.ObjectId(id)) : null;
  const [local, shared] = await Promise.all([
    Submission.aggregate([
      { $match: { mode: 'submit', status: 'AC', assessmentId: null, ...(ids ? { user: { $in: ids } } : {}) } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: { user: '$user', problem: '$problem' }, at: { $first: '$createdAt' }, effort: { $first: '$effort' } } },
    ]).option({ maxTimeMS: FACT_LIMITS.maxQueryMs, allowDiskUse: true }),
    includeShared ? QuestionPracticeAttempt.aggregate([
      { $match: { source: 'shared', questionType: 'coding', result: 'correct', ...(ids ? { studentId: { $in: ids } } : {}) } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: { user: '$studentId', problem: '$questionId' }, at: { $first: '$createdAt' }, effort: { $first: '$effort' } } },
    ]).option({ maxTimeMS: FACT_LIMITS.maxQueryMs, allowDiskUse: true }) : [],
  ]);
  for (const [prefix, rows] of [['local', local], ['shared', shared]]) {
    for (const row of rows) {
      const studentId = String(row._id.user);
      if (!cohort.has(studentId)) continue;
      const list = byStudent.get(studentId) || [];
      list.push({ key: `${prefix}:${row._id.problem}`, problemId: String(row._id.problem), at: row.at, effort: row.effort || null });
      byStudent.set(studentId, list);
    }
  }
  return byStudent;
}

/**
 * One student's latest practice submissions (library problems and shared questions), newest
 * first, with how they worked on each: the drawer's submission history.
 */
export async function loadSubmissionLog({ studentId, range, limit = 60 }) {
  const user = new mongoose.Types.ObjectId(String(studentId));
  const when = range?.from || range?.to
    ? { createdAt: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } }
    : {};
  const [local, shared] = await Promise.all([
    Submission.find({ user, mode: 'submit', status: { $in: GRADED_STATUSES }, assessmentId: null, ...when })
      .select('problem problemSnapshot language status createdAt effort').sort({ createdAt: -1 }).limit(limit).maxTimeMS(FACT_LIMITS.maxQueryMs).lean(),
    QuestionPracticeAttempt.find({ studentId: user, source: 'shared', questionType: 'coding', ...when })
      .select('questionId language result failureStatus createdAt effort').sort({ createdAt: -1 }).limit(limit).maxTimeMS(FACT_LIMITS.maxQueryMs).lean(),
  ]);
  return [
    ...local.map((row) => ({
      key: `local:${row.problem}`, problemId: String(row.problem), title: row.problemSnapshot?.title || 'Problem', difficulty: row.problemSnapshot?.difficulty || '',
      status: row.status, language: row.language || '', at: row.createdAt, effort: row.effort || null,
    })),
    ...shared.map((row) => ({
      key: `shared:${row.questionId}`, problemId: String(row.questionId), title: '', difficulty: '',
      status: row.result === 'correct' ? 'AC' : row.failureStatus || 'WA', language: row.language || '', at: row.createdAt, effort: row.effort || null,
    })),
  ].sort((left, right) => new Date(right.at) - new Date(left.at)).slice(0, limit);
}

export async function loadCodingFacts({ studentIds, range }) {
  const cohort = new Set(studentIds);
  const empty = { byStudent: new Map(), days: new Map(), problems: new Map(), topics: new Map() };
  if (!studentIds.length) return empty;
  const match = submissionMatch({ studentIds, range });

  const [pairs, days] = await Promise.all([
    Submission.aggregate([
      { $match: match },
      { $group: {
        _id: { user: '$user', problem: '$problem', language: '$language' },
        attempts: { $sum: 1 },
        accepted: countStatus('AC'),
        wa: countStatus('WA'), tle: countStatus('TLE'), re: countStatus('RE'), ce: countStatus('CE'),
      } },
    ]).option({ maxTimeMS: FACT_LIMITS.maxQueryMs, allowDiskUse: true }),
    Submission.aggregate([
      { $match: match },
      { $group: {
        _id: { user: '$user', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
        attempts: { $sum: 1 },
        accepted: countStatus('AC'),
      } },
    ]).option({ maxTimeMS: FACT_LIMITS.maxQueryMs, allowDiskUse: true }),
  ]);

  const byStudent = new Map();
  const problemIds = new Set();
  for (const row of pairs) {
    const studentId = String(row._id.user);
    if (!cohort.has(studentId)) continue;
    const problemId = String(row._id.problem);
    problemIds.add(problemId);
    const list = byStudent.get(studentId) || [];
    list.push({
      problemId,
      language: row._id.language || 'unknown',
      attempts: row.attempts,
      accepted: row.accepted,
      verdicts: { AC: row.accepted, WA: row.wa, TLE: row.tle, RE: row.re, CE: row.ce },
    });
    byStudent.set(studentId, list);
  }

  const dayMap = new Map();
  for (const row of days) {
    const studentId = String(row._id.user);
    if (!cohort.has(studentId)) continue;
    const studentDays = dayMap.get(studentId) || new Map();
    studentDays.set(row._id.day, { attempts: row.attempts, accepted: row.accepted });
    dayMap.set(studentId, studentDays);
  }

  const { problems, topics } = await loadProblemMeta([...problemIds]);
  return { byStudent, days: dayMap, problems, topics };
}

/** Problem difficulty, topics (with their ancestors), tags and companies, by id. */
export async function loadProblemMeta(problemIds) {
  if (!problemIds.length) return { problems: new Map(), topics: new Map() };
  const docs = await Problem.find({ _id: { $in: problemIds } })
    .select('_id title difficulty tags topicIds topicAncestorIds companyTags')
    .lean();
  const topicIds = new Set(docs.flatMap((doc) => [...(doc.topicIds || []), ...(doc.topicAncestorIds || [])].map(String)));
  const topicDocs = topicIds.size
    ? await CodingTopic.find({ _id: { $in: [...topicIds] } }).select('_id name parentId').lean()
    : [];
  const topics = new Map(topicDocs.map((topic) => [String(topic._id), { id: String(topic._id), name: topic.name, parentId: topic.parentId ? String(topic.parentId) : null }]));
  const problems = new Map(docs.map((doc) => {
    const ownTopicIds = (doc.topicIds || []).map(String).filter((id) => topics.has(id));
    const allTopicIds = [...new Set([...ownTopicIds, ...(doc.topicAncestorIds || []).map(String)])].filter((id) => topics.has(id));
    return [String(doc._id), {
      id: String(doc._id),
      title: doc.title || 'Untitled problem',
      difficulty: doc.difficulty || 'Unknown',
      topicIds: ownTopicIds,
      topics: allTopicIds.map((id) => topics.get(id).name),
      tags: (doc.tags || []).map((tag) => String(tag).trim()).filter(Boolean),
      companies: (doc.companyTags || []).map((company) => String(company).trim()).filter(Boolean),
    }];
  }));
  return { problems: indexProblemMeta(problems), topics };
}
