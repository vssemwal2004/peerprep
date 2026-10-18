import mongoose from 'mongoose';
import Assessment from '../src/models/Assessment.js';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import User from '../src/models/User.js';

const assessmentIdArg = process.argv.find((arg) => arg.startsWith('--assessment-id='));
const assessmentId = assessmentIdArg?.slice('--assessment-id='.length).trim();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.min(100, Math.max(1, Number(limitArg?.slice('--limit='.length)) || 20));

if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') {
  throw new Error('A persistent MONGODB_URI is required. This audit refuses the in-memory database.');
}
if (assessmentId && !mongoose.isValidObjectId(assessmentId)) {
  throw new Error(`Invalid --assessment-id: ${assessmentId}`);
}

function questionPoints(question = {}, section = {}) {
  return Number(question.points ?? question.marks ?? section.marksPerQuestion ?? 0) || 0;
}

function summarizeSections(sections = []) {
  const sectionRows = sections.map((section, sectionIndex) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    const marks = questions.reduce((sum, question) => sum + questionPoints(question, section), 0);
    return {
      sectionIndex,
      name: section?.sectionName || `Section ${sectionIndex + 1}`,
      type: section?.type || '',
      questionCount: questions.length,
      calculatedMarks: marks,
      storedMarks: Number(section?.totalMarks) || 0,
      questionMarks: questions.map((question, questionIndex) => ({
        questionIndex,
        questionId: question?.questionId || '',
        type: question?.type || section?.type || '',
        points: questionPoints(question, section),
      })),
    };
  });
  return {
    questionCount: sectionRows.reduce((sum, row) => sum + row.questionCount, 0),
    calculatedMarks: sectionRows.reduce((sum, row) => sum + row.calculatedMarks, 0),
    sections: sectionRows,
  };
}

function summarizeAssessment(assessment) {
  const questionSets = Array.isArray(assessment.questionSets) ? assessment.questionSets : [];
  const sets = questionSets.length
    ? questionSets.map((set) => ({
      setNumber: Number(set.setNumber) || 1,
      storedMarks: Number(set.totalMarks) || 0,
      ...summarizeSections(set.sections),
    }))
    : [{ setNumber: 1, storedMarks: Number(assessment.totalMarks) || 0, ...summarizeSections(assessment.sections) }];
  const calculatedTotals = [...new Set(sets.map((set) => set.calculatedMarks))];
  return {
    id: String(assessment._id),
    title: assessment.title || '',
    lifecycleStatus: assessment.lifecycleStatus || '',
    storedTotalMarks: Number(assessment.totalMarks) || 0,
    calculatedTotals,
    consistentAcrossSets: calculatedTotals.length <= 1,
    storedTotalMatches: calculatedTotals.length === 1
      && calculatedTotals[0] === (Number(assessment.totalMarks) || 0),
    sets,
  };
}

await mongoose.connect(process.env.MONGODB_URI, {
  autoIndex: false,
  serverSelectionTimeoutMS: 15000,
});

try {
  const assessmentQuery = assessmentId ? { _id: assessmentId } : {};
  const assessments = await Assessment.find(assessmentQuery)
    .select('title lifecycleStatus totalMarks sections questionSets updatedAt')
    .sort({ updatedAt: -1 })
    .limit(assessmentId ? 1 : limit)
    .lean();

  const assessmentIds = assessments.map((assessment) => assessment._id);
  const submissionQuery = assessmentId
    ? { assessmentId }
    : { assessmentId: { $in: assessmentIds }, status: { $in: ['submitted', 'expired', 'violation'] } };
  const submissions = await AssessmentSubmission.find(submissionQuery)
    .select('assessmentId studentId assignedSetNumber status evaluationStatus score maxMarks deliverySections deliveryPreparedAt submittedAt pendingWork answers.executionStatus answers.executionVerdict')
    .sort({ submittedAt: -1 })
    .limit(assessmentId ? 5000 : 1000)
    .lean();

  const studentIds = [...new Set(submissions.map((row) => String(row.studentId)).filter(Boolean))];
  const students = await User.find({ _id: { $in: studentIds } })
    .select('name studentId email')
    .lean();
  const studentsById = new Map(students.map((student) => [String(student._id), student]));

  const submissionsByAssessment = new Map();
  for (const submission of submissions) {
    const key = String(submission.assessmentId);
    if (!submissionsByAssessment.has(key)) submissionsByAssessment.set(key, []);
    const delivered = summarizeSections(submission.deliverySections || []);
    const student = studentsById.get(String(submission.studentId));
    submissionsByAssessment.get(key).push({
      submissionId: String(submission._id),
      student: student ? {
        name: student.name || '',
        studentId: student.studentId || '',
        email: student.email || '',
      } : { id: String(submission.studentId) },
      status: submission.status,
      evaluationStatus: submission.evaluationStatus,
      assignedSetNumber: submission.assignedSetNumber || 1,
      storedScore: submission.score,
      storedMaxMarks: submission.maxMarks,
      deliveredQuestionCount: delivered.questionCount,
      deliveredCalculatedMarks: delivered.calculatedMarks,
      deliveryPreparedAt: submission.deliveryPreparedAt,
      submittedAt: submission.submittedAt,
      failedAnswerCount: (submission.answers || []).filter((answer) => answer.executionStatus === 'failed').length,
      pendingWork: submission.pendingWork,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    database: mongoose.connection.db.databaseName,
    mode: 'read-only',
    assessments: assessments.map((assessment) => {
      const summary = summarizeAssessment(assessment);
      const relatedSubmissions = submissionsByAssessment.get(String(assessment._id)) || [];
      return {
        ...summary,
        submissionCount: relatedSubmissions.length,
        failedEvaluationCount: relatedSubmissions.filter((row) => row.evaluationStatus === 'failed').length,
        submissionMaxMarks: [...new Set(relatedSubmissions.map((row) => row.storedMaxMarks).filter(Number.isFinite))],
        deliveredTotals: [...new Set(relatedSubmissions.map((row) => row.deliveredCalculatedMarks))],
        submissions: relatedSubmissions,
      };
    }),
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
