import mongoose from 'mongoose';
import QuestionLibrary from '../models/QuestionLibrary.js';
import {
  buildLibrarySearchMatch,
  ensureQuestionLibrarySynchronized,
  formatLibraryQuestionSummary,
  buildSearchPrefixes,
} from '../services/questionLibraryService.js';

function normalizeType(type = '') {
  return String(type || '').trim().toLowerCase();
}

function normalizeTag(tag = '') {
  return String(tag || '').trim();
}

function normalizeIdentityText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCodingProblemId(question = {}) {
  const data = question.questionData || {};
  const coding = data.coding || {};
  const snapshot = data.problemDataSnapshot || coding.problemData || {};
  return question.sourceProblemId
    || data.problemId
    || coding.problemId
    || snapshot._id
    || snapshot.id
    || '';
}

function getCodingUniqueKey(question = {}) {
  const problemId = getCodingProblemId(question);
  if (problemId) return `problem:${String(problemId)}`;

  const data = question.questionData || {};
  const coding = data.coding || {};
  const snapshot = data.problemDataSnapshot || coding.problemData || {};
  const title = normalizeIdentityText(
    question.questionText
    || question.sourceProblemTitle
    || snapshot.title
    || coding.title
    || data.questionText
    || question.sourceAssessmentTitle,
  );

  return title ? `title:${title}` : `source:${question.sourceKey || question._id}`;
}

function compareLibraryPriority(a = {}, b = {}) {
  const priority = { compiler: 0, manual: 1, assessment: 2 };
  const sourceDiff = (priority[a.sourceType] ?? 9) - (priority[b.sourceType] ?? 9);
  if (sourceDiff !== 0) return sourceDiff;

  const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bUpdated - aUpdated;
}

function uniqueCodingQuestions(questions = []) {
  const grouped = new Map();
  questions
    .filter((question) => question.questionType === 'coding')
    .sort(compareLibraryPriority)
    .forEach((question) => {
      const key = getCodingUniqueKey(question);
      if (!grouped.has(key)) grouped.set(key, question);
    });

  return Array.from(grouped.values()).sort((a, b) => {
    const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bUpdated - aUpdated;
  });
}

function uniqueLibraryQuestions(questions = []) {
  const coding = uniqueCodingQuestions(questions);
  const nonCoding = questions.filter((question) => question.questionType !== 'coding');
  return [...nonCoding, ...coding].sort((a, b) => {
    const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bUpdated - aUpdated;
  });
}

function buildCategoryCounts(questions = []) {
  const counts = new Map();
  questions.forEach((question) => {
    const type = question.questionType || 'other';
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => String(a.type).localeCompare(String(b.type)));
}

export async function listLibraryQuestions(req, res) {
  try {
    await ensureQuestionLibrarySynchronized();

    const {
      type = '',
      search = '',
      tag = '',
      difficulty = '',
      page = 1,
      limit = 25,
    } = req.query || {};

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));
    const skip = (pageNum - 1) * limitNum;

    const baseMatch = {
      ...buildLibrarySearchMatch(search),
    };

    if (normalizeTag(tag)) {
      baseMatch.tags = normalizeTag(tag);
    }
    if (difficulty) {
      baseMatch.difficulty = String(difficulty).trim();
    }
    if (req.user?.role === 'coordinator') {
      baseMatch.createdBy = req.user._id;
    }

    const [baseQuestions, tags, difficulties] = await Promise.all([
      QuestionLibrary.find(baseMatch)
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      QuestionLibrary.distinct('tags', baseMatch),
      QuestionLibrary.distinct('difficulty', { ...baseMatch, difficulty: { $ne: '' } }),
    ]);

    const uniqueBaseQuestions = uniqueLibraryQuestions(baseQuestions);
    const categories = buildCategoryCounts(uniqueBaseQuestions);
    const selectedType = normalizeType(type);
    const filteredQuestions = selectedType && selectedType !== 'all'
      ? uniqueBaseQuestions.filter((question) => question.questionType === selectedType)
      : uniqueBaseQuestions;
    const total = filteredQuestions.length;
    const questions = filteredQuestions.slice(skip, skip + limitNum);

    res.json({
      questions: questions.map(formatLibraryQuestionSummary),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum)),
      },
      filters: {
        categories,
        tags: tags.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
        difficulties: difficulties.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
      },
    });
  } catch (err) {
    console.error('Error listing question library:', err);
    res.status(500).json({ error: 'Failed to load question library' });
  }
}

export async function getLibraryQuestion(req, res) {
  try {
    await ensureQuestionLibrarySynchronized();
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid library question id' });
    }

    const query = { _id: id };
    if (req.user?.role === 'coordinator') {
      query.createdBy = req.user._id;
    }

    const question = await QuestionLibrary.findOne(query).lean();
    if (!question) return res.status(404).json({ error: 'Library question not found' });

    res.json({
      question: {
        ...formatLibraryQuestionSummary(question),
        questionData: question.questionData,
      },
    });
  } catch (err) {
    console.error('Error loading library question:', err);
    res.status(500).json({ error: 'Failed to load library question' });
  }
}

function buildLibraryQuestionQuery(req, id) {
  const query = { _id: id };
  if (req.user?.role === 'coordinator') {
    query.createdBy = req.user._id;
  }
  return query;
}

function normalizeStringArray(value = []) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  return Array.from(new Set(
    source
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
}

export async function updateLibraryQuestion(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid library question id' });
    }

    const question = await QuestionLibrary.findOne(buildLibraryQuestionQuery(req, id));
    if (!question) return res.status(404).json({ error: 'Library question not found' });

    const updates = {};
    const dataUpdates = { ...(question.questionData || {}) };

    if (Object.prototype.hasOwnProperty.call(req.body, 'questionText')) {
      const questionText = String(req.body.questionText || '').trim();
      if (!questionText) return res.status(400).json({ error: 'Question text is required' });
      updates.questionText = questionText;
      dataUpdates.questionText = questionText;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'tags')) {
      const tags = normalizeStringArray(req.body.tags);
      updates.tags = tags;
      dataUpdates.tags = tags;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'difficulty')) {
      updates.difficulty = String(req.body.difficulty || '').trim();
      if (dataUpdates.problemDataSnapshot) {
        dataUpdates.problemDataSnapshot = {
          ...dataUpdates.problemDataSnapshot,
          difficulty: updates.difficulty,
        };
      }
      if (dataUpdates.coding) {
        dataUpdates.coding = {
          ...dataUpdates.coding,
          difficulty: updates.difficulty,
        };
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'visibility')) {
      const visibility = String(req.body.visibility || '').trim().toLowerCase();
      if (!['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Visibility must be public or private' });
      }
      updates.visibility = visibility;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const status = String(req.body.status || '').trim().toLowerCase();
      if (!['draft', 'published', 'hidden', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid question status' });
      }
      updates.status = status;
    }

    const searchValues = [
      updates.questionText ?? question.questionText,
      ...(updates.tags ?? question.tags ?? []),
      ...((question.keywords || [])),
      dataUpdates.expectedAnswer,
      ...((dataUpdates.options || [])),
    ];

    question.set({
      ...updates,
      questionData: dataUpdates,
      searchPrefixes: buildSearchPrefixes(searchValues),
    });
    await question.save();

    res.json({
      question: {
        ...formatLibraryQuestionSummary(question),
        questionData: question.questionData,
      },
    });
  } catch (err) {
    console.error('Error updating library question:', err);
    res.status(500).json({ error: 'Failed to update library question' });
  }
}

export async function deleteLibraryQuestion(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid library question id' });
    }

    const deleted = await QuestionLibrary.findOneAndDelete(buildLibraryQuestionQuery(req, id));
    if (!deleted) return res.status(404).json({ error: 'Library question not found' });

    res.json({ ok: true, id });
  } catch (err) {
    console.error('Error deleting library question:', err);
    res.status(500).json({ error: 'Failed to delete library question' });
  }
}

export async function resolveLibraryQuestions(req, res) {
  try {
    await ensureQuestionLibrarySynchronized();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) {
      return res.json({ questions: [] });
    }

    const query = { _id: { $in: validIds } };
    if (req.user?.role === 'coordinator') {
      query.createdBy = req.user._id;
    }

    const questions = await QuestionLibrary.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      questions: questions.map((question) => ({
        ...formatLibraryQuestionSummary(question),
        questionData: question.questionData,
      })),
    });
  } catch (err) {
    console.error('Error resolving library questions:', err);
    res.status(500).json({ error: 'Failed to resolve library questions' });
  }
}

export async function createLibraryQuestion(req, res) {
  try {
    const { question } = req.body;
    if (!question || !question.type) {
      return res.status(400).json({ error: 'Invalid question data' });
    }

    const type = normalizeType(question.type);
    const tags = Array.isArray(question.tags) ? question.tags : [];
    const keywords = Array.isArray(question.keywords) ? question.keywords : [];
    const questionText = String(question.questionText || '').trim();
    const sourceKey = `direct_${new mongoose.Types.ObjectId()}`;

    const searchPrefixes = buildSearchPrefixes([
      questionText,
      ...(question.options || []),
      question.expectedAnswer,
      ...tags,
      ...keywords,
    ]);

    const newQuestion = new QuestionLibrary({
      sourceKey,
      sourceType: 'manual',
      sourceAssessmentTitle: 'Direct Added',
      sectionName: 'General',
      questionType: type,
      questionText,
      tags,
      keywords,
      searchPrefixes,
      questionData: {
        ...question,
        questionId: sourceKey,
      },
      createdBy: req.user?._id || req.admin?._id,
      lastSyncedAt: new Date(),
    });

    await newQuestion.save();

    res.json({
      question: {
        ...formatLibraryQuestionSummary(newQuestion),
        questionData: newQuestion.questionData,
      },
    });
  } catch (err) {
    console.error('Error creating library question:', err);
    res.status(500).json({ error: 'Failed to create library question' });
  }
}

export async function createLibraryQuestionsBulk(req, res) {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: 'Invalid questions datary array' });
    }

    const createdBy = req.user?._id || req.admin?._id;
    const itemsToInsert = questions.map(question => {
      const type = normalizeType(question.type);
      const tags = Array.isArray(question.tags) ? question.tags : [];
      const keywords = Array.isArray(question.keywords) ? question.keywords : [];
      const questionText = String(question.questionText || '').trim();
      const sourceKey = `direct_${new mongoose.Types.ObjectId()}`;

      const searchPrefixes = buildSearchPrefixes([
        questionText,
        ...(question.options || []),
        question.expectedAnswer,
        ...tags,
        ...keywords,
      ]);

      return {
        sourceKey,
        sourceType: 'manual',
        sourceAssessmentTitle: 'Direct Added',
        sectionName: 'General',
        questionType: type,
        questionText,
        tags,
        keywords,
        searchPrefixes,
        questionData: {
          ...question,
          questionId: sourceKey,
        },
        createdBy,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const result = await QuestionLibrary.insertMany(itemsToInsert);

    res.json({
      questions: result.map((q) => ({
        ...formatLibraryQuestionSummary(q),
        questionData: q.questionData,
      })),
    });
  } catch (err) {
    console.error('Error bulk creating library questions:', err);
    res.status(500).json({ error: 'Failed to bulk create library questions' });
  }
}
