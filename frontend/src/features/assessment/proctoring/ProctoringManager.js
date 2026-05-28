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

function getStatusFromDetectionResult(result = {}) {
  const cameraActive = result.cameraActive !== false;
  const faceCount = Number(result.faceCount || 0);
  const personCount = Number(result.personCount || 0);

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
    face: faceCount > 1
      ? 'multiple'
      : result.facePresent === false
        ? 'missing'
        : result.faceOutOfFrame
          ? 'out_of_frame'
          : 'ok',
    eye: result.lookingAway ? 'looking_away' : 'ok',
    mobile: result.mobileAvailable === false
      ? 'unknown'
      : result.mobileDetected
        ? 'detected'
        : 'ok',
    person: personCount > 1
      ? 'multiple'
      : personCount === 0
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
    this.stream = null;
    this.detectionIntervalId = null;
    this.modelsLoaded = false;
    this.faceDetector = null;
    this.objectDetector = null;
    this.faceDetectorAvailable = false;
    this.objectDetectorAvailable = false;
    this.detectionTickInProgress = false;
    this.confirmedViolationCount = 0;
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
      error: null,
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
      try {
        this.faceDetector = this.faceDetector || createFaceDetector();
        await this.faceDetector.load();
        this.faceDetectorAvailable = true;
      } catch (error) {
        this.faceDetectorAvailable = false;
        this.faceDetector?.dispose?.();
        this.faceDetector = null;
        if (this.onError) this.safeCall(this.onError, error);
      }
    }

    if (shouldUseObjectDetection(this.settings)) {
      try {
        this.objectDetector = this.objectDetector || createObjectDetector();
        await this.objectDetector.load();
        this.objectDetectorAvailable = true;
      } catch (error) {
        this.objectDetectorAvailable = false;
        this.objectDetector?.dispose?.();
        this.objectDetector = null;
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
  }

  async startCamera() {
    this.stream = await requestCameraStream();
    await attachStreamToVideo(this.videoElement, this.stream);
    return this.stream;
  }

  stopCamera() {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    stopCameraStream(this.stream);
    this.stream = null;
  }

  startDetectionLoop() {
    this.stopDetectionLoop();
    const intervalMs = Math.max(1000, Math.min(5000, Number(this.settings.detectionIntervalMs || 1500)));
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
      const mobileConfidence = Number(objectResult?.confidence?.mobile || 0);
      const result = createSafeDetectionResult({
        timestamp,
        cameraActive,
        ...(faceResult || {}),
        mobileDetected: Boolean(objectResult?.mobileDetected),
        mobileAvailable: !shouldUseObjectDetection(this.settings) || this.objectDetectorAvailable,
        personCount,
        confidence: {
          face: faceConfidence,
          mobile: mobileConfidence,
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
    const statusPatch = getStatusFromDetectionResult(result);
    this.updateStatus({
      ...statusPatch,
      error: null,
    });

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
