export const AI_PROCTORING_VIOLATION_TYPES = Object.freeze([
  'ai_no_face',
  'ai_face_out_of_frame',
  'ai_multiple_faces',
  'ai_multiple_persons',
  'ai_mobile_detected',
  'ai_looking_away',
  'ai_camera_blocked',
]);

export const AI_PROCTORING_DEFAULT_WEIGHTS = Object.freeze({
  ai_no_face: 5,
  ai_face_out_of_frame: 5,
  ai_multiple_faces: 12,
  ai_multiple_persons: 12,
  ai_mobile_detected: 15,
  ai_looking_away: 6,
  ai_camera_blocked: 8,
});

const AI_SUMMARY_KEYS_BY_TYPE = Object.freeze({
  ai_no_face: 'noFace',
  ai_face_out_of_frame: 'faceOutOfFrame',
  ai_multiple_faces: 'multipleFaces',
  ai_multiple_persons: 'multiplePersons',
  ai_mobile_detected: 'mobileDetected',
  ai_looking_away: 'lookingAway',
  ai_camera_blocked: 'cameraBlocked',
});

const RISK_LEVELS = Object.freeze(['clean', 'low', 'medium', 'high', 'critical']);

export function isAiProctoringViolation(type) {
  return AI_PROCTORING_VIOLATION_TYPES.includes(type);
}

export function createAiProctoringSummary(summary = {}) {
  return {
    totalViolations: Number(summary.totalViolations || 0),
    noFace: Number(summary.noFace || 0),
    faceOutOfFrame: Number(summary.faceOutOfFrame || 0),
    multipleFaces: Number(summary.multipleFaces || 0),
    multiplePersons: Number(summary.multiplePersons || 0),
    mobileDetected: Number(summary.mobileDetected || 0),
    lookingAway: Number(summary.lookingAway || 0),
    cameraBlocked: Number(summary.cameraBlocked || 0),
    riskLevel: RISK_LEVELS.includes(summary.riskLevel) ? summary.riskLevel : 'clean',
    lastViolationAt: summary.lastViolationAt,
  };
}

export function calculateAiProctoringRiskLevel(summary = {}) {
  const normalized = createAiProctoringSummary(summary);
  let riskLevel = 'clean';

  if (normalized.totalViolations >= 10) riskLevel = 'critical';
  else if (normalized.totalViolations >= 6) riskLevel = 'high';
  else if (normalized.totalViolations >= 3) riskLevel = 'medium';
  else if (normalized.totalViolations >= 1) riskLevel = 'low';

  if (normalized.mobileDetected > 0 || normalized.multiplePersons > 0) {
    riskLevel = maxRiskLevel(riskLevel, 'medium');
  }

  if (normalized.cameraBlocked > 0) {
    riskLevel = maxRiskLevel(riskLevel, 'high');
  }

  return riskLevel;
}

export function applyAiProctoringViolationToSummary(summary = {}, type, at = new Date()) {
  const normalized = createAiProctoringSummary(summary);
  const counterKey = AI_SUMMARY_KEYS_BY_TYPE[type];

  if (!counterKey) return normalized;

  normalized.totalViolations += 1;
  normalized[counterKey] += 1;
  normalized.lastViolationAt = at;
  normalized.riskLevel = calculateAiProctoringRiskLevel(normalized);

  return normalized;
}

export function getAiProctoringDefaultWeight(type) {
  return AI_PROCTORING_DEFAULT_WEIGHTS[type] ?? null;
}

function maxRiskLevel(current, minimum) {
  const currentIndex = RISK_LEVELS.indexOf(current);
  const minimumIndex = RISK_LEVELS.indexOf(minimum);

  if (currentIndex === -1) return minimum;
  if (minimumIndex === -1) return current;

  return RISK_LEVELS[Math.max(currentIndex, minimumIndex)];
}
