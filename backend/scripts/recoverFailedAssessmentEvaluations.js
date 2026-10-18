import '../src/setup.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';

const APPLY = process.argv.includes('--apply');
const ALL_FAILED = process.argv.includes('--all-failed');
const value = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
const ids = value('submission-ids').split(',').map((entry) => entry.trim()).filter(Boolean);
const hash = (input) => createHash('sha256').update(String(input || '')).digest('hex');

for (const id of ids) assert.ok(mongoose.isValidObjectId(id), `Invalid submission id: ${id}`);
if (APPLY) {
  assert.ok(ALL_FAILED || ids.length, '--apply requires --submission-ids=... or --all-failed');
  assert.equal(process.env.CONFIRM_ASSESSMENT_DATABASE, 'peerprep', 'Set CONFIRM_ASSESSMENT_DATABASE=peerprep for an apply');
}

await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 30_000 });
try {
  const db = mongoose.connection.db;
  const query = {
    evaluationStatus: 'failed',
    status: { $in: ['submitted', 'violation', 'expired'] },
    ...(ids.length ? { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } : {}),
  };
  const submissions = await AssessmentSubmission.find(query)
    .select('-proctoringSnapshots -monitoringEvents -violationLog -securityHeartbeat')
    .sort({ submittedAt: -1 })
    .lean();

  const [students, assessments, executionJobs] = await Promise.all([
    db.collection('users').find({ _id: { $in: submissions.map((row) => row.studentId) } }, { projection: { name: 1, studentId: 1, email: 1 } }).toArray(),
    db.collection('assessments').find({ _id: { $in: submissions.map((row) => row.assessmentId) } }, { projection: { title: 1 } }).toArray(),
    db.collection('executionjobs').find({ assessmentSubmissionId: { $in: submissions.map((row) => row._id) } }, { projection: { assessmentSubmissionId: 1, jobId: 1, problemId: 1, status: 1, attemptsMade: 1, maxAttempts: 1, error: 1, metadata: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray(),
  ]);
  const studentById = new Map(students.map((row) => [String(row._id), row]));
  const assessmentById = new Map(assessments.map((row) => [String(row._id), row]));
  const jobsBySubmission = Map.groupBy(executionJobs, (row) => String(row.assessmentSubmissionId));
  const rows = submissions.map((submission) => {
    const student = studentById.get(String(submission.studentId));
    const failedAnswers = (submission.answers || []).filter((answer) => answer.executionStatus === 'failed');
    const jobs = jobsBySubmission.get(String(submission._id)) || [];
    return {
      submissionId: String(submission._id),
      assessmentId: String(submission.assessmentId),
      assessment: assessmentById.get(String(submission.assessmentId))?.title || 'Unknown assessment',
      student: student?.name || student?.studentId || student?.email || String(submission.studentId),
      studentId: student?.studentId || '',
      submittedAt: submission.submittedAt,
      evaluationVersion: Number(submission.evaluationVersion || 0),
      pendingWork: submission.pendingWork,
      failedAnswers: failedAnswers.map((answer) => ({
        sectionIndex: answer.sectionIndex,
        questionIndex: answer.questionIndex,
        language: answer.language,
        jobId: answer.jobId,
        verdict: answer.executionVerdict,
        error: answer.executionResult?.error || '',
        codeSha256: hash(answer.code),
      })),
      jobs: jobs.map((job) => ({
        jobId: job.jobId, problemId: String(job.problemId || ''), status: job.status,
        attemptsMade: job.attemptsMade, maxAttempts: job.maxAttempts,
        error: job.error?.message || '', errorCode: job.error?.code || '',
        totalRuns: Number(job.metadata?.totalRuns || 0), updatedAt: job.updatedAt,
      })),
    };
  });

  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', database: db.databaseName, failedSubmissions: rows.length, rows }, null, 2));
  if (APPLY && submissions.length) {
    const audit = db.collection('assessmentEvaluationRecoveries');
    const recovered = [];
    for (const submission of submissions) {
    const nextVersion = Number(submission.evaluationVersion || 0) + 1;
    const now = new Date();
    const record = await audit.insertOne({
      submissionId: submission._id,
      assessmentId: submission.assessmentId,
      studentId: submission.studentId,
      previousEvaluationVersion: submission.evaluationVersion,
      previousEvaluationStatus: submission.evaluationStatus,
      previousPendingWork: submission.pendingWork,
      previousCodingJobsPending: submission.codingJobsPending,
      previousCodingJobsCompleted: submission.codingJobsCompleted,
      answerExecutionState: (submission.answers || []).map((answer) => ({
        sectionIndex: answer.sectionIndex, questionIndex: answer.questionIndex,
        jobId: answer.jobId, executionStatus: answer.executionStatus,
        executionVerdict: answer.executionVerdict, executionResult: answer.executionResult,
        lastEvaluatedAt: answer.lastEvaluatedAt, codeSha256: hash(answer.code),
      })),
      state: 'pending', createdAt: now,
    });
    const result = await AssessmentSubmission.updateOne({
      _id: submission._id,
      evaluationStatus: 'failed',
      evaluationVersion: submission.evaluationVersion,
      updatedAt: submission.updatedAt,
    }, {
      $set: {
        evaluationVersion: nextVersion,
        evaluationStatus: 'processing',
        codingJobsPending: 0,
        codingJobsCompleted: 0,
        pendingWork: { status: 'pending', version: nextVersion, attempts: 0, nextAttemptAt: now, lastError: '' },
      },
      $inc: { __v: 1 },
    });
    assert.equal(result.modifiedCount, 1, `Concurrent update for submission ${submission._id}`);
    await Promise.all([
      audit.updateOne({ _id: record.insertedId }, { $set: { state: 'requeued', requeuedAt: new Date(), evaluationVersion: nextVersion } }),
      db.collection('assessmentreportsummaries').updateOne({ _id: submission.assessmentId }, {
        $inc: { requestedVersion: 1 }, $min: { nextRefreshAt: now },
      }, { upsert: true }),
    ]);
      recovered.push({ submissionId: String(submission._id), evaluationVersion: nextVersion });
    }
    console.log(JSON.stringify({ recovered: recovered.length, submissions: recovered, answersPreserved: true, attemptsPreserved: true }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
