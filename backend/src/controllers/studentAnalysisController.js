import CompanyBenchmark from '../models/CompanyBenchmark.js';
import StudentAnalytics from '../models/StudentAnalytics.js';
import StudentAnalyticsSnapshot from '../models/StudentAnalyticsSnapshot.js';
import Submission from '../models/Submission.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Pair from '../models/Pair.js';
import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logger.js';
import {
  ANALYTICS_CONTRACT_VERSION,
  upsertStudentAnalytics,
  buildReadinessReport,
} from '../services/analyticsEngine.js';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const REVALIDATE_AFTER_MS = 5 * 60 * 1000;
const analyticsBuilds = new Map();
const SENSITIVE_ANALYTICS_KEYS = new Set([
  'violationLog',
  'violations',
  'monitoringEvents',
  'proctoringSnapshots',
  'lastIp',
  'lastUserAgent',
  'securityHeartbeat',
  'rawCamera',
  'snapshot',
  'snapshots',
  '_id',
  'studentId',
  '__v',
  'createdAt',
  'updatedAt',
]);

function redactSensitiveAnalytics(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveAnalytics(item)).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) return value;
  if (typeof value.toHexString === 'function') return value.toHexString();

  const clean = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    if (SENSITIVE_ANALYTICS_KEYS.has(key)) return;
    clean[key] = redactSensitiveAnalytics(nestedValue);
  });
  return clean;
}

function auditAnalyticsAccess(req, action, metadata = {}) {
  logSecurityEvent({
    type: 'ANALYTICS_ACCESS',
    userId: req.user?._id,
    email: req.user?.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    message: `Student analytics ${action}`,
    metadata: {
      action,
      path: req.originalUrl || req.path,
      method: req.method,
      ...metadata,
    },
  });
}

async function getLatestStudentSignalAt(studentId) {
  const [latestSubmission, latestAssessment, latestFeedback, latestProgress, latestActivity, latestSession] = await Promise.all([
    Submission.findOne({ user: studentId, mode: 'submit' }).sort({ createdAt: -1 }).select('createdAt').lean(),
    AssessmentSubmission.findOne({ studentId, status: { $in: ['submitted', 'violation'] } })
      .sort({ submittedAt: -1, updatedAt: -1 })
      .select('submittedAt updatedAt')
      .lean(),
    Feedback.findOne({ to: studentId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    Progress.findOne({ studentId }).sort({ updatedAt: -1 }).select('updatedAt completedAt').lean(),
    StudentActivity.findOne({ studentId }).sort({ date: -1 }).select('date').lean(),
    Pair.findOne({ $or: [{ interviewer: studentId }, { interviewee: studentId }] })
      .sort({ updatedAt: -1 })
      .select('updatedAt finalConfirmedTime')
      .lean(),
  ]);

  const candidates = [
    latestSubmission?.createdAt,
    latestAssessment?.submittedAt,
    latestAssessment?.updatedAt,
    latestFeedback?.createdAt,
    latestProgress?.updatedAt,
    latestProgress?.completedAt,
    latestActivity?.date,
    latestSession?.finalConfirmedTime,
    latestSession?.updatedAt,
  ].filter(Boolean);

  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map((d) => new Date(d).getTime())));
}

function getStudentKey(studentId) {
  return String(studentId);
}

async function buildAnalyticsOnce(studentId) {
  const key = getStudentKey(studentId);
  if (analyticsBuilds.has(key)) {
    return analyticsBuilds.get(key);
  }

  const buildPromise = upsertStudentAnalytics(studentId)
    .finally(() => analyticsBuilds.delete(key));
  analyticsBuilds.set(key, buildPromise);
  return buildPromise;
}

function withCacheMeta(analysis, { status, reason, latestSignalAt = null } = {}) {
  const generatedAt = analysis?.generatedAt ? new Date(analysis.generatedAt) : null;
  return {
    analysis,
    meta: {
      cacheStatus: status,
      cacheReason: reason,
      generatedAt,
      latestSignalAt,
      ageMs: generatedAt ? Math.max(0, Date.now() - generatedAt.getTime()) : null,
      revalidateAfterMs: REVALIDATE_AFTER_MS,
      staleAfterMs: STALE_AFTER_MS,
    },
  };
}

async function getOrBuildAnalytics(studentId, { forceRefresh = false } = {}) {
  const existing = await StudentAnalytics.findOne({ studentId }).lean();

  if (!existing || !existing.generatedAt) {
    const analysis = await buildAnalyticsOnce(studentId);
    return withCacheMeta(analysis, { status: 'rebuilt', reason: 'missing-cache' });
  }

  if (existing.contractVersion !== ANALYTICS_CONTRACT_VERSION) {
    const analysis = await buildAnalyticsOnce(studentId);
    return withCacheMeta(analysis, { status: 'rebuilt', reason: 'contract-upgrade' });
  }

  if (forceRefresh) {
    const analysis = await buildAnalyticsOnce(studentId);
    return withCacheMeta(analysis, { status: 'rebuilt', reason: 'forced-refresh' });
  }

  const generatedAt = new Date(existing.generatedAt);
  const cacheAge = Date.now() - generatedAt.getTime();
  if (cacheAge < REVALIDATE_AFTER_MS) {
    return withCacheMeta(existing, { status: 'hit', reason: 'fresh-window' });
  }

  const isTimeStale = cacheAge >= STALE_AFTER_MS;
  if (isTimeStale) {
    const analysis = await buildAnalyticsOnce(studentId);
    return withCacheMeta(analysis, { status: 'rebuilt', reason: 'time-stale' });
  }

  const latestSignalAt = await getLatestStudentSignalAt(studentId);
  if (latestSignalAt && latestSignalAt.getTime() > generatedAt.getTime()) {
    const analysis = await buildAnalyticsOnce(studentId);
    return withCacheMeta(analysis, { status: 'rebuilt', reason: 'new-student-signal', latestSignalAt });
  }

  return withCacheMeta(existing, { status: 'hit', reason: 'validated', latestSignalAt });
}

export async function getStudentAnalysis(req, res) {
  const studentId = req.user?._id;
  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === '1';
  const { analysis, meta } = await getOrBuildAnalytics(studentId, { forceRefresh });
  if (forceRefresh) {
    auditAnalyticsAccess(req, 'forced-refresh', { cacheStatus: meta.cacheStatus, cacheReason: meta.cacheReason });
  }
  res.set('Cache-Control', 'private, max-age=30');
  res.json({ analysis: redactSensitiveAnalytics(analysis), meta });
}

export async function getStudentAnalysisHistory(req, res) {
  const studentId = req.user?._id;
  const requestedDays = Number.parseInt(req.query?.days, 10);
  const days = Math.min(365, Math.max(7, Number.isFinite(requestedDays) ? requestedDays : 90));
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const snapshots = await StudentAnalyticsSnapshot.find({
    studentId,
    snapshotDate: { $gte: from },
  })
    .sort({ snapshotDate: 1 })
    .limit(366)
    .select('snapshotDate generatedAt contractVersion evidenceVersion scores evidence')
    .lean();

  const history = snapshots.map((snapshot) => ({
    date: snapshot.snapshotDate,
    generatedAt: snapshot.generatedAt,
    contractVersion: snapshot.contractVersion,
    evidenceVersion: snapshot.evidenceVersion,
    scores: snapshot.scores || {},
    evidence: snapshot.evidence || {},
  }));

  res.set('Cache-Control', 'private, max-age=60');
  res.json({
    history,
    meta: {
      days,
      count: history.length,
      from,
      to,
    },
  });
}

export async function getCompanyReadiness(req, res) {
  const studentId = req.user?._id;
  const companyId = req.query.companyId || req.body?.companyId;
  if (!companyId) throw new HttpError(400, 'Company ID is required');
  validateObjectId(companyId, 'Company ID');

  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === '1';
  if (forceRefresh) {
    auditAnalyticsAccess(req, 'company-readiness-forced-refresh', { companyId });
  }

  const [analysisResult, benchmark] = await Promise.all([
    getOrBuildAnalytics(studentId, { forceRefresh }),
    CompanyBenchmark.findById(companyId).lean(),
  ]);

  if (!benchmark) throw new HttpError(404, 'Company benchmark not found');

  const report = buildReadinessReport(analysisResult.analysis, benchmark);
  const integrity = report?.breakdown?.integrity;
  const assessment = report?.breakdown?.assessment;
  if ((Number.isFinite(integrity) && integrity < 80) || (Number.isFinite(assessment) && assessment < 40)) {
    auditAnalyticsAccess(req, 'company-readiness-risk-view', {
      companyId,
      readinessScore: report.readinessScore,
      integrity: report.breakdown?.integrity,
      assessment: report.breakdown?.assessment,
    });
  }
  res.set('Cache-Control', 'private, max-age=30');

  res.json({
    company: {
      id: benchmark._id,
      companyName: benchmark.companyName,
      requiredTopics: benchmark.requiredTopics || [],
      dsaAccuracyRequired: benchmark.dsaAccuracyRequired,
      minQuestionAttempts: benchmark.minQuestionAttempts || 0,
      minStreak: benchmark.minStreak,
      interviewScore: benchmark.interviewScore,
      weightDsa: benchmark.weightDsa,
      weightConsistency: benchmark.weightConsistency,
      weightInterview: benchmark.weightInterview,
    },
    report: redactSensitiveAnalytics(report),
    meta: analysisResult.meta,
  });
}

export const __studentAnalysisTestHooks = {
  redactSensitiveAnalytics,
  SENSITIVE_ANALYTICS_KEYS,
};
