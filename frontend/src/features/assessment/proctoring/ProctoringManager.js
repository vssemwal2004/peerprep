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

function isVideoReady(videoElement) {
  return Boolean(
    videoElement
      && videoElement.readyState >= 2
      && videoElement.videoWidth > 0
      && videoElement.videoHeight > 0,
  );
}

function createFallbackUnknownFaceResult(reason) {
  return {
    facePresent: true,
    faceCount: 1,
    faceOutOfFrame: false,
    lookingAway: false,
    confidence: {
      face: 0.35,
      lookingAway: 0,
    },
    metadata: {
      source: 'face_fallback',
      skipped: reason,
    },
  };
}

function normalizeBrowserFaceResult(faces = [], videoElement) {
  const normalizedFaces = Array.isArray(faces) ? faces : [];
  const faceCount = normalizedFaces.length;
  if (faceCount === 0) {
    return {
      facePresent: false,
      faceCount: 0,
      faceOutOfFrame: false,
      lookingAway: false,
      confidence: {
        face: 0.82,
        lookingAway: 0,
      },
      metadata: {
        source: 'browser_face_detector',
      },
    };
  }

  const videoWidth = Math.max(1, Number(videoElement?.videoWidth || 1));
  const videoHeight = Math.max(1, Number(videoElement?.videoHeight || 1));
  const faceOutOfFrame = normalizedFaces.some((face) => {
    const box = face?.boundingBox || {};
    const x = Number(box.x || 0);
    const y = Number(box.y || 0);
    const width = Number(box.width || 0);
    const height = Number(box.height || 0);
    const centerX = x + (width / 2);
    const centerY = y + (height / 2);
    return Math.abs(centerX - videoWidth / 2) > videoWidth * FALLBACK_FACE_CENTER_TOLERANCE_RATIO
      || Math.abs(centerY - videoHeight / 2) > videoHeight * FALLBACK_FACE_CENTER_TOLERANCE_RATIO
      || width < videoWidth * FALLBACK_FACE_MIN_WIDTH_RATIO;
  });

  return {
    facePresent: true,
    faceCount,
    faceOutOfFrame,
    lookingAway: false,
    confidence: {
      face: 0.82,
      lookingAway: 0,
    },
    metadata: {
      source: 'browser_face_detector',
      limitation: 'eye movement unavailable in browser fallback',
      faces: faceCount,
    },
  };
}

const FOOTER_ISSUE_CONFIRM_MS = 600;
const FOOTER_ISSUE_CONFIRM_COUNT = 1;
const FOOTER_ISSUE_CONFIRM_MS_BY_TYPE = Object.freeze({
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: 5100,
});
const MOBILE_STATUS_HOLD_MS = 1800;
const MOBILE_CONFIRM_CONSECUTIVE_FRAMES = 2;
const OBJECT_DETECTION_INTERVAL_MULTIPLIER = 4;
const MOBILE_OBJECT_DETECTION_INTERVAL_MS = 2500;
const OBJECT_DETECTION_WARMUP_INTERVAL_MS = 700;
const OBJECT_DETECTION_WARMUP_SAMPLES = 3;
const VIDEO_PLAYBACK_RETRY_MS = 1000;
const FALLBACK_FACE_CENTER_TOLERANCE_RATIO = 0.32;
const FALLBACK_FACE_MIN_WIDTH_RATIO = 0.12;
const FALLBACK_FRAME_VARIANCE_THRESHOLD = 95;

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
    this.browserFaceDetector = null;
    this.fallbackCanvas = null;
    this.faceDetectorAvailable = false;
    this.objectDetectorAvailable = false;
    this.faceFallbackAvailable = false;
    this.detectionTickInProgress = false;
    this.confirmedViolationCount = 0;
    this.lastMobileSeenAt = 0;
    this.lastMobileConfidence = 0;
    this.mobileDetectionStreak = 0;
    this.mobileConfirmedUntil = 0;
    this.lastObjectDetectionAt = 0;
    this.lastObjectResult = null;
    this.objectDetectionSamples = 0;
    this.lastVideoPlaybackRetryAt = 0;
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

    // Camera monitoring is live immediately. Model downloads can take several
    // seconds, so expose the running state and keep the footer responsive while
    // face and object detection initialize in parallel.
    this.updateStatus({
      running: true,
      camera: 'ok',
      error: null,
    });
    this.startDetectionLoop();
    await this.runDetectionTick();

    try {
      await this.loadModels();
    } catch (error) {
      this.handleModelError(error);
      return this.getStatus();
    }

    // The manager may have been stopped while an external model was loading.
    if (!this.status.running) return this.getStatus();

    this.updateStatus({
      camera: 'ok',
      error: this.getModelAvailabilityError(),
    });
    await this.runDetectionTick();

    return this.getStatus();
  }

  stop() {
    this.stopDetectionLoop();
    this.stopCamera();
    this.stopModels();
    this.violationBuffer.clear();
    this.confirmedViolationCount = 0;
    this.lastMobileSeenAt = 0;
    this.lastMobileConfidence = 0;
    this.mobileDetectionStreak = 0;
    this.mobileConfirmedUntil = 0;
    this.lastObjectDetectionAt = 0;
    this.lastObjectResult = null;
    this.objectDetectionSamples = 0;
    this.lastVideoPlaybackRetryAt = 0;
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
    const loadFaceModel = async () => {
      if (!shouldUseFaceDetection(this.settings)) return;
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
        const fallbackReady = this.setupFaceFallback();
        this.faceFallbackAvailable = fallbackReady;
        this.updateStatus({
          faceModel: fallbackReady ? 'fallback' : 'unavailable',
          face: fallbackReady ? 'unknown' : 'unknown',
          eye: 'unavailable',
          error: fallbackReady
            ? 'Face AI model unavailable. Basic face fallback is active; eye movement detection is unavailable.'
            : (error?.message || 'Face model failed to load'),
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
    };

    const loadObjectModel = async () => {
      if (!shouldUseObjectDetection(this.settings)) return;
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
    };

    await Promise.all([loadFaceModel(), loadObjectModel()]);

    this.modelsLoaded = true;
    return true;
  }

  stopModels() {
    this.faceDetector?.dispose?.();
    this.objectDetector?.dispose?.();
    this.faceDetector = null;
    this.objectDetector = null;
    this.browserFaceDetector = null;
    this.fallbackCanvas = null;
    this.faceDetectorAvailable = false;
    this.objectDetectorAvailable = false;
    this.faceFallbackAvailable = false;
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
      await this.ensureVideoPlayback(timestamp);
      const cameraActive = getCameraActive(this.videoElement, this.stream);
      let faceResult = null;
      let objectResult = null;

      if (cameraActive && this.faceDetectorAvailable && this.faceDetector && shouldUseFaceDetection(this.settings)) {
        faceResult = this.faceDetector.detect(this.videoElement, timestamp);
      } else if (cameraActive && this.faceFallbackAvailable && shouldUseFaceDetection(this.settings)) {
        faceResult = await this.detectWithFaceFallback(this.videoElement);
      }

      if (cameraActive && this.shouldRunObjectDetection(timestamp)) {
        objectResult = await this.objectDetector.detect(this.videoElement);
        this.lastObjectResult = objectResult;
        this.lastObjectDetectionAt = timestamp;
        if (objectResult?.metadata?.skipped !== 'video_not_ready') {
          this.objectDetectionSamples += 1;
        }
      } else {
        objectResult = this.lastObjectResult;
      }

      const faceCount = Number(faceResult?.faceCount ?? 1);
      const faceConfidence = Number(faceResult?.confidence?.face ?? 0.9);
      const objectPersonCount = Number(objectResult?.personCount || 0);
      const objectPersonConfidence = Number(objectResult?.confidence?.person || 0);
      const personCount = Math.max(faceCount || 0, objectPersonCount || 0);
      const personConfidence = Math.max(faceConfidence, objectPersonConfidence);
      const rawMobileCandidate = Boolean(objectResult?.mobileDetected);
      const mobileConfidence = Number(objectResult?.confidence?.mobile || 0);
      if (rawMobileCandidate) {
        this.mobileDetectionStreak += 1;
      } else {
        this.mobileDetectionStreak = 0;
      }
      const rawMobileDetected = this.mobileDetectionStreak >= MOBILE_CONFIRM_CONSECUTIVE_FRAMES;
      if (rawMobileDetected) {
        this.lastMobileSeenAt = timestamp;
        this.lastMobileConfidence = mobileConfidence;
        this.mobileConfirmedUntil = timestamp + MOBILE_STATUS_HOLD_MS;
      }
      const mobileVisible = rawMobileDetected || timestamp <= this.mobileConfirmedUntil;
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
          object: {
            ...(objectResult?.metadata || {}),
            mobileCandidate: rawMobileCandidate,
            mobileDetectionStreak: this.mobileDetectionStreak,
            mobileConfirmConsecutiveFrames: MOBILE_CONFIRM_CONSECUTIVE_FRAMES,
          },
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
    if (!hasMeaningfulStatusChange(this.status, nextStatus)) return;

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

  shouldRunObjectDetection(timestamp = Date.now()) {
    if (!this.objectDetectorAvailable || !this.objectDetector || !shouldUseObjectDetection(this.settings)) {
      return false;
    }

    const baseIntervalMs = Math.max(500, Math.min(5000, Number(this.settings.detectionIntervalMs || 500)));
    const warmingUp = this.objectDetectionSamples < OBJECT_DETECTION_WARMUP_SAMPLES;
    const objectIntervalMs = warmingUp
      ? OBJECT_DETECTION_WARMUP_INTERVAL_MS
      : isLikelyMobileDevice()
        ? Math.max(MOBILE_OBJECT_DETECTION_INTERVAL_MS, baseIntervalMs * OBJECT_DETECTION_INTERVAL_MULTIPLIER)
        : Math.max(1200, baseIntervalMs * 2);

    return !this.lastObjectDetectionAt || timestamp - this.lastObjectDetectionAt >= objectIntervalMs;
  }

  async ensureVideoPlayback(timestamp = Date.now()) {
    const video = this.videoElement;
    if (!video || !this.stream || (!video.paused && !video.ended)) return;
    if (timestamp - this.lastVideoPlaybackRetryAt < VIDEO_PLAYBACK_RETRY_MS) return;

    this.lastVideoPlaybackRetryAt = timestamp;
    if (video.srcObject !== this.stream) video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play?.();
    } catch {
      // Retry on the next detection tick; a recent user gesture may unlock it.
    }
  }

  getModelAvailabilityError() {
    const faceRequired = shouldUseFaceDetection(this.settings);
    const objectRequired = shouldUseObjectDetection(this.settings);
    if (faceRequired && this.faceFallbackAvailable && this.status.faceModel === 'fallback') {
      return 'Face AI model unavailable. Basic fallback is active; eye movement detection is unavailable.';
    }
    if (faceRequired && this.faceDetectorAvailable === false && this.status.faceModel === 'unavailable') {
      return 'AI face/eye model unavailable. Detection cannot run for face and eye checks.';
    }
    if (objectRequired && this.objectDetectorAvailable === false && this.status.objectModel === 'unavailable') {
      return 'AI object model unavailable. Mobile and multiple-person detection cannot run.';
    }
    return null;
  }

  setupFaceFallback() {
    if (typeof window === 'undefined') return false;

    if ('FaceDetector' in window) {
      try {
        this.browserFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
        return true;
      } catch {
        this.browserFaceDetector = null;
      }
    }

    if (typeof document !== 'undefined') {
      this.fallbackCanvas = document.createElement('canvas');
      return true;
    }

    return false;
  }

  async detectWithFaceFallback(videoElement) {
    if (!isVideoReady(videoElement)) {
      return createFallbackUnknownFaceResult('video_not_ready');
    }

    if (this.browserFaceDetector) {
      try {
        const faces = await this.browserFaceDetector.detect(videoElement);
        return normalizeBrowserFaceResult(faces, videoElement);
      } catch {
        this.browserFaceDetector = null;
      }
    }

    return this.detectWithFrameFallback(videoElement);
  }

  detectWithFrameFallback(videoElement) {
    const canvas = this.fallbackCanvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!canvas || !context) return createFallbackUnknownFaceResult('canvas_unavailable');

    this.fallbackCanvas = canvas;
    canvas.width = 160;
    canvas.height = 90;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += value;
      sumSq += value * value;
      count += 1;
    }

    if (!count) return createFallbackUnknownFaceResult('empty_frame');

    const avg = sum / count;
    const variance = sumSq / count - avg * avg;
    const blankOrCovered = variance < FALLBACK_FRAME_VARIANCE_THRESHOLD;

    return {
      facePresent: !blankOrCovered,
      faceCount: blankOrCovered ? 0 : 1,
      faceOutOfFrame: false,
      lookingAway: false,
      confidence: {
        face: blankOrCovered ? 0.7 : 0.45,
        lookingAway: 0,
      },
      metadata: {
        source: 'frame_variance_fallback',
        variance,
        averageBrightness: avg,
        limitation: 'blank-camera fallback only',
      },
    };
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

function hasMeaningfulStatusChange(current = {}, patch = {}) {
  return Object.keys(patch).some((key) => key !== 'lastUpdatedAt' && current[key] !== patch[key]);
}

function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined' && typeof window === 'undefined') return false;
  const ua = String(navigator?.userAgent || navigator?.vendor || '').toLowerCase();
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const narrowScreen = typeof window !== 'undefined' && Number(window.innerWidth || 0) <= 820;
  return /android|iphone|ipad|ipod|mobile/.test(ua) || (coarsePointer && narrowScreen);
}
