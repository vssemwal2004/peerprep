import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import { University } from '../platform/models.js';
import { currentTenant } from '../platform/tenantContext.js';
import { isUniversity } from '../platform/deployment.js';
import { withAccountCreationLocks } from '../platform/accountLimits.js';

export class AssessmentCandidateQuotaError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

const quotaUniversityId = () => isUniversity() ? currentTenant()?.universityId : null;

export async function currentAssessmentCandidateQuota() {
  const universityId = quotaUniversityId();
  if (!universityId) return null;
  const university = await University.findOne({ universityId, deletedAt: null })
    .select('assessmentStudentLimit assessmentStudentUsed assessmentStudentQuotaGeneration').lean();
  if (!university) throw new AssessmentCandidateQuotaError('University account is unavailable.');
  return {
    universityId,
    limit: university.assessmentStudentLimit ?? null,
    used: Number(university.assessmentStudentUsed || 0),
    generation: Number(university.assessmentStudentQuotaGeneration || 0),
  };
}

// Drafts are editable and free. A selected student is charged when a published
// assessment first assigns them. Existing users and new users count alike.
export async function countNewAssessmentCandidates(rows, previousIds = []) {
  const previous = new Set((previousIds || []).map(String));
  if (!previous.size) return Array.isArray(rows) ? rows.length : 0;
  const oldStudents = await User.find({ _id: { $in: [...previous] } }).select('_id email studentId').lean();
  const oldEmails = new Set(oldStudents.map((student) => String(student.email || '').toLowerCase()).filter(Boolean));
  const oldAcademicIds = new Set(oldStudents.map((student) => String(student.studentId || '')).filter(Boolean));
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = row?._id || row?.id || (mongoose.isValidObjectId(row) ? row : null);
    if (id && previous.has(String(id))) return false;
    const email = String(row?.email || '').trim().toLowerCase();
    if (email && oldEmails.has(email)) return false;
    const studentId = String(row?.studentId || row?.studentid || '').trim();
    return !studentId || !oldAcademicIds.has(studentId);
  }).length;
}

export async function reserveAssessmentCandidatePlaces(count, { targetType = 'selected' } = {}) {
  const universityId = quotaUniversityId();
  if (!universityId) return null;
  return withAccountCreationLocks(universityId, ['assessment'], async () => {
    const quota = await currentAssessmentCandidateQuota();
    if (quota.limit === null) {
      throw new AssessmentCandidateQuotaError('Ask the Master Admin to set the assessment student limit for this university.');
    }
    if (targetType === 'all') {
      throw new AssessmentCandidateQuotaError('Choose specific students for university assessments while the assessment student limit is active.');
    }
    if (!Number.isInteger(count) || count < 0) throw new Error('Invalid assessment candidate count');
    if (!count) return null;
    const updated = await University.findOneAndUpdate({
      universityId,
      deletedAt: null,
      assessmentStudentLimit: { $ne: null },
      $expr: { $lte: [
        { $add: [{ $ifNull: ['$assessmentStudentUsed', 0] }, count] },
        '$assessmentStudentLimit',
      ] },
    }, { $inc: { assessmentStudentUsed: count } }, { new: true }).select('assessmentStudentQuotaGeneration').lean();
    if (!updated) {
      const latest = await currentAssessmentCandidateQuota();
      throw new AssessmentCandidateQuotaError(`Assessment student limit reached (${latest?.used ?? quota.used}/${latest?.limit ?? quota.limit}). Ask the Master Admin to increase or reset it.`);
    }
    return { universityId, generation: Number(updated.assessmentStudentQuotaGeneration || 0), count };
  });
}

export async function releaseAssessmentCandidatePlaces(reservation) {
  if (!reservation) return;
  await University.updateOne({
    universityId: reservation.universityId,
    assessmentStudentQuotaGeneration: reservation.generation === 0 ? { $in: [0, null] } : reservation.generation,
    assessmentStudentUsed: { $gte: reservation.count },
  }, { $inc: { assessmentStudentUsed: -reservation.count } });
}

export async function existingAssessmentCandidatePlaces() {
  const [row] = await Assessment.aggregate([
    { $match: { kind: { $ne: 'mock' }, lifecycleStatus: { $ne: 'draft' } } },
    { $project: { count: { $size: { $ifNull: ['$assignedStudents', []] } } } },
    { $group: { _id: null, used: { $sum: '$count' } } },
  ]);
  return Number(row?.used || 0);
}
