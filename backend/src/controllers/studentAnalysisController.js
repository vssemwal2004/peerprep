import CompanyBenchmark from '../models/CompanyBenchmark.js';
import StudentAnalytics from '../models/StudentAnalytics.js';
import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { upsertStudentAnalytics, buildReadinessReport } from '../services/analyticsEngine.js';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

async function getOrBuildAnalytics(studentId) {
  const existing = await StudentAnalytics.findOne({ studentId }).lean();
  if (existing && existing.generatedAt && Date.now() - new Date(existing.generatedAt).getTime() < STALE_AFTER_MS) {
    return existing;
  }
  return upsertStudentAnalytics(studentId);
}

export async function getStudentAnalysis(req, res) {
  const studentId = req.user?._id;
  const analysis = await getOrBuildAnalytics(studentId);
  res.json({ analysis });
}

export async function getCompanyReadiness(req, res) {
  const studentId = req.user?._id;
  const companyId = req.query.companyId || req.body?.companyId;
  if (!companyId) throw new HttpError(400, 'Company ID is required');
  validateObjectId(companyId, 'Company ID');

  const [analysis, benchmark] = await Promise.all([
    getOrBuildAnalytics(studentId),
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
