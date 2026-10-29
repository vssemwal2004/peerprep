import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createConductor } from "../src/modules/anviInterview/anviInterview.conductor.js";
import * as prompts from "../src/modules/anviInterview/anviInterview.prompts.js";

// ANVI never speaks plan numbers ("internal plan item N ... never speak its number or label"). These tests
// drive the conductor with unnumbered turns only: server-led moves, fixed questions recognised by their
// wording, and the default (opt-in) second-pass transcription.
const settle = async (rounds = 4) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const voice = (bytes = 3200) => Buffer.alloc(bytes, 7);

class FakeLive extends EventEmitter {
  constructor() { super(); this.texts = []; this.closed = false; }
  sendAudio() {}
  sendText(text) { this.texts.push(text); }
  close() { if (this.closed) return; this.closed = true; this.emit("closed", { code: 1000, reason: "" }); }
  say(text) { this.emit("audio", Buffer.alloc(4800, 1)); this.emit("outputText", text); this.emit("turnComplete"); }
}

const PLAN = [
  { qid: "q1", n: 1, sectionName: "Core", text: "Explain closures in JavaScript.", keyPoints: ["captures scope"], followUpBudget: 1 },
  { qid: "q2", n: 2, sectionName: "Web", text: "What is an ETag and when does the browser send it?", keyPoints: [], followUpBudget: 1 },
  { qid: "q3", n: 3, sectionName: "Behaviour", text: `${prompts.TOPIC_PREFIX}handling deadlines`, keyPoints: [], followUpBudget: 0 },
];

function setup({ plan = PLAN, config = {}, rules = {} } = {}) {
  const sessions = [];
  const transcriptions = [];
  const finals = [];
  const states = [];
  const gemini = {
    async openLive() { const live = new FakeLive(); sessions.push(live); return live; },
    async transcribePcm({ pcm }) { transcriptions.push(pcm.length); return `transcript ${transcriptions.length}`; },
  };
  const conductor = createConductor({
    attempt: { _id: "attempt-1", mode: "practice", language: "English", hardDeadline: new Date(Date.now() + 30 * 60_000) },
    live: { plan, persona: { displayName: "ANVI" }, rules: { language: "English", ...rules }, phase: "intro", cursor: 0, answers: {} },
    gemini,
    config: { liveVoice: "Aoede", silenceMs: 2000, ...config },
    persist: { async saveLive() {}, async finalize(payload) { finals.push(payload); } },
    timers: { setTimeout: () => 0, clearTimeout() {} },
    log: { warn() {} },
    studentFirstName: "Asha",
  });
  conductor.on("state", (state) => states.push(state));
  conductor.on("error", () => {});
  return { conductor, sessions, transcriptions, finals, state: () => states.at(-1), live: () => sessions.at(-1) };
}

async function begin(ctx) {
  await ctx.conductor.start();
  const live = ctx.live();
  live.say("Hello Asha, I am ANVI. Shall we begin?");
  live.emit("inputText", "Yes, I am ready.");
  return live;
}

test("an imperative Question 1 after \"let's start\" is recognised by its wording", async () => {
  const ctx = setup();
  const live = await begin(ctx);
  live.say("Great, let's start. Explain closures in JavaScript.");
  assert.deepEqual([ctx.state().phase, ctx.state().questionNumber], ["asking", 1]);
  ctx.conductor.pushAudio(voice());
  assert.equal(ctx.conductor.stats().bufferedBytes, 3200, "the answer to Question 1 is captured");
  assert.equal(live.texts.some((text) => text === prompts.moveOnInstruction(1)), false);
});

test("a topic Question 1 behind a short transition is taken as Question 1 and keeps ANVI's wording", async () => {
  const plan = [{ ...PLAN[2], n: 1 }, { ...PLAN[0], n: 2 }];
  const ctx = setup({ plan });
  const live = await begin(ctx);
  live.say("Great, let's start. How do you usually handle a tight deadline in a team project?");
  assert.deepEqual([ctx.state().phase, ctx.state().questionNumber], ["asking", 1]);
  assert.equal(ctx.state().questionText, "How do you usually handle a tight deadline in a team project?");

  // A ready check is still not a question.
  const other = setup({ plan });
  const room = await begin(other);
  room.say("Wonderful. Before we start, can you hear me clearly?");
  assert.equal(other.state().phase, "intro");
});

test("moving on by herself to the next fixed question advances the cursor instead of counting a follow-up", async () => {
  const ctx = setup();
  const live = await begin(ctx);
  live.say("Explain closures in JavaScript.");
  live.emit("inputText", "A closure keeps the outer scope alive after the function returns.");
  live.say("Thank you. What is an ETag, and when does the browser send it?");
  assert.equal(ctx.state().questionNumber, 2);
  assert.equal(ctx.state().followUp, false);
  await ctx.conductor.end();
  assert.deepEqual(ctx.finals[0].items[0].followUpsAsked, []);
  assert.equal(ctx.finals[0].items[0].status, "answered");
});

test("repeating the current question on request is a re-ask, not a follow-up", async () => {
  const ctx = setup();
  const live = await begin(ctx);
  live.say("Explain closures in JavaScript.");
  live.emit("inputText", "Sorry, can you repeat that?");
  live.say("Sure. Can you explain closures in JavaScript?");
  assert.equal(ctx.state().followUp, false);
  assert.equal(ctx.state().questionNumber, 1);
  live.emit("inputText", "A closure keeps its scope.");
  live.say("What happens with closures inside a loop?");
  assert.equal(ctx.state().followUp, true, "a real follow-up still counts");
  await ctx.conductor.end();
  assert.deepEqual(ctx.finals[0].items[0].followUpsAsked, ["What happens with closures inside a loop?"]);
});

test("\"let's move on\" makes the server name the next internal item, whose reply is taken as it", async () => {
  const ctx = setup();
  const live = await begin(ctx);
  live.say("Explain closures in JavaScript.");
  live.emit("inputText", "They keep scope.");
  live.say("Thank you, let's move on.");
  assert.equal(live.texts.at(-1), prompts.moveOnInstruction(2));
  assert.equal(prompts.QUESTION_MARKER.test(live.texts.at(-1)), false, "the instruction asks for no spoken marker");
  live.say("Tell me about ETags.");
  assert.equal(ctx.state().questionNumber, 2);
});

test("after a warm-up, a later plan item asked by its wording is corrected to Question 1", async () => {
  const ctx = setup({ rules: { warmup: { enabled: true, icebreakers: 1, tellMeAboutYourself: false } } });
  const live = await begin(ctx);
  live.say("How has your day been so far?");
  live.emit("inputText", "Pretty good, thanks.");
  live.say("Nice. So, what is an ETag and when does the browser send it?");
  assert.equal(ctx.state().phase, "intro");
  assert.equal(live.texts.at(-1), prompts.firstQuestionInstruction(1));
  live.say("Let us begin. Explain closures in JavaScript.");
  assert.deepEqual([ctx.state().phase, ctx.state().questionNumber], ["asking", 1]);
});

test("second-pass transcription is off by default; the Live transcript is kept", async () => {
  const ctx = setup();
  const live = await begin(ctx);
  live.say("Explain closures in JavaScript.");
  ctx.conductor.pushAudio(voice());
  live.emit("inputText", "Scope.");
  live.say("Thank you, let's move on.");
  live.say("What is an ETag and when does the browser send it?");
  await settle();
  assert.equal(ctx.transcriptions.length, 0);
  assert.equal(ctx.conductor.stats().bufferedBytes, 0, "the audio is released all the same");
  await ctx.conductor.end();
  assert.deepEqual([ctx.finals[0].items[0].answerText, ctx.finals[0].items[0].answerSource], ["Scope.", "live"]);

  // Opted in, a short Live transcript is repaired.
  const opted = setup({ config: { accurateTranscription: true } });
  const room = await begin(opted);
  room.say("Explain closures in JavaScript.");
  opted.conductor.pushAudio(voice());
  room.emit("inputText", "Scope.");
  await opted.conductor.end();
  assert.deepEqual([opted.finals[0].items[0].answerText, opted.finals[0].items[0].answerSource], ["transcript 1", "transcribe"]);
});
