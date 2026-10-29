import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeLoudness, parseWav, pcmDurationMs, trimSilence, voicedStats, wpm, wrapWav } from "../src/modules/anviInterview/anviInterview.wav.js";

const RATE = 24000;
// Mono s16le PCM: [ms, amplitude] spans of a 220 Hz tone (amplitude 0 is silence).
function pcmOf(spans, rate = RATE) {
  const samples = spans.reduce((sum, [ms]) => sum + Math.round((ms * rate) / 1000), 0);
  const buf = Buffer.alloc(samples * 2);
  let i = 0;
  for (const [ms, amplitude] of spans) {
    const count = Math.round((ms * rate) / 1000);
    for (let k = 0; k < count; k += 1, i += 1) buf.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / rate)), i * 2);
  }
  return buf;
}

test("wrapWav and parseWav round-trip mono 24 kHz s16le", () => {
  const pcm = pcmOf([[500, 8000]]);
  const wav = wrapWav(pcm);
  assert.equal(wav.length, pcm.length + 44);
  const parsed = parseWav(wav);
  assert.equal(parsed.sampleRate, RATE);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.size, wav.length);
  assert.equal(parsed.durationMs, 500);
  assert.ok(parsed.pcm.equals(pcm));
  assert.equal(pcmDurationMs(pcm), 500);
  assert.throws(() => wrapWav(Buffer.alloc(3)), { code: "WAV_ODD_LENGTH" });
  assert.throws(() => parseWav(Buffer.from("not a wav file at all")), { code: "WAV_INVALID" });
  assert.throws(() => parseWav(wrapWav(pcm, { sampleRate: 16000 })), { code: "WAV_INVALID" });
  assert.equal(parseWav(wrapWav(pcm, { sampleRate: 16000 }), { sampleRate: null }).sampleRate, 16000);
  assert.throws(() => parseWav(wav, { maxBytes: 100 }), { code: "WAV_TOO_LARGE" });
  const stereo = wrapWav(pcm);
  stereo.writeUInt16LE(2, 22);
  assert.throws(() => parseWav(stereo), { code: "WAV_INVALID" });
});

test("voicedStats gates on RMS and wpm uses the first-to-last voiced span", () => {
  const pcm = pcmOf([[1000, 0], [6000, 6000], [1000, 50], [2000, 6000], [500, 0]]);
  const stats = voicedStats(pcm);
  assert.equal(stats.totalMs, 10500);
  assert.equal(stats.startMs, 1000);
  assert.equal(stats.endMs, 10000);
  assert.equal(stats.trimmedMs, 9000);
  assert.equal(stats.voicedMs, 8000);
  assert.ok(stats.peak >= 5990 && stats.peak <= 6000);
  // 15 words over 9 s of speech: 100 wpm.
  assert.equal(wpm("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen", pcm), 100);
  assert.equal(wpm("", pcm), null);
  assert.equal(wpm("words", Buffer.alloc(4800)), null);
  // A 16 kHz student segment with a lower gate.
  assert.equal(voicedStats(pcmOf([[700, 1200]], 16000), { sampleRate: 16000, threshold: 819 }).voicedMs, 700);
});

// The WP0 Flash-Lite TTS probe clip (a local file, not in the repo): ANVI_TTS_PROBE_WAV=<path to lite_aoede_en15.wav>.
test("the pace probe sample measures about 41 wpm", (t) => {
  const file = process.env.ANVI_TTS_PROBE_WAV || "";
  if (!file || !existsSync(file)) {
    t.skip("set ANVI_TTS_PROBE_WAV to the probe sample to run this check");
    return;
  }
  const { pcm } = parseWav(readFileSync(file));
  const pace = wpm("Can you explain how hash maps handle collisions and what that does to lookup time?", pcm);
  assert.ok(pace >= 40 && pace <= 42, String(pace));
});

test("a synthetic slow clip (15 words over 22 s) also measures about 41 wpm", () => {
  const pcm = pcmOf([[300, 0], [21940, 5000], [200, 0]]);
  assert.equal(wpm("a b c d e f g h i j k l m n o", pcm), 41);
});

test("trimSilence cuts edges longer than 120 ms and keeps short ones", () => {
  const pcm = pcmOf([[800, 0], [1000, 6000], [600, 0]]);
  const trimmed = trimSilence(pcm);
  const stats = voicedStats(trimmed);
  assert.equal(stats.startMs, 60);
  assert.equal(stats.totalMs, 1120);
  const short = pcmOf([[100, 0], [1000, 6000], [100, 0]]);
  assert.equal(trimSilence(short).length, short.length);
  const silent = Buffer.alloc(9600);
  assert.equal(trimSilence(silent).length, silent.length);
});

test("normalizeLoudness reaches the target RMS within the gain and peak limits", () => {
  const quiet = pcmOf([[1000, 2000]]);
  const louder = normalizeLoudness(quiet, -20);
  const targetRms = 32767 * 10 ** (-20 / 20);
  assert.ok(Math.abs(voicedStats(louder).rms - targetRms) / targetRms < 0.02);
  assert.notEqual(louder, quiet);
  // Gain is capped (12 dB by default) and the peak stays under 95% of full scale.
  const veryQuiet = pcmOf([[1000, 1000]]);
  const capped = voicedStats(normalizeLoudness(veryQuiet, -10)).peak;
  assert.ok(capped > 3900 && capped <= Math.ceil(1000 * 10 ** (12 / 20)) + 1, String(capped));
  assert.ok(voicedStats(normalizeLoudness(pcmOf([[1000, 20000]]), -3)).peak <= 32767 * 0.95 + 1);
  // Silence is copied unchanged.
  const silent = Buffer.alloc(4800);
  assert.ok(normalizeLoudness(silent, -20).equals(silent));
});
