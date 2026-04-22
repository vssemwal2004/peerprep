import QuestionLibrary from '../models/QuestionLibrary.js';
import Assessment from '../models/Assessment.js';

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
      .filter(Boolean)
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

function buildLibraryPayload({ assessment, section, question, sectionIndex, questionIndex }) {
  const questionType = normalizeType(question?.type || section?.type);
  const questionText = extractQuestionText(question, questionType);
  const tags = normalizeTags(
    question?.tags?.length
      ? question.tags
      : questionType === 'coding'
        ? (question?.coding?.tags || question?.problemDataSnapshot?.tags || question?.coding?.problemData?.tags || [])
        : []
  );
  const keywords = Array.isArray(question?.keywords) ? question.keywords.filter(Boolean) : [];
  const difficulty = questionType === 'coding'
    ? String(
      question?.coding?.difficulty
      || question?.problemDataSnapshot?.difficulty
      || question?.coding?.problemData?.difficulty
      || ''
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
    sourceKey: `${assessment._id}:${sourceQuestionId}`,
    sourceAssessmentId: assessment._id,
    sourceAssessmentTitle: String(assessment.title || '').trim(),
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

export async function syncAssessmentQuestionsToLibrary(assessmentInput) {
  if (!assessmentInput?._id) return;
  const assessment = typeof assessmentInput.toObject === 'function'
    ? assessmentInput.toObject()
    : assessmentInput;

  const operations = [];
  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section?.questions || []).forEach((question, questionIndex) => {
      const payload = buildLibraryPayload({
        assessment,
        section,
        question,
        sectionIndex,
        questionIndex,
      });
      operations.push({
        updateOne: {
          filter: { sourceKey: payload.sourceKey },
          update: { $set: payload, $setOnInsert: { createdAt: new Date() } },
          upsert: true,
        },
      });
    });
  });

  if (!operations.length) return;
  await QuestionLibrary.bulkWrite(operations, { ordered: false });
}

export async function backfillQuestionLibraryIfEmpty() {
  const existingCount = await QuestionLibrary.estimatedDocumentCount();
  if (existingCount > 0) return;

  const assessments = await Assessment.find({
    'sections.0': { $exists: true },
  }).lean();

  for (const assessment of assessments) {
    // Keep memory stable and preserve upsert semantics.
    // eslint-disable-next-line no-await-in-loop
    await syncAssessmentQuestionsToLibrary(assessment);
  }
}

export function buildLibrarySearchMatch(search = '') {
  const terms = Array.from(new Set(tokenizeSearchValue(search))).slice(0, 8);
  if (!terms.length) return {};
  return { searchPrefixes: { $all: terms } };
}

export function formatLibraryQuestionSummary(question = {}) {
  return {
    _id: question._id,
    sourceAssessmentId: question.sourceAssessmentId,
    sourceAssessmentTitle: question.sourceAssessmentTitle || '',
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
