import { test } from "node:test";
import assert from "node:assert/strict";
import * as backend from "../src/modules/anviInterview/anviInterview.hybridProtocol.js";
import * as frontend from "../../frontend/src/student/anvi/anviHybridProtocol.js";

const {
  CLIENT_EVENTS, SERVER_EVENTS, ERROR_CODES, LIMITS, validateChunk, validateCommit, validateTurnRef,
  validateClip, inputModeOf, clipHaveIds, isTurnId, isSegmentId, newTurnId, createByteBucket,
} = backend;

const TURN = "AAAAAAAAAAAAAAAAAAAAAA";
const OTHER_TURN = "BBBBBBBBBBBBBBBBBBBBBB";
const SEG = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const chunk = (over = {}) => ({ turnId: TURN, segmentId: SEG, part: 0, index: 0, pcm: Buffer.alloc(3200), ...over });
const commit = (over = {}) => ({ turnId: TURN, segmentId: SEG, part: 0, final: true, totalBytes: 32000, durationMs: 1000, ...over });
const clip = (over = {}) => ({ assetId: "a1b2c3", sampleRate: 24000, format: "pcm_s16le", part: 0, final: true, pcm: new Uint8Array(4800), ...over });

const MIRRORED = ["CLIENT_EVENTS", "SERVER_EVENTS", "ERROR_CODES", "LIMITS", "VAD_DEFAULTS", "TURN_STATES", "RUNTIME_MODES", "SOCKET_MODES", "INPUT_MODES", "PROMPT_KINDS", "PATTERNS"];
const SERVER_ONLY = ["newTurnId", "createByteBucket"];

test("backend and frontend protocol constants are deeply equal", () => {
  for (const name of MIRRORED) assert.deepEqual(frontend[name], backend[name], name);
  const constants = (mod) => Object.keys(mod).filter((key) => typeof mod[key] !== "function").sort();
  assert.deepEqual(constants(frontend), constants(backend));
  assert.deepEqual(constants(backend), [...MIRRORED].sort());
});

test("both copies export the same validators, and the backend adds only its server helpers", () => {
  const fns = (mod) => Object.keys(mod).filter((key) => typeof mod[key] === "function").sort();
  assert.deepEqual(fns(backend), [...fns(frontend), ...SERVER_ONLY].sort());
});

test("protocol constants are frozen", () => {
  for (const name of MIRRORED) assert.ok(Object.isFrozen(backend[name]), name);
  assert.throws(() => { LIMITS.chunkMaxBytes = 1; }, TypeError);
  assert.equal(LIMITS.chunkMaxBytes, 32768);
  assert.equal(LIMITS.clipPartMaxBytes, 131072);
  assert.equal(LIMITS.maxSegmentBytes, LIMITS.maxSegmentSeconds * LIMITS.captureSampleRate * LIMITS.bytesPerSample);
  assert.deepEqual(Object.values(CLIENT_EVENTS).sort(), ["anvi:clip-have", "anvi:done", "anvi:input-mode", "anvi:prompt-played", "anvi:replayed", "anvi:seg-cancel", "anvi:seg-chunk", "anvi:seg-commit"]);
  assert.deepEqual(Object.values(SERVER_EVENTS).sort(), ["anvi:clip", "anvi:mode", "anvi:prompt", "anvi:replay", "anvi:turn"]);
  for (const code of ["ODD_LENGTH", "OVERSIZE", "BAD_ID", "STALE_TURN", "ON_HOLD", "RATE_LIMITED"]) assert.equal(ERROR_CODES[code], code);
});

test("newTurnId issues 16 random bytes in base64url", () => {
  const ids = new Set(Array.from({ length: 50 }, newTurnId));
  assert.equal(ids.size, 50);
  for (const id of ids) {
    assert.ok(isTurnId(id), id);
    assert.equal(Buffer.from(id, "base64url").length, 16);
  }
});

test("segment ids must be UUIDv4", () => {
  assert.ok(isSegmentId(SEG));
  assert.ok(isSegmentId(SEG.toUpperCase()));
  assert.ok(!isSegmentId("3f2b8c1e-9a4d-1e6f-8b2a-1c3d5e7f9a0b")); // v1
  assert.ok(!isSegmentId("3f2b8c1e-9a4d-4e6f-cb2a-1c3d5e7f9a0b")); // bad variant
  assert.ok(!isSegmentId(`${SEG} `));
  assert.ok(!isSegmentId(42));
});

test("validateChunk accepts a good chunk and Buffer, ArrayBuffer or typed array audio", () => {
  assert.deepEqual(validateChunk(chunk(), { turnId: TURN }), { ok: true, code: null });
  assert.equal(validateChunk(chunk({ pcm: new ArrayBuffer(32768) })).ok, true);
  assert.equal(validateChunk(chunk({ pcm: new Int16Array(100) })).ok, true);
});

test("validateChunk rejects bad input with the protocol codes", () => {
  const cases = [
    [null, "BAD_PAYLOAD"],
    ["x", "BAD_PAYLOAD"],
    [chunk({ turnId: "short" }), "BAD_ID"],
    [chunk({ turnId: undefined }), "BAD_ID"],
    [chunk({ segmentId: "not-a-uuid" }), "BAD_ID"],
    [chunk({ turnId: OTHER_TURN }), "STALE_TURN"],
    [chunk({ part: -1 }), "BAD_PAYLOAD"],
    [chunk({ part: LIMITS.maxPartsPerTurn }), "BAD_PAYLOAD"],
    [chunk({ index: 1.5 }), "BAD_PAYLOAD"],
    [chunk({ index: LIMITS.maxChunksPerSegment }), "BAD_PAYLOAD"],
    [chunk({ pcm: "AAAA" }), "BAD_PAYLOAD"],
    [chunk({ pcm: Buffer.alloc(0) }), "BAD_PAYLOAD"],
    [chunk({ pcm: Buffer.alloc(3201) }), "ODD_LENGTH"],
    [chunk({ pcm: Buffer.alloc(32770) }), "OVERSIZE"],
  ];
  for (const [payload, code] of cases) assert.deepEqual(validateChunk(payload, { turnId: TURN }), { ok: false, code }, JSON.stringify(payload?.pcm ? { ...payload, pcm: payload.pcm.byteLength } : payload));
  assert.equal(validateChunk(chunk(), { turnId: TURN, onHold: true }).code, "ON_HOLD");
  // A stale chunk during a hold is stale (the hold rotated the turn), so the outbox drops it.
  assert.equal(validateChunk(chunk({ turnId: OTHER_TURN }), { turnId: TURN, onHold: true }).code, "STALE_TURN");
});

test("validateChunk consults the rate bucket last, so invalid chunks spend nothing", () => {
  let now = 0;
  const bucket = createByteBucket({ bytesPerSecond: 32000, burstBytes: 64000, now: () => now });
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(3201) }), { bucket }).code, "ODD_LENGTH");
  assert.equal(bucket.available(), 64000);
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(32000) }), { bucket }).ok, true);
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(32000) }), { bucket }).ok, true);
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(2) }), { bucket }).code, "RATE_LIMITED");
  now = 500;
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(16000) }), { bucket }).ok, true);
  assert.equal(validateChunk(chunk({ pcm: Buffer.alloc(2) }), { bucket }).code, "RATE_LIMITED");
});

test("createByteBucket refills to the burst and refuses without spending", () => {
  let now = 0;
  const bucket = createByteBucket({ now: () => now });
  assert.equal(bucket.available(), LIMITS.segmentBurstBytes);
  assert.equal(bucket.take(LIMITS.segmentBurstBytes + 1), false);
  assert.equal(bucket.available(), LIMITS.segmentBurstBytes);
  assert.equal(bucket.take(LIMITS.segmentBurstBytes), true);
  now = 1000;
  assert.equal(bucket.available(), LIMITS.segmentBytesPerSecond);
  now = 60_000;
  assert.equal(bucket.available(), LIMITS.segmentBurstBytes);
  assert.equal(bucket.take(-1), false);
  assert.equal(bucket.take(Number.NaN), false);
});

test("validateCommit accepts a good commit and rejects bad ones", () => {
  assert.deepEqual(validateCommit(commit(), { turnId: TURN }), { ok: true, code: null });
  assert.equal(validateCommit(commit({ totalBytes: LIMITS.maxSegmentBytes, durationMs: 90_000 })).ok, true);
  const cases = [
    [undefined, "BAD_PAYLOAD"],
    [commit({ segmentId: "x" }), "BAD_ID"],
    [commit({ turnId: OTHER_TURN }), "STALE_TURN"],
    [commit({ final: "yes" }), "BAD_PAYLOAD"],
    [commit({ part: 99 }), "BAD_PAYLOAD"],
    [commit({ totalBytes: 0 }), "BAD_PAYLOAD"],
    [commit({ totalBytes: "32000" }), "BAD_PAYLOAD"],
    [commit({ durationMs: -1 }), "BAD_PAYLOAD"],
    [commit({ durationMs: Number.POSITIVE_INFINITY }), "BAD_PAYLOAD"],
    [commit({ totalBytes: 32001 }), "ODD_LENGTH"],
    [commit({ totalBytes: LIMITS.maxSegmentBytes + 2 }), "OVERSIZE"],
    [commit({ durationMs: 90_001 }), "OVERSIZE"],
  ];
  for (const [payload, code] of cases) assert.deepEqual(validateCommit(payload, { turnId: TURN }), { ok: false, code }, JSON.stringify(payload));
  assert.equal(validateCommit(commit(), { turnId: TURN, onHold: true }).code, "ON_HOLD");
});

test("turn refs, input modes and clip-have hints", () => {
  assert.equal(validateTurnRef({ turnId: TURN }, { turnId: TURN }).ok, true);
  assert.equal(validateTurnRef({ turnId: TURN, segmentId: SEG }).ok, true);
  assert.equal(validateTurnRef({ turnId: TURN, segmentId: "x" }).code, "BAD_ID");
  assert.equal(validateTurnRef({ turnId: OTHER_TURN }, { turnId: TURN }).code, "STALE_TURN");
  assert.equal(validateTurnRef(null).code, "BAD_ID");
  assert.equal(inputModeOf({ mode: "ptt" }), "ptt");
  assert.equal(inputModeOf({ mode: "vad" }), "vad");
  assert.equal(inputModeOf({ mode: "live" }), null);
  assert.equal(inputModeOf("ptt"), null);
  assert.deepEqual(clipHaveIds({ assetIds: ["a", "a", "b/c", 3, "", "c_d-1"] }), ["a", "c_d-1"]);
  assert.deepEqual(clipHaveIds({ assetIds: "a" }), []);
  assert.equal(clipHaveIds({ assetIds: Array.from({ length: 200 }, (_, i) => `id${i}`) }).length, LIMITS.maxClipHave);
});

test("validateClip checks the clip format, ids and part size", () => {
  assert.deepEqual(validateClip(clip()), { ok: true, code: null });
  assert.equal(validateClip(clip({ assetId: "../x" })).code, "BAD_ID");
  assert.equal(validateClip(clip({ sampleRate: 16000 })).code, "BAD_PAYLOAD");
  assert.equal(validateClip(clip({ format: "wav" })).code, "BAD_PAYLOAD");
  assert.equal(validateClip(clip({ part: LIMITS.maxClipParts })).code, "BAD_PAYLOAD");
  assert.equal(validateClip(clip({ pcm: new Uint8Array(LIMITS.clipPartMaxBytes + 2) })).code, "OVERSIZE");
  assert.equal(validateClip(clip({ pcm: new Uint8Array(5) })).code, "ODD_LENGTH");
});

test("the frontend validators give the same results as the backend on a shared fixture table", () => {
  const fixtures = [
    ["validateChunk", [chunk(), { turnId: TURN }]],
    ["validateChunk", [chunk({ pcm: Buffer.alloc(3201) })]],
    ["validateChunk", [chunk({ pcm: Buffer.alloc(40000) })]],
    ["validateChunk", [chunk({ turnId: OTHER_TURN }), { turnId: TURN }]],
    ["validateChunk", [chunk(), { onHold: true }]],
    ["validateChunk", [chunk({ segmentId: "x" })]],
    ["validateCommit", [commit()]],
    ["validateCommit", [commit({ totalBytes: 3 })]],
    ["validateCommit", [commit({ durationMs: 100_000 })]],
    ["validateTurnRef", [{ turnId: TURN }, { turnId: OTHER_TURN }]],
    ["validateClip", [clip()]],
    ["validateClip", [clip({ pcm: new Uint8Array(3) })]],
    ["inputModeOf", [{ mode: "ptt" }]],
    ["clipHaveIds", [{ assetIds: ["a", "a", "b c", "d"] }]],
    ["isTurnId", [newTurnId()]],
    ["isSegmentId", [SEG]],
    ["isAssetId", ["x".repeat(129)]],
    ["pcmByteLength", [new Uint16Array(4)]],
  ];
  for (const [name, args] of fixtures) assert.deepEqual(frontend[name](...args), backend[name](...args), name);
});
