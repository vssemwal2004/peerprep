import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import ProblemList from '../models/ProblemList.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import { sharedQuestions } from '../platform/sharedContent.js';
import { HttpError } from '../utils/errors.js';

const MAX_LISTS_PER_STUDENT = 30;

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function serializeList(list) {
  return {
    _id: String(list._id),
    title: list.title,
    description: list.description || '',
    isPrivate: list.isPrivate !== false,
    problemIds: (list.problemIds || []).map(String),
    problemCount: (list.problemIds || []).length,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

export async function listProblemLists(req, res) {
  const lists = await ProblemList.find({ userId: req.user._id }).sort({ updatedAt: -1 }).lean();
  res.json({ lists: lists.map(serializeList) });
}

export async function createProblemList(req, res) {
  const title = cleanText(req.body?.title, 30);
  const description = cleanText(req.body?.description, 150);
  if (!title) throw new HttpError(400, 'List title is required.');

  const count = await ProblemList.countDocuments({ userId: req.user._id });
  if (count >= MAX_LISTS_PER_STUDENT) {
    throw new HttpError(400, `You can create up to ${MAX_LISTS_PER_STUDENT} lists.`);
  }

  try {
    const list = await ProblemList.create({
      userId: req.user._id,
      title,
      description,
      isPrivate: req.body?.isPrivate !== false,
    });
    res.status(201).json({ list: serializeList(list.toObject()) });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'A list with this title already exists.');
    throw error;
  }
}

export async function updateProblemList(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new HttpError(400, 'Invalid list ID.');
  const updates = {};
  if (req.body?.title !== undefined) {
    updates.title = cleanText(req.body.title, 30);
    if (!updates.title) throw new HttpError(400, 'List title is required.');
  }
  if (req.body?.description !== undefined) updates.description = cleanText(req.body.description, 150);
  if (req.body?.isPrivate !== undefined) updates.isPrivate = Boolean(req.body.isPrivate);

  try {
    const list = await ProblemList.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!list) throw new HttpError(404, 'List not found.');
    res.json({ list: serializeList(list) });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'A list with this title already exists.');
    throw error;
  }
}

export async function deleteProblemList(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new HttpError(400, 'Invalid list ID.');
  const list = await ProblemList.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!list) throw new HttpError(404, 'List not found.');
  res.json({ success: true });
}

export async function setProblemListMembership(req, res) {
  const { id, problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(problemId)) {
    throw new HttpError(400, 'Invalid list or problem ID.');
  }

  const [list, problemExists, localQuestionExists] = await Promise.all([
    ProblemList.findOne({ _id: id, userId: req.user._id }),
    Problem.exists({
      _id: problemId,
      status: { $in: ['published', 'Active', 'active'] },
      $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
    }),
    QuestionLibrary.exists({ _id: problemId, status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } }),
  ]);
  if (!list) throw new HttpError(404, 'List not found.');
  if (!problemExists && !localQuestionExists && !(await sharedQuestions() || []).some((question) => String(question._id) === problemId)) {
    throw new HttpError(404, 'Problem not found.');
  }

  const included = req.body?.included !== false;
  const containsProblem = list.problemIds.some((value) => String(value) === problemId);
  if (included && !containsProblem) list.problemIds.push(problemId);
  if (!included && containsProblem) list.problemIds = list.problemIds.filter((value) => String(value) !== problemId);
  await list.save();
  res.json({ list: serializeList(list.toObject()) });
}
