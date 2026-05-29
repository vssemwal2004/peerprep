// AI Proctoring placeholder - implementation will be added in later steps.
import { AI_PROCTORING_EVENTS } from '../constants/proctoringEvents';

export const AI_PROCTORING_CONFIDENCE_THRESHOLDS = Object.freeze({
  face: 0.6,
  mobile: 0.25,
  person: 0.55,
  lookingAway: 0.7,
});

const CONFIDENCE_KEY_BY_EVENT = Object.freeze({
  [AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME]: 'face',
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: 'face',
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: 'person',
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: 'mobile',
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: 'lookingAway',
});

export function getConfidence(result = {}, key) {
  const value = Number(result?.confidence?.[key]);
  return Number.isFinite(value) ? value : 0;
}

export function hasMinimumConfidence(result = {}, key, fallback = 1) {
  const threshold = AI_PROCTORING_CONFIDENCE_THRESHOLDS[key] ?? fallback;
  return getConfidence(result, key) >= threshold;
}

export function getConfidenceForEvent(result = {}, type) {
  const key = CONFIDENCE_KEY_BY_EVENT[type];
  if (!key) return 1;
  return getConfidence(result, key);
}

export function shouldAcceptDetection(type, result = {}) {
  const key = CONFIDENCE_KEY_BY_EVENT[type];
  if (!key) return true;
  return hasMinimumConfidence(result, key);
}
