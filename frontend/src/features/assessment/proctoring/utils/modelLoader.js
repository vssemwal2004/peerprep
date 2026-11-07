const MEDIAPIPE_VERSION = '0.10.35';
const DEFAULT_VISION_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_FACE_LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
// Models load off the UI thread (worker) and ahead of the test, so a slow network may take longer
// than the old 15 s before we give up on it.
// The first COCO-SSD inference (WebGL shader compile) is part of load() and measured ~120 s on a
// software-GL machine, so the worker, where that cannot freeze the page, gets a much longer limit.
const IN_WORKER = typeof document === 'undefined';
const MODEL_LOAD_TIMEOUT_MS = Number(import.meta.env.VITE_PROCTORING_MODEL_TIMEOUT_MS || (IN_WORKER ? 180000 : 45000));
// COCO-SSD weights: mobilenet_v2 is 64 MB, mobilenet_v1 26 MB, lite_mobilenet_v2 17 MB (measured
// from the tfjs-models bucket). The 64 MB default took ~90 s on a 5 Mbit link and was re-downloaded
// on every retry. Set VITE_COCO_SSD_BASE=mobilenet_v2 to restore the heavier, more accurate model.
const DEFAULT_COCO_SSD_BASE = 'lite_mobilenet_v2';

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

// MediaPipe loads its WASM glue with importScripts() (classic worker) or a <script> tag (page).
// A module worker, which our bundler needs for code-splitting, has an importScripts() that
// throws, and MediaPipe then falls back to import(), which cannot publish the classic-script
// glue as a global. MediaPipe honours a `self.import` hook for exactly this case: fetch the glue
// and evaluate it in the global scope so `self.ModuleFactory` ends up defined.
function installModuleWorkerLoaderShim() {
  if (typeof document !== 'undefined' || typeof globalThis.import === 'function') return;
  globalThis.import = async (url) => {
    const response = await fetch(String(url));
    if (!response.ok) throw new Error(`MediaPipe loader fetch failed (${response.status})`);
    (0, eval)(await response.text());
  };
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
          const fileset = await withModelLoadTimeout(
            FilesetResolver.forVisionTasks(wasmBaseUrl),
            'MediaPipe WASM',
          );
          installModuleWorkerLoaderShim();
          return fileset;
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

// Warm-up: the AI models are the heaviest thing the attempt page does (downloads, WASM compile,
// WebGL shader compile on the first inference). Doing that at the moment the test opens froze
// weak laptops exactly when the student needs to read and answer. The warm-up runs during the
// instructions screen instead, one model at a time, and the finished model is handed over (once)
// to the detector that asks for it, so nothing is loaded twice.
let warmupStarted = false;
let warmFacePromise = null;
let warmCocoPromise = null;

function nextIdle() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      setTimeout(resolve, 250);
    }
  });
}

async function takeWarmModel(promiseRef) {
  if (!promiseRef) return null;
  try {
    return (await promiseRef) || null;
  } catch {
    return null;
  }
}

function isDefaultFaceOptions(options = {}) {
  return !options.modelAssetPath && !options.delegate && options.outputFaceBlendshapes !== true
    && Number(options.numFaces || 2) === 2;
}

async function warmUpCocoInference(model) {
  if (typeof document === 'undefined' || typeof model?.detect !== 'function') return;
  // Same input size the adapter feeds the model (640x480 camera scaled to 320 wide), so the
  // WebGL programs compiled here are the ones the live frames reuse.
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  try {
    await model.detect(canvas, 1, 0.9);
  } catch {
    // A failed warm-up inference only means shaders compile on the first live frame.
  }
}

export function warmUpProctoringModels({ face = true, object = true } = {}) {
  if (warmupStarted || typeof window === 'undefined') return;
  warmupStarted = true;
  void (async () => {
    await nextIdle();
    if (face) {
      warmFacePromise = buildFaceLandmarker({ numFaces: 2, outputFaceBlendshapes: false });
      warmFacePromise.catch(() => {});
      await takeWarmModel(warmFacePromise);
      await nextIdle();
    }
    if (object) {
      warmCocoPromise = createCocoSsdModel({ skipWarm: true }).then(async (model) => {
        await warmUpCocoInference(model);
        return model;
      });
      warmCocoPromise.catch(() => {});
      await takeWarmModel(warmCocoPromise);
    }
  })();
}

export async function createFaceLandmarker(options = {}) {
  if (warmFacePromise && isDefaultFaceOptions(options)) {
    const pending = warmFacePromise;
    warmFacePromise = null;
    const warmed = await takeWarmModel(pending);
    if (warmed) return warmed;
  }
  return buildFaceLandmarker(options);
}

async function buildFaceLandmarker(options = {}) {
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
  if (!options.skipWarm && warmCocoPromise) {
    const pending = warmCocoPromise;
    warmCocoPromise = null;
    const warmed = await takeWarmModel(pending);
    if (warmed) return warmed;
  }
  const tf = await loadTensorFlow();
  const backend = await selectTensorFlowBackend(tf);
  const cocoSsd = await loadCocoSsdPackage();
  // Custom URLs first, then the package default ('') once. The old list repeated the same
  // default load for every empty entry, tripling a failing 64 MB download.
  const modelUrls = [...new Set([options.modelUrl, import.meta.env.VITE_COCO_SSD_MODEL_URL, ''].filter((url) => url !== undefined && url !== null))];
  let lastError = null;

  for (const modelUrl of modelUrls) {
    const loadOptions = {
      base: options.base || import.meta.env.VITE_COCO_SSD_BASE || DEFAULT_COCO_SSD_BASE,
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
  warmUpProctoringModels,
  loadMediaPipeVisionFiles,
  createFaceLandmarker,
  createCocoSsdModel,
};
