import AssessmentSubmission from '../models/AssessmentSubmission.js';
import AssessmentEvent from '../models/AssessmentEvent.js';
import AssessmentAttemptArchive from '../models/AssessmentAttemptArchive.js';
import AssessmentReportSummary from '../models/AssessmentReportSummary.js';
import Assessment from '../models/Assessment.js';
import { requestAssessmentReportRefresh } from './assessmentReportSummaryService.js';
import { cloudinaryEvidencePrefix } from './assessmentEvidenceService.js';
import { scheduleEvidenceCleanup } from './assessmentEvidenceCleanupService.js';

// Call only after the controller has authorized an explicit reset/deletion.
// All three collections share these scope keys. Never accept arbitrary filters.
export async function deleteAssessmentAttemptData(scope) {
  const filter = {};
  for (const key of ['assessmentId', 'studentId']) {
    if (scope[key] !== undefined) filter[key] = scope[key];
  }
  if (!Object.keys(filter).length) throw new Error('An exact assessment/student deletion scope is required');
  const submissions = await AssessmentSubmission.find(filter).select('_id assessmentId').lean();
  const assessmentIds = [...new Set(submissions.map((submission) => String(submission.assessmentId)))];
  // Queue the Cloudinary images before the records go, so a crash in between
  // still removes them. A whole assessment is one prefix; a student scope is one per attempt.
  await scheduleEvidenceCleanup(filter.studentId === undefined
    ? [cloudinaryEvidencePrefix(filter.assessmentId)]
    : submissions.map((submission) => cloudinaryEvidencePrefix(submission.assessmentId, submission._id)));
  const result = await AssessmentSubmission.deleteMany(filter);
  await Promise.all([
    AssessmentEvent.deleteMany(filter),
    AssessmentAttemptArchive.deleteMany(filter),
  ]);
  for (const id of assessmentIds) {
    if (await Assessment.exists({ _id: id })) await requestAssessmentReportRefresh(id);
    else await AssessmentReportSummary.deleteOne({ _id: id });
  }
  // Cloudinary images are deleted by the maintenance worker (runEvidenceCleanup);
  // never perform an unbounded object-store deletion in an API request. Supabase
  // objects, if any remain from earlier, follow the bucket retention policy.
  return result;
}
