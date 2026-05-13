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

    const match = { ...baseMatch };

    if (normalizeType(type) && normalizeType(type) !== 'all') {
      match.questionType = normalizeType(type);
    }

    const [questions, total, categories, tags, difficulties] = await Promise.all([
      QuestionLibrary.find(match)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      QuestionLibrary.countDocuments(match),
      QuestionLibrary.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$questionType', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      QuestionLibrary.distinct('tags', baseMatch),
      QuestionLibrary.distinct('difficulty', { ...baseMatch, difficulty: { $ne: '' } }),
    ]);

    res.json({
      questions: questions.map(formatLibraryQuestionSummary),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum)),
      },
      filters: {
        categories: categories.map((entry) => ({ type: entry._id, count: entry.count })),
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
