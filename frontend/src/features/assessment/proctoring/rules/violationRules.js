// AI Proctoring placeholder - implementation will be added in later steps.
import { AI_PROCTORING_EVENTS } from '../constants/proctoringEvents';
import { getConfidenceForEvent, shouldAcceptDetection } from './confidenceRules';

export const AI_PROCTORING_RULES = Object.freeze({
  [AI_PROCTORING_EVENTS.NO_FACE]: {
    message: 'Face not detected',
    severity: 'medium',
    confirmAfterMs: 5000,
    confirmCount: 1,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME]: {
    message: 'Face is out of frame',
    severity: 'medium',
    confirmAfterMs: 5000,
    confirmCount: 1,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: {
    message: 'Student appears to be looking away',
    severity: 'low',
    confirmAfterMs: 6000,
    confirmCount: 999,
    repeatCount: 3,
    repeatWindowMs: 12000,
    confirmStrategy: 'any',
    allowIntermittent: true,
  },
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: {
    message: 'Mobile phone detected',
    severity: 'critical',
    confirmAfterMs: 3000,
    confirmCount: 3,
    confirmStrategy: 'any',
  },
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: {
    message: 'Multiple faces detected',
    severity: 'high',
    confirmAfterMs: 4000,
    confirmCount: 1,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: {
    message: 'Multiple persons detected',
    severity: 'high',
    confirmAfterMs: 4000,
    confirmCount: 1,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.CAMERA_BLOCKED]: {
    message: 'Camera permission blocked or unavailable',
    severity: 'high',
    confirmAfterMs: 0,
    confirmCount: 1,
    confirmStrategy: 'any',
  },
});

export const AI_PROCTORING_TRACKED_EVENTS = Object.freeze(Object.keys(AI_PROCTORING_RULES));
export const AI_PROCTORING_INTERMITTENT_EVENTS = Object.freeze(
  Object.entries(AI_PROCTORING_RULES)
    .filter(([, rule]) => rule.allowIntermittent)
    .map(([type]) => type),
);

function createCandidate(type, result = {}) {
  const rule = AI_PROCTORING_RULES[type];
  return {
    type,
    message: rule.message,
    severity: rule.severity,
    confidence: getConfidenceForEvent(result, type),
    confirmAfterMs: rule.confirmAfterMs,
    confirmCount: rule.confirmCount,
    repeatCount: rule.repeatCount,
    repeatWindowMs: rule.repeatWindowMs,
    confirmStrategy: rule.confirmStrategy,
    allowIntermittent: Boolean(rule.allowIntermittent),
  };
}

export function classifyViolationSeverity(candidate = {}, confirmed = {}) {
  if (candidate.type === AI_PROCTORING_EVENTS.LOOKING_AWAY) {
    return Number(confirmed.durationMs || 0) >= AI_PROCTORING_RULES[AI_PROCTORING_EVENTS.LOOKING_AWAY].confirmAfterMs
      ? 'medium'
      : 'low';
  }

  return candidate.severity || AI_PROCTORING_RULES[candidate.type]?.severity || 'medium';
}

export function getViolationCandidates(result = {}, settings = {}) {
  const candidates = [];
  const cameraActive = result.cameraActive !== false;

  if (!cameraActive) return candidates;

  if (settings.detectNoFace !== false && result.facePresent === false) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.NO_FACE, result));
  }

  if (
    settings.detectFaceOutOfFrame !== false
    && result.faceOutOfFrame === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, result));
  }

  if (
    settings.detectLookingAway !== false
    && result.lookingAway === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.LOOKING_AWAY, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.LOOKING_AWAY, result));
  }

  if (
    settings.detectMobile !== false
    && result.mobileDetected === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MOBILE_DETECTED, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MOBILE_DETECTED, result));
  }

  if (
    settings.detectMultiplePersons !== false
    && Number(result.faceCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_FACES, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MULTIPLE_FACES, result));
  }

  if (
    settings.detectMultiplePersons !== false
    && Number(result.personCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, result));
  }

  return candidates;
}
