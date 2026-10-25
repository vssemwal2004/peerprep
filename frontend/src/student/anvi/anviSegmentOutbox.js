// ANVI hybrid mode: delivers answer segments to the server. Each segment gets a UUIDv4 segmentId and
// goes out as `anvi:seg-chunk` parts of at most 32 KB, then an acknowledged `anvi:seg-commit`. A
// segment is held until its commit is acknowledged (at most two at a time), so a reconnect resends it
// with the same segmentId and the server's duplicate check keeps it from being transcribed twice.
// Only segments of the current turn are kept: a new turnId or a STALE_TURN reply drops older ones.
// Audio bytes are never logged.

import { CLIENT_EVENTS, ERROR_CODES, LIMITS } from "./anviHybridProtocol";

export const OUTBOX_DEFAULTS = Object.freeze({
  chunkBytes: LIMITS.chunkMaxBytes,
  maxSegments: 2,
  commitTimeoutMs: 10000,
});

// Commit replies after which the segment is dropped (it can never succeed); anything else is retried.
const FATAL_CODES = new Set([ERROR_CODES.STALE_TURN, ERROR_CODES.BAD_ID, ERROR_CODES.BAD_PAYLOAD, ERROR_CODES.ODD_LENGTH, ERROR_CODES.OVERSIZE]);

const defaultRandomId = () => globalThis.crypto.randomUUID();

const bytesOf = (pcm) => {
  if (pcm instanceof Uint8Array) return pcm;
  if (ArrayBuffer.isView(pcm)) return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (pcm instanceof ArrayBuffer) return new Uint8Array(pcm);
  return null;
};

/** Splits bytes into chunks of at most `size` bytes; `size` is rounded down to whole samples. */
export function chunkPcm(bytes, size = LIMITS.chunkMaxBytes) {
  const step = Math.max(LIMITS.bytesPerSample, size - (size % LIMITS.bytesPerSample));
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += step) chunks.push(bytes.slice(offset, offset + step));
  return chunks;
}

/**
 * `createAnviSegmentOutbox({ emit, connected, randomId, onCommitted, onDrop, ... })`.
 * - `emit(event, payload, ack?)`: the socket's emit; `ack(reply)` receives the server's reply.
 * - `connected()`: whether to send now; otherwise segments wait for `resend()` after the rejoin.
 * - `onCommitted({ segmentId, turnId, part, final, duplicate })` and `onDrop({ segmentId, turnId, part, reason })`.
 */
export function createAnviSegmentOutbox({
  emit,
  connected = () => true,
  randomId = defaultRandomId,
  onCommitted = () => {},
  onDrop = () => {},
  chunkBytes = OUTBOX_DEFAULTS.chunkBytes,
  maxSegments = OUTBOX_DEFAULTS.maxSegments,
  commitTimeoutMs = OUTBOX_DEFAULTS.commitTimeoutMs,
} = {}) {
  // segmentId -> { segmentId, turnId, part, final, durationMs, totalBytes, chunks, acked: Set, inFlight, timer }
  const held = new Map();
  let currentTurn = null;

  const info = (segment) => ({ segmentId: segment.segmentId, turnId: segment.turnId, part: segment.part, final: segment.final });

  const forget = (segment) => {
    clearTimeout(segment.timer);
    held.delete(segment.segmentId);
  };

  const drop = (segment, reason, { cancel = false } = {}) => {
    if (!held.has(segment.segmentId)) return;
    forget(segment);
    if (cancel && connected()) emit(CLIENT_EVENTS.SEG_CANCEL, { turnId: segment.turnId, segmentId: segment.segmentId });
    onDrop({ ...info(segment), reason });
  };

  const onCommitReply = (segment, reply) => {
    if (!held.has(segment.segmentId)) return;
    clearTimeout(segment.timer);
    segment.inFlight = false;
    if (reply?.ok || reply?.duplicate) {
      forget(segment);
      onCommitted({ ...info(segment), duplicate: Boolean(reply.duplicate) });
      return;
    }
    if (FATAL_CODES.has(reply?.code)) drop(segment, reply.code);
    // ON_HOLD, RATE_LIMITED, a timeout or no reply: kept for the next `resend()`.
  };

  // Emits the chunks not yet acknowledged, then the commit.
  const deliver = (segment) => {
    if (segment.inFlight || !connected()) return false;
    segment.inFlight = true;
    segment.chunks.forEach((pcm, index) => {
      if (segment.acked.has(index)) return;
      emit(CLIENT_EVENTS.SEG_CHUNK, { turnId: segment.turnId, segmentId: segment.segmentId, part: segment.part, index, pcm }, (reply) => {
        if (!held.has(segment.segmentId)) return;
        if (reply?.ok) segment.acked.add(index);
        else if (FATAL_CODES.has(reply?.code)) drop(segment, reply.code);
      });
    });
    if (!held.has(segment.segmentId)) return false;
    segment.timer = setTimeout(() => { segment.inFlight = false; }, commitTimeoutMs);
    emit(CLIENT_EVENTS.SEG_COMMIT, {
      turnId: segment.turnId, segmentId: segment.segmentId, part: segment.part, final: segment.final,
      totalBytes: segment.totalBytes, durationMs: segment.durationMs,
    }, (reply) => onCommitReply(segment, reply));
    return true;
  };

  /** The server's current turnId. Held segments of any other turn are dropped (no resend). */
  const setTurn = (turnId) => {
    currentTurn = turnId || null;
    for (const segment of [...held.values()]) if (segment.turnId !== currentTurn) drop(segment, ERROR_CODES.STALE_TURN);
  };

  /**
   * Queues and sends a segment `{ turnId, part, final, pcm, durationMs }` (a segmenter "segment"
   * event plus the turnId). Returns its segmentId, or null when it was not accepted.
   */
  const send = ({ turnId, part = 0, final = true, pcm, durationMs = 0 } = {}) => {
    const bytes = bytesOf(pcm);
    if (!turnId || !bytes?.length || bytes.length % LIMITS.bytesPerSample) return null;
    if (currentTurn && turnId !== currentTurn) return null;
    currentTurn = turnId;
    // At most `maxSegments` held: the oldest unacknowledged one gives way.
    while (held.size >= maxSegments) drop(held.values().next().value, "overflow", { cancel: true });
    const segment = {
      segmentId: randomId(), turnId, part, final, durationMs: Math.max(0, Math.round(durationMs)),
      totalBytes: bytes.length, chunks: chunkPcm(bytes, chunkBytes), acked: new Set(), inFlight: false, timer: null,
    };
    held.set(segment.segmentId, segment);
    deliver(segment);
    return segment.segmentId;
  };

  /**
   * After a rejoin: resends the held segments of the current turn that are not committed, with the same
   * segmentIds, and only the chunks the server has not acknowledged. With `full`, every chunk goes again
   * from index 0: a new join has a new holder whose assembler holds none of the earlier chunks (and
   * accepts them in index order only). Returns how many were resent.
   */
  const resend = ({ full = false } = {}) => {
    let count = 0;
    for (const segment of [...held.values()]) {
      if (segment.turnId !== currentTurn) { drop(segment, ERROR_CODES.STALE_TURN); continue; }
      segment.inFlight = false;
      clearTimeout(segment.timer);
      if (full) segment.acked.clear();
      if (deliver(segment)) count += 1;
    }
    return count;
  };

  /** Drops held segments (all, or one by id), telling the server when connected. */
  const cancel = (segmentId = null) => {
    for (const segment of [...held.values()]) if (!segmentId || segment.segmentId === segmentId) drop(segment, "cancel", { cancel: true });
  };

  /** Forgets everything without telling the server (teardown). */
  const clear = () => {
    for (const segment of held.values()) clearTimeout(segment.timer);
    held.clear();
    currentTurn = null;
  };

  return {
    send,
    resend,
    setTurn,
    cancel,
    clear,
    turnId: () => currentTurn,
    // Held segments without their audio.
    pending: () => [...held.values()].map((segment) => ({ ...info(segment), chunks: segment.chunks.length, acked: segment.acked.size })),
  };
}
