import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'recoverFailedAssessmentEvaluations.js');
let mongo;
let uri;

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { dbName: 'peerprep' } });
  uri = mongo.getUri('peerprep');
  await mongoose.connect(uri);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function runScript(args, extraEnv = {}) {
  // Only this test-owned in-memory database is targeted.
  return run(process.execPath, [script, ...args], { env: { ...process.env, MONGODB_URI: uri, ...extraEnv } });
}

test('stuck-dispatch recovery requeues parked grading with a new evaluation version and keeps answers', async () => {
  const assessmentId = new mongoose.Types.ObjectId();
  const otherAssessmentId = new mongoose.Types.ObjectId();
  const parked = (forAssessment) => ({
    assessmentId: forAssessment, studentId: new mongoose.Types.ObjectId(),
    status: 'submitted', evaluationStatus: 'processing', evaluationVersion: 1, attemptGeneration: 1,
    submittedAt: new Date('2026-10-29T10:00:00Z'),
    answers: [{ sectionIndex: 0, questionIndex: 0, code: 'print(1)', language: 'python', jobId: 'old', executionStatus: 'queued' }],
    pendingWork: { status: 'failed', version: 1, attempts: 1766, nextAttemptAt: null, lastError: 'Grading jobs used every retry' },
  });
  const [target, untouched] = await AssessmentSubmission.create([parked(assessmentId), parked(otherAssessmentId)]);

  const dry = await runScript(['--stuck-dispatch', `--assessment-id=${assessmentId}`, '--summary']);
  const summary = JSON.parse(dry.stdout);
  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.failedSubmissions, 1);
  assert.equal(summary.groups[0].evaluationStatus, 'processing');
  assert.doesNotMatch(dry.stdout, /"student"/);
  assert.equal((await AssessmentSubmission.findById(target._id).lean()).evaluationVersion, 1, 'dry run changes nothing');

  await assert.rejects(runScript(['--stuck-dispatch', `--assessment-id=${assessmentId}`, '--apply']), /CONFIRM_ASSESSMENT_DATABASE/);
  await runScript(['--stuck-dispatch', `--assessment-id=${assessmentId}`, '--apply', '--summary'], { CONFIRM_ASSESSMENT_DATABASE: 'peerprep' });

  const recovered = await AssessmentSubmission.findById(target._id).lean();
  assert.equal(recovered.evaluationVersion, 2);
  assert.equal(recovered.evaluationStatus, 'processing');
  assert.equal(recovered.pendingWork.status, 'pending');
  assert.equal(recovered.pendingWork.version, 2);
  assert.ok(recovered.pendingWork.nextAttemptAt instanceof Date);
  assert.equal(recovered.answers[0].code, 'print(1)');
  assert.equal(await mongoose.connection.db.collection('assessmentEvaluationRecoveries').countDocuments({ submissionId: target._id, state: 'requeued' }), 1);

  const other = await AssessmentSubmission.findById(untouched._id).lean();
  assert.equal(other.evaluationVersion, 1, 'other assessments are not touched');
  assert.equal(other.pendingWork.status, 'failed');
});
