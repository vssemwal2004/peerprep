// WAV and PCM helpers for ANVI question audio (TTS output: mono, 24 kHz, 16-bit little-endian) and for
// the voiced-time checks on student segments (16 kHz). Pure: no I/O, and nothing here logs audio.

export const TTS_SAMPLE_RATE = 24000;
const HEADER_BYTES = 44;
// About -36 dBFS RMS over a 20 ms window, as in the TTS pace probe.
export const DEFAULT_VOICE_THRESHOLD = 500;
const WINDOW_MS = 20;

const wavError = (code, message) => Object.assign(new Error(message), { code });

function asBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw wavError("WAV_INVALID", "Expected PCM bytes");
}

/** A WAV file (44-byte RIFF header) around 16-bit mono PCM. */
export function wrapWav(pcm, { sampleRate = TTS_SAMPLE_RATE, channels = 1 } = {}) {
  const data = asBuffer(pcm);
  if (data.length % 2) throw wavError("WAV_ODD_LENGTH", "16-bit PCM must have an even byte length");
  const header = Buffer.alloc(HEADER_BYTES);
  const blockAlign = channels * 2;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Reads a PCM WAV: { sampleRate, channels, bitsPerSample, pcm, size, durationMs }. Only mono 16-bit PCM is
 * accepted, and `sampleRate` (default 24 kHz; null for any) must match. Throws `WAV_INVALID` otherwise.
 */
export function parseWav(file, { sampleRate = TTS_SAMPLE_RATE, maxBytes = Infinity } = {}) {
  const buf = asBuffer(file);
  if (buf.length > maxBytes) throw wavError("WAV_TOO_LARGE", "WAV is larger than allowed");
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw wavError("WAV_INVALID", "Not a RIFF/WAVE file");
  }
  let format = null;
  let pcm = null;
  for (let offset = 12; offset + 8 <= buf.length;) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(buf.length, start + size);
    if (id === "fmt " && size >= 16 && end - start >= 16) {
      format = {
        audioFormat: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bitsPerSample: buf.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      pcm = buf.subarray(start, end - ((end - start) % 2));
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!format || !pcm) throw wavError("WAV_INVALID", "WAV has no fmt or data chunk");
  if (format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    throw wavError("WAV_INVALID", "Only mono 16-bit PCM WAV is supported");
  }
  if (sampleRate && format.sampleRate !== sampleRate) throw wavError("WAV_INVALID", "Unexpected WAV sample rate");
  return {
    sampleRate: format.sampleRate,
    channels: 1,
    bitsPerSample: 16,
    pcm,
    size: buf.length,
    durationMs: Math.round((pcm.length / 2 / format.sampleRate) * 1000),
  };
}

const sampleCount = (pcm) => Math.floor(pcm.length / 2);

// RMS of each 20 ms window (int16 units).
function windowRms(pcm, sampleRate) {
  const samples = sampleCount(pcm);
  const size = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000));
  const out = [];
  for (let start = 0; start < samples; start += size) {
    const end = Math.min(samples, start + size);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      const x = pcm.readInt16LE(i * 2);
      sum += x * x;
    }
    out.push(Math.sqrt(sum / (end - start)));
  }
  return { rms: out, size };
}

/**
 * Voiced-time statistics of 16-bit mono PCM using an RMS gate over 20 ms windows: { totalMs, voicedMs,
 * startMs, endMs, trimmedMs (first to last voiced window), voicedFraction, rms (of voiced windows), peak }.
 * `threshold` is in int16 units (500 is about -36 dBFS).
 */
export function voicedStats(pcm, { sampleRate = TTS_SAMPLE_RATE, threshold = DEFAULT_VOICE_THRESHOLD } = {}) {
  const data = asBuffer(pcm);
  const samples = sampleCount(data);
  const { rms, size } = windowRms(data, sampleRate);
  const windowMs = (size / sampleRate) * 1000;
  let first = -1;
  let last = -1;
  let voiced = 0;
  let energy = 0;
  rms.forEach((value, index) => {
    if (value <= threshold) return;
    voiced += 1;
    energy += value * value;
    if (first < 0) first = index;
    last = index;
  });
  let peak = 0;
  for (let i = 0; i < samples; i += 1) peak = Math.max(peak, Math.abs(data.readInt16LE(i * 2)));
  const totalMs = (samples / sampleRate) * 1000;
  return {
    totalMs: Math.round(totalMs),
    voicedMs: Math.round(voiced * windowMs),
    startMs: first < 0 ? 0 : Math.round(first * windowMs),
    endMs: last < 0 ? 0 : Math.round(Math.min(totalMs, (last + 1) * windowMs)),
    trimmedMs: first < 0 ? 0 : Math.round(Math.min(totalMs, (last + 1) * windowMs) - first * windowMs),
    voicedFraction: rms.length ? Math.round((voiced / rms.length) * 100) / 100 : 0,
    rms: voiced ? Math.round(Math.sqrt(energy / voiced)) : 0,
    peak,
  };
}

const wordCount = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

/** Spoken pace of `text` in `pcm`: words per minute over the first-to-last voiced span; null when unknown. */
export function wpm(text, pcm, options) {
  const count = wordCount(text);
  const { trimmedMs } = voicedStats(pcm, options);
  if (!count || !trimmedMs) return null;
  return Math.round(count / (trimmedMs / 60_000));
}

/**
 * Cuts leading and trailing silence longer than `minSilenceMs` (default 120 ms), keeping `padMs` (default
 * 60 ms) next to the speech. Shorter edges, and all-silent audio, are returned unchanged.
 */
export function trimSilence(pcm, { sampleRate = TTS_SAMPLE_RATE, threshold = DEFAULT_VOICE_THRESHOLD, minSilenceMs = 120, padMs = 60 } = {}) {
  const data = asBuffer(pcm);
  const stats = voicedStats(data, { sampleRate, threshold });
  if (!stats.trimmedMs) return data;
  const toBytes = (ms) => Math.round((ms * sampleRate) / 1000) * 2;
  const total = sampleCount(data) * 2;
  const lead = stats.startMs > minSilenceMs ? Math.max(0, toBytes(stats.startMs - padMs)) : 0;
  const tailMs = stats.totalMs - stats.endMs;
  const end = tailMs > minSilenceMs ? Math.min(total, toBytes(stats.endMs + padMs)) : total;
  return lead === 0 && end === total ? data : data.subarray(lead, end);
}

/**
 * Scales PCM so its voiced RMS reaches `targetDbfs` (for example -20), with the gain capped at
 * `maxGainDb` and the peak kept under `peakLimit` of full scale. Returns a new buffer; silence is copied.
 */
export function normalizeLoudness(pcm, targetDbfs = -20, { sampleRate = TTS_SAMPLE_RATE, threshold = DEFAULT_VOICE_THRESHOLD, maxGainDb = 12, peakLimit = 0.95 } = {}) {
  const data = asBuffer(pcm);
  const out = Buffer.from(data.subarray(0, sampleCount(data) * 2));
  const stats = voicedStats(out, { sampleRate, threshold });
  const target = Number(targetDbfs);
  if (!stats.rms || !Number.isFinite(target)) return out;
  const targetRms = 32767 * 10 ** (Math.min(0, target) / 20);
  let gain = Math.min(targetRms / stats.rms, 10 ** (Math.max(0, Number(maxGainDb) || 0) / 20));
  if (stats.peak > 0) gain = Math.min(gain, (32767 * Math.min(1, Math.max(0.1, peakLimit))) / stats.peak);
  if (Math.abs(gain - 1) < 0.01) return out;
  for (let i = 0; i < out.length; i += 2) {
    const value = Math.round(out.readInt16LE(i) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i);
  }
  return out;
}

/** Duration in milliseconds of 16-bit mono PCM at `sampleRate`. */
export const pcmDurationMs = (pcm, sampleRate = TTS_SAMPLE_RATE) => Math.round((sampleCount(asBuffer(pcm)) / sampleRate) * 1000);
