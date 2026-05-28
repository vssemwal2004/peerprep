// AI Proctoring placeholder - implementation will be added in later steps.
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
  }

  async load() {
    if (this.loaded) return this;
    await this.adapter.load();
    this.loaded = true;
    return this;
  }

  async detect(videoElement) {
    if (!this.loaded) return createDefaultObjectResult();
    return this.adapter.detect(videoElement);
  }

  dispose() {
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
