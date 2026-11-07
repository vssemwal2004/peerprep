// Runs the AI proctoring models off the main thread. The page transfers one ImageBitmap per
// sample; this worker returns the same plain result objects the main-thread adapters produce, so
// the manager's rules and violation buffer are unchanged.
import { MediaPipeFaceAdapter } from '../adapters/mediapipeAdapter';
import { CocoSsdAdapter } from '../adapters/cocoSsdAdapter';
import { createWorkerFrame } from '../utils/frameSource';
import { INTEGRITY_SAMPLE_HEIGHT, INTEGRITY_SAMPLE_WIDTH, lumaFromImageData } from '../utils/cameraIntegrity';

const slots = { face: null, object: null };
let lumaContext = null;

// Thumbnail for the camera-integrity check, taken from the frame already sent for face detection
// so the page never has to read pixels back from the GPU itself.
function readLuma(bitmap) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    if (!lumaContext) {
      lumaContext = new OffscreenCanvas(INTEGRITY_SAMPLE_WIDTH, INTEGRITY_SAMPLE_HEIGHT)
        .getContext('2d', { willReadFrequently: true });
    }
    lumaContext.drawImage(bitmap, 0, 0, INTEGRITY_SAMPLE_WIDTH, INTEGRITY_SAMPLE_HEIGHT);
    return lumaFromImageData(lumaContext.getImageData(0, 0, INTEGRITY_SAMPLE_WIDTH, INTEGRITY_SAMPLE_HEIGHT).data);
  } catch {
    return null;
  }
}

function sameOptions(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

// Idempotent: a model warmed earlier is reused instead of loaded twice.
function initSlot(kind, options) {
  const existing = slots[kind];
  if (existing && sameOptions(existing.options, options)) return existing.ready;
  existing?.adapter.dispose?.();
  const adapter = kind === 'face' ? new MediaPipeFaceAdapter(options) : new CocoSsdAdapter(options);
  const slot = { options, adapter, ready: null };
  slot.ready = adapter.load().then(() => ({ backend: adapter.backend || null }));
  slot.ready.catch(() => {
    if (slots[kind] === slot) slots[kind] = null;
  });
  slots[kind] = slot;
  return slot.ready;
}

async function handle(data) {
  switch (data.type) {
    case 'init':
      return initSlot(data.kind, data.options);
    case 'face': {
      const slot = slots.face;
      if (!slot) throw new Error('Face model is not loaded in the worker');
      await slot.ready;
      const result = slot.adapter.detect(createWorkerFrame(data.bitmap), data.timestamp);
      return { result, luma: data.wantLuma ? readLuma(data.bitmap) : null };
    }
    case 'object': {
      const slot = slots.object;
      if (!slot) throw new Error('Object model is not loaded in the worker');
      await slot.ready;
      const result = await slot.adapter.detect(createWorkerFrame(data.bitmap), data.scanOptions || {});
      return { result, backend: slot.adapter.backend, lastInferenceMs: slot.adapter.lastInferenceMs };
    }
    case 'dispose': {
      slots[data.kind]?.adapter.dispose?.();
      slots[data.kind] = null;
      return {};
    }
    default:
      throw new Error(`Unknown worker message: ${data.type}`);
  }
}

self.onmessage = async (event) => {
  const data = event.data || {};
  try {
    const payload = await handle(data);
    self.postMessage({ id: data.id, ok: true, ...(payload || {}) });
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: String(error?.message || error) });
  } finally {
    data.bitmap?.close?.();
  }
};
