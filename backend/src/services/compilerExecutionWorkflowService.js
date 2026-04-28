import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import TestCase from '../models/TestCase.js';
import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { parseBulkCasePair } from '../utils/testcaseBulkParser.js';
import { readS3TextObject } from '../utils/s3.js';
import { createNotification } from './notificationService.js';
import { getIo } from '../utils/io.js';
import { serializeSubmission, refreshProblemStats } from '../controllers/compilerHelpers.js';
import {
  assessmentQueue,
  compilerQueue,
  submissionQueue,
  DEFAULT_ATTEMPTS,
} from '../queues/queueManager.js';
import {
  createExecutionJobRecord,
  buildQueuedJobResponse,
  markExecutionJobCompleted,
  markExecutionJobFailed,
  markExecutionJobProcessing,
} from './executionTrackingService.js';
import {
  buildJudge0Options,
  buildRunResponse,
  evaluateSubmissionResult,
  KEY_TO_LANGUAGE_ID,
  mapRunStatusCode,
  MAX_SOURCE_CODE_SIZE_BYTES,
  MAX_STDIN_SIZE_BYTES,
  MAX_TESTCASE_TEXT_BYTES,
  resolveLanguageRequest,
  roundNumber,
  runJudge0,
  sanitizeExecutionText,
  secondsToMilliseconds,
} from './executionService.js';

const SUBMIT_CASE_DELAY_MS = Math.max(0, Number(process.env.SUBMIT_CASE_DELAY_MS || 0));
const DEFAULT_LANGUAGE = 'python';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureObjectId(id, fieldName) {
  try {
    return validateObjectId(id, fieldName);
  } catch (error) {
    throw new HttpError(400, error.message || `Invalid ${fieldName}`);
  }
}

function assessmentIncludesProblem(assessment, problemId) {
  const targetId = String(problemId);
  const sections = Array.isArray(assessment?.sections) ? assessment.sections : [];
  return sections.some((section) => {
    const questionType = section?.type;
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    return questions.some((question) => {
      const resolvedType = question?.type || questionType;
      if (resolvedType !== 'coding') return false;
      const resolvedProblemId = question?.problemId
        || question?.coding?.problemId
        || question?.problemDataSnapshot?._id
        || question?.coding?.problemData?._id
        || question?.problemData?._id;
      return resolvedProblemId && String(resolvedProblemId) === targetId;
    });
  });
}

export async function resolveActiveProblem(problemId, { userId, assessmentId } = {}) {
  ensureObjectId(problemId, 'Problem ID');
  const problem = await Problem.findById(problemId);
  const normalizedStatus = String(problem?.status || '').toLowerCase();
  const isPublished = normalizedStatus === 'published' || normalizedStatus === 'active';
  if (!problem || !isPublished) {
    throw new HttpError(404, 'Problem not found.');
  }

  const visibility = problem.visibility || 'public';
  if (visibility === 'public') {
    return problem;
  }

  if (visibility !== 'assessment') {
    throw new HttpError(404, 'Problem not found.');
  }

  if (!assessmentId || !userId) {
    throw new HttpError(404, 'Problem not found.');
  }

  ensureObjectId(assessmentId, 'Assessment ID');
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment || assessment.lifecycleStatus === 'draft') {
    throw new HttpError(404, 'Problem not found.');
  }

  const studentId = String(userId);
  if (assessment.targetType !== 'all') {
    const assigned = (assessment.assignedStudents || []).some((id) => String(id) === studentId);
    if (!assigned) {
      throw new HttpError(404, 'Problem not found.');
    }
  }

  if (!assessmentIncludesProblem(assessment, problemId)) {
    throw new HttpError(404, 'Problem not found.');
  }

  return problem;
}

export function validateProblemLanguage(problem, languageKey) {
  if (!problem.supportedLanguages.includes(languageKey)) {
    throw new HttpError(400, 'This language is not enabled for the selected problem.');
  }
}

function getProblemStarterCode(problem, languageKey = '') {
  const templates = problem?.codeTemplates instanceof Map
    ? Object.fromEntries(problem.codeTemplates.entries())
    : (problem?.codeTemplates && typeof problem.codeTemplates === 'object' ? problem.codeTemplates : {});

  return String(templates?.[languageKey] ?? '');
}

export function validateSourceCode(sourceCode, { starterCode = '', action = 'submit' } = {}) {
  const normalizedSourceCode = sanitizeExecutionText(sourceCode, MAX_SOURCE_CODE_SIZE_BYTES, 'Source code');
  if (!normalizedSourceCode.trim()) {
    throw new HttpError(400, 'Source code is required.');
  }

  const normalizedStarterCode = starterCode
    ? sanitizeExecutionText(starterCode, MAX_SOURCE_CODE_SIZE_BYTES, 'Starter code')
    : '';
  if (normalizedStarterCode.trim() && normalizedSourceCode.trim() === normalizedStarterCode.trim()) {
    const actionLabel = action === 'run' ? 'running' : 'submitting';
    throw new HttpError(400, `Please write or modify the starter code before ${actionLabel} this problem.`);
  }

  return normalizedSourceCode;
}

function validateProblemSourceCode(problem, languageKey, sourceCode, { action = 'submit' } = {}) {
  return validateSourceCode(sourceCode, {
    starterCode: getProblemStarterCode(problem, languageKey),
    action,
  });
}

export function pickReferenceSolution(problem, preferredLanguageKey = '') {
  const preferred = String(preferredLanguageKey || '').trim().toLowerCase();
  const referenceSolutions = problem?.referenceSolutions;
  const asObject = referenceSolutions instanceof Map
    ? Object.fromEntries(referenceSolutions.entries())
    : (referenceSolutions && typeof referenceSolutions === 'object' ? referenceSolutions : {});

  const candidates = Object.entries(asObject)
    .map(([languageKey, sourceCode]) => ({
      languageKey: String(languageKey || '').trim().toLowerCase(),
      sourceCode: String(sourceCode ?? ''),
    }))
    .filter((entry) => entry.languageKey && entry.sourceCode.trim());

  if (candidates.length === 0) {
    return null;
  }

  if (preferred) {
    const exact = candidates.find((entry) => entry.languageKey === preferred);
    if (exact) return exact;
  }

  return candidates[0];
}

function emitSubmissionUpdate(submission) {
  const io = getIo();
  if (!io) return;
  io.emit('compiler-submission-updated', serializeSubmission(submission, {
    includeJudgeDetails: false,
  }));
}

async function createTrackedSubmission({
  jobId,
  user,
  problem,
  mode,
  language,
  sourceCode,
  customInput = '',
  assessmentId = null,
}) {
  const submission = await Submission.create({
    jobId,
    problem: problem._id,
    user: user._id,
    userSnapshot: {
      name: user.name || 'Student',
      email: user.email || '',
      role: user.role || 'student',
    },
    problemSnapshot: {
      title: problem.title,
      difficulty: problem.difficulty,
      status: problem.status,
    },
    mode,
    language,
    sourceCode,
    customInput,
    assessmentId: assessmentId || undefined,
    status: 'PENDING',
    provider: 'judge0-ce',
    queuedAt: new Date(),
  });

  emitSubmissionUpdate(submission);
  return submission;
}

async function markSubmissionRunning(submissionId) {
  if (!submissionId) return null;
  const submission = await Submission.findByIdAndUpdate(
    submissionId,
    {
      $set: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    },
    { new: true },
  );
  if (submission) emitSubmissionUpdate(submission);
  return submission;
}

async function finalizeTrackedSubmission(submissionId, payload) {
  if (!submissionId) return null;
  const submission = await Submission.findByIdAndUpdate(
    submissionId,
    {
      $set: {
        status: payload.status,
        output: payload.output || '',
        stderr: payload.stderr || '',
        compileOutput: payload.compileOutput || '',
        executionTimeMs: payload.executionTimeMs || 0,
        memoryUsedKb: payload.memoryUsedKb || 0,
        provider: payload.provider || 'judge0-ce',
        failedCase: payload.failedCase || undefined,
        testCaseResults: payload.testCaseResults || [],
        totalTestCases: payload.totalTestCases || 0,
        passedTestCases: payload.passedTestCases || 0,
        completedAt: new Date(),
      },
    },
    { new: true },
  );
  if (submission) emitSubmissionUpdate(submission);
  return submission;
}

async function loadSubmissionTestCases(problem) {
  const [sampleTestCases, hiddenTestCasesDb] = await Promise.all([
    TestCase.find({ problem: problem._id, kind: 'sample' }).sort({ position: 1 }).lean(),
    TestCase.find({ problem: problem._id, kind: 'hidden' }).sort({ position: 1 }).lean(),
  ]);

  let allTestCases = hiddenTestCasesDb.length > 0 ? hiddenTestCasesDb : [];
  const isS3HiddenSource = problem.hiddenTestSource?.provider === 's3'
    && problem.hiddenTestSource?.inputObjectKey
    && problem.hiddenTestSource?.outputObjectKey;

  if (allTestCases.length === 0 && isS3HiddenSource) {
    try {
      const [inputsBlob, outputsBlob] = await Promise.all([
        readS3TextObject(problem.hiddenTestSource.inputObjectKey),
        readS3TextObject(problem.hiddenTestSource.outputObjectKey),
      ]);
      allTestCases = parseBulkCasePair(
        inputsBlob,
        outputsBlob,
        problem.hiddenTestSource.delimiter || '###CASE###',
      );
    } catch (error) {
      throw new HttpError(500, `Failed to load hidden S3 testcases: ${error.message}`);
    }
  }

  if (allTestCases.length === 0) {
    allTestCases = sampleTestCases;
  }

  if (allTestCases.length === 0) {
    throw new HttpError(400, 'No test cases are configured for this problem yet.');
  }

  allTestCases.forEach((testCase, index) => {
    sanitizeExecutionText(testCase.input, MAX_TESTCASE_TEXT_BYTES, `Test case input #${index + 1}`);
    sanitizeExecutionText(testCase.output, MAX_TESTCASE_TEXT_BYTES, `Test case output #${index + 1}`);
  });

  return allTestCases;
}

function buildSubmitApiResponse(executionResult) {
  if (executionResult.status === 'AC') {
    return {
      mode: 'submit',
      status: 'Accepted',
      passed: executionResult.totalTestCases,
      total: executionResult.totalTestCases,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb,
    };
  }

  if (executionResult.status === 'WA') {
    return {
      mode: 'submit',
      status: 'Wrong Answer',
      passed: executionResult.passedTestCases || 0,
      total: executionResult.totalTestCases || 0,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
      failedTestCase: executionResult.failedCase
        ? {
          index: executionResult.failedCase.index,
          input: executionResult.failedCase.input || '',
          expected: executionResult.failedCase.expectedOutput || '',
          actual: executionResult.failedCase.actualOutput || '',
        }
        : undefined,
    };
  }

  if (executionResult.status === 'CE') {
    return {
      mode: 'submit',
      status: 'Compilation Error',
      error: executionResult.compileOutput || 'Compilation failed.',
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
    };
  }

  if (executionResult.status === 'TLE') {
    return {
      mode: 'submit',
      status: 'Time Limit Exceeded',
      passed: executionResult.passedTestCases || 0,
      total: executionResult.totalTestCases || 0,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
    };
  }

  return {
    mode: 'submit',
    status: 'Runtime Error',
    error: executionResult.stderr || 'Execution failed.',
    passed: executionResult.passedTestCases || 0,
    total: executionResult.totalTestCases || 0,
    time: roundNumber(executionResult.executionTimeMs / 1000, 3),
    memory: executionResult.memoryUsedKb || 0,
  };
}

async function resolveRunExpectedOutput({
  providedExpectedOutput,
}) {
  if (providedExpectedOutput !== undefined && providedExpectedOutput !== null) {
    return sanitizeExecutionText(providedExpectedOutput, MAX_TESTCASE_TEXT_BYTES, 'Expected output');
  }

  return null;
}

function buildRunApiResponse(executionResult, { standardInput = '', expectedOutput = null } = {}) {
  if (executionResult.status === 'AC') {
    return {
      mode: 'run',
      status: 'Accepted',
      input: standardInput,
      output: executionResult.output || '',
      expectedOutput: expectedOutput ?? '',
      passed: 1,
      total: 1,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
    };
  }

  if (executionResult.status === 'WA') {
    return {
      mode: 'run',
      status: 'Wrong Answer',
      input: standardInput,
      output: executionResult.output || executionResult.failedCase?.actualOutput || '',
      expectedOutput: executionResult.failedCase?.expectedOutput ?? expectedOutput ?? '',
      passed: executionResult.passedTestCases || 0,
      total: executionResult.totalTestCases || 1,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
      failedTestCase: executionResult.failedCase
        ? {
          index: executionResult.failedCase.index,
          input: executionResult.failedCase.input || standardInput,
          expected: executionResult.failedCase.expectedOutput || '',
          actual: executionResult.failedCase.actualOutput || '',
        }
        : undefined,
    };
  }

  if (executionResult.status === 'CE') {
    return {
      mode: 'run',
      status: 'Compilation Error',
      input: standardInput,
      output: executionResult.output || '',
      expectedOutput: expectedOutput ?? '',
      error: executionResult.compileOutput || 'Compilation failed.',
      passed: 0,
      total: 1,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
    };
  }

  if (executionResult.status === 'TLE') {
    return {
      mode: 'run',
      status: 'Time Limit Exceeded',
      input: standardInput,
      output: executionResult.output || '',
      expectedOutput: expectedOutput ?? '',
      passed: 0,
      total: 1,
      time: roundNumber(executionResult.executionTimeMs / 1000, 3),
      memory: executionResult.memoryUsedKb || 0,
    };
  }

  return {
    mode: 'run',
    status: 'Runtime Error',
    input: standardInput,
    output: executionResult.output || '',
    expectedOutput: expectedOutput ?? '',
    error: executionResult.stderr || 'Execution failed.',
    passed: 0,
    total: 1,
    time: roundNumber(executionResult.executionTimeMs / 1000, 3),
    memory: executionResult.memoryUsedKb || 0,
  };
}

function normalizeRunStatus(status) {
  if (status === 'AC') return 'Passed';
  if (status === 'WA') return 'Failed';
  if (status === 'CE') return 'Compilation Error';
  if (status === 'RE') return 'Runtime Error';
  if (status === 'TLE') return 'Time Limit Exceeded';
  return status || 'Run Completed';
}

function cleanRunText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function buildRunCaseResult({
  id,
  label,
  input,
  expectedOutput,
  judgeResult,
  evaluation,
}) {
  const internalStatus = evaluation?.internalStatus || mapRunStatusCode(judgeResult);
  const output = cleanRunText(judgeResult.stdout);
  const normalizedExpectedOutput = expectedOutput === null || expectedOutput === undefined
    ? null
    : cleanRunText(expectedOutput);
  const compileOutput = internalStatus === 'CE'
    ? cleanRunText(evaluation?.error || judgeResult.compile_output || '')
    : cleanRunText(judgeResult.compile_output || '');
  const errorOutput = internalStatus === 'RE' || internalStatus === 'TLE'
    ? cleanRunText(evaluation?.error || judgeResult.stderr || judgeResult.message || '')
    : cleanRunText(judgeResult.stderr || '');

  return {
    id,
    label,
    status: normalizedExpectedOutput === null && internalStatus === 'AC'
      ? 'Run Completed'
      : normalizeRunStatus(internalStatus),
    internalStatus,
    input,
    output,
    stdout: output,
    expectedOutput: normalizedExpectedOutput,
    error: compileOutput || errorOutput || '',
    compileOutput,
    stderr: errorOutput,
    time: roundNumber(Number(judgeResult.time || 0), 3),
    memory: Math.trunc(Number(judgeResult.memory || 0)),
  };
}

function buildPersistedRunCase(entry, index) {
  return {
    index: index + 1,
    status: entry.internalStatus || 'AC',
    input: entry.input || '',
    expectedOutput: entry.expectedOutput ?? '',
    actualOutput: entry.output || '',
    executionTimeMs: secondsToMilliseconds(entry.time),
    memoryUsedKb: Math.trunc(Number(entry.memory || 0)),
    stderr: entry.stderr || '',
    compileOutput: entry.compileOutput || '',
  };
}

async function executeRunCasesPayload({
  sourceCode,
  languageId,
  problem,
  runTestCases,
}) {
  const judge0Options = buildJudge0Options(problem);
  const caseResults = [];

  for (let index = 0; index < runTestCases.length; index += 1) {
    const testCase = runTestCases[index];
    const input = sanitizeExecutionText(testCase.input ?? '', MAX_STDIN_SIZE_BYTES, `Run testcase input #${index + 1}`);
    const providedExpectedOutput = testCase.expectedOutput !== undefined && testCase.expectedOutput !== null
      ? sanitizeExecutionText(testCase.expectedOutput, MAX_TESTCASE_TEXT_BYTES, `Run testcase expected output #${index + 1}`)
      : undefined;
    const judgeResult = await runJudge0(sourceCode, languageId, input, judge0Options);
    const resolvedExpectedOutput = await resolveRunExpectedOutput({
      providedExpectedOutput,
    });
    const evaluation = resolvedExpectedOutput === null
      ? null
      : evaluateSubmissionResult(judgeResult, resolvedExpectedOutput);

    caseResults.push(buildRunCaseResult({
      id: String(testCase.id || `case-${index + 1}`),
      label: String(testCase.label || `Case ${index + 1}`),
      input,
      expectedOutput: resolvedExpectedOutput,
      judgeResult,
      evaluation,
    }));
  }

  const totalTimeSeconds = caseResults.reduce((sum, entry) => sum + Number(entry.time || 0), 0);
  const peakMemoryKb = caseResults.reduce((max, entry) => Math.max(max, Number(entry.memory || 0)), 0);
  const hasComparableCases = caseResults.some((entry) => entry.expectedOutput !== null && entry.expectedOutput !== undefined);
  const failedCase = caseResults.find((entry) => !['Passed', 'Run Completed'].includes(entry.status));
  const passed = caseResults.filter((entry) => ['Passed', 'Run Completed'].includes(entry.status)).length;
  const finalStatus = failedCase
    ? 'Failed'
    : (hasComparableCases && caseResults.every((entry) => entry.status === 'Passed') ? 'Passed' : 'Run Completed');
  const persistedStatus = failedCase?.internalStatus || 'AC';

  const persistedCaseResults = caseResults.map(buildPersistedRunCase);
  const persisted = {
    status: persistedStatus,
    output: failedCase?.output || caseResults[caseResults.length - 1]?.output || '',
    stderr: failedCase?.stderr || '',
    compileOutput: failedCase?.compileOutput || '',
    executionTimeMs: secondsToMilliseconds(totalTimeSeconds),
    memoryUsedKb: peakMemoryKb,
    totalTestCases: caseResults.length,
    passedTestCases: passed,
    failedCase: failedCase
      ? {
        index: caseResults.findIndex((entry) => entry.id === failedCase.id) + 1,
        input: failedCase.input || '',
        expectedOutput: failedCase.expectedOutput ?? '',
        actualOutput: failedCase.output || '',
      }
      : undefined,
    testCaseResults: persistedCaseResults,
    provider: 'judge0-ce',
  };

  return {
    response: {
      mode: 'run',
      status: finalStatus,
      passed,
      total: caseResults.length,
      time: roundNumber(totalTimeSeconds, 3),
      memory: peakMemoryKb,
      caseResults,
    },
    submissionStatus: persisted.status,
    persisted,
  };
}

async function executeRunPayload({
  sourceCode,
  languageId,
  standardInput,
  problem,
  expectedOutput,
}) {
  const judgeResult = await runJudge0(sourceCode, languageId, standardInput, buildJudge0Options(problem));
  const resolvedExpectedOutput = await resolveRunExpectedOutput({
    providedExpectedOutput: expectedOutput,
  });

  if (resolvedExpectedOutput === null) {
    const responsePayload = buildRunResponse(judgeResult);
    const statusCode = mapRunStatusCode(judgeResult);
    return {
      response: {
        mode: 'run',
        status: statusCode === 'AC' ? 'Run Completed' : (responsePayload.status?.description || 'Run Completed'),
        input: standardInput,
        output: responsePayload.stdout || '',
        expectedOutput: '',
        error: responsePayload.compile_output || responsePayload.stderr || '',
        time: responsePayload.time,
        memory: responsePayload.memory,
      },
      submissionStatus: statusCode,
      persisted: {
        status: statusCode,
        output: responsePayload.stdout,
        stderr: responsePayload.stderr,
        compileOutput: responsePayload.compile_output,
        executionTimeMs: secondsToMilliseconds(responsePayload.time),
        memoryUsedKb: responsePayload.memory,
        totalTestCases: 0,
        passedTestCases: 0,
        provider: 'judge0-ce',
      },
    };
  }

  const evaluation = evaluateSubmissionResult(judgeResult, resolvedExpectedOutput);
  const persisted = {
    status: evaluation.internalStatus,
    output: judgeResult.stdout || '',
    stderr: evaluation.internalStatus === 'RE' ? (evaluation.error || '') : '',
    compileOutput: evaluation.internalStatus === 'CE' ? (evaluation.error || '') : '',
    executionTimeMs: secondsToMilliseconds(judgeResult.time),
    memoryUsedKb: Math.trunc(Number(judgeResult.memory || 0)),
    totalTestCases: 1,
    passedTestCases: evaluation.internalStatus === 'AC' ? 1 : 0,
    failedCase: evaluation.internalStatus === 'WA'
      ? {
        index: 1,
        input: standardInput,
        expectedOutput: resolvedExpectedOutput,
        actualOutput: evaluation.actualOutput || judgeResult.stdout || '',
      }
      : undefined,
    testCaseResults: [{
      index: 1,
      status: evaluation.internalStatus,
      input: standardInput,
      expectedOutput: resolvedExpectedOutput,
      actualOutput: judgeResult.stdout || '',
      executionTimeMs: secondsToMilliseconds(judgeResult.time),
      memoryUsedKb: Math.trunc(Number(judgeResult.memory || 0)),
      stderr: evaluation.internalStatus === 'RE' || evaluation.internalStatus === 'TLE' ? (evaluation.error || '') : '',
      compileOutput: evaluation.internalStatus === 'CE' ? (evaluation.error || '') : '',
    }],
    provider: 'judge0-ce',
  };

  return {
    response: buildRunApiResponse(persisted, {
      standardInput,
      expectedOutput: resolvedExpectedOutput,
    }),
    submissionStatus: evaluation.internalStatus,
    persisted,
  };
}

async function executeSubmitPayload({ sourceCode, languageId, problem }) {
  const allTestCases = await loadSubmissionTestCases(problem);
  const judge0Options = buildJudge0Options(problem);
  const testCaseResults = [];
  let totalTimeSeconds = 0;
  let peakMemoryKb = 0;
  let passed = 0;

  for (let index = 0; index < allTestCases.length; index += 1) {
    const testCase = allTestCases[index];
    const judgeResult = await runJudge0(sourceCode, languageId, testCase.input || '', judge0Options);
    const evaluation = evaluateSubmissionResult(judgeResult, testCase.output || '');
    const executionTimeMs = secondsToMilliseconds(judgeResult.time);
    const memoryUsedKb = Math.trunc(Number(judgeResult.memory || 0));

    totalTimeSeconds += Number(judgeResult.time || 0);
    peakMemoryKb = Math.max(peakMemoryKb, memoryUsedKb);

    testCaseResults.push({
      index: index + 1,
      status: evaluation.internalStatus,
      input: testCase.input || '',
      expectedOutput: testCase.output || '',
      actualOutput: judgeResult.stdout || '',
      executionTimeMs,
      memoryUsedKb,
      stderr: evaluation.internalStatus === 'RE' || evaluation.internalStatus === 'TLE' ? (evaluation.error || '') : '',
      compileOutput: evaluation.internalStatus === 'CE' ? (evaluation.error || '') : '',
    });

    if (evaluation.internalStatus !== 'AC') {
      return {
        persisted: {
          status: evaluation.internalStatus,
          output: evaluation.actualOutput || judgeResult.stdout || '',
          stderr: evaluation.internalStatus === 'RE' ? (evaluation.error || '') : '',
          compileOutput: evaluation.internalStatus === 'CE' ? (evaluation.error || '') : '',
          executionTimeMs: secondsToMilliseconds(totalTimeSeconds),
          memoryUsedKb: peakMemoryKb,
          totalTestCases: allTestCases.length,
          passedTestCases: passed,
          failedCase: {
            index: index + 1,
            input: testCase.input || '',
            expectedOutput: testCase.output || '',
            actualOutput: evaluation.actualOutput || judgeResult.stdout || '',
          },
          testCaseResults,
          provider: 'judge0-ce',
        },
      };
    }

    passed += 1;

    if (index < allTestCases.length - 1) {
      await sleep(SUBMIT_CASE_DELAY_MS);
    }
  }

  return {
    persisted: {
      status: 'AC',
      output: '',
      stderr: '',
      compileOutput: '',
      executionTimeMs: secondsToMilliseconds(totalTimeSeconds),
      memoryUsedKb: peakMemoryKb,
      totalTestCases: allTestCases.length,
      passedTestCases: allTestCases.length,
      testCaseResults,
      provider: 'judge0-ce',
    },
  };
}

async function buildCompilerQueueJob({
  queue,
  jobName,
  user,
  problem,
  submission,
  assessmentId,
  mode,
  languageId,
  languageKey,
  sourceCode,
  standardInput = '',
  expectedOutput = undefined,
  runTestCases = [],
}) {
  const jobRecord = await createExecutionJobRecord({
    jobId: submission?.jobId,
    queueName: queue.name,
    jobName,
    userId: user._id,
    submissionId: submission?._id || null,
    assessmentId: assessmentId || null,
    problemId: problem?._id || null,
    maxAttempts: DEFAULT_ATTEMPTS,
    metadata: {
      mode,
      language: languageKey,
    },
  });

  await queue.add(jobName, {
    executionJobId: jobRecord.jobId,
    submissionId: submission?._id?.toString() || '',
    userId: user._id?.toString() || '',
    problemId: problem?._id?.toString() || '',
    assessmentId: assessmentId || '',
    languageId,
    languageKey,
    sourceCode,
    standardInput,
    expectedOutput,
    runTestCases,
  }, {
    jobId: jobRecord.jobId,
    attempts: DEFAULT_ATTEMPTS,
  });

  return buildQueuedJobResponse(jobRecord, {
    submissionId: submission?._id || undefined,
  });
}

export async function enqueueCompilerRunJob({ user, body }) {
  const { languageId, languageKey } = resolveLanguageRequest(body);
  const standardInput = sanitizeExecutionText(body.stdin, MAX_STDIN_SIZE_BYTES, 'Input');
  const problemId = String(body.problemId || '').trim();
  const assessmentId = String(body.assessmentId || '').trim();
  const expectedOutput = body.expectedOutput !== undefined && body.expectedOutput !== null
    ? sanitizeExecutionText(body.expectedOutput, MAX_TESTCASE_TEXT_BYTES, 'Expected output')
    : undefined;
  const runTestCases = Array.isArray(body.testCases)
    ? body.testCases.slice(0, 12).map((entry, index) => ({
      id: String(entry?.id || `case-${index + 1}`),
      label: String(entry?.label || `Case ${index + 1}`),
      input: sanitizeExecutionText(entry?.input ?? '', MAX_STDIN_SIZE_BYTES, `Run testcase input #${index + 1}`),
      expectedOutput: entry?.expectedOutput !== undefined && entry?.expectedOutput !== null
        ? sanitizeExecutionText(entry.expectedOutput, MAX_TESTCASE_TEXT_BYTES, `Run testcase expected output #${index + 1}`)
        : undefined,
    }))
    : [];

  let problem = null;
  let submission = null;
  let sourceCode = '';

  if (problemId) {
    problem = await resolveActiveProblem(problemId, { userId: user?._id, assessmentId });
    validateProblemLanguage(problem, languageKey);
    sourceCode = validateProblemSourceCode(problem, languageKey, body.source_code, { action: 'run' });
    const jobId = undefined;
    submission = await createTrackedSubmission({
      jobId,
      user,
      problem,
      mode: 'run',
      language: languageKey,
      sourceCode,
      customInput: standardInput,
      assessmentId: assessmentId || null,
    });
  } else {
    sourceCode = validateSourceCode(body.source_code, { action: 'run' });
  }

  const queue = assessmentId ? assessmentQueue : compilerQueue;
  const jobName = assessmentId ? 'assessment-code-run' : 'run';

  if (submission) {
    const generatedJobId = submission.jobId || undefined;
    if (!generatedJobId) {
      submission.jobId = submission._id.toString();
      await submission.save();
    }
  }

  return buildCompilerQueueJob({
    queue,
    jobName,
    user,
    problem,
    submission,
    assessmentId,
    mode: 'run',
    languageId,
    languageKey,
    sourceCode,
    standardInput,
    expectedOutput,
    runTestCases,
  });
}

export async function enqueueCompilerSubmitJob({ user, body }) {
  const problemId = String(body.problemId || '').trim();
  const assessmentId = String(body.assessmentId || '').trim();
  const { languageId, languageKey } = resolveLanguageRequest(body);
  const problem = await resolveActiveProblem(problemId, { userId: user?._id, assessmentId });
  validateProblemLanguage(problem, languageKey);
  const sourceCode = validateProblemSourceCode(problem, languageKey, body.source_code, { action: 'submit' });

  const submission = await createTrackedSubmission({
    user,
    problem,
    mode: 'submit',
    language: languageKey,
    sourceCode,
    assessmentId: assessmentId || null,
  });
  submission.jobId = submission._id.toString();
  await submission.save();

  const queue = assessmentId ? assessmentQueue : submissionQueue;
  const jobName = assessmentId ? 'assessment-code-submit' : 'submit';

  return buildCompilerQueueJob({
    queue,
    jobName,
    user,
    problem,
    submission,
    assessmentId,
    mode: 'submit',
    languageId,
    languageKey,
    sourceCode,
  });
}

function extractStoredAnswer(answers = [], sectionIndex, questionIndex) {
  return answers.find((answer) => (
    Number(answer.sectionIndex) === Number(sectionIndex)
    && Number(answer.questionIndex) === Number(questionIndex)
  ));
}

function scoreAssessmentWithCoding(assessment, answers = []) {
  const answerMap = new Map();
  (answers || []).forEach((answer) => {
    answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer);
  });

  let score = 0;
  let maxMarks = 0;

  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      const questionType = question.type || section.type;
      const points = Number(question.points || question.marks || 0);
      maxMarks += points;

      const answer = answerMap.get(`${sectionIndex}-${questionIndex}`);
      if (!answer) return;

      if (questionType === 'mcq') {
        if (Number(answer.answer) === Number(question.correctOptionIndex)) {
          score += points;
        }
        return;
      }

      if (questionType === 'short' || questionType === 'one_line') {
        const expected = (question.expectedAnswer || '').trim().toLowerCase();
        const actual = (answer.answer || '').toString().trim().toLowerCase();
        if (!expected) return;
        if (actual === expected) {
          score += points;
        } else if (Array.isArray(question.keywords) && question.keywords.length > 0) {
          const matched = question.keywords.every((keyword) => actual.includes(String(keyword).toLowerCase()));
          if (matched) score += points;
        }
        return;
      }

      if (questionType === 'coding' && String(answer.executionVerdict || '').toUpperCase() === 'AC') {
        score += points;
      }
    });
  });

  const accuracy = maxMarks > 0 ? Math.round((score / maxMarks) * 10000) / 100 : 0;
  return { score, maxMarks, accuracy };
}

export async function enqueueAssessmentCodingEvaluationJobs({
  assessment,
  submission,
  studentId,
}) {
  const updatedAnswers = (submission.answers || []).map((answer) => ({
    ...answer.toObject?.() || answer,
  }));

  const queuedJobs = [];

  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      const questionType = question.type || section.type;
      if (questionType !== 'coding') return;

      const answer = extractStoredAnswer(updatedAnswers, sectionIndex, questionIndex);
      const problemId = question?.problemId || question?.coding?.problemId;
      const sourceCode = String(answer?.code || '').trim();
      const languageKey = String(answer?.language || question?.coding?.supportedLanguages?.[0] || DEFAULT_LANGUAGE).trim().toLowerCase();
      const languageId = KEY_TO_LANGUAGE_ID[languageKey];

      if (!problemId || !sourceCode || !languageId) {
        return;
      }

      const jobId = `${submission._id}:${sectionIndex}:${questionIndex}`;
      queuedJobs.push({
        jobId,
        sectionIndex,
        questionIndex,
        languageId,
        languageKey,
        sourceCode,
        problemId: String(problemId),
      });

      const answerIndex = updatedAnswers.findIndex((entry) => (
        Number(entry.sectionIndex) === Number(sectionIndex)
        && Number(entry.questionIndex) === Number(questionIndex)
      ));

      if (answerIndex >= 0) {
        updatedAnswers[answerIndex] = {
          ...updatedAnswers[answerIndex],
          jobId,
          executionStatus: 'queued',
          executionVerdict: 'PENDING',
          executionResult: null,
        };
      }
    });
  });

  submission.answers = updatedAnswers;
  submission.codingJobsPending = queuedJobs.length;
  submission.codingJobsCompleted = 0;
  submission.evaluationStatus = queuedJobs.length > 0 ? 'processing' : 'completed';
  await submission.save();

  await Promise.all(queuedJobs.map(async (jobDetails) => {
    const jobRecord = await createExecutionJobRecord({
      jobId: jobDetails.jobId,
      queueName: assessmentQueue.name,
      jobName: 'assessment-final-code-submit',
      userId: studentId,
      assessmentSubmissionId: submission._id,
      assessmentId: assessment._id,
      problemId: jobDetails.problemId,
      maxAttempts: DEFAULT_ATTEMPTS,
      metadata: {
        sectionIndex: jobDetails.sectionIndex,
        questionIndex: jobDetails.questionIndex,
        language: jobDetails.languageKey,
      },
    });

    await assessmentQueue.add('assessment-final-code-submit', {
      executionJobId: jobRecord.jobId,
      assessmentSubmissionId: submission._id.toString(),
      assessmentId: assessment._id.toString(),
      studentId: String(studentId),
      problemId: jobDetails.problemId,
      sectionIndex: jobDetails.sectionIndex,
      questionIndex: jobDetails.questionIndex,
      languageId: jobDetails.languageId,
      languageKey: jobDetails.languageKey,
      sourceCode: jobDetails.sourceCode,
    }, {
      jobId: jobRecord.jobId,
      attempts: DEFAULT_ATTEMPTS,
    });
  }));

  return queuedJobs.map((job) => job.jobId);
}

function buildJobResultPayload({ kind, submissionId = null, response, persisted }) {
  return {
    kind,
    submissionId,
    response,
    persisted: {
      status: persisted.status,
      passedTestCases: persisted.passedTestCases || 0,
      totalTestCases: persisted.totalTestCases || 0,
    },
  };
}

export async function processCompilerExecutionJob(job) {
  const attemptNumber = job.attemptsMade + 1;
  const isFinalAttempt = attemptNumber >= job.maxAttempts;
  await markExecutionJobProcessing(job.id, attemptNumber);

  const {
    executionJobId,
    submissionId,
    problemId,
    assessmentId,
    userId,
    languageId,
    languageKey,
    sourceCode,
    expectedOutput,
    runTestCases = [],
    standardInput = '',
  } = job.data || {};

  try {
    const problem = problemId
      ? await resolveActiveProblem(problemId, { userId, assessmentId })
      : null;
    const validatedSourceCode = problem
      ? validateProblemSourceCode(problem, languageKey, sourceCode, {
        action: job.name === 'run' || job.name === 'assessment-code-run' ? 'run' : 'submit',
      })
      : validateSourceCode(sourceCode, {
        action: job.name === 'run' || job.name === 'assessment-code-run' ? 'run' : 'submit',
      });

    if (submissionId) {
      await markSubmissionRunning(submissionId);
    }

    if (job.name === 'run' || job.name === 'assessment-code-run') {
      const runResult = Array.isArray(runTestCases) && runTestCases.length > 0
        ? await executeRunCasesPayload({
          sourceCode: validatedSourceCode,
          languageId,
          problem,
          runTestCases,
        })
        : await executeRunPayload({
          sourceCode: validatedSourceCode,
          languageId,
          standardInput,
          problem,
          expectedOutput,
        });

      if (submissionId) {
        await finalizeTrackedSubmission(submissionId, runResult.persisted);
        if (problem?._id) await refreshProblemStats(problem._id);
      }

      const resultPayload = buildJobResultPayload({
        kind: 'run',
        submissionId,
        response: runResult.response,
        persisted: runResult.persisted,
      });
      await markExecutionJobCompleted(executionJobId, resultPayload);
      return resultPayload;
    }

    const submitResult = await executeSubmitPayload({
      sourceCode: validatedSourceCode,
      languageId,
      problem,
    });

    if (submissionId) {
      await finalizeTrackedSubmission(submissionId, submitResult.persisted);
      if (problem?._id) await refreshProblemStats(problem._id);
    }

    if (submitResult.persisted.status === 'AC' && userId && problem?._id) {
      try {
        await createNotification({
          userId,
          title: 'Submission Result',
          message: 'Your solution passed all test cases',
          type: 'CODING',
          referenceId: problem._id,
          actionUrl: '/problems',
        });
      } catch (error) {
        console.error('[processCompilerExecutionJob] Notification error:', error.message);
      }
    }

    const responsePayload = buildSubmitApiResponse(submitResult.persisted);
    const resultPayload = buildJobResultPayload({
      kind: 'submit',
      submissionId,
      response: responsePayload,
      persisted: submitResult.persisted,
    });
    await markExecutionJobCompleted(executionJobId, resultPayload);
    return resultPayload;
  } catch (error) {
    if (isFinalAttempt && submissionId) {
      await finalizeTrackedSubmission(submissionId, {
        status: 'RE',
        output: '',
        stderr: error.message || 'Execution failed unexpectedly.',
        compileOutput: '',
        executionTimeMs: 0,
        memoryUsedKb: 0,
        totalTestCases: 0,
        passedTestCases: 0,
        provider: 'judge0-ce',
      });

      if (problemId) {
        await refreshProblemStats(problemId);
      }
    }

    await markExecutionJobFailed(executionJobId, error, {
      attemptsMade: attemptNumber,
      final: isFinalAttempt,
    });
    throw error;
  }
}

async function updateAssessmentAnswerExecutionState({
  assessmentSubmissionId,
  sectionIndex,
  questionIndex,
  executionJobId,
  executionStatus,
  executionVerdict,
  executionResult,
}) {
  const submission = await AssessmentSubmission.findById(assessmentSubmissionId);
  if (!submission) {
    throw new HttpError(404, 'Assessment submission not found.');
  }

  const answerIndex = submission.answers.findIndex((answer) => (
    Number(answer.sectionIndex) === Number(sectionIndex)
    && Number(answer.questionIndex) === Number(questionIndex)
  ));

  if (answerIndex < 0) {
    throw new HttpError(404, 'Assessment answer not found.');
  }

  submission.answers[answerIndex].jobId = executionJobId;
  submission.answers[answerIndex].executionStatus = executionStatus;
  submission.answers[answerIndex].executionVerdict = executionVerdict;
  submission.answers[answerIndex].executionResult = executionResult;
  submission.answers[answerIndex].lastEvaluatedAt = new Date();

  const trackedCodingAnswers = submission.answers.filter((answer) => Boolean(answer.jobId));
  submission.codingJobsPending = trackedCodingAnswers.length;
  submission.codingJobsCompleted = trackedCodingAnswers.filter((answer) => (
    answer.executionStatus === 'completed' || answer.executionStatus === 'failed'
  )).length;
  submission.evaluationStatus = submission.codingJobsCompleted >= submission.codingJobsPending
    ? 'completed'
    : 'processing';

  return submission;
}

async function processAssessmentFinalCodingJob(job) {
  const attemptNumber = job.attemptsMade + 1;
  const isFinalAttempt = attemptNumber >= job.maxAttempts;
  const {
    executionJobId,
    assessmentSubmissionId,
    assessmentId,
    studentId,
    problemId,
    sectionIndex,
    questionIndex,
    languageId,
    languageKey,
    sourceCode,
  } = job.data || {};

  await markExecutionJobProcessing(executionJobId, attemptNumber);
  await updateAssessmentAnswerExecutionState({
    assessmentSubmissionId,
    sectionIndex,
    questionIndex,
    executionJobId,
    executionStatus: 'processing',
    executionVerdict: 'PENDING',
    executionResult: null,
  }).then((submission) => submission.save());

  try {
    const [assessment, problem] = await Promise.all([
      Assessment.findById(assessmentId).lean(),
      resolveActiveProblem(problemId, { userId: studentId, assessmentId }),
    ]);
    if (!assessment) {
      throw new HttpError(404, 'Assessment not found.');
    }

    const submitResult = await executeSubmitPayload({
      sourceCode: validateProblemSourceCode(problem, languageKey, sourceCode, { action: 'submit' }),
      languageId,
      problem,
    });

    const submission = await updateAssessmentAnswerExecutionState({
      assessmentSubmissionId,
      sectionIndex,
      questionIndex,
      executionJobId,
      executionStatus: 'completed',
      executionVerdict: submitResult.persisted.status,
      executionResult: buildSubmitApiResponse(submitResult.persisted),
    });

    const scoring = scoreAssessmentWithCoding(assessment, submission.answers);
    submission.score = scoring.score;
    submission.maxMarks = scoring.maxMarks;
    submission.accuracy = scoring.accuracy;
    await submission.save();

    const resultPayload = {
      kind: 'assessment-submit',
      assessmentSubmissionId,
      sectionIndex,
      questionIndex,
      response: buildSubmitApiResponse(submitResult.persisted),
      persisted: {
        status: submitResult.persisted.status,
      },
    };
    await markExecutionJobCompleted(executionJobId, resultPayload);
    return resultPayload;
  } catch (error) {
    const executionVerdict = isFinalAttempt
      ? ((error?.status === 400) ? 'CE' : 'FAILED')
      : 'PENDING';

    const submission = await updateAssessmentAnswerExecutionState({
      assessmentSubmissionId,
      sectionIndex,
      questionIndex,
      executionJobId,
      executionStatus: isFinalAttempt ? 'failed' : 'queued',
      executionVerdict,
      executionResult: isFinalAttempt ? { error: error.message || 'Execution failed unexpectedly.' } : null,
    });

    if (isFinalAttempt) {
      const assessment = await Assessment.findById(assessmentId).lean();
      if (assessment) {
        const scoring = scoreAssessmentWithCoding(assessment, submission.answers);
        submission.score = scoring.score;
        submission.maxMarks = scoring.maxMarks;
        submission.accuracy = scoring.accuracy;
        submission.evaluationStatus = 'failed';
        await submission.save();
      } else {
        await submission.save();
      }
    } else {
      await submission.save();
    }

    await markExecutionJobFailed(executionJobId, error, {
      attemptsMade: attemptNumber,
      final: isFinalAttempt,
    });
    throw error;
  }
}

export async function processAssessmentExecutionJob(job) {
  if (job.name === 'assessment-final-code-submit') {
    return processAssessmentFinalCodingJob(job);
  }

  return processCompilerExecutionJob(job);
}
