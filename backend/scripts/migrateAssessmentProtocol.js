import mongoose from 'mongoose';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import AssessmentEvent from '../src/models/AssessmentEvent.js';
import AssessmentAttemptArchive from '../src/models/AssessmentAttemptArchive.js';
import AssessmentReportSummary from '../src/models/AssessmentReportSummary.js';
import { assessmentProtocolBackfill } from '../src/services/assessmentSchemaMigrationService.js';

// Explicit env loading belongs to the operator: node --env-file=.env ...
// Default is a read-only audit. Never logs URI, passwords or student answers.
const apply = process.argv.includes('--apply');
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the intended database.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, maxPoolSize: 2, serverSelectionTimeoutMS: 8000 });
  const database = mongoose.connection.name;
  if (['admin', 'config', 'local'].includes(database)) throw new Error('Refusing to migrate a MongoDB system database.');
  if (apply && process.env.CONFIRM_ASSESSMENT_DATABASE !== database) throw new Error('Set CONFIRM_ASSESSMENT_DATABASE to the exact database name before --apply.');
  let inspected = 0, needed = 0, modified = 0;
  const cursor = AssessmentSubmission.collection.find({}, { projection: {
    _id: 1, __v: 1, schemaVersion: 1, attemptGeneration: 1, answerRevision: 1,
    lastAcceptedBatch: 1, evaluationVersion: 1, submissionReceipt: 1, status: 1, evaluationStatus: 1, pendingWork: 1,
  }, batchSize: 100 });
  let batch = [];
  async function flush() {
    if (apply && batch.length) {
      const result = await AssessmentSubmission.collection.bulkWrite(batch, { ordered: false });
      modified += result.modifiedCount;
    }
    batch = [];
  }
  for await (const row of cursor) {
    inspected += 1;
    const change = assessmentProtocolBackfill(row);
    if (change) { needed += 1; batch.push({ updateOne: change }); }
    if (batch.length >= 100) await flush();
  }
  await flush();
  if (apply) {
    for (const model of [AssessmentSubmission, AssessmentEvent, AssessmentAttemptArchive, AssessmentReportSummary]) await model.createIndexes();
  }
  console.log(JSON.stringify({ database, mode: apply ? 'apply' : 'audit', inspected, needed, modified, rerunToConfirm: apply && needed !== modified }));
}
try { await run(); }
catch (error) { console.error(`Assessment migration failed: ${error.code || error.name}. Check target connectivity, confirmation and indexes; no credentials are logged.`); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
