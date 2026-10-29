import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { newTurnId } from "../src/modules/anviInterview/anviInterview.hybridProtocol.js";
import { SEGMENT_CODES, anviSegmentMemoryBytes, createSegmentAssembler } from "../src/modules/anviInterview/anviInterview.segments.js";

const CONFIG = anviConfig({});
const BPS = 32000;

// 16 kHz s16le: `seconds` of a 440 Hz tone (voiced) or of silence.
function tone(seconds, amplitude = 8000) {
  const samples = Math.round(seconds * 16000);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) pcm.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / 16000)), i * 2);
  return pcm;
}
const chunksOf = (pcm, size = 32 * 1024) => {
  const out = [];
  for (let offset = 0; offset < pcm.length; offset += size) out.push(pcm.subarray(offset, offset + size));
  return out;
};

function send(assembler, { turnId, segmentId, part = 0, pcm, final = true, options = {} }) {
  const replies = chunksOf(pcm).map((chunk, index) => assembler.chunk({ turnId, segmentId, part, index, pcm: chunk }, options));
  const commit = assembler.commit({ turnId, segmentId, part, final, totalBytes: pcm.length, durationMs: Math.round((pcm.length / BPS) * 1000) }, options);
  return { replies, commit };
}

test("a segment assembles in order and commits with hash, seconds and voiced seconds", () => {
  const turnId = newTurnId();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  const pcm = Buffer.concat([tone(1.5), Buffer.alloc(BPS)]);
  const { replies, commit } = send(assembler, { turnId, segmentId: randomUUID(), pcm });
  assert.ok(replies.every((reply) => reply.ok));
  assert.equal(commit.ok, true);
  assert.equal(commit.pcm.length, pcm.length);
  assert.ok(commit.pcm.equals(pcm));
  assert.equal(commit.audioHash, createHash("sha256").update(pcm).digest("hex"));
  assert.equal(commit.seconds, 2.5);
  assert.ok(commit.voicedSeconds >= 1.4 && commit.voicedSeconds <= 1.6, String(commit.voicedSeconds));
  assert.equal(commit.final, true);
  assembler.dispose();
});

test("a duplicate segmentId (commit or resent chunks) is acknowledged as duplicate", () => {
  const turnId = newTurnId();
  const segmentId = randomUUID();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  const pcm = tone(1);
  assert.equal(send(assembler, { turnId, segmentId, pcm }).commit.ok, true);
  const again = send(assembler, { turnId, segmentId, pcm });
  assert.ok(again.replies.every((reply) => reply.ok && reply.duplicate));
  assert.deepEqual(again.commit, { ok: true, code: null, duplicate: true, segmentId });
  // A new holder seeded from live.hybrid.segments answers the same way.
  const rejoined = createSegmentAssembler({ turnId, committed: [segmentId], config: CONFIG });
  assert.equal(send(rejoined, { turnId, segmentId, pcm }).commit.duplicate, true);
  assembler.dispose();
  rejoined.dispose();
});

test("out-of-order, oversize, odd-length and stale-turn chunks are rejected", () => {
  const turnId = newTurnId();
  const segmentId = randomUUID();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  const chunk = (fields) => assembler.chunk({ turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(1000), ...fields });
  assert.equal(chunk({ index: 1 }).code, SEGMENT_CODES.OUT_OF_ORDER);
  assert.equal(chunk({ pcm: Buffer.alloc(32 * 1024 + 2) }).code, SEGMENT_CODES.OVERSIZE);
  assert.equal(chunk({ pcm: Buffer.alloc(1001) }).code, SEGMENT_CODES.ODD_LENGTH);
  assert.equal(chunk({ turnId: newTurnId() }).code, SEGMENT_CODES.STALE_TURN);
  assert.equal(chunk({ segmentId: "not-a-uuid" }).code, SEGMENT_CODES.BAD_ID);
  assert.equal(assembler.chunk({ turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(1000) }, { onHold: true }).code, SEGMENT_CODES.ON_HOLD);
  assert.equal(chunk({}).ok, true);
  assert.equal(chunk({ index: 2 }).code, SEGMENT_CODES.OUT_OF_ORDER);
  assert.equal(chunk({ index: 1, part: 1 }).code, SEGMENT_CODES.BAD_PAYLOAD);
  assert.equal(chunk({ index: 0 }).duplicate, true);
  assert.equal(chunk({ index: 1 }).ok, true);
  assembler.dispose();
});

test("a segment longer than maxSegmentSeconds is refused before it is buffered", () => {
  const turnId = newTurnId();
  const config = anviConfig({ ANVI_MAX_SEGMENT_SECONDS: "10" });
  const assembler = createSegmentAssembler({ turnId, config });
  const segmentId = randomUUID();
  const chunks = chunksOf(tone(11));
  const replies = chunks.map((pcm, index) => assembler.chunk({ turnId, segmentId, part: 0, index, pcm }));
  const refused = replies.findIndex((reply) => !reply.ok);
  assert.equal(replies[refused].code, SEGMENT_CODES.OVERSIZE);
  assert.ok(replies.slice(0, refused).every((reply) => reply.ok));
  assert.ok(assembler.stats().heldBytes <= 10 * BPS);
  assert.equal(assembler.commit({ turnId, segmentId, part: 0, final: true, totalBytes: 11 * BPS, durationMs: 11000 }).code, SEGMENT_CODES.SIZE_MISMATCH);
  assembler.dispose();
});

test("the per-turn total is capped at maxTurnSeconds", () => {
  const turnId = newTurnId();
  const config = anviConfig({ ANVI_MAX_TURN_SECONDS: "60", ANVI_MAX_SEGMENT_SECONDS: "40" });
  const assembler = createSegmentAssembler({ turnId, config, attemptCapBytes: 200 * BPS });
  const first = send(assembler, { turnId, segmentId: randomUUID(), pcm: tone(35) });
  assert.equal(first.commit.ok, true);
  assembler.release(first.commit.segmentId);
  const second = send(assembler, { turnId, segmentId: randomUUID(), part: 1, pcm: tone(30) });
  assert.ok(second.replies.some((reply) => reply.code === SEGMENT_CODES.OVERSIZE));
  // A new turn starts a fresh total.
  const next = newTurnId();
  assembler.setTurn(next);
  assert.equal(send(assembler, { turnId: next, segmentId: randomUUID(), pcm: tone(30) }).commit.ok, true);
  assembler.dispose();
});

test("commit checks totalBytes, part and that the segment exists", () => {
  const turnId = newTurnId();
  const segmentId = randomUUID();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  const commit = (fields) => assembler.commit({ turnId, segmentId, part: 0, final: true, totalBytes: 2000, durationMs: 62, ...fields });
  assert.equal(commit({}).code, SEGMENT_CODES.UNKNOWN_SEGMENT);
  assembler.chunk({ turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(2000) });
  assert.equal(commit({ totalBytes: 2002 }).code, SEGMENT_CODES.SIZE_MISMATCH);
  assert.equal(commit({ totalBytes: 2001 }).code, SEGMENT_CODES.ODD_LENGTH);
  assert.equal(commit({ part: 1 }).code, SEGMENT_CODES.BAD_PAYLOAD);
  assert.equal(commit({ turnId: newTurnId() }).code, SEGMENT_CODES.STALE_TURN);
  const done = commit({});
  assert.equal(done.ok, true);
  assert.equal(done.voicedSeconds, 0);
  assembler.dispose();
});

test("at most two segments are open; the rate bucket is consulted last", () => {
  const turnId = newTurnId();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  const open = (segmentId, options) => assembler.chunk({ turnId, segmentId, part: 0, index: 0, pcm: Buffer.alloc(100) }, options);
  assert.equal(open(randomUUID()).ok, true);
  assert.equal(open(randomUUID()).ok, true);
  assert.equal(open(randomUUID()).code, SEGMENT_CODES.RATE_LIMITED);
  let taken = 0;
  const bucket = { take: (bytes) => { taken += bytes; return false; } };
  assert.equal(assembler.chunk({ turnId, segmentId: randomUUID(), part: 0, index: 3, pcm: Buffer.alloc(100) }, { bucket }).code, SEGMENT_CODES.OUT_OF_ORDER);
  assert.equal(taken, 0);
  assembler.dispose();
});

test("memory: attempt and process caps, released on release, cancel, hold, new turn and dispose", () => {
  const before = anviSegmentMemoryBytes();
  const turnId = newTurnId();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG, attemptCapBytes: 10_000 });
  const a = randomUUID();
  assert.equal(assembler.chunk({ turnId, segmentId: a, part: 0, index: 0, pcm: Buffer.alloc(8000) }).ok, true);
  assert.equal(anviSegmentMemoryBytes() - before, 8000);
  assert.equal(assembler.chunk({ turnId, segmentId: a, part: 0, index: 1, pcm: Buffer.alloc(4000) }).code, SEGMENT_CODES.RATE_LIMITED);
  const committed = assembler.commit({ turnId, segmentId: a, part: 0, final: true, totalBytes: 8000, durationMs: 250 });
  assert.equal(committed.ok, true);
  // Committed audio is still held until the caller releases it.
  assert.equal(assembler.stats().heldBytes, 8000);
  assert.equal(assembler.release(a), true);
  assert.equal(assembler.stats().heldBytes, 0);

  const b = randomUUID();
  assembler.chunk({ turnId, segmentId: b, part: 0, index: 0, pcm: Buffer.alloc(2000) });
  assert.equal(assembler.cancel(b), true);
  assembler.chunk({ turnId, segmentId: randomUUID(), part: 0, index: 0, pcm: Buffer.alloc(2000) });
  assembler.hold();
  assert.equal(assembler.stats().open, 0);
  assembler.chunk({ turnId, segmentId: randomUUID(), part: 0, index: 0, pcm: Buffer.alloc(2000) });
  assembler.setTurn(newTurnId());
  assert.equal(assembler.stats().open, 0);
  assert.equal(assembler.stats().heldBytes, 0);
  assembler.dispose();
  assert.equal(anviSegmentMemoryBytes(), before);

  // Process cap: this module's bytes plus the Live conductors' answer audio.
  const busy = createSegmentAssembler({ turnId, config: CONFIG, processCapBytes: 50_000, liveAudioBytes: () => 49_000 });
  assert.equal(busy.chunk({ turnId, segmentId: randomUUID(), part: 0, index: 0, pcm: Buffer.alloc(2000) }).code, SEGMENT_CODES.RATE_LIMITED);
  busy.dispose();
});

test("after dispose nothing is accepted", () => {
  const turnId = newTurnId();
  const assembler = createSegmentAssembler({ turnId, config: CONFIG });
  assembler.dispose();
  assert.equal(assembler.chunk({ turnId, segmentId: randomUUID(), part: 0, index: 0, pcm: Buffer.alloc(100) }).ok, false);
});
