// AI Proctoring placeholder - implementation will be added in later steps.
import { createCocoSsdModel } from '../utils/modelLoader';

const SOURCE = 'coco_ssd';
const MOBILE_LABEL = 'cell phone';
const PERSON_LABEL = 'person';
const MOBILE_CONFIDENCE_THRESHOLD = 0.6;
const PERSON_CONFIDENCE_THRESHOLD = 0.6;

export class CocoSsdAdapter {
  constructor(options = {}) {
    this.options = options;
    this.model = null;
    this.loaded = false;
  }

  async load() {
    if (this.loaded && this.model) return this;

    this.model = await createCocoSsdModel(this.options);
    this.loaded = true;
    return this;
  }

  async detect(videoElement) {
    if (!this.model || !isVideoReady(videoElement)) {
      return createDefaultObjectResult('video_not_ready');
    }

    const predictions = await this.model.detect(videoElement);
    return normalizeCocoSsdPredictions(predictions);
  }

  dispose() {
    this.model?.dispose?.();
    this.model = null;
    this.loaded = false;
  }
}

export function createCocoSsdAdapter(options = {}) {
  return new CocoSsdAdapter(options);
}

export const cocoSsdAdapter = {
  createCocoSsdAdapter,
  CocoSsdAdapter,
};

function normalizeCocoSsdPredictions(predictions = []) {
  const objects = Array.isArray(predictions)
    ? predictions
      .filter((item) => item && typeof item.class === 'string')
      .map((item) => ({
        class: item.class,
        score: clampScore(item.score),
      }))
    : [];

  const mobileObjects = objects.filter((item) => item.class === MOBILE_LABEL && item.score >= MOBILE_CONFIDENCE_THRESHOLD);
  const personObjects = objects.filter((item) => item.class === PERSON_LABEL && item.score >= PERSON_CONFIDENCE_THRESHOLD);
  const bestMobileScore = getBestScore(mobileObjects);
  const bestPersonScore = getBestScore(personObjects);

  return {
    mobileDetected: mobileObjects.length > 0,
    personCount: personObjects.length,
    confidence: {
      mobile: bestMobileScore,
      person: bestPersonScore,
    },
    metadata: {
      source: SOURCE,
      objects: [
        ...mobileObjects,
        ...personObjects,
      ],
    },
  };
}

function createDefaultObjectResult(reason) {
  return {
    mobileDetected: false,
    personCount: 0,
    confidence: {
      mobile: 0,
      person: 0,
    },
    metadata: {
      source: SOURCE,
      objects: [],
      skipped: reason,
    },
  };
}

function isVideoReady(videoElement) {
  return Boolean(
    videoElement
      && videoElement.readyState >= 2
      && videoElement.videoWidth > 0
      && videoElement.videoHeight > 0,
  );
}

function clampScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getBestScore(objects = []) {
  return objects.reduce((best, item) => Math.max(best, clampScore(item.score)), 0);
}
