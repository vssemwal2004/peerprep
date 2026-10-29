const MEDIAPIPE_VERSION = '0.10.35';
const DEFAULT_VISION_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_FACE_LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const MODEL_LOAD_TIMEOUT_MS = Number(import.meta.env.VITE_PROCTORING_MODEL_TIMEOUT_MS || 15000);

const VISION_WASM_BASE_URLS = [
  import.meta.env.VITE_MEDIAPIPE_WASM_BASE_URL,
  DEFAULT_VISION_WASM_BASE_URL,
  `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
].filter(Boolean);

const FACE_LANDMARKER_MODEL_URLS = [
  import.meta.env.VITE_FACE_LANDMARKER_MODEL_URL,
  DEFAULT_FACE_LANDMARKER_MODEL_URL,
].filter(Boolean);

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

async function withModelLoadTimeout(promise, label) {
  if (!MODEL_LOAD_TIMEOUT_MS || MODEL_LOAD_TIMEOUT_MS <= 0) return promise;

  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} model load timed out`)), MODEL_LOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadMediaPipeVisionFiles() {
  if (!visionFilesetPromise) {
    const loadPromise = (async () => {
      const { FilesetResolver } = await loadMediaPipeTasksVision();
      let lastError = null;

      for (const wasmBaseUrl of VISION_WASM_BASE_URLS) {
        try {
          return await withModelLoadTimeout(
            FilesetResolver.forVisionTasks(wasmBaseUrl),
            'MediaPipe WASM',
          );
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('MediaPipe WASM files failed to load.');
    })();
    visionFilesetPromise = loadPromise.catch((error) => {
      visionFilesetPromise = null;
      throw error;
    });
  }
  return visionFilesetPromise;
}

export async function createFaceLandmarker(options = {}) {
  const { FaceLandmarker } = await loadMediaPipeTasksVision();
  const vision = await loadMediaPipeVisionFiles();
  const modelUrls = [
    options.modelAssetPath,
    ...FACE_LANDMARKER_MODEL_URLS,
  ].filter(Boolean);
  let lastError = null;

  for (const modelAssetPath of modelUrls) {
    const createOptions = {
      baseOptions: {
        modelAssetPath,
        delegate: options.delegate || 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: Math.max(1, Math.min(2, Number(options.numFaces || 2))),
      // Blendshapes are only read by looking-away detection, and cost CPU.
      outputFaceBlendshapes: options.outputFaceBlendshapes === true,
      outputFacialTransformationMatrixes: false,
    };

    try {
      return await withModelLoadTimeout(
        FaceLandmarker.createFromOptions(vision, createOptions),
        'FaceLandmarker',
      );
    } catch (error) {
      lastError = error;
      if (createOptions.baseOptions.delegate !== 'CPU') {
        try {
          return await withModelLoadTimeout(
            FaceLandmarker.createFromOptions(vision, {
              ...createOptions,
              baseOptions: {
                ...createOptions.baseOptions,
                delegate: 'CPU',
              },
            }),
            'FaceLandmarker CPU',
          );
        } catch (cpuError) {
          lastError = cpuError;
        }
      }
    }
  }

  throw lastError || new Error('FaceLandmarker model failed to load.');
}

// Prefer WebGL; without it TF.js runs on the CPU backend, and callers reduce work.
async function selectTensorFlowBackend(tf) {
  let webglReady = false;
  try {
    webglReady = Boolean(await tf.setBackend?.('webgl'));
  } catch {
    webglReady = false;
  }
  if (!webglReady) {
    try {
      await tf.setBackend?.('cpu');
    } catch {
      // tf.ready() below picks whatever backend is available.
    }
  }
  await tf.ready?.();
  return tf.getBackend?.() || 'unknown';
}

export async function createCocoSsdModel(options = {}) {
  const tf = await loadTensorFlow();
  const backend = await selectTensorFlowBackend(tf);
  const cocoSsd = await loadCocoSsdPackage();
  const modelUrls = [
    options.modelUrl,
    import.meta.env.VITE_COCO_SSD_MODEL_URL,
    '',
  ];
  let lastError = null;

  for (const modelUrl of modelUrls) {
    const loadOptions = {
      base: options.base || import.meta.env.VITE_COCO_SSD_BASE || 'mobilenet_v2',
    };
    if (modelUrl) loadOptions.modelUrl = modelUrl;

    try {
      const model = await withModelLoadTimeout(cocoSsd.load(loadOptions), 'COCO-SSD');
      if (model && typeof model === 'object') model.peerprepBackend = backend;
      return model;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('COCO-SSD model failed to load.');
}

export const modelLoader = {
  loadMediaPipeVisionFiles,
  createFaceLandmarker,
  createCocoSsdModel,
};
