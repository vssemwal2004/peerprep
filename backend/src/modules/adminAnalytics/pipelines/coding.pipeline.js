import mongoose from 'mongoose';
import Problem from '../../../models/Problem.js';
import Submission from '../../../models/Submission.js';
import { authorizedOwnedFilter } from '../adminAnalytics.authorization.js';
import { ANALYTICS_LIMITS } from '../adminAnalytics.validation.js';

const TERMINAL_STATUSES = ['AC', 'WA', 'TLE', 'RE', 'CE'];

function normalizeTopic(value) {
  return String(value || '').trim();
}

export async function collectCodingEvidence({ user, studentIds, query }) {
  const problemFilter = authorizedOwnedFilter(user);
  if (query.coding.problemIds.length) problemFilter._id = { $in: query.coding.problemIds };
  if (query.coding.topics.length) problemFilter.tags = { $in: query.coding.topics.map((topic) => new RegExp(`^${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) };
  if (query.coding.difficulties.length) problemFilter.difficulty = { $in: query.coding.difficulties };
  const problems = await Problem.find(problemFilter)
    .select('_id title difficulty tags topicIds category')
    .limit(10000)
    .lean();
  const problemIds = problems.map((problem) => problem._id);
  if (!studentIds.length || !problemIds.length) return emptyCoding(problems.length);

  const match = {
    user: { $in: studentIds },
    problem: { $in: problemIds },
    mode: 'submit',
    status: { $in: query.coding.statuses.length ? query.coding.statuses.filter((status) => TERMINAL_STATUSES.includes(status)) : TERMINAL_STATUSES },
    createdAt: { $gte: query.date.from, $lte: query.date.to },
  };
  if (!match.status.$in.length) return emptyCoding(problems.length);
  if (query.coding.languages.length) match.language = { $in: query.coding.languages };
  if (query.coding.assessmentIds.length) match.assessmentId = { $in: query.coding.assessmentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (query.coding.context === 'practice') match.assessmentId = null;
  if (query.coding.context === 'assessment' && !query.coding.assessmentIds.length) match.assessmentId = { $exists: true, $ne: null };

  const rows = await Submission.find(match)
    .select('_id user problem assessmentId status language createdAt executionTimeMs')
    .sort({ createdAt: -1, _id: -1 })
    .limit(ANALYTICS_LIMITS.maxInteractiveRows + 1)
    .lean();
  const truncated = rows.length > ANALYTICS_LIMITS.maxInteractiveRows;
  const submissions = rows.slice(0, ANALYTICS_LIMITS.maxInteractiveRows);
  const problemById = new Map(problems.map((problem) => [String(problem._id), problem]));
  const perStudent = new Map();
  const topicStats = new Map();
  const difficultyStats = new Map();
  const problemStats = new Map();
  const activity = [];

  for (const row of submissions) {
    const studentId = String(row.user);
    const problemId = String(row.problem);
    const problem = problemById.get(problemId);
    if (!problem) continue;
    const accepted = row.status === 'AC';
    const student = perStudent.get(studentId) || { attempts: 0, acceptedAttempts: 0, attemptedProblems: new Set(), solvedProblems: new Set(), activeDays: new Set() };
    student.attempts += 1;
    student.acceptedAttempts += accepted ? 1 : 0;
    student.attemptedProblems.add(problemId);
    if (accepted) student.solvedProblems.add(problemId);
    student.activeDays.add(row.createdAt.toISOString().slice(0, 10));
    perStudent.set(studentId, student);
    activity.push({ studentId, at: row.createdAt, kind: accepted ? 'solved' : 'attempted', problemId });

    const difficulty = problem.difficulty || 'Unknown';
    const diff = difficultyStats.get(difficulty) || { attempts: 0, accepted: 0, studentProblemPairs: new Map() };
    diff.attempts += 1;
    diff.accepted += accepted ? 1 : 0;
    diff.studentProblemPairs.set(`${studentId}:${problemId}`, (diff.studentProblemPairs.get(`${studentId}:${problemId}`) || false) || accepted);
    difficultyStats.set(difficulty, diff);

    const pstats = problemStats.get(problemId) || { problemId, title: problem.title || 'Untitled problem', attempts: 0, accepted: 0, students: new Set(), solvedStudents: new Set() };
    pstats.attempts += 1;
    pstats.accepted += accepted ? 1 : 0;
    pstats.students.add(studentId);
    if (accepted) pstats.solvedStudents.add(studentId);
    problemStats.set(problemId, pstats);

    const topics = (problem.tags || []).map(normalizeTopic).filter(Boolean);
    for (const topic of topics.length ? topics : ['Uncategorized']) {
      const stats = topicStats.get(topic) || { topic, attempts: 0, accepted: 0, problemIds: new Set(), students: new Set(), solvedStudents: new Set(), pairs: new Map(), difficulty: new Map() };
      stats.attempts += 1;
      stats.accepted += accepted ? 1 : 0;
      stats.problemIds.add(problemId);
      stats.students.add(studentId);
      if (accepted) stats.solvedStudents.add(studentId);
      const pairKey = `${studentId}:${problemId}`;
      stats.pairs.set(pairKey, (stats.pairs.get(pairKey) || false) || accepted);
      const topicDifficulty = stats.difficulty.get(difficulty) || { attempts: 0, accepted: 0 };
      topicDifficulty.attempts += 1;
      topicDifficulty.accepted += accepted ? 1 : 0;
      stats.difficulty.set(difficulty, topicDifficulty);
      topicStats.set(topic, stats);
    }
  }

  return { source: 'coding', problems, submissions, perStudent, topicStats, difficultyStats, problemStats, activity, truncated };
}

function emptyCoding(problemCount = 0) {
  return { source: 'coding', problems: [], problemCount, submissions: [], perStudent: new Map(), topicStats: new Map(), difficultyStats: new Map(), problemStats: new Map(), activity: [], truncated: false };
}
