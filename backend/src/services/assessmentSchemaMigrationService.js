import { randomUUID } from 'node:crypto';

// Pure patch builder. Do not change answers, grade completed work or reset
// existing revisions. Per-document CAS lets an online migration safely skip
// concurrently edited attempts; rerunning picks up skipped documents.
export function assessmentProtocolBackfill(row) {
  const values = {};
  if (row.schemaVersion === undefined || row.schemaVersion < 2) values.schemaVersion = 2;
  if (row.attemptGeneration === undefined) values.attemptGeneration = 1;
  if (row.answerRevision === undefined) values.answerRevision = 0;
  if (!row.lastAcceptedBatch) values.lastAcceptedBatch = { id: '', sequence: 0, hash: '', answersAccepted: true };
  if (row.evaluationVersion === undefined) values.evaluationVersion = 0;
  if (['submitted', 'expired', 'violation'].includes(row.status)) {
    if (!row.submissionReceipt) values.submissionReceipt = randomUUID();
    if (row.evaluationStatus === 'processing' && !row.pendingWork?.status) {
      values.pendingWork = { status: 'pending', version: row.evaluationVersion || 0, attempts: 0, nextAttemptAt: new Date() };
    }
  }
  if (!Object.keys(values).length) return null;
  return {
    filter: { _id: row._id, __v: row.__v === undefined ? { $exists: false } : row.__v },
    update: { $set: values, $inc: { __v: 1 } },
  };
}
