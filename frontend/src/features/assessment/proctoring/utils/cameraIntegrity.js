// Cheap, in-browser evidence that the camera feed is not a real live webcam.
// Two independent signals, both advisory (warning-only server side):
//  1. the device label names a known virtual-camera tool;
//  2. the feed delivers new frames whose pixels never change (a still image
//     behind a virtual camera). A real sensor always has noise and micro-motion.
// Neither is proof: labels can be renamed and a looped video defeats (2).
export const CAMERA_SPOOF_REASONS = Object.freeze({
  VIRTUAL_DEVICE: 'virtual_device_label',
  STATIC_FEED: 'static_feed',
});

// Tools that only ever produce synthetic video. Phone-as-webcam apps (DroidCam,
// Iriun, EpocCam) and vendor filters (NVIDIA Broadcast, Logi) are deliberately
// absent: they relay a real camera and would be false positives.
const VIRTUAL_CAMERA_LABEL = /\b(obs[\s-]*(virtual|studio)|obs\s*cam|manycam|snap\s*camera|xsplit|vcam|splitcam|streamlabs|vmix|v4l2\s*loopback|loopback|fake\s*cam|virtual\s*(cam|web))/i;

const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;
// Mean absolute luma change per pixel (0-255) between consecutive new frames.
// Averaging 424x240 down to 32x18 leaves roughly 0.2-0.3 of sensor noise on a
// real webcam; a still image behind a virtual camera is exactly 0.
export const STATIC_FEED_MAX_DIFF = 0.06;
// Consecutive fresh samples (~0.5 s apart) that must all stay static.
export const STATIC_FEED_WINDOW = 40;
const MAX_LABEL_LENGTH = 80;

export function matchVirtualCameraLabel(label) {
  const text = String(label || '').trim();
  return text && VIRTUAL_CAMERA_LABEL.test(text) ? text.slice(0, MAX_LABEL_LENGTH) : null;
}

export function getTrackLabel(stream) {
  const track = stream?.getVideoTracks?.()[0];
  return String(track?.label || '').trim().slice(0, MAX_LABEL_LENGTH);
}

function totalFrames(video) {
  const quality = video?.getVideoPlaybackQuality?.();
  const total = Number(quality?.totalVideoFrames);
  return Number.isFinite(total) ? total : null;
}

// One monitor per camera stream. evaluate() is called from the detection tick;
// it draws a 32x18 thumbnail (well under 1 ms) and never allocates per call.
export class CameraIntegrityMonitor {
  constructor(options = {}) {
    this.maxDiff = options.maxDiff ?? STATIC_FEED_MAX_DIFF;
    this.window = options.window ?? STATIC_FEED_WINDOW;
    this.createCanvas = options.createCanvas || (() => (typeof document !== 'undefined' ? document.createElement('canvas') : null));
    this.canvas = null;
    this.context = null;
    this.reset();
  }

  reset() {
    this.previous = null;
    this.lastFrameCount = null;
    this.staticRun = 0;
    this.lastDiff = null;
  }

  readLuma(video) {
    if (!this.canvas) {
      this.canvas = this.createCanvas();
      if (this.canvas) {
        this.canvas.width = SAMPLE_WIDTH;
        this.canvas.height = SAMPLE_HEIGHT;
        this.context = this.canvas.getContext?.('2d', { willReadFrequently: true }) || null;
      }
    }
    if (!this.context) return null;
    this.context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const { data } = this.context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const luma = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      luma[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    return luma;
  }

  // Returns { fresh, suspected, reason, label, diff }. `fresh` is false when the
  // sample says nothing (hidden tab, no new frame, unreadable canvas), so the
  // rule neither raises nor clears an episode on it.
  evaluate(stream, video, { staticCheck = true } = {}) {
    const label = getTrackLabel(stream);
    const virtualLabel = matchVirtualCameraLabel(label);
    if (virtualLabel) {
      return { fresh: true, suspected: true, reason: CAMERA_SPOOF_REASONS.VIRTUAL_DEVICE, label: virtualLabel, diff: null };
    }
    const quiet = { fresh: false, suspected: false, reason: null, label, diff: this.lastDiff };
    if (!staticCheck || !video || (typeof document !== 'undefined' && document.hidden)) return quiet;

    // A frozen element repeats its last frame; only count frames the camera delivered.
    const frames = totalFrames(video);
    if (frames !== null) {
      if (frames === this.lastFrameCount) return quiet;
      this.lastFrameCount = frames;
    }

    let luma;
    try {
      luma = this.readLuma(video);
    } catch {
      return quiet;
    }
    if (!luma) return quiet;

    const previous = this.previous;
    this.previous = luma;
    if (!previous) return quiet;

    let sum = 0;
    for (let i = 0; i < luma.length; i += 1) sum += Math.abs(luma[i] - previous[i]);
    const diff = sum / luma.length;
    this.lastDiff = diff;
    this.staticRun = diff <= this.maxDiff ? this.staticRun + 1 : 0;

    const suspected = this.staticRun >= this.window;
    return {
      fresh: true,
      suspected,
      reason: suspected ? CAMERA_SPOOF_REASONS.STATIC_FEED : null,
      label,
      diff,
    };
  }
}
