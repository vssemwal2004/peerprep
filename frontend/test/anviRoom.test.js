import assert from "node:assert/strict";
import { before, after, afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { StrictMode, act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom, server, root, createRoot, AnviRoom, api, socketService, worklet, player, live;
const globals = ["window", "document", "navigator", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame", "AudioWorkletNode", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

// Minimal Web Audio stand-ins: enough graph surface for the capture and playback code paths.
class FakeAudioContext {
  static instances = [];
  constructor(options = {}) {
    this.options = options;
    this.sampleRate = options.sampleRate || 48000;
    this.state = "running";
    this.now = 0;
    this.destination = {};
    this.sources = [];
    this.audioWorklet = { modules: [], addModule: async (url) => {
      if (FakeAudioContext.failWorklet) throw new Error("worklet blocked");
      this.audioWorklet.modules.push(String(url));
    } };
    FakeAudioContext.instances.push(this);
  }
  get currentTime() { return this.now; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData: (array) => array.fill(0) }; }
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(at) { source.startedAt = at; }, stop(at) { source.stoppedAt = at; }, onended: null };
    this.sources.push(source);
    return source;
  }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

class FakeWorkletNode {
  static last = null;
  constructor(context, name, options) {
    this.name = name;
    this.options = options;
    this.port = { onmessage: null, messages: [], postMessage: (message) => this.port.messages.push(message), close: () => { this.port.closed = true; } };
    FakeWorkletNode.last = this;
  }
  connect() {}
  disconnect() { this.disconnected = true; }
}

function fakeSocket() {
  const listeners = new Map();
  const socket = {
    connected: true,
    emitted: [],
    acks: [],
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
    off(event, fn) { listeners.get(event)?.delete(fn); },
    emit(event, ...args) { socket.emitted.push({ event, args }); },
    timeout(ms) { return { emit: (event, payload, ack) => socket.acks.push({ event, payload, ack, ms }) }; },
    fire(event, payload) { for (const fn of [...(listeners.get(event) || [])]) fn(payload); },
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
  return socket;
}

function fakeStream() {
  const track = { label: "Test microphone", stopped: false, onended: null, stop() { track.stopped = true; } };
  return { active: true, track, getTracks: () => [track], getAudioTracks: () => [track] };
}

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews/room/attempt-one", pretendToBeVisual: true });
  Object.defineProperty(dom.window, "isSecureContext", { configurable: true, value: true });
  dom.window.AudioContext = FakeAudioContext;
  dom.window.AudioWorkletNode = FakeWorkletNode;
  dom.window.navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  for (const name of globals) Object.defineProperty(globalThis, name, {
    configurable: true, writable: true,
    value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
  });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  AnviRoom = (await server.ssrLoadModule("/src/student/anvi/AnviRoom.jsx")).default;
  api = (await server.ssrLoadModule("/src/utils/api.js")).api;
  socketService = (await server.ssrLoadModule("/src/utils/socket.js")).default;
  worklet = await server.ssrLoadModule("/src/student/anvi/anviPcmCapture.worklet.js");
  player = await server.ssrLoadModule("/src/student/anvi/anviAudioPlayer.js");
  live = await server.ssrLoadModule("/src/student/anvi/useAnviLiveSession.js");
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

const render = async (attemptId = "attempt-one") => {
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId }))));
  await tick();
};
const buttonNamed = (pattern) => [...document.querySelectorAll("button")].find((button) => pattern.test(button.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

const activeAttempt = { id: "attempt-one", status: "in_progress", title: "Frontend practice", role: "Frontend engineer", language: "English", totalQuestions: 3, startedAt: new Date().toISOString(), hardDeadline: new Date(Date.now() + 20 * 60000).toISOString() };

// ---- Capture: 16 kHz Int16 framing and anti-aliasing ----

const tone = (rate, hz, seconds, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
const frameRms = (frame) => Math.sqrt(frame.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / frame.length);
const pushInBlocks = (framer, samples) => { for (let i = 0; i < samples.length; i += 128) framer.push(samples.subarray(i, i + 128)); };

test("48 kHz capture becomes 100 ms 16 kHz Int16 frames and keeps speech-band level", () => {
  const frames = [];
  const framer = new worklet.PcmFramer(48000, (frame) => frames.push(frame));
  pushInBlocks(framer, tone(48000, 1000, 0.3));
  assert.equal(frames.length, 3);
  assert.ok(frames.every((frame) => frame instanceof Int16Array && frame.length === 1600 && frame.buffer.byteLength === 3200));
  assert.ok(Math.abs(frameRms(frames[2]) - 0.5 / Math.SQRT2) < 0.02, `1 kHz level ${frameRms(frames[2])}`);
});

test("content above 8 kHz is filtered instead of aliasing into the speech band", () => {
  const frames = [];
  const framer = new worklet.PcmFramer(48000, (frame) => frames.push(frame));
  pushInBlocks(framer, tone(48000, 12000, 0.3));
  assert.ok(frameRms(frames[2]) < 0.03, `12 kHz leaked at ${frameRms(frames[2])}`);
});

test("44.1 kHz and 8 kHz inputs produce the right number of 16 kHz frames", () => {
  const cd = [];
  pushInBlocks(new worklet.PcmFramer(44100, (frame) => cd.push(frame)), tone(44100, 440, 1.0014));
  assert.equal(cd.length, 10);
  const narrow = [];
  pushInBlocks(new worklet.PcmFramer(8000, (frame) => narrow.push(frame)), tone(8000, 440, 1));
  assert.equal(narrow.length, 10);
});

test("samples are clamped to the Int16 range", () => {
  const frames = [];
  const framer = new worklet.PcmFramer(16000, (frame, rms) => frames.push({ frame, rms }));
  framer.push(Float32Array.from({ length: 1600 }, (_, i) => (i % 2 ? 2 : -2)));
  assert.equal(frames[0].frame[0], -32768);
  assert.equal(frames[0].frame[1], 32767);
  assert.ok(frames[0].rms > 0.99);
});

// ---- Playback: gapless scheduling, jitter buffer, barge-in flush ----

test("ANVI audio chunks are scheduled back to back after a 120 ms jitter buffer", () => {
  const context = new FakeAudioContext({ sampleRate: 24000 });
  const changes = [];
  const audio = player.createAnviAudioPlayer({ context, onSpeakingChange: (value) => changes.push(value) });
  context.now = 1;
  const chunk = new Uint8Array(4800); // 2400 samples = 100 ms at 24 kHz
  audio.enqueue(chunk); audio.enqueue(chunk); audio.enqueue(chunk.buffer);
  const starts = context.sources.map((source) => source.startedAt);
  assert.deepEqual(starts.map((value) => Number(value.toFixed(6))), [1.12, 1.22, 1.32]);
  assert.equal(audio.isSpeaking(), true);
  context.now = 1.42;
  context.sources.forEach((source) => source.onended());
  assert.equal(audio.isSpeaking(), false);
  assert.deepEqual(changes, [true, false]);

  // A gap inside an utterance widens the buffer for the next start.
  context.now = 1.5;
  audio.enqueue(chunk);
  assert.equal(Number(context.sources.at(-1).startedAt.toFixed(6)), 1.66);

  audio.flush();
  assert.equal(audio.isSpeaking(), false);
  assert.ok(Number.isFinite(context.sources.at(-1).stoppedAt));
  assert.equal(audio.queuedSeconds(), 0);
});

test("odd byte boundaries between chunks are carried, not dropped", () => {
  const first = player.int16ToFloat32(new Uint8Array([0x00, 0x40, 0x01]));
  assert.deepEqual([...first.samples], [0.5]);
  assert.equal(first.carry, 0x01);
  const second = player.int16ToFloat32(new Uint8Array([0x00]), first.carry);
  assert.deepEqual([...second.samples], [1 / 32768]);
  assert.equal(second.carry, null);
});

test("captions merge streaming chunks into one line per speaker turn", () => {
  let list = [];
  list = live.mergeCaption(list, { role: "anvi", text: "Hello ", final: false });
  list = live.mergeCaption(list, { role: "anvi", text: "there.", final: true });
  list = live.mergeCaption(list, { role: "candidate", text: "Hi", final: false });
  list = live.mergeCaption(list, { role: "candidate", text: "Hi, I am ready", final: true });
  assert.deepEqual(list.map(({ role, text, final }) => ({ role, text, final })), [
    { role: "anvi", text: "Hello there.", final: true },
    { role: "candidate", text: "Hi, I am ready", final: true },
  ]);
});

test("a candidate line stays open while ANVI's reply streams, so its final text does not duplicate", () => {
  let list = [];
  list = live.mergeCaption(list, { role: "candidate", text: "I used React", final: false });
  list = live.mergeCaption(list, { role: "anvi", text: "Okay.", final: false });
  list = live.mergeCaption(list, { role: "anvi", text: "Okay. Question 2: How did you test it?", final: true });
  list = live.mergeCaption(list, { role: "candidate", text: "I used React and Vite.", final: true });
  list = live.mergeCaption(list, { role: "candidate", text: "With Vitest.", final: false });
  assert.deepEqual(list.map(({ role, text, final }) => ({ role, text, final })), [
    { role: "candidate", text: "I used React and Vite.", final: true },
    { role: "anvi", text: "Okay. Question 2: How did you test it?", final: true },
    { role: "candidate", text: "With Vitest.", final: false },
  ]);
});

// ---- Room ----

test("lobby explains the rules and Join now stays disabled until consent", async () => {
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  const text = document.body.textContent;
  assert.match(text, /Frontend practice/);
  assert.match(text, /pause for about 2 seconds/);
  assert.match(text, /repeat/);
  assert.match(text, /Audio is not stored/);
  assert.match(text, /Headphones recommended/);
  assert.match(text, /My spoken answers are processed by Google Gemini to run this interview; audio is not saved\./);
  const start = buttonNamed(/Join now/);
  assert.ok(start);
  assert.equal(start.disabled, true);
  await click(document.querySelector('input[type="checkbox"]'));
  assert.equal(buttonNamed(/Join now/).disabled, false);
  assert.equal(document.querySelector("textarea"), null);
  assert.equal(buttonNamed(/submit|answer|record/i), undefined);
});

test("live room joins, streams mic frames, sends silence while ANVI speaks and cleans up", async () => {
  const socket = fakeSocket();
  const stream = fakeStream();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => stream };
  FakeAudioContext.instances = [];
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  await click(document.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/));
  await tick();

  const contexts = FakeAudioContext.instances;
  assert.equal(contexts.length, 2);
  assert.equal(contexts[1].options.sampleRate, 24000);
  assert.match(contexts[0].audioWorklet.modules[0], /anviPcmCapture\.worklet\.js/);
  assert.equal(FakeWorkletNode.last.name, "anvi-pcm-capture");

  const join = socket.acks.find((item) => item.event === "anvi:join");
  assert.equal(join.payload.attemptId, "attempt-one");
  assert.match(join.payload.clientId, /^[A-Za-z0-9_-]{16,32}$/, "each join names this page load");
  assert.deepEqual(Object.keys(join.payload).sort(), ["attemptId", "clientId"]);
  await act(async () => join.ack(null, { ok: true, state: { phase: "asking", questionNumber: 1, totalQuestions: 3, questionText: "Walk me through a project you built.", followUp: false, deadlineAt: activeAttempt.hardDeadline } }));
  assert.doesNotMatch(document.body.textContent, /Question 1 of 3/, "the student is not shown the question count");
  assert.match(document.body.textContent, /Walk me through a project you built\./);
  assert.ok(document.querySelector('[aria-live="polite"]'));
  assert.equal(buttonNamed(/submit|answer/i), undefined);

  const frame = () => { const pcm = new Int16Array(1600).fill(1200).buffer; FakeWorkletNode.last.port.onmessage({ data: { pcm, rms: 0.08 } }); return pcm; };
  const lastAudio = () => socket.emitted.filter((item) => item.event === "anvi:audio").at(-1).args[0];

  const spoken = frame();
  assert.equal(lastAudio(), spoken);

  await act(async () => socket.fire("anvi:audio", new Uint8Array(4800).buffer));
  frame();
  assert.equal(lastAudio().byteLength, 3200);
  assert.ok(new Int16Array(lastAudio()).every((value) => value === 0), "mic must be replaced by silence while ANVI plays");

  await act(async () => socket.fire("anvi:interrupted"));
  frame();
  assert.ok(new Int16Array(lastAudio()).every((value) => value === 0), "silence continues through the echo tail");
  await tick(300);
  const after = frame();
  assert.equal(lastAudio(), after);

  await act(async () => socket.fire("anvi:caption", { role: "anvi", text: "Tell me more.", final: true }));
  assert.match(document.body.textContent, /Tell me more\./);

  await act(async () => socket.fire("anvi:state", { phase: "asking", questionNumber: 2, totalQuestions: 3, questionText: "How did you test it?", followUp: true, deadlineAt: activeAttempt.hardDeadline }));
  assert.match(document.body.textContent, /How did you test it\?/);
  assert.doesNotMatch(document.body.textContent, /Question 2 of 3/);
  assert.match(document.body.textContent, /Follow-up/);

  await act(async () => root.unmount());
  root = null;
  assert.deepEqual(socket.emitted.filter((item) => item.event === "anvi:leave").map((item) => item.args[0]), [{ attemptId: "attempt-one" }], "leaving the room tells the server to stop ANVI");
  assert.equal(socket.count(), 0, "only this room's listeners are removed");
  assert.equal(stream.track.stopped, true);
  assert.ok(contexts.every((context) => context.state === "closed"));
  assert.equal(FakeWorkletNode.last.port.onmessage, null);
});

test("an upstream drop the server is repairing pauses audio without a competing rejoin", async () => {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  await click(document.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/));
  await tick();
  const state = { phase: "asking", questionNumber: 1, totalQuestions: 3, questionText: "Why this role?", followUp: false, deadlineAt: activeAttempt.hardDeadline };
  await act(async () => socket.acks.find((item) => item.event === "anvi:join").ack(null, { ok: true, state }));
  const frames = () => socket.emitted.filter((item) => item.event === "anvi:audio").length;
  const frame = () => FakeWorkletNode.last.port.onmessage({ data: { pcm: new Int16Array(1600).fill(900).buffer, rms: 0.08 } });

  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "The connection to ANVI dropped. Reconnecting…", retryable: true, reconnecting: true }));
  assert.match(document.body.textContent, /Reconnecting/);
  const before = frames();
  frame();
  assert.equal(frames(), before, "no audio is sent while ANVI is reconnecting");
  await tick(2200);
  assert.equal(socket.acks.filter((item) => item.event === "anvi:join").length, 1, "the client waits for the server's own reconnect");

  await act(async () => socket.fire("anvi:state", state));
  assert.doesNotMatch(document.body.textContent, /Reconnecting/);
  frame();
  assert.equal(frames(), before + 1, "audio resumes on the same join");

  // When the server does not reconnect by itself, the client rejoins once after 2 s.
  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "Dropped.", retryable: true }));
  await tick(2200);
  assert.equal(socket.acks.filter((item) => item.event === "anvi:join").length, 2);
});

test("anvi:ended switches to the completion screen with the saved answers", async () => {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  let finished = false;
  api.getStudentAIAttempt = async () => (finished ? {
    ...activeAttempt, status: "completed", endedAt: new Date().toISOString(),
    items: [
      { n: 1, questionText: "Walk me through a project you built.", answerText: "I built a study planner in React.", status: "answered" },
      { n: 2, questionText: "How did you test it?", answerText: "", status: "skipped" },
    ],
  } : activeAttempt);
  await render();
  await click(document.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/));
  await tick();
  await act(async () => socket.acks.find((item) => item.event === "anvi:join").ack(null, { ok: true, state: { questionNumber: 1, totalQuestions: 2, questionText: "Walk me through a project you built." } }));
  finished = true;
  await act(async () => socket.fire("anvi:ended", { status: "completed", endReason: "completed" }));
  await tick(20);
  const text = document.body.textContent;
  assert.match(text, /Interview complete/);
  assert.match(text, /ANVI is preparing your report…/);
  assert.match(text, /AI-generated — may contain mistakes/);
  assert.match(text, /Your answer/);
  assert.match(text, /I built a study planner in React\./);
  assert.match(text, /Skipped/);
  assert.ok(buttonNamed(/Back/) || [...document.querySelectorAll("a")].find((link) => /Back to interviews/.test(link.textContent)));
});

// Renders the room, starts it, and returns the fake socket (the join is left unacknowledged).
async function startRoom({ stream = fakeStream(), attempt = activeAttempt } = {}) {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => stream };
  FakeAudioContext.instances = [];
  api.getStudentAIAttempt = async () => attempt;
  await render();
  await click(document.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/));
  await tick();
  return socket;
}
const joins = (socket) => socket.acks.filter((item) => item.event === "anvi:join");
const liveState = { phase: "asking", questionNumber: 1, totalQuestions: 3, questionText: "Why this role?", followUp: false, deadlineAt: activeAttempt.hardDeadline };

test("a join that timed out but then succeeds on the server resumes the room; unacknowledged audio is not played", async () => {
  const socket = await startRoom();
  const played = () => FakeAudioContext.instances[1].sources.length;
  await act(async () => socket.fire("anvi:audio", new Uint8Array(4800).buffer));
  assert.equal(played(), 0, "audio before the join is acknowledged is dropped");
  await act(async () => joins(socket)[0].ack(new Error("operation has timed out")));
  assert.match(document.body.textContent, /ANVI did not respond/);
  await act(async () => socket.fire("anvi:state", liveState));
  assert.doesNotMatch(document.body.textContent, /ANVI did not respond/);
  assert.match(document.body.textContent, /Why this role\?/);
  await act(async () => socket.fire("anvi:audio", new Uint8Array(4800).buffer));
  assert.equal(played(), 1);
  assert.ok(joins(socket)[0].ms >= 35000, "the join ack waits longer than the server's Live setup");
});

test("only one join is in flight; a retry meanwhile waits, and BUSY is not an error", async () => {
  const socket = await startRoom();
  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "Dropped.", retryable: true }));
  await click(buttonNamed(/Try again/));
  assert.equal(joins(socket).length, 1, "the first join is still pending");
  await tick(2200);
  assert.equal(joins(socket).length, 1, "the scheduled rejoin does not overlap the pending one");
  await act(async () => joins(socket)[0].ack(null, { ok: false, code: "BUSY", message: "Already joining an interview." }));
  assert.doesNotMatch(document.body.textContent, /Already joining/);
  await act(async () => socket.fire("anvi:state", liveState));
  assert.match(document.body.textContent, /Why this role\?/);
});

test("terminal join rejections offer the way out, not a retry that cannot work", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: false, code: "MODULE_DISABLED", message: "AI interviews are not enabled for your university.", retryable: false }));
  assert.match(document.body.textContent, /not enabled/);
  assert.equal(buttonNamed(/Try again/), undefined);
  assert.ok([...document.querySelectorAll("a")].some((link) => /All interviews/.test(link.textContent)));
});

test("an expired attempt is closed over REST and shows its answers", async () => {
  const socket = await startRoom();
  let ended = false;
  api.endStudentAIAttempt = async () => { ended = true; return { status: "expired" }; };
  api.getStudentAIAttempt = async () => (ended ? { ...activeAttempt, status: "expired", items: [{ n: 1, questionText: "Why this role?", answerText: "I like it.", status: "answered" }] } : activeAttempt);
  await act(async () => joins(socket)[0].ack(null, { ok: false, code: "ATTEMPT_EXPIRED", message: "This interview's time limit has passed." }));
  await tick(20);
  assert.equal(ended, true);
  assert.match(document.body.textContent, /I like it\./);
});

test("ending is sticky: a failed end offers End again, and a disconnect while ending never rejoins", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  let restCalls = 0;
  api.endStudentAIAttempt = async () => { restCalls += 1; throw new Error("Network down"); };
  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((button) => /End interview/.test(button.textContent)));
  const endAck = socket.acks.find((item) => item.event === "anvi:end");
  await act(async () => endAck.ack(null, { ok: false, code: "END_FAILED" }));
  await tick();
  assert.equal(restCalls, 1);
  assert.ok(buttonNamed(/End again/));
  assert.equal(buttonNamed(/Try again/), undefined);
  await click(buttonNamed(/End again/));
  assert.equal(joins(socket).length, 1, "ending again never resumes the interview");
  socket.connected = false;
  await act(async () => socket.fire("disconnect"));
  socket.connected = true;
  await act(async () => socket.fire("connect"));
  assert.equal(joins(socket).length, 1, "a reconnect while ending does not rejoin");
});

test("taken over: the microphone is released; a device audio pause shows Resume audio", async () => {
  const stream = fakeStream();
  const socket = await startRoom({ stream });
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  const [capture] = FakeAudioContext.instances;
  capture.state = "interrupted";
  await act(async () => capture.onstatechange?.());
  assert.ok(buttonNamed(/Resume audio/), "an interrupted context is reported");
  await click(buttonNamed(/Resume audio/));
  await tick();
  assert.equal(buttonNamed(/Resume audio/), undefined);
  await act(async () => socket.fire("anvi:taken_over", { attemptId: "attempt-one" }));
  assert.equal(stream.track.stopped, true, "the other tab owns the interview; this one stops its mic");
  assert.ok(buttonNamed(/Continue here/));
});

test("a handed-over lobby stream is stopped when audio capture cannot start", async () => {
  const stream = fakeStream();
  const socket = fakeSocket();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => stream };
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  await click(buttonNamed(/Test microphone/));
  await tick();
  FakeAudioContext.failWorklet = true;
  await click(document.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/));
  await tick();
  FakeAudioContext.failWorklet = false;
  assert.equal(stream.track.stopped, true, "the lobby handed it over, so the room must stop it");
  assert.match(document.body.textContent, /Audio could not start/);
});

test("the lobby names a busy microphone and blocks Join now after the time limit", async () => {
  navigator.mediaDevices = { getUserMedia: async () => { throw Object.assign(new Error("busy"), { name: "NotReadableError" }); } };
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, hardDeadline: new Date(Date.now() - 1000).toISOString() });
  await render();
  await click(buttonNamed(/Test microphone/));
  await tick();
  assert.match(document.body.textContent, /Another app is using the microphone\. Close it, then test again\./);
  await click(document.querySelector('input[type="checkbox"]'));
  assert.equal(buttonNamed(/Join now/).disabled, true);
  assert.match(document.body.textContent, /time limit has passed/);
});

const buttonLabelled = (pattern) => [...document.querySelectorAll("button")].find((button) => pattern.test(button.getAttribute("aria-label") || ""));
const press = (key, target = window) => act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); });

test("mute sends silence frames, M toggles it, and the room says the student is muted", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  const frame = () => { const pcm = new Int16Array(1600).fill(1500).buffer; FakeWorkletNode.last.port.onmessage({ data: { pcm, rms: 0.09 } }); return pcm; };
  const lastAudio = () => socket.emitted.filter((item) => item.event === "anvi:audio").at(-1).args[0];

  const mute = buttonLabelled(/^Mute microphone/);
  assert.ok(mute, "a mute button is shown");
  assert.equal(mute.getAttribute("aria-pressed"), "false");
  await click(mute);
  const unmute = buttonLabelled(/^Unmute microphone/);
  assert.equal(unmute.getAttribute("aria-pressed"), "true");
  const sentWhileMuted = frame();
  assert.notEqual(lastAudio(), sentWhileMuted);
  assert.equal(lastAudio().byteLength, 3200);
  assert.ok(new Int16Array(lastAudio()).every((value) => value === 0), "a muted mic is sent as silence, keeping frames flowing");
  assert.match(document.querySelector('[role="status"][aria-live="polite"]').textContent, /muted/i);
  assert.match(document.body.textContent, /Muted/);

  await press("m");
  assert.ok(buttonLabelled(/^Mute microphone/), "M unmutes");
  const spoken = frame();
  assert.equal(lastAudio(), spoken, "real audio resumes after unmuting");
});

test("C toggles live captions, shortcuts are ignored while the end dialog is open, and the panel shows the transcript", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  await act(async () => socket.fire("anvi:caption", { role: "anvi", text: "Tell me why you applied.", final: true }));
  assert.ok(document.querySelector('[aria-label="Live captions"]'));
  await press("c");
  assert.equal(document.querySelector('[aria-label="Live captions"]'), null);
  assert.equal(buttonLabelled(/live captions/).getAttribute("aria-pressed"), "false");
  await press("C");
  assert.ok(document.querySelector('[aria-label="Live captions"]'));

  await click(buttonNamed(/^Transcript$/));
  assert.match(document.querySelector('[role="log"]').textContent, /Tell me why you applied\./);
  assert.match(document.querySelector('[role="tab"][aria-selected="true"]').textContent, /Transcript/);

  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  assert.ok(document.querySelector('[role="dialog"]'));
  await press("m");
  assert.ok(buttonLabelled(/^Mute microphone/), "M does nothing while the dialog is open");
  assert.equal(buttonNamed(/submit|answer/i), undefined, "the call has no answer or submit buttons");
});

test("captions do not repeat the question on screen, and hide while the transcript is open", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  await act(async () => socket.fire("anvi:caption", { role: "anvi", text: "Okay. Why this role?", final: true }));
  const strip = () => document.querySelector('[aria-label="Live captions"]');
  assert.match(strip().textContent, /Okay\./, "the preamble is kept");
  assert.doesNotMatch(strip().textContent, /Why this role\?/, "the question shown in the panel is not repeated");
  assert.match(strip().textContent, /the current prompt, shown in the panel/);
  await click(buttonNamed(/^Transcript$/));
  assert.equal(strip(), null, "the transcript already shows every line");
  assert.match(document.querySelector('[role="log"]').textContent, /Okay\. Why this role\?/);
  await click(buttonNamed(/^Question$/));
  assert.ok(strip());
});

test("while reconnecting the banner explains it once, without a second status pill", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "The connection to ANVI dropped. Reconnecting…", retryable: true, reconnecting: true }));
  assert.equal(document.querySelector('[role="status"][aria-live="polite"]'), null, "no footer status pill while the banner shows");
  assert.match(document.querySelector("header").textContent, /Reconnecting/);
});

test("the end dialog keeps focus inside and returns it to the End button", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  const opener = document.querySelector('button[aria-label="End and leave the interview"]');
  opener.focus();
  await click(opener);
  const dialog = document.querySelector('[role="dialog"]');
  const buttons = [...dialog.querySelectorAll("button")];
  buttons.at(-1).focus();
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
  assert.equal(document.activeElement, buttons[0], "Tab wraps to the first control");
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
});

test("a finished attempt opens straight to its answers", async () => {
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, status: "abandoned", items: [{ n: 1, questionText: "Why this role?", answerText: "I enjoy UI work.", status: "answered" }] });
  await render();
  assert.match(document.body.textContent, /Interview ended/);
  assert.match(document.body.textContent, /I enjoy UI work\./);
  assert.equal(buttonNamed(/Join now/), undefined);
});

test("a report being prepared is polled every 4 s until it is ready, then the tabs appear", async () => {
  let polls = 0;
  const preparing = { ...activeAttempt, status: "completed", report: "preparing", items: [{ n: 1, questionText: "Why this role?", answerText: "I enjoy UI work.", status: "answered" }] };
  const ready = {
    ...preparing, status: "ready", report: "ready",
    overall: { score: 7.5, max: 10, percent: 75, band: "Good", partial: false, answered: 1, total: 1, strengths: ["Clear motivation"], improvements: [] },
    bySection: [], byCompetency: [], byRubric: [], actionItems: ["Name one product you admire and why."],
    items: [{ ...preparing.items[0], marks: 7.5, maxMarks: 10, percentCorrect: 75, feedback: "You sounded motivated.", expectedKeyPoints: [], matched: [], partial: [], missed: [] }],
  };
  api.getStudentAIAttempt = async () => { polls += 1; return polls >= 3 ? ready : preparing; };
  await render();
  assert.match(document.body.textContent, /ANVI is preparing your report…/);
  assert.equal(polls, 1);
  await tick(4100);
  assert.equal(polls, 2, "one poll after 4 s");
  assert.match(document.body.textContent, /ANVI is preparing your report…/);
  await tick(4100);
  assert.equal(polls, 3);
  assert.ok(document.querySelector('[role="tablist"]'), "the report replaces the waiting screen");
  assert.match(document.body.textContent, /7\.5/);
  assert.match(document.body.textContent, /AI-generated — may contain mistakes/);
  await tick(4100);
  assert.equal(polls, 3, "polling stops once the report is ready");
});

test("an assigned attempt's lobby names the institution, the mode and the IST deadline", async () => {
  const hardDeadline = "2026-10-22T10:00:00Z";
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, assignmentId: "as-1", mode: "mock", hardDeadline: new Date(Date.now() + 30 * 60000).toISOString() });
  await render();
  const context = document.querySelector('[data-testid="anvi-assigned-context"]');
  assert.ok(context);
  assert.match(document.body.textContent, /Scheduled interview with ANVI/);
  assert.match(context.textContent, /Your institution scheduled this interview\./);
  assert.match(context.textContent, /Mock interview/);
  assert.match(context.textContent, /Ends by .+ IST/);
  await act(async () => root.unmount());
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, assignmentId: "as-1", mode: "mock", hardDeadline });
  root = null;
  await render();
  assert.match(document.querySelector('[data-testid="anvi-assigned-context"]').textContent, /Ends by 22 Oct 2026, 3:30\s?pm IST/i);
  assert.doesNotMatch(document.body.textContent, /or start again/, "an assigned attempt cannot simply be restarted");
});

test("a practice attempt has no institution context", async () => {
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  assert.equal(document.querySelector('[data-testid="anvi-assigned-context"]'), null);
  assert.match(document.body.textContent, /Practice interview with ANVI/);
});

test("the live room header marks a scheduled attempt", async () => {
  const socket = await startRoom({ attempt: { ...activeAttempt, assignmentId: "as-1", mode: "mock" } });
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  assert.match(document.querySelector("header").textContent, /Scheduled · Mock/);
});

test("a withheld report on an assigned attempt says the institution releases it, without polling", async () => {
  let polls = 0;
  api.getStudentAIAttempt = async () => { polls += 1; return { ...activeAttempt, assignmentId: "as-1", status: "completed", report: "withheld", items: [{ n: 1, questionText: "Why this role?", answerText: "I enjoy UI work.", status: "answered" }] }; };
  await render();
  assert.match(document.body.textContent, /Report will be released by your institution\./);
  assert.match(document.body.textContent, /I enjoy UI work\./);
  await tick(4100);
  assert.equal(polls, 1);
});

test("a scored but unreleased assigned report (ready + preparing) is not polled and says who releases it", async () => {
  let polls = 0;
  api.getStudentAIAttempt = async () => { polls += 1; return { ...activeAttempt, assignmentId: "as-1", mode: "mock", status: "ready", report: "preparing", items: [{ n: 1, questionText: "Why this role?", answerText: "Because.", status: "answered" }] }; };
  await render();
  assert.match(document.body.textContent, /Report will be released by your institution\./);
  assert.doesNotMatch(document.body.textContent, /ANVI is preparing your report/);
  await tick(4100);
  assert.equal(polls, 1);
});

test("a failed evaluation says the report could not be generated and keeps the answers", async () => {
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, status: "failed", report: "failed", items: [{ n: 1, questionText: "Why this role?", answerText: "I enjoy UI work.", status: "answered" }] });
  await render();
  assert.match(document.body.textContent, /Report could not be generated/);
  assert.match(document.body.textContent, /I enjoy UI work\./);
});

// ---- Ending, and the pre-start handoff ----

test("the End dialog confirms ending without revealing how many questions remain", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: { ...liveState, questionNumber: 2, totalQuestions: 4 } }));
  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.querySelector("h2").textContent, /^End interview now\?$/);
  const body = "ANVI may still have more to discuss. Your answers so far will be saved for your report.";
  assert.equal(document.getElementById("anvi-end-body").textContent, body);
  assert.doesNotMatch(dialog.textContent, /unanswered/, "no question count");
  assert.equal(document.activeElement.textContent, "Keep going", "focus starts on the safe choice");
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(document.querySelector('[role="dialog"]'), null, "Escape closes it");
  await act(async () => socket.fire("anvi:state", { ...liveState, questionNumber: 4, totalQuestions: 4 }));
  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  assert.equal(document.getElementById("anvi-end-body").textContent, body);
});

test("when ANVI points to the End button, the top-right End interview control is highlighted and opens the dialog", async () => {
  const socket = await startRoom();
  await act(async () => joins(socket)[0].ack(null, { ok: true, state: liveState }));
  const end = document.querySelector('header button[aria-label="End interview"]');
  assert.ok(end, "an End interview button sits at the top right, where ANVI says it is");
  assert.equal(end.dataset.endHint, undefined);
  await act(async () => socket.fire("anvi:caption", { role: "anvi", text: "If you'd like to finish, please use the End interview button at the top right.", final: true }));
  assert.equal(end.dataset.endHint, "on");
  assert.match(document.querySelector("header").textContent, /Ready to finish\? Click End interview here\./);
  await click(end);
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(end.dataset.endHint, undefined, "the highlight clears once the student acts on it");
});

test("a room opened from the pre-start lobby joins at once with the handed-over microphone and audio", async () => {
  const handoff = await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js");
  const socket = fakeSocket();
  socketService.connect = () => socket;
  let asked = 0;
  navigator.mediaDevices = { getUserMedia: async () => { asked += 1; return fakeStream(); } };
  FakeAudioContext.instances = [];
  const contexts = { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) };
  const stream = fakeStream();
  handoff.setJoinHandoff("attempt-one", { stream, contexts });
  api.getStudentAIAttempt = async () => activeAttempt;
  await render();
  await tick();
  assert.equal(buttonNamed(/Join now/), undefined, "no second lobby");
  assert.equal(joins(socket).length, 1, "joined without another click");
  assert.equal(FakeAudioContext.instances.length, 2, "the lobby's audio contexts are reused");
  assert.equal(asked, 0, "the tested microphone stream is reused");
  assert.equal(handoff.hasJoinHandoff("attempt-one"), false);
  await act(async () => root.unmount());
  root = null;
  assert.equal(stream.track.stopped, true, "the room owns and releases the handed-over stream");
});

test("leaving before the room took the handoff releases its media; StrictMode's remount still takes it", async () => {
  const handoff = await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js");
  const socket = fakeSocket();
  socketService.connect = () => socket;
  navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  // The attempt is still loading when the student leaves.
  const stream = fakeStream();
  const contexts = { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) };
  handoff.setJoinHandoff("attempt-one", { stream, contexts });
  api.getStudentAIAttempt = () => new Promise(() => {});
  await render();
  assert.equal(handoff.hasJoinHandoff("attempt-one"), true, "held while the attempt loads");
  await act(async () => root.unmount());
  root = null;
  await tick();
  assert.equal(handoff.hasJoinHandoff("attempt-one"), false, "released on unmount");
  assert.equal(stream.track.stopped, true);
  assert.equal(contexts.capture.state, "closed");
  assert.equal(joins(socket).length, 0);

  // StrictMode mounts, unmounts and remounts at once: the remount cancels the release and joins.
  const kept = fakeStream();
  handoff.setJoinHandoff("attempt-one", { stream: kept, contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => activeAttempt;
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(StrictMode, null, h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" })))));
  await tick();
  await tick();
  assert.equal(kept.track.stopped, false, "StrictMode's simulated unmount does not release it");
  assert.equal(handoff.hasJoinHandoff("attempt-one"), false, "taken by the room");
  assert.equal(joins(socket).length, 1);

  // A room that took its handoff never releases the next one handed over for the same attempt.
  await act(async () => root.unmount());
  root = null;
  const next = fakeStream();
  handoff.setJoinHandoff("attempt-one", { stream: next, contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  await tick();
  assert.equal(handoff.hasJoinHandoff("attempt-one"), true);
  assert.equal(next.track.stopped, false);
  handoff.releaseJoinHandoff("attempt-one");
});
