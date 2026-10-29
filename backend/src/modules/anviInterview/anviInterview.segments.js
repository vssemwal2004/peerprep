import { createHash } from "node:crypto";
import { anviConfig } from "./anviInterview.config.js";
import { anviAudioMemoryBytes } from "./anviInterview.conductor.js";
import { ERROR_CODES, LIMITS, pcmByteLength, validateChunk, validateCommit } from "./anviInterview.hybridProtocol.js";
import { voicedStats } from "./anviInterview.wav.js";

// ANVI hybrid mode: assembles the student's answer segments from `anvi:seg-chunk` parts and checks the
// `anvi:seg-commit`. One assembler per lease holder (socket). Chunks are accepted in index order only, at
// most two segments are open at a time, and the audio held is capped per attempt and per process (this
// module's own counter plus the Live conductors' answer audio). Audio stays in memory, is never logged
// and is released on commit hand-off (`release`), cancel, hold, a new turn or dispose.
const PCM_BYTES_PER_SECOND = LIMITS.captureSampleRate * LIMITS.bytesPerSample;
// Committed segmentIds remembered per assembler for the duplicate check (a resend after a rejoin).
const MAX_REMEMBERED = 512;

// Codes beyond the shared protocol's. The client outbox retries any code it does not treat as fatal,
// so these are all retryable: a gap in the chunk order is filled by the resend, a busy process frees up.
export const SEGMENT_CODES = Object.freeze({
  ...ERROR_CODES,
  // A chunk index ahead of the next expected one.
  OUT_OF_ORDER: "OUT_OF_ORDER",
  // Commit `totalBytes` differs from the bytes received (chunks missing).
  SIZE_MISMATCH: "SIZE_MISMATCH",
  // A commit for a segment with no chunks on this holder.
  UNKNOWN_SEGMENT: "UNKNOWN_SEGMENT",
});

const segmentMemory = { bytes: 0 };
/** Bytes of hybrid answer audio currently held by every segment assembler in this process. */
export const anviSegmentMemoryBytes = () => segmentMemory.bytes;

const fail = (code) => ({ ok: false, code });

// A private copy of a chunk's bytes (the socket's buffer is not retained).
function copyOf(pcm) {
  if (Buffer.isBuffer(pcm)) return Buffer.from(pcm);
  if (pcm instanceof ArrayBuffer) return Buffer.from(new Uint8Array(pcm));
  return Buffer.from(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

/** SHA-256 (hex) over the canonical segment PCM: 16 kHz s16le mono, chunks concatenated in order. */
export const audioHashOf = (pcm) => createHash("sha256").update(pcm).digest("hex");

/**
 * `createSegmentAssembler({ turnId, committed, config, attemptCapBytes, processCapBytes, liveAudioBytes })`.
 * - `turnId`: the current turn (the conductor moves it with `setTurn`).
 * - `committed`: segmentIds already committed for this attempt (from `live.hybrid.segments`), so a
 *   resend after a rejoin is answered `{ duplicate: true }`.
 * - `chunk(payload, { onHold, bucket })` -> `{ ok, code?, duplicate? }`.
 * - `commit(payload, { onHold })` -> `{ ok: true, segmentId, turnId, part, final, audioHash, pcm, bytes,
 *   seconds, voicedSeconds }`, `{ ok: true, duplicate: true, segmentId }` or `{ ok: false, code }`.
 *   The committed audio stays counted against the caps until `release(segmentId)`.
 * - `cancel(segmentId)`, `setTurn(turnId)` (discards open segments of other turns), `hold()` (discards
 *   open segments), `dispose()` (discards everything), `stats()`.
 */
export function createSegmentAssembler({
  turnId = null,
  committed = [],
  config = anviConfig(),
  attemptCapBytes = null,
  processCapBytes = null,
  liveAudioBytes = anviAudioMemoryBytes,
  maxOpenSegments = 2,
} = {}) {
  const maxSegmentBytes = Math.min(LIMITS.maxSegmentBytes, Math.max(1, Number(config.maxSegmentSeconds) || LIMITS.maxSegmentSeconds) * PCM_BYTES_PER_SECOND);
  const maxTurnBytes = Math.max(1, Number(config.maxTurnSeconds) || LIMITS.maxTurnSeconds) * PCM_BYTES_PER_SECOND;
  const attemptCap = Number(attemptCapBytes) > 0 ? Number(attemptCapBytes) : maxTurnBytes;
  const processCap = Number(processCapBytes) > 0 ? Number(processCapBytes) : Math.max(16, Number(config.hybridAudioCapMb) || 128) * 1024 * 1024;

  let currentTurn = turnId || null;
  // segmentId -> { turnId, part, chunks: Buffer[], bytes }
  const open = new Map();
  // segmentId -> bytes, committed audio not yet released by the caller.
  const pending = new Map();
  const done = new Set();
  let turnBytes = 0;
  let held = 0;
  let disposed = false;

  for (const id of Array.isArray(committed) ? committed : []) if (typeof id === "string") done.add(id);

  const hold = (bytes) => { held += bytes; segmentMemory.bytes += bytes; };
  const free = (bytes) => {
    const amount = Math.min(held, Math.max(0, bytes));
    held -= amount;
    segmentMemory.bytes = Math.max(0, segmentMemory.bytes - amount);
  };
  const remember = (segmentId) => {
    done.add(segmentId);
    while (done.size > MAX_REMEMBERED) done.delete(done.values().next().value);
  };
  const discard = (segmentId) => {
    const segment = open.get(segmentId);
    if (!segment) return false;
    open.delete(segmentId);
    segment.chunks.length = 0;
    free(segment.bytes);
    return true;
  };
  const discardOpen = (keep = () => false) => {
    for (const [segmentId, segment] of [...open]) if (!keep(segment)) discard(segmentId);
  };
  const turnContext = (options) => ({ turnId: currentTurn ?? undefined, onHold: Boolean(options?.onHold) });

  function chunk(payload, options = {}) {
    if (disposed) return fail(SEGMENT_CODES.STALE_TURN);
    if (payload && typeof payload === "object" && done.has(payload.segmentId) && payload.turnId === currentTurn) {
      // A resend of a segment already committed: nothing to store.
      return { ok: true, code: null, duplicate: true };
    }
    // The rate bucket is consulted only after the order check below, so a rejected chunk spends nothing.
    const checked = validateChunk(payload, turnContext(options));
    if (!checked.ok) return checked;
    const size = pcmByteLength(payload.pcm);
    let segment = open.get(payload.segmentId);
    if (!segment) {
      if (payload.index !== 0) return fail(SEGMENT_CODES.OUT_OF_ORDER);
      if (open.size >= maxOpenSegments) return fail(SEGMENT_CODES.RATE_LIMITED);
    } else {
      if (payload.part !== segment.part) return fail(SEGMENT_CODES.BAD_PAYLOAD);
      if (payload.index < segment.chunks.length) return { ok: true, code: null, duplicate: true };
      if (payload.index > segment.chunks.length) return fail(SEGMENT_CODES.OUT_OF_ORDER);
    }
    const bytes = (segment?.bytes || 0) + size;
    if (bytes > maxSegmentBytes || turnBytes + bytes > maxTurnBytes) return fail(SEGMENT_CODES.OVERSIZE);
    if (held + size > attemptCap || segmentMemory.bytes + (Number(liveAudioBytes?.()) || 0) + size > processCap) {
      return fail(SEGMENT_CODES.RATE_LIMITED);
    }
    if (options.bucket && !options.bucket.take(size)) return fail(SEGMENT_CODES.RATE_LIMITED);
    if (!segment) {
      segment = { turnId: payload.turnId, part: payload.part, chunks: [], bytes: 0 };
      open.set(payload.segmentId, segment);
    }
    segment.chunks.push(copyOf(payload.pcm));
    segment.bytes = bytes;
    hold(size);
    return { ok: true, code: null };
  }

  function commit(payload, options = {}) {
    if (disposed) return fail(SEGMENT_CODES.STALE_TURN);
    const checked = validateCommit(payload, turnContext(options));
    if (!checked.ok) return checked;
    const { segmentId } = payload;
    if (done.has(segmentId)) return { ok: true, code: null, duplicate: true, segmentId };
    const segment = open.get(segmentId);
    if (!segment) return fail(SEGMENT_CODES.UNKNOWN_SEGMENT);
    if (segment.part !== payload.part) return fail(SEGMENT_CODES.BAD_PAYLOAD);
    if (segment.bytes !== payload.totalBytes) return fail(SEGMENT_CODES.SIZE_MISMATCH);
    if (segment.bytes % LIMITS.bytesPerSample) return fail(SEGMENT_CODES.ODD_LENGTH);
    if (segment.bytes > maxSegmentBytes || turnBytes + segment.bytes > maxTurnBytes) return fail(SEGMENT_CODES.OVERSIZE);
    const pcm = Buffer.concat(segment.chunks, segment.bytes);
    open.delete(segmentId);
    segment.chunks.length = 0;
    pending.set(segmentId, segment.bytes);
    turnBytes += segment.bytes;
    remember(segmentId);
    const seconds = Math.round((pcm.length / PCM_BYTES_PER_SECOND) * 100) / 100;
    const voiced = voicedStats(pcm, { sampleRate: LIMITS.captureSampleRate });
    return {
      ok: true,
      code: null,
      segmentId,
      turnId: segment.turnId,
      part: segment.part,
      final: payload.final,
      audioHash: audioHashOf(pcm),
      pcm,
      bytes: pcm.length,
      seconds,
      voicedSeconds: Math.round(voiced.voicedMs / 10) / 100,
    };
  }

  /** The caller is done with a committed segment's audio (transcribed or abandoned). */
  function release(segmentId) {
    const bytes = pending.get(segmentId);
    if (bytes === undefined) return false;
    pending.delete(segmentId);
    free(bytes);
    return true;
  }

  /** Drops an open segment (`anvi:seg-cancel`). */
  const cancel = (segmentId) => discard(segmentId);

  /** A new turn: open segments of any other turn are discarded and the per-turn total restarts. */
  function setTurn(next) {
    const changed = (next || null) !== currentTurn;
    currentTurn = next || null;
    discardOpen((segment) => segment.turnId === currentTurn);
    if (changed) turnBytes = 0;
  }

  /** A proctoring hold: open segments are discarded (committed audio is kept until released). */
  const holdSegments = () => discardOpen();

  function dispose() {
    if (disposed) return;
    disposed = true;
    discardOpen();
    for (const segmentId of [...pending.keys()]) release(segmentId);
    free(held);
  }

  const stats = () => ({ turnId: currentTurn, open: open.size, pending: pending.size, heldBytes: held, turnBytes, committed: done.size });

  return {
    chunk,
    commit,
    release,
    cancel,
    setTurn,
    hold: holdSegments,
    dispose,
    stats,
    isCommitted: (segmentId) => done.has(segmentId),
    turnId: () => currentTurn,
  };
}
