import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';

export function mapCodeTemplates(codeTemplates) {
  if (!codeTemplates) return {};
  if (codeTemplates instanceof Map) {
    return Object.fromEntries(codeTemplates.entries());
  }
  return Object.entries(codeTemplates).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

export function serializeProblem(
  problem,
  {
    sampleTestCases = [],
    hiddenTestCaseCount = 0,
    hiddenTestCases = [],
    includeHiddenTestCases = false,
    includeReferenceSolutions = false,
    studentStatus = null,
  } = {},
) {
  if (!problem) return null;
  const previewValidated = problem.previewValidated ?? problem.previewTested ?? false;
  const normalizedStatus = String(problem.status || '').trim().toLowerCase();
  const status = normalizedStatus === 'active'
    ? 'published'
    : (normalizedStatus === 'draft' ? 'draft' : (problem.status || 'draft'));

  const referenceSolutions = problem.referenceSolutions;
  const referenceSolutionCount = referenceSolutions instanceof Map
    ? referenceSolutions.size
    : (referenceSolutions && typeof referenceSolutions === 'object' ? Object.keys(referenceSolutions).length : 0);

  return {
    _id: problem._id,
    title: problem.title,
    description: problem.description || '',
    difficulty: problem.difficulty,
    tags: problem.tags || [],
    companyTags: problem.companyTags || [],
    supportedLanguages: problem.supportedLanguages || [],
    codeTemplates: mapCodeTemplates(problem.codeTemplates),
    referenceSolutions: includeReferenceSolutions ? mapCodeTemplates(problem.referenceSolutions) : undefined,
    hasReferenceSolution: referenceSolutionCount > 0,
    inputFormat: problem.inputFormat || '',
    outputFormat: problem.outputFormat || '',
    constraints: problem.constraints || '',
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    status,
    visibility: problem.visibility || 'public',
    previewValidated: Boolean(previewValidated),
    totalSubmissions: problem.stats?.totalSubmissions || 0,
    acceptedSubmissions: problem.stats?.acceptedSubmissions || 0,
    totalRuns: problem.stats?.totalRuns || 0,
    acceptanceRate: problem.stats?.acceptanceRate || 0,
    averageExecutionTimeMs: problem.stats?.averageExecutionTimeMs || 0,
    sampleTestCases,
    hiddenTestCaseCount,
    hiddenTestCases: includeHiddenTestCases ? hiddenTestCases : undefined,
    hiddenTestSource: {
      provider: problem.hiddenTestSource?.provider || 'none',
      caseCount: Number(problem.hiddenTestSource?.caseCount || 0),
      delimiter: problem.hiddenTestSource?.delimiter || '###CASE###',
    },
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    publishedAt: problem.publishedAt || null,
    studentStatus: studentStatus || undefined,
  };
}

export function serializeSubmission(submission, { includeJudgeDetails = true } = {}) {
  if (!submission) return null;

  const user = submission.userSnapshot || {};
  const problem = submission.problemSnapshot || {};
  const failedCase = submission.failedCase || null;
  const testCaseResults = submission.testCaseResults || [];

  return {
    _id: submission._id,
    jobId: submission.jobId || '',
    problemId: submission.problem,
    userId: submission.user,
    user: {
      name: user.name || 'Admin',
      email: user.email || '',
      role: user.role || 'admin',
    },
    problem: {
      title: problem.title || 'Untitled Problem',
      difficulty: problem.difficulty || 'Easy',
      status: problem.status || 'Draft',
    },
    mode: submission.mode,
    language: submission.language,
    status: submission.status,
    output: submission.output || '',
    stderr: submission.stderr || '',
    compileOutput: submission.compileOutput || '',
    customInput: submission.customInput || '',
    executionTimeMs: submission.executionTimeMs || 0,
    memoryUsedKb: submission.memoryUsedKb || 0,
    totalTestCases: submission.totalTestCases || 0,
    passedTestCases: submission.passedTestCases || 0,
    failedCase: includeJudgeDetails
      ? failedCase
      : (failedCase ? { index: failedCase.index } : null),
    testCaseResults: includeJudgeDetails
      ? testCaseResults
      : testCaseResults.map((testCaseResult) => ({
        index: testCaseResult.index,
        status: testCaseResult.status,
        executionTimeMs: testCaseResult.executionTimeMs || 0,
      })),
    provider: submission.provider || 'local-sandbox',
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    completedAt: submission.completedAt || null,
  };
}

export function serializeStudentSubmission(submission) {
  const serialized = serializeSubmission(submission, {
    includeJudgeDetails: submission?.mode === 'run',
  });

  if (!serialized) {
    return null;
  }

  if (submission?.mode === 'submit') {
    serialized.output = '';
    if (!['CE', 'RE'].includes(serialized.status)) {
      serialized.stderr = '';
    }
  }

  serialized.sourceCode = submission?.sourceCode || '';

  return serialized;
}

export async function refreshProblemStats(problemId) {
  const [totalSubmissions, acceptedSubmissions, totalRuns, executionTimeAggregation] = await Promise.all([
    Submission.countDocuments({ problem: problemId, mode: 'submit' }),
    Submission.countDocuments({ problem: problemId, mode: 'submit', status: 'AC' }),
    Submission.countDocuments({ problem: problemId, mode: 'run' }),
    Submission.aggregate([
      { $match: { problem: problemId, mode: 'submit', status: { $in: ['AC', 'WA', 'TLE', 'RE'] } } },
      { $group: { _id: null, averageExecutionTimeMs: { $avg: '$executionTimeMs' } } },
    ]),
  ]);

  const acceptanceRate = totalSubmissions > 0
    ? Number(((acceptedSubmissions / totalSubmissions) * 100).toFixed(2))
    : 0;
  const averageExecutionTimeMs = Number((executionTimeAggregation[0]?.averageExecutionTimeMs || 0).toFixed(2));

  await Problem.findByIdAndUpdate(problemId, {
    $set: {
      'stats.totalSubmissions': totalSubmissions,
      'stats.acceptedSubmissions': acceptedSubmissions,
      'stats.totalRuns': totalRuns,
      'stats.acceptanceRate': acceptanceRate,
      'stats.averageExecutionTimeMs': averageExecutionTimeMs,
    },
  });
}


