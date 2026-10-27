import Problem from '../models/Problem.js';
import TestCase from '../models/TestCase.js';
import Submission from '../models/Submission.js';
import { removeAssessmentQuestionsFromLibrary } from './questionLibraryService.js';

// Assessment-only MCQ/short-answer questions live inside the Assessment document
// and disappear with it. This removes their generated library mirrors plus every
// assessment-owned coding clone. Independently saved/manual library rows have no
// sourceAssessmentId and are intentionally preserved.
export async function deleteAssessmentQuestionArtifacts(assessmentId) {
  const ownedProblems = await Problem.find({ assessmentOwnerId: assessmentId }).select('_id').lean();
  const ownedProblemIds = ownedProblems.map((problem) => problem._id);

  const operations = [removeAssessmentQuestionsFromLibrary(assessmentId)];
  if (ownedProblemIds.length) {
    operations.push(
      TestCase.deleteMany({ problem: { $in: ownedProblemIds } }),
      Submission.deleteMany({ problem: { $in: ownedProblemIds } }),
      Problem.deleteMany({ _id: { $in: ownedProblemIds } }),
    );
  }
  await Promise.all(operations);
  return { deletedCodingProblems: ownedProblemIds.length };
}
