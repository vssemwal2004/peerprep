import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import AssessmentReportSummary from '../models/AssessmentReportSummary.js';

export const evaluatedAssessmentExpression = {
  $and: [
    { $in: ['$status', ['submitted', 'violation', 'expired']] },
    { $eq: [{ $ifNull: ['$evaluationStatus', 'completed'] }, 'completed'] },
    { $isNumber: '$score' },
  ],
};
export const evaluatedScoreExpression = { $cond: [evaluatedAssessmentExpression, '$score', null] };

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

export function assessmentSummaryAggregation(assessmentId) {
  const ratio = { $cond: [
    { $gt: [{ $ifNull: ['$maxMarks', 0] }, 0] },
    { $multiply: [{ $divide: ['$score', '$maxMarks'] }, 100] }, 0,
  ] };
  const countWhen = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const gradedWhen = (condition) => ({ $and: [evaluatedAssessmentExpression, condition] });
  return [
    { $match: { assessmentId: new mongoose.Types.ObjectId(String(assessmentId)) } },
    { $project: { status: 1, evaluationStatus: 1, score: 1, maxMarks: 1, startedAt: 1, tabSwitches: 1, fullscreenExits: 1, cameraFlags: 1, copyPasteCount: 1 } },
    { $group: {
      _id: null,
      submissionCount: { $sum: 1 },
      completedCount: countWhen({ $eq: ['$status', 'submitted'] }),
      gradedCount: countWhen(evaluatedAssessmentExpression),
      pendingEvaluationCount: countWhen({ $eq: ['$evaluationStatus', 'processing'] }),
      failedEvaluationCount: countWhen({ $eq: ['$evaluationStatus', 'failed'] }),
      scoreSum: { $sum: { $cond: [evaluatedAssessmentExpression, '$score', 0] } },
      avgScore: { $avg: evaluatedScoreExpression },
      maxScore: { $max: evaluatedScoreExpression },
      minScore: { $min: evaluatedScoreExpression },
      passCount: countWhen(gradedWhen({ $gte: [ratio, 40] })),
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
      const [stats = {}] = await AssessmentSubmission.aggregate(assessmentSummaryAggregation(row._id)).option({ maxTimeMS: 3000 });
      const { _id, bucket0 = 0, bucket1 = 0, bucket2 = 0, bucket3 = 0, bucket4 = 0, ...counts } = stats;
      await AssessmentReportSummary.updateOne({ _id: row._id, leaseToken }, {
        $set: {
          submissionCount: 0, completedCount: 0, gradedCount: 0, pendingEvaluationCount: 0,
          failedEvaluationCount: 0, scoreSum: 0, avgScore: null, maxScore: null, minScore: null,
          passCount: 0, violationCount: 0, lastAttemptAt: null, ...counts,
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
let discoveryCursor = null;
export async function discoverAssessmentReportRefreshes({ limit = 25, now = new Date() } = {}) {
  const rows = await Assessment.find(discoveryCursor ? { _id: { $gt: discoveryCursor } } : {})
    .sort({ _id: 1 }).limit(limit).select('_id startTime endTime').lean();
  discoveryCursor = rows.length === limit ? rows.at(-1)._id : null;
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
  return { discovered: rows.length, hasMore: Boolean(discoveryCursor) };
}

export function startAssessmentReportSummaryWorker() {
  let stopped = false;
  let timer;
  let running = Promise.resolve();
  let nextDiscovery = 0;
  const tick = () => {
    running = (async () => {
      if (Date.now() >= nextDiscovery) {
        await discoverAssessmentReportRefreshes();
        nextDiscovery = Date.now() + 30_000;
      }
      await refreshPendingAssessmentReports();
    })().catch((error) => console.error(`[AssessmentReports] Refresh worker failed (${error?.name || 'Error'}).`))
      .finally(() => { if (!stopped) timer = setTimeout(tick, 3000); });
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
