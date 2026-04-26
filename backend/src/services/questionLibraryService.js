import Assessment from '../models/Assessment.js';
import Problem from '../models/Problem.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import TestCase from '../models/TestCase.js';

const LIBRARY_SYNC_COOLDOWN_MS = Math.max(0, Number(process.env.QUESTION_LIBRARY_SYNC_COOLDOWN_MS || 60000));

let lastFullSyncAt = 0;
let pendingFullSync = null;

function normalizeType(type = '') {
  return String(type || '').trim().toLowerCase() || 'other';
}

function normalizeTags(tags = []) {
  const values = Array.isArray(tags)
    ? tags
    : String(tags || '')
      .split(',')
      .map((tag) => tag.trim());

  return Array.from(new Set(
    values
      .map((tag) => String(tag || '').trim())
      .filter(Boolean),
  ));
}

function tokenizeSearchValue(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function mapCodeMap(value) {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).reduce((acc, [key, entryValue]) => {
      acc[key] = entryValue;
      return acc;
    }, {});
  }
  return {};
}

function buildProblemSnapshot(problem = {}, { sampleTestCases = [], hiddenTestCaseCount = 0 } = {}) {
  const normalizedStatus = String(problem.status || '').trim().toLowerCase();
  const referenceSolutions = mapCodeMap(problem.referenceSolutions);
  const referenceSolutionCount = Object.keys(referenceSolutions).length;

  return {
    _id: problem._id,
    title: problem.title || '',
    description: problem.description || '',
    difficulty: problem.difficulty || 'Easy',
    tags: Array.isArray(problem.tags) ? problem.tags : [],
    companyTags: Array.isArray(problem.companyTags) ? problem.companyTags : [],
    supportedLanguages: Array.isArray(problem.supportedLanguages) ? problem.supportedLanguages : [],
    codeTemplates: mapCodeMap(problem.codeTemplates),
    hasReferenceSolution: referenceSolutionCount > 0,
    inputFormat: problem.inputFormat || '',
    outputFormat: problem.outputFormat || '',
    constraints: problem.constraints || '',
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    status: normalizedStatus === 'active' ? 'published' : (normalizedStatus || 'draft'),
    visibility: problem.visibility || 'public',
    previewValidated: Boolean(problem.previewValidated ?? problem.previewTested),
    previewTested: Boolean(problem.previewTested),
    totalSubmissions: problem.stats?.totalSubmissions || 0,
    acceptedSubmissions: problem.stats?.acceptedSubmissions || 0,
    totalRuns: problem.stats?.totalRuns || 0,
    acceptanceRate: problem.stats?.acceptanceRate || 0,
    averageExecutionTimeMs: problem.stats?.averageExecutionTimeMs || 0,
    sampleTestCases,
    hiddenTestCaseCount,
    hiddenTestSource: {
      provider: problem.hiddenTestSource?.provider || 'none',
      caseCount: Number(problem.hiddenTestSource?.caseCount || hiddenTestCaseCount || 0),
      delimiter: problem.hiddenTestSource?.delimiter || '###CASE###',
    },
    createdAt: problem.createdAt,
    updatedAt: problem.updatedAt,
    publishedAt: problem.publishedAt || null,
  };
}

export function buildSearchPrefixes(values = []) {
  const prefixes = new Set();
  values.forEach((value) => {
    tokenizeSearchValue(value).forEach((token) => {
      const limit = Math.min(token.length, 20);
      for (let index = 1; index <= limit; index += 1) {
        prefixes.add(token.slice(0, index));
      }
    });
  });
  return Array.from(prefixes).slice(0, 300);
}

function extractQuestionText(question = {}, type = '') {
  if (type === 'coding') {
    return (
      question.questionText
      || question.coding?.title
      || question.problemDataSnapshot?.title
      || question.coding?.problemData?.title
      || question.coding?.statement
      || ''
    );
  }
  return String(question.questionText || '').trim();
}

function buildSourceQuestionId(question = {}, sectionIndex = 0, questionIndex = 0) {
  return String(question.questionId || `section-${sectionIndex}-question-${questionIndex}`);
}

function buildAssessmentLibraryPayload({ assessment, section, question, sectionIndex, questionIndex }) {
  const questionType = normalizeType(question?.type || section?.type);
  const questionText = extractQuestionText(question, questionType);
  const tags = normalizeTags(
    question?.tags?.length
      ? question.tags
      : questionType === 'coding'
        ? (question?.coding?.tags || question?.problemDataSnapshot?.tags || question?.coding?.problemData?.tags || [])
        : [],
  );
  const keywords = Array.isArray(question?.keywords) ? question.keywords.filter(Boolean) : [];
  const difficulty = questionType === 'coding'
    ? String(
      question?.coding?.difficulty
      || question?.problemDataSnapshot?.difficulty
      || question?.coding?.problemData?.difficulty
      || '',
    ).trim()
    : '';
  const sourceQuestionId = buildSourceQuestionId(question, sectionIndex, questionIndex);
  const snapshot = {
    ...question,
    questionId: sourceQuestionId,
    type: questionType,
    tags,
    keywords,
  };

  return {
    sourceKey: `assessment:${assessment._id}:${sourceQuestionId}`,
    sourceType: 'assessment',
    sourceAssessmentId: assessment._id,
    sourceAssessmentTitle: String(assessment.title || '').trim(),
    sourceProblemId: undefined,
    sourceProblemTitle: '',
    sourceQuestionId,
    sectionName: String(section?.sectionName || '').trim(),
    questionType,
    questionText,
    tags,
    keywords,
    difficulty,
    searchPrefixes: buildSearchPrefixes([
      assessment?.title,
      section?.sectionName,
      questionText,
      ...(snapshot.options || []),
      snapshot.expectedAnswer,
      ...tags,
      ...keywords,
      snapshot.coding?.title,
      snapshot.coding?.description,
      snapshot.coding?.statement,
    ]),
    questionData: snapshot,
    createdBy: assessment.createdBy,
    lastSyncedAt: new Date(),
  };
}

function buildProblemLibraryPayload(problem = {}, { sampleTestCases = [], hiddenTestCaseCount = 0 } = {}) {
  const snapshot = buildProblemSnapshot(problem, { sampleTestCases, hiddenTestCaseCount });
  const tags = normalizeTags(problem.tags || []);
  const keywords = normalizeTags(problem.companyTags || []);

  return {
    sourceKey: `problem:${problem._id}`,
    sourceType: 'compiler',
    sourceAssessmentId: undefined,
    sourceAssessmentTitle: String(problem.title || '').trim(),
    sourceProblemId: problem._id,
    sourceProblemTitle: String(problem.title || '').trim(),
    sourceQuestionId: String(problem._id),
    sectionName: 'Compiler Problem',
    questionType: 'coding',
    questionText: String(problem.title || '').trim(),
    tags,
    keywords,
    difficulty: String(problem.difficulty || '').trim(),
    searchPrefixes: buildSearchPrefixes([
      problem.title,
      problem.description,
      problem.inputFormat,
      problem.outputFormat,
      problem.constraints,
      ...tags,
      ...keywords,
      ...(problem.supportedLanguages || []),
    ]),
    questionData: {
      questionId: `problem-${problem._id}`,
      type: 'coding',
      questionText: String(problem.title || '').trim(),
      problemId: problem._id,
      tags,
      keywords,
      problemDataSnapshot: snapshot,
    },
    createdBy: problem.createdBy,
    lastSyncedAt: new Date(),
  };
}

async function loadProblemLibraryContext(problemInput) {
  if (!problemInput?._id) return null;
  const problem = typeof problemInput.toObject === 'function'
    ? problemInput.toObject()
    : problemInput;

  const [sampleTestCases, hiddenTestCaseCount] = await Promise.all([
    TestCase.find({ problem: problem._id, kind: 'sample' })
      .sort({ position: 1 })
      .select('input output explanation')
      .lean(),
    TestCase.countDocuments({ problem: problem._id, kind: 'hidden' }),
  ]);

  return {
    problem,
    sampleTestCases: sampleTestCases.map((testCase) => ({
      input: testCase.input || '',
      output: testCase.output || '',
      explanation: testCase.explanation || '',
    })),
    hiddenTestCaseCount: Math.max(
      Number(hiddenTestCaseCount || 0),
      Number(problem.hiddenTestSource?.caseCount || 0),
    ),
  };
}

export async function syncAssessmentQuestionsToLibrary(assessmentInput) {
  if (!assessmentInput?._id) return;
  const assessment = typeof assessmentInput.toObject === 'function'
    ? assessmentInput.toObject()
    : assessmentInput;

  const operations = [];
  const sourceKeys = [];

  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section?.questions || []).forEach((question, questionIndex) => {
      const payload = buildAssessmentLibraryPayload({
        assessment,
        section,
        question,
        sectionIndex,
        questionIndex,
      });
      sourceKeys.push(payload.sourceKey);
      operations.push({
        updateOne: {
          filter: { sourceKey: payload.sourceKey },
          update: { $set: payload, $setOnInsert: { createdAt: new Date() } },
          upsert: true,
        },
      });
    });
  });

  if (operations.length > 0) {
    await QuestionLibrary.bulkWrite(operations, { ordered: false });
  }

  await QuestionLibrary.deleteMany({
    sourceType: 'assessment',
    sourceAssessmentId: assessment._id,
    ...(sourceKeys.length ? { sourceKey: { $nin: sourceKeys } } : {}),
  });
}

export async function syncProblemToLibrary(problemInput) {
  const context = await loadProblemLibraryContext(problemInput);
  if (!context?.problem?._id) return;

  const payload = buildProblemLibraryPayload(context.problem, {
    sampleTestCases: context.sampleTestCases,
    hiddenTestCaseCount: context.hiddenTestCaseCount,
  });

  await QuestionLibrary.findOneAndUpdate(
    { sourceKey: payload.sourceKey },
    { $set: payload, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true },
  );
}

export async function removeAssessmentQuestionsFromLibrary(assessmentId) {
  if (!assessmentId) return;
  await QuestionLibrary.deleteMany({
    sourceType: 'assessment',
    sourceAssessmentId: assessmentId,
  });
}

export async function removeProblemFromLibrary(problemId) {
  if (!problemId) return;
  await QuestionLibrary.deleteMany({
    sourceType: 'compiler',
    sourceProblemId: problemId,
  });
}

async function performFullLibrarySync() {
  const [assessments, problems] = await Promise.all([
    Assessment.find({}).lean(),
    Problem.find({}).lean(),
  ]);

  for (const assessment of assessments) {
    // eslint-disable-next-line no-await-in-loop
    await syncAssessmentQuestionsToLibrary(assessment);
  }

  const liveProblemIds = new Set();
  for (const problem of problems) {
    liveProblemIds.add(String(problem._id));
    // eslint-disable-next-line no-await-in-loop
    await syncProblemToLibrary(problem);
  }

  await QuestionLibrary.deleteMany({
    sourceType: 'compiler',
    sourceProblemId: {
      $nin: Array.from(liveProblemIds),
    },
  });
}

export async function ensureQuestionLibrarySynchronized({ force = false } = {}) {
  const now = Date.now();
  if (!force && lastFullSyncAt && now - lastFullSyncAt < LIBRARY_SYNC_COOLDOWN_MS) {
    return;
  }

  if (!pendingFullSync) {
    pendingFullSync = performFullLibrarySync()
      .then(() => {
        lastFullSyncAt = Date.now();
      })
      .finally(() => {
        pendingFullSync = null;
      });
  }

  await pendingFullSync;
}

export async function backfillQuestionLibraryIfEmpty() {
  const existingCount = await QuestionLibrary.estimatedDocumentCount();
  if (existingCount > 0) return;
  await ensureQuestionLibrarySynchronized({ force: true });
}

export function buildLibrarySearchMatch(search = '') {
  const terms = Array.from(new Set(tokenizeSearchValue(search))).slice(0, 8);
  if (!terms.length) return {};
  return { searchPrefixes: { $all: terms } };
}

export function formatLibraryQuestionSummary(question = {}) {
  const sourceTitle = question.sourceProblemTitle
    || question.sourceAssessmentTitle
    || question.questionText
    || '';

  return {
    _id: question._id,
    sourceType: question.sourceType || 'assessment',
    sourceTitle,
    sourceAssessmentId: question.sourceAssessmentId,
    sourceAssessmentTitle: question.sourceAssessmentTitle || sourceTitle,
    sourceProblemId: question.sourceProblemId || null,
    sourceProblemTitle: question.sourceProblemTitle || '',
    sourceQuestionId: question.sourceQuestionId || '',
    sectionName: question.sectionName || '',
    questionType: question.questionType || 'other',
    questionText: question.questionText || '',
    tags: Array.isArray(question.tags) ? question.tags : [],
    keywords: Array.isArray(question.keywords) ? question.keywords : [],
    difficulty: question.difficulty || '',
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}
