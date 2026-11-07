// Main-thread side of the inference workers. Each model gets its own worker: the first object
// inference (WebGL shader compile) can keep a worker busy for minutes on weak graphics, and face
// samples must not queue behind it. Proxy adapters plug into FaceDetector / ObjectDetector like
// the in-page adapters.
import { createUnknownFrameResult } from '../adapters/mediapipeAdapter';
import { createDefaultObjectResult } from '../adapters/cocoSsdAdapter';

// Longer than the model loader's in-worker limit (180 s): a slow model is not a broken worker.
const INIT_TIMEOUT_MS = 200000;
const DETECT_TIMEOUT_MS = 15000;
// The first samples include GPU/shader warm-up inside the worker. That is slow but harmless to the
// page, so only a worker that stays silent far longer than that counts as hung.
const WARMUP_DETECT_TIMEOUT_MS = 150000;
const WARMUP_SAMPLES = 3;

const clients = { face: null, object: null };
let disabled = false;

export function isInferenceWorkerSupported() {
  return !disabled
    && typeof Worker !== 'undefined'
    && typeof createImageBitmap === 'function'
    && typeof OffscreenCanvas !== 'undefined';
}

// Called when the workers cannot be used on this device; everything falls back to the page thread.
export function disableInferenceWorker() {
  disabled = true;
  Object.values(clients).forEach((client) => client?.terminate());
}

function workerError(message, infrastructure) {
  const error = new Error(message);
  error.isWorkerError = Boolean(infrastructure);
  return error;
}

class InferenceWorkerClient {
  constructor(kind) {
    this.kind = kind;
    this.worker = new Worker(new URL('./inferenceWorker.js', import.meta.url), { type: 'module' });
    this.nextId = 1;
    this.pending = new Map();
    this.claimed = false;
    this.dead = false;

    this.worker.onmessage = (event) => {
      const message = event.data || {};
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message);
      else entry.reject(workerError(message.error || 'Inference worker error', false));
    };
    this.worker.onerror = (event) => this.fail(workerError(event?.message || 'Inference worker crashed', true));
    this.worker.onmessageerror = () => this.fail(workerError('Inference worker message failed', true));
  }

  request(message, { transfer = [], timeoutMs = DETECT_TIMEOUT_MS, infraOnTimeout = true } = {}) {
    if (this.dead) return Promise.reject(workerError('Inference worker is not running', true));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(workerError(`Inference worker request timed out (${message.type})`, infraOnTimeout));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ ...message, id }, transfer);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(workerError(error?.message || 'Could not reach the inference worker', true));
      }
    });
  }

  fail(error) {
    if (this.dead) return;
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    this.pending.clear();
    this.terminate();
  }

  terminate() {
    this.dead = true;
    try {
      this.worker.terminate();
    } catch {
      // Already gone.
    }
    if (clients[this.kind] === this) clients[this.kind] = null;
  }
}

function getClient(kind) {
  if (!clients[kind] || clients[kind].dead) clients[kind] = new InferenceWorkerClient(kind);
  return clients[kind];
}

// Starts loading a model inside its worker. Used by the instructions-screen warm-up; the real
// adapter's load() later joins the same in-flight or finished load.
export function warmUpWorkerModel(kind) {
  if (!isInferenceWorkerSupported()) return Promise.resolve(null);
  // Same options the real adapter sends, or the worker would reload the model.
  const options = kind === 'face' ? new WorkerFaceAdapter().options : new WorkerObjectAdapter().options;
  return getClient(kind)
    .request({ type: 'init', kind, options }, { timeoutMs: INIT_TIMEOUT_MS, infraOnTimeout: false })
    .catch(() => null);
}

// Drops warmed workers nobody claimed (e.g. the student left before the test started).
export function releaseUnclaimedWorker() {
  Object.values(clients).forEach((client) => {
    if (client && !client.claimed) client.terminate();
  });
}

class WorkerAdapterBase {
  constructor(kind, options = {}) {
    this.kind = kind;
    this.options = options;
    this.client = null;
    this.loaded = false;
    this.disposed = false;
    this.backend = 'unknown';
    this.lastInferenceMs = 0;
    this.samples = 0;
  }

  async sample(message, bitmap) {
    const reply = await this.client.request(message, {
      transfer: [bitmap],
      timeoutMs: this.samples < WARMUP_SAMPLES ? WARMUP_DETECT_TIMEOUT_MS : DETECT_TIMEOUT_MS,
    });
    this.samples += 1;
    return reply;
  }

  async load() {
    if (this.loaded) return this;
    const client = getClient(this.kind);
    this.client = client;
    client.claimed = true;
    try {
      const reply = await client.request(
        { type: 'init', kind: this.kind, options: this.options },
        { timeoutMs: INIT_TIMEOUT_MS, infraOnTimeout: false },
      );
      if (this.disposed) return this;
      this.backend = reply.backend || 'unknown';
      this.loaded = true;
      return this;
    } catch (error) {
      // Anything other than a model download/timeout problem means the worker itself cannot run
      // here (module worker, WASM glue, OffscreenCanvas): flag it so the caller uses the page thread.
      if (!error.isWorkerError && !/timed out|fetch|network|404|Failed to load/i.test(error?.message || '')) {
        error.isWorkerError = true;
      }
      throw error;
    }
  }

  dispose() {
    this.disposed = true;
    this.loaded = false;
    const client = this.client;
    this.client = null;
    // The worker exists only for this model, so ending the worker also frees the model.
    if (client) client.terminate();
  }
}

function frameReady(video) {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
}

export class WorkerFaceAdapter extends WorkerAdapterBase {
  constructor(options = {}) {
    super('face', { numFaces: 2, ...options, outputFaceBlendshapes: options.outputFaceBlendshapes === true });
    this.pendingLuma = null;
  }

  async detect(videoElement, timestamp = Date.now()) {
    if (!this.loaded || !this.client || !frameReady(videoElement)) return createUnknownFrameResult();
    const bitmap = await createImageBitmap(videoElement);
    const reply = await this.sample({ type: 'face', bitmap, timestamp, wantLuma: true }, bitmap);
    this.pendingLuma = reply.luma || null;
    return reply.result;
  }

  // The integrity thumbnail of the frame behind the latest face result; handed out once so the
  // same frame is never compared with itself.
  takeLuma() {
    const luma = this.pendingLuma;
    this.pendingLuma = null;
    return luma;
  }
}

export class WorkerObjectAdapter extends WorkerAdapterBase {
  constructor(options = {}) {
    super('object', options);
  }

  async detect(videoElement, scanOptions = {}) {
    if (!this.loaded || !this.client || !frameReady(videoElement)) return createDefaultObjectResult('video_not_ready');
    const bitmap = await createImageBitmap(videoElement);
    const reply = await this.sample({ type: 'object', bitmap, scanOptions }, bitmap);
    this.backend = reply.backend || this.backend;
    this.lastInferenceMs = Number(reply.lastInferenceMs || 0);
    return reply.result;
  }
}
