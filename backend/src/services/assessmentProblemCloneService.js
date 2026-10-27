import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import TestCase from '../models/TestCase.js';
import { HttpError } from '../utils/errors.js';

function cleanDraftKey(value) {
  return String(value || '').trim().slice(0, 200);
}

function plainProblem(source) {
  const data = source.toObject
    ? source.toObject({ depopulate: true, flattenMaps: false })
    : { ...source };
  delete data._id;
  delete data.__v;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.publishedAt;
  return data;
}

export async function cloneProblemForAssessment(sourceProblemId, {
  assessmentId = null,
  draftKey = '',
  userId,
} = {}) {
  if (!mongoose.isValidObjectId(sourceProblemId)) throw new HttpError(400, 'Valid problem ID is required.');
  if (!userId) throw new HttpError(401, 'Authentication is required.');

  if (assessmentId && !mongoose.isValidObjectId(assessmentId)) throw new HttpError(400, 'Valid assessment ID is required.');
  const requestedAssessmentId = assessmentId ? assessmentId : null;
  const normalizedDraftKey = cleanDraftKey(draftKey);
  const source = await Problem.findById(sourceProblemId).select('+executionHarnesses +assessmentDraftKey');
  if (!source) throw new HttpError(404, 'Problem not found.');

  if (requestedAssessmentId && String(source.assessmentOwnerId || '') === String(requestedAssessmentId)) return source;
  if (!requestedAssessmentId
    && source.visibility === 'assessment'
    && String(source.createdBy || '') === String(userId)
    && source.assessmentDraftKey
    && source.assessmentDraftKey === normalizedDraftKey) return source;

  const rootSourceId = source.assessmentSourceProblemId || source._id;
  const existingQuery = requestedAssessmentId
    ? { assessmentOwnerId: requestedAssessmentId, assessmentSourceProblemId: rootSourceId }
    : {
        createdBy: userId,
        assessmentDraftKey: normalizedDraftKey,
        assessmentSourceProblemId: rootSourceId,
      };
  if (requestedAssessmentId || normalizedDraftKey) {
    const existing = await Problem.findOne(existingQuery).select('+executionHarnesses +assessmentDraftKey');
    if (existing) return existing;
  }

  const clone = await Problem.create({
    ...plainProblem(source),
    visibility: 'assessment',
    assessmentOwnerId: requestedAssessmentId || undefined,
    assessmentSourceProblemId: rootSourceId,
    assessmentDraftKey: requestedAssessmentId ? '' : normalizedDraftKey,
    createdBy: userId,
    updatedBy: userId,
    stats: { totalSubmissions: 0, acceptedSubmissions: 0, totalRuns: 0, acceptanceRate: 0, averageExecutionTimeMs: 0 },
  });

  const testCases = await TestCase.find({ problem: source._id }).lean();
  if (testCases.length) {
    await TestCase.insertMany(testCases.map(({ _id, __v, createdAt, updatedAt, ...testCase }) => ({
      ...testCase,
      problem: clone._id,
      createdBy: userId,
    })));
  }
  return Problem.findById(clone._id).select('+executionHarnesses +assessmentDraftKey');
}

export async function claimAssessmentDraftProblems(questionSets, { assessmentId, userId } = {}) {
  if (!mongoose.isValidObjectId(assessmentId)) return questionSets;
  const cloneCache = new Map();
  const sets = Array.isArray(questionSets) ? questionSets : [];

  for (const questionSet of sets) {
    for (const section of questionSet?.sections || []) {
      for (const question of section?.questions || []) {
        if ((question?.type || section?.type) !== 'coding') continue;
        const problemId = question.problemId || question.coding?.problemId
          || question.problemDataSnapshot?._id || question.coding?.problemData?._id;
        if (!mongoose.isValidObjectId(problemId)) continue;

        let ownedProblem = cloneCache.get(String(problemId));
        if (!ownedProblem) {
          const current = await Problem.findById(problemId).select('+assessmentDraftKey');
          if (!current) throw new HttpError(400, 'An assessment coding problem no longer exists.');
          if (String(current.assessmentOwnerId || '') === String(assessmentId)) {
            ownedProblem = current;
          } else if (current.visibility === 'assessment'
            && !current.assessmentOwnerId
            && String(current.createdBy || '') === String(userId)) {
            current.assessmentOwnerId = assessmentId;
            current.assessmentDraftKey = '';
            await current.save();
            ownedProblem = current;
          } else {
            ownedProblem = await cloneProblemForAssessment(problemId, { assessmentId, userId });
          }
          cloneCache.set(String(problemId), ownedProblem);
        }

        const ownedId = ownedProblem._id;
        question.problemId = ownedId;
        if (question.problemDataSnapshot) question.problemDataSnapshot._id = ownedId;
        if (question.coding) {
          question.coding.problemId = ownedId;
          if (question.coding.problemData) question.coding.problemData._id = ownedId;
        }
      }
    }
  }
  return sets;
}
