// Wave 2 cross-package contracts: the budget mirror update applied by Mongo to the live doc (WP6 -> WP15),
// budget modes stored on usage rows (WP6 -> WP5), plan/speakable text hashes matching the text TTS speaks
// (WP12 -> WP4/WP8), and TTS streams metered even without a usage block (WP4 -> WP5/WP6).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { BUDGET_MODES, budgetMirrorUpdate, createBudget } from "../src/modules/anviInterview/anviInterview.budget.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createGeminiClient } from "../src/modules/anviInterview/anviInterview.gemini.js";
import { AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { buildPlan } from "../src/modules/anviInterview/anviInterview.plan.js";
import { anviPricing } from "../src/modules/anviInterview/anviInterview.pricing.js";
import { staticSpeakableItems } from "../src/modules/anviInterview/anviInterview.speakable.js";
import { BUDGET_MODES as LEDGER_BUDGET_MODES, usageRow } from "../src/modules/anviInterview/anviInterview.usage.js";

const CONFIG = anviConfig({});
const PRICING = anviPricing({
  ANVI_PRICE_DECISION_INPUT: "0.3", ANVI_PRICE_DECISION_OUTPUT: "2.5", ANVI_USD_INR_RATE: "88", ANVI_PRICING_REVISION: "wave2",
}, CONFIG);
const id = () => new mongoose.Types.ObjectId();

let mongo;
let skipped = false;
before(async () => {
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) { if (error?.code === "EPERM") { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: "anvi_wave2_contracts" });
  await AnviLiveSession.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("the budget mirror update applies to the live doc with $max and reseeds a new controller", { skip: skipped }, async (t) => {
  if (skipped) return t.skip("mongodb-memory-server unavailable");
  const attemptId = id();
  await AnviLiveSession.create({ attemptId, studentId: id(), plan: [], expiresAt: new Date(Date.now() + 60_000), leaseToken: "lease-1" });
  const filter = { attemptId, leaseToken: "lease-1" };
  const mirror = {
    read: () => AnviLiveSession.findOne({ attemptId }).select("budget liveSecondsUsed").lean(),
    write: (update) => AnviLiveSession.updateOne(filter, update),
  };
  // No Valkey: the controller keeps its own totals and writes them to the mirror.
  const first = createBudget({ tenantKey: "t1", attemptId: String(attemptId), durationMinutes: 60, config: CONFIG, pricing: PRICING, valkey: null, mirror, runtimeMode: "hybrid", log: { warn() {} } });
  await first.ready;
  await first.record({ kind: "decision", tokens: { input: 2_000_000, output: 0 } }); // USD 0.6 = INR 52.8: essential
  await first.flush();
  first.dispose();

  const stored = await AnviLiveSession.findOne({ attemptId }).lean();
  assert.ok(stored.budget.inr > 52 && stored.budget.inr < 53);
  assert.equal(stored.budget.modeRank, BUDGET_MODES.indexOf("essential"));
  assert.equal(stored.budget.revision, PRICING.revision);

  // A stale, lower snapshot never lowers the mirror.
  await AnviLiveSession.updateOne(filter, budgetMirrorUpdate({ inr: 1, usd: 0.01, liveSeconds: 0, spendRank: 0, revision: PRICING.revision }));
  const kept = await AnviLiveSession.findOne({ attemptId }).lean();
  assert.equal(kept.budget.inr, stored.budget.inr);
  assert.equal(kept.budget.modeRank, stored.budget.modeRank);

  // A new controller (rejoin, other instance) seeds from the mirror and keeps the stricter mode.
  const second = createBudget({ tenantKey: "t1", attemptId: String(attemptId), durationMinutes: 60, config: CONFIG, pricing: PRICING, valkey: null, mirror, runtimeMode: "hybrid", log: { warn() {} } });
  await second.ready;
  assert.equal(second.mode(), "essential");
  assert.equal(second.allow("decision"), false);
  assert.equal(second.allow("evaluate"), true);
  second.dispose();
});

test("before seeding finishes an enforced budget is at least economical and denies Live", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  // A rejoin whose stored spend is already past cached_only; the mirror read is slow.
  const mirror = { read: () => gate.then(() => ({ budget: { inr: 42, usd: 0.48, modeRank: 2 } })), write: async () => {} };
  const valkey = { sendCommand: async (args) => (args[0] === "HGETALL" ? [] : ["0", "0", "0", "0", "0", "0", "normal"]) };
  const budget = createBudget({ attemptId: "a2", durationMinutes: 60, config: CONFIG, pricing: PRICING, valkey, mirror, runtimeMode: "hybrid", log: { warn() {} } });
  assert.equal(budget.mode(), "economical");
  assert.equal(budget.allow("live"), false);
  assert.equal(budget.allow("transcribe_accurate"), false);
  release();
  await budget.ready;
  assert.equal(budget.mode(), "cached_only");
  assert.equal(budget.allow("decision"), false);
  budget.dispose();
  // A Live-mode attempt is still observe-only.
  const observing = createBudget({ attemptId: "a3", config: CONFIG, pricing: PRICING, valkey, mirror: { read: () => gate }, runtimeMode: "live", log: { warn() {} } });
  assert.equal(observing.allow("live"), true);
  observing.dispose();
});

test("usage rows store the budget controller's mode names", () => {
  assert.deepEqual([...LEDGER_BUDGET_MODES], [...BUDGET_MODES]);
  const budget = createBudget({ attemptId: "a1", config: CONFIG, pricing: PRICING, valkey: null, runtimeMode: "hybrid", log: { warn() {} } });
  const row = usageRow({ kind: "decision", model: "gemini-3.5-flash-lite", tokens: { input: 10, output: 2 } }, { mode: budget.mode, runtimeMode: "hybrid" });
  // Without Valkey a hybrid budget is at least economical.
  assert.equal(row.mode, "economical");
  assert.equal(row.runtimeMode, "hybrid");
  budget.dispose();
});

test("hybrid plan and speakable text hashes match the text a TTS request speaks", async () => {
  const data = {
    sections: [{
      id: "s1", name: "Core", groups: [{
        id: "g1", name: "Basics", questions: [{
          id: "q1", kind: "specific", prompt: "Question 1:  Explain   caching.",
          subquestions: [{ prompt: "When would you  invalidate it?" }], followUps: [{ prompt: "And  for a CDN?" }],
        }],
      }],
    }],
  };
  const { plan } = await buildPlan(data, { runtimeMode: "hybrid", durationMinutes: 30 });
  const [item] = plan;
  const lines = staticSpeakableItems(data);
  const question = lines.find((line) => line.kind === "question");
  const followUp = lines.find((line) => line.kind === "follow_up");
  assert.equal(question.textHash, item.textHash);

  const spoken = [];
  const fetcher = async (url, init) => {
    spoken.push(JSON.parse(init.body).contents[0].parts[0].text);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.alloc(4800, 1).toString("base64") } }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 50 },
    }));
  };
  const client = createGeminiClient({ config: { ...CONFIG, apiKey: "k" }, fetcher, sleep: async () => {} });
  await client.synthesizeSpeech({ text: item.text, style: "" });
  await client.synthesizeSpeech({ text: item.authoredFollowUps[0], style: "" });
  const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  assert.equal(sha(spoken[0]), item.textHash);
  assert.equal(sha(spoken[1]), followUp.textHash);
});

test("a TTS stream stopped before any usage block is still metered from its audio", async () => {
  const pcm = Buffer.alloc(24000 * 2, 1); // 1 s at 24 kHz
  const event = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: pcm.toString("base64") } }] } }] };
  const body = `data: ${JSON.stringify(event)}\n\ndata: ${JSON.stringify(event)}\n\n`;
  const seen = [];
  const client = createGeminiClient({
    config: { ...CONFIG, apiKey: "k", ttsStreaming: true },
    fetcher: async () => new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    sleep: async () => {},
    onUsage: (usage) => seen.push(usage),
  });
  for await (const chunk of client.streamSpeech({ text: "One quick follow-up on that." })) { assert.equal(chunk.part, 0); break; }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "tts");
  assert.equal(seen[0].audioSeconds, 1);
  assert.equal(seen[0].tokens.outputByModality.AUDIO, 25);
  // The budget prices it (at the ceiling while TTS has no price): never free.
  assert.ok(PRICING.conservativeUsd(seen[0]) > 0);

  // The same for one synthesizeSpeech response without usageMetadata.
  const once = [];
  const single = createGeminiClient({
    config: { ...CONFIG, apiKey: "k" },
    fetcher: async () => new Response(JSON.stringify(event)),
    sleep: async () => {},
    onUsage: (usage) => once.push(usage),
  });
  const clip = await single.synthesizeSpeech({ text: "Okay." });
  assert.equal(clip.audioSeconds, 1);
  assert.equal(once.length, 1);
  assert.deepEqual([once[0].kind, once[0].audioSeconds, once[0].tokens.outputByModality.AUDIO], ["tts", 1, 25]);
});
