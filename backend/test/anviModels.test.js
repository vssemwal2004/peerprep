import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { runForTenant } from "../src/platform/tenantContext.js";
import {
  AnviAttempt, AnviAudioAsset as ReExportedAsset, AnviLiveSession, AnviResumeContext, HYBRID_SEGMENT_LIMIT, runtimeModeOf,
} from "../src/modules/anviInterview/anviInterview.models.js";
import {
  ANVI_AUDIO_MODELS, AUDIO_ASSET_STATUSES, AnviAudioAsset, ensureAnviAudioIndexes,
} from "../src/modules/anviInterview/anviInterview.audio.models.js";

let mongo;
let skipped = false;
let tenantConnection;
const id = () => new mongoose.Types.ObjectId();
const hash = (n) => String(n).padStart(64, "a");
const asset = (overrides = {}) => ({ tenantKey: "north", scope: "revision", interviewId: id(), revision: 1, questionId: "q1", hash: hash(1), textHash: hash(9), ...overrides });
const attemptDoc = (overrides = {}) => ({ studentId: id(), interviewId: id(), snapshotRevision: 1, hardDeadline: new Date(Date.now() + 3_600_000), ...overrides });

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_models_test" });
  await Promise.all([AnviAttempt, AnviLiveSession, AnviResumeContext].map((model) => model.init()));
  // A university connection: autoIndex is off there, as in production.
  tenantConnection = await mongoose.createConnection(mongo.getUri(), { dbName: "anvi_models_tenant", autoIndex: false }).asPromise();
});

after(async () => {
  await tenantConnection?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

test("an attempt stored without runtimeMode reads as Live; hybrid is stamped explicitly", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const legacy = attemptDoc();
  const { insertedId } = await AnviAttempt.collection.insertOne({ ...legacy, status: "in_progress", items: [] });
  const hydrated = await AnviAttempt.findById(insertedId);
  assert.equal(hydrated.runtimeMode, "live");
  const lean = await AnviAttempt.findById(insertedId).lean();
  assert.equal(lean.runtimeMode, undefined);
  assert.equal(runtimeModeOf(lean), "live");
  assert.equal(runtimeModeOf(null), "live");
  assert.equal(runtimeModeOf({ runtimeMode: "bogus" }), "live");

  const fresh = await AnviAttempt.create(attemptDoc());
  assert.equal(fresh.runtimeMode, "live");
  assert.equal(fresh.toObject().cost, undefined);
  assert.equal(fresh.toObject().durationMinutes, undefined);

  const hybrid = await AnviAttempt.create(attemptDoc({ runtimeMode: "hybrid", durationMinutes: 30, liveCapSeconds: 180 }));
  assert.equal(runtimeModeOf(await AnviAttempt.findById(hybrid._id).lean()), "hybrid");
  await assert.rejects(AnviAttempt.create(attemptDoc({ runtimeMode: "turbo" })), /runtimeMode/);
});

test("attempt cost, judged outbox and hybrid item meta round-trip; Live items gain no new keys", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const liveItem = { qid: "q1", n: 1, questionText: "What is a hash map?", answerText: "A map.", answerSource: "live", status: "answered" };
  const attempt = await AnviAttempt.create(attemptDoc({ items: [liveItem] }));
  const liveKeys = Object.keys((await AnviAttempt.findById(attempt._id).lean()).items[0]);
  for (const key of ["transcriptModel", "transcriptAttempts", "transcriptEscalated", "transcriptAudioSeconds", "transcriptTokenUsage", "transcriptLowConfidence", "turns"]) {
    assert.equal(liveKeys.includes(key), false, key);
  }

  const at = new Date();
  await AnviAttempt.updateOne({ _id: attempt._id }, { $set: {
    cost: { estimatedUsd: null, estimatedInr: 41.5, liveSeconds: 60, mode: "economical", peakMode: "cached_only", pricingRevision: "r1:abc", complete: false, at },
    pendingWork: { status: "processing", judged: { q1: { marks: 7 } } },
    items: [{ ...liveItem, answerSource: "transcribe", transcriptModel: "gemini-3.5-flash-lite", transcriptAttempts: 2, transcriptEscalated: true,
      transcriptAudioSeconds: 31.2, transcriptTokenUsage: { input: 900, output: 80 }, transcriptLowConfidence: false,
      turns: [{ kind: "main", text: "A map." }, { kind: "follow_up", text: "With buckets." }] }],
  } });
  const stored = await AnviAttempt.findById(attempt._id).lean();
  assert.deepEqual(stored.cost, { estimatedUsd: null, estimatedInr: 41.5, liveSeconds: 60, mode: "economical", peakMode: "cached_only", pricingRevision: "r1:abc", complete: false, at });
  assert.deepEqual(stored.pendingWork.judged, { q1: { marks: 7 } });
  const item = stored.items[0];
  assert.equal(item.transcriptModel, "gemini-3.5-flash-lite");
  assert.deepEqual(item.transcriptTokenUsage, { input: 900, output: 80 });
  assert.deepEqual(item.turns, [{ kind: "main", text: "A map." }, { kind: "follow_up", text: "With buckets." }]);
  assert.equal(AnviAttempt.schema.path("items").schema.path("answerSource").enumValues.join(","), "transcribe,live,none");
});

test("live session hybrid, budget and liveSecondsUsed round-trip through findOneAndUpdate", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const attemptId = id();
  const plan = [{ qid: "q1", n: 1, text: "Explain caching.", spoken: { English: "Explain caching." }, priority: "high", textHash: hash(3), audioAssetId: String(id()) }];
  const created = await AnviLiveSession.create({ attemptId, studentId: id(), plan, expiresAt: new Date(Date.now() + 60_000), leaseToken: "lease-1" });
  assert.equal(created.liveSecondsUsed, 0);
  assert.equal(created.toObject().hybrid, undefined);
  assert.equal(created.toObject().budget, undefined);

  const hybrid = {
    turn: { turnId: "abc_DEF-123", qid: "q1", kind: "main", assetIds: ["a1", "a2"], status: "listening", issuedAt: new Date(0) },
    turnState: "listening", inputMode: "vad",
    segments: [{ segmentId: "5f0c7a3e-2b1d-4c6e-9a8b-0d1e2f3a4b5c", turnId: "abc_DEF-123", audioHash: hash(4), qid: "q1", seconds: 12.5 }],
    summary: { completedQuestions: [] }, followUpsByQ: { q1: 1 }, clarifiesByQ: {}, repeatsByQ: { q1: 1 }, emptyStreak: 0, lastDecision: { action: "next" },
  };
  const budget = { usd: 0.12, inr: 10.4, liveSeconds: 20, mode: "normal", revision: "r1:abc" };
  const updated = await AnviLiveSession.findOneAndUpdate({ attemptId, leaseToken: "lease-1" },
    { $set: { hybrid, budget }, $max: { liveSecondsUsed: 20 } }, { new: true, lean: true });
  assert.deepEqual(updated.hybrid, hybrid);
  assert.deepEqual(updated.budget, budget);
  assert.equal(updated.liveSecondsUsed, 20);
  assert.deepEqual(updated.plan[0].spoken, { English: "Explain caching." });
  assert.equal(updated.plan[0].priority, "high");
  assert.equal(updated.plan[0].textHash, hash(3));
  const lower = await AnviLiveSession.findOneAndUpdate({ attemptId }, { $max: { liveSecondsUsed: 10 } }, { new: true, lean: true });
  assert.equal(lower.liveSecondsUsed, 20);
  assert.equal(HYBRID_SEGMENT_LIMIT, 200);

  // A Live plan item gains none of the hybrid keys.
  const liveDoc = await AnviLiveSession.create({ attemptId: id(), studentId: id(), plan: [{ qid: "q1", n: 1, text: "Hi" }], expiresAt: new Date(Date.now() + 60_000) });
  const liveItemKeys = Object.keys((await AnviLiveSession.findById(liveDoc._id).lean()).plan[0]);
  for (const key of ["spoken", "priority", "textHash", "audioAssetId"]) assert.equal(liveItemKeys.includes(key), false, key);
});

test("resume context keeps the profile fields", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const profile = { skills: ["Java"], roles: [], experienceYears: 0, education: "B.Tech", projects: [{ name: "Cache", summary: "LRU", technologies: ["Java"] }] };
  const doc = await AnviResumeContext.create({ studentId: id(), interviewId: id(), source: "upload", text: "Resume text", contentHash: hash(5), profile, profilePromptVersion: "p1", profileModel: "gemini-3.5-flash-lite", expiresAt: new Date(Date.now() + 60_000) });
  const stored = await AnviResumeContext.findById(doc._id).lean();
  assert.deepEqual(stored.profile, profile);
  assert.equal(stored.contentHash, hash(5));
  assert.equal(stored.profilePromptVersion, "p1");
  assert.equal(stored.profileModel, "gemini-3.5-flash-lite");
});

test("the audio asset schema stores no question or student text", () => {
  const paths = Object.keys(AnviAudioAsset.schema.paths);
  for (const forbidden of ["text", "questionText", "spokenText", "transcript", "answerText", "studentId", "name"]) assert.equal(paths.includes(forbidden), false, forbidden);
  assert.deepEqual(AUDIO_ASSET_STATUSES, ["generating", "ready", "failed"]);
  assert.deepEqual(AnviAudioAsset.schema.path("status").enumValues, ["generating", "ready", "failed"]);
  assert.deepEqual(AnviAudioAsset.schema.path("scope").enumValues, ["revision", "template", "attempt"]);
  assert.equal(new AnviAudioAsset({ ...asset(), text: "What is a hash map?" }).toObject().text, undefined);
  assert.equal(ReExportedAsset, AnviAudioAsset);
  assert.deepEqual(ANVI_AUDIO_MODELS, [AnviAudioAsset]);
  const indexes = AnviAudioAsset.schema.indexes().map(([fields, options]) => [JSON.stringify(fields), Boolean(options.unique), Boolean(options.sparse)]);
  assert.deepEqual(indexes, [
    ['{"tenantKey":1,"hash":1}', true, false],
    ['{"interviewId":1,"revision":1}', false, false],
    ['{"attemptId":1}', false, true],
    ['{"status":1,"retryAfter":1}', false, false],
  ]);
});

test("ensureAnviAudioIndexes creates the unique index once per connection; duplicates are then rejected", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const tenant = { universityId: "north", connection: tenantConnection };
  await runForTenant(tenant, async () => {
    // Registering the model on a university connection creates no index (autoIndex is off).
    await AnviAudioAsset.create(asset({ hash: hash(7) }));
    const before = await AnviAudioAsset.collection.indexes();
    assert.equal(before.some((index) => index.name === "anvi_audio_hash"), false);
    await AnviAudioAsset.deleteMany({});

    await Promise.all([ensureAnviAudioIndexes(), ensureAnviAudioIndexes()]);
    await ensureAnviAudioIndexes();
    const names = (await AnviAudioAsset.collection.indexes()).map((index) => index.name).sort();
    assert.deepEqual(names, ["_id_", "anvi_audio_attempt", "anvi_audio_hash", "anvi_audio_retry", "anvi_audio_revision"]);

    await AnviAudioAsset.create(asset());
    await assert.rejects(AnviAudioAsset.create(asset({ questionId: "q2" })), (error) => error?.code === 11000);
    // The same hash under another tenant key, and template/attempt rows without an attemptId, are fine.
    await AnviAudioAsset.create(asset({ tenantKey: "south" }));
    await AnviAudioAsset.create(asset({ scope: "template", interviewId: null, revision: null, hash: hash(2) }));
    await AnviAudioAsset.create(asset({ scope: "attempt", attemptId: id(), hash: hash(3) }));
    const template = await AnviAudioAsset.findOne({ hash: hash(2) }).lean();
    assert.equal("attemptId" in template, false);
    assert.equal(template.status, "generating");
  });
});

test("models.js registers the asset model and the migration loops over ANVI_AUDIO_MODELS", async () => {
  assert.ok(mongoose.models.AnviAudioAsset);
  const source = await readFile(new URL("../src/migrations/create-anvi-indexes.js", import.meta.url), "utf8");
  assert.match(source, /import \{ ANVI_AUDIO_MODELS \} from '\.\.\/modules\/anviInterview\/anviInterview\.audio\.models\.js';/);
  assert.match(source, /for \(const model of ANVI_AUDIO_MODELS\) await model\.createIndexes\(\);/);
});
