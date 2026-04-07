import CompanyBenchmark from '../models/CompanyBenchmark.js';
import StudentAnalytics from '../models/StudentAnalytics.js';
import Submission from '../models/Submission.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import StudentActivity from '../models/StudentActivity.js';
import Pair from '../models/Pair.js';
import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { upsertStudentAnalytics, buildReadinessReport } from '../services/analyticsEngine.js';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

async function getLatestStudentSignalAt(studentId) {
  const [latestSubmission, latestAssessment, latestFeedback, latestProgress, latestActivity, latestSession] = await Promise.all([
    Submission.findOne({ user: studentId, mode: 'submit' }).sort({ createdAt: -1 }).select('createdAt').lean(),
    AssessmentSubmission.findOne({ studentId, status: 'submitted' }).sort({ submittedAt: -1 }).select('submittedAt').lean(),
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

async function getOrBuildAnalytics(studentId, { forceRefresh = false } = {}) {
  const existing = await StudentAnalytics.findOne({ studentId }).lean();

  if (!existing || !existing.generatedAt) {
    return upsertStudentAnalytics(studentId);
  }

  if (forceRefresh) {
    return upsertStudentAnalytics(studentId);
  }

  const generatedAt = new Date(existing.generatedAt);
  const isTimeStale = Date.now() - generatedAt.getTime() >= STALE_AFTER_MS;
  if (isTimeStale) {
    return upsertStudentAnalytics(studentId);
  }

  const latestSignalAt = await getLatestStudentSignalAt(studentId);
  if (latestSignalAt && latestSignalAt.getTime() > generatedAt.getTime()) {
    return upsertStudentAnalytics(studentId);
  }

  return existing;
}

export async function getStudentAnalysis(req, res) {
  const studentId = req.user?._id;
  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === '1';
  const analysis = await getOrBuildAnalytics(studentId, { forceRefresh });
  res.json({ analysis });
}

export async function getCompanyReadiness(req, res) {
  const studentId = req.user?._id;
  const companyId = req.query.companyId || req.body?.companyId;
  if (!companyId) throw new HttpError(400, 'Company ID is required');
  validateObjectId(companyId, 'Company ID');

  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === '1';

  const [analysis, benchmark] = await Promise.all([
    getOrBuildAnalytics(studentId, { forceRefresh }),
    CompanyBenchmark.findById(companyId).lean(),
  ]);

  if (!benchmark) throw new HttpError(404, 'Company benchmark not found');

  const report = buildReadinessReport(analysis, benchmark);

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
    report,
  });
}
