import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createHybridConductor } from "../src/modules/anviInterview/anviInterview.hybridConductor.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { templateText } from "../src/modules/anviInterview/anviInterview.templates.js";

// Wave-4 verification: a nudge keeps the question it nudges about, so "repeat" after a nudge replays the
// question clip (AC3) and the room keeps showing the question text, also after a rejoin.
const START = 1_000_000;
const ATTEMPT_ID = "a".repeat(24);
const QUESTION = "What is a hash map?";
const flush = async () => { for (let i = 0; i < 25; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function fakeTime() {
  let now = START;
  const pending = [];
  const timers = {
    setTimeout(fn, ms) { const t = { fn, at: now + Math.max(0, Number(ms) || 0) }; pending.push(t); return t; },
    clearTimeout(t) { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); },
  };
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      pending.sort((a, b) => a.at - b.at);
      const next = pending[0];
      if (!next || next.at > target) break;
      pending.shift();
      now = next.at;
      next.fn();
      await flush();
    }
    now = target;
    await flush();
  }
  return { clock: { now: () => now }, timers, advance };
}

function harness(live = {}) {
  const time = fakeTime();
  const doc = {};
  let ids = 0;
  const idFor = new Map();
  const seen = { prompts: [], replays: [] };
  const plan = [
    { qid: "q1", n: 1, kind: "specific", text: QUESTION, sectionId: "s1", priority: "medium", skippable: true, keyPoints: [], followUpBudget: 0 },
    { qid: "q2", n: 2, kind: "specific", text: "What is a heap?", sectionId: "s1", priority: "medium", skippable: true, keyPoints: [], followUpBudget: 0 },
  ];
  const c = createHybridConductor({
    attempt: { _id: ATTEMPT_ID, interviewId: "b".repeat(24), snapshotRevision: 1, studentId: "s".repeat(24), hardDeadline: new Date(START + 30 * 60_000) },
    live: { attemptId: ATTEMPT_ID, plan, rules: { language: "English", turns: { nudgeSeconds: 20, maxNudges: 1 } }, phase: "intro", cursor: 0, answers: {}, ...live },
    gemini: {}, config: anviConfig({}), clock: time.clock, timers: time.timers, log: { warn() {} }, tenantKey: "t1",
    persist: {
      async saveLive(patch) { Object.assign(doc, structuredClone(patch)); return { matchedCount: 1 }; },
      async markFinalizing() {}, async finalize() { return { applied: true }; },
    },
    audioAssets: {
      async ensure(spec) {
        const key = `${spec.scope}|${spec.questionId ?? spec.templateId}`;
        if (!idFor.has(key)) idFor.set(key, (++ids).toString(16).padStart(24, "0"));
        return { assetId: idFor.get(key), durationMs: 400 };
      },
      async load(assetId) { return { assetId, pcm: Buffer.alloc(4800, 1), durationMs: 100 }; },
    },
    transcripts: { async transcribe() { return { text: "dobara boliye", model: "m", attempts: 1, audioSeconds: 2 }; } },
    decision: { async decide() { throw new Error("no decision expected"); } },
  });
  c.on("prompt", (p) => seen.prompts.push(p));
  c.on("replay", (r) => seen.replays.push(r));
  return { c, time, seen, doc };
}

const last = (h) => h.seen.prompts.at(-1);
const play = async (h) => { h.c.promptPlayed({ turnId: last(h).turnId }); await flush(); };

async function speak(h) {
  const turnId = last(h).turnId;
  const segmentId = randomUUID();
  const pcm = Buffer.alloc(64000);
  for (let i = 0; i < pcm.length / 2; i += 1) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  for (let index = 0; index * 32768 < pcm.length; index += 1)
    h.c.acceptChunk({ turnId, segmentId, part: 0, index, pcm: pcm.subarray(index * 32768, (index + 1) * 32768) });
  await h.c.commitSegment({ turnId, segmentId, part: 0, final: true, totalBytes: pcm.length, durationMs: 2000 });
  await flush();
}

test("'repeat' after a nudge replays the question clip, and the question text stays on screen", async () => {
  const h = harness();
  await h.c.start();
  await flush();
  await play(h); // intro
  const question = last(h);
  assert.equal(question.kind, "question");
  await play(h);
  await h.time.advance(20_000);
  assert.equal(last(h).kind, "nudge");
  assert.equal(last(h).text, templateText("nudge.think_time"));
  await play(h);
  assert.equal(h.c.state().questionText, QUESTION);
  await speak(h);
  assert.equal(h.seen.replays.length, 1);
  assert.equal(h.seen.replays[0].assetId, question.assetIds[1]);
  assert.equal(h.doc["hybrid.turn"].questionText, QUESTION);
  h.c.dispose();
});

test("releasing a hold during a nudge replays the question clip, not the nudge", async () => {
  const h = harness();
  await h.c.start();
  await flush();
  await play(h); // intro
  const question = last(h);
  await play(h);
  await h.time.advance(20_000);
  assert.equal(last(h).kind, "nudge");
  await play(h);
  h.c.hold();
  h.c.releaseHold();
  await flush();
  assert.equal(last(h).kind, "question");
  assert.equal(last(h).text, QUESTION);
  assert.deepEqual(last(h).assetIds, [question.assetIds[1]]);
  h.c.dispose();
});

test("a rejoin during a nudge turn restores the question text", async () => {
  const h = harness({
    phase: "asking",
    hybrid: { turnState: "listening", turn: { turnId: randomUUID(), qid: "q1", kind: "nudge", text: templateText("nudge.think_time"), assetIds: [], questionText: QUESTION, questionKind: "question" } },
  });
  await h.c.start({ resumed: true });
  await flush();
  assert.equal(h.c.state().questionText, QUESTION);
  // The question is asked again, not the nudge line.
  assert.equal(last(h).kind, "question");
  assert.equal(last(h).text, QUESTION);
  h.c.dispose();
});
