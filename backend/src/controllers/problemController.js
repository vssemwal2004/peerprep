import Problem, { SUPPORTED_LANGUAGES } from '../models/Problem.js';
import Submission from '../models/Submission.js';
import TestCase from '../models/TestCase.js';
import { HttpError } from '../utils/errors.js';
import { sanitizeSearchQuery, sanitizeString, validateObjectId, validatePagination } from '../utils/validators.js';
import { refreshProblemStats, serializeProblem, serializeSubmission, serializeStudentSubmission } from './compilerHelpers.js';
import { runJudge0 } from '../services/executionService.js';
import { removeProblemFromLibrary, syncProblemToLibrary } from '../services/questionLibraryService.js';
import { parseBulkCasePair } from '../utils/testcaseBulkParser.js';
import { isS3TestcaseStorageEnabled, readS3TextObject, uploadS3TextObject } from '../utils/s3.js';

const STATUS_MAP = {
  draft: 'draft',
  Draft: 'draft',
  published: 'published',
  Published: 'published',
  active: 'published',
  Active: 'published',
};

const DIFFICULTY_SORT_BRANCHES = [
  { case: { $eq: ['$difficulty', 'Easy'] }, then: 1 },
  { case: { $eq: ['$difficulty', 'Medium'] }, then: 2 },
  { case: { $eq: ['$difficulty', 'Hard'] }, then: 3 },
];

const DEFAULT_TIME_LIMIT_SECONDS = 2;
const DEFAULT_MEMORY_LIMIT_MB = 256;

const KEY_TO_LANGUAGE_ID = {
  c: 50,
  cpp: 54,
  java: 62,
  javascript: 63,
  python: 71,
};

function isAdminRequest(req) {
  return req.user?.role === 'admin';
}

function isCoordinatorRequest(req) {
  return req.user?.role === 'coordinator';
}

function isStudentRequest(req) {
  return req.user?.role === 'student';
}

function roundNumber(value, digits = 3) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function secondsToMilliseconds(value) {
  return roundNumber(Number(value || 0) * 1000, 2);
}

function normalizeComparableOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function buildJudge0Options(problem) {
  const timeLimit = Number(problem?.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS);
  const memoryLimitMb = Number(problem?.memoryLimitMb || DEFAULT_MEMORY_LIMIT_MB);
  return {
    cpuTimeLimitSeconds: timeLimit,
    wallTimeLimitSeconds: Math.max(5, timeLimit * 2),
    memoryLimitKb: Math.trunc(memoryLimitMb * 1024),
  };
}

function evaluateJudge0Case(judgeResult, expectedOutput = '') {
  if (judgeResult.compile_output || judgeResult.status?.id === 6) {
    return {
      status: 'CE',
      error: judgeResult.compile_output || 'Compilation failed.',
    };
  }

  if (judgeResult.status?.id === 5) {
    return {
      status: 'TLE',
      error: judgeResult.message || 'Execution exceeded time limit.',
    };
  }

  if (judgeResult.stderr || (judgeResult.status?.id >= 7 && judgeResult.status?.id <= 13) || judgeResult.message) {
    return {
      status: 'RE',
      error: judgeResult.stderr || judgeResult.message || judgeResult.status?.description || 'Runtime error.',
    };
  }

  const actualOutput = judgeResult.stdout || '';
  const expected = String(expectedOutput ?? '');
  if (normalizeComparableOutput(actualOutput) !== normalizeComparableOutput(expected)) {
    return {
      status: 'WA',
      actualOutput,
      expectedOutput: expected,
    };
  }

  return {
    status: 'AC',
    actualOutput,
    expectedOutput: expected,
  };
}

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new HttpError(400, 'Invalid compiler payload format.');
  }
}

function ensureObjectId(id, fieldName) {
  try {
    return validateObjectId(id, fieldName);
  } catch (error) {
    throw new HttpError(400, error.message || `Invalid ${fieldName}`);
  }
}

function normalizeProblemTitleText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureUniqueProblemTitle(title, excludeProblemId = null) {
  const normalizedTitle = normalizeProblemTitleText(title);
  if (!normalizedTitle) {
    return;
  }

  const duplicate = await Problem.findOne({
    ...(excludeProblemId ? { _id: { $ne: excludeProblemId } } : {}),
    title: { $regex: `^${escapeRegex(normalizedTitle)}$`, $options: 'i' },
  }).select('_id title');

  if (duplicate) {
    throw new HttpError(409, `A compiler problem named "${duplicate.title}" already exists. Use a unique question title.`);
  }
}

function normalizeUniqueList(values) {
  const seen = new Map();

  (values || []).forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  });

  return Array.from(seen.values());
}

function parseCommaOrJsonList(value) {
  if (Array.isArray(value)) {
    return normalizeUniqueList(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      return normalizeUniqueList(parseJsonField(trimmed, []));
    }

    return normalizeUniqueList(trimmed.split(','));
  }

  return [];
}

function normalizeSupportedLanguages(value) {
  const requested = parseCommaOrJsonList(value);
  const normalized = requested
    .map((language) => language.toLowerCase())
    .filter((language) => SUPPORTED_LANGUAGES.includes(language));

  return normalizeUniqueList(normalized);
}

function normalizeStatus(value) {
  const normalized = STATUS_MAP[value] || STATUS_MAP[String(value || '').trim()];
  return normalized || 'draft';
}

function normalizeVisibility(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['public', 'assessment', 'private'].includes(normalized)) return normalized;
  return 'public';
}

function isPublishedStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'published' || normalized === 'active';
}

function parseNumber(value, fallback, { min, max, integer = false }) {
  const parsedValue = value === undefined || value === null || value === ''
    ? fallback
    : Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new HttpError(400, 'Execution limits must be valid numbers.');
  }

  const finalValue = integer ? Math.trunc(parsedValue) : parsedValue;
  if (finalValue < min || finalValue > max) {
    throw new HttpError(400, `Value must be between ${min} and ${max}.`);
  }

  return finalValue;
}

function normalizeSampleTestCases(value) {
  const parsedCases = parseJsonField(value, []);
  if (!Array.isArray(parsedCases)) {
    throw new HttpError(400, 'Sample test cases must be an array.');
  }

  return parsedCases
    .map((testCase, index) => ({
      position: index + 1,
      input: String(testCase?.input ?? ''),
      output: String(testCase?.output ?? ''),
      explanation: sanitizeString(testCase?.explanation ?? '', 4000),
    }))
    .filter((testCase) => testCase.input || testCase.output || testCase.explanation);
}

function normalizeHiddenTestCases(value) {
  const parsedCases = parseJsonField(value, []);
  if (!Array.isArray(parsedCases)) {
    throw new HttpError(400, 'Hidden test cases must be an array.');
  }

  return parsedCases
    .map((testCase, index) => ({
      position: index + 1,
      input: String(testCase?.input ?? ''),
      output: String(testCase?.output ?? ''),
    }))
    .filter((testCase) => testCase.input || testCase.output);
}

function extractHiddenTestCasesFromFiles(files = []) {
  const hiddenFiles = files.filter((file) => file.fieldname === 'hiddenTestFiles');
  if (hiddenFiles.length === 0) {
    return null;
  }

  const pairs = new Map();

  hiddenFiles.forEach((file) => {
    const originalName = String(file.originalname || '').trim();
    const match = originalName.match(/^(input|output)_([^.]+)\.txt$/i);

    if (!match) {
      throw new HttpError(400, `Hidden test case file "${originalName}" must follow the input_1.txt / output_1.txt naming pattern.`);
    }

    const kind = match[1].toLowerCase();
    const pairKey = match[2];
    if (!pairs.has(pairKey)) {
      pairs.set(pairKey, {});
    }

    pairs.get(pairKey)[kind] = file.buffer.toString('utf8');
  });

  return Array.from(pairs.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([pairKey, pair], index) => {
      if (pair.input === undefined || pair.output === undefined) {
        throw new HttpError(400, `Hidden test case pair "${pairKey}" is incomplete. Both input and output files are required.`);
      }

      return {
        position: index + 1,
        input: pair.input,
        output: pair.output,
      };
    });
}

function extractBulkHiddenFiles(files = []) {
  const inputFile = files.find((file) => file.fieldname === 'hiddenBulkInputFile');
  const outputFile = files.find((file) => file.fieldname === 'hiddenBulkOutputFile');

  if (!inputFile && !outputFile) {
    return null;
  }

  if (!inputFile || !outputFile) {
    throw new HttpError(400, 'Both hidden bulk files are required: hiddenBulkInputFile and hiddenBulkOutputFile.');
  }

  return { inputFile, outputFile };
}

function normalizeHiddenBulkDelimiter(value) {
  const delimiter = String(value ?? '').trim();
  return delimiter || '###CASE###';
}

function normalizeCodeTemplates(value, supportedLanguages) {
  const parsedTemplates = parseJsonField(value, {});
  if (!parsedTemplates || Array.isArray(parsedTemplates) || typeof parsedTemplates !== 'object') {
    throw new HttpError(400, 'Code templates must be an object.');
  }

  const templates = {};

  supportedLanguages.forEach((language) => {
    const template = String(parsedTemplates[language] ?? '');
    templates[language] = template.replace(/\r\n/g, '\n');
  });

  return templates;
}

function normalizeReferenceSolutions(value, supportedLanguages) {
  if (value === undefined) {
    return null;
  }

  const parsedSolutions = parseJsonField(value, {});
  if (!parsedSolutions || Array.isArray(parsedSolutions) || typeof parsedSolutions !== 'object') {
    throw new HttpError(400, 'Reference solutions must be an object.');
  }

  const referenceSolutions = {};

  supportedLanguages.forEach((language) => {
    if (parsedSolutions[language] === undefined || parsedSolutions[language] === null) {
      return;
    }

    const code = String(parsedSolutions[language] ?? '');
    if (!code.trim()) {
      return;
    }

    if (Buffer.byteLength(code, 'utf8') > 100 * 1024) {
      throw new HttpError(400, `${language} reference solution exceeds the 100 KB limit.`);
    }

    referenceSolutions[language] = code.replace(/\r\n/g, '\n');
  });

  return referenceSolutions;
}

function countReferenceSolutions(value) {
  if (!value) return 0;
  if (value instanceof Map) {
    return Array.from(value.values()).filter((entry) => String(entry || '').trim()).length;
  }

  if (typeof value === 'object') {
    return Object.values(value).filter((entry) => String(entry || '').trim()).length;
  }

  return 0;
}

function buildProblemPayload(
  req,
  {
    existingHiddenTestCaseCount = 0,
    existingHiddenBulkCaseCount = 0,
  } = {},
) {
  const title = normalizeProblemTitleText(sanitizeString(req.body.title, 200));
  if (!title) {
    throw new HttpError(400, 'Problem title is required.');
  }

  const supportedLanguages = normalizeSupportedLanguages(req.body.supportedLanguages);
  if (supportedLanguages.length === 0) {
    throw new HttpError(400, 'Select at least one supported language.');
  }

  const status = normalizeStatus(req.body.status);
  const sampleTestCasesProvided = req.body.sampleTestCases !== undefined;
  const hiddenTestCasesFromFiles = extractHiddenTestCasesFromFiles(req.files || []);
  const bulkHiddenFiles = extractBulkHiddenFiles(req.files || []);
  const hiddenBulkDelimiter = normalizeHiddenBulkDelimiter(req.body.hiddenBulkDelimiter);
  const hiddenBulkCases = bulkHiddenFiles
    ? parseBulkCasePair(
      bulkHiddenFiles.inputFile.buffer.toString('utf8'),
      bulkHiddenFiles.outputFile.buffer.toString('utf8'),
      hiddenBulkDelimiter,
    )
    : null;
  const hiddenTestCasesProvided = hiddenTestCasesFromFiles !== null || req.body.hiddenTestCases !== undefined;
  const hiddenBulkProvided = hiddenBulkCases !== null;
  if (hiddenBulkProvided && hiddenTestCasesProvided) {
    throw new HttpError(400, 'Use either bulk hidden files (S3 mode) or per-case hidden files/JSON (DB mode), not both.');
  }
  const sampleTestCases = sampleTestCasesProvided ? normalizeSampleTestCases(req.body.sampleTestCases) : null;
  const hiddenTestCases = hiddenTestCasesFromFiles
    || (req.body.hiddenTestCases !== undefined ? normalizeHiddenTestCases(req.body.hiddenTestCases) : null);

  if (status === 'published') {
    const effectiveSampleCount = sampleTestCases ? sampleTestCases.length : 0;
    const effectiveHiddenCount = hiddenBulkCases
      ? hiddenBulkCases.length
      : (hiddenTestCases ? hiddenTestCases.length : Math.max(existingHiddenTestCaseCount, existingHiddenBulkCaseCount));

    if (effectiveSampleCount === 0) {
      throw new HttpError(400, 'Publishing a problem requires at least one sample test case.');
    }

    if (effectiveHiddenCount === 0) {
      throw new HttpError(400, 'Publishing a problem requires at least one hidden test case pair.');
    }
  }

  const problem = {
    title,
    description: String(req.body.description ?? ''),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(req.body.difficulty) ? req.body.difficulty : 'Easy',
    tags: parseCommaOrJsonList(req.body.tags),
    companyTags: parseCommaOrJsonList(req.body.companyTags),
    supportedLanguages,
    codeTemplates: normalizeCodeTemplates(req.body.codeTemplates, supportedLanguages),
    referenceSolutions: normalizeReferenceSolutions(req.body.referenceSolutions, supportedLanguages),
    inputFormat: String(req.body.inputFormat ?? ''),
    outputFormat: String(req.body.outputFormat ?? ''),
    constraints: String(req.body.constraints ?? ''),
    timeLimitSeconds: parseNumber(req.body.timeLimitSeconds ?? req.body.timeLimit, 2, { min: 1, max: 15, integer: false }),
    memoryLimitMb: parseNumber(req.body.memoryLimitMb ?? req.body.memoryLimit, 256, { min: 64, max: 1024, integer: true }),
    status,
    visibility: normalizeVisibility(req.body.visibility),
  };

  return {
    problem,
    sampleTestCases,
    hiddenTestCases: hiddenTestCases || [],
    sampleTestCasesProvided,
    hiddenTestCasesProvided: hiddenTestCasesProvided || hiddenBulkProvided,
    hiddenBulkProvided,
    hiddenBulkDelimiter,
    hiddenBulkCases,
  };
}

function statusLabel(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'AC') return 'Accepted';
  if (normalized === 'WA') return 'Wrong Answer';
  if (normalized === 'TLE') return 'Time Limit Exceeded';
  if (normalized === 'RE') return 'Runtime Error';
  if (normalized === 'CE') return 'Compilation Error';
  return status || 'Result';
}

async function loadHiddenExecutionTestCases(problem) {
  const hiddenTestCasesDb = await TestCase.find({
    problem: problem._id,
    kind: 'hidden',
  }).sort({ position: 1 }).lean();

  let hiddenTestCases = hiddenTestCasesDb;
  const isS3HiddenSource = problem.hiddenTestSource?.provider === 's3'
    && problem.hiddenTestSource?.inputObjectKey
    && problem.hiddenTestSource?.outputObjectKey;

  if (hiddenTestCases.length === 0 && isS3HiddenSource) {
    try {
      const [inputsBlob, outputsBlob] = await Promise.all([
        readS3TextObject(problem.hiddenTestSource.inputObjectKey),
        readS3TextObject(problem.hiddenTestSource.outputObjectKey),
      ]);
      hiddenTestCases = parseBulkCasePair(
        inputsBlob,
        outputsBlob,
        problem.hiddenTestSource.delimiter || '###CASE###',
      );
    } catch (error) {
      throw new HttpError(500, `Failed to load hidden S3 testcases: ${error.message}`);
    }
  }

  if (hiddenTestCases.length === 0) {
    throw new HttpError(400, 'At least one hidden/internal testcase is required before preview approval.');
  }

  return hiddenTestCases;
}

async function evaluateOfficialSolution(problem, { language, sourceCode, testCases }) {
  const languageId = KEY_TO_LANGUAGE_ID[language];
  if (!languageId) {
    throw new HttpError(400, `Unsupported official solution language "${language}".`);
  }

  const testCaseResults = [];
  let totalExecutionTimeSeconds = 0;
  let peakMemoryKb = 0;
  let passedTestCases = 0;
  let failure = null;

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index];
    const judgeResult = await runJudge0(
      sourceCode,
      languageId,
      testCase.input || '',
      buildJudge0Options(problem),
    );
    const evaluation = evaluateJudge0Case(judgeResult, testCase.output || '');
    const executionTimeMs = secondsToMilliseconds(judgeResult.time);
    const memoryUsedKb = Math.trunc(Number(judgeResult.memory || 0));

    totalExecutionTimeSeconds += Number(judgeResult.time || 0);
    peakMemoryKb = Math.max(peakMemoryKb, memoryUsedKb);

    const normalizedStatus = statusLabel(evaluation.status);
    const entry = {
      index: index + 1,
      status: evaluation.status,
      label: normalizedStatus,
      input: testCase.input || '',
      expectedOutput: testCase.output || '',
      actualOutput: judgeResult.stdout || '',
      executionTimeMs,
      memoryUsedKb,
      stderr: evaluation.status === 'RE' || evaluation.status === 'TLE' ? (evaluation.error || '') : '',
      compileOutput: evaluation.status === 'CE' ? (evaluation.error || '') : '',
    };

    testCaseResults.push(entry);

    if (evaluation.status !== 'AC') {
      failure = entry;
      break;
    }

    passedTestCases += 1;
  }

  return {
    language,
    status: failure?.status || 'AC',
    passedTestCases,
    totalTestCases: testCases.length,
    executionTimeMs: secondsToMilliseconds(totalExecutionTimeSeconds),
    memoryUsedKb: peakMemoryKb,
    failedCase: failure,
    testCaseResults,
  };
}

async function replaceTestCases(problemId, userId, { sampleTestCases, hiddenTestCases, sampleTestCasesProvided, hiddenTestCasesProvided }) {
  if (sampleTestCasesProvided) {
    await TestCase.deleteMany({ problem: problemId, kind: 'sample' });

    if (sampleTestCases.length > 0) {
      await TestCase.insertMany(sampleTestCases.map((testCase) => ({
        problem: problemId,
        kind: 'sample',
        position: testCase.position,
        input: testCase.input,
        output: testCase.output,
        explanation: testCase.explanation,
        createdBy: userId,
      })));
    }
  }

  if (hiddenTestCasesProvided) {
    await TestCase.deleteMany({ problem: problemId, kind: 'hidden' });

    if ((hiddenTestCases || []).length > 0) {
      await TestCase.insertMany(hiddenTestCases.map((testCase) => ({
        problem: problemId,
        kind: 'hidden',
        position: testCase.position,
        input: testCase.input,
        output: testCase.output,
        createdBy: userId,
      })));
    }
  }
}

async function uploadHiddenBulkToS3(problemId, payload) {
  if (!payload.hiddenBulkProvided || !payload.hiddenBulkCases) {
    return null;
  }

  if (!isS3TestcaseStorageEnabled()) {
    throw new HttpError(500, 'S3 testcase storage is not configured on the server.');
  }

  const inputs = payload.hiddenBulkCases.map((entry) => entry.input).join(`\n${payload.hiddenBulkDelimiter}\n`);
  const outputs = payload.hiddenBulkCases.map((entry) => entry.output).join(`\n${payload.hiddenBulkDelimiter}\n`);
  const versionTag = Date.now();

  const inputObjectKey = await uploadS3TextObject({
    key: `${problemId}/hidden/${versionTag}/inputs.txt`,
    text: inputs,
  });

  const outputObjectKey = await uploadS3TextObject({
    key: `${problemId}/hidden/${versionTag}/outputs.txt`,
    text: outputs,
  });

  return {
    provider: 's3',
    inputObjectKey,
    outputObjectKey,
    delimiter: payload.hiddenBulkDelimiter,
    caseCount: payload.hiddenBulkCases.length,
  };
}

async function getStudentProblemStatus(userId, problemId) {
  const acceptedSubmission = await Submission.exists({
    user: userId,
    problem: problemId,
    mode: 'submit',
    status: 'AC',
  });

  return acceptedSubmission ? 'Solved' : 'Unsolved';
}

async function attachStudentStatuses(userId, problems) {
  if (!userId || problems.length === 0) {
    return problems;
  }

  const problemIds = problems.map((problem) => problem._id);
  const solvedProblemIds = await Submission.distinct('problem', {
    user: userId,
    problem: { $in: problemIds },
    mode: 'submit',
    status: 'AC',
  });

  const solvedSet = new Set(solvedProblemIds.map((id) => String(id)));
  return problems.map((problem) => ({
    ...problem,
    studentStatus: solvedSet.has(String(problem._id)) ? 'Solved' : 'Unsolved',
  }));
}

async function loadProblemShape(
  problemId,
  {
    studentStatus = null,
    includeHiddenTestCases = false,
    includeReferenceSolutions = false,
  } = {},
) {
  const [problem, sampleTestCases, hiddenTestCaseCount, hiddenTestCases] = await Promise.all([
    Problem.findById(problemId).lean(),
    TestCase.find({ problem: problemId, kind: 'sample' })
      .sort({ position: 1 })
      .lean(),
    TestCase.countDocuments({ problem: problemId, kind: 'hidden' }),
    includeHiddenTestCases
      ? TestCase.find({ problem: problemId, kind: 'hidden' })
        .sort({ position: 1 })
        .lean()
      : Promise.resolve([]),
  ]);

  if (!problem) {
    throw new HttpError(404, 'Problem not found.');
  }

  const effectiveHiddenTestCaseCount = Math.max(
    Number(hiddenTestCaseCount || 0),
    Number(problem.hiddenTestSource?.caseCount || 0),
  );

  return {
    problem,
    serializedProblem: serializeProblem(problem, {
      sampleTestCases: sampleTestCases.map((testCase) => ({
        input: testCase.input,
        output: testCase.output,
        explanation: testCase.explanation || '',
      })),
      hiddenTestCaseCount: effectiveHiddenTestCaseCount,
      hiddenTestCases: hiddenTestCases.map((testCase) => ({
        input: testCase.input || '',
        output: testCase.output || '',
      })),
      includeHiddenTestCases,
      includeReferenceSolutions,
      studentStatus,
    }),
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
      name: req.user.name || 'User',
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
    queuedAt: new Date(),
  });

  emitSubmissionUpdate(req, submission);
  return submission;
}

async function finalizeSubmission(req, submission, result) {
  submission.status = result.status;
  submission.output = result.output || '';
  submission.stderr = result.stderr || '';
  submission.compileOutput = result.compileOutput || result.compile_output || '';
  submission.executionTimeMs = result.executionTimeMs || 0;
  submission.memoryUsedKb = result.memoryUsedKb || 0;
  submission.provider = result.provider || 'local-sandbox';
  submission.failedCase = result.failedCase || undefined;
  submission.testCaseResults = result.testCaseResults || [];
  submission.totalTestCases = result.totalTestCases || submission.totalTestCases || 0;
  submission.passedTestCases = result.passedTestCases || 0;
  submission.completedAt = new Date();
  await submission.save();

  emitSubmissionUpdate(req, submission);
  return submission;
}

async function markSubmissionRunning(req, submission) {
  submission.status = 'RUNNING';
  submission.startedAt = new Date();
  await submission.save();
  emitSubmissionUpdate(req, submission);
}

async function resolveExecutionProblem(req) {
  const problemId = req.params.id || req.body.problemId;
  ensureObjectId(problemId, 'Problem ID');

  const problem = await Problem.findById(problemId);
  if (!problem) {
    throw new HttpError(404, 'Problem not found.');
  }

  const visibility = problem.visibility || 'public';
  if (!isAdminRequest(req) && !(isCoordinatorRequest(req) && String(problem.createdBy) === String(req.user._id)) && (!isPublishedStatus(problem.status) || visibility !== 'public')) {
    throw new HttpError(404, 'Problem not found.');
  }

  return problem;
}

function buildSubmissionResponse(req, submission) {
  return isStudentRequest(req)
    ? serializeStudentSubmission(submission)
    : serializeSubmission(submission);
}

export async function getCompilerOverview(req, res) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 6);

  const baseQuery = isCoordinatorRequest(req) ? { createdBy: req.user._id } : {};

  const [
    totalProblems,
    activeProblems,
    totalSubmissions,
    acceptedSubmissions,
    dailySubmissionAggregation,
    difficultyAggregation,
    recentProblems,
    recentSubmissions,
  ] = await Promise.all([
    Problem.countDocuments(baseQuery),
    Problem.countDocuments({ ...baseQuery, status: { $in: ['published', 'Active', 'active'] } }),
    Submission.countDocuments({ mode: 'submit' }),
    Submission.countDocuments({ mode: 'submit', status: 'AC' }),
    Submission.aggregate([
      { $match: { mode: 'submit', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Problem.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 },
        },
      },
    ]),
    Problem.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title difficulty status createdAt')
      .lean(),
    Submission.find({ mode: 'submit' })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const dailySubmissionMap = new Map(
    dailySubmissionAggregation.map((entry) => [entry._id, entry.count]),
  );

  const dailySubmissions = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      count: dailySubmissionMap.get(key) || 0,
    };
  });

  const difficultyDistribution = ['Easy', 'Medium', 'Hard'].map((difficulty) => ({
    difficulty,
    count: difficultyAggregation.find((entry) => entry._id === difficulty)?.count || 0,
  }));

  const acceptanceRate = totalSubmissions > 0
    ? Number(((acceptedSubmissions / totalSubmissions) * 100).toFixed(2))
    : 0;

  res.json({
    stats: {
      totalProblems,
      activeProblems,
      totalSubmissions,
      acceptanceRate,
    },
    dailySubmissions,
    difficultyDistribution,
    recentProblems: recentProblems.map((problem) => ({
      _id: problem._id,
      title: problem.title,
      difficulty: problem.difficulty,
      status: problem.status,
      createdAt: problem.createdAt,
    })),
    recentSubmissions: recentSubmissions.map((submission) => serializeSubmission(submission, {
      includeJudgeDetails: false,
    })),
  });
}

export async function listProblems(req, res) {
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const search = sanitizeSearchQuery(req.query.search || '');
  const difficulty = String(req.query.difficulty || '').trim();
  const status = String(req.query.status || '').trim();
  const tagFilters = parseCommaOrJsonList(req.query.tags);
  const sortBy = String(req.query.sortBy || 'updatedAt');
  const sortOrder = String(req.query.sortOrder || 'desc') === 'asc' ? 1 : -1;
  const accessQuery = isAdminRequest(req)
    ? {}
    : isCoordinatorRequest(req)
      ? { createdBy: req.user._id }
      : { status: { $in: ['published', 'Active', 'active'] }, $or: [{ visibility: 'public' }, { visibility: { $exists: false } }] };
  const query = { ...accessQuery };

  if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
    query.difficulty = difficulty;
  }

  if ((isAdminRequest(req) || isCoordinatorRequest(req)) && status && ['draft', 'published', 'Draft', 'Active', 'Published'].includes(status)) {
    const normalizedStatus = normalizeStatus(status);
    query.status = normalizedStatus === 'published'
      ? { $in: ['published', 'Active', 'active'] }
      : { $in: ['draft', 'Draft'] };
  }

  if ((isAdminRequest(req) || isCoordinatorRequest(req)) && req.query.visibility) {
    query.visibility = normalizeVisibility(req.query.visibility);
  }

  if (tagFilters.length > 0) {
    query.tags = {
      $in: tagFilters.map((tag) => new RegExp(`^${sanitizeSearchQuery(tag)}$`, 'i')),
    };
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { title: regex },
      { tags: regex },
      { companyTags: regex },
    ];
  }

  const sortMap = {
    title: { title: sortOrder, createdAt: -1 },
    createdAt: { createdAt: sortOrder },
    updatedAt: { updatedAt: sortOrder },
    totalSubmissions: { 'stats.totalSubmissions': sortOrder, updatedAt: -1 },
    acceptanceRate: { 'stats.acceptanceRate': sortOrder, updatedAt: -1 },
  };

  const problemsPromise = sortBy === 'difficulty'
    ? Problem.aggregate([
      { $match: query },
      {
        $addFields: {
          difficultySortRank: {
            $switch: {
              branches: DIFFICULTY_SORT_BRANCHES,
              default: 4,
            },
          },
        },
      },
      { $sort: { difficultySortRank: sortOrder, title: 1, updatedAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ])
    : Problem.find(query)
      .sort(sortMap[sortBy] || sortMap.updatedAt)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

  const [total, problemsResult, availableTagsResult] = await Promise.all([
    Problem.countDocuments(query),
    problemsPromise,
    Problem.distinct('tags', accessQuery),
  ]);

  const problems = isStudentRequest(req)
    ? await attachStudentStatuses(req.user._id, problemsResult)
    : problemsResult;

  res.json({
    problems: problems.map((problem) => serializeProblem(problem, {
      studentStatus: problem.studentStatus || null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
    filters: {
      availableTags: availableTagsResult
        .filter(Boolean)
        .sort((left, right) => String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })),
    },
  });
}

export async function getProblemDetail(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');

  const studentStatus = isStudentRequest(req)
    ? await getStudentProblemStatus(req.user._id, req.params.id)
    : null;
  const problemDoc = await Problem.findById(req.params.id).select('createdBy');
  if (!problemDoc) {
    throw new HttpError(404, 'Problem not found.');
  }

  const isAuthor = isAdminRequest(req) || (isCoordinatorRequest(req) && String(problemDoc.createdBy) === String(req.user._id));

  const { problem, serializedProblem } = await loadProblemShape(req.params.id, {
    studentStatus,
    includeHiddenTestCases: !!isAuthor,
    includeReferenceSolutions: !!isAuthor,
  });

  const visibility = problem.visibility || 'public';
  if ((isStudentRequest(req) || (!isAuthor && isCoordinatorRequest(req))) && (!isPublishedStatus(problem.status) || visibility !== 'public')) {
    throw new HttpError(404, 'Problem not found.');
  }

  res.json(serializedProblem);
}

export async function createProblem(req, res) {
  const payload = buildProblemPayload(req);
  await ensureUniqueProblemTitle(payload.problem.title);

  if (payload.problem.status === 'published') {
    throw new HttpError(400, 'Preview testing is required before publishing a problem.');
  }

  const problem = await Problem.create({
    ...payload.problem,
    previewValidated: false,
    previewTested: false,
    codeTemplates: new Map(Object.entries(payload.problem.codeTemplates)),
    referenceSolutions: new Map(),
    createdBy: req.user._id,
    updatedBy: req.user._id,
    publishedAt: payload.problem.status === 'published' ? new Date() : undefined,
    hiddenTestSource: {
      provider: 'none',
      inputObjectKey: '',
      outputObjectKey: '',
      delimiter: payload.hiddenBulkDelimiter || '###CASE###',
      caseCount: 0,
    },
  });

  await replaceTestCases(problem._id, req.user._id, payload);

  const hiddenBulkSource = await uploadHiddenBulkToS3(problem._id, payload);
  if (hiddenBulkSource) {
    await Problem.findByIdAndUpdate(problem._id, {
      $set: {
        hiddenTestSource: hiddenBulkSource,
      },
    });
  } else if ((payload.hiddenTestCases || []).length > 0) {
    await Problem.findByIdAndUpdate(problem._id, {
      $set: {
        hiddenTestSource: {
          provider: 'db',
          inputObjectKey: '',
          outputObjectKey: '',
          delimiter: payload.hiddenBulkDelimiter || '###CASE###',
          caseCount: payload.hiddenTestCases.length,
        },
      },
    });
  }

  await refreshProblemStats(problem._id);
  await syncProblemToLibrary(await Problem.findById(problem._id).lean());

  const { serializedProblem } = await loadProblemShape(problem._id);
  res.status(201).json(serializedProblem);
}

export async function updateProblem(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');

  const existingProblem = await Problem.findById(req.params.id);
  if (!existingProblem || (isCoordinatorRequest(req) && String(existingProblem.createdBy) !== String(req.user._id))) {
    throw new HttpError(404, 'Problem not found.');
  }

  const existingHiddenTestCaseCount = await TestCase.countDocuments({
    problem: existingProblem._id,
    kind: 'hidden',
  });

  const payload = buildProblemPayload(req, {
    existingHiddenTestCaseCount,
    existingHiddenBulkCaseCount: Number(existingProblem.hiddenTestSource?.caseCount || 0),
  });
  await ensureUniqueProblemTitle(payload.problem.title, existingProblem._id);
  const canRetainPreviewStatus = payload.problem.status === 'published' && (existingProblem.previewValidated ?? existingProblem.previewTested);
  const {
    referenceSolutions: payloadReferenceSolutions,
    ...problemFields
  } = payload.problem;

  Object.assign(existingProblem, {
    ...problemFields,
    previewValidated: canRetainPreviewStatus,
    previewTested: canRetainPreviewStatus,
    codeTemplates: new Map(Object.entries(problemFields.codeTemplates)),
    updatedBy: req.user._id,
  });

  if (payloadReferenceSolutions !== null) {
    existingProblem.referenceSolutions = new Map(Object.entries(payloadReferenceSolutions || {}));
  }

  if (payload.problem.status === 'published' && !canRetainPreviewStatus) {
    throw new HttpError(400, 'Preview testing is required before publishing a problem.');
  }

  if (payload.problem.status === 'published') {
    const nextReferenceSolutionCount = payloadReferenceSolutions !== null
      ? countReferenceSolutions(payloadReferenceSolutions)
      : countReferenceSolutions(existingProblem.referenceSolutions);

    if (nextReferenceSolutionCount === 0) {
      throw new HttpError(400, 'Official solution approval is required before publishing a problem.');
    }
  }

  if (payload.problem.status === 'published' && !existingProblem.publishedAt) {
    existingProblem.publishedAt = new Date();
  }

  await existingProblem.save();
  await replaceTestCases(existingProblem._id, req.user._id, payload);

  if (payload.hiddenBulkProvided) {
    const hiddenBulkSource = await uploadHiddenBulkToS3(existingProblem._id, payload);
    await Problem.findByIdAndUpdate(existingProblem._id, {
      $set: {
        hiddenTestSource: hiddenBulkSource,
      },
    });
  } else if (payload.hiddenTestCasesProvided) {
    await Problem.findByIdAndUpdate(existingProblem._id, {
      $set: {
        hiddenTestSource: {
          provider: (payload.hiddenTestCases || []).length > 0 ? 'db' : 'none',
          inputObjectKey: '',
          outputObjectKey: '',
          delimiter: payload.hiddenBulkDelimiter || '###CASE###',
          caseCount: (payload.hiddenTestCases || []).length,
        },
      },
    });
  }

  await refreshProblemStats(existingProblem._id);
  await syncProblemToLibrary(await Problem.findById(existingProblem._id).lean());

  const { serializedProblem } = await loadProblemShape(existingProblem._id);
  res.json(serializedProblem);
}

export async function deleteProblem(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');

  const problem = await Problem.findById(req.params.id).select('_id createdBy');
  if (!problem || (isCoordinatorRequest(req) && String(problem.createdBy) !== String(req.user._id))) {
    throw new HttpError(404, 'Problem not found.');
  }

  await Promise.all([
    TestCase.deleteMany({ problem: problem._id }),
    Submission.deleteMany({ problem: problem._id }),
    Problem.findByIdAndDelete(problem._id),
  ]);
  await removeProblemFromLibrary(problem._id);

  res.json({ success: true });
}

export async function updateProblemStatus(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');

  const problem = await Problem.findById(req.params.id);
  if (!problem || (isCoordinatorRequest(req) && String(problem.createdBy) !== String(req.user._id))) {
    throw new HttpError(404, 'Problem not found.');
  }

  const nextStatus = normalizeStatus(req.body.status);
  const sampleCount = await TestCase.countDocuments({ problem: problem._id, kind: 'sample' });
  const hiddenCount = Math.max(
    Number(problem.hiddenTestSource?.caseCount || 0),
    await TestCase.countDocuments({ problem: problem._id, kind: 'hidden' }),
  );

  if (nextStatus === 'published') {
    if (sampleCount === 0) {
      throw new HttpError(400, 'Publishing a problem requires at least one sample test case.');
    }
    if (hiddenCount === 0) {
      throw new HttpError(400, 'Publishing a problem requires at least one hidden test case pair.');
    }
    const previewValidated = problem.previewValidated ?? problem.previewTested;
    if (!previewValidated) {
      throw new HttpError(400, 'Preview testing is required before publishing a problem.');
    }
    if (countReferenceSolutions(problem.referenceSolutions) === 0) {
      throw new HttpError(400, 'Official solution approval is required before publishing a problem.');
    }
    if (!problem.publishedAt) {
      problem.publishedAt = new Date();
    }
  }

  problem.status = nextStatus;
  problem.updatedBy = req.user._id;
  await problem.save();
  await syncProblemToLibrary(await Problem.findById(problem._id).lean());

  const { serializedProblem } = await loadProblemShape(problem._id, {
    includeHiddenTestCases: true,
    includeReferenceSolutions: true,
  });
  res.json(serializedProblem);
}

export async function previewRunProblem(req, res) {
  const supportedLanguages = normalizeSupportedLanguages(req.body.supportedLanguages);
  const selectedLanguage = String(req.body.language || '').trim().toLowerCase();
  if (!selectedLanguage || !supportedLanguages.includes(selectedLanguage)) {
    throw new HttpError(400, 'Select a valid language to run.');
  }

  const templates = normalizeCodeTemplates(req.body.codeTemplates, supportedLanguages);
  const sampleTestCases = req.body.sampleTestCases ? normalizeSampleTestCases(req.body.sampleTestCases) : [];
  const customInput = req.body.customInput !== undefined
    ? String(req.body.customInput)
    : (sampleTestCases[0]?.input || '');
  const timeLimitSeconds = parseNumber(req.body.timeLimitSeconds ?? req.body.timeLimit, 2, { min: 1, max: 15, integer: false });

  const languageId = KEY_TO_LANGUAGE_ID[selectedLanguage];
  if (!languageId) {
    throw new HttpError(400, 'Unsupported language for Judge0 preview run.');
  }

  const judgeResult = await runJudge0(
    templates[selectedLanguage],
    languageId,
    customInput,
    {
      cpuTimeLimitSeconds: timeLimitSeconds,
      wallTimeLimitSeconds: Math.max(5, timeLimitSeconds * 2),
      memoryLimitKb: DEFAULT_MEMORY_LIMIT_MB * 1024,
    },
  );

  const evaluation = evaluateJudge0Case(judgeResult, '');
  const result = {
    status: evaluation.status,
    output: judgeResult.stdout || '',
    stderr: evaluation.status === 'RE' ? (evaluation.error || '') : (judgeResult.stderr || ''),
    compileOutput: evaluation.status === 'CE' ? (evaluation.error || '') : (judgeResult.compile_output || ''),
    executionTimeMs: secondsToMilliseconds(judgeResult.time),
    memoryUsedKb: Math.trunc(Number(judgeResult.memory || 0)),
    provider: 'judge0-ce',
  };

  res.json({
    ...result,
    language: selectedLanguage,
    customInput,
  });
}

export async function approveProblemPreview(req, res) {
  ensureObjectId(req.params.id, 'Problem ID');

  const problem = await Problem.findById(req.params.id);
  if (!problem || (isCoordinatorRequest(req) && String(problem.createdBy) !== String(req.user._id))) {
    throw new HttpError(404, 'Problem not found.');
  }

  const supportedLanguages = Array.isArray(problem.supportedLanguages) ? problem.supportedLanguages : [];
  const referenceSolutions = normalizeReferenceSolutions(req.body.referenceSolutions, supportedLanguages);

  if (!referenceSolutions || Object.keys(referenceSolutions).length === 0) {
    throw new HttpError(400, 'Official solution is required before preview approval.');
  }

  const hiddenTestCases = await loadHiddenExecutionTestCases(problem);
  const languagesToValidate = Object.entries(referenceSolutions)
    .filter(([, code]) => String(code || '').trim())
    .map(([language, sourceCode]) => ({
      language,
      sourceCode,
    }));

  if (languagesToValidate.length === 0) {
    throw new HttpError(400, 'Official solution is required before preview approval.');
  }

  const results = [];
  let allPassed = true;

  for (const entry of languagesToValidate) {
    const validation = await evaluateOfficialSolution(problem, {
      language: entry.language,
      sourceCode: entry.sourceCode,
      testCases: hiddenTestCases,
    });
    results.push(validation);

    if (validation.status !== 'AC') {
      allPassed = false;
    }
  }

  if (!allPassed) {
    await Problem.findByIdAndUpdate(problem._id, {
      $set: {
        previewValidated: false,
        previewTested: false,
        updatedBy: req.user._id,
      },
    });

    return res.json({
      success: false,
      approved: false,
      previewValidated: false,
      results,
      message: 'Official solution failed preview validation.',
    });
  }

  problem.referenceSolutions = new Map(Object.entries(referenceSolutions));
  problem.previewValidated = true;
  problem.previewTested = true;
  problem.updatedBy = req.user._id;
  await problem.save();
  await syncProblemToLibrary(await Problem.findById(problem._id).lean());

  const { serializedProblem } = await loadProblemShape(problem._id, {
    includeHiddenTestCases: true,
    includeReferenceSolutions: true,
  });

  return res.json({
    success: true,
    approved: true,
    previewValidated: true,
    results,
    problem: serializedProblem,
    message: 'Official solution passed all internal testcases.',
  });
}

export async function runProblemCode(req, res) {
  const problem = await resolveExecutionProblem(req);

  const language = String(req.body.language || '').trim().toLowerCase();
  if (!problem.supportedLanguages.includes(language)) {
    throw new HttpError(400, 'This language is not enabled for the selected problem.');
  }

  const sourceCode = String(req.body.sourceCode || '');
  if (!sourceCode.trim()) {
    throw new HttpError(400, 'Source code is required.');
  }
  const languageId = KEY_TO_LANGUAGE_ID[language];
  if (!languageId) {
    throw new HttpError(400, 'Unsupported language for Judge0 run.');
  }

  const firstSampleCase = await TestCase.findOne({
    problem: problem._id,
    kind: 'sample',
  }).sort({ position: 1 }).lean();

  const customInput = req.body.customInput !== undefined
    ? String(req.body.customInput)
    : (firstSampleCase?.input || '');

  const submission = await createTrackedSubmission(req, problem, {
    mode: 'run',
    language,
    sourceCode,
    customInput,
  });

  try {
    await markSubmissionRunning(req, submission);

    const judgeResult = await runJudge0(
      sourceCode,
      languageId,
      customInput,
      buildJudge0Options(problem),
    );
    const evaluation = evaluateJudge0Case(judgeResult, '');
    const result = {
      status: evaluation.status,
      output: judgeResult.stdout || '',
      stderr: evaluation.status === 'RE' ? (evaluation.error || '') : (judgeResult.stderr || ''),
      compileOutput: evaluation.status === 'CE' ? (evaluation.error || '') : (judgeResult.compile_output || ''),
      executionTimeMs: secondsToMilliseconds(judgeResult.time),
      memoryUsedKb: Math.trunc(Number(judgeResult.memory || 0)),
      provider: 'judge0-ce',
      totalTestCases: 1,
      passedTestCases: evaluation.status === 'AC' ? 1 : 0,
      testCaseResults: [{
        index: 1,
        status: evaluation.status,
        input: customInput,
        expectedOutput: '',
        actualOutput: judgeResult.stdout || '',
        executionTimeMs: secondsToMilliseconds(judgeResult.time),
        memoryUsedKb: Math.trunc(Number(judgeResult.memory || 0)),
        stderr: evaluation.status === 'RE' || evaluation.status === 'TLE' ? (evaluation.error || '') : '',
        compileOutput: evaluation.status === 'CE' ? (evaluation.error || '') : '',
      }],
    };

    await finalizeSubmission(req, submission, result);
    void Promise.all([
      result.status === 'AC'
        ? Problem.findByIdAndUpdate(problem._id, {
          $set: {
            previewValidated: true,
            previewTested: true,
          },
        })
        : Promise.resolve(),
      refreshProblemStats(problem._id),
    ]).catch(() => {});

    res.json(buildSubmissionResponse(req, submission));
  } catch (error) {
    await finalizeSubmission(req, submission, {
      status: 'RE',
      output: '',
      stderr: error.message || 'Execution failed unexpectedly.',
      executionTimeMs: 0,
      memoryUsedKb: 0,
      provider: 'judge0-ce',
      totalTestCases: 1,
      passedTestCases: 0,
    });
    void refreshProblemStats(problem._id).catch(() => {});
    throw error;
  }
}

export async function submitProblemCode(req, res) {
  const problem = await resolveExecutionProblem(req);

  const language = String(req.body.language || '').trim().toLowerCase();
  if (!problem.supportedLanguages.includes(language)) {
    throw new HttpError(400, 'This language is not enabled for the selected problem.');
  }

  const sourceCode = String(req.body.sourceCode || '');
  if (!sourceCode.trim()) {
    throw new HttpError(400, 'Source code is required.');
  }
  const languageId = KEY_TO_LANGUAGE_ID[language];
  if (!languageId) {
    throw new HttpError(400, 'Unsupported language for Judge0 submit.');
  }

  const hiddenTestCases = await loadHiddenExecutionTestCases(problem);

  const submission = await createTrackedSubmission(req, problem, {
    mode: 'submit',
    language,
    sourceCode,
  });

  try {
    await markSubmissionRunning(req, submission);

    const testCaseResults = [];
    let totalExecutionTimeSeconds = 0;
    let peakMemoryKb = 0;
    let failedCase = null;
    let finalStatus = 'AC';
    let finalOutput = '';
    let finalStderr = '';
    let finalCompileOutput = '';
    let passedTestCases = 0;

    for (let index = 0; index < hiddenTestCases.length; index += 1) {
      const testCase = hiddenTestCases[index];
      const judgeResult = await runJudge0(
        sourceCode,
        languageId,
        testCase.input || '',
        buildJudge0Options(problem),
      );
      const evaluation = evaluateJudge0Case(judgeResult, testCase.output || '');
      const executionTimeMs = secondsToMilliseconds(judgeResult.time);
      const actualOutput = judgeResult.stdout || '';
      const memoryUsedKb = Math.trunc(Number(judgeResult.memory || 0));

      totalExecutionTimeSeconds += Number(judgeResult.time || 0);
      peakMemoryKb = Math.max(peakMemoryKb, memoryUsedKb);

      testCaseResults.push({
        index: index + 1,
        status: evaluation.status,
        input: testCase.input || '',
        expectedOutput: testCase.output || '',
        actualOutput,
        executionTimeMs,
        memoryUsedKb,
        stderr: evaluation.status === 'RE' || evaluation.status === 'TLE' ? (evaluation.error || '') : '',
        compileOutput: evaluation.status === 'CE' ? (evaluation.error || '') : '',
      });

      if (evaluation.status !== 'AC') {
        finalStatus = evaluation.status;
        finalOutput = actualOutput;
        finalStderr = evaluation.status === 'RE' || evaluation.status === 'TLE' ? (evaluation.error || '') : '';
        finalCompileOutput = evaluation.status === 'CE' ? (evaluation.error || '') : '';
        failedCase = {
          index: index + 1,
          input: testCase.input || '',
          expectedOutput: testCase.output || '',
          actualOutput: evaluation.actualOutput || actualOutput,
        };
        break;
      }

      passedTestCases += 1;
      finalOutput = actualOutput;
    }

    const result = {
      status: finalStatus,
      output: finalOutput,
      stderr: finalStderr,
      compileOutput: finalCompileOutput,
      executionTimeMs: secondsToMilliseconds(totalExecutionTimeSeconds),
      memoryUsedKb: peakMemoryKb,
      provider: 'judge0-ce',
      failedCase,
      testCaseResults,
      totalTestCases: hiddenTestCases.length,
      passedTestCases,
    };

    await finalizeSubmission(req, submission, result);
    void Promise.all([
      result.status === 'AC'
        ? Problem.findByIdAndUpdate(problem._id, {
          $set: {
            previewValidated: true,
            previewTested: true,
          },
        })
        : Promise.resolve(),
      refreshProblemStats(problem._id),
    ]).catch(() => {});

    res.json(buildSubmissionResponse(req, submission));
  } catch (error) {
    await finalizeSubmission(req, submission, {
      status: 'RE',
      output: '',
      stderr: error.message || 'Submission failed unexpectedly.',
      executionTimeMs: 0,
      memoryUsedKb: 0,
      provider: 'judge0-ce',
      totalTestCases: hiddenTestCases.length,
      passedTestCases: 0,
    });
    void refreshProblemStats(problem._id).catch(() => {});
    throw error;
  }
}

