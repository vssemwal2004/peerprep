import Assessment from '../models/Assessment.js';
import Semester from '../models/Subject.js';
import Problem from '../models/Problem.js';
import { controlRequest, universityPolicy } from './client.js';
import { isUniversity } from './deployment.js';

const QUESTION_CACHE_MS = 30_000;
let questionCache = null;
let questionCacheUntil = 0;
let questionRequest = null;
const judgeDataCache = new Map();

export async function sharedJudgeData(question) {
  if (!isUniversity() || !question?._id) throw new Error('Shared judge data requires a university question');
  const cacheKey = `${question._id}:${question.updatedAt || ''}`;
  const cached = judgeDataCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;
  if (cached?.request) return cached.request;
  const request = controlRequest(`questions/${encodeURIComponent(String(question._id))}/judge-data`);
  judgeDataCache.set(cacheKey, { request });
  try {
    const value = await request;
    if (judgeDataCache.size > 100) judgeDataCache.clear();
    judgeDataCache.set(cacheKey, { value, until: Date.now() + QUESTION_CACHE_MS });
    return value;
  } catch (error) {
    judgeDataCache.delete(cacheKey);
    throw error;
  }
}

export async function sharedAssessments() {
  if (!isUniversity()) return [];
  const policy = await universityPolicy();
  if (!policy.permissions?.assessments) return [];
  const { assessments } = await controlRequest('assessments');
  return assessments.map((assessment) => ({ ...Assessment.hydrate(assessment).toObject(), platformShared: true, platformPublished: true }));
}

export async function sharedAssessment(id) {
  if (!isUniversity() || !id) return null;
  const policy = await universityPolicy();
  if (!policy.permissions?.assessments) return null;
  try {
    const { assessment } = await controlRequest(`assessments/${encodeURIComponent(String(id))}`);
    return { ...Assessment.hydrate(assessment).toObject(), platformShared: true, platformPublished: assessment.platformPublished };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function assessmentDefinitionById(id) {
  return await Assessment.findById(id).lean() || await sharedAssessment(id);
}

export async function sharedAssessmentProblem(assessmentId, problemId) {
  if (!isUniversity() || !assessmentId) return null;
  try {
    const { problem } = await controlRequest(`assessments/${encodeURIComponent(String(assessmentId))}/problems/${encodeURIComponent(String(problemId))}`);
    return Problem.hydrate(problem);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function learningSemesters() {
  if (!isUniversity()) return null;
  const policy = await universityPolicy();
  if (!policy.permissions?.learning) return [];
  if (policy.sources?.learning !== 'shared') return null;
  const { semesters } = await controlRequest('learning/semesters');
  return semesters.map((semester) => Semester.hydrate(semester));
}

export async function sharedQuestions() {
  if (!isUniversity()) return null;
  const policy = await universityPolicy();
  if (!policy.permissions?.questions) return [];
  if (questionCache && questionCacheUntil > Date.now()) return questionCache;
  if (questionRequest) return questionRequest;
  questionRequest = controlRequest('questions').then(({ questions }) => {
    if (!Array.isArray(questions)) {
      const error = new Error('Central question feed returned an invalid response');
      error.status = 503;
      throw error;
    }
    questionCache = questions.map((question) => ({ ...question, platformShared: true }));
    questionCacheUntil = Date.now() + QUESTION_CACHE_MS;
    return questionCache;
  });
  try { return await questionRequest; }
  finally { questionRequest = null; }
}
