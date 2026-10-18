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
import StudentUploadBatch from '../../models/StudentUploadBatch.js';
import Submission from '../../models/Submission.js';
import User from '../../models/User.js';
import { authorizedStudentBaseFilter } from '../adminAnalytics/adminAnalytics.authorization.js';
import { indexProblemMeta } from './studentRows.js';

export const GRADED_STATUSES = ['AC', 'WA', 'TLE', 'RE', 'CE'];
export const FACT_LIMITS = Object.freeze({ maxCohort: 50000, maxQueryMs: 30000, inListLimit: 5000 });

export async function loadCohort(user) {
  const students = await User.find(authorizedStudentBaseFilter(user))
    .select('_id name email studentId semester group branch course college teacherIds uploadBatchIds isActive')
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

const countStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

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
