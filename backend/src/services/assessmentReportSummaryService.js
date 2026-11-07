import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import AssessmentReportSummary from '../models/AssessmentReportSummary.js';
import User from '../models/User.js';
import { currentTenant } from '../platform/tenantContext.js';
import { studentFeatureQuery } from './studentFeatureAccess.js';
import {
  DEFAULT_PASS_PERCENTAGE, TERMINAL_STATUSES, FINISHED_STATUSES, assignedCountOf, attemptCountFields, emptyTally, finalizeCounts, passPercentageOf,
} from './assessmentAttemptCounts.js';

export const evaluatedAssessmentExpression = {
  $and: [
    { $in: ['$status', ['submitted', 'violation', 'expired']] },
    { $eq: [{ $ifNull: ['$evaluationStatus', 'completed'] }, 'completed'] },
    { $isNumber: '$score' },
  ],
};
export const evaluatedScoreExpression = { $cond: [evaluatedAssessmentExpression, '$score', null] };

// Per-assessment value inside one aggregation: `entries` = [[assessmentId, value]],
// anything else gets `fallback`. Keeps list/summary pipelines to one pass.
export function perAssessmentValue(entries, fallback) {
  if (!entries.length) return fallback;
  return { $let: {
    vars: { index: { $indexOfArray: [{ $literal: entries.map(([id]) => id) }, '$assessmentId'] } },
    in: { $cond: [{ $gte: ['$$index', 0] }, { $arrayElemAt: [{ $literal: entries.map(([, value]) => value) }, '$$index'] }, fallback] },
  } };
}

// Mirrors passPercentageOf (assessmentAttemptCounts): numeric setting clamped 0..100, else 40.
export const passPercentExpression = (path) => ({
  $cond: [{ $isNumber: path }, { $min: [100, { $max: [0, path] }] }, DEFAULT_PASS_PERCENTAGE],
});

/**
 * Mongo twin of assessmentAttemptCounts.addToTally: `$group` accumulators whose
 * output keys are exactly the tally keys, so finalizeCounts() turns a group row
 * into the canonical counts. Input docs need status, evaluationStatus, score,
 * maxMarks, isLate. `graded` may be a precomputed boolean field (then `score`
 * must already be null for ungraded rows); `passPercent`/`totalMarks` may be
 * numbers or expressions.
 */
export function attemptTallyFields({ graded = evaluatedAssessmentExpression, passPercent = DEFAULT_PASS_PERCENTAGE, totalMarks = 0 } = {}) {
  const countWhen = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const statusIs = (status) => ({ $eq: ['$status', status] });
  const gradedScore = { $cond: [graded, '$score', null] };
  const maxMarks = { $ifNull: ['$maxMarks', totalMarks] };
  const percent = { $cond: [
    { $and: [graded, { $gt: [maxMarks, 0] }] },
    { $round: [{ $min: [100, { $max: [0, { $multiply: [{ $divide: ['$score', maxMarks] }, 100] }] }] }, 2] },
    null,
  ] };
  const terminal = { $in: ['$status', [...TERMINAL_STATUSES]] };
  const finished = { $in: ['$status', [...FINISHED_STATUSES]] };
  return {
    docs: { $sum: 1 },
    inProgress: countWhen(statusIs('in_progress')),
    finished: countWhen(finished),
    submitted: countWhen(statusIs('submitted')),
    expired: countWhen(statusIs('expired')),
    violation: countWhen(statusIs('violation')),
    incomplete: countWhen(statusIs('incomplete')),
    graded: countWhen(graded),
    evaluating: countWhen({ $and: [terminal, { $eq: ['$evaluationStatus', 'processing'] }] }),
    failedEvaluation: countWhen({ $and: [terminal, { $eq: ['$evaluationStatus', 'failed'] }] }),
    passed: countWhen({ $and: [{ $ne: [percent, null] }, { $gte: [percent, passPercent] }] }),
    late: countWhen({ $and: [finished, { $eq: ['$isLate', true] }] }),
    scoreSum: { $sum: { $ifNull: [gradedScore, 0] } },
    minScore: { $min: gradedScore },
    maxScore: { $max: gradedScore },
    pctSum: { $sum: { $ifNull: [percent, 0] } },
    pctCount: countWhen({ $ne: [percent, null] }),
    minPct: { $min: percent },
    maxPct: { $max: percent },
  };
}

export const eligibleStudentsQuery = () => ({ role: 'student', accessScope: { $ne: 'assessment_only' }, ...studentFeatureQuery('assessments') });

/** Candidates known from the assignment (see finalizeCounts). One user count at most. */
export async function assignedCountForAssessment(assessment, eligibleCount = null) {
  if (!assessment) return 0;
  const needsEligible = assessment.targetType === 'all' && !assignedCountOf(assessment, 0);
  const eligible = needsEligible
    ? (eligibleCount ?? await User.countDocuments(eligibleStudentsQuery()).maxTimeMS(3000))
    : 0;
  return assignedCountOf(assessment, eligible);
}

export async function requestAssessmentReportRefresh(assessmentId, now = new Date()) {
  try {
    await AssessmentReportSummary.updateOne({ _id: assessmentId }, {
      $inc: { requestedVersion: 1 },
      $min: { nextRefreshAt: now },
    }, { upsert: true });
  } catch (error) {
    // Two first submissions may create the same coalesced refresh row together.
    if (error?.code !== 11000) throw error;
    await AssessmentReportSummary.updateOne({ _id: assessmentId }, {
      $inc: { requestedVersion: 1 }, $min: { nextRefreshAt: now },
    });
  }
}

// passPercentage / totalMarks: the assessment's own pass mark and max-marks fallback.
export function assessmentSummaryAggregation(assessmentId, { passPercentage = DEFAULT_PASS_PERCENTAGE, totalMarks = 0 } = {}) {
  const maxMarks = { $ifNull: ['$maxMarks', totalMarks] };
  const ratio = { $cond: [
    { $gt: [maxMarks, 0] },
    { $multiply: [{ $divide: ['$score', maxMarks] }, 100] }, 0,
  ] };
  const countWhen = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const gradedWhen = (condition) => ({ $and: [evaluatedAssessmentExpression, condition] });
  return [
    { $match: { assessmentId: new mongoose.Types.ObjectId(String(assessmentId)) } },
    { $project: { status: 1, evaluationStatus: 1, score: 1, maxMarks: 1, isLate: 1, startedAt: 1, tabSwitches: 1, fullscreenExits: 1, cameraFlags: 1, copyPasteCount: 1 } },
    { $group: {
      _id: null,
      // Canonical attempt tally (see assessmentAttemptCounts); finalized by the refresh.
      ...attemptTallyFields({ passPercent: passPercentage, totalMarks }),
      violationCount: { $sum: { $add: [
        { $ifNull: ['$tabSwitches', 0] }, { $ifNull: ['$fullscreenExits', 0] },
        { $ifNull: ['$cameraFlags', 0] }, { $ifNull: ['$copyPasteCount', 0] },
      ] } },
      lastAttemptAt: { $max: '$startedAt' },
      bucket0: countWhen(gradedWhen({ $lte: [ratio, 25] })),
      bucket1: countWhen(gradedWhen({ $and: [{ $gt: [ratio, 25] }, { $lte: [ratio, 50] }] })),
      bucket2: countWhen(gradedWhen({ $and: [{ $gt: [ratio, 50] }, { $lte: [ratio, 75] }] })),
      bucket3: countWhen(gradedWhen({ $and: [{ $gt: [ratio, 75] }, { $lte: [ratio, 90] }] })),
      bucket4: countWhen(gradedWhen({ $gt: [ratio, 90] })),
    } },
  ];
}

export async function refreshPendingAssessmentReports({ limit = 5, now = new Date() } = {}) {
  let refreshed = 0;
  for (let index = 0; index < Math.min(25, Math.max(1, limit)); index += 1) {
    const leaseToken = randomUUID();
    const row = await AssessmentReportSummary.findOneAndUpdate({
      $expr: { $gt: ['$requestedVersion', '$computedVersion'] },
      nextRefreshAt: { $lte: now },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
    }, { $set: { leaseToken, leaseUntil: new Date(now.getTime() + 30_000) } },
    { new: true, sort: { nextRefreshAt: 1, _id: 1 } }).lean();
    if (!row) break;
    try {
      const assessment = await Assessment.findById(row._id).select('targetType assignedStudents totalMarks settings.passPercentage').lean();
      const passPercentage = passPercentageOf(assessment?.settings);
      const [stats = {}] = await AssessmentSubmission.aggregate(
        assessmentSummaryAggregation(row._id, { passPercentage, totalMarks: Number(assessment?.totalMarks) || 0 }),
      ).option({ maxTimeMS: 3000 });
      const { _id, bucket0 = 0, bucket1 = 0, bucket2 = 0, bucket3 = 0, bucket4 = 0, violationCount = 0, lastAttemptAt = null, ...tally } = stats;
      const counts = finalizeCounts({ ...emptyTally(), ...tally }, { assignedCount: await assignedCountForAssessment(assessment), passPercentage });
      await AssessmentReportSummary.updateOne({ _id: row._id, leaseToken }, {
        $set: {
          ...attemptCountFields(counts),
          scoreSum: tally.scoreSum || 0, avgScore: counts.avgScore, maxScore: counts.maxScore, minScore: counts.minScore,
          passRate: counts.passRate, avgPercentage: counts.avgPercentage, passPercentage,
          violationCount, lastAttemptAt,
          scoreDistribution: [bucket0, bucket1, bucket2, bucket3, bucket4],
          computedVersion: row.requestedVersion, computedAt: new Date(), lastError: '',
          nextRefreshAt: new Date(now.getTime() + 15_000),
        },
        $unset: { leaseToken: 1, leaseUntil: 1 },
      });
      refreshed += 1;
    } catch {
      await AssessmentReportSummary.updateOne({ _id: row._id, leaseToken }, {
        $set: { nextRefreshAt: new Date(now.getTime() + 60_000), lastError: 'Summary refresh deferred.' },
        $unset: { leaseToken: 1, leaseUntil: 1 },
      });
    }
  }
  return { refreshed };
}

// Fair, bounded reconciliation covers legacy records, starts, deletions and
// crashes before a refresh request. It never rebuilds all exams in an API call.
const discoveryCursors = new Map();
export async function discoverAssessmentReportRefreshes({ limit = 25, now = new Date() } = {}) {
  const tenantKey = currentTenant()?.universityId || 'platform';
  const discoveryCursor = discoveryCursors.get(tenantKey) || null;
  const rows = await Assessment.find(discoveryCursor ? { _id: { $gt: discoveryCursor } } : {})
    .sort({ _id: 1 }).limit(limit).select('_id startTime endTime').lean();
  discoveryCursors.set(tenantKey, rows.length === limit ? rows.at(-1)._id : null);
  const summaries = await AssessmentReportSummary.find({ _id: { $in: rows.map((row) => row._id) } })
    .select('computedAt requestedVersion computedVersion').lean();
  const byId = new Map(summaries.map((row) => [String(row._id), row]));
  for (const assessment of rows) {
    const existing = byId.get(String(assessment._id));
    const active = assessment.startTime <= now && assessment.endTime >= now;
    const staleMs = active ? 30_000 : 5 * 60_000;
    if (!existing || (!existing.computedAt || now - existing.computedAt > staleMs) && existing.requestedVersion <= existing.computedVersion) {
      await requestAssessmentReportRefresh(assessment._id, now);
    }
  }
  return { discovered: rows.length, hasMore: Boolean(discoveryCursors.get(tenantKey)) };
}

