import Assessment from '../models/Assessment.js';
import Semester from '../models/Subject.js';
import Problem from '../models/Problem.js';
import { controlRequest, universityPolicy } from './client.js';
import { isUniversity } from './deployment.js';

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
  if (policy.sources?.questions !== 'shared') return null;
  const { questions } = await controlRequest('questions');
  return questions;
}
