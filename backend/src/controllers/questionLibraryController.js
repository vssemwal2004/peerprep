import mongoose from 'mongoose';
import QuestionLibrary from '../models/QuestionLibrary.js';
import {
  backfillQuestionLibraryIfEmpty,
  buildLibrarySearchMatch,
  formatLibraryQuestionSummary,
} from '../services/questionLibraryService.js';

function normalizeType(type = '') {
  return String(type || '').trim().toLowerCase();
}

function normalizeTag(tag = '') {
  return String(tag || '').trim();
}

export async function listLibraryQuestions(req, res) {
  try {
    await backfillQuestionLibraryIfEmpty();

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
      QuestionLibrary.distinct('tags'),
      QuestionLibrary.distinct('difficulty', { difficulty: { $ne: '' } }),
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
    await backfillQuestionLibraryIfEmpty();
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid library question id' });
    }

    const question = await QuestionLibrary.findById(id).lean();
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
    await backfillQuestionLibraryIfEmpty();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) {
      return res.json({ questions: [] });
    }

    const questions = await QuestionLibrary.find({ _id: { $in: validIds } })
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
