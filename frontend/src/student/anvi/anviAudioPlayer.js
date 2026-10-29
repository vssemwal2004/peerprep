// Gapless playback of ANVI's 24 kHz s16le mono stream. Chunks are scheduled back to back on the
// AudioContext clock; a short jitter buffer at the start of each utterance absorbs network jitter.
// Hybrid mode adds cached clips (question, number, ack and template audio) on the same voice channel:
// clips are decoded once into AudioBuffers, kept in a small LRU and replayed without any fetch.

export const PLAYBACK_RATE = 24000;
// Decoded clips are Float32 (4 bytes per sample): about 12 MB holds roughly two minutes of speech.
export const CLIP_CACHE_BYTES = 12 * 1024 * 1024;
export const CLIP_GAP_MS = 150;
// A clip sequence starts this far ahead of the clock so its first buffer is never clipped.
const CLIP_LEAD = 0.02;
const JITTER_START = 0.12;
const JITTER_MAX = 0.3;
const JITTER_STEP = 0.04;
// A chunk arriving this soon after the queue ran dry is an underrun inside one utterance.
const UNDERRUN_WINDOW = 0.5;
const FADE_SECONDS = 0.03;

/** Converts little-endian Int16 bytes to Float32. Carries an odd trailing byte into the next chunk. */
export function int16ToFloat32(bytes, carry = null) {
  let view = bytes;
  if (carry !== null) {
    view = new Uint8Array(bytes.length + 1);
    view[0] = carry;
    view.set(bytes, 1);
  }
  const samples = view.length >> 1;
  const out = new Float32Array(samples);
  const data = new DataView(view.buffer, view.byteOffset, samples * 2);
  for (let i = 0; i < samples; i += 1) out[i] = data.getInt16(i * 2, true) / 0x8000;
  return { samples: out, carry: view.length % 2 ? view[view.length - 1] : null };
}

const toBytes = (chunk) => {
  if (chunk instanceof Uint8Array) return chunk;
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return null;
};

/** Joins clip parts (byte arrays in order) into one Uint8Array. Parts that are not binary are skipped. */
export function joinPcmParts(parts) {
  const list = (Array.isArray(parts) ? parts : [parts]).map(toBytes).filter((bytes) => bytes?.length);
  if (list.length === 1) return list[0];
  const out = new Uint8Array(list.reduce((sum, bytes) => sum + bytes.length, 0));
  let offset = 0;
  for (const bytes of list) { out.set(bytes, offset); offset += bytes.length; }
  return out;
}

/**
 * `createAnviAudioPlayer({ context })` takes an AudioContext created inside a user gesture
 * (ideally `new AudioContext({ sampleRate: 24000 })`; any rate works, the browser resamples).
 * `onSpeakingChange(speaking)` fires when audible output starts or the queue drains.
 * `clipCacheBytes` bounds the decoded-clip LRU.
 */
export function createAnviAudioPlayer({ context, onSpeakingChange = () => {}, clipCacheBytes = CLIP_CACHE_BYTES } = {}) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  analyser.connect(context.destination);
  const levelData = new Float32Array(analyser.fftSize);

  let output = null;
  let sources = new Set();
  let nextTime = 0;
  let drainedAt = -Infinity;
  let jitter = JITTER_START;
  let underruns = 0;
  let carry = null;
  let speaking = false;
  let closed = false;
  // Clip playback: the decoded LRU (assetId -> { buffer, bytes }, oldest first) and the sequence playing now.
  const clips = new Map();
  let clipBytes = 0;
  let clipRun = null;

  const freshOutput = () => {
    output = context.createGain();
    output.gain.value = 1;
    output.connect(analyser);
  };
  freshOutput();

  const setSpeaking = (value) => {
    if (speaking === value) return;
    speaking = value;
    onSpeakingChange(value);
  };

  const enqueue = (chunk) => {
    if (closed) return;
    const bytes = toBytes(chunk);
    if (!bytes?.length) return;
    const decoded = int16ToFloat32(bytes, carry);
    carry = decoded.carry;
    if (!decoded.samples.length) return;
    const buffer = context.createBuffer(1, decoded.samples.length, PLAYBACK_RATE);
    buffer.getChannelData(0).set(decoded.samples);
    const now = context.currentTime;
    if (nextTime < now) {
      // The queue is empty. A gap inside an utterance widens the jitter buffer; a new utterance
      // after a clean one lets it relax back toward its starting size.
      if (sources.size === 0 && now - drainedAt < UNDERRUN_WINDOW) {
        underruns += 1;
        jitter = Math.min(JITTER_MAX, jitter + JITTER_STEP);
      } else {
        if (underruns === 0) jitter = Math.max(JITTER_START, jitter - JITTER_STEP / 2);
        underruns = 0;
      }
      nextTime = now + jitter;
    }
    // One voice channel: stream audio that arrives while a clip plays waits for the clip to end.
    if (clipRun && nextTime < clipRun.endsAt) nextTime = clipRun.endsAt;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(nextTime);
    nextTime += buffer.duration;
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      if (sources.size === 0) {
        drainedAt = context.currentTime;
        if (!clipRun) setSpeaking(false);
      }
    };
    setSpeaking(true);
  };

  // Barge-in: fade the current output out (no click), drop everything queued, start clean.
  const flush = () => {
    if (closed) return;
    const now = context.currentTime;
    const fading = output;
    const stale = sources;
    fading.gain.setValueAtTime(fading.gain.value, now);
    fading.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    for (const source of stale) {
      source.onended = null;
      try { source.stop(now + FADE_SECONDS); } catch { /* Already stopped. */ }
    }
    stopClipRun(now + FADE_SECONDS);
    setTimeout(() => { try { fading.disconnect(); } catch { /* Context closed. */ } }, FADE_SECONDS * 1000 + 50);
    sources = new Set();
    nextTime = 0;
    carry = null;
    drainedAt = -Infinity;
    freshOutput();
    setSpeaking(false);
  };

  // ---- Clips (hybrid mode) ----

  // Stops the sequence playing now (its sources fade with the output they share) and settles it as interrupted.
  function stopClipRun(at) {
    const run = clipRun;
    if (!run) return;
    clipRun = null;
    for (const source of run.sources) {
      source.onended = null;
      try { source.stop(at); } catch { /* Already stopped. */ }
      try { source.disconnect(); } catch { /* Already gone. */ }
    }
    run.resolve("interrupted");
  }

  const touchClip = (assetId) => {
    const entry = clips.get(assetId);
    if (!entry) return null;
    clips.delete(assetId);
    clips.set(assetId, entry);
    return entry;
  };

  const dropClip = (assetId) => {
    const entry = clips.get(assetId);
    if (!entry) return;
    clips.delete(assetId);
    clipBytes -= entry.bytes;
  };

  /**
   * Decodes a clip's s16le parts (in order) into an AudioBuffer and caches it under `assetId`.
   * Converts directly instead of `decodeAudioData`, which needs a container. Returns
   * `{ assetId, duration }`, or null when there is no audio or the player is closed.
   */
  const loadClipPcm = (assetId, parts, sampleRate = PLAYBACK_RATE) => {
    if (closed || typeof assetId !== "string" || !assetId) return null;
    const bytes = joinPcmParts(parts);
    if (!bytes.length) return null;
    const { samples } = int16ToFloat32(bytes);
    if (!samples.length) return null;
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    dropClip(assetId);
    clips.set(assetId, { buffer, bytes: samples.length * 4 });
    clipBytes += samples.length * 4;
    // Evict the least recently used clips; the clip just loaded always stays.
    for (const id of clips.keys()) {
      if (clipBytes <= clipCacheBytes || id === assetId) break;
      dropClip(id);
    }
    return { assetId, duration: buffer.duration };
  };

  const hasClip = (assetId) => clips.has(assetId);

  /** Total seconds of the given clips plus the gaps between them, or 0 when one is not cached. */
  const clipSeconds = (assetIds, gapMs = CLIP_GAP_MS) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds];
    if (!ids.length || !ids.every(hasClip)) return 0;
    return ids.reduce((sum, id) => sum + clips.get(id).buffer.duration, 0) + (Math.max(0, ids.length - 1) * gapMs) / 1000;
  };

  /**
   * Plays cached clips back to back with `gapMs` between them, through the same gain and analyser as
   * the stream. A clip takes the voice channel: queued stream audio and any earlier sequence are
   * flushed first. Resolves "ended", "interrupted" (flush, close or a newer sequence), or "missing"
   * when a clip is not cached (nothing plays then; the caller fetches it or shows the text).
   */
  const playSequence = (assetIds, gapMs = CLIP_GAP_MS) => {
    const ids = (Array.isArray(assetIds) ? assetIds : [assetIds]).filter(Boolean);
    if (closed) return Promise.resolve("interrupted");
    if (!ids.length || !ids.every(hasClip)) return Promise.resolve("missing");
    if (clipRun || sources.size) flush();
    const buffers = ids.map((id) => touchClip(id).buffer);
    return new Promise((resolve) => {
      const run = { sources: new Set(), resolve, endsAt: 0 };
      let at = context.currentTime + CLIP_LEAD;
      buffers.forEach((buffer, index) => {
        if (index) at += gapMs / 1000;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(output);
        source.start(at);
        at += buffer.duration;
        run.sources.add(source);
        source.onended = () => {
          run.sources.delete(source);
          try { source.disconnect(); } catch { /* Already gone. */ }
          if (run.sources.size || clipRun !== run) return;
          clipRun = null;
          if (sources.size === 0) setSpeaking(false);
          resolve("ended");
        };
      });
      run.endsAt = at;
      clipRun = run;
      setSpeaking(true);
    });
  };

  const playClip = (assetId) => playSequence([assetId]);

  const level = () => {
    if (!speaking || closed) return 0;
    analyser.getFloatTimeDomainData(levelData);
    let sum = 0;
    for (let i = 0; i < levelData.length; i += 1) sum += levelData[i] * levelData[i];
    return Math.sqrt(sum / levelData.length);
  };

  const close = async () => {
    if (closed) return;
    flush();
    closed = true;
    clips.clear();
    clipBytes = 0;
    try { analyser.disconnect(); } catch { /* Already gone. */ }
    try { if (context.state !== "closed") await context.close(); } catch { /* Already closed. */ }
  };

  return {
    enqueue,
    flush,
    level,
    close,
    isSpeaking: () => speaking,
    // Seconds of audio still queued ahead of the playhead.
    queuedSeconds: () => Math.max(0, nextTime - context.currentTime),
    jitterSeconds: () => jitter,
    resume: () => (context.state === "suspended" ? context.resume() : Promise.resolve()),
    loadClipPcm,
    hasClip,
    clipSeconds,
    playClip,
    playSequence,
    isPlayingClip: () => Boolean(clipRun),
    // Clip ids held, oldest first (preload hints for `anvi:clip-have`), and the decoded bytes they use.
    clipIds: () => [...clips.keys()],
    clipCacheBytes: () => clipBytes,
  };
}
