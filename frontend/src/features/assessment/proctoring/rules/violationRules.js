import { AI_PROCTORING_EVENTS } from '../constants/proctoringEvents';
import { getConfidenceForEvent, shouldAcceptDetection } from './confidenceRules';

export const MULTIPLE_PEOPLE_GROUP = 'multiple_people';
export const DEFAULT_FACE_OUT_OF_FRAME_GRACE_SEC = 8;

// Each rule is an episode state machine (idle -> pending -> active -> idle) fed
// only by fresh samples of its source. See services/violationBuffer.js.
export const AI_PROCTORING_RULES = Object.freeze({
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: Object.freeze({
    message: 'Mobile phone detected',
    severity: 'critical',
    source: 'object',
    // Two fresh positives ~0.7 s apart (pending re-sample cadence): with the
    // 1.2 s steady sampling a phone warns within ~2-2.5 s, never on one frame.
    confirmCount: 2,
    confirmAfterMs: 700,
    gapToleranceMs: 0,
    clearCount: 2,
    clearAfterMs: 2000,
  }),
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: Object.freeze({
    message: 'Multiple faces detected',
    severity: 'high',
    source: 'face',
    group: MULTIPLE_PEOPLE_GROUP,
    confirmCount: 3,
    confirmAfterMs: 2000,
    gapToleranceMs: 500,
    clearCount: 3,
    clearAfterMs: 1000,
  }),
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: Object.freeze({
    message: 'Multiple persons detected',
    severity: 'high',
    source: 'object',
    group: MULTIPLE_PEOPLE_GROUP,
    confirmCount: 2,
    confirmAfterMs: 700,
    gapToleranceMs: 0,
    clearCount: 2,
    clearAfterMs: 2000,
  }),
  [AI_PROCTORING_EVENTS.NO_FACE]: Object.freeze({
    message: 'No person is visible in the camera',
    severity: 'high',
    source: 'face',
    confirmCount: 3,
    confirmAfterMs: 2000,
    gapToleranceMs: 500,
    clearCount: 2,
    clearAfterMs: 500,
  }),
  [AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME]: Object.freeze({
    message: 'Please sit upright and move back into the camera frame',
    severity: 'medium',
    source: 'face',
    confirmCount: 3,
    confirmAfterMs: DEFAULT_FACE_OUT_OF_FRAME_GRACE_SEC * 1000,
    gapToleranceMs: 1000,
    clearCount: 3,
    clearAfterMs: 1500,
  }),
  // Only evaluated when settings.detectLookingAway === true (never for assessments).
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: Object.freeze({
    message: 'Please look back at the assessment screen',
    severity: 'low',
    source: 'face',
    confirmCount: 4,
    confirmAfterMs: 10000,
    gapToleranceMs: 1000,
    clearCount: 3,
    clearAfterMs: 1500,
  }),
  [AI_PROCTORING_EVENTS.CAMERA_BLOCKED]: Object.freeze({
    message: 'Camera permission blocked or unavailable',
    severity: 'high',
    source: 'camera',
    confirmCount: 1,
    confirmAfterMs: 0,
    gapToleranceMs: 0,
    clearCount: 1,
    clearAfterMs: 0,
  }),
  // The monitor already requires ~20 s of an unchanging feed (or a virtual
  // device label), so the episode confirms on its first positive sample.
  [AI_PROCTORING_EVENTS.CAMERA_SPOOF_SUSPECTED]: Object.freeze({
    message: 'Virtual or static camera suspected. Use your physical webcam showing a live view.',
    severity: 'high',
    source: 'integrity',
    confirmCount: 1,
    confirmAfterMs: 0,
    gapToleranceMs: 0,
    clearCount: 3,
    clearAfterMs: 1500,
  }),
});

const PRESENT_BY_TYPE = Object.freeze({
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: (result) => result.mobileDetected === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MOBILE_DETECTED, result),
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: (result) => Number(result.faceCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_FACES, result),
  // Object detector only; a second face is already covered by MULTIPLE_FACES.
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: (result) => Number(result.objectPersonCount || 0) > 1
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, result),
  [AI_PROCTORING_EVENTS.NO_FACE]: (result) => result.facePresent === false,
  [AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME]: (result) => result.facePresent !== false
    && result.faceOutOfFrame === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, result),
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: (result) => result.facePresent !== false
    && result.lookingAway === true
    && shouldAcceptDetection(AI_PROCTORING_EVENTS.LOOKING_AWAY, result),
  [AI_PROCTORING_EVENTS.CAMERA_SPOOF_SUSPECTED]: (result) => result.cameraSpoofSuspected === true,
});

export function getFaceOutOfFrameGraceMs(settings = {}) {
  const raw = settings?.faceOutOfFrameGraceSec;
  const requestedSeconds = raw === null || raw === '' ? NaN : Number(raw);
  const seconds = Number.isFinite(requestedSeconds)
    ? Math.max(3, Math.min(60, requestedSeconds))
    : DEFAULT_FACE_OUT_OF_FRAME_GRACE_SEC;
  return seconds * 1000;
}

function isRuleEnabled(type, settings = {}) {
  switch (type) {
    case AI_PROCTORING_EVENTS.MOBILE_DETECTED:
      return settings.detectMobile !== false;
    case AI_PROCTORING_EVENTS.MULTIPLE_FACES:
    case AI_PROCTORING_EVENTS.MULTIPLE_PERSONS:
      return settings.detectMultiplePersons !== false;
    case AI_PROCTORING_EVENTS.NO_FACE:
      return settings.detectNoFace !== false;
    case AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME:
      return settings.detectFaceOutOfFrame !== false;
    case AI_PROCTORING_EVENTS.LOOKING_AWAY:
      return settings.detectLookingAway === true;
    case AI_PROCTORING_EVENTS.CAMERA_SPOOF_SUSPECTED:
      return settings.detectVirtualCamera !== false;
    default:
      return false;
  }
}

// The sample-driven rules enabled by the settings, with the grace applied.
export function getActiveRules(settings = {}) {
  return Object.keys(PRESENT_BY_TYPE)
    .filter((type) => isRuleEnabled(type, settings))
    .map((type) => {
      const rule = AI_PROCTORING_RULES[type];
      return {
        ...rule,
        type,
        confirmAfterMs: type === AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME
          ? getFaceOutOfFrameGraceMs(settings)
          : rule.confirmAfterMs,
        present: PRESENT_BY_TYPE[type],
      };
    });
}

export function createCandidate(type, result = {}) {
  const rule = AI_PROCTORING_RULES[type] || {};
  return {
    type,
    message: rule.message,
    severity: rule.severity,
    confidence: getConfidenceForEvent(result, type),
    group: rule.group || null,
    ...(type === AI_PROCTORING_EVENTS.CAMERA_SPOOF_SUSPECTED && result.metadata?.cameraIntegrity
      ? { metadata: result.metadata.cameraIntegrity }
      : {}),
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

// The enabled rules whose condition holds in this result (no timing applied).
export function getViolationCandidates(result = {}, settings = {}) {
  if (result.cameraActive === false) return [];
  return getActiveRules(settings)
    .filter((rule) => rule.present(result))
    .map((rule) => createCandidate(rule.type, result));
}
