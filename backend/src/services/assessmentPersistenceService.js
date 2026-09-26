import { randomUUID, createHash } from 'node:crypto';
import AssessmentSubmission from '../models/AssessmentSubmission.js';

export class AssessmentWriteError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isTerminalAssessmentSubmission = (doc) => (
  ['submitted', 'violation', 'expired'].includes(doc?.status)
);

export function assessmentWriteAcknowledgement(doc) {
  return {
    attemptGeneration: Number(doc.attemptGeneration || 1),
    answerRevision: Number(doc.answerRevision || 0),
    acceptedSequence: Number(doc.lastAcceptedBatch?.sequence || 0),
    lastAcceptedBatch: doc.lastAcceptedBatch?.toObject?.() || doc.lastAcceptedBatch || null,
    submissionReceipt: doc.submissionReceipt || '',
    receipt: doc.submissionReceipt || '',
  };
}

/** Mutations may be retried. They must never send mail, enqueue jobs or perform
 * external side effects. Only modified fields are written, and every writer
 * shares the same __v compare-and-set boundary (including legacy save()). */
export async function mutateAssessmentSubmission({ filter, mutate, select, maxRetries = 8 }) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    let query = AssessmentSubmission.findOne(filter);
    query = select ? query.select(`${select} +__v`) : query.select('-proctoringSnapshots -monitoringEvents');
    const submission = await query;
    if (!submission) return { submission: null, result: null, changed: false };
    const expectedVersion = submission.__v;
    const result = await mutate(submission);
    const changes = submission.getChanges();
    delete changes.$inc?.__v;
    if (changes.$inc && !Object.keys(changes.$inc).length) delete changes.$inc;
    if (!Object.keys(changes).length) return { submission, result, changed: false };
    await submission.validate({ validateModifiedOnly: true });
    const versionFilter = expectedVersion === undefined
      ? { __v: { $exists: false } }
      : { __v: expectedVersion };
    changes.$inc = { ...(changes.$inc || {}), __v: 1 };
    const updated = await AssessmentSubmission.findOneAndUpdate(
      { $and: [filter, { _id: submission._id }, versionFilter] },
      changes,
      { new: true, runValidators: true },
    ).select(select ? `${select} +__v` : '-proctoringSnapshots -monitoringEvents');
    if (updated) return { submission: updated, result, changed: true };
    // Bound retry pressure and avoid synchronized contenders spinning on Mongo.
    await new Promise((resolve) => setTimeout(resolve, 3 + Math.random() * (attempt + 1) * 7));
  }
  throw new AssessmentWriteError(409, 'ASSESSMENT_WRITE_CONFLICT', 'The attempt changed during saving. Retry the same request.');
}

export function assertAssessmentSession(doc, { sessionId, attemptGeneration, submissionId } = {}) {
  if (submissionId !== undefined && String(submissionId) !== String(doc._id)) {
    throw new AssessmentWriteError(409, 'ATTEMPT_IDENTITY_CONFLICT', 'This request belongs to a different assessment attempt.');
  }
  if (attemptGeneration !== undefined && Number(attemptGeneration) !== Number(doc.attemptGeneration || 1)) {
    throw new AssessmentWriteError(409, 'ATTEMPT_GENERATION_CONFLICT', 'This request belongs to an earlier attempt.', assessmentWriteAcknowledgement(doc));
  }
  if (!isTerminalAssessmentSubmission(doc) && doc.activeSessionId && String(sessionId || '') !== doc.activeSessionId) {
    throw new AssessmentWriteError(409, 'ACTIVE_ASSESSMENT_SESSION', 'This assessment is active in another tab, browser, or device.');
  }
}

export function assertAssessmentWriteProtocol(input = {}) {
  if (process.env.ASSESSMENT_REQUIRE_SAVE_PROTOCOL !== 'true') return;
  if (typeof input.submissionId !== 'string' || !/^[a-f0-9]{24}$/i.test(input.submissionId)
    || !Number.isSafeInteger(input.attemptGeneration) || input.attemptGeneration < 1
    || typeof input.mutationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.mutationId)
    || !Number.isSafeInteger(input.saveSequence) || input.saveSequence < 1) {
    throw new AssessmentWriteError(426, 'CLIENT_UPGRADE_REQUIRED', 'Reload the assessment page to use the current saving protocol.');
  }
}

export function normalizeAssessmentAnswerChanges(value, sections) {
  if (!Array.isArray(value)) throw new AssessmentWriteError(400, 'INVALID_ANSWERS', 'Answers must be an array.');
  if (value.length > 1000 || Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) {
    throw new AssessmentWriteError(413, 'ANSWER_PAYLOAD_TOO_LARGE', 'The answer batch is too large.');
  }
  const seen = new Set();
  return value.map((entry) => {
    const { sectionIndex, questionIndex } = entry || {};
    const question = sections?.[sectionIndex]?.questions?.[questionIndex];
    if (!Number.isInteger(sectionIndex) || !Number.isInteger(questionIndex) || sectionIndex < 0 || questionIndex < 0 || !question) {
      throw new AssessmentWriteError(400, 'INVALID_QUESTION', 'An answer references a question outside this attempt.');
    }
    const key = `${sectionIndex}-${questionIndex}`;
    if (seen.has(key)) throw new AssessmentWriteError(400, 'DUPLICATE_QUESTION', 'An answer batch contains duplicate questions.');
    seen.add(key);
    // Execution results and scores are server owned. Never pass client-supplied
    // job IDs, verdicts or grading metadata through the answer merge helper.
    const clean = { sectionIndex, questionIndex };
    if (Object.hasOwn(entry, 'answer')) clean.answer = entry.answer;
    if (Object.hasOwn(entry, 'code')) {
      if (typeof entry.code !== 'string' || Buffer.byteLength(entry.code) > 256 * 1024) {
        throw new AssessmentWriteError(413, 'CODE_TOO_LARGE', 'Code must be a string smaller than 256 KiB.');
      }
      clean.code = entry.code;
    }
    if (Object.hasOwn(entry, 'language')) {
      if (typeof entry.language !== 'string' || entry.language.length > 32) throw new AssessmentWriteError(400, 'INVALID_LANGUAGE', 'Invalid language.');
      clean.language = entry.language;
    }
    return clean;
  }).sort((a, b) => a.sectionIndex - b.sectionIndex || a.questionIndex - b.questionIndex);
}

function assessmentBatchHash(answers, final) {
  return createHash('sha256').update(JSON.stringify({ answers, final })).digest('hex');
}

export function assessmentBatchMatches(doc, { mutationId, saveSequence, answers, final = false }) {
  const last = doc.lastAcceptedBatch;
  return Boolean(typeof mutationId === 'string' && mutationId
    && Number.isSafeInteger(saveSequence) && last?.id === mutationId
    && last.sequence === saveSequence && last.hash === assessmentBatchHash(answers, final));
}

export function acceptAssessmentBatch(doc, { mutationId, saveSequence, answers, final = false }) {
  // Compatibility for older deployed frontends. Lifecycle/session CAS still
  // applies; new clients get ordered, gap-free, idempotent batches.
  if (mutationId === undefined && saveSequence === undefined) return true;
  if (typeof mutationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(mutationId)
    || !Number.isSafeInteger(saveSequence) || saveSequence < 1) {
    throw new AssessmentWriteError(400, 'INVALID_SAVE_BATCH', 'Invalid mutation ID or save sequence.');
  }
  const hash = assessmentBatchHash(answers, final);
  const last = doc.lastAcceptedBatch;
  if (assessmentBatchMatches(doc, { mutationId, saveSequence, answers, final })) return false;
  if (last?.id === mutationId || saveSequence !== Number(last?.sequence || 0) + 1) {
    throw new AssessmentWriteError(409, 'SAVE_SEQUENCE_CONFLICT', 'Refresh the saved state before sending the next batch.', assessmentWriteAcknowledgement(doc));
  }
  doc.lastAcceptedBatch = { id: mutationId, sequence: saveSequence, hash, answersAccepted: true };
  return true;
}

export function finishAssessmentSubmission(doc, { now = new Date(), submittedAt = now, finalStatus = 'submitted', isLate = false, timeTakenSec } = {}) {
  if (isTerminalAssessmentSubmission(doc)) return false;
  doc.status = finalStatus;
  doc.submittedAt = submittedAt;
  doc.attemptCount = Number(doc.attemptCount || 0) + 1;
  doc.submissionReceipt = randomUUID();
  doc.evaluationVersion = Number(doc.evaluationVersion || 0) + 1;
  doc.evaluationStatus = 'processing';
  doc.pendingWork = { status: 'pending', version: doc.evaluationVersion, attempts: 0, nextAttemptAt: now };
  doc.activeSessionId = '';
  doc.activeSessionHeartbeatAt = undefined;
  doc.isLate = isLate;
  if (timeTakenSec !== undefined) doc.timeTakenSec = timeTakenSec;
  doc.lastSavedAt = now;
  return true;
}
