// The detectors read frames from a <video> on the main thread, or from an ImageBitmap that the
// main thread transferred to the inference worker. A worker frame is wrapped as
// { bitmap, videoWidth, videoHeight, readyState } so the same adapter code runs in both places.

export function unwrapFrame(frame) {
  return frame && frame.bitmap ? frame.bitmap : frame;
}

export function createWorkerFrame(bitmap) {
  return {
    bitmap,
    videoWidth: bitmap.width,
    videoHeight: bitmap.height,
    readyState: 4,
  };
}

// <canvas> on the main thread, OffscreenCanvas inside the worker.
export function createScratchCanvas(width = 1, height = 1) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  return null;
}
