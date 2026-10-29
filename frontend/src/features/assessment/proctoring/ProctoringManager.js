import {
  AI_PROCTORING_EVENTS,
  DEFAULT_AI_PROCTORING_SETTINGS,
  DEFAULT_PROCTORING_STATUS,
} from './constants/proctoringEvents';
import { getCooldownMs } from './rules/cooldownRules';
import {
  DEFAULT_FACE_OUT_OF_FRAME_GRACE_SEC,
  classifyViolationSeverity,
  createCandidate,
  getActiveRules,
} from './rules/violationRules';
import { ViolationBuffer } from './services/violationBuffer';
import { attachStreamToVideo, requestCameraStream, stopCameraStream } from './utils/cameraUtils';
import { createFaceDetector } from './detectors/faceDetector';
import { createObjectDetector } from './detectors/objectDetector';

const MOBILE_OBJECT_DETECTION_INTERVAL_MS = 2500;
const OBJECT_STEADY_MIN_INTERVAL_MS = 1200;
// Keep object inference at most ~1/8 of the main thread in steady state.
const OBJECT_INFERENCE_BUDGET_MULTIPLIER = 8;
// While a phone or a second person is pending, re-sample quickly to confirm.
const OBJECT_CONFIRM_RESAMPLE_MS = 700;
const CPU_MIN_OBJECT_INTERVAL_MS = 3000;
const TICK_ERROR_THRESHOLD = 3;
const VIDEO_PLAYBACK_RETRY_MS = 1000;
const MODEL_RETRY_BASE_MS = 5000;
const MODEL_RETRY_MAX_MS = 30000;
const FALLBACK_FACE_CENTER_TOLERANCE_RATIO = 0.32;
const FALLBACK_FACE_MIN_WIDTH_RATIO = 0.12;
const FALLBACK_FRAME_VARIANCE_THRESHOLD = 95;
const OBJECT_CONFIRM_EVENTS = Object.freeze([
  AI_PROCTORING_EVENTS.MOBILE_DETECTED,
  AI_PROCTORING_EVENTS.MULTIPLE_PERSONS,
]);

export function normalizeProctoringSettings(settings = {}) {
  const source = settings?.aiProctoring && typeof settings.aiProctoring === 'object'
    ? settings.aiProctoring
    : settings;

  return {
    ...DEFAULT_AI_PROCTORING_SETTINGS,
    // The out-of-frame grace defaults to the proctoring policy, not the shared constant.
    faceOutOfFrameGraceSec: DEFAULT_FACE_OUT_OF_FRAME_GRACE_SEC,
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
    objectPersonCount: 0,
    personCount: faceCount || 0,
    fresh: { face: false, object: false },
    ...overrides,
    confidence: {
      face: faceConfidence,
      mobile: 0,
      person: 0,
      lookingAway: 0,
      ...(overrides.confidence || {}),
    },
  };
}

// Looking-away alone never needs the face model.
function shouldUseFaceDetection(settings = {}) {
  return settings.detectNoFace !== false
    || settings.detectMultiplePersons !== false
    || settings.detectFaceOutOfFrame !== false;
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

// A muted track is live but delivers no frames (OS privacy toggle, device
// grabbed by another app, sleep): treat it as a camera interruption.
export function getCameraActive(stream) {
  return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live' && !track.muted));
}

// Webcams and OS privacy toggles mute tracks briefly. Rules never run on a
// muted track, but the footer only reports a camera problem once the mute has
// lasted CAMERA_MUTE_STATUS_GRACE_MS (matching the page's re-acquire grace).
const CAMERA_MUTE_STATUS_GRACE_MS = 8000;
const trackMutedSince = new WeakMap();

export function isCameraMuteWithinGrace(stream, now = Date.now(), graceMs = CAMERA_MUTE_STATUS_GRACE_MS) {
  return Boolean(stream?.getVideoTracks?.().some((track) => {
    if (track.readyState !== 'live' || !track.muted) {
      trackMutedSince.delete(track);
      return false;
    }
    if (!trackMutedSince.has(track)) trackMutedSince.set(track, now);
    return now - trackMutedSince.get(track) < graceMs;
  }));
}

function isVideoPlaying(videoElement) {
  return !videoElement || (!videoElement.paused && !videoElement.ended);
}

function isVideoReady(videoElement) {
  return Boolean(
    videoElement
      && videoElement.readyState >= 2
      && videoElement.videoWidth > 0
      && videoElement.videoHeight > 0,
  );
}

function yieldToMain() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  const primary = normalizedFaces.reduce((best, face) => {
    const area = Number(face?.boundingBox?.width || 0) * Number(face?.boundingBox?.height || 0);
    const bestArea = Number(best?.boundingBox?.width || 0) * Number(best?.boundingBox?.height || 0);
    return area > bestArea ? face : best;
  }, normalizedFaces[0]);
  const box = primary?.boundingBox || {};
  const width = Number(box.width || 0);
  const height = Number(box.height || 0);
  const centerX = Number(box.x || 0) + (width / 2);
  const centerY = Number(box.y || 0) + (height / 2);
  const faceOutOfFrame = Math.abs(centerX - videoWidth / 2) > videoWidth * FALLBACK_FACE_CENTER_TOLERANCE_RATIO
    || Math.abs(centerY - videoHeight / 2) > videoHeight * FALLBACK_FACE_CENTER_TOLERANCE_RATIO
    || width < videoWidth * FALLBACK_FACE_MIN_WIDTH_RATIO;

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
      faces: faceCount,
    },
  };
}

// The footer shows only confirmed (active) episodes, never raw per-tick results.
export function getStatusFromBuffer(result = {}, buffer = null, settings = {}, availability = {}) {
  if (result.cameraActive === false && !result.cameraMuteGrace) {
    return {
      camera: 'error',
      face: 'unknown',
      eye: 'unknown',
      mobile: 'unknown',
      person: 'unknown',
    };
  }

  const isActive = (type) => Boolean(buffer?.isActive?.(type));
  const multipleFaces = isActive(AI_PROCTORING_EVENTS.MULTIPLE_FACES);
  const multiplePeople = multipleFaces || isActive(AI_PROCTORING_EVENTS.MULTIPLE_PERSONS);
  const faceIssue = multipleFaces
    ? 'multiple'
    : isActive(AI_PROCTORING_EVENTS.NO_FACE)
      ? 'missing'
      : isActive(AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME)
        ? 'out_of_frame'
        : 'ok';
  const faceAvailable = availability.face !== false;
  const objectAvailable = availability.object !== false;

  return {
    camera: 'ok',
    face: faceIssue === 'ok' && !faceAvailable ? 'unknown' : faceIssue,
    eye: settings.detectLookingAway === true && isActive(AI_PROCTORING_EVENTS.LOOKING_AWAY) ? 'looking_away' : 'ok',
    mobile: !objectAvailable ? 'unknown' : isActive(AI_PROCTORING_EVENTS.MOBILE_DETECTED) ? 'detected' : 'ok',
    person: multiplePeople ? 'multiple' : !faceAvailable && !objectAvailable ? 'unknown' : 'ok',
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
    this.objectBackend = null;
    this.detectionTickInProgress = false;
    this.tickFailureCount = 0;
    this.confirmedViolationCount = 0;
    this.lastObjectDetectionAt = 0;
    this.lastObjectResult = null;
    this.lastVideoPlaybackRetryAt = 0;
    this.modelRetryTimeoutId = null;
    this.modelRetryAttempt = 0;
    this.modelLoadInProgress = false;
    this.paused = false;
    this.stopped = false;
    this.cameraStarting = false;
    // Bumped by stop(); async work from an older lifecycle is discarded.
    this.generation = 0;
    this.groupLastEmitAt = new Map();
    this.handleOnline = () => this.scheduleModelRetry(0);
    this.violationBuffer = new ViolationBuffer({
      cooldownMs: getCooldownMs(this.settings),
    });
  }

  async start() {
    if (this.status.running || this.cameraStarting) return this.getStatus();
    this.stopped = false;

    if (!this.settings.enabled) {
      this.updateStatus({
        running: false,
        error: null,
      });
      return this.getStatus();
    }

    this.cameraStarting = true;
    try {
      await this.startCamera();
      // replaceStream() may have swapped the stream while it was attaching.
      if (this.stream && this.videoElement && this.videoElement.srcObject !== this.stream) {
        await attachStreamToVideo(this.videoElement, this.stream);
      }
    } catch (error) {
      this.stopDetectionLoop();
      this.stopCamera();
      this.handleCameraError(error);
      return this.getStatus();
    } finally {
      this.cameraStarting = false;
    }
    if (this.stopped) return this.getStatus();

    // Camera monitoring is live immediately; models load in parallel.
    this.updateStatus({
      running: true,
      camera: 'ok',
      error: null,
    });
    const generation = this.generation;
    this.startDetectionLoop();
    globalThis.addEventListener?.('online', this.handleOnline);
    await this.runDetectionTick();

    try {
      await this.loadModels();
    } catch (error) {
      this.handleModelError(error);
      return this.getStatus();
    }

    // The manager may have been stopped while a model was loading.
    if (!this.isCurrent(generation)) return this.getStatus();

    this.updateStatus({
      error: this.getModelAvailabilityError(),
    });
    await this.runDetectionTick();

    return this.getStatus();
  }

  stop() {
    this.generation += 1;
    this.stopped = true;
    this.stopDetectionLoop();
    this.stopCamera();
    this.stopModels();
    this.violationBuffer.clear();
    this.groupLastEmitAt.clear();
    this.confirmedViolationCount = 0;
    this.lastObjectDetectionAt = 0;
    this.lastObjectResult = null;
    this.lastVideoPlaybackRetryAt = 0;
    this.tickFailureCount = 0;
    this.modelLoadInProgress = false;
    this.clearModelRetry();
    globalThis.removeEventListener?.('online', this.handleOnline);
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

  // Swap the camera stream (e.g. after the page re-acquires the camera) while
  // keeping models and the detection loop. A stopped-by-error manager restarts.
  async replaceStream(stream) {
    const next = stream || null;
    if (next !== this.stream) {
      if (this.ownsStream && this.stream) stopCameraStream(this.stream);
      this.stream = next;
      this.ownsStream = false;
    }
    this.lastVideoPlaybackRetryAt = 0;
    this.lastObjectDetectionAt = 0;
    this.lastObjectResult = null;
    // The outage ends open episodes silently; a quick return is the same episode.
    this.violationBuffer.suspend(Date.now(), { exceptTypes: [AI_PROCTORING_EVENTS.CAMERA_BLOCKED] });

    if (!this.status.running && !this.cameraStarting) {
      if (next && !this.stopped && this.settings.enabled) return this.start();
      return this.getStatus();
    }

    const generation = this.generation;
    if (next) await attachStreamToVideo(this.videoElement, next);
    if (this.isCurrent(generation)) await this.runDetectionTick();
    return this.getStatus();
  }

  // While paused (re-verification, violation screen) detection may continue,
  // but nothing is confirmed or emitted and every episode starts over.
  setPaused(paused) {
    const next = paused === true;
    if (next === this.paused) return this.getStatus();
    this.paused = next;
    this.violationBuffer.clear();
    this.groupLastEmitAt.clear();
    if (this.status.running) {
      this.updateStatus(getStatusFromBuffer(
        { cameraActive: getCameraActive(this.stream) },
        this.violationBuffer,
        this.settings,
        this.getAvailability(),
      ));
    }
    return this.getStatus();
  }

  isPaused() {
    return this.paused;
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

  isCurrent(generation) {
    return this.status.running && generation === this.generation;
  }

  async loadModels() {
    if (this.modelLoadInProgress) return false;
    this.modelLoadInProgress = true;
    const generation = this.generation;
    const firstAttempt = this.modelRetryAttempt === 0;
    const superseded = (current, detector) => generation !== this.generation || current !== detector;

    const loadFaceModel = async () => {
      if (!shouldUseFaceDetection(this.settings) || this.faceDetectorAvailable) return;
      if (firstAttempt) this.updateStatus({ faceModel: 'loading' });
      const detector = this.faceDetector || createFaceDetector({
        mediaPipe: { outputFaceBlendshapes: this.settings.detectLookingAway === true },
      });
      this.faceDetector = detector;
      try {
        await detector.load();
        if (superseded(this.faceDetector, detector)) {
          detector.dispose?.();
          return;
        }
        this.faceDetectorAvailable = true;
        this.updateStatus({ faceModel: 'ready' });
      } catch (error) {
        detector.dispose?.();
        if (superseded(this.faceDetector, detector)) return;
        this.faceDetectorAvailable = false;
        this.faceDetector = null;
        const fallbackReady = this.faceFallbackAvailable || this.setupFaceFallback();
        this.faceFallbackAvailable = fallbackReady;
        this.updateStatus({
          faceModel: fallbackReady ? 'fallback' : 'unavailable',
          error: fallbackReady
            ? 'Face AI model unavailable. Basic face fallback is active.'
            : (error?.message || 'Face model failed to load'),
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
    };

    const loadObjectModel = async () => {
      if (!shouldUseObjectDetection(this.settings) || this.objectDetectorAvailable) return;
      if (firstAttempt) this.updateStatus({ objectModel: 'loading' });
      const detector = this.objectDetector || createObjectDetector();
      this.objectDetector = detector;
      try {
        await detector.load();
        if (superseded(this.objectDetector, detector)) {
          detector.dispose?.();
          return;
        }
        this.objectDetectorAvailable = true;
        this.objectBackend = detector.backend || null;
        this.updateStatus({ objectModel: 'ready' });
      } catch (error) {
        detector.dispose?.();
        if (superseded(this.objectDetector, detector)) return;
        this.objectDetectorAvailable = false;
        this.objectDetector = null;
        this.updateStatus({
          objectModel: 'unavailable',
          error: error?.message || 'Object model failed to load',
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
    };

    try {
      await Promise.all([loadFaceModel(), loadObjectModel()]);
      if (generation !== this.generation) return false;
      this.modelsLoaded = this.faceDetectorAvailable || this.objectDetectorAvailable || this.faceFallbackAvailable;
      if (this.hasUnavailableRequiredModel()) this.scheduleModelRetry();
      else {
        this.modelRetryAttempt = 0;
        this.clearModelRetry();
      }
      return this.modelsLoaded;
    } finally {
      if (generation === this.generation) this.modelLoadInProgress = false;
    }
  }

  stopModels() {
    this.clearModelRetry();
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

  getAvailability() {
    return {
      face: !shouldUseFaceDetection(this.settings) || this.faceDetectorAvailable || this.faceFallbackAvailable,
      object: !shouldUseObjectDetection(this.settings) || this.objectDetectorAvailable,
    };
  }

  async runDetectionTick() {
    if (!this.status.running) return null;
    if (this.detectionTickInProgress) return null;

    this.detectionTickInProgress = true;
    const generation = this.generation;
    try {
      const timestamp = Date.now();
      await this.ensureVideoPlayback(timestamp);
      if (!this.isCurrent(generation)) return null;

      const cameraActive = getCameraActive(this.stream);
      const cameraMuteGrace = !cameraActive && isCameraMuteWithinGrace(this.stream, timestamp);
      // A paused element only repeats its last frame: not a fresh sample.
      const canSample = cameraActive && isVideoPlaying(this.videoElement);
      const useFace = shouldUseFaceDetection(this.settings);
      let faceResult = null;

      if (canSample && useFace && this.faceDetectorAvailable && this.faceDetector) {
        faceResult = this.faceDetector.detect(this.videoElement, timestamp);
      } else if (canSample && useFace && this.faceFallbackAvailable) {
        faceResult = await this.detectWithFaceFallback(this.videoElement);
        if (!this.isCurrent(generation)) return null;
      }
      const faceFresh = Boolean(faceResult) && !faceResult.metadata?.skipped;

      let objectResult = this.lastObjectResult;
      let objectFresh = false;
      if (canSample && this.shouldRunObjectDetection(timestamp)) {
        await yieldToMain();
        if (!this.isCurrent(generation) || !this.objectDetector) return null;
        const nextObjectResult = await this.objectDetector.detect(this.videoElement, {
          scanAllCrops: this.violationBuffer.isPending(AI_PROCTORING_EVENTS.MOBILE_DETECTED),
        });
        if (!this.isCurrent(generation)) return null;
        objectFresh = Boolean(nextObjectResult) && !nextObjectResult.metadata?.skipped;
        if (objectFresh) {
          this.lastObjectResult = nextObjectResult;
          this.lastObjectDetectionAt = timestamp;
          objectResult = nextObjectResult;
        }
      }

      const faceCount = Number(faceResult?.faceCount ?? 1);
      const faceConfidence = Number(faceResult?.confidence?.face ?? 0.9);
      const objectPersonCount = Number(objectResult?.personCount || 0);
      const result = createSafeDetectionResult({
        timestamp,
        cameraActive,
        cameraMuteGrace,
        ...(faceResult || {}),
        faceCount,
        mobileDetected: Boolean(objectResult?.mobileDetected),
        mobileAvailable: !shouldUseObjectDetection(this.settings) || this.objectDetectorAvailable,
        objectPersonCount,
        personCount: Math.max(faceCount || 0, objectPersonCount),
        fresh: { face: faceFresh, object: objectFresh },
        confidence: {
          face: faceConfidence,
          mobile: Number(objectResult?.confidence?.mobile || 0),
          person: Number(objectResult?.confidence?.person || 0),
          lookingAway: Number(faceResult?.confidence?.lookingAway || 0),
        },
        metadata: {
          face: faceResult?.metadata || null,
          object: objectResult?.metadata || null,
          objectBackend: this.objectBackend,
          objectInferenceMs: this.objectDetector?.lastInferenceMs || 0,
        },
      });

      this.tickFailureCount = 0;
      this.handleDetectionResult(result);
      return result;
    } catch (error) {
      this.tickFailureCount += 1;
      // A single failed inference is noise; report only a persistent failure.
      if (this.tickFailureCount === TICK_ERROR_THRESHOLD && this.isCurrent(generation)) {
        this.updateStatus({
          error: error?.message || 'AI detection failed',
        });
        if (this.onError) this.safeCall(this.onError, error);
      }
      return null;
    } finally {
      if (generation === this.generation) this.detectionTickInProgress = false;
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
    const timestamp = Number.isFinite(result.timestamp) ? result.timestamp : Date.now();

    if (result.cameraActive === false) {
      // No face/object rules run during an outage (no "no face" for a dead camera).
      this.violationBuffer.suspend(timestamp, { exceptTypes: [AI_PROCTORING_EVENTS.CAMERA_BLOCKED] });
    } else if (!this.paused) {
      const rules = getActiveRules(this.settings);
      rules.forEach((rule) => {
        if (!result.fresh?.[rule.source]) return;
        const confirmed = this.violationBuffer.observe(rule.type, rule.present(result), timestamp, rule);
        if (!confirmed || !this.shouldEmitForGroup(rule, rules, confirmed, timestamp)) return;
        this.emitConfirmedViolation(createCandidate(rule.type, result), confirmed);
      });
    }

    this.updateStatus({
      ...getStatusFromBuffer(result, this.violationBuffer, this.settings, this.getAvailability()),
      error: this.getModelAvailabilityError(),
    });
  }

  // Grouped events (multiple faces / multiple persons) share one warning per episode.
  shouldEmitForGroup(rule, rules, confirmed, timestamp) {
    if (!rule.group) return true;
    const siblingActive = rules.some((other) => (
      other.group === rule.group
        && other.type !== rule.type
        && this.violationBuffer.isActive(other.type)
    ));
    if (confirmed.reason === 'episode_start' && siblingActive) return false;
    const lastGroupEmitAt = this.groupLastEmitAt.get(rule.group);
    const quietMs = confirmed.reason === 'still_present'
      ? this.violationBuffer.repeatAfterMs
      : this.violationBuffer.cooldownMs;
    if (lastGroupEmitAt !== undefined && timestamp - lastGroupEmitAt < quietMs) return false;
    this.groupLastEmitAt.set(rule.group, timestamp);
    return true;
  }

  getObjectDetectionIntervalMs() {
    const cpuBackend = this.objectDetector?.backend === 'cpu';
    const confirming = OBJECT_CONFIRM_EVENTS.some((type) => this.violationBuffer.isPending(type));
    if (confirming && !this.paused) {
      return cpuBackend ? CPU_MIN_OBJECT_INTERVAL_MS : OBJECT_CONFIRM_RESAMPLE_MS;
    }

    const measuredMs = Number(this.objectDetector?.lastInferenceMs || 0);
    const steadyMs = Math.max(
      OBJECT_STEADY_MIN_INTERVAL_MS,
      measuredMs * OBJECT_INFERENCE_BUDGET_MULTIPLIER,
      isLikelyMobileDevice() ? MOBILE_OBJECT_DETECTION_INTERVAL_MS : 0,
    );
    return cpuBackend ? Math.max(CPU_MIN_OBJECT_INTERVAL_MS, steadyMs) : steadyMs;
  }

  shouldRunObjectDetection(timestamp = Date.now()) {
    if (!this.objectDetectorAvailable || !this.objectDetector || !shouldUseObjectDetection(this.settings)) {
      return false;
    }
    if (!this.lastObjectDetectionAt) return true;
    return timestamp - this.lastObjectDetectionAt >= this.getObjectDetectionIntervalMs();
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

  hasUnavailableRequiredModel() {
    return (shouldUseFaceDetection(this.settings) && !this.faceDetectorAvailable)
      || (shouldUseObjectDetection(this.settings) && !this.objectDetectorAvailable);
  }

  scheduleModelRetry(delayMs = null) {
    if (!this.status.running || !this.hasUnavailableRequiredModel()) return;
    this.clearModelRetry();
    const retryDelay = delayMs === null
      ? Math.min(MODEL_RETRY_MAX_MS, MODEL_RETRY_BASE_MS * (2 ** this.modelRetryAttempt))
      : Math.max(0, delayMs);
    this.modelRetryAttempt = Math.min(4, this.modelRetryAttempt + 1);
    const generation = this.generation;
    this.modelRetryTimeoutId = globalThis.setTimeout(async () => {
      this.modelRetryTimeoutId = null;
      if (generation !== this.generation) return;
      if (!this.status.running || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        this.scheduleModelRetry();
        return;
      }
      await this.loadModels();
      if (this.isCurrent(generation)) await this.runDetectionTick();
    }, retryDelay);
  }

  clearModelRetry() {
    if (!this.modelRetryTimeoutId) return;
    globalThis.clearTimeout(this.modelRetryTimeoutId);
    this.modelRetryTimeoutId = null;
  }

  // System health only: shown at most as a neutral "AI limited" state.
  getModelAvailabilityError() {
    const faceRequired = shouldUseFaceDetection(this.settings);
    const objectRequired = shouldUseObjectDetection(this.settings);
    if (faceRequired && this.faceFallbackAvailable && this.status.faceModel === 'fallback') {
      return 'Face AI model unavailable. Basic face fallback is active.';
    }
    if (faceRequired && this.faceDetectorAvailable === false && this.status.faceModel === 'unavailable') {
      return 'AI face model unavailable. Face checks cannot run.';
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

  // Model problems never stop the camera or the loop: liveness and the face
  // fallback keep running while the model is retried.
  handleModelError(error) {
    this.updateStatus({
      error: error?.message || 'AI model failed to load',
    });
    if (this.onError) this.safeCall(this.onError, error);
    this.scheduleModelRetry();
  }

  emitConfirmedViolation(candidate, confirmed) {
    if (!this.onViolationConfirmed || this.paused) return;
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
        episode: confirmed.reason || 'episode_start',
        objectBackend: this.objectBackend,
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
