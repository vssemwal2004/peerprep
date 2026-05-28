// AI Proctoring placeholder - implementation will be added in later steps.
import { createFaceLandmarker } from '../utils/modelLoader';

const SOURCE = 'mediapipe_face_landmarker';
const FRAME_EDGE_THRESHOLD = 0.05;
const LOOKING_AWAY_HORIZONTAL_THRESHOLD = 0.28;
const LOOKING_AWAY_VERTICAL_THRESHOLD = 0.32;
const NO_FACE_RESULT = Object.freeze({
  facePresent: false,
  faceCount: 0,
  faceOutOfFrame: false,
  lookingAway: false,
  confidence: {
    face: 0,
    lookingAway: 0,
  },
  metadata: {
    source: SOURCE,
  },
});

export class MediaPipeFaceAdapter {
  constructor(options = {}) {
    this.options = options;
    this.faceLandmarker = null;
    this.loaded = false;
  }

  async load() {
    if (this.loaded && this.faceLandmarker) return this;

    this.faceLandmarker = await createFaceLandmarker({
      numFaces: 2,
      ...this.options,
    });
    this.loaded = true;
    return this;
  }

  detect(videoElement, timestamp = Date.now()) {
    if (!this.faceLandmarker || !isVideoReady(videoElement)) {
      return createUnknownFrameResult();
    }

    const result = this.faceLandmarker.detectForVideo(videoElement, timestamp);
    return normalizeFaceLandmarkerResult(result);
  }

  dispose() {
    if (this.faceLandmarker?.close) {
      this.faceLandmarker.close();
    }
    this.faceLandmarker = null;
    this.loaded = false;
  }
}

export function createMediaPipeFaceAdapter(options = {}) {
  return new MediaPipeFaceAdapter(options);
}

export const mediapipeAdapter = {
  createMediaPipeFaceAdapter,
  MediaPipeFaceAdapter,
};

function normalizeFaceLandmarkerResult(result = {}) {
  const faceLandmarks = Array.isArray(result.faceLandmarks) ? result.faceLandmarks : [];
  const faceCount = faceLandmarks.length;

  if (faceCount === 0) return { ...NO_FACE_RESULT, metadata: { ...NO_FACE_RESULT.metadata } };

  const boxes = faceLandmarks.map(getLandmarkBox).filter(Boolean);
  const primaryBox = boxes[0];
  const faceOutOfFrame = boxes.some(isBoxOutOfFrame);
  const lookingAway = Boolean(primaryBox && isLookingAway(faceLandmarks[0], primaryBox));
  const lookingAwayConfidence = lookingAway ? getLookingAwayConfidence(faceLandmarks[0], primaryBox) : 0;

  return {
    facePresent: true,
    faceCount,
    faceOutOfFrame,
    lookingAway,
    confidence: {
      face: 0.9,
      lookingAway: lookingAwayConfidence,
    },
    metadata: {
      source: SOURCE,
    },
  };
}

function createUnknownFrameResult() {
  return {
    facePresent: true,
    faceCount: 1,
    faceOutOfFrame: false,
    lookingAway: false,
    confidence: {
      face: 0.6,
      lookingAway: 0,
    },
    metadata: {
      source: SOURCE,
      skipped: 'video_not_ready',
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

function getLandmarkBox(landmarks = []) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return null;

  const box = landmarks.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, normalizePointValue(point?.x)),
    maxX: Math.max(bounds.maxX, normalizePointValue(point?.x)),
    minY: Math.min(bounds.minY, normalizePointValue(point?.y)),
    maxY: Math.max(bounds.maxY, normalizePointValue(point?.y)),
  }), {
    minX: 1,
    maxX: 0,
    minY: 1,
    maxY: 0,
  });

  if (box.minX > box.maxX || box.minY > box.maxY) return null;
  return box;
}

function normalizePointValue(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(-1, Math.min(2, next));
}

function isBoxOutOfFrame(box) {
  if (!box) return false;
  return box.minX < FRAME_EDGE_THRESHOLD
    || box.maxX > 1 - FRAME_EDGE_THRESHOLD
    || box.minY < FRAME_EDGE_THRESHOLD
    || box.maxY > 1 - FRAME_EDGE_THRESHOLD;
}

function isLookingAway(landmarks = [], box) {
  const offsets = getNoseOffsets(landmarks, box);
  if (!offsets) return false;

  return offsets.horizontal > LOOKING_AWAY_HORIZONTAL_THRESHOLD
    || offsets.vertical > LOOKING_AWAY_VERTICAL_THRESHOLD;
}

function getLookingAwayConfidence(landmarks = [], box) {
  const offsets = getNoseOffsets(landmarks, box);
  if (!offsets) return 0;

  const horizontalExcess = Math.max(0, offsets.horizontal - LOOKING_AWAY_HORIZONTAL_THRESHOLD);
  const verticalExcess = Math.max(0, offsets.vertical - LOOKING_AWAY_VERTICAL_THRESHOLD);
  return Math.min(0.95, 0.65 + Math.max(horizontalExcess, verticalExcess));
}

function getNoseOffsets(landmarks = [], box) {
  const nose = landmarks[1] || landmarks[4] || null;
  if (!nose || !box) return null;

  const width = Math.max(0.001, box.maxX - box.minX);
  const height = Math.max(0.001, box.maxY - box.minY);
  const centerX = box.minX + (width / 2);
  const centerY = box.minY + (height / 2);

  return {
    horizontal: Math.abs(normalizePointValue(nose.x) - centerX) / width,
    vertical: Math.abs(normalizePointValue(nose.y) - centerY) / height,
  };
}
