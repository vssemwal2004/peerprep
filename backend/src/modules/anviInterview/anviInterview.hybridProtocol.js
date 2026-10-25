import { randomBytes } from "node:crypto";

// ANVI hybrid (turn-based) socket protocol: frozen event names, limits and pure validators.
// The frontend keeps a HAND-KEPT MIRROR at frontend/src/student/anvi/anviHybridProtocol.js. Every constant
// and validator above the "Server-only" section must stay identical to it
// (test/anviHybridProtocol.test.js imports both and asserts they are deeply equal). Change both together.
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Events the client sends. `SEG_COMMIT` is acknowledged with `{ ok, duplicate?, code? }`. */
export const CLIENT_EVENTS = deepFreeze({
  SEG_CHUNK: "anvi:seg-chunk",
  SEG_COMMIT: "anvi:seg-commit",
  SEG_CANCEL: "anvi:seg-cancel",
  PROMPT_PLAYED: "anvi:prompt-played",
  REPLAYED: "anvi:replayed",
  INPUT_MODE: "anvi:input-mode",
  DONE: "anvi:done",
  CLIP_HAVE: "anvi:clip-have",
});

/** Events the server sends. */
export const SERVER_EVENTS = deepFreeze({
  PROMPT: "anvi:prompt",
  CLIP: "anvi:clip",
  REPLAY: "anvi:replay",
  TURN: "anvi:turn",
  MODE: "anvi:mode",
});

export const ERROR_CODES = deepFreeze({
  ODD_LENGTH: "ODD_LENGTH",
  OVERSIZE: "OVERSIZE",
  BAD_ID: "BAD_ID",
  STALE_TURN: "STALE_TURN",
  ON_HOLD: "ON_HOLD",
  RATE_LIMITED: "RATE_LIMITED",
  // Malformed payload (missing or wrongly typed fields, empty audio).
  BAD_PAYLOAD: "BAD_PAYLOAD",
});

export const LIMITS = deepFreeze({
  // Student audio: 16 kHz, signed 16-bit little-endian, mono.
  captureSampleRate: 16000,
  captureFormat: "pcm_s16le",
  channels: 1,
  bytesPerSample: 2,
  frameMs: 100,
  chunkMaxBytes: 32 * 1024,
  maxChunksPerSegment: 1024,
  maxPartsPerTurn: 16,
  maxSegmentSeconds: 90,
  maxSegmentBytes: 90 * 16000 * 2,
  maxTurnSeconds: 480,
  // ANVI's own per-socket bucket for segment chunks (the generic 100 events/min limit exempts them).
  segmentBytesPerSecond: 128 * 1024,
  segmentBurstBytes: 1024 * 1024,
  // Question audio sent to the client over `anvi:clip`: 24 kHz s16le mono, in parts.
  clipSampleRate: 24000,
  clipFormat: "pcm_s16le",
  clipPartMaxBytes: 128 * 1024,
  maxClipParts: 64,
  maxClipHave: 64,
  // Server-issued turnId: 16 random bytes, base64url without padding.
  turnIdBytes: 16,
});

export const VAD_DEFAULTS = deepFreeze({
  onsetMinRms: 0.025,
  onsetFloorFactor: 3,
  onsetFrames: 2,
  preRollMs: 300,
  minSpeechMs: 400,
  maxSegmentSeconds: 90,
});

export const TURN_STATES = deepFreeze(["preparing", "playing", "listening", "processing", "follow_up", "moving", "closing", "live"]);
export const RUNTIME_MODES = deepFreeze(["live", "hybrid"]);
/** `anvi:mode` values: a Live escalation block, or back to turn-based. */
export const SOCKET_MODES = deepFreeze(["turn", "live"]);
export const INPUT_MODES = deepFreeze(["vad", "ptt"]);
export const PROMPT_KINDS = deepFreeze(["intro", "question", "follow_up", "clarify", "nudge", "move_on", "closing"]);

export const PATTERNS = deepFreeze({
  turnId: "^[A-Za-z0-9_-]{22}$",
  segmentId: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  assetId: "^[A-Za-z0-9_-]{1,128}$",
});

const TURN_ID_RE = new RegExp(PATTERNS.turnId);
const SEGMENT_ID_RE = new RegExp(PATTERNS.segmentId, "i");
const ASSET_ID_RE = new RegExp(PATTERNS.assetId);

export const isTurnId = (value) => typeof value === "string" && TURN_ID_RE.test(value);
export const isSegmentId = (value) => typeof value === "string" && SEGMENT_ID_RE.test(value);
export const isAssetId = (value) => typeof value === "string" && ASSET_ID_RE.test(value);

const isIndex = (value, max) => Number.isInteger(value) && value >= 0 && value < max;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Byte length of binary audio (Buffer, ArrayBuffer or typed array), or -1 for anything else. */
export const pcmByteLength = (pcm) => (pcm instanceof ArrayBuffer || ArrayBuffer.isView(pcm) ? pcm.byteLength : -1);

const fail = (code) => ({ ok: false, code });
const OK = Object.freeze({ ok: true, code: null });

// Turn-scoped checks shared by chunk and commit: ids, then the current turn, then hold.
// `STALE_TURN` comes before `ON_HOLD` because a hold rotates the turnId and the outbox drops stale work.
function checkTurn(payload, { turnId, onHold } = {}) {
  if (!isTurnId(payload.turnId) || !isSegmentId(payload.segmentId)) return ERROR_CODES.BAD_ID;
  if (turnId !== undefined && payload.turnId !== turnId) return ERROR_CODES.STALE_TURN;
  if (onHold) return ERROR_CODES.ON_HOLD;
  return null;
}

/**
 * Validates an `anvi:seg-chunk` payload `{ turnId, segmentId, part, index, pcm }`.
 * Context: `{ turnId }` (current turn; omitted skips the check), `{ onHold }`, and an optional
 * `{ bucket }` with `take(bytes) -> boolean`, consulted last so an invalid chunk never spends tokens.
 * Returns `{ ok, code }`.
 */
export function validateChunk(payload, context = {}) {
  if (!isObject(payload)) return fail(ERROR_CODES.BAD_PAYLOAD);
  const turn = checkTurn(payload, context);
  if (turn) return fail(turn);
  if (!isIndex(payload.part, LIMITS.maxPartsPerTurn) || !isIndex(payload.index, LIMITS.maxChunksPerSegment)) return fail(ERROR_CODES.BAD_PAYLOAD);
  const size = pcmByteLength(payload.pcm);
  if (size <= 0) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (size > LIMITS.chunkMaxBytes) return fail(ERROR_CODES.OVERSIZE);
  if (size % LIMITS.bytesPerSample) return fail(ERROR_CODES.ODD_LENGTH);
  if (context.bucket && !context.bucket.take(size)) return fail(ERROR_CODES.RATE_LIMITED);
  return OK;
}

/**
 * Validates an `anvi:seg-commit` payload `{ turnId, segmentId, part, final, totalBytes, durationMs }`.
 * Context as for `validateChunk` (without the bucket). Whether `totalBytes` matches the chunks received
 * is the segment assembler's check. Returns `{ ok, code }`.
 */
export function validateCommit(payload, context = {}) {
  if (!isObject(payload)) return fail(ERROR_CODES.BAD_PAYLOAD);
  const turn = checkTurn(payload, context);
  if (turn) return fail(turn);
  if (!isIndex(payload.part, LIMITS.maxPartsPerTurn) || typeof payload.final !== "boolean") return fail(ERROR_CODES.BAD_PAYLOAD);
  const { totalBytes, durationMs } = payload;
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (totalBytes > LIMITS.maxSegmentBytes || durationMs > LIMITS.maxSegmentSeconds * 1000) return fail(ERROR_CODES.OVERSIZE);
  if (totalBytes % LIMITS.bytesPerSample) return fail(ERROR_CODES.ODD_LENGTH);
  return OK;
}

/** Validates `anvi:seg-cancel`, `anvi:prompt-played` and `anvi:replayed`: `{ turnId, segmentId? }`. */
export function validateTurnRef(payload, { turnId } = {}) {
  if (!isObject(payload) || !isTurnId(payload.turnId)) return fail(ERROR_CODES.BAD_ID);
  if (payload.segmentId !== undefined && !isSegmentId(payload.segmentId)) return fail(ERROR_CODES.BAD_ID);
  if (turnId !== undefined && payload.turnId !== turnId) return fail(ERROR_CODES.STALE_TURN);
  return OK;
}

/** The input mode from an `anvi:input-mode` payload `{ mode }`, or null when it is not one. */
export const inputModeOf = (payload) => (isObject(payload) && INPUT_MODES.includes(payload.mode) ? payload.mode : null);

/** The valid, distinct asset ids of an `anvi:clip-have` payload `{ assetIds }`, at most `maxClipHave`. */
export function clipHaveIds(payload) {
  const ids = isObject(payload) && Array.isArray(payload.assetIds) ? payload.assetIds : [];
  const out = [];
  for (const id of ids) {
    if (out.length >= LIMITS.maxClipHave) break;
    if (isAssetId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Validates a received `anvi:clip` part `{ assetId, sampleRate, format, part, final, pcm }`. */
export function validateClip(payload) {
  if (!isObject(payload)) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (!isAssetId(payload.assetId)) return fail(ERROR_CODES.BAD_ID);
  if (payload.sampleRate !== LIMITS.clipSampleRate || payload.format !== LIMITS.clipFormat) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (!isIndex(payload.part, LIMITS.maxClipParts) || typeof payload.final !== "boolean") return fail(ERROR_CODES.BAD_PAYLOAD);
  const size = pcmByteLength(payload.pcm);
  if (size <= 0) return fail(ERROR_CODES.BAD_PAYLOAD);
  if (size > LIMITS.clipPartMaxBytes) return fail(ERROR_CODES.OVERSIZE);
  if (size % LIMITS.bytesPerSample) return fail(ERROR_CODES.ODD_LENGTH);
  return OK;
}

// ---- Server-only helpers (not mirrored) ----

/** A new server-issued turnId: 16 random bytes, base64url without padding (22 characters). */
export const newTurnId = () => randomBytes(LIMITS.turnIdBytes).toString("base64url");

/**
 * A token bucket over bytes for one socket's segment chunks: refills at `bytesPerSecond` up to
 * `burstBytes`. `take(bytes)` spends and returns true, or returns false and spends nothing.
 */
export function createByteBucket({ bytesPerSecond = LIMITS.segmentBytesPerSecond, burstBytes = LIMITS.segmentBurstBytes, now = Date.now } = {}) {
  const rate = Math.max(1, Number(bytesPerSecond) || LIMITS.segmentBytesPerSecond);
  const burst = Math.max(1, Number(burstBytes) || LIMITS.segmentBurstBytes);
  let tokens = burst;
  let last = now();
  const refill = () => {
    const at = now();
    if (at > last) tokens = Math.min(burst, tokens + ((at - last) / 1000) * rate);
    last = at;
  };
  return {
    take(bytes) {
      const size = Number(bytes);
      if (!Number.isFinite(size) || size < 0) return false;
      refill();
      if (size > tokens) return false;
      tokens -= size;
      return true;
    },
    available() { refill(); return tokens; },
  };
}