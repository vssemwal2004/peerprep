import mongoose from 'mongoose';
import Assessment from '../../../models/Assessment.js';
import AssessmentSubmission from '../../../models/AssessmentSubmission.js';
import { authorizedOwnedFilter } from '../adminAnalytics.authorization.js';
import { ANALYTICS_LIMITS } from '../adminAnalytics.validation.js';

function isCompletedAssessment(assessment, now = new Date()) {
  return Boolean(assessment.manuallyCompletedAt)
    || (assessment.lifecycleStatus === 'published' && assessment.endTime && new Date(assessment.endTime) <= now);
}

export async function collectAssessmentEvidence({ user, studentIds, query }) {
  const definitionFilter = authorizedOwnedFilter(user);
  if (query.assessments.ids.length) definitionFilter._id = { $in: query.assessments.ids };
  if (query.assessments.types.length) definitionFilter.assessmentType = { $in: query.assessments.types };
  const definitions = (await Assessment.find(definitionFilter)
    .select('_id title assessmentType lifecycleStatus manuallyCompletedAt endTime totalMarks assignedStudents targetType')
    .limit(5000)
    .lean())
    .filter((assessment) => !query.assessments.completedOnly || isCompletedAssessment(assessment));
  const assessmentIds = definitions.map((assessment) => assessment._id);
  if (!studentIds.length || !assessmentIds.length) return emptyAssessment(definitions);
  const match = {
    studentId: { $in: studentIds },
    assessmentId: { $in: assessmentIds },
    status: { $in: ['submitted', 'violation', 'expired'] },
    evaluationStatus: 'completed',
    score: { $type: 'number' },
    maxMarks: { $gt: 0 },
    $or: [
      { submittedAt: { $gte: query.date.from, $lte: query.date.to } },
      { status: 'expired', updatedAt: { $gte: query.date.from, $lte: query.date.to } },
    ],
  };
  if (query.assessments.setNumbers.length) match.assignedSetNumber = { $in: query.assessments.setNumbers };
  if (query.assessments.questionTypes.length) match['deliverySections.type'] = { $in: query.assessments.questionTypes };
  if (query.assessments.sections.length) match['deliverySections.sectionName'] = { $in: query.assessments.sections };
  if (query.assessments.topics.length) match['deliverySections.questions.tags'] = { $in: query.assessments.topics };
  const rows = await AssessmentSubmission.find(match)
    .select('_id studentId assessmentId score maxMarks accuracy timeTakenSec submittedAt status deliverySections createdAt updatedAt')
    .sort({ updatedAt: -1, _id: -1 })
    .limit(ANALYTICS_LIMITS.maxInteractiveRows + 1)
    .lean();
  const truncated = rows.length > ANALYTICS_LIMITS.maxInteractiveRows;
  const submissions = rows.slice(0, ANALYTICS_LIMITS.maxInteractiveRows);
  const perStudent = new Map();
  const perAssessment = new Map();
  const activity = [];
  for (const row of submissions) {
    const studentId = String(row.studentId);
    const assessmentId = String(row.assessmentId);
    const eventAt = row.submittedAt || row.updatedAt || row.createdAt;
    const compact = { score: Number(row.score), maxMarks: Number(row.maxMarks), timeTakenSec: Number(row.timeTakenSec) || 0, submittedAt: eventAt, assessmentId };
    const student = perStudent.get(studentId) || { attempts: [], activeDays: new Set(), effort: 0 };
    student.attempts.push(compact);
    student.activeDays.add(eventAt.toISOString().slice(0, 10));
    student.effort += compact.timeTakenSec;
    perStudent.set(studentId, student);
    const assessment = perAssessment.get(assessmentId) || { assessmentId, attempts: [] };
    assessment.attempts.push({ studentId, ...compact });
    perAssessment.set(assessmentId, assessment);
    activity.push({ studentId, at: eventAt, kind: 'assessment', assessmentId });
  }
  return { source: 'assessment', definitions, submissions, perStudent, perAssessment, activity, truncated, topicScoringAvailable: false };
}

function emptyAssessment(definitions = []) {
  return { source: 'assessment', definitions, submissions: [], perStudent: new Map(), perAssessment: new Map(), activity: [], truncated: false, topicScoringAvailable: false };
}

export { isCompletedAssessment };
