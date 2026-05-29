// AI Proctoring placeholder - implementation will be added in later steps.
export const AI_PROCTORING_EVENTS = Object.freeze({
  NO_FACE: 'ai_no_face',
  FACE_OUT_OF_FRAME: 'ai_face_out_of_frame',
  MULTIPLE_FACES: 'ai_multiple_faces',
  MULTIPLE_PERSONS: 'ai_multiple_persons',
  MOBILE_DETECTED: 'ai_mobile_detected',
  LOOKING_AWAY: 'ai_looking_away',
  CAMERA_BLOCKED: 'ai_camera_blocked',
});

export const DEFAULT_AI_PROCTORING_SETTINGS = Object.freeze({
  enabled: false,
  detectMobile: true,
  detectMultiplePersons: true,
  detectNoFace: true,
  detectFaceOutOfFrame: true,
  detectLookingAway: true,
  detectionIntervalMs: 500,
  ignoreLimit: 5,
  violationCooldownSec: 20,
  criticalAutoFlag: true,
});

export const DEFAULT_PROCTORING_STATUS = Object.freeze({
  running: false,
  camera: 'unknown',
  faceModel: 'unknown',
  objectModel: 'unknown',
  face: 'unknown',
  eye: 'unknown',
  mobile: 'unknown',
  person: 'unknown',
  lastUpdatedAt: null,
  error: null,
});
