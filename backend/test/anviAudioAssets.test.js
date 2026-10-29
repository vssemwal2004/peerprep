import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { runForTenant } from "../src/platform/tenantContext.js";
import { AnviAudioAsset } from "../src/modules/anviInterview/anviInterview.audio.models.js";
import { createAudioAssets, normalizeSpokenText, textHashOf, ttsLockKey } from "../src/modules/anviInterview/anviInterview.audioAssets.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { parseWav } from "../src/modules/anviInterview/anviInterview.wav.js";

let mongo;
let skipped = false;
let tenantA;
let tenantB;
const id = () => new mongoose.Types.ObjectId();
const QUESTION = "Explain how a hash map handles collisions in practice.";
const WORDS = 9;
const FALLBACK = "gemini-3.8-flash-lite-tts";
const config = (env = {}) => anviConfig({ ANVI_TTS_MIN_WPM: "110", ANVI_TTS_TIMEOUT_MS: "3000", ...env });

before(async () => {
  // A longer launch timeout: the default 10 s is too short on a loaded machine.
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", launchTimeout: 60_000 } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_audio_assets_test" });
  const connect = async (dbName) => mongoose.createConnection(mongo.getUri(), { dbName, autoIndex: false }).asPromise();
  tenantA = { universityId: "aaaaaaaaaaaaaaaaaaaaaaaa", connection: await connect("anvi_audio_tenant_a") };
  tenantB = { universityId: "bbbbbbbbbbbbbbbbbbbbbbbb", connection: await connect("anvi_audio_tenant_b") };
});

after(async () => {
  await tenantA?.connection.close();
  await tenantB?.connection.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  if (skipped) return;
  await AnviAudioAsset.deleteMany({});
  for (const tenant of [tenantA, tenantB]) await runForTenant(tenant, () => AnviAudioAsset.deleteMany({}));
});

// A voiced tone that speaks `words` words at `pace` wpm (24 kHz s16le), with 300 ms of silence either side.
function tone(words, pace) {
  const voicedSamples = Math.round((words / pace) * 60 * 24000);
  const pad = 0.3 * 24000;
  const pcm = Buffer.alloc((voicedSamples + 2 * pad) * 2);
  for (let i = 0; i < voicedSamples; i += 1) pcm.writeInt16LE(i % 2 ? 4000 : -4000, (pad + i) * 2);
  return pcm;
}

function fakeGemini({ paceByModel = {}, fail = null, delayMs = 40 } = {}) {
  const calls = [];
  return {
    calls,
    async synthesizeSpeech(options) {
      calls.push({ model: options.model, fallbackModel: options.fallbackModel });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (fail) throw fail(calls.length);
      const model = options.model;
      return { pcm: tone(wordsOf(options.text), paceByModel[model] ?? 150), sampleRate: 24000, model };
    },
  };
}
const wordsOf = (text) => String(text).trim().split(/\s+/).length;

function fakeStorage({ putError = null, putDelayMs = 0, getError = null } = {}) {
  const objects = new Map();
  const calls = { put: 0, get: 0, copy: 0, remove: 0 };
  return {
    ready: true, objects, calls,
    async put(key, buffer) {
      calls.put += 1;
      if (putDelayMs) await new Promise((resolve) => setTimeout(resolve, putDelayMs));
      if (putError) throw putError;
      objects.set(key, Buffer.from(buffer));
      return { size: buffer.length };
    },
    async get(key) { calls.get += 1; if (getError) throw getError; return objects.get(key) || null; },
    async head(key) { return objects.has(key) ? { size: objects.get(key).length } : null; },
    async copy(source, target) {
      calls.copy += 1;
      if (!objects.has(source)) throw Object.assign(new Error("missing"), { code: "ANVI_AUDIO_COPY_FAILED" });
      objects.set(target, objects.get(source));
      return true;
    },
    async remove(key) { calls.remove += 1; objects.delete(key); return true; },
  };
}

// SET NX PX and the compare-and-delete EVAL, shared by "instances".
function fakeValkey({ broken = false } = {}) {
  const keys = new Map();
  const seen = [];
  return {
    keys, seen,
    async sendCommand(args) {
      seen.push(args[0]);
      if (broken) throw new Error("connection refused");
      if (args[0] === "SET") {
        const [, key, value, nx] = args;
        if (nx === "NX" && keys.has(key)) return null;
        keys.set(key, value);
        return "OK";
      }
      if (args[0] === "EVAL") {
        const [, , , key, token] = args;
        if (keys.get(key) === token) { keys.delete(key); return 1; }
        return 0;
      }
      throw new Error(`unexpected ${args[0]}`);
    },
  };
}

function metrics() {
  const counts = {};
  const sink = (name, n = 1) => { counts[name] = (counts[name] || 0) + n; };
  return { counts, sink };
}

function silentLog() {
  const lines = [];
  return { lines, warn: (line) => lines.push(String(line)), info: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

const assets = (overrides = {}) => createAudioAssets({ config: config(), valkey: null, log: silentLog(), ...overrides });
const revisionSpec = (interviewId, overrides = {}) => ({ scope: "revision", interviewId, revision: 1, questionId: "q1", text: QUESTION, ...overrides });
const skipIf = (t) => { if (skipped) { t.skip("mongodb-memory-server unavailable"); return true; } return false; };

test("text normalisation keeps punctuation; the lock key holds no text", () => {
  assert.equal(normalizeSpokenText("  Hello,\n  world!  "), "Hello, world!");
  assert.equal(textHashOf("Hello,   world!"), textHashOf(" Hello, world! "));
  assert.notEqual(textHashOf("Hello, world!"), textHashOf("Hello world"));
  assert.equal(ttsLockKey("t1", "abc"), "peerprep:anvi:tts-lock:t1:abc");
});

test("AC1: two students on the same interview and revision cause one synthesize", async (t) => {
  if (skipIf(t)) return;
  const gemini = fakeGemini();
  const storage = fakeStorage();
  const m = metrics();
  const store = assets({ gemini, storage, metric: m.sink });
  const interviewId = String(id());
  const first = await store.ensure(revisionSpec(interviewId));
  const second = await store.ensure(revisionSpec(interviewId));
  assert.equal(gemini.calls.length, 1);
  assert.ok(first?.assetId);
  assert.equal(second.assetId, first.assetId);
  assert.equal(second.status, "ready");
  assert.deepEqual(m.counts, { ttsCacheMiss: 1, ttsCacheHit: 1 });

  const row = await AnviAudioAsset.findById(first.assetId).lean();
  assert.equal(row.status, "ready");
  assert.equal(row.tenantKey, "platform");
  assert.ok(row.wpm >= 140 && row.wpm <= 160, `wpm ${row.wpm}`);
  assert.equal(row.storageKey, `anvi-audio/platform/${interviewId}/1/${row.hash}.wav`);
  // The row holds no text.
  assert.ok(!JSON.stringify(row).includes("hash map"));

  // Both students' attempts load the same bytes; a fresh process reads them from R2.
  for (const studentAttempt of [{ _id: id(), interviewId, snapshotRevision: 1 }, { _id: id(), interviewId, snapshotRevision: 1 }]) {
    const clip = await store.load(first.assetId, studentAttempt);
    assert.equal(clip.mimeType, "audio/wav");
    assert.equal(clip.sampleRate, 24000);
    assert.equal(clip.pcm.length, clip.wav.length - 44);
  }
  const fresh = assets({ gemini, storage });
  const clip = await fresh.load(first.assetId, { _id: id(), interviewId, snapshotRevision: 1 });
  assert.equal(parseWav(clip.wav).durationMs, clip.durationMs);
  assert.equal(storage.calls.get, 1);
  assert.equal(gemini.calls.length, 1);
});

test("AC2: 10 concurrent ensures across 2 instances cause one call; with Valkey throwing the Mongo claim still gives one", async (t) => {
  if (skipIf(t)) return;
  for (const broken of [false, true]) {
    const gemini = fakeGemini({ delayMs: 120 });
    const storage = fakeStorage();
    const valkey = fakeValkey({ broken });
    const one = assets({ gemini, storage, valkey });
    const two = assets({ gemini, storage, valkey });
    const interviewId = String(id());
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? one : two).ensure(revisionSpec(interviewId))));
    assert.equal(gemini.calls.length, 1, `broken=${broken}`);
    assert.equal(new Set(results.map((result) => result?.assetId)).size, 1);
    assert.ok(results.every((result) => result?.status === "ready"));
    assert.equal(storage.calls.put, 1);
    if (!broken) assert.equal(valkey.keys.size, 0, "the lock is released");
    else assert.ok(valkey.seen.includes("SET"));
  }
});

test("a failed asset is never served and is retried only after retryAfter", async (t) => {
  if (skipIf(t)) return;
  let nowMs = Date.parse("2026-10-23T10:00:00Z");
  const clock = { now: () => nowMs };
  let failing = true;
  const gemini = fakeGemini({ fail: () => (failing ? Object.assign(new Error("quota"), { code: "GEMINI_RATE_LIMITED" }) : null) });
  const real = gemini.synthesizeSpeech;
  gemini.synthesizeSpeech = async (options) => {
    if (!failing) { gemini.calls.push({ model: options.model }); return { pcm: tone(WORDS, 150), sampleRate: 24000, model: options.model }; }
    return real(options);
  };
  const store = assets({ gemini, storage: fakeStorage(), clock });
  const interviewId = String(id());
  assert.equal(await store.ensure(revisionSpec(interviewId)), null);
  let row = await AnviAudioAsset.findOne({}).lean();
  assert.equal(row.status, "failed");
  assert.equal(row.failureCode, "GEMINI_RATE_LIMITED");
  assert.equal(row.attempts, 1);
  assert.equal(row.retryAfter.getTime(), nowMs + 30_000);
  // Not served and not retried before retryAfter.
  assert.equal(await store.load(String(row._id), { _id: id(), interviewId, snapshotRevision: 1 }), null);
  assert.equal(await store.ensure(revisionSpec(interviewId)), null);
  assert.equal(gemini.calls.length, 1);
  // A second failure doubles the backoff.
  nowMs += 31_000;
  assert.equal(await store.ensure(revisionSpec(interviewId)), null);
  row = await AnviAudioAsset.findOne({}).lean();
  assert.equal(row.attempts, 2);
  assert.equal(row.retryAfter.getTime(), nowMs + 60_000);
  nowMs += 61_000;
  failing = false;
  const ready = await store.ensure(revisionSpec(interviewId));
  assert.equal(ready.status, "ready");
  assert.equal(gemini.calls.length, 3);
  assert.equal((await AnviAudioAsset.findOne({}).lean()).failureCode, null);
});

test("a new revision gives a new hash; identical text is copied in R2, changed text is synthesized", async (t) => {
  if (skipIf(t)) return;
  const gemini = fakeGemini();
  const storage = fakeStorage();
  const m = metrics();
  const store = assets({ gemini, storage, metric: m.sink });
  const interviewId = String(id());
  const v1 = await store.ensure(revisionSpec(interviewId, { revision: 1 }));
  const v2 = await store.ensure(revisionSpec(interviewId, { revision: 2, text: `  ${QUESTION}  ` }));
  assert.notEqual(v2.assetId, v1.assetId);
  assert.notEqual(v2.hash, v1.hash);
  assert.equal(gemini.calls.length, 1);
  assert.equal(storage.calls.copy, 1);
  assert.equal(m.counts.avoidedTtsCall, 1);
  const row2 = await AnviAudioAsset.findById(v2.assetId).lean();
  assert.equal(row2.status, "ready");
  assert.equal(row2.revision, 2);
  assert.ok(storage.objects.has(row2.storageKey));
  // An old revision never serves a new revision's attempt, and vice versa.
  assert.equal(await store.load(v1.assetId, { _id: id(), interviewId, snapshotRevision: 2 }), null);
  assert.ok(await store.load(v2.assetId, { _id: id(), interviewId, snapshotRevision: 2 }));
  // Changed text in revision 3 is synthesized.
  await store.ensure(revisionSpec(interviewId, { revision: 3, text: "Explain how a hash set handles collisions in practice." }));
  assert.equal(gemini.calls.length, 2);
  // A different voice is a different asset, even for the same text.
  const voiced = await store.ensure(revisionSpec(interviewId, { revision: 1, voice: "Kore" }));
  assert.notEqual(voiced.assetId, v1.assetId);
  assert.equal(gemini.calls.length, 3);
});

test("AC6: load refuses another attempt's, another interview's and another tenant's asset", async (t) => {
  if (skipIf(t)) return;
  const store = assets({ gemini: fakeGemini(), storage: fakeStorage() });
  const interviewId = String(id());
  const mine = { _id: id(), interviewId, snapshotRevision: 1 };
  const other = { _id: id(), interviewId, snapshotRevision: 1 };
  const [personal, shared, template] = await runForTenant(tenantA, () => Promise.all([
    store.ensure({ scope: "attempt", interviewId, attemptId: String(mine._id), questionId: "resume1", text: QUESTION }),
    store.ensure(revisionSpec(interviewId)),
    store.ensure({ scope: "template", templateId: "ack.okay", text: "Okay." }),
  ]));
  await personal.stored;
  await runForTenant(tenantA, async () => {
    assert.ok(await store.load(personal.assetId, mine));
    assert.equal(await store.load(personal.assetId, other), null);
    assert.ok(await store.load(shared.assetId, other));
    assert.equal(await store.load(shared.assetId, { ...other, interviewId: String(id()) }), null);
    assert.ok(await store.load(template.assetId, { _id: id(), interviewId: String(id()), snapshotRevision: 9 }));
    assert.equal(await store.load("not-an-id", mine), null);
    assert.equal(await store.load(String(id()), mine), null);
    const row = await AnviAudioAsset.findById(template.assetId).lean();
    assert.equal(row.tenantKey, tenantA.universityId);
    assert.equal(row.storageKey, `anvi-audio/${tenantA.universityId}/_templates/v1/${row.hash}.wav`);
  });
  // The same ids from another tenant, or from the platform, resolve to nothing.
  for (const assetId of [personal.assetId, shared.assetId, template.assetId]) {
    assert.equal(await runForTenant(tenantB, () => store.load(assetId, mine)), null);
    assert.equal(await store.load(assetId, mine), null);
  }
  // A tenant's attempt asset row lands in that tenant's DB only.
  assert.equal(await AnviAudioAsset.countDocuments({}), 0);
  assert.equal(await runForTenant(tenantB, () => AnviAudioAsset.countDocuments({})), 0);
  // Same text in another tenant is its own asset (tenant-scoped cache).
  const elsewhere = await runForTenant(tenantB, () => store.ensure(revisionSpec(interviewId)));
  assert.notEqual(elsewhere.hash, shared.hash);
});

test("AC7: an R2 put failure resolves null, never throws, and leaves a failed row", async (t) => {
  if (skipIf(t)) return;
  const log = silentLog();
  const store = assets({ gemini: fakeGemini(), storage: fakeStorage({ putError: Object.assign(new Error("https://r2.example/x?X-Amz-Signature=1"), { code: "ANVI_AUDIO_WRITE_FAILED" }) }), log });
  const interviewId = String(id());
  assert.equal(await store.ensure(revisionSpec(interviewId)), null);
  const row = await AnviAudioAsset.findOne({}).lean();
  assert.equal(row.status, "failed");
  assert.equal(row.failureCode, "ANVI_AUDIO_WRITE_FAILED");
  // Nothing was left in the process cache to serve.
  assert.equal(await store.load(String(row._id), { _id: id(), interviewId, snapshotRevision: 1 }), null);

  // R2 read failures and a Mongo outage also resolve null.
  const ok = fakeStorage();
  const writer = assets({ gemini: fakeGemini(), storage: ok });
  const ready = await writer.ensure(revisionSpec(interviewId, { questionId: "q2" }));
  const reader = assets({ gemini: fakeGemini(), storage: { ...ok, get: async () => { throw new Error("down"); } }, log });
  assert.equal(await reader.load(ready.assetId, { _id: id(), interviewId, snapshotRevision: 1 }), null);
  const broken = assets({ gemini: fakeGemini(), storage: ok, model: { findOne: () => ({ lean: async () => { throw new Error("mongo down"); } }) }, log });
  assert.equal(await broken.ensure(revisionSpec(interviewId)), null);
  assert.equal(await broken.load(ready.assetId, { _id: id(), interviewId, snapshotRevision: 1 }), null);
  // Unconfigured storage: text fallback, no TTS call.
  const gemini = fakeGemini();
  const offline = assets({ gemini, storage: { ready: false } });
  assert.equal(await offline.ensure(revisionSpec(interviewId, { questionId: "q3" })), null);
  assert.equal(gemini.calls.length, 0);
});

test("the pace guard retries once on the fallback model, else fails TTS_TOO_SLOW", async (t) => {
  if (skipIf(t)) return;
  const interviewId = String(id());
  const withFallback = config({ ANVI_TTS_FALLBACK_MODEL: FALLBACK });
  const gemini = fakeGemini({ paceByModel: { [withFallback.ttsModel]: 60, [FALLBACK]: 140 } });
  const store = assets({ gemini, storage: fakeStorage(), config: withFallback });
  const ready = await store.ensure(revisionSpec(interviewId));
  assert.equal(ready.status, "ready");
  assert.deepEqual(gemini.calls.map((call) => call.model), [withFallback.ttsModel, FALLBACK]);
  assert.equal(gemini.calls[1].fallbackModel, null);
  assert.ok((await AnviAudioAsset.findById(ready.assetId).lean()).wpm >= 130);

  const slow = fakeGemini({ paceByModel: { [config().ttsModel]: 60 } });
  const noFallback = assets({ gemini: slow, storage: fakeStorage() });
  assert.equal(await noFallback.ensure(revisionSpec(interviewId, { questionId: "q9" })), null);
  assert.equal(slow.calls.length, 1);
  assert.equal((await AnviAudioAsset.findOne({ questionId: "q9" }).lean()).failureCode, "TTS_TOO_SLOW");
  // Short lines ("Okay.") are not judged on pace.
  const ack = await noFallback.ensure({ scope: "template", templateId: "ack.okay", text: "Okay." });
  assert.equal(ack.status, "ready");
});

test("attempt scope: budget-gated, playable before the R2 put completes, never shared, cleaned up", async (t) => {
  if (skipIf(t)) return;
  const gemini = fakeGemini();
  const storage = fakeStorage({ putDelayMs: 150 });
  const store = assets({ gemini, storage });
  const interviewId = String(id());
  const attempt = { _id: id(), interviewId, snapshotRevision: 1 };
  const spec = { scope: "attempt", interviewId, attemptId: String(attempt._id), questionId: "annu1", text: QUESTION };

  const denied = await store.ensure({ ...spec, budget: { allow: (kind) => kind !== "tts" } });
  assert.equal(denied, null);
  assert.equal(gemini.calls.length, 0);
  assert.equal(await AnviAudioAsset.countDocuments({}), 0);

  const allowed = [];
  const clip = await store.ensure({ ...spec, budget: { allow: (kind) => { allowed.push(kind); return true; } } });
  assert.deepEqual(allowed, ["tts"]);
  assert.equal(clip.status, "generating");
  assert.equal(storage.calls.put, 1);
  assert.equal(storage.objects.size, 0, "not yet stored");
  assert.ok(await store.load(clip.assetId, attempt), "playable from the process cache");
  assert.equal(await clip.stored, true);
  assert.equal((await AnviAudioAsset.findById(clip.assetId).lean()).status, "ready");

  // Another student with the same generated text gets their own asset and their own TTS call.
  const otherAttempt = { _id: id(), interviewId, snapshotRevision: 1 };
  const theirs = await store.ensure({ ...spec, attemptId: String(otherAttempt._id) });
  assert.notEqual(theirs.assetId, clip.assetId);
  assert.equal(gemini.calls.length, 2);
  await theirs.stored;

  // Static scopes on a miss ask for tts_static.
  const kinds = [];
  await store.ensure({ ...revisionSpec(interviewId), budget: { allow: (kind) => { kinds.push(kind); return true; } } });
  assert.deepEqual(kinds, ["tts_static"]);

  assert.deepEqual(await store.cleanupAttemptAssets([attempt._id]), { removed: 1, failed: 0 });
  assert.equal(await AnviAudioAsset.countDocuments({ scope: "attempt" }), 1);
  assert.equal(await store.load(clip.assetId, attempt), null);
  assert.equal(await AnviAudioAsset.countDocuments({ scope: "revision" }), 1);
});

test("logs never contain the spoken text, a URL or a storage key", async (t) => {
  if (skipIf(t)) return;
  const log = silentLog();
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const consoleLines = [];
  for (const name of Object.keys(original)) console[name] = (...args) => consoleLines.push(args.join(" "));
  try {
    const interviewId = String(id());
    const leaky = (message) => Object.assign(new Error(`${message} ${QUESTION} https://r2.example/anvi-audio/x.wav`), { code: "ANVI_AUDIO_WRITE_FAILED" });
    await assets({ gemini: fakeGemini(), storage: fakeStorage({ putError: leaky("put") }), log }).ensure(revisionSpec(interviewId));
    await assets({ gemini: fakeGemini({ fail: () => leaky("tts") }), storage: fakeStorage(), log }).ensure(revisionSpec(interviewId, { questionId: "q2" }));
    await assets({ gemini: fakeGemini(), storage: { ready: false }, log }).ensure(revisionSpec(interviewId, { questionId: "q3" }));
    const reader = assets({ gemini: fakeGemini(), storage: { ...fakeStorage(), get: async () => { throw leaky("get"); } }, log });
    const ready = await assets({ gemini: fakeGemini(), storage: fakeStorage() }).ensure(revisionSpec(interviewId, { questionId: "q4" }));
    await reader.load(ready.assetId, { _id: id(), interviewId, snapshotRevision: 1 });
    assert.ok(log.lines.length >= 3);
    for (const line of [...log.lines, ...consoleLines]) {
      assert.doesNotMatch(line, /hash map|https?:|anvi-audio\/|X-Amz/i, line);
    }
  } finally {
    Object.assign(console, original);
  }
});
