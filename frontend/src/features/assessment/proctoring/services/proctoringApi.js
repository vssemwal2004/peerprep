import { api } from '../../../../utils/api';

const BLOCKED_METADATA_KEY_PATTERN = /(base64|blob|canvas|dataurl|frame|image|snapshot|video)/i;

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  return Object.entries(metadata).reduce((next, [key, value]) => {
    if (BLOCKED_METADATA_KEY_PATTERN.test(key)) return next;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      next[key] = value;
    }
    return next;
  }, {});
}

function normalizeAiViolationPayload(violation = {}) {
  return {
    type: violation.type,
    message: violation.message || '',
    severity: violation.severity,
    confidence: typeof violation.confidence === 'number' ? violation.confidence : undefined,
    metadata: {
      source: 'ai_proctoring',
      ...sanitizeMetadata(violation.metadata),
    },
  };
}

function createEventId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// sessionId/attemptGeneration must match the active attempt session or the
// server rejects the event (409); eventId makes retries idempotent.
export async function logAiProctoringViolation({
  assessmentId,
  submissionId,
  sessionId,
  attemptGeneration,
  eventId,
  violation,
} = {}) {
  if (!assessmentId) throw new Error('assessmentId is required to log AI proctoring violations.');
  if (!violation?.type) throw new Error('violation.type is required to log AI proctoring violations.');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('AI proctoring violation logging skipped while offline.');
  }

  const resolvedEventId = eventId || violation.id || violation.eventId || createEventId();
  return api.logStudentAssessmentViolation(assessmentId, {
    ...normalizeAiViolationPayload(violation),
    eventId: String(resolvedEventId),
    ...(submissionId ? { submissionId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(attemptGeneration !== undefined && attemptGeneration !== null && attemptGeneration !== ''
      ? { attemptGeneration }
      : {}),
  });
}

export const proctoringApi = {
  logAiProctoringViolation,
};
