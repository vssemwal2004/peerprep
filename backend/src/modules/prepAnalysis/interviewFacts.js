// Loads Prep Interview evidence from this platform's own records:
//  - mock (peer) interviews: the interviewer's feedback to the student (Feedback.to),
//    interviews the student took as interviewer, and sessions still scheduled;
//  - AI interviews: started / completed receipts. Their scores live in the external
//    interview service and are not read here.
// A mock score is out of 100: detailed feedback (five 1-5 ratings) stores marks as
// the 5-25 sum, older feedback stored 0-100 directly.

import mongoose from 'mongoose';
import Feedback from '../../models/Feedback.js';
import Pair from '../../models/Pair.js';
import { InterviewEngagementReceipt } from '../../models/AdaptiveEngagement.js';
import { isUniversity } from '../../platform/deployment.js';
import { engagementTenant } from '../../services/engagementPolicyService.js';

export const RATINGS = Object.freeze([
  { key: 'communication', label: 'Communication' },
  { key: 'problemSolving', label: 'Problem solving' },
  { key: 'preparedness', label: 'Preparedness' },
  { key: 'attitude', label: 'Attitude' },
  { key: 'integrity', label: 'Integrity' },
]);
const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;
const MAX_ROWS = 200000;

/** A feedback row's marks out of 100. */
export function mockScore(feedback) {
  const marks = Number(feedback.marks) || 0;
  const detailed = Number(feedback.totalMarks) > 0 || (marks <= 25 && RATINGS.every(({ key }) => Number(feedback[key]) > 0));
  return Math.round(Math.max(0, Math.min(100, detailed ? (marks / 25) * 100 : marks)) * 10) / 10;
}

const windowOf = (range) => ((range.from || range.to) ? { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } : null);
const ids = (studentIds) => studentIds.map((id) => new mongoose.Types.ObjectId(id));

export async function loadInterviewFacts({ studentIds, range, peer = true, ai = true }) {
  const cohort = new Set(studentIds);
  const empty = () => ({ received: [], given: 0, scheduled: 0, aiStarted: 0, aiCompleted: 0, aiDays: [] });
  const byStudent = new Map();
  const own = (id) => {
    const key = String(id);
    if (!cohort.has(key)) return null;
    if (!byStudent.has(key)) byStudent.set(key, empty());
    return byStudent.get(key);
  };
  if (!studentIds.length) return { byStudent, peer, ai };
  const inList = studentIds.length <= IN_LIST_LIMIT;
  const window = windowOf(range);

  const [feedback, pairs, receipts] = await Promise.all([
    peer ? Feedback.find({ ...(inList ? { $or: [{ to: { $in: ids(studentIds) } }, { from: { $in: ids(studentIds) } }] } : {}), ...(window ? { createdAt: window } : {}) })
      .select('from to marks totalMarks communication problemSolving preparedness attitude integrity createdAt')
      .limit(MAX_ROWS).maxTimeMS(MAX_QUERY_MS).lean() : [],
    peer ? Pair.find({ status: { $in: ['pending', 'scheduled'] }, ...(inList ? { $or: [{ interviewer: { $in: ids(studentIds) } }, { interviewee: { $in: ids(studentIds) } }] } : {}) })
      .select('interviewer interviewee').limit(MAX_ROWS).maxTimeMS(MAX_QUERY_MS).lean() : [],
    ai ? InterviewEngagementReceipt.find({
      ...(isUniversity() ? { tenantKey: engagementTenant({}) } : {}),
      ...(inList ? { studentId: { $in: ids(studentIds) } } : {}),
      ...(window ? { $or: [{ createdAt: window }, { completedAt: window }] } : {}),
    }).select('studentId completedAt createdAt').limit(MAX_ROWS).maxTimeMS(MAX_QUERY_MS).lean() : [],
  ]);

  for (const row of feedback) {
    const student = own(row.to);
    if (student) {
      student.received.push({
        score: mockScore(row),
        at: row.createdAt,
        ratings: Object.fromEntries(RATINGS.map(({ key }) => [key, Number(row[key]) || null])),
      });
    }
    const interviewer = own(row.from);
    if (interviewer) interviewer.given += 1;
  }
  for (const pair of pairs) {
    for (const person of new Set([String(pair.interviewer), String(pair.interviewee)])) {
      const student = own(person);
      if (student) student.scheduled += 1;
    }
  }
  for (const receipt of receipts) {
    const student = own(receipt.studentId);
    if (!student) continue;
    student.aiStarted += 1;
    if (receipt.completedAt) {
      student.aiCompleted += 1;
      student.aiDays.push(receipt.completedAt);
    }
  }
  return { byStudent, peer, ai };
}
