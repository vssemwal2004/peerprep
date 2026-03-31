import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import TestCase from '../models/TestCase.js';
import { HttpError } from '../utils/errors.js';
import { validateObjectId } from '../utils/validators.js';
import { refreshProblemStats, serializeSubmission } from './compilerHelpers.js';

const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://ce.judge0.com';
const JUDGE0_AUTH_HEADER = String(process.env.JUDGE0_AUTH_HEADER || '').trim();
const JUDGE0_AUTH_TOKEN = String(process.env.JUDGE0_AUTH_TOKEN || '').trim();
const MAX_SOURCE_CODE_SIZE_BYTES = 50 * 1024;
const MAX_STDIN_SIZE_BYTES = 64 * 1024;
const MAX_TESTCASE_TEXT_BYTES = 64 * 1024;
const POLL_DELAY_MS = 1000;
const POLL_MAX_ATTEMPTS = 10;
const SUBMIT_CASE_DELAY_MS = 350;
const JUDGE0_REQUEST_TIMEOUT_MS = Number(process.env.JUDGE0_REQUEST_TIMEOUT_MS || 15000);
const DEFAULT_TIME_LIMIT_SECONDS = 2;
const DEFAULT_MEMORY_LIMIT_KB = 256 * 1024;

const LANGUAGE_ID_TO_KEY = {
  50: 'c',
  54: 'cpp',
  62: 'java',
  63: 'javascript',
  71: 'python',
};

const KEY_TO_LANGUAGE_ID = {
  c: 50,
  cpp: 54,
  java: 62,
  javascript: 63,
  python: 71,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeBase64(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).replace(/\s+/g, '');
  if (!text || text.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return false;
  return true;
}

function toBase64Utf8(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function fromBase64Utf8(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (!looksLikeBase64(text)) return text;
  try {
    const compactBase64 = text.replace(/\s+/g, '');
    const decoded = Buffer.from(compactBase64, 'base64').toString('utf8');
    const roundTripBase64 = Buffer.from(decoded, 'utf8').toString('base64');

    // Decode only when round-trip matches to avoid corrupting plain text that
    // accidentally matches base64 regex.
    if (roundTripBase64 === compactBase64) {
      return decoded;
    }
    return text;
  } catch {
    return text;
  }
}

function normalizeJudge0Result(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    stdout: fromBase64Utf8(result.stdout),
    stderr: fromBase64Utf8(result.stderr),
    compile_output: fromBase64Utf8(result.compile_output),
    message: fromBase64Utf8(result.message),
  };
}

function ensureObjectId(id, fieldName) {
  try {
    return validateObjectId(id, fieldName);
  } catch (error) {
    throw new HttpError(400, error.message || `Invalid ${fieldName}`);
  }
}

function sanitizeExecutionText(value, maxBytes, fieldName) {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new HttpError(400, `${fieldName} exceeds the ${Math.round(maxBytes / 1024)} KB limit.`);
  }
  return normalized;
}

function normalizeComparableOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function roundNumber(value, digits = 3) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Number(numericValue.toFixed(digits));
}

function secondsToMilliseconds(value) {
  return roundNumber(Number(value || 0) * 1000, 2);
}

function buildJudge0Error(message, statusCode = 502) {
  return new HttpError(statusCode, message);
}

function resolveLanguageRequest(body) {
  if (body.language_id !== undefined && body.language_id !== null && body.language_id !== '') {
    const languageId = Number(body.language_id);
    const languageKey = LANGUAGE_ID_TO_KEY[languageId];
    if (!languageKey) {
      throw new HttpError(400, 'Unsupported language_id. Use one of 50, 54, 62, 63, or 71.');
    }
    return { languageId, languageKey };
  }

  const languageKey = String(body.language || '').trim().toLowerCase();
  const languageId = KEY_TO_LANGUAGE_ID[languageKey];
  if (!languageId) {
    throw new HttpError(400, 'A supported language_id is required.');
  }

  return { languageId, languageKey };
}

async function judge0Request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE0_REQUEST_TIMEOUT_MS);
  const headers = {
    'Content-Type': 'application/json',
  };

  if (JUDGE0_AUTH_HEADER && JUDGE0_AUTH_TOKEN) {
    headers[JUDGE0_AUTH_HEADER] = JUDGE0_AUTH_TOKEN;
  }

  try {
    const response = await fetch(`${JUDGE0_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let parsedBody = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsedBody = { message: rawBody };
    }

    if (!response.ok) {
      const upstreamMessage = parsedBody.message
        || parsedBody.error
        || parsedBody.stderr
        || `Judge0 request failed with status ${response.status}.`;
      throw buildJudge0Error(upstreamMessage, response.status === 429 ? 503 : 502);
    }

    return parsedBody;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw buildJudge0Error('Judge0 request timed out.', 504);
    }
    throw error instanceof HttpError
      ? error
      : buildJudge0Error(error.message || 'Unable to reach Judge0.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runJudge0(source_code, language_id, stdin = '', options = {}) {
  const sourceCode = sanitizeExecutionText(source_code, MAX_SOURCE_CODE_SIZE_BYTES, 'Source code');
  const standardInput = sanitizeExecutionText(stdin, MAX_STDIN_SIZE_BYTES, 'Input');
  const languageId = Number(language_id);

  if (!LANGUAGE_ID_TO_KEY[languageId]) {
    throw new HttpError(400, 'Unsupported language_id.');
  }

  const submissionPayload = {
    source_code: toBase64Utf8(sourceCode),
    language_id: languageId,
    stdin: toBase64Utf8(standardInput),
    cpu_time_limit: roundNumber(options.cpuTimeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS, 2),
    wall_time_limit: roundNumber(options.wallTimeLimitSeconds || Math.max(5, (options.cpuTimeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS) * 2), 2),
    memory_limit: Math.trunc(options.memoryLimitKb || DEFAULT_MEMORY_LIMIT_KB),
    number_of_runs: 1,
    max_file_size: 1024,
  };

  const createSubmissionResponse = await judge0Request('/submissions/?base64_encoded=true&wait=false', {
    method: 'POST',
    body: submissionPayload,
  });

  if (!createSubmissionResponse.token) {
    throw buildJudge0Error('Judge0 did not return a submission token.');
  }

  let latestResult = null;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_DELAY_MS);
    latestResult = await judge0Request(`/submissions/${createSubmissionResponse.token}?base64_encoded=true`);
    const normalized = normalizeJudge0Result(latestResult);
    if ((normalized.status?.id || 0) > 2) {
      return normalized;
    }
  }

  throw buildJudge0Error('Judge0 did not finish processing in time.', 504);
}

function mapRunStatusCode(result) {
  if (result.compile_output || result.status?.id === 6) {
    return 'CE';
  }

  if (result.status?.id === 5) {
    return 'TLE';
  }

  if (result.stderr || (result.status?.id >= 7 && result.status?.id <= 13) || result.message) {
    return 'RE';
  }

  return 'AC';
}

function buildRunResponse(result) {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    compile_output: result.compile_output || '',
    status: result.status || { id: 13, description: 'Runtime Error (Other)' },
    time: roundNumber(result.time || 0, 3),
    memory: Math.trunc(Number(result.memory || 0)),
  };
}

function evaluateSubmissionResult(result, expectedOutput) {
  if (result.compile_output || result.status?.id === 6) {
    return {
      verdict: 'Compilation Error',
      internalStatus: 'CE',
      error: result.compile_output || 'Compilation failed.',
    };
  }

  if (result.status?.id === 5) {
    return {
      verdict: 'Time Limit Exceeded',
      internalStatus: 'TLE',
      error: result.message || 'Execution exceeded the configured time limit.',
    };
  }

  if (result.stderr || (result.status?.id >= 7 && result.status?.id <= 13) || result.message) {
    return {
      verdict: 'Runtime Error',
      internalStatus: 'RE',
      error: result.stderr || result.message || result.status?.description || 'Runtime error.',
    };
  }

  const actualOutput = result.stdout || '';
  const expected = String(expectedOutput ?? '');

  if (normalizeComparableOutput(actualOutput) !== normalizeComparableOutput(expected)) {
    return {
      verdict: 'Wrong Answer',
      internalStatus: 'WA',
      actualOutput,
      expectedOutput: expected,
    };
  }

  return {
    verdict: 'Accepted',
    internalStatus: 'AC',
    actualOutput,
    expectedOutput: expected,
  };
}

function emitSubmissionUpdate(req, submission) {
  const io = req.app.get('io');
  if (!io) return;

  io.emit('compiler-submission-updated', serializeSubmission(submission, {
    includeJudgeDetails: false,
  }));
}

async function createTrackedSubmission(req, problem, { mode, language, sourceCode, customInput = '' }) {
  const submission = await Submission.create({
    problem: problem._id,
    user: req.user._id,
    userSnapshot: {
      name: req.user.name || 'Student',
      email: req.user.email || '',
      role: req.user.role || 'student',
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
    status: 'PENDING',
    provider: 'judge0-ce',
    queuedAt: new Date(),
  });

  emitSubmissionUpdate(req, submission);
  return submission;
}

async function markSubmissionRunning(req, submission) {
  submission.status = 'RUNNING';
  submission.startedAt = new Date();
  await submission.save();
  emitSubmissionUpdate(req, submission);
}

async function finalizeTrackedSubmission(req, submission, payload) {
  submission.status = payload.status;
  submission.output = payload.output || '';
  submission.stderr = payload.stderr || '';
  submission.compileOutput = payload.compileOutput || '';
  submission.executionTimeMs = payload.executionTimeMs || 0;
  submission.memoryUsedKb = payload.memoryUsedKb || 0;
  submission.provider = 'judge0-ce';
  submission.failedCase = payload.failedCase || undefined;
  submission.testCaseResults = payload.testCaseResults || [];
  submission.totalTestCases = payload.totalTestCases || submission.totalTestCases || 0;
  submission.passedTestCases = payload.passedTestCases || 0;
  submission.completedAt = new Date();
  await submission.save();
  emitSubmissionUpdate(req, submission);
}

async function resolveActiveProblem(problemId) {
  ensureObjectId(problemId, 'Problem ID');
  const problem = await Problem.findById(problemId);
  if (!problem || problem.status !== 'Active') {
    throw new HttpError(404, 'Problem not found.');
  }
  return problem;
}

function validateProblemLanguage(problem, languageKey) {
  if (!problem.supportedLanguages.includes(languageKey)) {
    throw new HttpError(400, 'This language is not enabled for the selected problem.');
  }
}

function validateSourceCode(sourceCode) {
  const normalizedSourceCode = sanitizeExecutionText(sourceCode, MAX_SOURCE_CODE_SIZE_BYTES, 'Source code');
  if (!normalizedSourceCode.trim()) {
    throw new HttpError(400, 'Source code is required.');
  }
  return normalizedSourceCode;
}

function buildJudge0Options(problem) {
  return {
    cpuTimeLimitSeconds: problem?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    wallTimeLimitSeconds: Math.max(5, (problem?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS) * 2),
    memoryLimitKb: Math.trunc((problem?.memoryLimitMb || 256) * 1024),
  };
}

function pickReferenceSolution(problem, preferredLanguageKey = '') {
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

export async function runCode(req, res) {
  const { languageId, languageKey } = resolveLanguageRequest(req.body);
  const sourceCode = validateSourceCode(req.body.source_code);
  const standardInput = sanitizeExecutionText(req.body.stdin, MAX_STDIN_SIZE_BYTES, 'Input');
  const problemId = String(req.body.problemId || '').trim();

  let problem = null;
  let submission = null;

  if (problemId) {
    problem = await resolveActiveProblem(problemId);
    validateProblemLanguage(problem, languageKey);
    submission = await createTrackedSubmission(req, problem, {
      mode: 'run',
      language: languageKey,
      sourceCode,
      customInput: standardInput,
    });
    await markSubmissionRunning(req, submission);
  }

  try {
    const judgeResult = await runJudge0(sourceCode, languageId, standardInput, buildJudge0Options(problem));
    const responsePayload = buildRunResponse(judgeResult);

    if (submission) {
      await finalizeTrackedSubmission(req, submission, {
        status: mapRunStatusCode(judgeResult),
        output: responsePayload.stdout,
        stderr: responsePayload.stderr,
        compileOutput: responsePayload.compile_output,
        executionTimeMs: secondsToMilliseconds(responsePayload.time),
        memoryUsedKb: responsePayload.memory,
        totalTestCases: 0,
        passedTestCases: 0,
      });
      await refreshProblemStats(problem._id);
    }

    res.json(responsePayload);
  } catch (error) {
    if (submission) {
      await finalizeTrackedSubmission(req, submission, {
        status: 'RE',
        output: '',
        stderr: error.message || 'Execution failed unexpectedly.',
        compileOutput: '',
        executionTimeMs: 0,
        memoryUsedKb: 0,
        totalTestCases: 0,
        passedTestCases: 0,
      });
      await refreshProblemStats(problem._id);
    }
    throw error;
  }
}

export async function submitCode(req, res) {
  const problemId = String(req.body.problemId || '').trim();
  const { languageId, languageKey } = resolveLanguageRequest(req.body);
  const sourceCode = validateSourceCode(req.body.source_code);
  const problem = await resolveActiveProblem(problemId);
  validateProblemLanguage(problem, languageKey);

  const [sampleTestCases, hiddenTestCases] = await Promise.all([
    TestCase.find({ problem: problem._id, kind: 'sample' }).sort({ position: 1 }).lean(),
    TestCase.find({ problem: problem._id, kind: 'hidden' }).sort({ position: 1 }).lean(),
  ]);

  const allTestCases = hiddenTestCases.length > 0
    ? hiddenTestCases
    : sampleTestCases;

  if (allTestCases.length === 0) {
    throw new HttpError(400, 'No test cases are configured for this problem yet.');
  }

  allTestCases.forEach((testCase, index) => {
    sanitizeExecutionText(testCase.input, MAX_TESTCASE_TEXT_BYTES, `Test case input #${index + 1}`);
    sanitizeExecutionText(testCase.output, MAX_TESTCASE_TEXT_BYTES, `Test case output #${index + 1}`);
  });

  const submission = await createTrackedSubmission(req, problem, {
    mode: 'submit',
    language: languageKey,
    sourceCode,
  });
  await markSubmissionRunning(req, submission);

  const judge0Options = buildJudge0Options(problem);
  const testCaseResults = [];
  let totalTimeSeconds = 0;
  let peakMemoryKb = 0;
  let passed = 0;

  try {
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
      });

      if (evaluation.internalStatus !== 'AC') {
        const failedPayload = {
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
        };

        await finalizeTrackedSubmission(req, submission, failedPayload);
        await refreshProblemStats(problem._id);

        if (evaluation.internalStatus === 'WA') {
          return res.json({
            status: 'Wrong Answer',
            passed,
            total: allTestCases.length,
            time: roundNumber(totalTimeSeconds, 3),
            memory: peakMemoryKb,
            failedTestCase: {
              index: index + 1,
              input: testCase.input || '',
              expected: testCase.output || '',
              actual: evaluation.actualOutput || judgeResult.stdout || '',
            },
          });
        }

        if (evaluation.internalStatus === 'CE') {
          return res.json({
            status: 'Compilation Error',
            error: evaluation.error,
            time: roundNumber(totalTimeSeconds, 3),
            memory: peakMemoryKb,
          });
        }

        if (evaluation.internalStatus === 'TLE') {
          return res.json({
            status: 'Time Limit Exceeded',
            passed,
            total: allTestCases.length,
            time: roundNumber(totalTimeSeconds, 3),
            memory: peakMemoryKb,
          });
        }

        return res.json({
          status: 'Runtime Error',
          error: evaluation.error,
          passed,
          total: allTestCases.length,
          time: roundNumber(totalTimeSeconds, 3),
          memory: peakMemoryKb,
        });
      }

      passed += 1;

      if (index < allTestCases.length - 1) {
        await sleep(SUBMIT_CASE_DELAY_MS);
      }
    }

    await finalizeTrackedSubmission(req, submission, {
      status: 'AC',
      output: '',
      stderr: '',
      compileOutput: '',
      executionTimeMs: secondsToMilliseconds(totalTimeSeconds),
      memoryUsedKb: peakMemoryKb,
      totalTestCases: allTestCases.length,
      passedTestCases: allTestCases.length,
      testCaseResults,
    });
    await refreshProblemStats(problem._id);

    return res.json({
      status: 'Accepted',
      passed: allTestCases.length,
      total: allTestCases.length,
      time: roundNumber(totalTimeSeconds, 3),
      memory: peakMemoryKb,
    });
  } catch (error) {
    await finalizeTrackedSubmission(req, submission, {
      status: 'RE',
      output: '',
      stderr: error.message || 'Submission failed unexpectedly.',
      compileOutput: '',
      executionTimeMs: secondsToMilliseconds(totalTimeSeconds),
      memoryUsedKb: peakMemoryKb,
      totalTestCases: allTestCases.length,
      passedTestCases: passed,
      testCaseResults,
    });
    await refreshProblemStats(problem._id);
    throw error;
  }
}

export async function getExpectedOutput(req, res) {
  const problemId = String(req.params.id || req.body.problemId || '').trim();
  const problem = await resolveActiveProblem(problemId);

  const standardInput = sanitizeExecutionText(
    req.body.stdin ?? req.body.customInput ?? '',
    MAX_STDIN_SIZE_BYTES,
    'Input',
  );

  const preferredLanguageKey = String(req.body.language || '').trim().toLowerCase();
  const reference = pickReferenceSolution(problem, preferredLanguageKey);
  if (!reference) {
    throw new HttpError(409, 'Expected output is not available for this problem.');
  }

  const referenceLanguageId = KEY_TO_LANGUAGE_ID[reference.languageKey];
  if (!referenceLanguageId) {
    throw new HttpError(500, 'Reference solution is configured with an unsupported language.');
  }

  const judgeResult = await runJudge0(
    reference.sourceCode,
    referenceLanguageId,
    standardInput,
    buildJudge0Options(problem),
  );

  const statusCode = mapRunStatusCode(judgeResult);
  if (statusCode !== 'AC') {
    throw new HttpError(502, 'Expected output is currently unavailable.');
  }

  const responsePayload = buildRunResponse(judgeResult);
  res.json({
    expectedOutput: responsePayload.stdout || '',
    language: reference.languageKey,
  });
}
