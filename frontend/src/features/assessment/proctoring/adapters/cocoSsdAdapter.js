// AI Proctoring placeholder - implementation will be added in later steps.
import { createCocoSsdModel } from '../utils/modelLoader';

const SOURCE = 'coco_ssd';
const MOBILE_LABEL = 'cell phone';
const PERSON_LABEL = 'person';
const MOBILE_LABELS = Object.freeze(['cell phone', 'mobile phone', 'phone']);
const MOBILE_CONFIDENCE_THRESHOLD = 0.62;
const PERSON_CONFIDENCE_THRESHOLD = 0.55;
const MAX_DETECTED_BOXES = 20;
const MIN_DETECTION_SCORE = 0.2;
const MOBILE_CROP_SIZE = 416;
const MOBILE_CROP_CONFIDENCE_THRESHOLD = 0.72;
const MIN_PHONE_ASPECT_RATIO = 1.25;
const MAX_PHONE_ASPECT_RATIO = 3.8;
const MIN_PHONE_AREA_RATIO = 0.0025;
const MAX_PHONE_AREA_RATIO = 0.34;
const MIN_PHONE_SHORT_SIDE_RATIO = 0.018;
const MOBILE_SCAN_REGIONS = Object.freeze([
  { name: 'bottom', x: 0, y: 0.42, width: 1, height: 0.58 },
  { name: 'left', x: 0, y: 0, width: 0.58, height: 1 },
  { name: 'right', x: 0.42, y: 0, width: 0.58, height: 1 },
  { name: 'center', x: 0.18, y: 0.12, width: 0.64, height: 0.76 },
]);

export class CocoSsdAdapter {
  constructor(options = {}) {
    this.options = options;
    this.model = null;
    this.loaded = false;
    this.mobileScanCanvas = null;
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

    const detectOptions = {
      maxNumBoxes: Number(this.options.maxNumBoxes || MAX_DETECTED_BOXES),
      minScore: Number(this.options.minScore || MIN_DETECTION_SCORE),
      mobileThreshold: Number(this.options.mobileThreshold || MOBILE_CONFIDENCE_THRESHOLD),
      personThreshold: Number(this.options.personThreshold || PERSON_CONFIDENCE_THRESHOLD),
    };
    const predictions = await this.model.detect(
      videoElement,
      detectOptions.maxNumBoxes,
      detectOptions.minScore,
    );
    const fullFrameResult = normalizeCocoSsdPredictions(predictions, {
      mobileThreshold: detectOptions.mobileThreshold,
      personThreshold: detectOptions.personThreshold,
      frameWidth: Number(videoElement.videoWidth || 0),
      frameHeight: Number(videoElement.videoHeight || 0),
      scanRegion: 'full',
    });
    if (fullFrameResult.mobileDetected) return fullFrameResult;

    const cropResult = await this.detectMobileInCrops(videoElement, detectOptions);
    return mergeObjectResults(fullFrameResult, cropResult);
  }

  dispose() {
    this.model?.dispose?.();
    this.model = null;
    this.loaded = false;
    this.mobileScanCanvas = null;
  }

  async detectMobileInCrops(videoElement, options = {}) {
    const canvas = this.getMobileScanCanvas();
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!canvas || !context) return createDefaultObjectResult('crop_canvas_unavailable');

    const videoWidth = Number(videoElement.videoWidth || 0);
    const videoHeight = Number(videoElement.videoHeight || 0);
    if (!videoWidth || !videoHeight) return createDefaultObjectResult('video_not_ready');

    const cropResults = [];
    for (const region of MOBILE_SCAN_REGIONS) {
      const sourceX = Math.max(0, Math.floor(region.x * videoWidth));
      const sourceY = Math.max(0, Math.floor(region.y * videoHeight));
      const sourceWidth = Math.min(videoWidth - sourceX, Math.floor(region.width * videoWidth));
      const sourceHeight = Math.min(videoHeight - sourceY, Math.floor(region.height * videoHeight));
      if (sourceWidth <= 0 || sourceHeight <= 0) continue;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        videoElement,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const cropPredictions = await this.model.detect(
        canvas,
        options.maxNumBoxes,
        options.minScore,
      );
      const cropResult = normalizeCocoSsdPredictions(cropPredictions, {
        mobileThreshold: Math.max(Number(options.mobileThreshold || 0), MOBILE_CROP_CONFIDENCE_THRESHOLD),
        personThreshold: 1,
        frameWidth: canvas.width,
        frameHeight: canvas.height,
        scanRegion: region.name,
      });
      cropResults.push(cropResult);
      if (cropResult.mobileDetected) break;
    }

    return mergeObjectResults(...cropResults);
  }

  getMobileScanCanvas() {
    if (this.mobileScanCanvas) return this.mobileScanCanvas;
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = MOBILE_CROP_SIZE;
    canvas.height = MOBILE_CROP_SIZE;
    this.mobileScanCanvas = canvas;
    return canvas;
  }
}

export function createCocoSsdAdapter(options = {}) {
  return new CocoSsdAdapter(options);
}

export const cocoSsdAdapter = {
  createCocoSsdAdapter,
  CocoSsdAdapter,
};

function normalizeCocoSsdPredictions(predictions = [], options = {}) {
  const objects = Array.isArray(predictions)
    ? predictions
      .filter((item) => item && typeof item.class === 'string')
      .map((item) => ({
        class: item.class.toLowerCase(),
        score: clampScore(item.score),
        bbox: Array.isArray(item.bbox) ? item.bbox.slice(0, 4) : null,
        scanRegion: options.scanRegion || 'full',
      }))
    : [];

  const mobileThreshold = getThreshold(options.mobileThreshold, MOBILE_CONFIDENCE_THRESHOLD);
  const personThreshold = getThreshold(options.personThreshold, PERSON_CONFIDENCE_THRESHOLD);
  const mobileObjects = objects.filter((item) => isPhoneLikeMobileObject(item, {
    threshold: mobileThreshold,
    frameWidth: options.frameWidth,
    frameHeight: options.frameHeight,
  }));
  const personObjects = objects.filter((item) => item.class === PERSON_LABEL && item.score >= personThreshold);
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

function mergeObjectResults(...results) {
  const validResults = results.filter(Boolean);
  const mobileObjects = validResults.flatMap((result) => (
    Array.isArray(result.metadata?.objects)
      ? result.metadata.objects.filter((item) => isMobileLabel(item.class))
      : []
  ));
  const personObjects = validResults.flatMap((result) => (
    Array.isArray(result.metadata?.objects)
      ? result.metadata.objects.filter((item) => item.class === PERSON_LABEL)
      : []
  ));
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
      scans: validResults.map((result) => result.metadata?.scanRegion).filter(Boolean),
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

function isMobileLabel(label) {
  const normalized = String(label || '').toLowerCase().trim();
  return normalized === MOBILE_LABEL || MOBILE_LABELS.includes(normalized);
}

function isPhoneLikeMobileObject(item = {}, options = {}) {
  if (!isMobileLabel(item.class) || item.score < options.threshold) return false;
  const shape = getPhoneBoxShape(item.bbox, options.frameWidth, options.frameHeight);
  if (!shape.valid) return false;

  const strongScore = item.score >= Math.max(options.threshold, 0.78);
  if (strongScore) return true;

  return shape.aspectRatio >= 1.35
    && shape.aspectRatio <= 3.2
    && shape.areaRatio >= 0.005
    && shape.shortSideRatio >= 0.025;
}

function getPhoneBoxShape(bbox, frameWidth, frameHeight) {
  if (!Array.isArray(bbox) || bbox.length < 4) return { valid: false };
  const width = Number(bbox[2]);
  const height = Number(bbox[3]);
  const sourceWidth = Math.max(1, Number(frameWidth || 0));
  const sourceHeight = Math.max(1, Number(frameHeight || 0));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { valid: false };
  }

  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const aspectRatio = longSide / Math.max(1, shortSide);
  const areaRatio = (width * height) / Math.max(1, sourceWidth * sourceHeight);
  const shortSideRatio = shortSide / Math.min(sourceWidth, sourceHeight);
  const valid = aspectRatio >= MIN_PHONE_ASPECT_RATIO
    && aspectRatio <= MAX_PHONE_ASPECT_RATIO
    && areaRatio >= MIN_PHONE_AREA_RATIO
    && areaRatio <= MAX_PHONE_AREA_RATIO
    && shortSideRatio >= MIN_PHONE_SHORT_SIDE_RATIO;

  return {
    valid,
    aspectRatio,
    areaRatio,
    shortSideRatio,
  };
}

function getThreshold(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(1, next));
}
