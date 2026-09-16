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
    message: 'Face or eyes were away from the screen for more than 5 seconds',
    severity: 'low',
    confirmAfterMs: 5100,
    confirmCount: 3,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: {
    message: 'Mobile phone detected',
    severity: 'critical',
    confirmAfterMs: 800,
    confirmCount: 2,
    confirmStrategy: 'any',
  },
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: {
    message: 'Multiple faces detected',
    severity: 'high',
    confirmAfterMs: 1500,
    confirmCount: 1,
    confirmStrategy: 'all',
  },
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: {
    message: 'Multiple persons detected',
    severity: 'high',
    confirmAfterMs: 1500,
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

function getFaceAbsenceGraceMs(settings = {}) {
  const requestedSeconds = Number(settings.faceOutOfFrameGraceSec);
  const seconds = Number.isFinite(requestedSeconds)
    ? Math.max(3, Math.min(60, requestedSeconds))
    : 10;
  return seconds * 1000;
}

function createCandidate(type, result = {}, settings = {}) {
  const rule = AI_PROCTORING_RULES[type];
  const usesFaceAbsenceGrace = type === AI_PROCTORING_EVENTS.NO_FACE
    || type === AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME;
  return {
    type,
    message: rule.message,
    severity: rule.severity,
    confidence: getConfidenceForEvent(result, type),
    confirmAfterMs: usesFaceAbsenceGrace ? getFaceAbsenceGraceMs(settings) : rule.confirmAfterMs,
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
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.NO_FACE, result, settings));
  }

  if (
    settings.detectFaceOutOfFrame !== false
    && result.faceOutOfFrame === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, result, settings));
  }

  if (
    settings.detectLookingAway !== false
    && result.lookingAway === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.LOOKING_AWAY, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.LOOKING_AWAY, result, settings));
  }

  if (
    settings.detectMobile !== false
    && result.mobileDetected === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MOBILE_DETECTED, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MOBILE_DETECTED, result, settings));
  }

  if (
    settings.detectMultiplePersons !== false
    && Number(result.faceCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_FACES, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MULTIPLE_FACES, result, settings));
  }

  if (
    settings.detectMultiplePersons !== false
    && Number(result.personCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, result)
  ) {
    candidates.push(createCandidate(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, result, settings));
  }

  return candidates;
}
