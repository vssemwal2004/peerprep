import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { runForTenant } from "../src/platform/tenantContext.js";
import AIInterview from "../src/models/AIInterview.js";
import { createAuthoringRouter } from "../src/routes/aiInterviews.js";
import { assignmentGuard, audioPregenHooks } from "../src/controllers/aiInterviewController.js";
import { AnviAudioAsset } from "../src/modules/anviInterview/anviInterview.audio.models.js";
import { createAudioAssets } from "../src/modules/anviInterview/anviInterview.audioAssets.js";
import { createAudioPregen, pregenSpecs } from "../src/modules/anviInterview/anviInterview.audioPregen.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { AnviAttempt } from "../src/modules/anviInterview/anviInterview.models.js";
import { maintainAnviAudio } from "../src/modules/anviInterview/anviInterview.maintenance.js";
import { staticSpeakableItems } from "../src/modules/anviInterview/anviInterview.speakable.js";
import { pregenTemplates } from "../src/modules/anviInterview/anviInterview.templates.js";

// Dedicated ephemeral MongoDB only; Gemini, R2 and Valkey are fakes.
let mongo, server, base, tenantA, tenantB;
let skipped = false;
const adminA = new mongoose.Types.ObjectId().toString();
const adminB = new mongoose.Types.ObjectId().toString();
const id = () => new mongoose.Types.ObjectId();
const config = (env = {}) => anviConfig({ ANVI_HYBRID_ENABLED: "true", ANVI_TTS_MIN_WPM: "110", ANVI_TTS_TIMEOUT_MS: "3000", ...env });
const silentLog = () => ({ warn() {}, info() {}, error() {} });

const DATA = {
  title: "Caching",
  sections: [{
    id: "s1", name: "Core", groups: [{
      id: "g1", name: "Basics", questions: [
        { id: "q1", kind: "specific", prompt: "Explain how a cache decides what to evict first.", subquestions: [{ prompt: "When would you invalidate it?" }], followUps: [{ prompt: "And how does a CDN do it?" }] },
        { id: "q2", kind: "specific", prompt: "Describe how a hash map handles collisions in practice." },
        { id: "q3", kind: "topic", prompt: "Caching" },
      ],
    }],
  }],
};
const lineCount = () => staticSpeakableItems(DATA, ["English"]).length;
const templateCount = () => pregenTemplates(["English"]).length;

function tone(text, pace = 150) {
  const words = String(text).trim().split(/\s+/).length;
  const voiced = Math.round((words / pace) * 60 * 24000);
  const pcm = Buffer.alloc(voiced * 2);
  for (let i = 0; i < voiced; i += 1) pcm.writeInt16LE(i % 2 ? 4000 : -4000, i * 2);
  return pcm;
}
function fakeGemini({ fail = null, gate = null } = {}) {
  const calls = [];
  return {
    calls,
    async synthesizeSpeech(options) {
      calls.push(options.text);
      if (gate) await gate;
      if (fail?.(options.text, calls.length)) throw Object.assign(new Error("busy"), { code: "GEMINI_UNAVAILABLE" });
      return { pcm: tone(options.text), sampleRate: 24000, model: options.model };
    },
  };
}
function fakeStorage() {
  const objects = new Map();
  const calls = { put: 0, copy: 0, remove: 0 };
  return {
    ready: true, objects, calls,
    async put(key, buffer) { calls.put += 1; objects.set(key, Buffer.from(buffer)); return { size: buffer.length }; },
    async get(key) { return objects.get(key) || null; },
    async head(key) { return objects.has(key) ? { size: objects.get(key).length } : null; },
    async copy(source, target) { calls.copy += 1; objects.set(target, objects.get(source)); return true; },
    async remove(key) { calls.remove += 1; objects.delete(key); return true; },
  };
}
function harness({ gemini = fakeGemini(), storage = fakeStorage(), env = {}, clock = Date } = {}) {
  const cfg = config(env);
  const assets = createAudioAssets({ config: cfg, gemini, storage, valkey: null, log: silentLog(), clock, sleep: async () => {} });
  const pregen = createAudioPregen({ config: cfg, assets, clock, sleep: async () => {}, log: silentLog(), minIntervalMs: 0 });
  return { gemini, storage, assets, pregen, config: cfg };
}
// A published interview as releaseInterview leaves it.
async function publishedInterview({ revision = 3, outbox = true, ownerId = adminA, data = DATA } = {}) {
  return AIInterview.create({
    ownerId, creationKey: `k-${id()}`, title: data.title, data, revision, lifecycle: "draft",
    validation: { complete: true, validatedRevision: revision },
    publishedSnapshot: { data, revision, at: new Date() }, publishedAt: new Date(), publishedRevision: revision,
    ...(outbox ? { audioPregen: { revision, status: "pending", attempts: 0, nextAt: new Date(), requestedAt: new Date(0) } } : {}),
  });
}
const skipIf = (t) => { if (skipped) { t.skip("mongodb-memory-server unavailable"); return true; } return false; };

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", launchTimeout: 60_000 } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_audio_pregen_test" });
  await AIInterview.init();
  const connect = async (dbName) => mongoose.createConnection(mongo.getUri(), { dbName, autoIndex: false }).asPromise();
  tenantA = { universityId: "aaaaaaaaaaaaaaaaaaaaaaaa", connection: await connect("anvi_pregen_tenant_a") };
  tenantB = { universityId: "bbbbbbbbbbbbbbbbbbbbbbbb", connection: await connect("anvi_pregen_tenant_b") };
  const app = express();
  app.use(express.json());
  app.use("/api/ai-interviews", createAuthoringRouter((req, _res, next) => {
    req.user = { _id: req.get("X-Test-Owner") || adminA, role: "admin" };
    next();
  }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await tenantA?.connection.close();
  await tenantB?.connection.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

const originalPregen = audioPregenHooks.pregen;
const originalGuard = assignmentGuard.activeAssignmentFor;
beforeEach(async () => {
  if (skipped) return;
  audioPregenHooks.pregen = originalPregen;
  assignmentGuard.activeAssignmentFor = originalGuard;
  await Promise.all([AIInterview.deleteMany({}), AnviAudioAsset.deleteMany({}), AnviAttempt.deleteMany({})]);
  for (const tenant of [tenantA, tenantB]) await runForTenant(tenant, () => Promise.all([AIInterview.deleteMany({}), AnviAudioAsset.deleteMany({})]));
});

const call = async (path, method = "GET", body, headers = {}) => {
  const result = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, body: await result.json(), headers: result.headers };
};
const withGeminiKey = async (work) => {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-not-a-key";
  try { return await work(); } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
};
const draftReadyToPublish = () => AIInterview.create({
  ownerId: adminA, creationKey: `k-${id()}`, title: DATA.title, data: DATA, revision: 1, lifecycle: "draft",
  validation: { complete: true, validatedRevision: 1 },
});

test("the pass voices one clip per static line and template; a re-run makes no calls", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const doc = await publishedInterview();
  const expected = lineCount() + templateCount();
  assert.equal(pregenSpecs(DATA, { interviewId: doc._id, revision: 3, config: h.config }).length, expected);
  const result = await h.pregen.kick(String(doc._id), 3);
  assert.equal(result.status, "done");
  assert.deepEqual(result.counts, { total: expected, ready: expected, failed: 0 });
  assert.equal(h.gemini.calls.length, expected);
  assert.equal(await AnviAudioAsset.countDocuments({ scope: "revision", status: "ready" }), lineCount());
  // The topic question is per student: never voiced here.
  assert.equal(await AnviAudioAsset.countDocuments({ questionId: "q3" }), 0);
  const saved = (await AIInterview.findById(doc._id).lean()).audioPregen;
  assert.equal(saved.status, "done");
  assert.equal(saved.nextAt, null);
  // A done outbox is not claimed again; a re-queued one finds every clip ready and calls nothing.
  assert.equal(await h.pregen.kick(String(doc._id), 3), null);
  await AIInterview.updateOne({ _id: doc._id }, { $set: { "audioPregen.status": "pending", "audioPregen.nextAt": null } });
  const again = await h.pregen.kick(String(doc._id), 3);
  assert.equal(again.status, "done");
  assert.equal(h.gemini.calls.length, expected);
  // The rows hold no spoken text.
  const row = await AnviAudioAsset.findOne({ questionId: "q1" }).lean();
  assert.equal(JSON.stringify(row).includes("evict"), false);
});

test("two kicks of one revision claim it once", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const doc = await publishedInterview();
  const [one, two] = await Promise.all([h.pregen.kick(String(doc._id), 3), h.pregen.kick(String(doc._id), 3)]);
  assert.equal([one, two].filter(Boolean).length, 1);
  assert.equal(h.gemini.calls.length, lineCount() + templateCount());
});

test("a TTS failure leaves the outbox partial with nextAt; the maintenance tick retries once due", async (t) => {
  if (skipIf(t)) return;
  let failing = true;
  const h = harness({ gemini: fakeGemini({ fail: (text) => failing && text.includes("hash map") }) });
  const doc = await publishedInterview();
  const result = await h.pregen.kick(String(doc._id), 3);
  assert.equal(result.status, "partial");
  assert.equal(result.counts.failed, 1);
  const saved = (await AIInterview.findById(doc._id).lean()).audioPregen;
  assert.equal(saved.status, "partial");
  assert.ok(new Date(saved.nextAt) > new Date());
  // Not due yet: the tick claims nothing.
  assert.equal((await h.pregen.maintain({ now: new Date() })).claimed, 0);
  // Once due (and past the clip's retryAfter), the tick claims it and the clip is generated.
  failing = false;
  await AIInterview.updateOne({ _id: doc._id }, { $set: { "audioPregen.nextAt": new Date(Date.now() - 1000) } });
  await AnviAudioAsset.updateMany({ status: "failed" }, { $set: { retryAfter: new Date(Date.now() - 1000) } });
  assert.equal((await h.pregen.maintain({ now: new Date() })).claimed, 1);
  for (let i = 0; i < 50 && (await AIInterview.findById(doc._id).lean()).audioPregen.status !== "done"; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await AIInterview.findById(doc._id).lean()).audioPregen.status, "done");
  assert.equal(await AnviAudioAsset.countDocuments({ status: "failed" }), 0);
});

test("a busy Gemini backs off and stops the pass after three busy replies in a row", async (t) => {
  if (skipIf(t)) return;
  const h = harness({ gemini: fakeGemini({ fail: () => true }) });
  const doc = await publishedInterview();
  const result = await h.pregen.kick(String(doc._id), 3);
  assert.equal(result.status, "partial");
  assert.ok(h.gemini.calls.length <= 4, `stopped early (${h.gemini.calls.length} calls)`);
  assert.equal(result.counts.failed, result.counts.total);
});

test("publish returns without waiting for TTS and still succeeds when TTS fails", async (t) => {
  if (skipIf(t)) return;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ gemini: fakeGemini({ gate, fail: () => true }) });
  const kicks = [];
  audioPregenHooks.pregen = () => ({ ...h.pregen, kick: (...args) => { const run = h.pregen.kick(...args); kicks.push(run); return run; } });
  const draft = await draftReadyToPublish();
  const published = await withGeminiKey(() => call(`/${draft._id}/publish`, "POST", { revision: 1 }));
  assert.equal(published.status, 200);
  assert.equal(published.body.publishedRevision, 2);
  const stored = await AIInterview.findById(draft._id).lean();
  assert.equal(stored.audioPregen.revision, 2);
  assert.ok(["pending", "running"].includes(stored.audioPregen.status));
  assert.equal(kicks.length, 1);
  release();
  const result = await kicks[0];
  assert.equal(result.status, "partial");
  assert.equal((await AIInterview.findById(draft._id).lean()).publishedRevision, 2);
});

test("a second publish copies unchanged clips instead of synthesizing them again", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const kicks = [];
  audioPregenHooks.pregen = () => ({ ...h.pregen, kick: (...args) => { const run = h.pregen.kick(...args); kicks.push(run); return run; } });
  const draft = await draftReadyToPublish();
  await withGeminiKey(() => call(`/${draft._id}/publish`, "POST", { revision: 1 }));
  await kicks[0];
  const first = h.gemini.calls.length;
  assert.equal(first, lineCount() + templateCount());
  const republished = await withGeminiKey(() => call(`/${draft._id}/publish`, "POST", { revision: 2 }));
  assert.equal(republished.status, 200);
  const second = await kicks[1];
  assert.equal(second.status, "done");
  assert.equal(h.gemini.calls.length, first);
  assert.equal(h.storage.calls.copy, lineCount());
  assert.equal(await AnviAudioAsset.countDocuments({ scope: "revision", revision: 3, status: "ready" }), lineCount());
});

test("with the hybrid flag off a publish queues nothing and makes no TTS call", async (t) => {
  if (skipIf(t)) return;
  const h = harness({ env: { ANVI_HYBRID_ENABLED: "false" } });
  audioPregenHooks.pregen = () => h.pregen;
  const draft = await draftReadyToPublish();
  const published = await withGeminiKey(() => call(`/${draft._id}/publish`, "POST", { revision: 1 }));
  assert.equal(published.status, 200);
  assert.equal(await h.pregen.kick(String(draft._id), 2), null);
  assert.deepEqual(await maintainAnviAudio(new Date(), { config: h.config, audioPregen: h.pregen }), { skipped: true });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(h.gemini.calls.length, 0);
  assert.equal(await AnviAudioAsset.countDocuments({}), 0);
});

test("AC6: rows land in the publishing tenant's database only", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const doc = await runForTenant(tenantA, () => publishedInterview());
  const result = await runForTenant(tenantA, () => h.pregen.kick(String(doc._id), 3));
  assert.equal(result.status, "done");
  const inA = await runForTenant(tenantA, () => AnviAudioAsset.countDocuments({}));
  assert.equal(inA, lineCount() + templateCount());
  assert.equal(await runForTenant(tenantA, () => AnviAudioAsset.countDocuments({ tenantKey: { $ne: tenantA.universityId } })), 0);
  assert.equal(await runForTenant(tenantB, () => AnviAudioAsset.countDocuments({})), 0);
  assert.equal(await AnviAudioAsset.countDocuments({}), 0);
  // The interview id means nothing in another tenant.
  assert.equal(await runForTenant(tenantB, () => h.pregen.kick(String(doc._id), 3)), null);
});

test("regenerate and status are owner-only; regenerate is rate-limited and resets failed clips", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  audioPregenHooks.pregen = () => h.pregen;
  const doc = await publishedInterview();
  assert.equal((await call(`/${doc._id}/audio/regenerate`, "POST", {}, { "X-Test-Owner": adminB })).status, 404);
  assert.equal((await call(`/${doc._id}/audio/status`, "GET", undefined, { "X-Test-Owner": adminB })).status, 404);
  await AnviAudioAsset.create({
    tenantKey: "platform", scope: "revision", interviewId: doc._id, revision: 3, questionId: "q9", hash: "f".repeat(64), textHash: "e".repeat(64),
    status: "failed", failureCode: "GEMINI_UNAVAILABLE", retryAfter: new Date(Date.now() + 600_000),
  });
  const first = await call(`/${doc._id}/audio/regenerate`, "POST", {});
  assert.equal(first.status, 202);
  assert.equal(first.body.enabled, true);
  assert.equal(first.body.revision, 3);
  assert.equal((await AnviAudioAsset.findOne({ questionId: "q9" }).lean()).retryAfter, null);
  const second = await call(`/${doc._id}/audio/regenerate`, "POST", {});
  assert.equal(second.status, 429);
  assert.equal(second.body.code, "RATE_LIMITED");
  assert.ok(Number(second.headers.get("retry-after")) >= 1);
  for (let i = 0; i < 50 && (await AIInterview.findById(doc._id).lean()).audioPregen.status !== "done"; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  const status = await call(`/${doc._id}/audio/status`);
  assert.equal(status.status, 200);
  assert.equal(status.body.status, "done");
  assert.equal(status.body.assets.ready, lineCount());
  assert.equal(JSON.stringify(status.body).includes("anvi-audio/"), false);
  // An unpublished interview cannot be regenerated.
  const draft = await draftReadyToPublish();
  assert.equal((await call(`/${draft._id}/audio/regenerate`, "POST", {})).status, 409);
});

test("unpublish and archive only mark the outbox inactive; pinned clips stay", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  audioPregenHooks.pregen = () => h.pregen;
  assignmentGuard.activeAssignmentFor = async () => null;
  const doc = await publishedInterview();
  await h.pregen.kick(String(doc._id), 3);
  const before = await AnviAudioAsset.countDocuments({});
  const unpublished = await call(`/${doc._id}/unpublish`, "POST", { revision: 3 });
  assert.equal(unpublished.status, 200);
  assert.equal((await AIInterview.findById(doc._id).lean()).audioPregen.status, "inactive");
  const archived = await call(`/${doc._id}/archive`, "POST", { revision: 4 });
  assert.equal(archived.status, 200);
  const stored = await AIInterview.findById(doc._id).lean();
  assert.equal(stored.lifecycle, "archived");
  assert.equal(stored.audioPregen.status, "inactive");
  const tick = await h.pregen.maintain({ now: new Date(Date.now() + 86_400_000) });
  assert.equal(tick.claimed, 0);
  assert.equal(await AnviAudioAsset.countDocuments({}), before);
  assert.equal(h.storage.calls.remove, 0);
});

test("an assignment's pinned revision gets an outbox when it had none; a newer one is never replaced", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const legacy = await publishedInterview({ outbox: false });
  const result = await h.pregen.ensureRevision({ interviewId: String(legacy._id), revision: 3 });
  assert.equal(result.status, "done");
  assert.equal((await AIInterview.findById(legacy._id).lean()).audioPregen.status, "done");
  // Already done: nothing is queued again.
  assert.equal(await h.pregen.ensureRevision({ interviewId: String(legacy._id), revision: 3 }), null);
  const calls = h.gemini.calls.length;
  // An older pinned revision never overwrites the current outbox.
  await h.pregen.ensureRevision({ interviewId: String(legacy._id), revision: 2 });
  assert.equal((await AIInterview.findById(legacy._id).lean()).audioPregen.revision, 3);
  assert.equal(h.gemini.calls.length, calls);
});

test("maintenance removes attempt clips 24 h after the attempt ended and keeps the rest", async (t) => {
  if (skipIf(t)) return;
  const h = harness();
  const interviewId = id();
  const now = new Date();
  const attempt = (status, endedAt) => AnviAttempt.collection.insertOne({ _id: id(), interviewId, status, endedAt, studentId: id() }).then((r) => r.insertedId);
  const old = await attempt("completed", new Date(now.getTime() - 25 * 3600_000));
  const recent = await attempt("completed", new Date(now.getTime() - 2 * 3600_000));
  const live = await attempt("in_progress", null);
  for (const attemptId of [old, recent, live]) {
    const clip = await h.assets.ensure({ scope: "attempt", interviewId: String(interviewId), attemptId: String(attemptId), questionId: "topic-1", text: "Tell me how you would design a URL shortener." });
    assert.ok(clip);
    await clip.stored;
  }
  const revision = await h.assets.ensure({ scope: "revision", interviewId: String(interviewId), revision: 1, questionId: "q1", text: "Explain how a cache decides what to evict first." });
  assert.ok(revision);
  const tick = await h.pregen.maintain({ now });
  assert.deepEqual(tick.cleaned, { removed: 1, failed: 0 });
  const left = (await AnviAudioAsset.find({}).lean()).map((row) => (row.attemptId ? String(row.attemptId) : row.scope)).sort();
  assert.deepEqual(left, [String(recent), String(live), "revision"].sort());
});
