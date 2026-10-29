import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIInterview from "../src/models/AIInterview.js";
import User from "../src/models/User.js";
import { InterviewEngagementReceipt } from "../src/models/AdaptiveEngagement.js";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { aiInterviewStarted } from "../src/services/coinEntitlements.js";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { AnviAttempt, AnviLiveSession } from "../src/modules/anviInterview/anviInterview.models.js";
import { moveOnInstruction, resumeInstruction } from "../src/modules/anviInterview/anviInterview.prompts.js";
import { createAnviService } from "../src/modules/anviInterview/anviInterview.service.js";
import { createAnviEvaluator } from "../src/modules/anviInterview/anviInterview.evaluation.js";
import { registerAnviSocketHandlers } from "../src/modules/anviInterview/anviInterview.socket.js";

// End to end across the real modules: service start (real plan builder) -> socket join -> conductor
// -> finalise -> student detail. Only Gemini is faked; no network call is made.
const waitFor = async (check, label) => {
  for (let i = 0; i < 300; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

class FakeLive extends EventEmitter {
  constructor(options) { super(); Object.assign(this, { options, audio: 0, texts: [], closed: false }); }
  sendAudio() { this.audio += 1; return true; }
  sendText(text) { this.texts.push(text); return true; }
  close() { if (this.closed) return; this.closed = true; this.emit("closed", { code: 1000, reason: "", byClient: true }); }
  say(text) { this.emit("audio", Buffer.alloc(4800, 1)); this.emit("outputText", text); this.emit("turnComplete"); }
}

function fakeGemini() {
  const sessions = [];
  const generated = [];
  let transcripts = 0;
  return {
    sessions, generated,
    async openLive(options) { const live = new FakeLive(options); sessions.push(live); return live; },
    async generateJson(request) {
      generated.push(request);
      // Evaluation requests carry the answers in an <items> block; everything else is question generation.
      const items = request.parts?.[0]?.text?.match(/<items>([\s\S]*)<\/items>/);
      if (items) {
        return { items: JSON.parse(items[1]).map((item) => ({
          qid: item.qid, keyPoints: item.keyPoints.map((point) => ({ index: point.index, verdict: "matched" })), relevanceLevel: 2,
          rubric: [{ id: "r1", level: 3 }], feedback: "You gave a clear answer.", strengths: ["Clear"], improvements: ["Add an example"],
        })) };
      }
      return { questions: [{ text: "How would you index a large SQL table?", keyPoints: ["B-tree", "selectivity"] }] };
    },
    async transcribePcm({ pcm }) { transcripts += 1; return `Transcribed answer ${transcripts}: I would explain the idea step by step with an example (${pcm.length} bytes)`; },
  };
}

class FakeSocket {
  constructor(userId) {
    Object.assign(this, { userId: String(userId), universityId: "platform", userRole: "student", connected: true, handlers: new Map(), sent: [] });
  }
  on(event, fn) { this.handlers.set(event, fn); }
  emit(event, payload) { this.sent.push({ event, payload }); }
  call(event, payload) { return new Promise((resolve) => this.handlers.get(event)(payload, resolve)); }
  fire(event, payload) { this.handlers.get(event)?.(payload); }
  got(event) { return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload); }
}

function fakeIo() {
  const listeners = [];
  return {
    on(event, fn) { if (event === "connection") listeners.push(fn); },
    connect(socket) { for (const fn of listeners) fn(socket); return socket; },
  };
}

const definition = normalizeDefinition({
  title: "Backend practice", role: "Backend engineer", experience: "fresher", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  // Profiles saved before the rename still say ANNU; the interviewer must introduce herself as ANVI.
  interviewer: { profileId: "p1", displayName: "ANNU", tone: "Friendly" },
  sections: [{
    id: "s1", name: "Technical", weight: 100, groups: [
      { id: "g1", name: "APIs", weight: 50, source: "manual", questions: [
        { id: "q1", kind: "specific", prompt: "Explain REST.", expectedAnswer: "Stateless requests. Resources have URLs.", followUps: [{ id: "f1", prompt: "What makes it stateless?" }] },
        { id: "q2", kind: "topic", prompt: "Caching" },
      ] },
      { id: "g2", name: "Databases", weight: 50, source: "annu", annu: { requirements: "Ask about indexing.", skills: ["SQL"], targetCount: 1, maxFollowUps: 1 } },
    ],
  }],
  rubric: [{ id: "r1", name: "Clarity", weight: 100 }],
});

test("start, live interview over the socket, finalise and read back the answers", async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) {
    if (error?.code === "EPERM") return t.skip("Local sockets are unavailable in this sandbox");
    throw error;
  }
  try {
    await mongoose.connect(mongo.getUri(), { dbName: "anvi_integration_test" });
    await Promise.all([AIInterview.init(), AnviAttempt.init(), AnviLiveSession.init(), InterviewEngagementReceipt.init()]);
    const config = anviConfig({ GEMINI_API_KEY: "test-key" });
    const gemini = fakeGemini();
    // Finalisation only records the evaluation trigger here; the report is produced explicitly below.
    const triggered = [];
    const evaluateSoon = (attemptId) => { triggered.push(String(attemptId)); return null; };
    const service = createAnviService({ gemini, config, evaluateSoon });
    const io = fakeIo();
    registerAnviSocketHandlers(io, {
      gemini, config, getTenant: async () => null, log: { warn() {} }, evaluateSoon,
      // Nudge and deadline timers never fire here; finalisation does not depend on them.
      timers: { setTimeout: () => 0, clearTimeout() {} },
    });

    const studentId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: studentId, name: "Asha Verma", role: "student", isActive: true, accessScope: "full", college: "GEU" });
    const student = { _id: studentId, role: "student", accessScope: "full", college: "GEU" };
    const interview = await AIInterview.create({
      ownerId: new mongoose.Types.ObjectId(), creationKey: "integration", title: definition.title, role: definition.role, data: definition,
      publishedSnapshot: { data: definition, revision: 2, at: new Date() }, publishedAt: new Date(), publishedRevision: 2,
    });

    const [listed] = await service.listStudentInterviews(student);
    assert.equal("questionCount" in listed, false, "students are never told how many prompts there are");
    assert.equal(listed.status, "not_started");

    const started = await service.startAttempt(student, String(interview._id), {});
    assert.deepEqual(Object.keys(started).sort(), ["id", "language", "resumed", "status", "terms"]);
    assert.equal(started.language, "English");
    assert.equal(gemini.generated.length, 1, "the ANVI-prompt group is generated once at start");
    assert.equal(gemini.generated[0].model, config.generateModel);
    const liveDoc = await AnviLiveSession.findOne({ attemptId: started.id }).lean();
    assert.deepEqual(liveDoc.plan.map((item) => [item.qid, item.n, item.source]), [["q1", 1, "manual"], ["q2", 2, "manual"], ["g2-g1", 3, "annu"]]);
    assert.equal(liveDoc.persona.displayName, "ANVI");
    // The interview language and its policy travel with the plan (older definitions: rules.language, strict).
    assert.equal(liveDoc.rules.language, "English");
    assert.deepEqual(liveDoc.rules.languagePolicy, { strict: true, onOtherLanguage: "remind_and_flag" });
    assert.equal(await aiInterviewStarted(student, String(interview._id)), true);

    const socket = io.connect(new FakeSocket(studentId));
    const joined = await socket.call("anvi:join", { attemptId: started.id });
    assert.equal(joined.ok, true, joined.message);
    assert.equal(joined.state.phase, "intro");
    assert.equal("totalQuestions" in joined.state || "questionNumber" in joined.state, false);
    const live1 = gemini.sessions.at(-1);
    assert.match(live1.options.systemText, /You are ANVI, PeerPrep's AI interviewer/);
    assert.doesNotMatch(live1.options.systemText, /ANNU/);
    assert.match(live1.options.systemText, /Explain REST\./);
    assert.match(live1.options.systemText, /How would you index a large SQL table\?/);
    assert.equal(live1.options.voice, config.liveVoice);
    assert.equal(live1.options.languageCode, "en-IN");
    assert.match(live1.options.systemText, /This interview is conducted in English only/);
    assert.match(live1.texts[0], /^\[server\] Asha has joined/);

    const speak = (text, frames = 5) => {
      for (let i = 0; i < frames; i += 1) socket.fire("anvi:audio", new Uint8Array(3200).fill(9).buffer);
      gemini.sessions.at(-1).emit("inputText", text);
    };

    // ANVI never speaks plan numbers: Question 1 is recognised by its wording, later ones are server-led.
    live1.say("Hello Asha, I'm ANVI. Shall we begin?");
    speak("Yes, ready.", 1);
    live1.say("Great, let's start. Explain REST.");
    assert.equal(socket.got("anvi:state").at(-1).phase, "asking");
    assert.equal(socket.got("anvi:state").at(-1).questionText, "Explain REST.");
    assert.equal("questionNumber" in socket.got("anvi:state").at(-1), false);
    speak("REST uses stateless requests over HTTP.");

    // Upstream drop mid-question: the server reconnects by itself and tells the client so.
    live1.emit("closed", { code: 1011, reason: "upstream", byClient: false });
    const dropped = socket.got("anvi:error").at(-1);
    assert.equal(dropped.code, "LIVE_DISCONNECTED");
    assert.equal(dropped.reconnecting, true);
    await waitFor(() => gemini.sessions.length === 2, "server reconnect");
    const live2 = gemini.sessions.at(-1);
    // The candidate had started answering, so ANVI asks them to carry on rather than start over.
    assert.deepEqual(live2.texts, [resumeInstruction({ n: 1, total: 3, answered: true, followUps: [] })]);

    live2.say("Sorry about that. Please carry on explaining REST.");
    speak("It is stateless and resource based.");
    live2.say("Okay, thank you, let's move on.");
    assert.equal(live2.texts.at(-1), moveOnInstruction(2));
    live2.say("How would you decide what to cache in a web app?");
    const asking2 = socket.got("anvi:state").at(-1);
    assert.equal(asking2.followUp, false);
    assert.equal(asking2.questionText, "How would you decide what to cache in a web app?", "topic questions show ANVI's own wording");
    speak("Cache hot reads with a TTL.");
    live2.say("Got it, let's move on.");
    assert.equal(live2.texts.at(-1), moveOnInstruction(3));
    live2.say("How would you index a large SQL table?");
    assert.equal(socket.got("anvi:state").at(-1).questionText, "How would you index a large SQL table?");
    speak("A B-tree index on selective columns.");
    live2.say("That completes our interview. Thank you, Asha.");

    await waitFor(() => socket.got("anvi:ended").length, "ended");
    assert.deepEqual(socket.got("anvi:ended").at(-1), { status: "completed", endReason: "completed" });
    assert.equal(await AnviLiveSession.countDocuments({ attemptId: started.id }), 0);

    const detail = await service.getAttemptForStudent(student, started.id);
    assert.equal(detail.status, "completed");
    assert.equal("totalQuestions" in detail, false, "the student view carries no question count");
    assert.deepEqual(detail.items.map((item) => item.status), ["answered", "answered", "answered"]);
    // Second-pass transcription is opt-in (ANVI_ACCURATE_TRANSCRIPTION): the Live transcript is kept.
    assert.equal(detail.items[0].answerText, "REST uses stateless requests over HTTP. It is stateless and resource based.");
    assert.equal(detail.items[1].questionText, "How would you decide what to cache in a web app?");
    assert.doesNotMatch(JSON.stringify(detail), /B-tree"|selectivity|Stateless requests/, "key points stay server side");
    const stored = await AnviAttempt.findById(started.id).lean();
    assert.deepEqual(stored.items[2].expectedKeyPoints, ["B-tree", "selectivity"]);
    assert.equal(stored.items[0].answerSource, "live");
    assert.equal(stored.totalQuestions, 3);

    const receipt = await InterviewEngagementReceipt.findOne({ sessionId: started.id }).lean();
    assert.ok(receipt?.completedAt, "the completion receipt is written");
    const [after] = await service.listStudentInterviews(student);
    assert.equal(after.status, "completed");
    assert.equal(after.lastAttempt.id, started.id);

    // Evaluation: queued by the finalize write, then scored in the background from the stored answers.
    assert.deepEqual(triggered, [started.id]);
    assert.equal(stored.pendingWork.status, "pending");
    assert.equal(stored.partial, false);
    assert.deepEqual(stored.rubricSnapshot.map((criterion) => criterion.id), ["r1"]);
    assert.equal(detail.report, "preparing");
    const notes = [];
    const evaluator = createAnviEvaluator({ gemini, config, notify: async (note) => { notes.push(note); return true; }, log: { warn() {} } });
    assert.ok(evaluator.soon(started.id), "an immediate run starts when a slot is free");
    await evaluator.idle();
    const evaluations = gemini.generated.filter((request) => /<items>/.test(request.parts?.[0]?.text || ""));
    assert.equal(evaluations.length, 1, "one call for the one section");
    assert.equal(evaluations[0].temperature, 0);
    const report = await service.getAttemptForStudent(student, started.id);
    assert.equal(report.status, "ready");
    assert.equal(report.report, "ready");
    assert.equal(report.items.length, 3);
    assert.deepEqual(report.items[0].matched, report.items[0].expectedKeyPoints);
    assert.equal(report.items[1].percentCorrect, 50, "no key points: relevance 2 of 4");
    assert.equal(report.overall.max, 30);
    assert.ok(report.overall.score > 0);
    assert.ok(report.bySection.length >= 1);
    assert.doesNotMatch(JSON.stringify(report), /expectedAnswer/);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].actionUrl, `/student/ai-interviews/room/${started.id}`);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("a topic question ANVI never phrased is shown to the student by its topic", async (t) => {
  let mongo;
  try { mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } }); }
  catch (error) {
    if (error?.code === "EPERM") return t.skip("Local sockets are unavailable in this sandbox");
    throw error;
  }
  try {
    await mongoose.connect(mongo.getUri(), { dbName: "anvi_integration_topic" });
    await AnviAttempt.init();
    const studentId = new mongoose.Types.ObjectId();
    const attempt = await AnviAttempt.create({
      studentId, interviewId: new mongoose.Types.ObjectId(), snapshotRevision: 1, status: "abandoned",
      hardDeadline: new Date(), items: [{ qid: "q2", n: 1, questionText: "Ask one question about: Caching", status: "not_attempted" }],
    });
    const service = createAnviService({ gemini: fakeGemini(), config: anviConfig({ GEMINI_API_KEY: "test-key" }) });
    const detail = await service.getAttemptForStudent({ _id: studentId }, String(attempt._id));
    assert.equal(detail.items[0].questionText, "A question about Caching");
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
