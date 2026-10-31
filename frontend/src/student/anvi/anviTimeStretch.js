// ANVI's speaking speed: cached clips are time-stretched once, in the browser, with WSOLA (waveform
// similarity overlap-add), so the voice gets faster or slower without changing its pitch. An AudioBufferSource
// playbackRate would shift the pitch, and asking the TTS model for another pace would mean new audio.

export const SPEECH_RATE = Object.freeze({ min: 0.85, max: 1.2, step: 0.05, default: 1 });
const FRAME_SECONDS = 0.03;
const SEARCH_SECONDS = 0.01;

/** A speaking speed within SPEECH_RATE, else 1. */
export const speechRateOf = (value) => {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= SPEECH_RATE.min && rate <= SPEECH_RATE.max ? rate : SPEECH_RATE.default;
};

/**
 * Mono Float32 samples played `rate` times as fast with the same pitch (rate 1.1 = 10% faster, shorter).
 * Each 30 ms frame is taken from near its nominal input position, at the offset (within +-10 ms) that best
 * continues the previous frame, and Hann-windowed frames at 50% overlap are added together. Returns the
 * input itself for a rate of 1 or a clip too short to stretch.
 */
export function timeStretch(input, rate, sampleRate = 24000) {
  const speed = speechRateOf(rate);
  const frame = Math.max(64, Math.round(sampleRate * FRAME_SECONDS) & ~1);
  if (Math.abs(speed - 1) < 0.001 || !input || input.length < frame * 4) return input;
  const hop = frame >> 1;
  const search = Math.round(sampleRate * SEARCH_SECONDS);
  const window = new Float32Array(frame);
  for (let i = 0; i < frame; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);
  const inputHop = hop * speed;
  const frames = Math.max(1, Math.floor((input.length - frame - search) / inputHop));
  const out = new Float32Array(frames * hop + frame);
  let previous = 0;
  for (let k = 0; k < frames; k += 1) {
    const nominal = Math.round(k * inputHop);
    let start = nominal;
    if (k > 0) {
      // The input the previous frame would naturally continue into; pick the candidate most like it.
      const target = previous + hop;
      let best = -Infinity;
      for (let offset = -search; offset <= search; offset += 1) {
        const candidate = nominal + offset;
        if (candidate < 0 || candidate + frame > input.length || target + hop > input.length) continue;
        let score = 0;
        for (let j = 0; j < hop; j += 2) score += input[candidate + j] * input[target + j];
        if (score > best) {
          best = score;
          start = candidate;
        }
      }
    }
    const at = k * hop;
    for (let j = 0; j < frame; j += 1) out[at + j] += input[start + j] * window[j];
    previous = start;
  }
  return out;
}
