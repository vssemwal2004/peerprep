import assert from "node:assert/strict";
import { test } from "node:test";
import { createAudioAssets } from "../src/modules/anviInterview/anviInterview.audioAssets.js";
import { pregenSpecs, pregenVoiceOf } from "../src/modules/anviInterview/anviInterview.audioPregen.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createHybridConductor, lineAssetSpec } from "../src/modules/anviInterview/anviInterview.hybridConductor.js";
import { buildPlan } from "../src/modules/anviInterview/anviInterview.plan.js";
import { ACK_TEMPLATE_IDS, numberClipId, templateText } from "../src/modules/anviInterview/anviInterview.templates.js";

// Wave-4 contract: the hashes the publish-time pass (WP13) voices are the hashes the hybrid conductor (WP14)
// asks for, so shared lines are found ready instead of being synthesized again on the first attempt.
const INTERVIEW_ID = "c".repeat(24);
const ATTEMPT_ID = "d".repeat(24);
const REVISION = 4;
const config = anviConfig({ ANVI_HYBRID_ENABLED: "true" });
const assets = createAudioAssets({ config, valkey: null, storage: { ready: true }, gemini: {}, log: { warn() {} } });

const dataWith = (voiceName = "") => ({
  title: "Caching", role: "Backend",
  anvi: { warmup: { enabled: true, tellMeAboutYourself: true, scored: true, icebreakers: 0 }, ...(voiceName ? { voice: { name: voiceName } } : {}) },
  sections: [{
    id: "s1", name: "Core", groups: [{
      id: "g1", name: "Basics", questions: [
        { id: "q1", kind: "specific", prompt: "Question 1: Explain how a cache   decides what to evict.", subquestions: [{ prompt: "When would you invalidate it?" }], followUps: [{ prompt: "And how does a CDN do it?" }] },
        { id: "q2", kind: "specific", prompt: "Describe how a hash map handles collisions." },
        { id: "q3", kind: "topic", prompt: "Caching" },
        { id: "q4", kind: "resume", prompt: "Your projects", resumeCount: 2 },
      ],
    }],
  }],
});

// What the conductor passes to ensure(): its voice is persona.voice when valid, else the server voice.
function conductorHash(item, persona, followUp = null) {
  const spec = lineAssetSpec(item, { attempt: { _id: ATTEMPT_ID, interviewId: INTERVIEW_ID, snapshotRevision: REVISION }, attemptId: ATTEMPT_ID }, followUp);
  const voice = /^[A-Za-z]{2,30}$/.test(String(persona.voice || "")) ? persona.voice : config.ttsVoice || config.liveVoice;
  return { spec, hash: assets.hashFor({ language: "English", voice, ...spec }) };
}

for (const voiceName of ["", "Kore"]) {
  test(`every shared plan line the conductor asks for was voiced at publish (voice ${voiceName || "default"})`, async () => {
    const data = dataWith(voiceName);
    const built = await buildPlan(data, { runtimeMode: "hybrid", durationMinutes: 30 });
    const published = new Set(pregenSpecs(data, { interviewId: INTERVIEW_ID, revision: REVISION, config }).map((spec) => assets.hashFor(spec)));
    assert.equal(pregenVoiceOf(data, config), voiceName || config.ttsVoice);

    const shared = [];
    for (const item of built.plan) {
      const { spec, hash } = conductorHash(item, built.persona);
      if (spec.scope === "revision") { shared.push(item.kind); assert.ok(published.has(hash), `${item.kind} ${item.qid} not pregenerated`); }
      (item.authoredFollowUps || []).forEach((text, index) => {
        const followUp = conductorHash(item, built.persona, { index, text });
        assert.equal(followUp.spec.scope, "revision");
        assert.ok(published.has(followUp.hash), `follow-up ${item.qid}:f${index} not pregenerated`);
      });
    }
    // Warm-up, both specific questions and the generic resume fallbacks are shared; the topic question is not.
    assert.deepEqual(shared.sort(), ["resume", "resume", "specific", "specific", "warmup"]);
    const topic = built.plan.find((item) => item.kind === "topic");
    assert.equal(conductorHash(topic, built.persona).spec.scope, "attempt");
    // Templates and number clips: the conductor's templateAsset spec in the same voice.
    const voice = /^[A-Za-z]{2,30}$/.test(String(built.persona.voice || "")) ? built.persona.voice : config.ttsVoice || config.liveVoice;
    for (const id of ["nudge.think_time", "transition.follow_up", "closing.default", numberClipId(3), ...ACK_TEMPLATE_IDS])
      assert.ok(published.has(assets.hashFor({ language: "English", voice, scope: "template", templateId: id, text: templateText(id, "English") })), `${id} not pregenerated`);
  });
}

test("question TTS asked for by the conductor is metered through the attempt's onUsage", async () => {
  const seen = [];
  const onUsage = () => {};
  const conductor = createHybridConductor({
    attempt: { _id: ATTEMPT_ID, interviewId: INTERVIEW_ID, snapshotRevision: REVISION, hardDeadline: new Date(Date.now() + 60_000) },
    live: { attemptId: ATTEMPT_ID, plan: [{ qid: "q1", n: 1, kind: "specific", text: "What is a cache?" }], rules: { language: "English" }, phase: "intro", cursor: 0, answers: {} },
    gemini: {}, config, persist: { async saveLive() { return { matchedCount: 1 }; } }, log: { warn() {} },
    timers: { setTimeout: () => 0, clearTimeout() {} }, tenantKey: "t1", onUsage,
    audioAssets: { async ensure(spec) { seen.push(spec); return null; }, async load() { return null; } },
  });
  await conductor.start();
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
  conductor.dispose();
  assert.ok(seen.length > 0);
  assert.ok(seen.every((spec) => spec.onUsage === onUsage));
});

test("a generated (per-student) resume question stays attempt-scoped", () => {
  const item = { qid: "q4-r1", kind: "resume", text: "Walk me through the payment service you built at Acme." };
  const { spec } = conductorHash(item, {});
  assert.equal(spec.scope, "attempt");
  assert.equal(spec.attemptId, ATTEMPT_ID);
  assert.equal(spec.questionId, "q4-r1");
});
