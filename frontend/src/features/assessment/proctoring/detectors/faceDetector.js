// AI Proctoring placeholder - implementation will be added in later steps.
import { createMediaPipeFaceAdapter } from '../adapters/mediapipeAdapter';

const DEFAULT_FACE_RESULT = Object.freeze({
  facePresent: true,
  faceCount: 1,
  faceOutOfFrame: false,
  lookingAway: false,
  confidence: {
    face: 0.6,
    lookingAway: 0,
  },
  metadata: {
    source: 'face_detector',
    skipped: 'not_loaded',
  },
});

export class FaceDetector {
  constructor(options = {}) {
    this.adapter = options.adapter || createMediaPipeFaceAdapter(options.mediaPipe || {});
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return this;
    await this.adapter.load();
    this.loaded = true;
    return this;
  }

  detect(videoElement, timestamp = Date.now()) {
    if (!this.loaded) return createDefaultFaceResult();
    return this.adapter.detect(videoElement, timestamp);
  }

  dispose() {
    this.adapter?.dispose?.();
    this.loaded = false;
  }
}

export function createFaceDetector(options = {}) {
  return new FaceDetector(options);
}

export const faceDetector = {
  createFaceDetector,
  FaceDetector,
};

function createDefaultFaceResult() {
  return {
    ...DEFAULT_FACE_RESULT,
    confidence: { ...DEFAULT_FACE_RESULT.confidence },
    metadata: { ...DEFAULT_FACE_RESULT.metadata },
  };
}
