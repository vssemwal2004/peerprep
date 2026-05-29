// AI Proctoring placeholder - implementation will be added in later steps.
import { createFaceLandmarker } from '../utils/modelLoader';

const SOURCE = 'mediapipe_face_landmarker';
const FRAME_EDGE_THRESHOLD = 0.015;
const LOOKING_AWAY_HORIZONTAL_THRESHOLD = 0.46;
const LOOKING_AWAY_VERTICAL_THRESHOLD = 0.58;
const IRIS_HORIZONTAL_THRESHOLD = 0.78;
const IRIS_VERTICAL_THRESHOLD = 1.05;
const BLENDSHAPE_GAZE_THRESHOLD = 0.62;
const SUPPORTING_HEAD_HORIZONTAL_THRESHOLD = 0.28;
const SUPPORTING_HEAD_VERTICAL_THRESHOLD = 0.34;
const RIGHT_IRIS_INDICES = Object.freeze([468, 469, 470, 471, 472]);
const LEFT_IRIS_INDICES = Object.freeze([473, 474, 475, 476, 477]);
const RIGHT_EYE_INDICES = Object.freeze({ outer: 33, inner: 133, top: 159, bottom: 145 });
const LEFT_EYE_INDICES = Object.freeze({ outer: 263, inner: 362, top: 386, bottom: 374 });
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
  const primaryBlendshapes = getPrimaryBlendshapes(result);
  const lookingAway = Boolean(primaryBox && isLookingAway(faceLandmarks[0], primaryBox, primaryBlendshapes));
  const lookingAwayConfidence = lookingAway ? getLookingAwayConfidence(faceLandmarks[0], primaryBox, primaryBlendshapes) : 0;

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

function isLookingAway(landmarks = [], box, blendshapes = null) {
  const offsets = getNoseOffsets(landmarks, box);
  const irisOffsets = getIrisOffsets(landmarks);
  const blendshapeOffset = getBlendshapeGazeOffset(blendshapes);
  const headAway = Boolean(offsets && (
    offsets.horizontal > LOOKING_AWAY_HORIZONTAL_THRESHOLD
    || offsets.vertical > LOOKING_AWAY_VERTICAL_THRESHOLD
  ));
  const irisAway = Boolean(irisOffsets && (
    irisOffsets.horizontal > IRIS_HORIZONTAL_THRESHOLD
    || irisOffsets.vertical > IRIS_VERTICAL_THRESHOLD
  ));
  const blendshapeAway = blendshapeOffset > BLENDSHAPE_GAZE_THRESHOLD;
  const headSupportsGaze = Boolean(offsets && (
    offsets.horizontal > SUPPORTING_HEAD_HORIZONTAL_THRESHOLD
    || offsets.vertical > SUPPORTING_HEAD_VERTICAL_THRESHOLD
  ));

  // Normal test taking includes frequent small eye movements while reading code,
  // options, and long questions. Only flag when the head is clearly away, or
  // when strong eye-gaze evidence is supported by face/head movement.
  return Boolean(
    headAway
    || (irisAway && (blendshapeAway || headSupportsGaze))
    || (blendshapeAway && headSupportsGaze),
  );
}

function getLookingAwayConfidence(landmarks = [], box, blendshapes = null) {
  const offsets = getNoseOffsets(landmarks, box);
  const irisOffsets = getIrisOffsets(landmarks);
  const blendshapeOffset = getBlendshapeGazeOffset(blendshapes);
  if (!offsets && !irisOffsets && !blendshapeOffset) return 0;

  const headHorizontalExcess = Math.max(0, (offsets?.horizontal || 0) - LOOKING_AWAY_HORIZONTAL_THRESHOLD);
  const headVerticalExcess = Math.max(0, (offsets?.vertical || 0) - LOOKING_AWAY_VERTICAL_THRESHOLD);
  const irisHorizontalExcess = Math.max(0, (irisOffsets?.horizontal || 0) - IRIS_HORIZONTAL_THRESHOLD);
  const irisVerticalExcess = Math.max(0, (irisOffsets?.vertical || 0) - IRIS_VERTICAL_THRESHOLD);
  const blendshapeExcess = Math.max(0, blendshapeOffset - BLENDSHAPE_GAZE_THRESHOLD);
  return Math.min(0.95, 0.72 + Math.max(
    headHorizontalExcess,
    headVerticalExcess,
    irisHorizontalExcess,
    irisVerticalExcess,
    blendshapeExcess,
  ));
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

function getIrisOffsets(landmarks = []) {
  const offsets = [
    getSingleEyeOffset(landmarks, RIGHT_EYE_INDICES, RIGHT_IRIS_INDICES),
    getSingleEyeOffset(landmarks, LEFT_EYE_INDICES, LEFT_IRIS_INDICES),
  ].filter(Boolean);

  if (!offsets.length) return null;
  return offsets.reduce((best, current) => ({
    horizontal: Math.max(best.horizontal, current.horizontal),
    vertical: Math.max(best.vertical, current.vertical),
  }), {
    horizontal: 0,
    vertical: 0,
  });
}

function getSingleEyeOffset(landmarks = [], eyeIndices, irisIndices = []) {
  const outer = landmarks[eyeIndices.outer];
  const inner = landmarks[eyeIndices.inner];
  const top = landmarks[eyeIndices.top];
  const bottom = landmarks[eyeIndices.bottom];
  const iris = getIrisCenter(landmarks, irisIndices);

  if (!outer || !inner || !top || !bottom || !iris) return null;

  const minX = Math.min(normalizePointValue(outer.x), normalizePointValue(inner.x));
  const maxX = Math.max(normalizePointValue(outer.x), normalizePointValue(inner.x));
  const minY = Math.min(normalizePointValue(top.y), normalizePointValue(bottom.y));
  const maxY = Math.max(normalizePointValue(top.y), normalizePointValue(bottom.y));
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const centerX = minX + (width / 2);
  const centerY = minY + (height / 2);

  return {
    horizontal: (Math.abs(iris.x - centerX) / width) * 2,
    vertical: (Math.abs(iris.y - centerY) / height) * 2,
  };
}

function getIrisCenter(landmarks = [], indices = []) {
  const points = indices
    .map((index) => landmarks[index])
    .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));

  if (!points.length) return null;

  return points.reduce((center, point) => ({
    x: center.x + (normalizePointValue(point.x) / points.length),
    y: center.y + (normalizePointValue(point.y) / points.length),
  }), {
    x: 0,
    y: 0,
  });
}

function getPrimaryBlendshapes(result = {}) {
  const groups = Array.isArray(result.faceBlendshapes) ? result.faceBlendshapes : [];
  const categories = groups[0]?.categories;
  return Array.isArray(categories) ? categories : null;
}

function getBlendshapeGazeOffset(categories = null) {
  if (!Array.isArray(categories)) return 0;

  const gazeScores = categories
    .filter((category) => /eyeLook(?:In|Out|Up|Down)/i.test(category?.categoryName || category?.displayName || ''))
    .map((category) => Number(category.score))
    .filter((score) => Number.isFinite(score));

  if (!gazeScores.length) return 0;
  return Math.max(...gazeScores);
}
