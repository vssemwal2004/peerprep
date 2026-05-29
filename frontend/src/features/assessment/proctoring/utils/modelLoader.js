// AI Proctoring placeholder - implementation will be added in later steps.
const MEDIAPIPE_VERSION = '0.10.35';
const VISION_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

let visionFilesetPromise = null;
let mediaPipeTasksVisionPromise = null;
let cocoSsdPromise = null;
let tfjsPromise = null;

async function loadMediaPipeTasksVision() {
  if (!mediaPipeTasksVisionPromise) {
    mediaPipeTasksVisionPromise = import('@mediapipe/tasks-vision');
  }
  return mediaPipeTasksVisionPromise;
}

async function loadTensorFlow() {
  if (!tfjsPromise) {
    tfjsPromise = import('@tensorflow/tfjs');
  }
  return tfjsPromise;
}

async function loadCocoSsdPackage() {
  if (!cocoSsdPromise) {
    cocoSsdPromise = import('@tensorflow-models/coco-ssd');
  }
  return cocoSsdPromise;
}

export async function loadMediaPipeVisionFiles() {
  if (!visionFilesetPromise) {
    const { FilesetResolver } = await loadMediaPipeTasksVision();
    visionFilesetPromise = FilesetResolver.forVisionTasks(VISION_WASM_BASE_URL);
  }
  return visionFilesetPromise;
}

export async function createFaceLandmarker(options = {}) {
  const { FaceLandmarker } = await loadMediaPipeTasksVision();
  const vision = await loadMediaPipeVisionFiles();
  const createOptions = {
    baseOptions: {
      modelAssetPath: options.modelAssetPath || FACE_LANDMARKER_MODEL_URL,
      delegate: options.delegate || 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: Math.max(1, Math.min(2, Number(options.numFaces || 2))),
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, createOptions);
  } catch (error) {
    if (createOptions.baseOptions.delegate === 'CPU') throw error;
    return FaceLandmarker.createFromOptions(vision, {
      ...createOptions,
      baseOptions: {
        ...createOptions.baseOptions,
        delegate: 'CPU',
      },
    });
  }
}

export async function createCocoSsdModel(options = {}) {
  const tf = await loadTensorFlow();
  await tf.ready?.();
  const cocoSsd = await loadCocoSsdPackage();
  const loadOptions = {
    base: options.base || 'lite_mobilenet_v2',
  };
  if (options.modelUrl) loadOptions.modelUrl = options.modelUrl;
  return cocoSsd.load(loadOptions);
}

export const modelLoader = {
  loadMediaPipeVisionFiles,
  createFaceLandmarker,
  createCocoSsdModel,
};
