import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEECH_RATE, speechRateOf, timeStretch } from "../src/student/anvi/anviTimeStretch.js";

const RATE = 24000;
const tone = (hz, seconds = 2) => Float32Array.from({ length: RATE * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE));
// Upward zero crossings per second: the pitch of a pure tone.
const pitchOf = (samples, from = 0.2, to = 0.8) => {
  const start = Math.floor(samples.length * from), end = Math.floor(samples.length * to);
  let crossings = 0;
  for (let i = start + 1; i < end; i += 1) if (samples[i - 1] < 0 && samples[i] >= 0) crossings += 1;
  return crossings / ((end - start) / RATE);
};

test("timeStretch changes the length by the speed and keeps the pitch", () => {
  const input = tone(220);
  for (const rate of [0.85, 0.9, 1.1, 1.2]) {
    const out = timeStretch(input, rate, RATE);
    const seconds = out.length / RATE;
    assert.ok(Math.abs(seconds - 2 / rate) < 0.06, `${rate}x lasts ${seconds.toFixed(3)} s, not ${(2 / rate).toFixed(3)} s`);
    assert.ok(Math.abs(pitchOf(out) - 220) < 6, `${rate}x keeps 220 Hz (got ${pitchOf(out).toFixed(1)})`);
    const peak = out.slice(RATE * 0.2, RATE * 0.8).reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(peak > 0.4 && peak < 0.6, `${rate}x keeps the level (peak ${peak.toFixed(2)})`);
  }
});

test("timeStretch leaves normal speed, short clips and bad rates alone", () => {
  const input = tone(220);
  assert.equal(timeStretch(input, 1, RATE), input);
  const short = tone(220, 0.05);
  assert.equal(timeStretch(short, 1.2, RATE), short);
  assert.equal(timeStretch(input, "fast", RATE), input, "an invalid rate is normal speed");
  assert.equal(speechRateOf(3), 1);
  assert.equal(speechRateOf(0.85), 0.85);
  assert.deepEqual([SPEECH_RATE.min, SPEECH_RATE.max], [0.85, 1.2]);
});
