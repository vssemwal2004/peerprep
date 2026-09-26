import AssessmentSubmission from '../models/AssessmentSubmission.js';
import AssessmentEvent from '../models/AssessmentEvent.js';
import AssessmentAttemptArchive from '../models/AssessmentAttemptArchive.js';
import AssessmentReportSummary from '../models/AssessmentReportSummary.js';
import Assessment from '../models/Assessment.js';
import { requestAssessmentReportRefresh } from './assessmentReportSummaryService.js';

// Call only after the controller has authorized an explicit reset/deletion.
// All three collections share these scope keys. Never accept arbitrary filters.
export async function deleteAssessmentAttemptData(scope) {
  const filter = {};
  for (const key of ['assessmentId', 'studentId']) {
    if (scope[key] !== undefined) filter[key] = scope[key];
  }
  if (!Object.keys(filter).length) throw new Error('An exact assessment/student deletion scope is required');
  const assessmentIds = await AssessmentSubmission.distinct('assessmentId', filter);
  const result = await AssessmentSubmission.deleteMany(filter);
  await Promise.all([
    AssessmentEvent.deleteMany(filter),
    AssessmentAttemptArchive.deleteMany(filter),
  ]);
  for (const id of assessmentIds) {
    if (await Assessment.exists({ _id: id })) await requestAssessmentReportRefresh(id);
    else await AssessmentReportSummary.deleteOne({ _id: id });
  }
  // Private storage objects follow the bucket retention policy. Never perform
  // an unbounded object-store listing/deletion in an API request.
  return result;
}
