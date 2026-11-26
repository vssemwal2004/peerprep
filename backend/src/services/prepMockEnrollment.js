// Prep Mock needs two things for a student (studentFeatureAccess.studentHasFeature): the opt-in
// 'prep_mock' feature AND an enrolment date (prepMockEnrolledAt), which a university SPOC's
// "Upload Students" sets. Turning Prep Mock on from "Access & features" (one student or bulk) must
// enrol the student too, or the sidebar never shows Prep Mock. On a university this counts against
// its PrepMock student limit and needs active PrepMock access, under the same lock as the SPOC
// upload. Turning the feature off keeps the enrolment (the SPOC list and limit are not changed).
import User from '../models/User.js';
import { University } from '../platform/models.js';
import { currentTenant } from '../platform/tenantContext.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';
import { withAccountCreationLocks } from '../platform/accountLimits.js';
import { HttpError } from '../utils/errors.js';

/** Ids of students who get Prep Mock now but are not enrolled yet. */
export function needsPrepMockEnrolment(students = [], nextAccessById = new Map()) {
  return students
    .filter((student) => !student.prepMockEnrolledAt && (nextAccessById.get(String(student._id))?.features || []).includes('prep_mock'))
    .map((student) => student._id);
}

/** Enrols these students in Prep Mock (respecting a university's limit). Returns how many. */
export async function enrolPrepMockStudents(ids = [], now = new Date()) {
  if (!ids.length) return 0;
  const write = async () => {
    const result = await User.updateMany({ _id: { $in: ids }, role: 'student', prepMockEnrolledAt: null }, { $set: { prepMockEnrolledAt: now } });
    return result.modifiedCount || 0;
  };
  if (!isUniversity()) return write();
  const universityId = currentTenant()?.universityId;
  if (!universityId) throw new HttpError(400, 'University context is required to turn on Prep Mock.');
  const policy = await universityPolicy();
  if (policy.permissions?.prepmock !== true) {
    throw new HttpError(403, 'Prep Mock is not active for this university (or its Prep Mock dates are over). Ask the Master Admin to turn it on.');
  }
  return withAccountCreationLocks(universityId, ['prepMock'], async () => {
    const [university, used, pending] = await Promise.all([
      University.findOne({ universityId, deletedAt: null }).select('prepMockStudentLimit').lean(),
      User.countDocuments({ role: 'student', prepMockEnrolledAt: { $ne: null } }),
      User.countDocuments({ _id: { $in: ids }, role: 'student', prepMockEnrolledAt: null }),
    ]);
    const limit = Number(university?.prepMockStudentLimit ?? 0);
    if (used + pending > limit) {
      throw new HttpError(409, `Prep Mock student limit reached (${used}/${limit}); ${pending} more would be needed. Ask the Master Admin to raise it.`);
    }
    return write();
  });
}
