import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import Resume from "../src/models/Resume.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { errorHandler } from "../src/utils/errors.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createAnviStudentRouter } from "../src/modules/anviInterview/anviInterview.routes.js";
import { createAnviService } from "../src/modules/anviInterview/anviInterview.service.js";
import { sweepStaleAnviAttempts } from "../src/modules/anviInterview/anviInterview.maintenance.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { AnviAudioAsset } from "../src/modules/anviInterview/anviInterview.audio.models.js";
import { createAudioAssets } from "../src/modules/anviInterview/anviInterview.audioAssets.js";
import { wrapWav } from "../src/modules/anviInterview/anviInterview.wav.js";

// WP15 service and route integration for hybrid attempts. Ephemeral MongoDB only; Gemini, the plan builder,
// prices and R2 are fakes, so no network call is made.
let mongo, server, base;
let skipped = false;
const student = new mongoose.Types.ObjectId().toString();
const otherStudent = new mongoose.Types.ObjectId().toString();
const baseConfig = { ...anviConfig({}), apiKey: "test", generateModel: "fake-generate", maxSessionMinutes: 60, resumeWindowMinutes: 15 };
const hybridConfig = { ...anviConfig({ ANVI_HYBRID_ENABLED: "true", ANVI_HYBRID_ROLLOUT_PERCENT: "100" }), apiKey: "test", generateModel: "fake-generate", maxSessionMinutes: 60, resumeWindowMinutes: 15 };
const planCalls = [];
const ensured = [];
const warnings = [];
const gemini = { generateJson: async () => ({ questions: [] }) };
const clip = wrapWav(Buffer.alloc(4800, 1), { sampleRate: 24000 });
const storage = { ready: true, get: async (key) => (key === "anvi-audio/k1.wav" ? clip : null) };
const audioAssets = createAudioAssets({ storage, valkey: null, ensureIndexes: async () => {}, log: { warn() {} } });
const fakeAssets = { ensure: async (spec) => { ensured.push(spec); return null; }, load: (...args) => audioAssets.load(...args) };

async function buildPlan(data, options) {
  planCalls.push({ data, options });
  return {
    plan: [
      { qid: "q1", n: 1, sectionId: "s1", sectionName: "Technical", kind: "specific", text: "Explain REST.", keyPoints: ["Stateless"], followUpBudget: 0 },
      { qid: "q2", n: 2, sectionId: "s1", sectionName: "Technical", kind: "annu", text: "How would you design a rate limiter?", keyPoints: [], followUpBudget: 0 },
    ],
    persona: { displayName: "ANVI" },
    rules: { language: "English" },
    estimatedMinutes: 12,
  };
}

const services = {};
let current = "live";
const make = (config, extra = {}) => createAnviService({
  gemini, buildPlan, config, evaluateSoon: () => null, audioAssets: fakeAssets, audioStorage: { ready: true },
  pricing: { hybridPricesComplete: () => true, missingHybridPrices: () => [] }, log: { warn: (message) => warnings.push(String(message)) }, ...extra,
});

const definition = (title, anvi) => normalizeDefinition({
  ...(anvi ? { anvi } : {}),
  title, role: "Backend engineer", experience: "junior", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI" },
  sections: [{ id: "s1", name: "Technical", weight: 100, groups: [{ id: "g1", name: "APIs", weight: 100, source: "manual", questions: [{ id: "q1", kind: "specific", prompt: "Explain REST." }] }] }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});
const publish = (title, anvi) => {
  const data = definition(title, anvi);
  return AIInterview.create({
    ownerId: new mongoose.Types.ObjectId(), creationKey: crypto.randomUUID(), title, role: data.role, data,
    publishedSnapshot: { data, revision: 2, at: new Date() }, publishedAt: new Date(), publishedRevision: 2,
  });
};

before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_service_hybrid_test" });
  await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviLiveSession.init(), InterviewEngagementReceipt.init(), Resume.init(), AnviAudioAsset.init()]);
  services.live = make(baseConfig);
  services.hybrid = make(hybridConfig);
  services.unpriced = make(hybridConfig, { pricing: { hybridPricesComplete: () => false, missingHybridPrices: () => ["ANVI_USD_INR_RATE", "ANVI_PRICE_TTS_OUTPUT_AUDIO"] } });
  const service = new Proxy({}, { get: (_target, key) => services[current][key] });
  const app = express();
  app.use(express.json());
  app.use("/api/student/ai-interviews", createAnviStudentRouter((req, _res, next) => {
    req.user = { _id: req.get("X-Test-Student") || student, role: "student", accessScope: "full", college: "Test College" };
    next();
  }, { service, resumes: {} }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/student/ai-interviews`;
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  if (skipped) return;
  planCalls.length = 0;
  ensured.length = 0;
  current = "live";
  await Promise.all([AIInterview, AnviAttempt, AnviLiveSession, InterviewEngagementReceipt, Resume, AnviAudioAsset].map((model) => model.deleteMany({})));
});
const call = async (path = "", method = "GET", body, headers = {}) => {
  const result = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const type = result.headers.get("content-type") || "";
  return { status: result.status, headers: result.headers, body: type.includes("json") ? await result.json() : Buffer.from(await result.arrayBuffer()) };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("a hybrid start stamps mode, duration, Live cap and thresholds and warms the per-student audio only", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  current = "hybrid";
  const interview = await publish("Hybrid", { durationMinutes: 30 });
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.deepEqual(Object.keys(started.body).sort(), ["id", "language", "resumed", "status", "terms"], "the start response is unchanged");
  assert.equal(planCalls[0].options.runtimeMode, "hybrid");
  assert.equal(planCalls[0].options.durationMinutes, 30);
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.runtimeMode, "hybrid");
  assert.equal(attempt.durationMinutes, 30);
  assert.equal(attempt.liveCapSeconds, 180);
  assert.equal(attempt.hardDeadline - attempt.startedAt, 30 * 60_000, "a hybrid attempt runs for its duration");
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.rules.runtimeMode, "hybrid");
  assert.equal(live.rules.durationMinutes, 30);
  assert.equal(live.rules.liveCapSeconds, 180);
  assert.equal(live.rules.budgetThresholds.factor, 35 / 60);
  await settle();
  assert.deepEqual(ensured.map((spec) => [spec.scope, spec.questionId, spec.language]), [["attempt", "q2", "English"]], "only the generated line, attempt-scoped");
  assert.equal(String(ensured[0].attemptId), started.body.id);
  const detail = await call(`/attempts/${started.body.id}`);
  assert.equal(detail.body.runtimeMode, "hybrid");

  // A resume never flips the mode, even with the flag now off.
  current = "live";
  const again = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(again.body.resumed, true);
  assert.equal((await AnviAttempt.findById(started.body.id).lean()).runtimeMode, "hybrid");
});

test("a hybrid start charges its planning and warm-up TTS to the attempt budget; a Live start creates none", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const budgets = [];
  const createBudget = (options) => {
    const budget = { options, reserved: [], flushed: 0, disposed: 0 };
    Object.assign(budget, {
      recordReserved: async (usage) => { budget.reserved.push(usage.kind); return "normal"; },
      flush: async () => { budget.flushed += 1; },
      dispose: () => { budget.disposed += 1; },
    });
    budgets.push(budget);
    return budget;
  };
  const meteredGemini = { generateJson: async ({ onUsage }) => { onUsage?.({ kind: "generate", model: "fake-generate", inputTokens: 10, outputTokens: 5 }); return { questions: [] }; } };
  const planning = async (data, options) => { await options.generate({ kind: "annu", count: 1 }); return buildPlan(data, options); };
  const ttsAssets = { ensure: async (spec) => { spec.onUsage?.({ kind: "tts", model: "fake-tts", outputAudioSeconds: 2 }); return null; }, load: async () => null };
  services.charged = make(hybridConfig, { gemini: meteredGemini, buildPlan: planning, audioAssets: ttsAssets, createBudget });
  services.chargedLive = make(baseConfig, { gemini: meteredGemini, buildPlan: planning, audioAssets: ttsAssets, createBudget });
  current = "charged";
  const interview = await publish("Charged", { durationMinutes: 15 });
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201, JSON.stringify(started.body));
  await settle();
  assert.equal(budgets.length, 1);
  const [budget] = budgets;
  assert.equal(String(budget.options.attemptId), started.body.id);
  assert.equal(budget.options.runtimeMode, "hybrid");
  assert.equal(budget.options.durationMinutes, 15);
  assert.equal(budget.options.liveCapSeconds, 120);
  assert.deepEqual(budget.reserved, ["generate", "tts"], "plan spend first, then the attempt-scoped question audio");
  assert.equal(budget.flushed, 1);
  assert.equal(budget.disposed, 1);

  current = "chargedLive";
  const live = await publish("Charged live", { durationMinutes: 15 });
  assert.equal((await call(`/${live._id}/start`, "POST", {})).status, 201);
  await settle();
  assert.equal(budgets.length, 1, "a Live start never creates a budget");
});

test("an admin duration above ANVI_MAX_SESSION_MINUTES plans, runs and budgets as the longest duration that fits", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  services.capped = make({ ...hybridConfig, maxSessionMinutes: 45 });
  current = "capped";
  const interview = await publish("Capped", { durationMinutes: 60 });
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(planCalls[0].options.durationMinutes, 45);
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.durationMinutes, 45);
  assert.equal(attempt.liveCapSeconds, 240);
  assert.equal(attempt.hardDeadline - attempt.startedAt, 45 * 60_000);
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.rules.budgetThresholds.factor, 48 / 60);
});

test("flag off: the plan request and attempt are exactly the Live ones (AC15)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  const interview = await publish("Live", { durationMinutes: 30 });
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal(started.status, 201);
  assert.equal("runtimeMode" in planCalls[0].options, false);
  assert.equal("resumeProfile" in planCalls[0].options, false);
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  assert.equal(attempt.runtimeMode, "live");
  assert.equal(attempt.durationMinutes, undefined);
  assert.equal(attempt.hardDeadline - attempt.startedAt, 12 * 60_000, "the legacy estimate sets the deadline");
  const live = await AnviLiveSession.findOne({ attemptId: attempt._id }).lean();
  assert.equal(live.rules.runtimeMode, undefined);
  await settle();
  assert.equal(ensured.length, 0);
  assert.equal((await call(`/attempts/${started.body.id}`)).body.runtimeMode, "live");
});

test("incomplete prices run the attempt Live and warn with variable names only", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  current = "unpriced";
  const interview = await publish("Unpriced");
  const started = await call(`/${interview._id}/start`, "POST", {});
  assert.equal((await AnviAttempt.findById(started.body.id).lean()).runtimeMode, "live");
  const warned = warnings.find((message) => message.includes("prices"));
  assert.match(warned, /ANVI_USD_INR_RATE, ANVI_PRICE_TTS_OUTPUT_AUDIO/);
});

test("a REST end and the sweeper finalize hybrid attempts with their turns and transcript fields (AC10)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  current = "hybrid";
  const answer = {
    text: "REST is stateless.", source: "transcribe", seconds: 4, asked: true, candidateTurns: 1, substantiveWords: 3, flags: [],
    turns: [{ kind: "answer", text: "REST is stateless." }], transcriptModel: "lite", transcriptLowConfidence: false, transcriptTokenUsage: { input: 10, output: 4 },
  };
  for (const end of ["rest", "sweep"]) {
    await AnviAttempt.deleteMany({});
    await AnviLiveSession.deleteMany({});
    const interview = await publish(`Ends ${end}`);
    const started = await call(`/${interview._id}/start`, "POST", {});
    await AnviLiveSession.updateOne({ attemptId: started.body.id }, { $set: { phase: "asking", cursor: 1, "answers.q1": answer } });
    if (end === "rest") {
      assert.equal((await call(`/attempts/${started.body.id}/end`, "POST")).status, 200);
    } else {
      const live = await AnviLiveSession.findOne({ attemptId: started.body.id }).lean();
      const result = await sweepStaleAnviAttempts(new Date(live.expiresAt.getTime() + 1000), { config: baseConfig, evaluateSoon: () => null });
      assert.equal(result.closed, 1);
    }
    const attempt = await AnviAttempt.findById(started.body.id).lean();
    assert.notEqual(attempt.status, "in_progress");
    assert.equal(attempt.items[0].answerSource, "transcribe");
    assert.deepEqual(attempt.items[0].turns, [{ kind: "answer", text: "REST is stateless." }]);
    assert.equal(attempt.items[0].transcriptModel, "lite");
    assert.deepEqual(attempt.items[0].transcriptTokenUsage, { input: 10, output: 4 });
    assert.equal(attempt.items[1].turns, undefined, "an unanswered item has no hybrid fields");
    assert.equal(await AnviLiveSession.countDocuments({ attemptId: started.body.id }), 0);
  }
});

test("the audio route serves the attempt's clip privately and 404s another student, tenant or ended attempt (AC6)", async (t) => {
  if (skipped) return t.skip("Local sockets are unavailable in this sandbox");
  current = "hybrid";
  const interview = await publish("Audio");
  const started = await call(`/${interview._id}/start`, "POST", {});
  const attempt = await AnviAttempt.findById(started.body.id).lean();
  const row = (fields) => AnviAudioAsset.create({
    tenantKey: "platform", scope: "revision", interviewId: attempt.interviewId, revision: attempt.snapshotRevision, questionId: "q1",
    hash: crypto.randomUUID().replace(/-/g, ""), textHash: "t", storageKey: "anvi-audio/k1.wav", status: "ready", ...fields,
  });
  const mine = await row({});
  const otherTenant = await row({ tenantKey: "another-university" });
  const otherInterview = await row({ interviewId: new mongoose.Types.ObjectId() });

  const served = await call(`/attempts/${attempt._id}/audio/${mine._id}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("cache-control"), "private, no-store");
  assert.equal(served.headers.get("content-type"), "audio/wav");
  assert.ok(served.body.equals(clip));

  for (const id of [otherTenant._id, otherInterview._id, new mongoose.Types.ObjectId()]) {
    assert.equal((await call(`/attempts/${attempt._id}/audio/${id}`)).status, 404);
  }
  assert.equal((await call(`/attempts/${attempt._id}/audio/${mine._id}`, "GET", undefined, { "X-Test-Student": otherStudent })).status, 404, "another student");
  assert.equal((await call(`/attempts/${attempt._id}/audio/not-an-id`)).status, 404);
  await call(`/attempts/${attempt._id}/end`, "POST");
  assert.equal((await call(`/attempts/${attempt._id}/audio/${mine._id}`)).status, 404, "an ended attempt");
});
