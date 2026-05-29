// AI Proctoring placeholder - implementation will be added in later steps.
import {
  AI_PROCTORING_EVENTS,
  DEFAULT_AI_PROCTORING_SETTINGS,
  DEFAULT_PROCTORING_STATUS,
} from './constants/proctoringEvents';
import { getCooldownMs } from './rules/cooldownRules';
import {
  AI_PROCTORING_INTERMITTENT_EVENTS,
  classifyViolationSeverity,
  getViolationCandidates,
} from './rules/violationRules';
import { ViolationBuffer } from './services/violationBuffer';
import { attachStreamToVideo, requestCameraStream, stopCameraStream } from './utils/cameraUtils';
import { createFaceDetector } from './detectors/faceDetector';
import { createObjectDetector } from './detectors/objectDetector';

export function normalizeProctoringSettings(settings = {}) {
  const source = settings?.aiProctoring && typeof settings.aiProctoring === 'object'
    ? settings.aiProctoring
    : settings;

  return {
    ...DEFAULT_AI_PROCTORING_SETTINGS,
    ...(source && typeof source === 'object' ? source : {}),
  };
}

function createSafeDetectionResult(overrides = {}) {
  const faceCount = Number(overrides.faceCount ?? 1);
  const faceConfidence = Number(overrides.confidence?.face ?? 0.9);

  return {
    timestamp: Date.now(),
    cameraActive: true,
    facePresent: true,
    faceCount,
    faceOutOfFrame: false,
    lookingAway: false,
    mobileDetected: false,
    personCount: faceCount || 0,
    confidence: {
      face: faceConfidence,
      mobile: 0,
      person: faceConfidence,
      lookingAway: 0,
    },
    ...overrides,
    confidence: {
      face: faceConfidence,
      mobile: 0,
      person: faceConfidence,
      lookingAway: 0,
      ...(overrides.confidence || {}),
    },
  };
}

function shouldUseFaceDetection(settings = {}) {
  return settings.detectNoFace !== false
    || settings.detectMultiplePersons !== false
    || settings.detectFaceOutOfFrame !== false
    || settings.detectLookingAway !== false;
}

function shouldUseObjectDetection(settings = {}) {
  return settings.detectMobile !== false
    || settings.detectMultiplePersons !== false;
}

function getIgnoreLimit(settings = {}) {
  const limit = Number(settings.ignoreLimit);
  if (!Number.isFinite(limit)) return DEFAULT_AI_PROCTORING_SETTINGS.ignoreLimit;
  return Math.max(0, Math.min(50, limit));
}

function getCameraActive(videoElement, stream) {
  const hasLiveTrack = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));
  if (!videoElement) return hasLiveTrack;
  return hasLiveTrack && !videoElement.paused && !videoElement.ended;
}

const FOOTER_ISSUE_CONFIRM_MS = 600;
const FOOTER_ISSUE_CONFIRM_COUNT = 1;
const FOOTER_ISSUE_CONFIRM_MS_BY_TYPE = Object.freeze({
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: 5000,
});
const MOBILE_STATUS_HOLD_MS = 1800;

function isBufferedIssueVisible(buffer, type, timestamp = Date.now()) {
  const state = buffer?.getState?.(type);
  if (!state?.firstSeenAt) return false;
  const confirmMs = FOOTER_ISSUE_CONFIRM_MS_BY_TYPE[type] ?? FOOTER_ISSUE_CONFIRM_MS;
  return state.consecutiveCount >= FOOTER_ISSUE_CONFIRM_COUNT
    && timestamp - state.firstSeenAt >= confirmMs;
}

function getStatusFromDetectionResult(result = {}, buffer = null) {
  const cameraActive = result.cameraActive !== false;
  const faceCount = Number(result.faceCount || 0);
  const personCount = Number(result.personCount || 0);
  const timestamp = Number(result.timestamp) || Date.now();
  const multipleFacesVisible = faceCount > 1
    && isBufferedIssueVisible(buffer, AI_PROCTORING_EVENTS.MULTIPLE_FACES, timestamp);
  const noFaceVisible = result.facePresent === false
    && isBufferedIssueVisible(buffer, AI_PROCTORING_EVENTS.NO_FACE, timestamp);
  const faceOutVisible = result.faceOutOfFrame === true
    && isBufferedIssueVisible(buffer, AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, timestamp);
  const lookingAwayVisible = result.lookingAway === true
    && isBufferedIssueVisible(buffer, AI_PROCTORING_EVENTS.LOOKING_AWAY, timestamp);
  const multiplePersonsVisible = personCount > 1;

  if (!cameraActive) {
    return {
      camera: 'error',
      face: 'unknown',
      eye: 'unknown',
      mobile: 'unknown',
      person: 'unknown',
    };
  }

  return {
    camera: 'ok',
    face: multipleFacesVisible
      ? 'multiple'
      : noFaceVisible
        ? 'missing'
        : faceOutVisible
          ? 'out_of_frame'
          : 'ok',
    eye: lookingAwayVisible ? 'looking_away' : 'ok',
    mobile: result.mobileAvailable === false
      ? 'unknown'
      : (result.mobileVisible ?? result.mobileDetected)
        ? 'detected'
        : 'ok',
    person: multiplePersonsVisible
      ? 'multiple'
      : personCount === 0 && noFaceVisible
        ? 'missing'
        : 'ok',
  };
}

export class ProctoringManager {
  constructor(options = {}) {
    this.assessmentId = options.assessmentId || null;
    this.submissionId = options.submissionId || null;
    this.settings = normalizeProctoringSettings(options.settings);
    this.videoElement = options.videoElement || null;
    this.onStatusChange = typeof options.onStatusChange === 'function' ? options.onStatusChange : null;
    this.onViolationConfirmed = typeof options.onViolationConfirmed === 'function' ? options.onViolationConfirmed : null;
    this.onError = typeof options.onError === 'function' ? options.onError : null;

    this.status = { ...DEFAULT_PROCTORING_STATUS };
    this.listeners = new Set();
    this.stream = options.stream || null;
    this.ownsStream = false;
    this.requireExistingStream = options.requireExistingStream === true;
    this.detectionIntervalId = null;
    this.modelsLoaded = false;
    this.faceDetector = null;
    this.objectDetector = null;
    this.faceDetectorAvailable = false;
    this.objectDetectorAvailable = false;
    this.detectionTickInProgress = false;
    this.confirmedViolationCount = 0;
    this.lastMobileSeenAt = 0;
    this.lastMobileConfidence = 0;
    this.violationBuffer = new ViolationBuffer({
      cooldownMs: getCooldownMs(this.settings),
    });
  }

  async start() {
    if (this.status.running) return this.getStatus();

    if (!this.settings.enabled) {
      this.updateStatus({
        running: false,
        error: null,
      });
      return this.getStatus();
    }

    try {
      await this.startCamera();
    } catch (error) {
      this.stopDetectionLoop();
      this.stopCamera();
      this.handleCameraError(error);
      return this.getStatus();
    }

    try {
      await this.loadModels();
    } catch (error) {
      this.handleModelError(error);
      return this.getStatus();
    }

    this.updateStatus({
      running: true,
      camera: 'ok',
      error: this.getModelAvailabilityError(),
    });
    this.startDetectionLoop();
    await this.runDetectionTick();

    return this.getStatus();
  }

  stop() {
    this.stopDetectionLoop();
    this.stopCamera();
    this.stopModels();
    this.violationBuffer.clear();
    this.confirmedViolationCount = 0;
    this.updateStatus({
      running: false,
      camera: 'unknown',
      faceModel: 'unknown',
      objectModel: 'unknown',
      face: 'unknown',
      eye: 'unknown',
      mobile: 'unknown',
      person: 'unknown',
      error: null,
    });
    this.listeners.clear();
  }

  getStatus() {
    return { ...this.status };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener) {
    this.listeners.delete(listener);
  }

  async loadModels() {
    if (shouldUseFaceDetection(this.settings)) {
      this.updateStatus({ faceModel: 'loading' });
      try {
        this.faceDetector = this.faceDetector || createFaceDetector();
        await this.faceDetector.load();
        this.faceDetectorAvailable = true;
        this.updateStatus({ faceModel: 'ready' });
      } catch (error) {
        this.faceDetectorAvailable = false;
        this.faceDetector?.dispose?.();
        this.faceDetector = null;
        this.updateStatus({
          faceModel: 'unavailable',
          face: 'unknown',
          eye: 'unknown',
          error: error?.message || 'Face model failed to load',
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
    }

    if (shouldUseObjectDetection(this.settings)) {
      this.updateStatus({ objectModel: 'loading' });
      try {
        this.objectDetector = this.objectDetector || createObjectDetector();
        await this.objectDetector.load();
        this.objectDetectorAvailable = true;
        this.updateStatus({ objectModel: 'ready' });
      } catch (error) {
        this.objectDetectorAvailable = false;
        this.objectDetector?.dispose?.();
        this.objectDetector = null;
        this.updateStatus({
          objectModel: 'unavailable',
          mobile: 'unknown',
          person: 'unknown',
          error: error?.message || 'Object model failed to load',
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
    }

    this.modelsLoaded = true;
    return true;
  }

  stopModels() {
    this.faceDetector?.dispose?.();
    this.objectDetector?.dispose?.();
    this.faceDetector = null;
    this.objectDetector = null;
    this.faceDetectorAvailable = false;
    this.objectDetectorAvailable = false;
    this.modelsLoaded = false;
    this.detectionTickInProgress = false;
    this.updateStatus({
      faceModel: 'unknown',
      objectModel: 'unknown',
    });
  }

  async startCamera() {
    if (!this.stream) {
      if (this.requireExistingStream) {
        throw new Error('Assessment camera stream is not ready. Complete the camera security check before AI detection starts.');
      }
      this.stream = await requestCameraStream();
      this.ownsStream = true;
    }
    await attachStreamToVideo(this.videoElement, this.stream);
    return this.stream;
  }

  stopCamera() {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    if (this.ownsStream) {
      stopCameraStream(this.stream);
    }
    this.stream = null;
    this.ownsStream = false;
  }

  startDetectionLoop() {
    this.stopDetectionLoop();
    const intervalMs = Math.max(500, Math.min(5000, Number(this.settings.detectionIntervalMs || 500)));
    this.detectionIntervalId = globalThis.setInterval(() => {
      void this.runDetectionTick();
    }, intervalMs);
  }

  stopDetectionLoop() {
    if (!this.detectionIntervalId) return;
    globalThis.clearInterval(this.detectionIntervalId);
    this.detectionIntervalId = null;
  }

  async runDetectionTick() {
    if (!this.status.running) return null;
    if (this.detectionTickInProgress) return null;

    this.detectionTickInProgress = true;
    try {
      const timestamp = Date.now();
      const cameraActive = getCameraActive(this.videoElement, this.stream);
      let faceResult = null;
      let objectResult = null;

      if (cameraActive && this.faceDetectorAvailable && this.faceDetector && shouldUseFaceDetection(this.settings)) {
        faceResult = this.faceDetector.detect(this.videoElement, timestamp);
      }

      if (cameraActive && this.objectDetectorAvailable && this.objectDetector && shouldUseObjectDetection(this.settings)) {
        objectResult = await this.objectDetector.detect(this.videoElement);
      }

      const faceCount = Number(faceResult?.faceCount ?? 1);
      const faceConfidence = Number(faceResult?.confidence?.face ?? 0.9);
      const objectPersonCount = Number(objectResult?.personCount || 0);
      const objectPersonConfidence = Number(objectResult?.confidence?.person || 0);
      const personCount = Math.max(faceCount || 0, objectPersonCount || 0);
      const personConfidence = Math.max(faceConfidence, objectPersonConfidence);
      const rawMobileDetected = Boolean(objectResult?.mobileDetected);
      const mobileConfidence = Number(objectResult?.confidence?.mobile || 0);
      if (rawMobileDetected) {
        this.lastMobileSeenAt = timestamp;
        this.lastMobileConfidence = mobileConfidence;
      }
      const mobileVisible = rawMobileDetected || (timestamp - this.lastMobileSeenAt <= MOBILE_STATUS_HOLD_MS);
      const result = createSafeDetectionResult({
        timestamp,
        cameraActive,
        ...(faceResult || {}),
        mobileDetected: rawMobileDetected,
        mobileVisible,
        mobileAvailable: !shouldUseObjectDetection(this.settings) || this.objectDetectorAvailable,
        personCount,
        confidence: {
          face: faceConfidence,
          mobile: Math.max(mobileConfidence, mobileVisible ? this.lastMobileConfidence : 0),
          person: personConfidence,
          lookingAway: Number(faceResult?.confidence?.lookingAway || 0),
        },
        metadata: {
          face: faceResult?.metadata || null,
          object: objectResult?.metadata || null,
        },
      });

      this.handleDetectionResult(result);
      return result;
    } catch (error) {
      this.updateStatus({
        error: error?.message || 'AI face detection failed',
      });
      if (this.onError) this.safeCall(this.onError, error);
      return null;
    } finally {
      this.detectionTickInProgress = false;
    }
  }

  updateStatus(nextStatus = {}) {
    this.status = {
      ...this.status,
      ...nextStatus,
      lastUpdatedAt: Date.now(),
    };

    const status = this.getStatus();
    if (this.onStatusChange) this.safeCall(this.onStatusChange, status);
    this.listeners.forEach((listener) => this.safeCall(listener, status));
  }

  handleDetectionResult(result = {}) {
    const candidates = getViolationCandidates(result, this.settings);
    const activeTypes = candidates.map((candidate) => candidate.type);
    this.violationBuffer.resetExcept(activeTypes, {
      preserveTypes: AI_PROCTORING_INTERMITTENT_EVENTS,
    });

    candidates.forEach((candidate) => {
      const confirmed = this.violationBuffer.record(candidate.type, {
        timestamp: result.timestamp,
        confirmAfterMs: candidate.confirmAfterMs,
        confirmCount: candidate.confirmCount,
        repeatCount: candidate.repeatCount,
        repeatWindowMs: candidate.repeatWindowMs,
        confirmStrategy: candidate.confirmStrategy,
      });
      if (confirmed) this.emitConfirmedViolation(candidate, confirmed);
    });

    const statusPatch = getStatusFromDetectionResult(result, this.violationBuffer);
    this.updateStatus({
      ...statusPatch,
      error: this.getModelAvailabilityError(),
    });
  }

  getModelAvailabilityError() {
    const faceRequired = shouldUseFaceDetection(this.settings);
    const objectRequired = shouldUseObjectDetection(this.settings);
    if (faceRequired && this.faceDetectorAvailable === false && this.status.faceModel === 'unavailable') {
      return 'AI face/eye model unavailable. Detection cannot run for face and eye checks.';
    }
    if (objectRequired && this.objectDetectorAvailable === false && this.status.objectModel === 'unavailable') {
      return 'AI object model unavailable. Mobile and multiple-person detection cannot run.';
    }
    return null;
  }

  handleCameraError(error) {
    const timestamp = Date.now();
    const message = 'Camera permission blocked or unavailable';
    const confirmed = this.violationBuffer.confirmNow(AI_PROCTORING_EVENTS.CAMERA_BLOCKED, timestamp);

    this.updateStatus({
      running: false,
      camera: 'blocked',
      face: 'unknown',
      eye: 'unknown',
      mobile: 'unknown',
      person: 'unknown',
      error: error?.message || message,
    });

    if (this.onError) this.safeCall(this.onError, error);
    if (confirmed) {
      this.emitConfirmedViolation({
        type: AI_PROCTORING_EVENTS.CAMERA_BLOCKED,
        message,
        severity: 'high',
        confidence: 1,
      }, confirmed);
    }
  }

  handleModelError(error) {
    this.stopDetectionLoop();
    this.stopCamera();
    this.stopModels();
    this.updateStatus({
      running: false,
      camera: 'unknown',
      face: 'unknown',
      eye: 'unknown',
      mobile: 'unknown',
      person: 'unknown',
      error: error?.message || 'AI face detection model failed to load',
    });

    if (this.onError) this.safeCall(this.onError, error);
  }

  emitConfirmedViolation(candidate, confirmed) {
    if (!this.onViolationConfirmed) return;
    this.confirmedViolationCount += 1;
    const ignoreLimit = getIgnoreLimit(this.settings);
    const limitExceeded = this.confirmedViolationCount > ignoreLimit;

    this.safeCall(this.onViolationConfirmed, {
      type: candidate.type,
      message: candidate.message,
      severity: classifyViolationSeverity(candidate, confirmed),
      confidence: candidate.confidence ?? 1,
      metadata: {
        source: 'ai_proctoring',
        assessmentId: this.assessmentId,
        submissionId: this.submissionId,
        firstSeenAt: confirmed.firstSeenAt,
        lastSeenAt: confirmed.lastSeenAt,
        count: confirmed.count,
        consecutiveCount: confirmed.consecutiveCount,
        durationMs: confirmed.durationMs,
        cooldownUntil: confirmed.cooldownUntil,
        confirmedBy: confirmed.confirmedBy,
        ignoreLimit,
        confirmedViolationCount: this.confirmedViolationCount,
        limitExceeded,
      },
    });
  }

  safeCall(callback, payload) {
    try {
      callback(payload);
    } catch {
      // Consumers should not break the proctoring loop.
    }
  }
}
