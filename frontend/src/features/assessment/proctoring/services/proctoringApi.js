// AI Proctoring placeholder - implementation will be added in later steps.
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

export async function logAiProctoringViolation({ assessmentId, submissionId, violation } = {}) {
  if (!assessmentId) throw new Error('assessmentId is required to log AI proctoring violations.');
  if (!violation?.type) throw new Error('violation.type is required to log AI proctoring violations.');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('AI proctoring violation logging skipped while offline.');
  }

  return api.logStudentAssessmentViolation(assessmentId, {
    ...normalizeAiViolationPayload(violation),
    ...(submissionId ? { submissionId } : {}),
  });
}

export const proctoringApi = {
  logAiProctoringViolation,
};
