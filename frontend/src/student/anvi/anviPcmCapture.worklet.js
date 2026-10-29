// AudioWorklet: microphone -> 16 kHz mono s16le frames of 100 ms (1600 samples, 3200 bytes).
// Loaded with audioWorklet.addModule(new URL(...)), so it must stay self-contained (no imports).
// The resampler is exported so it can be unit-tested outside the audio thread.

export const TARGET_RATE = 16000;
export const FRAME_SAMPLES = 1600;

// RBJ biquad low-pass; two in series give a 4th-order anti-alias filter below the 8 kHz Nyquist.
function lowPass(rate, cutoff, q) {
  const w = (2 * Math.PI * cutoff) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0,
    a1: (-2 * cos) / a0, a2: (1 - alpha) / a0,
    x1: 0, x2: 0, y1: 0, y2: 0,
  };
}

function runBiquad(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
}

/**
 * Streaming resampler to 16 kHz. Downsampling low-passes, then area-averages each output
 * interval (exact for 48 kHz -> 3:1, fractional edges for 44.1 kHz). Upsampling interpolates linearly.
 * `onFrame(Int16Array, rms)` receives each completed frame; the array is a fresh buffer it may transfer.
 */
export class PcmFramer {
  constructor(inputRate, onFrame, { targetRate = TARGET_RATE, frameSamples = FRAME_SAMPLES } = {}) {
    this.ratio = inputRate / targetRate;
    this.onFrame = onFrame;
    this.frameSamples = frameSamples;
    this.filters = this.ratio > 1 ? [lowPass(inputRate, targetRate * 0.45, 0.5412), lowPass(inputRate, targetRate * 0.45, 1.3066)] : [];
    this.acc = 0;
    this.filled = 0;
    this.prev = 0;
    this.phase = 0;
    this.frame = new Int16Array(frameSamples);
    this.length = 0;
    this.energy = 0;
  }

  emit(value) {
    const sample = value > 1 ? 1 : value < -1 ? -1 : value;
    this.frame[this.length++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    this.energy += sample * sample;
    if (this.length === this.frameSamples) {
      const frame = this.frame;
      const rms = Math.sqrt(this.energy / this.frameSamples);
      this.frame = new Int16Array(this.frameSamples);
      this.length = 0;
      this.energy = 0;
      this.onFrame(frame, rms);
    }
  }

  push(input) {
    const { ratio } = this;
    if (ratio === 1) {
      for (let i = 0; i < input.length; i += 1) this.emit(input[i]);
      return;
    }
    if (ratio < 1) {
      // Upsample: output k sits at input position k * ratio between `prev` and the current sample.
      for (let i = 0; i < input.length; i += 1) {
        const current = input[i];
        while (this.phase < 1) {
          this.emit(this.prev + (current - this.prev) * this.phase);
          this.phase += ratio;
        }
        this.phase -= 1;
        this.prev = current;
      }
      return;
    }
    const [first, second] = this.filters;
    for (let i = 0; i < input.length; i += 1) {
      const x = runBiquad(second, runBiquad(first, input[i]));
      const need = ratio - this.filled;
      if (need > 1) {
        this.acc += x;
        this.filled += 1;
      } else {
        this.acc += x * need;
        this.emit(this.acc / ratio);
        const rest = 1 - need;
        this.acc = x * rest;
        this.filled = rest;
      }
    }
  }
}

const Processor = globalThis.AudioWorkletProcessor;
if (Processor && typeof globalThis.registerProcessor === "function") {
  class AnviPcmCapture extends Processor {
    constructor() {
      super();
      this.framer = new PcmFramer(globalThis.sampleRate, (frame, rms) => {
        this.port.postMessage({ pcm: frame.buffer, rms }, [frame.buffer]);
      });
      this.active = true;
      this.port.onmessage = (event) => { if (event.data === "stop") this.active = false; };
    }

    process(inputs) {
      const channel = inputs[0]?.[0];
      // A disconnected or muted track delivers no channel; keep the processor alive until told to stop.
      if (channel) this.framer.push(channel);
      return this.active;
    }
  }
  globalThis.registerProcessor("anvi-pcm-capture", AnviPcmCapture);
}
