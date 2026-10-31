import assert from "node:assert/strict";
import { before, after, afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// The hybrid (turn-based) room: useAnviHybridSession behind the same LiveCall, driven through a fake
// socket. Clips arrive over anvi:clip; answers leave as anvi:seg-chunk / anvi:seg-commit.

let dom, server, root, createRoot, AnviRoom, api, socketService, handoff;
const globals = ["window", "document", "navigator", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame", "AudioWorkletNode", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

class FakeAudioContext {
  static instances = [];
  constructor(options = {}) {
    this.options = options;
    this.sampleRate = options.sampleRate || 48000;
    this.state = "running";
    this.now = 0;
    this.destination = {};
    this.sources = [];
    this.audioWorklet = { modules: [], addModule: async (url) => { this.audioWorklet.modules.push(String(url)); } };
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
  constructor(context, name) {
    this.name = name;
    this.port = { onmessage: null, postMessage() {}, close() {} };
    FakeWorkletNode.last = this;
  }
  connect() {}
  disconnect() {}
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
    events: () => [...listeners.entries()].filter(([, set]) => set.size).map(([event]) => event),
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
  return socket;
}

function fakeStream() {
  const track = { stopped: false, onended: null, stop() { track.stopped = true; } };
  return { active: true, track, getTracks: () => [track], getAudioTracks: () => [track] };
}

let fullscreenElement = null;

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews/room/attempt-one", pretendToBeVisual: true });
  Object.defineProperty(dom.window, "isSecureContext", { configurable: true, value: true });
  dom.window.AudioContext = FakeAudioContext;
  dom.window.AudioWorkletNode = FakeWorkletNode;
  dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  dom.window.navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  const doc = dom.window.document;
  Object.defineProperty(doc, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  doc.documentElement.requestFullscreen = async () => { fullscreenElement = doc.documentElement; doc.dispatchEvent(new dom.window.Event("fullscreenchange")); };
  doc.exitFullscreen = async () => { fullscreenElement = null; doc.dispatchEvent(new dom.window.Event("fullscreenchange")); };
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
  handoff = await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js");
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  fullscreenElement = null;
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

const activeAttempt = { id: "attempt-one", status: "in_progress", title: "Frontend practice", role: "Frontend engineer", language: "English", totalQuestions: 3, startedAt: new Date().toISOString(), hardDeadline: new Date(Date.now() + 20 * 60000).toISOString() };
const hybridAttempt = { ...activeAttempt, runtimeMode: "hybrid" };
const TURN1 = "A".repeat(22);
const TURN2 = "B".repeat(22);
const TURN3 = "C".repeat(22);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VAD = { onsetRms: 0.025, onsetFrames: 2, preRollMs: 300, hangoverMs: 800, speculativeEndMs: null, minSpeechMs: 400, maxSegmentSeconds: 90 };
const joinAck = (extra = {}) => ({
  ok: true, runtimeMode: "hybrid",
  state: { phase: "asking", questionNumber: 1, totalQuestions: 3, deadlineAt: activeAttempt.hardDeadline },
  hybrid: { vad: VAD, inputMode: "vad", ackAssetIds: ["ack-okay"] },
  ...extra,
});
const clip = (assetId, bytes = 4800) => ({ assetId, sampleRate: 24000, format: "pcm_s16le", part: 0, final: true, pcm: new Uint8Array(bytes).buffer });
const prompt = (turnId, text, assetIds, extra = {}) => ({ turnId, kind: "question", questionNumber: 1, totalQuestions: 3, text, assetIds, preload: [], ...extra });

const buttonNamed = (pattern) => [...document.querySelectorAll("button")].find((button) => pattern.test(button.textContent) || pattern.test(button.getAttribute("aria-label") || ""));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const joins = (socket) => socket.acks.filter((item) => item.event === "anvi:join");
const acksOf = (socket, event) => socket.acks.filter((item) => item.event === event);
const emittedOf = (socket, event) => socket.emitted.filter((item) => item.event === event).map((item) => item.args[0]);
const playback = () => FakeAudioContext.instances.find((context) => context.options.sampleRate === 24000);

let fetches = 0;
/** Opens a room from the pre-start handoff, acknowledges the join, and returns the socket. */
async function openHybrid({ attempt = hybridAttempt, ack = joinAck(), stream = fakeStream() } = {}) {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  FakeAudioContext.instances = [];
  fetches = 0;
  api.getAnviAudio = async () => { fetches += 1; throw new Error("unavailable"); };
  handoff.setJoinHandoff("attempt-one", { stream, contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => attempt;
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  await tick(5);
  await tick();
  const join = joins(socket)[0];
  assert.ok(join, "the room joined from the handoff");
  if (ack) await act(async () => join.ack(null, ack));
  return socket;
}

// Ends every clip source started on the playback context since `from` (as the audio clock would).
const endClips = async (from = 0) => {
  await act(async () => { playback().sources.slice(from).forEach((source) => source.onended?.()); });
  await tick();
};
const frame = (rms) => FakeWorkletNode.last.port.onmessage({ data: { pcm: new Int16Array(1600).fill(Math.round(rms * 32768)).buffer, rms } });
// Calibration frames, then `speech` loud frames, then the hangover (800 ms) of quiet ones.
const speak = async ({ quiet = 3, speech = 8, tail = 9 } = {}) => {
  await act(async () => {
    for (let i = 0; i < quiet; i += 1) frame(0.002);
    for (let i = 0; i < speech; i += 1) frame(0.08);
    for (let i = 0; i < tail; i += 1) frame(0.002);
  });
};
// Plays a prompt with one cached clip to its end, then waits out the echo tail.
async function askQuestion(socket, turnId, text, assetId) {
  await act(async () => { socket.fire("anvi:clip", clip(assetId)); socket.fire("anvi:prompt", prompt(turnId, text, [assetId])); });
  await tick();
  const from = playback().sources.length - 1;
  await endClips(from);
  await tick(300);
}

test("join → prompt → play → ack → segment → commit → next question", async () => {
  const socket = await openHybrid();
  const join = joins(socket)[0];
  assert.deepEqual(Object.keys(join.payload).sort(), ["attemptId", "clientId"]);
  assert.match(join.payload.clientId, /^[A-Za-z0-9_-]{16,32}$/);
  assert.ok(socket.events().includes("anvi:prompt"), "the hybrid session listens for prompts");

  // Clips first (the next question is preloaded too), then the prompt.
  await act(async () => {
    socket.fire("anvi:clip", clip("ack-okay"));
    socket.fire("anvi:clip", { ...clip("q1"), part: 0, final: false });
    socket.fire("anvi:clip", { ...clip("q1"), part: 1, final: true });
    socket.fire("anvi:clip", clip("q2"));
    socket.fire("anvi:prompt", prompt(TURN1, "Walk me through a project you built.", ["q1"], { preload: ["q2"] }));
  });
  await tick();
  assert.match(document.body.textContent, /Walk me through a project you built\./, "the question text is visible");
  assert.match(document.body.textContent, /ANVI is asking the question…/);
  const from = playback().sources.length - 1;
  assert.equal(emittedOf(socket, "anvi:prompt-played").length, 0, "not acknowledged while it plays");
  await endClips(from);
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played"), [{ turnId: TURN1, ok: true }]);
  assert.match(document.body.textContent, /Your turn — just speak, then pause 0\.8 s/, "the listening hint follows the server's hangover");
  await tick(300);

  // 3 s of speech, then the hangover: one final segment.
  await act(async () => { for (let i = 0; i < 3; i += 1) frame(0.002); for (let i = 0; i < 4; i += 1) frame(0.08); });
  assert.ok(document.querySelector('[data-testid="anvi-recording"]'), "the recording dot shows after onset");
  assert.ok(document.querySelector('[data-testid="anvi-pause-meter"]'), "the pause meter shows how close the answer is to being sent");
  assert.match(document.body.textContent, /Listening… ANVI replies after you pause/);
  await act(async () => { for (let i = 0; i < 28; i += 1) frame(0.08); for (let i = 0; i < 9; i += 1) frame(0.002); });
  const chunks = acksOf(socket, "anvi:seg-chunk");
  const [commit] = acksOf(socket, "anvi:seg-commit");
  assert.ok(commit, "the answer was committed");
  assert.equal(commit.payload.turnId, TURN1);
  assert.equal(commit.payload.final, true);
  assert.equal(commit.payload.part, 0);
  assert.match(commit.payload.segmentId, UUID);
  assert.ok(commit.payload.durationMs >= 3000);
  assert.ok(chunks.length >= 2 && chunks.every((chunk) => chunk.payload.segmentId === commit.payload.segmentId && chunk.payload.pcm.byteLength <= 32 * 1024));
  assert.equal(chunks.reduce((sum, chunk) => sum + chunk.payload.pcm.byteLength, 0), commit.payload.totalBytes);
  assert.match(document.body.textContent, /Got it\. ANVI is thinking…/);

  // The commit ack plays a cached acknowledgement clip, without any fetch.
  const beforeAck = playback().sources.length;
  await act(async () => { chunks.forEach((chunk) => chunk.ack(null, { ok: true })); commit.ack(null, { ok: true }); });
  assert.equal(playback().sources.length, beforeAck + 1, "the 'Okay.' clip plays after a 3 s answer");
  await endClips(beforeAck);

  // Next question: preloaded, so it plays from the cache.
  await act(async () => socket.fire("anvi:turn", { turnId: TURN1, state: "moving" }));
  assert.match(document.body.textContent, /Moving to the next question…/);
  await act(async () => socket.fire("anvi:prompt", prompt(TURN2, "How did you test it?", ["q2"], { questionNumber: 2 })));
  await tick();
  assert.match(document.body.textContent, /How did you test it\?/);
  await endClips(playback().sources.length - 1);
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played").at(-1), { turnId: TURN2, ok: true });
  assert.equal(fetches, 0, "every clip came over the socket");
  assert.doesNotMatch(document.body.textContent, /Question 2 of 3/);
});

test("Repeat question replays the cached clip and emits only anvi:replayed, with no fetch (AC3)", async () => {
  const socket = await openHybrid();
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  const emitted = socket.emitted.length;
  const acked = socket.acks.length;
  const sources = playback().sources.length;
  await click(buttonNamed(/^Repeat question$/));
  assert.equal(playback().sources.length, sources + 1, "the decoded buffer plays again");
  await endClips(sources);
  assert.deepEqual(socket.emitted.slice(emitted).map((item) => item.event), ["anvi:replayed"]);
  assert.deepEqual(socket.emitted.at(-1).args[0], { turnId: TURN1 });
  assert.equal(socket.acks.length, acked, "nothing else is sent");
  assert.equal(fetches, 0);

  // A spoken "repeat" the server recognised: the same clip, from the cache.
  await act(async () => socket.fire("anvi:replay", { turnId: TURN1, assetId: "q1" }));
  assert.equal(playback().sources.length, sources + 2);
  await endClips(sources + 1);
  assert.equal(emittedOf(socket, "anvi:replayed").length, 2);
  assert.equal(fetches, 0);
});

test("a mid-segment reconnect resends the uncommitted segment once; committed ones are not resent (AC5)", async () => {
  const socket = await openHybrid();
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  await speak();
  const [first] = acksOf(socket, "anvi:seg-commit");
  await act(async () => { acksOf(socket, "anvi:seg-chunk").forEach((chunk) => chunk.ack(null, { ok: true })); first.ack(null, { ok: true }); });

  // Speech resumes before the next prompt: a second part of the same turn, its commit unanswered.
  await speak({ quiet: 0, speech: 14 });
  const second = acksOf(socket, "anvi:seg-commit")[1];
  assert.ok(second);
  assert.equal(second.payload.turnId, TURN1);
  assert.equal(second.payload.part, 1);
  assert.notEqual(second.payload.segmentId, first.payload.segmentId);
  const secondChunks = acksOf(socket, "anvi:seg-chunk").filter((chunk) => chunk.payload.segmentId === second.payload.segmentId);
  assert.ok(secondChunks.length >= 2);
  await act(async () => secondChunks[0].ack(null, { ok: true }));

  socket.connected = false;
  await act(async () => socket.fire("disconnect"));
  assert.match(document.body.textContent, /Reconnecting/);
  socket.connected = true;
  await act(async () => socket.fire("connect"));
  assert.equal(joins(socket).length, 2);
  await act(async () => joins(socket)[1].ack(null, joinAck()));

  const commits = acksOf(socket, "anvi:seg-commit");
  assert.equal(commits.filter((item) => item.payload.segmentId === first.payload.segmentId).length, 1, "a committed segment is never resent");
  assert.equal(commits.filter((item) => item.payload.segmentId === second.payload.segmentId).length, 2, "the open one is resent once, with the same segmentId");
  const resentChunks = acksOf(socket, "anvi:seg-chunk").filter((chunk) => chunk.payload.segmentId === second.payload.segmentId);
  // The new holder's assembler is empty and takes chunks in index order only, so the whole segment goes
  // again from index 0, including the chunk the old holder acknowledged.
  assert.equal(resentChunks.length, secondChunks.length * 2, "every chunk of the open segment goes again");
  assert.deepEqual(resentChunks.slice(secondChunks.length).map((chunk) => chunk.payload.index), secondChunks.map((_, index) => index));
  assert.deepEqual(emittedOf(socket, "anvi:clip-have"), [{ assetIds: ["q1"] }], "the rejoin says which clips this tab holds");

  // The duplicate ack settles it; a later rejoin sends nothing more.
  await act(async () => commits.at(-1).ack(null, { ok: true, duplicate: true }));
  socket.connected = false;
  await act(async () => socket.fire("disconnect"));
  socket.connected = true;
  await act(async () => socket.fire("connect"));
  await act(async () => joins(socket)[2].ack(null, joinAck()));
  assert.equal(acksOf(socket, "anvi:seg-commit").length, commits.length);
});

test("without audio the question is shown as text and listening starts at once (AC7)", async () => {
  const socket = await openHybrid();
  await act(async () => socket.fire("anvi:prompt", prompt(TURN1, "Tell me about a bug you fixed.", [])));
  await tick();
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played"), [{ turnId: TURN1, ok: false }]);
  assert.match(document.body.textContent, /Tell me about a bug you fixed\./);
  assert.match(document.body.textContent, /Your turn — just speak, then pause 0\.8 s/);

  // A clip that never arrived and cannot be fetched: the proxy is tried once, then the text.
  await act(async () => socket.fire("anvi:prompt", prompt(TURN2, "What would you change?", ["gone"])));
  await tick();
  await tick();
  assert.equal(fetches, 1);
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played").at(-1), { turnId: TURN2, ok: false });
  assert.match(document.body.textContent, /What would you change\?/);
  // The proxy copy, when it works, plays.
  api.getAnviAudio = async () => { fetches += 1; return { pcm: new Uint8Array(4800), sampleRate: 24000 }; };
  const sources = playback().sources.length;
  await act(async () => socket.fire("anvi:prompt", prompt(TURN3, "One more?", ["proxied"])));
  await tick();
  await tick();
  assert.equal(playback().sources.length, sources + 1);
  await endClips(sources);
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played").at(-1), { turnId: TURN3, ok: true });
});

test("a Live block streams continuously, and the switch back to turns shows no banner", async () => {
  const socket = await openHybrid();
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  await act(async () => socket.fire("anvi:mode", { mode: "live" }));
  const audio = () => emittedOf(socket, "anvi:audio").length;
  frame(0.08);
  assert.equal(audio(), 1, "Live frames go out as anvi:audio");
  const sources = playback().sources.length;
  await act(async () => socket.fire("anvi:audio", new Uint8Array(4800).buffer));
  assert.equal(playback().sources.length, sources + 1, "ANVI's Live voice plays");
  await act(async () => { playback().sources.slice(sources).forEach((source) => source.onended?.()); });
  await act(async () => socket.fire("anvi:mode", { mode: "turn" }));
  await tick(300);
  frame(0.08);
  assert.equal(audio(), 1, "back in turns, nothing streams");
  assert.equal(document.querySelectorAll('[role="alert"]').length, 0, "no banner for either switch");
  assert.doesNotMatch(document.body.textContent, /\b(live mode|switch(ed|ing)? to)\b/i);
  await act(async () => socket.fire("anvi:prompt", prompt(TURN2, "Next one.", [])));
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played").at(-1), { turnId: TURN2, ok: false });
});

test("a server hold stops the prompt and the open segment; the release prompts again", async () => {
  const socket = await openHybrid();
  await act(async () => { socket.fire("anvi:clip", clip("q1")); socket.fire("anvi:prompt", prompt(TURN1, "Why this role?", ["q1"])); });
  await tick();
  const playing = playback().sources.at(-1);
  await act(async () => { socket.fire("anvi:interrupted"); socket.fire("anvi:paused", { reason: "tab_hidden" }); });
  assert.ok(Number.isFinite(playing.stoppedAt), "the clip stops");
  await endClips();
  assert.equal(emittedOf(socket, "anvi:prompt-played").length, 0, "an interrupted prompt is not acknowledged");
  await speak();
  assert.equal(acksOf(socket, "anvi:seg-chunk").length, 0, "nothing is recorded on hold");

  // Released: the server re-prompts (a rotated turnId); the client does not replay on its own first.
  const sources = playback().sources.length;
  await act(async () => socket.fire("anvi:resumed"));
  assert.equal(playback().sources.length, sources);
  await act(async () => socket.fire("anvi:prompt", prompt(TURN2, "Why this role?", ["q1"])));
  await tick();
  assert.equal(playback().sources.length, sources + 1, "replayed from the cache");
  await endClips(sources);
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played"), [{ turnId: TURN2, ok: true }]);
  assert.equal(fetches, 0);

  // Held mid-answer: the open segment is dropped, never committed.
  await tick(300);
  await act(async () => { for (let i = 0; i < 3; i += 1) frame(0.002); for (let i = 0; i < 6; i += 1) frame(0.08); });
  assert.ok(document.querySelector('[data-testid="anvi-recording"]'));
  await act(async () => socket.fire("anvi:paused", { reason: "fullscreen_exit" }));
  assert.equal(document.querySelector('[data-testid="anvi-recording"]'), null);
  await act(async () => socket.fire("anvi:resumed"));
  await act(async () => { for (let i = 0; i < 9; i += 1) frame(0.002); });
  assert.equal(acksOf(socket, "anvi:seg-commit").length, 0);
});

test("the room's own fullscreen pause stops capture and the turn loop, and replays the cut prompt from the cache", async () => {
  fullscreenElement = null;
  const proctoring = { enabled: true, fullscreen: "required", pauseOutsideFullscreen: true, tabSwitch: "warn", warnings: 3, maxViolations: 5, onLimit: "end" };
  const socket = await openHybrid({ attempt: { ...hybridAttempt, proctoring }, ack: joinAck({ proctoring }) });
  await tick();
  assert.ok(document.querySelector('[data-testid="anvi-pause-overlay"]'), "the existing pause overlay is shown");
  await act(async () => { socket.fire("anvi:clip", clip("q1")); socket.fire("anvi:prompt", prompt(TURN1, "Why this role?", ["q1"])); });
  await tick();
  const sources = playback().sources.length;
  assert.equal(sources, 0, "nothing plays while paused");

  await act(async () => { fullscreenElement = document.documentElement; document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  await tick();
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
  assert.equal(playback().sources.length, 1, "the prompt plays once the room is back");
  await endClips();
  assert.deepEqual(emittedOf(socket, "anvi:prompt-played"), [{ turnId: TURN1, ok: true }]);
  await tick(300);
  await act(async () => { for (let i = 0; i < 3; i += 1) frame(0.002); for (let i = 0; i < 6; i += 1) frame(0.08); });
  await act(async () => { fullscreenElement = null; document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  await act(async () => { for (let i = 0; i < 9; i += 1) frame(0.002); });
  assert.equal(acksOf(socket, "anvi:seg-commit").length, 0, "a pause cancels the open segment");
  assert.equal(fetches, 0);
});

test("missing audio: the browser voice says the line (never silence), then ANVI listens; acks too", async () => {
  const spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.speechSynthesis = {
    getVoices: () => [{ name: "Microsoft Ravi - English (India)", lang: "en-IN" }, { name: "Microsoft Heera - English (India)", lang: "en-IN" }],
    addEventListener() {}, cancel() {}, speak(utterance) { spoken.push(utterance); },
  };
  try {
    const socket = await openHybrid({ ack: joinAck({ hybrid: { vad: VAD, inputMode: "vad", ackAssetIds: [], acknowledgements: true } }) });
    await act(async () => socket.fire("anvi:prompt", prompt(TURN1, "Tell me about a bug you fixed.", [])));
    await tick();
    assert.equal(spoken.at(-1)?.text, "Tell me about a bug you fixed.");
    assert.equal(spoken.at(-1).voice?.name, "Microsoft Heera - English (India)", "an Indian English female voice");
    assert.equal(emittedOf(socket, "anvi:prompt-played").length, 0, "not played until the voice finishes");
    await act(async () => spoken.at(-1).onend());
    assert.deepEqual(emittedOf(socket, "anvi:prompt-played"), [{ turnId: TURN1, ok: false }]);
    await tick(300);
    // A 3 s answer with no ack clip: the browser voice says a short acknowledgement.
    await act(async () => { for (let i = 0; i < 3; i += 1) frame(0.002); for (let i = 0; i < 32; i += 1) frame(0.08); for (let i = 0; i < 9; i += 1) frame(0.002); });
    const chunks = acksOf(socket, "anvi:seg-chunk");
    const [commit] = acksOf(socket, "anvi:seg-commit");
    await act(async () => { chunks.forEach((chunk) => chunk.ack(null, { ok: true })); commit.ack(null, { ok: true }); });
    assert.ok(["Okay.", "Right.", "Thank you.", "Got it.", "Alright."].includes(spoken.at(-1)?.text), "an acknowledgement after the answer");
  } finally {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  }
});

test("a noisy room gets a hint, never a talk button; Space does nothing", async () => {
  const socket = await openHybrid();
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  await act(async () => socket.fire("anvi:turn", { turnId: TURN1, state: "listening", suggestPtt: true }));
  assert.ok(document.querySelector('[data-testid="anvi-noisy-room"]'));
  assert.equal(buttonNamed(/push-to-talk|Hold to talk|Done answering/), undefined);
  await click(document.querySelector('[data-testid="anvi-noisy-room"] button[aria-label="Dismiss"]'));
  assert.equal(document.querySelector('[data-testid="anvi-noisy-room"]'), null);
  const key = (type) => act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent(type, { key: " ", code: "Space", bubbles: true })); });
  await key("keydown");
  await act(async () => { for (let i = 0; i < 6; i += 1) frame(0.01); });
  await key("keyup");
  assert.equal(acksOf(socket, "anvi:seg-commit").length, 0, "quiet audio is not an answer, Space or not");
  assert.deepEqual(emittedOf(socket, "anvi:input-mode"), []);
});

test("the answer goes on its own after the pause, even when room noise rises after it", async () => {
  const socket = await openHybrid();
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  // Speech, then auto gain lifts the room to 0.014 RMS (over the old 0.012 release floor) for the hangover.
  await act(async () => { for (let i = 0; i < 3; i += 1) frame(0.002); for (let i = 0; i < 20; i += 1) frame(0.08); for (let i = 0; i < 9; i += 1) frame(0.014); });
  const [commit] = acksOf(socket, "anvi:seg-commit");
  assert.ok(commit, "committed without any press");
  assert.equal(commit.payload.final, true);
  assert.deepEqual(emittedOf(socket, "anvi:done"), []);
});

test("an attempt left in push-to-talk by an older room goes back to hands-free", async () => {
  const socket = await openHybrid({ ack: joinAck({ hybrid: { vad: VAD, inputMode: "ptt", ackAssetIds: [] } }) });
  assert.deepEqual(emittedOf(socket, "anvi:input-mode"), [{ mode: "vad" }]);
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  await speak();
  assert.equal(acksOf(socket, "anvi:seg-commit").length, 1);
});

test("taken over releases the microphone; ending is sticky and falls back to REST", async () => {
  const stream = fakeStream();
  const socket = await openHybrid({ stream });
  await act(async () => socket.fire("anvi:taken_over", { attemptId: "attempt-one" }));
  assert.equal(stream.track.stopped, true);
  assert.ok(buttonNamed(/Continue here/));
  await click(buttonNamed(/Continue here/));
  await tick();
  assert.equal(joins(socket).length, 2, "Continue here joins again");
  await act(async () => joins(socket)[1].ack(null, joinAck()));

  let restCalls = 0;
  api.endStudentAIAttempt = async () => { restCalls += 1; return { status: "completed" }; };
  api.getStudentAIAttempt = async () => ({ ...hybridAttempt, status: "completed", items: [] });
  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((button) => /End interview/.test(button.textContent)));
  assert.ok(acksOf(socket, "anvi:end")[0], "the end goes over the socket");
  socket.connected = false;
  await act(async () => socket.fire("disconnect"));
  socket.connected = true;
  await act(async () => socket.fire("connect"));
  await tick(20);
  assert.equal(joins(socket).length, 2, "a reconnect while ending never rejoins");
  assert.equal(restCalls, 1, "the end finishes over REST");
});

test("a join ack that says Live hands the microphone back and the Live call takes over", async () => {
  const stream = fakeStream();
  const socket = await openHybrid({ stream, ack: null });
  await act(async () => joins(socket)[0].ack(null, { ok: true, runtimeMode: "live", state: { questionText: "Why this role?", deadlineAt: activeAttempt.hardDeadline } }));
  await tick();
  assert.equal(stream.track.stopped, false, "the microphone is handed over, not stopped");
  assert.equal(joins(socket).length, 2, "the Live call joins");
  assert.ok(!socket.events().includes("anvi:prompt"), "the hybrid listeners are gone");
  assert.equal(buttonNamed(/^Repeat question$/), undefined);
  assert.ok(FakeAudioContext.instances.every((context) => context.state !== "closed"), "the audio contexts carry over");
});

test("a Live attempt renders the current room, with no hybrid controls or listeners", async () => {
  const socket = await openHybrid({ attempt: activeAttempt, ack: { ok: true, state: { phase: "asking", questionNumber: 1, totalQuestions: 3, questionText: "Why this role?", followUp: false, deadlineAt: activeAttempt.hardDeadline } } });
  assert.ok(!socket.events().includes("anvi:prompt"));
  const labels = [...document.querySelectorAll('[role="toolbar"] button')].map((button) => button.getAttribute("aria-label"));
  assert.deepEqual(labels, ["Mute microphone (M)", "Turn off live captions (C)", "Hide question panel", "End and leave the interview"]);
  assert.match(document.body.textContent, /Just speak/);
  assert.equal(document.querySelector('[data-testid="anvi-hybrid-question"]'), null);
  frame(0.08);
  assert.equal(emittedOf(socket, "anvi:audio").length, 1, "the Live call streams as before");
});

test("the hybrid room shows no price, model, token or budget data", async () => {
  const socket = await openHybrid({ ack: joinAck({ state: { questionNumber: 1, totalQuestions: 3, deadlineAt: activeAttempt.hardDeadline, budget: { mode: "economical", spentInr: 12.5 }, model: "gemini-3.5-flash-lite" } }) });
  await askQuestion(socket, TURN1, "Why this role?", "q1");
  await speak();
  const text = document.body.textContent;
  assert.doesNotMatch(text, /₹|INR|USD|\$\d|tokens?\b|budget|price|cost|gemini|flash|model\b|economical/i);
  const labels = [...document.querySelectorAll('[role="toolbar"] button')].map((button) => button.getAttribute("aria-label"));
  assert.deepEqual(labels, ["Mute microphone (M)", "Repeat question", "Turn off live captions (C)", "Hide question panel", "End and leave the interview"]);
  assert.match(text, /Pause for 0\.8 seconds/, "the tips follow the server's hangover");
});
