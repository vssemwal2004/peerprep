// The server remains the source of truth. A pending request is immutable until
// acknowledged: retrying a timeout must never send new answers under its ID.
const clone = (value) => JSON.parse(JSON.stringify(value));
const newId = () => globalThis.crypto?.randomUUID?.()
  || `assessment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wasRejectedBeforeSave = (error) => [400, 413, 422].includes(Number(error?.response?.status));
const recoverRequest = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && typeof value.mutationId === 'string' && Array.isArray(value.answers) ? clone(value) : null;

export const answerPayloadKey = (answer = {}) => `${Number(answer.sectionIndex)}-${Number(answer.questionIndex)}`;
export const answerPayloadSignature = (answer = {}) => JSON.stringify({
  answer: answer.answer ?? '',
  code: answer.code ?? '',
  language: answer.language ?? '',
});

export function mergeLiveCodingDraft(answersMap, liveCodes, liveLanguages) {
  const draft = { ...answersMap };
  Object.entries(liveCodes).forEach(([key, code]) => {
    if (typeof code !== 'string') return;
    const current = draft[key] || {};
    const language = liveLanguages[key] || current.language;
    draft[key] = { ...current, code, language,
      codeByLanguage: { ...(current.codeByLanguage || {}), ...(language ? { [language]: code } : {}) } };
  });
  return draft;
}

export function acceptedSequence(state = {}) {
  return Math.max(0, Number(state.acceptedSequence ?? state.lastAcceptedBatch?.sequence ?? 0) || 0);
}

export function isTransientSaveError(error) {
  const status = Number(error?.response?.status || 0);
  return !status || status === 408 || status === 429 || status >= 500;
}

export function isDraftForAttempt(draft, submission, sessionId) {
  return Boolean(draft && submission
    && draft.submissionId === String(submission._id)
    && Number(draft.attemptGeneration || 1) === Number(submission.attemptGeneration || 1)
    && (!draft.sessionId || draft.sessionId === sessionId)
    && !['submitted', 'violation', 'auto_submitted', 'terminated', 'expired'].includes(submission.status));
}

export class AssessmentSaveProtocol {
  constructor({ server = {}, recovered, sendSave, sendSubmit, persist = async () => {}, onState = () => {},
    onAcknowledged = () => {}, createId = newId, wait = sleep, retries = 2 }) {
    this.sendSave = sendSave;
    this.sendSubmit = sendSubmit;
    this.persist = persist;
    this.onState = onState;
    this.onAcknowledged = onAcknowledged;
    this.createId = createId;
    this.wait = wait;
    this.retries = retries;
    this.generation = Number(server.attemptGeneration || 1);
    this.submissionId = String(server._id || '');
    this.sequence = acceptedSequence(server);
    this.answerRevision = Number(server.answerRevision || 0);
    this.pendingBatch = recoverRequest(recovered?.pendingBatch);
    this.pendingFinal = recoverRequest(recovered?.pendingFinal);
    if (this.pendingBatch && this.submissionId) this.pendingBatch.submissionId = this.submissionId;
    if (this.pendingFinal && this.submissionId) this.pendingFinal.submissionId = this.submissionId;
    this.finalizing = Boolean(this.pendingFinal);
    this.terminal = false;
    this.completedResult = null;
    this.inFlight = null;
    this.finalInFlight = null;
    this.persistence = Promise.resolve();
    if (this.pendingBatch && this.pendingBatch.mutationId === server.lastAcceptedBatch?.id) {
      this.onAcknowledged(this.pendingBatch.answers || [], server);
      this.pendingBatch = null;
    }
  }

  snapshot() {
    return clone({ acceptedSequence: this.sequence, answerRevision: this.answerRevision,
      attemptGeneration: this.generation, pendingBatch: this.pendingBatch, pendingFinal: this.pendingFinal });
  }

  checkpoint() {
    const state = this.snapshot();
    // Serialization prevents a slow old IndexedDB write resurrecting a cleared batch.
    this.persistence = this.persistence.catch(() => {}).then(() => this.persist(state));
    return this.persistence;
  }

  async request(send, payload) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send(clone(payload));
      } catch (error) {
        if (!isTransientSaveError(error) || attempt >= this.retries) throw error;
        this.onState(this.finalizing ? 'submitting_retry' : 'retrying');
        await this.wait(Math.min(8000, 1000 * (2 ** attempt)) + Math.random() * 250);
      }
    }
  }

  acknowledge(payload, result = {}) {
    const state = result.submission || result;
    const sequence = acceptedSequence(result.acceptedSequence !== undefined ? result : state);
    if (sequence !== payload.saveSequence) {
      const error = new Error('The server did not confirm this answer batch. Your answers are retained on this device.');
      error.response = { status: 409, data: { code: 'SAVE_ACK_MISSING' } };
      throw error;
    }
    this.sequence = sequence;
    this.answerRevision = Number(result.answerRevision ?? state.answerRevision ?? this.answerRevision);
    this.onAcknowledged(payload.answers || [], result);
  }

  save(payload) {
    if (this.finalizing || this.terminal) return Promise.resolve(null);
    return this.flushBatch(payload);
  }

  flushBatch(payload) {
    if (this.inFlight) return this.inFlight;
    if (!this.pendingBatch && !payload?.answers?.length) return Promise.resolve(null);
    if (!this.pendingBatch) {
      this.pendingBatch = { ...clone(payload), mutationId: this.createId(),
        saveSequence: this.sequence + 1, attemptGeneration: this.generation,
        ...(this.submissionId ? { submissionId: this.submissionId } : {}) };
    }
    const batch = this.pendingBatch;
    this.onState(this.finalizing ? 'submitting' : 'saving');
    this.inFlight = (async () => {
      try {
        await this.checkpoint();
        const result = await this.request(this.sendSave, batch);
        if (result.answersAccepted === false && (result.submissionReceipt || result.receipt)) {
          this.sequence = Math.max(this.sequence, acceptedSequence(result));
        } else {
          this.acknowledge(batch, result);
        }
        this.pendingBatch = null;
        await this.checkpoint();
        this.onState(this.finalizing ? 'submitting' : 'saved');
        return result;
      } catch (error) {
        if (wasRejectedBeforeSave(error)) {
          this.pendingBatch = null;
          await this.checkpoint();
        }
        this.onState(this.finalizing ? 'submit_failed' : 'unsaved', error);
        throw error;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  submit(payload) {
    if (this.terminal) return Promise.resolve(this.completedResult);
    if (this.finalInFlight) return this.finalInFlight;
    if (!this.pendingFinal) {
      // Freeze before awaiting an outstanding autosave; later UI edits cannot leak in.
      this.pendingFinal = { ...clone(payload), mutationId: this.createId(), attemptGeneration: this.generation,
        ...(this.submissionId ? { submissionId: this.submissionId } : {}) };
    }
    this.finalizing = true;
    this.onState('submitting');
    this.finalInFlight = (async () => {
      try {
        await this.checkpoint();
        if (this.inFlight) await this.inFlight;
        if (this.pendingBatch) await this.flushBatch();
        if (this.pendingFinal.saveSequence === undefined) {
          this.pendingFinal.saveSequence = this.sequence + 1;
          await this.checkpoint();
        }
        const result = await this.request(this.sendSubmit, this.pendingFinal);
        if (!result?.submissionReceipt && !result?.receipt && !result?.submission?.submissionReceipt) {
          const error = new Error('Submission confirmation was not received. Retry to confirm your saved submission.');
          error.response = { status: 409, data: { code: 'SUBMISSION_RECEIPT_MISSING' } };
          throw error;
        }
        // Expiry/security may have finalized the attempt first. Its durable
        // receipt confirms completion, not acceptance of these late answers.
        if (result.answersAccepted !== false) this.acknowledge(this.pendingFinal, result);
        this.terminal = true;
        this.completedResult = result;
        this.pendingFinal = null;
        this.pendingBatch = null;
        await this.checkpoint();
        this.onState('submitted');
        return result;
      } catch (error) {
        if (wasRejectedBeforeSave(error)) {
          this.pendingFinal = null;
          this.finalizing = false;
          await this.checkpoint();
          this.onState('validation_failed', error);
        } else {
          this.onState('submit_failed', error);
        }
        throw error;
      } finally {
        this.finalInFlight = null;
      }
    })();
    return this.finalInFlight;
  }
}
