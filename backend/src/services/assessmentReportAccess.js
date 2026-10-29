import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import { isUniversity } from '../platform/deployment.js';
import { sharedAssessment } from '../platform/sharedContent.js';
import { hasCoordinatorPermission } from './coordinatorPermissions.js';

export const ASSESSMENT_REPORTS_PERMISSION = 'coordinator.assessment.reports';
export const ASSESSMENT_EDIT_PERMISSION = 'coordinator.assessment.edit';

export class AssessmentAccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * One authorisation rule for the live report (HTTP roster, socket room joins)
 * and results release. Admins see every assessment of their tenant; a
 * coordinator needs the permission and, unless their data scope is 'all', must
 * own the assessment. Platform-shared assessments follow the existing report
 * rule (any authorised reporter). Models resolve against the current tenant
 * context, so a socket handler must run inside runForTenant/runForPlatform.
 */
export async function authorizeAssessmentReportAccess(user, assessmentId, { permission = ASSESSMENT_REPORTS_PERMISSION } = {}) {
  if (!user?._id) throw new AssessmentAccessError(401, 'UNAUTHORIZED', 'Sign in again.');
  if (user.role === 'coordinator') {
    if (user.isActive === false) throw new AssessmentAccessError(403, 'FORBIDDEN', 'Account disabled.');
    if (!hasCoordinatorPermission(user, permission)) throw new AssessmentAccessError(403, 'FORBIDDEN', 'Coordinator permission required.');
  } else if (user.role !== 'admin') {
    throw new AssessmentAccessError(403, 'FORBIDDEN', 'Not allowed to view this assessment.');
  }
  const id = String(assessmentId || '');
  if (!/^[a-f\d]{24}$/i.test(id) || !mongoose.isValidObjectId(id)) {
    throw new AssessmentAccessError(400, 'INVALID_ASSESSMENT_ID', 'Invalid assessment id.');
  }
  let assessment = await Assessment.findById(id).select('_id createdBy lifecycleStatus').lean();
  let shared = false;
  if (!assessment && isUniversity()) {
    const remote = await sharedAssessment(id);
    if (remote) {
      assessment = { _id: remote._id, createdBy: remote.createdBy, lifecycleStatus: remote.lifecycleStatus };
      shared = true;
    }
  }
  if (!assessment) throw new AssessmentAccessError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  if (user.role === 'coordinator' && user.coordinatorDataScope !== 'all' && !shared
    && String(assessment.createdBy || '') !== String(user._id)) {
    throw new AssessmentAccessError(403, 'FORBIDDEN', 'Not allowed to view this assessment.');
  }
  return { assessmentId: String(assessment._id), shared };
}
