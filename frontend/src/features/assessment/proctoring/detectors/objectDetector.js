import { createCocoSsdAdapter } from '../adapters/cocoSsdAdapter';

const DEFAULT_OBJECT_RESULT = Object.freeze({
  mobileDetected: false,
  personCount: 0,
  confidence: {
    mobile: 0,
    person: 0,
  },
  metadata: {
    source: 'object_detector',
    objects: [],
    skipped: 'not_loaded',
  },
});

export class ObjectDetector {
  constructor(options = {}) {
    this.adapter = options.adapter || createCocoSsdAdapter(options.cocoSsd || {});
    this.loaded = false;
    this.disposed = false;
  }

  get backend() {
    return this.adapter?.backend || 'unknown';
  }

  get lastInferenceMs() {
    return Number(this.adapter?.lastInferenceMs || 0);
  }

  async load() {
    if (this.loaded) return this;
    await this.adapter.load();
    if (this.disposed) return this;
    this.loaded = true;
    return this;
  }

  async detect(videoElement, scanOptions = {}) {
    if (!this.loaded) return createDefaultObjectResult();
    return this.adapter.detect(videoElement, scanOptions);
  }

  dispose() {
    this.disposed = true;
    this.adapter?.dispose?.();
    this.loaded = false;
  }
}

export function createObjectDetector(options = {}) {
  return new ObjectDetector(options);
}

export const objectDetector = {
  createObjectDetector,
  ObjectDetector,
};

function createDefaultObjectResult() {
  return {
    ...DEFAULT_OBJECT_RESULT,
    confidence: { ...DEFAULT_OBJECT_RESULT.confidence },
    metadata: {
      ...DEFAULT_OBJECT_RESULT.metadata,
      objects: [],
    },
  };
}
