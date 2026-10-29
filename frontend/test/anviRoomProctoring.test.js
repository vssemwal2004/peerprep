import assert from "node:assert/strict";
import { before, after, afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { StrictMode, act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// The live room's theme and proctoring runtime. Rooms are opened through the pre-start handoff, so these
// tests do not depend on the lobby's markup.

let dom, server, root, createRoot, AnviRoom, api, socketService, handoff, proctoring;
const globals = ["window", "document", "navigator", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame", "AudioWorkletNode", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

class FakeAudioContext {
  constructor(options = {}) {
    this.options = options;
    this.sampleRate = options.sampleRate || 48000;
    this.state = "running";
    this.destination = {};
    this.audioWorklet = { addModule: async () => {} };
  }
  get currentTime() { return 0; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData: (array) => array.fill(0) }; }
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
  createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {}, onended: null }; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

class FakeWorkletNode {
  static last = null;
  constructor() {
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
  };
  return socket;
}

function fakeStream() {
  const track = { stopped: false, onended: null, stop() { track.stopped = true; } };
  return { active: true, track, getTracks: () => [track], getAudioTracks: () => [track] };
}

// Fullscreen and page visibility, which jsdom does not implement.
let fullscreenElement = null;
let visibility = "visible";
let fullscreenRequests = 0;
let refuseFullscreen = false;
const fire = (target, type) => act(async () => { target.dispatchEvent(new dom.window.Event(type)); });
const setFullscreen = async (on) => { fullscreenElement = on ? document.documentElement : null; await fire(document, "fullscreenchange"); };
const setHidden = async (hidden) => { visibility = hidden ? "hidden" : "visible"; await fire(document, "visibilitychange"); };

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews/room/attempt-one", pretendToBeVisual: true });
  Object.defineProperty(dom.window, "isSecureContext", { configurable: true, value: true });
  dom.window.AudioContext = FakeAudioContext;
  dom.window.AudioWorkletNode = FakeWorkletNode;
  dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  dom.window.navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  const doc = dom.window.document;
  Object.defineProperty(doc, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => visibility });
  doc.documentElement.requestFullscreen = async () => {
    fullscreenRequests += 1;
    if (refuseFullscreen) throw new Error("denied");
    fullscreenElement = doc.documentElement;
    doc.dispatchEvent(new dom.window.Event("fullscreenchange"));
  };
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
  proctoring = await server.ssrLoadModule("/src/student/anvi/room/useAnviProctoring.js");
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  fullscreenElement = null;
  visibility = "visible";
  refuseFullscreen = false;
  document.documentElement.classList.remove("dark");
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

const activeAttempt = { id: "attempt-one", status: "in_progress", title: "Frontend practice", role: "Frontend engineer", totalQuestions: 3, startedAt: new Date().toISOString(), hardDeadline: new Date(Date.now() + 20 * 60000).toISOString() };
const liveState = { phase: "asking", questionNumber: 1, totalQuestions: 3, questionText: "Why this role?", followUp: false, deadlineAt: activeAttempt.hardDeadline };
const PROCTORED = { enabled: true, fullscreen: "required", pauseOutsideFullscreen: false, tabSwitch: "warn", refresh: "record", blockRightClick: true, blockCopyPaste: true, blockShortcuts: true, warnings: 3, maxViolations: 5, onLimit: "end" };

/** Opens the live room for an attempt with `proctoring` settings and acknowledges the join. */
async function openRoom(settings, { fullscreen = true, ack = {} } = {}) {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  fullscreenElement = fullscreen ? document.documentElement : null;
  handoff.setJoinHandoff("attempt-one", { stream: fakeStream(), contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => (settings === undefined ? { ...activeAttempt } : { ...activeAttempt, proctoring: settings });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  await tick();
  const join = socket.acks.find((item) => item.event === "anvi:join");
  assert.ok(join, "the room joined from the handoff");
  await act(async () => join.ack(null, { ok: true, state: liveState, ...ack }));
  return socket;
}
const proctorEvents = (socket) => socket.acks.filter((item) => item.event === "anvi:proctor");
const proctorTypes = (socket) => proctorEvents(socket).map((item) => item.payload.type);
const room = () => document.querySelector('[data-anvi-room="live"]');
const buttonNamed = (pattern) => [...document.querySelectorAll("button")].find((button) => pattern.test(button.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const frame = () => { const pcm = new Int16Array(1600).fill(1200).buffer; FakeWorkletNode.last.port.onmessage({ data: { pcm, rms: 0.08 } }); return pcm; };
const lastAudio = (socket) => socket.emitted.filter((item) => item.event === "anvi:audio").at(-1)?.args[0];
const isSilence = (buffer) => buffer.byteLength === 3200 && new Int16Array(buffer).every((value) => value === 0);

// ---- Theme ----

test("the live room follows the app theme: light surfaces by default, dark: variants, no forced dark", async () => {
  await openRoom(undefined);
  const stage = room();
  assert.ok(stage);
  assert.doesNotMatch(stage.className, /color-scheme:dark/, "no forced dark colour scheme");
  assert.equal(stage.closest(".dark"), null, "nothing wraps the room in a dark class");
  assert.match(stage.className, /(^|\s)bg-\[#f6f5fb\]/, "light backdrop by default");
  assert.match(stage.className, /dark:bg-\[#0a0b10\]/, "dark backdrop under the dark theme");
  assert.match(stage.className, /(^|\s)text-slate-900/);
  const anvi = document.querySelector('[aria-label="ANVI, AI interviewer"]');
  assert.match(anvi.className, /bg-white\/75/);
  assert.match(anvi.className, /dark:bg-\[#141821\]/);
  assert.match(document.querySelector('[role="toolbar"]').className, /dark:/);
  assert.match(document.querySelector("#anvi-side-panel").className, /bg-white\/75/);
  assert.ok(document.querySelector(".anvi-room-backdrop"), "the gradient backdrop is drawn");
  assert.match(document.querySelector(".anvi-room-backdrop style").textContent, /prefers-reduced-motion: reduce/);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-pill"]'), null, "no Proctored pill when proctoring is off");

  // The dark theme is the app's html.dark class; the same classes switch, nothing else is needed.
  document.documentElement.classList.add("dark");
  assert.equal(room().closest(".dark"), document.documentElement);
});

test("the end dialog and completion screen are theme-aware", async () => {
  await openRoom(undefined);
  await click(document.querySelector('button[aria-label="End and leave the interview"]'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.className, /(^|\s)bg-white/);
  assert.match(dialog.className, /dark:bg-\[#1a1e27\]/);
});

// ---- Proctoring off ----

test("with proctoring off nothing is sent, shown or blocked", async () => {
  const socket = await openRoom({ enabled: false, fullscreen: "required", tabSwitch: "warn" });
  await fire(window, "blur");
  await setHidden(true);
  await setHidden(false);
  await fire(window, "focus");
  await setFullscreen(false);
  const menu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await act(async () => { document.body.dispatchEvent(menu); });
  await tick(1100);
  assert.deepEqual(proctorTypes(socket), []);
  assert.equal(menu.defaultPrevented, false);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-pill"]'), null);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-banner"]'), null);
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
});

// ---- Events ----

test("tab, window and fullscreen changes are sent once each, with a blur and a hide merged", async () => {
  const socket = await openRoom(PROCTORED);
  assert.ok(document.querySelector('[data-testid="anvi-proctor-pill"]'), "a Proctored pill sits in the header");
  assert.match(document.querySelector("header").textContent, /Proctored/);
  assert.deepEqual(proctorTypes(socket), ["fullscreen_enter"], "a join in fullscreen tells the server it can resume");
  assert.deepEqual(Object.keys(proctorEvents(socket)[0].payload).sort(), ["at", "attemptId", "resync", "type"]);
  assert.equal(proctorEvents(socket)[0].payload.resync, true, "the join report only re-states where the room stands");
  assert.equal(proctorEvents(socket)[0].payload.attemptId, "attempt-one");

  // Switching tabs fires blur, then hidden: one tab_hidden. Coming back: one tab_visible.
  await fire(window, "blur");
  await setHidden(true);
  await setHidden(true);
  await tick(1100);
  await setHidden(false);
  await fire(window, "focus");
  assert.deepEqual(proctorTypes(socket).slice(1), ["tab_hidden", "tab_visible"]);

  // Another app or window: a blur that is not followed by a hide.
  await fire(window, "blur");
  await fire(window, "blur");
  await tick(1100);
  await fire(window, "focus");
  assert.deepEqual(proctorTypes(socket).slice(3), ["window_blur", "window_focus"]);

  // Leaving fullscreen: one event, and the reminder banner.
  await setFullscreen(false);
  await setFullscreen(false);
  assert.deepEqual(proctorTypes(socket).slice(5), ["fullscreen_exit"]);
  const exit = proctorEvents(socket).at(-1);
  await act(async () => exit.ack(null, { ok: true, violations: 3, maxViolations: 5 }));
  const banner = document.querySelector('[data-testid="anvi-proctor-banner"]');
  assert.ok(banner, "a non-blocking banner explains it");
  assert.equal(banner.textContent.includes("You left fullscreen. Return to fullscreen to continue — this was recorded (Warning 3 of 3)."), true, banner.textContent);
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /3\/5/);
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null, "without the pause rule nothing blocks the call");

  await click(buttonNamed(/Return to fullscreen/));
  await tick();
  assert.equal(fullscreenElement, document.documentElement);
  assert.equal(proctorTypes(socket).at(-1), "fullscreen_enter");
  assert.equal(document.querySelector('[data-testid="anvi-proctor-banner"]'), null);
});

test("after the warnings run out the banner shows the running count", async () => {
  const socket = await openRoom({ ...PROCTORED, warnings: 1 });
  await setFullscreen(false);
  await act(async () => proctorEvents(socket).at(-1).ack(null, { ok: true, violations: 2, maxViolations: 5 }));
  assert.match(document.querySelector('[data-testid="anvi-proctor-banner"]').textContent, /this was recorded \(Violation 2 of 5\)\./);
});

test("events raised before the join is acknowledged wait for it", async () => {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  fullscreenElement = null;
  handoff.setJoinHandoff("attempt-one", { stream: fakeStream(), contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, proctoring: { ...PROCTORED, fullscreen: "off" } });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  await tick();
  await setHidden(true);
  assert.deepEqual(proctorTypes(socket), [], "not sent before the server knows this tab holds the interview");
  await act(async () => socket.acks.find((item) => item.event === "anvi:join").ack(null, { ok: true, state: liveState }));
  assert.deepEqual(proctorTypes(socket), ["tab_hidden"]);
});

// ---- Warnings ----

test("a server warning shows Warning N of W in a dismissible banner; record mode stays silent", async () => {
  const socket = await openRoom(PROCTORED);
  await act(async () => socket.fire("anvi:proctor-warning", { type: "tab_hidden", violations: 1, maxViolations: 5, message: "You switched away from the interview. This was recorded." }));
  const banner = document.querySelector('[data-testid="anvi-proctor-warning"]');
  assert.ok(banner);
  assert.match(banner.textContent, /^Warning 1 of 3\. You switched away from the interview\. This was recorded\.$/);
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /1\/5/);
  await click(document.querySelector('button[aria-label="Dismiss warning"]'));
  assert.equal(document.querySelector('[data-testid="anvi-proctor-warning"]'), null);
  await act(async () => root.unmount());
  root = null;

  const quiet = await openRoom({ ...PROCTORED, tabSwitch: "record" });
  await act(async () => quiet.fire("anvi:proctor-warning", { type: "window_blur", violations: 2, maxViolations: 5, message: "Recorded." }));
  assert.equal(document.querySelector('[data-testid="anvi-proctor-warning"]'), null, "record logs silently");
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /2\/5/, "the count still updates");
});

// ---- Pause ----

test("out of fullscreen the interview pauses: a blocking overlay, silence instead of the mic, End still available", async () => {
  const socket = await openRoom({ ...PROCTORED, pauseOutsideFullscreen: true });
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken, "the mic streams while in fullscreen");

  await setFullscreen(false);
  const overlay = document.querySelector('[data-testid="anvi-pause-overlay"]');
  assert.ok(overlay, "a blocking overlay");
  assert.equal(overlay.getAttribute("role"), "dialog");
  assert.match(overlay.textContent, /Interview paused — return to fullscreen to continue/);
  assert.match(overlay.textContent, /The timer keeps running/);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-banner"]'), null, "the overlay replaces the banner");
  assert.equal(room().dataset.proctorPaused, "on");
  frame();
  assert.ok(isSilence(lastAudio(socket)), "paused: silence is sent instead of the microphone");

  // End interview stays available from the overlay.
  await click([...overlay.querySelectorAll("button")].find((button) => /End interview/.test(button.textContent)));
  assert.ok(document.querySelector('[role="dialog"][aria-labelledby="anvi-end-title"]'));
  await click(buttonNamed(/Keep going/));

  // Return to fullscreen runs in the click.
  const before = fullscreenRequests;
  await click(buttonNamed(/Return to fullscreen/));
  await tick();
  assert.equal(fullscreenRequests, before + 1);
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
  const resumed = frame();
  assert.equal(lastAudio(socket), resumed, "the mic streams again");
  assert.deepEqual(proctorTypes(socket).slice(-2), ["fullscreen_exit", "fullscreen_enter"]);

  // A hidden tab pauses too, even in fullscreen.
  await setHidden(true);
  assert.ok(document.querySelector('[data-testid="anvi-pause-overlay"]'));
  await setHidden(false);
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
});

test("a refused fullscreen request explains how to enter it and keeps the overlay", async () => {
  await openRoom({ ...PROCTORED, pauseOutsideFullscreen: true });
  await setFullscreen(false);
  refuseFullscreen = true;
  await click(buttonNamed(/Return to fullscreen/));
  await tick();
  assert.match(document.querySelector('[data-testid="anvi-pause-overlay"]').textContent, /blocked fullscreen\. Press F11/);
});

test("anvi:paused from the server silences the microphone until anvi:resumed", async () => {
  const socket = await openRoom({ ...PROCTORED, pauseOutsideFullscreen: true });
  await act(async () => socket.fire("anvi:paused", { reason: "fullscreen_exit" }));
  frame();
  assert.ok(isSilence(lastAudio(socket)));
  await act(async () => socket.fire("anvi:resumed"));
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken);
});

// ---- Blocking ----

test("right click, copy/paste and shortcuts are blocked and logged once per throttle window", async () => {
  const socket = await openRoom(PROCTORED);
  const dispatch = (event) => act(async () => { document.body.dispatchEvent(event); return event; });
  const menu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await dispatch(menu);
  await dispatch(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.equal(menu.defaultPrevented, true);
  const copy = new dom.window.Event("copy", { bubbles: true, cancelable: true });
  await dispatch(copy);
  assert.equal(copy.defaultPrevented, true);
  const paste = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  await dispatch(paste);
  assert.equal(paste.defaultPrevented, true);
  const select = new dom.window.Event("selectstart", { bubbles: true, cancelable: true });
  await dispatch(select);
  assert.equal(select.defaultPrevented, true);
  const ctrlC = new dom.window.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
  await dispatch(ctrlC);
  assert.equal(ctrlC.defaultPrevented, true);
  const f12 = new dom.window.KeyboardEvent("keydown", { key: "F12", bubbles: true, cancelable: true });
  await dispatch(f12);
  assert.equal(f12.defaultPrevented, true);
  const plain = new dom.window.KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true });
  await dispatch(plain);
  assert.equal(document.querySelector('[aria-label="Live captions"]'), null, "plain C still toggles captions");
  assert.deepEqual(proctorTypes(socket).filter((type) => !type.startsWith("fullscreen")), ["right_click", "copy_paste", "shortcut"]);
  assert.match(room().className, /select-none/);
});

test("blocking follows each setting", async () => {
  const socket = await openRoom({ ...PROCTORED, blockRightClick: false, blockCopyPaste: false, blockShortcuts: true });
  const menu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  const copy = new dom.window.Event("copy", { bubbles: true, cancelable: true });
  await act(async () => { document.body.dispatchEvent(menu); document.body.dispatchEvent(copy); });
  assert.equal(menu.defaultPrevented, false);
  assert.equal(copy.defaultPrevented, false);
  assert.deepEqual(proctorTypes(socket).filter((type) => !type.startsWith("fullscreen")), []);
});

test("shortcut matching and settings normalisation", () => {
  const { isBlockedShortcut, proctoringSettingsOf, violationLabel } = proctoring;
  assert.equal(isBlockedShortcut({ key: "v", metaKey: true }), true);
  assert.equal(isBlockedShortcut({ key: "I", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBlockedShortcut({ key: "PrintScreen" }), true);
  assert.equal(isBlockedShortcut({ key: "m" }), false);
  assert.equal(isBlockedShortcut({ key: "Escape" }), false);
  assert.equal(proctoringSettingsOf(null).enabled, false);
  assert.equal(proctoringSettingsOf({ enabled: "yes" }).enabled, false);
  const defaults = proctoringSettingsOf({ enabled: true, fullscreen: "required" });
  assert.equal(defaults.pauseOutsideFullscreen, true);
  assert.equal(defaults.warnings, 3);
  assert.equal(defaults.onLimit, "end");
  assert.equal(proctoringSettingsOf({ settings: { enabled: true, maxViolations: 99, onLimit: "flag" } }).maxViolations, 20);
  assert.equal(proctoringSettingsOf({ enabled: true, pauseOutsideFullscreen: true }).pauseOutsideFullscreen, false, "pausing needs fullscreen");
  assert.equal(violationLabel(2, { warnings: 3, maxViolations: 5 }), "Warning 2 of 3");
  assert.equal(violationLabel(4, { warnings: 3, maxViolations: 5 }), "Violation 4 of 5");
  assert.equal(violationLabel(4, { warnings: 3, maxViolations: 5, onLimit: "flag" }), "4 violations recorded");
});

// ---- Limit ----

test("ending for the proctoring limit leaves fullscreen and the completion screen explains it", async () => {
  const socket = await openRoom(PROCTORED);
  api.getStudentAIAttempt = async () => ({
    ...activeAttempt, status: "completed", partial: true, endReason: "proctoring_limit", report: "preparing",
    proctoring: { violations: 5, counts: { fullscreen_exit: 3, tab_hidden: 2, window_blur: 0, rejoin: 0 } },
    items: [{ n: 1, questionText: "Why this role?", answerText: "I enjoy UI work.", status: "answered" }],
  });
  await act(async () => socket.fire("anvi:ended", { status: "completed", endReason: "proctoring_limit" }));
  assert.equal(fullscreenElement, null, "the student gets their screen back");
  await tick(20);
  const note = document.querySelector('[data-testid="anvi-proctor-limit-note"]');
  assert.ok(note, "the completion screen explains the early end");
  assert.match(note.textContent, /ended by proctoring/);
  assert.match(note.textContent, /after 5 recorded violations \(left fullscreen 3×, switched tab 2×\)/);
  assert.match(document.body.textContent, /I enjoy UI work\./);
  assert.deepEqual(proctorTypes(socket), ["fullscreen_enter"], "leaving fullscreen at the end is not reported");
});

// ---- Camera AI proctoring (Assessment's ProctoringManager, mocked) ----

class FakeManager {
  static instances = [];
  constructor(options) {
    this.options = options;
    this.stopped = false;
    FakeManager.instances.push(this);
  }
  getStatus() { return { running: false, camera: "unknown", face: "unknown", person: "unknown", mobile: "unknown" }; }
  async start() { this.options.onStatusChange({ running: true, camera: "ok", face: "ok", person: "ok", mobile: "ok", eye: "ok" }); }
  stop() { this.stopped = true; }
}

function fakeCamera() {
  const listeners = {};
  const track = {
    kind: "video", readyState: "live", stopped: false,
    stop() { track.stopped = true; track.readyState = "ended"; },
    addEventListener(type, fn) { listeners[type] = fn; },
    end() { track.readyState = "ended"; listeners.ended?.(); },
  };
  return { active: true, track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}

let cameraRequests = 0;
let cameraResult = null;
async function withCameraDeps() {
  const camera = await server.ssrLoadModule("/src/student/anvi/room/useAnviCameraProctoring.js");
  FakeManager.instances = [];
  cameraRequests = 0;
  cameraResult = () => fakeCamera();
  camera.cameraProctoringDeps.loadManager = async () => FakeManager;
  camera.cameraProctoringDeps.requestCameraStream = async () => { cameraRequests += 1; return cameraResult(); };
  return camera;
}
const AI = { enabled: true, detectMobile: true, detectMultiplePersons: true, detectNoFace: true, detectionIntervalMs: 500, ignoreLimit: 5, violationCooldownSec: 20 };

test("camera AI: self-view starts hidden, can be revealed, and still runs ProctoringManager", async () => {
  await withCameraDeps();
  await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const video = document.querySelector('[data-testid="anvi-camera-preview"]');
  assert.ok(video, "a camera preview in the You tile");
  const tile = video.closest('[aria-label^="You"]');
  assert.ok(tile);
  assert.match(video.className, /-scale-x-100/, "mirrored");
  assert.match(video.className, /opacity-0/, "the student's camera preview is hidden by default");
  assert.match(tile.getAttribute("aria-label"), /preview hidden/);
  assert.match(tile.textContent, /Checks on/);
  assert.equal(cameraRequests, 1, "no handed-over camera: one is requested with cameraUtils");
  assert.equal(FakeManager.instances.length, 1);
  const { options } = FakeManager.instances[0];
  assert.equal(options.videoElement, video, "detection runs on the preview");
  assert.equal(options.requireExistingStream, true);
  assert.ok(options.stream?.getVideoTracks);
  assert.equal(options.settings.enabled, true);
  assert.equal(options.settings.ignoreLimit, 5, "proctoring.ai is passed as the manager's settings");
  const showPreview = document.querySelector('button[aria-label="Show self-view"]');
  assert.ok(showPreview);
  await click(showPreview);
  assert.match(video.className, /opacity-100/);
  assert.match(tile.getAttribute("aria-label"), /preview shown/);
  const chips = document.querySelector('[data-testid="anvi-camera-chips"]');
  assert.ok(chips);
  assert.match(chips.title, /Camera checks running/);
  await act(async () => options.onStatusChange({ running: true, camera: "ok", face: "ok", person: "ok", mobile: "detected" }));
  assert.match(document.querySelector('[data-testid="anvi-camera-chips"]').title, /needs attention/);
  await click(document.querySelector('button[aria-label="Hide self-view"]'));
  assert.match(video.className, /opacity-0/);
});

test("camera AI: a confirmed violation is sent as anvi:proctor with severity and confidence, and warned about", async () => {
  await withCameraDeps();
  const socket = await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const { options } = FakeManager.instances[0];
  await act(async () => options.onViolationConfirmed({ type: "ai_mobile_detected", message: "Mobile phone detected", severity: "high", confidence: 0.91, metadata: { limitExceeded: false } }));
  const sent = proctorEvents(socket).at(-1);
  assert.equal(sent.payload.type, "ai_mobile_detected");
  assert.equal(sent.payload.severity, "high");
  assert.equal(sent.payload.confidence, 0.91);
  assert.equal(sent.payload.attemptId, "attempt-one");
  assert.equal("metadata" in sent.payload, false, "only type, time, severity and confidence leave the browser");
  await act(async () => sent.ack(null, { ok: true, violations: 1, maxViolations: 5 }));
  assert.match(document.querySelector('[data-testid="anvi-proctor-warning"]').textContent, /^Warning 1 of 3\. Mobile phone detected$/);
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /1\/5/);
});

test("camera AI: a handed-over camera stream is used instead of asking again", async (t) => {
  await withCameraDeps();
  const probe = fakeCamera();
  handoff.setJoinHandoff("probe", { stream: fakeStream(), cameraStream: probe });
  const taken = handoff.takeJoinHandoff("probe");
  if (!taken?.cameraStream && !taken?.camera) { t.skip("anviJoinHandoff does not carry the camera yet (owned by the pre-start work)"); return; }
  const camera = fakeCamera();
  const socket = fakeSocket();
  socketService.connect = () => socket;
  fullscreenElement = document.documentElement;
  handoff.setJoinHandoff("attempt-one", { stream: fakeStream(), cameraStream: camera, contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, proctoring: { ...PROCTORED, ai: AI } });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  await tick();
  assert.equal(cameraRequests, 0);
  assert.equal(FakeManager.instances[0].options.stream, camera);
});

test("camera AI: a blocked camera pauses the interview under the pause rule, with Retry camera", async () => {
  await withCameraDeps();
  cameraResult = () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  const socket = await openRoom({ ...PROCTORED, pauseOutsideFullscreen: true, ai: AI });
  await tick();
  const blocked = proctorEvents(socket).find((item) => item.payload.type === "ai_camera_blocked");
  assert.ok(blocked, "the blocked camera is reported");
  assert.equal(blocked.payload.severity, "high");
  const overlay = document.querySelector('[data-testid="anvi-pause-overlay"]');
  assert.ok(overlay);
  assert.match(overlay.textContent, /Interview paused — turn your camera back on to continue/);
  assert.match(overlay.textContent, /The timer keeps running/);
  assert.equal(buttonNamed(/Return to fullscreen/), undefined, "still in fullscreen: only the camera needs fixing");
  frame();
  assert.ok(isSilence(lastAudio(socket)), "the mic is silenced while paused");

  cameraResult = () => fakeCamera();
  await click(buttonNamed(/Retry camera/));
  await tick();
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
  assert.equal(FakeManager.instances.length, 1, "detection starts once the camera works");
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken);
});

test("camera AI: without the pause rule a lost camera is recorded once and shown in a banner", async () => {
  await withCameraDeps();
  const socket = await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const [manager] = FakeManager.instances;
  await act(async () => manager.options.stream.track.end());
  await act(async () => manager.options.stream.track.end());
  assert.equal(proctorEvents(socket).filter((item) => item.payload.type === "ai_camera_blocked").length, 1);
  assert.match(document.querySelector('[data-testid="anvi-camera-banner"]').textContent, /Your camera is unavailable/);
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
  assert.ok(buttonNamed(/Retry camera/));
});

test("camera AI: the manager and the camera stop when the interview ends and when the room unmounts", async () => {
  await withCameraDeps();
  const socket = await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const [manager] = FakeManager.instances;
  const track = manager.options.stream.track;
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, status: "completed", items: [] });
  await act(async () => socket.fire("anvi:ended", { status: "completed", endReason: "completed" }));
  assert.equal(manager.stopped, true);
  assert.equal(track.stopped, true);
  await act(async () => root.unmount());
  root = null;

  await withCameraDeps();
  await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const [second] = FakeManager.instances;
  await act(async () => root.unmount());
  root = null;
  assert.equal(second.stopped, true);
  assert.equal(second.options.stream.track.stopped, true);
});

test("camera AI off: no camera, no manager", async () => {
  await withCameraDeps();
  await openRoom({ ...PROCTORED, ai: { ...AI, enabled: false } });
  await tick();
  assert.equal(document.querySelector('[data-testid="anvi-camera-preview"]'), null);
  assert.equal(cameraRequests, 0);
  assert.equal(FakeManager.instances.length, 0);
});

// ---- Backend round: client id, join ack, re-announcing state, camera restored ----

test("every join sends this page load's clientId, kept in memory only", async () => {
  const first = await openRoom(PROCTORED);
  const id = first.acks.find((item) => item.event === "anvi:join").payload.clientId;
  assert.match(id, /^[A-Za-z0-9_-]{16,32}$/);
  // A rejoin on the same page (the upstream dropped and the client rejoins after 2 s) keeps the id.
  await act(async () => first.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "Dropped.", retryable: true }));
  await tick(2200);
  const joins = first.acks.filter((item) => item.event === "anvi:join");
  assert.equal(joins.length, 2);
  assert.equal(joins[1].payload.clientId, id);
  await act(async () => root.unmount());
  root = null;
  const second = await openRoom(PROCTORED);
  assert.equal(second.acks.find((item) => item.event === "anvi:join").payload.clientId, id, "same page, same id");
  const stored = [...Array(window.sessionStorage.length).keys()].map((i) => window.sessionStorage.getItem(window.sessionStorage.key(i)));
  assert.equal(stored.some((value) => String(value).includes(id)), false, "never written to sessionStorage");
  assert.equal(window.localStorage.length === 0 || ![...Array(window.localStorage.length).keys()].some((i) => String(window.localStorage.getItem(window.localStorage.key(i))).includes(id)), true);
});

test("the join ack's proctoring settings and count are used when the attempt has none", async () => {
  await openRoom(undefined, { ack: { proctoring: { ...PROCTORED, violations: 2 } } });
  const pill = document.querySelector('[data-testid="anvi-proctor-pill"]');
  assert.ok(pill, "proctoring comes on from the join ack");
  assert.match(pill.textContent, /2\/5/);
});

test("a page that joins while hidden reports tab_hidden once; every join re-sends fullscreen_enter", async () => {
  visibility = "hidden";
  const socket = await openRoom(PROCTORED);
  assert.deepEqual(proctorTypes(socket), ["fullscreen_enter", "tab_hidden"]);
  await setHidden(false);
  assert.equal(proctorTypes(socket).at(-1), "tab_visible");
  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "Dropped.", retryable: true }));
  await tick(2200);
  await act(async () => socket.acks.filter((item) => item.event === "anvi:join")[1].ack(null, { ok: true, state: liveState }));
  assert.deepEqual(proctorTypes(socket), ["fullscreen_enter", "tab_hidden", "tab_visible", "fullscreen_enter"], "the server's pause state is per process: the rejoin says where this tab stands");
});

test("the server's Warning N of W numbering is shown", async () => {
  const socket = await openRoom(PROCTORED);
  await act(async () => socket.fire("anvi:proctor-warning", { type: "tab_hidden", violations: 2, maxViolations: 5, message: "You switched tabs.", warning: 2, warnings: 4 }));
  assert.match(document.querySelector('[data-testid="anvi-proctor-warning"]').textContent, /^Warning 2 of 4\. You switched tabs\.$/);
  await setFullscreen(false);
  await act(async () => socket.fire("anvi:proctor-warning", { type: "fullscreen_exit", violations: 3, maxViolations: 5, message: "You left fullscreen.", warning: 3, warnings: 4 }));
  assert.match(document.querySelector('[data-testid="anvi-proctor-banner"]').textContent, /this was recorded \(Warning 3 of 4\)\./);
});

test("camera AI: ai_camera_restored is sent once the camera comes back after ai_camera_blocked", async () => {
  await withCameraDeps();
  cameraResult = () => { throw new Error("denied"); };
  const socket = await openRoom({ ...PROCTORED, pauseOutsideFullscreen: true, ai: AI });
  await tick();
  await click(buttonNamed(/Retry camera/));
  await tick();
  const losses = () => proctorEvents(socket).filter((item) => item.payload.type === "ai_camera_blocked" && !item.payload.resync);
  assert.equal(losses().length, 1, "a failed retry is the same loss");
  assert.equal(proctorTypes(socket).includes("ai_camera_restored"), false);
  cameraResult = () => fakeCamera();
  await click(buttonNamed(/Retry camera/));
  await tick();
  const types = proctorTypes(socket);
  assert.equal(types.at(-1), "ai_camera_restored");
  assert.ok(types.indexOf("ai_camera_blocked") < types.indexOf("ai_camera_restored"));
  assert.equal(types.filter((type) => type === "ai_camera_restored").length, 1);
});

test("a limit end with questions left (status abandoned) is explained on the completion screen", async () => {
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, status: "abandoned", partial: true, endReason: "proctoring_limit", proctoring: { violations: 5, counts: { tab_hidden: 5 } }, items: [] });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  assert.match(document.body.textContent, /Interview ended/);
  assert.match(document.querySelector('[data-testid="anvi-proctor-limit-note"]').textContent, /after 5 recorded violations \(switched tab 5×\)/);
});

test("an attempt ended normally has no proctoring note", async () => {
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, status: "abandoned", endReason: "ended_by_student", items: [] });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  assert.equal(document.querySelector('[data-testid="anvi-proctor-limit-note"]'), null);
});

// ---- Review fixes: settings source, pause resync, camera pause, takeover, phone sheet ----

// What GET /student/ai-interviews/attempts/:id returns for a running attempt (studentProctoringView(undefined)).
const RUNNING_VIEW = { enabled: false, counts: { fullscreen_exit: 0, tab_hidden: 0, window_blur: 0, rejoin: 0 }, violations: 0, endedForViolations: false };

/** Mounts the room from the handoff without acknowledging the join; returns the socket and the join. */
async function mountRoom(attemptProctoring, { fullscreen = true, cameraStream = null } = {}) {
  const socket = fakeSocket();
  socketService.connect = () => socket;
  fullscreenElement = fullscreen ? document.documentElement : null;
  handoff.setJoinHandoff("attempt-one", { stream: fakeStream(), cameraStream, contexts: { capture: new FakeAudioContext(), playback: new FakeAudioContext({ sampleRate: 24000 }) } });
  api.getStudentAIAttempt = async () => ({ ...activeAttempt, proctoring: attemptProctoring });
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(AnviRoom, { attemptId: "attempt-one" }))));
  await tick();
  await tick();
  const join = socket.acks.find((item) => item.event === "anvi:join");
  assert.ok(join, "the room joined from the handoff");
  return { socket, join };
}
const dropUpstream = async (socket) => {
  await act(async () => socket.fire("anvi:error", { code: "LIVE_DISCONNECTED", message: "Dropped.", retryable: true }));
  await tick(2200);
  const rejoin = socket.acks.filter((item) => item.event === "anvi:join").at(-1);
  await act(async () => rejoin.ack(null, { ok: true, state: liveState }));
};
const PAUSING = { ...PROCTORED, pauseOutsideFullscreen: true };

test("a running attempt's counts-only view never hides the join ack's settings (real backend shape)", async () => {
  const socket = await openRoom(RUNNING_VIEW, { ack: { proctoring: { ...PAUSING, violations: 1 } } });
  const pill = document.querySelector('[data-testid="anvi-proctor-pill"]');
  assert.ok(pill, "proctoring is on from the join ack");
  assert.match(pill.textContent, /1\/5/);
  assert.deepEqual(proctorTypes(socket), ["fullscreen_enter"]);
  const menu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await act(async () => { document.body.dispatchEvent(menu); });
  assert.equal(menu.defaultPrevented, true, "blocking is on");
  await setFullscreen(false);
  assert.ok(proctorTypes(socket).includes("fullscreen_exit"));
  assert.ok(document.querySelector('[data-testid="anvi-pause-overlay"]'), "the pause rule applies");
  await act(async () => root.unmount());
  root = null;

  // Without settings in the ack (proctoring off), the counts-only view keeps it off.
  const quiet = await openRoom(RUNNING_VIEW);
  await setFullscreen(false);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-pill"]'), null);
  assert.deepEqual(proctorTypes(quiet), []);
  assert.equal(proctoring.hasProctoringSettings(RUNNING_VIEW), false);
  assert.equal(proctoring.hasProctoringSettings({ settings: PROCTORED, counts: {} }), true);
  assert.equal(proctoring.hasProctoringSettings(PROCTORED), true);
});

test("a rejoin clears the server pause: an anvi:paused from the old session no longer silences the microphone", async () => {
  const socket = await openRoom(PAUSING);
  await act(async () => socket.fire("anvi:paused", { reason: "tab_hidden" }));
  frame();
  assert.ok(isSilence(lastAudio(socket)));
  await dropUpstream(socket);
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken, "the new server session is unpaused");

  // A takeover and "Continue here" also start a new session.
  await act(async () => socket.fire("anvi:paused", { reason: "tab_hidden" }));
  await act(async () => socket.fire("anvi:taken_over", { attemptId: "attempt-one" }));
  await click(buttonNamed(/Continue here/));
  await tick();
  await act(async () => socket.acks.filter((item) => item.event === "anvi:join").at(-1).ack(null, { ok: true, state: liveState }));
  const again = frame();
  assert.equal(lastAudio(socket), again);
});

test("an anvi:proctor ack resyncs the server pause; a server still paused after the room is back is retried and shown", async () => {
  const socket = await openRoom(PAUSING);
  const enter = proctorEvents(socket)[0];
  assert.equal(enter.payload.type, "fullscreen_enter");
  await act(async () => enter.ack(null, { ok: true, violations: 0, maxViolations: 5, paused: true }));
  frame();
  assert.ok(isSilence(lastAudio(socket)), "the ack says the server holds: silence");
  const overlay = () => document.querySelector('[data-testid="anvi-pause-overlay"]');
  assert.equal(overlay(), null, "no overlay within the grace a join report needs");

  await tick(proctoring.RESUME_RETRY_MS + 100);
  assert.ok(overlay(), "the server's hold blocks the room");
  assert.equal(overlay().dataset.reason, "server");
  assert.match(overlay().textContent, /ANVI is still paused — resuming the interview/);
  assert.match(overlay().textContent, /The timer keeps running/);
  assert.equal(buttonNamed(/Return to fullscreen/), undefined, "the room is back: nothing to fix");
  assert.match(document.querySelector('[role="status"][aria-live="polite"]').textContent, /Resuming the interview/);
  // The join's own fullscreen_enter is a resync too; the retry is the second one.
  const resent = () => proctorEvents(socket).filter((item) => item.payload.type === "fullscreen_enter" && item.payload.resync === true).slice(1);
  assert.equal(resent().length, 1, "fullscreen_enter is sent again, marked as a resync");
  assert.ok(proctorEvents(socket).some((item) => item.payload.type === "tab_visible" && item.payload.resync === true));

  // Rate limited: still held, retried later with backoff.
  await act(async () => resent()[0].ack(null, { ok: false, code: "RATE_LIMITED", violations: 0, maxViolations: 5 }));
  assert.ok(overlay());
  await tick(2 * proctoring.RESUME_RETRY_MS + 100);
  assert.equal(resent().length, 2);

  // "Resume interview" asks again at once.
  await click(buttonNamed(/Resume interview/));
  assert.equal(resent().length, 3);

  // Accepted without `paused`: the server is live again.
  await act(async () => resent()[2].ack(null, { ok: true, violations: 0, maxViolations: 5 }));
  assert.equal(overlay(), null);
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken);
});

test("every join under the pause rule re-reports out of fullscreen and a hidden tab, marked resync", async () => {
  const socket = await openRoom(PAUSING, { fullscreen: false });
  const exit = proctorEvents(socket).find((item) => item.payload.type === "fullscreen_exit");
  assert.ok(exit, "a join out of fullscreen tells the server, which holds too");
  assert.equal(exit.payload.resync, true);
  assert.equal(proctorTypes(socket).includes("fullscreen_enter"), false);
  assert.ok(document.querySelector('[data-testid="anvi-pause-overlay"]'));

  await setHidden(true);
  const before = proctorEvents(socket).length;
  await dropUpstream(socket);
  const after = proctorEvents(socket).slice(before).map((item) => [item.payload.type, item.payload.resync === true]);
  assert.deepEqual(after, [["tab_hidden", true], ["fullscreen_exit", true]], "the rejoin says where this tab stands, hold reasons first");
});

test("camera pause: a still-blocked camera is re-reported on a rejoin", async () => {
  await withCameraDeps();
  cameraResult = () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  const socket = await openRoom({ ...PAUSING, ai: AI });
  await tick();
  const blocked = (resync) => proctorEvents(socket).filter((item) => item.payload.type === "ai_camera_blocked" && (item.payload.resync === true) === resync);
  assert.equal(blocked(false).length, 1, "the loss itself is one normal event");
  // Lost before the first join: the join's own report re-states it too (every join starts held).
  const joinResyncs = blocked(true).length;
  assert.ok(joinResyncs <= 1);
  await dropUpstream(socket);
  assert.equal(blocked(false).length, 1, "a rejoin never counts it again");
  assert.equal(blocked(true).length, joinResyncs + 1, "the rejoin re-states it, marked resync");
});

test("a full proctoring queue drops blocked or camera events before a fullscreen_exit", async () => {
  await withCameraDeps();
  const { socket, join } = await mountRoom({ ...PAUSING, ai: AI });
  await tick();
  await setFullscreen(false);
  const [manager] = FakeManager.instances;
  for (let i = 0; i < 25; i += 1) manager.options.onViolationConfirmed({ type: "ai_mobile_detected", message: "Mobile phone detected", severity: "high", confidence: 0.9 });
  assert.deepEqual(proctorTypes(socket), [], "all queued until the join");
  await act(async () => join.ack(null, { ok: true, state: liveState }));
  const flushed = proctorEvents(socket).filter((item) => !item.payload.resync);
  assert.equal(flushed[0].payload.type, "fullscreen_exit", "the queued exit survives");
  assert.equal(flushed.length, 20);
});

test("camera pause rule = fullscreen required + pauseOutsideFullscreen + camera AI, as the server's pausesForCamera", () => {
  const { proctoringSettingsOf } = proctoring;
  const base = { ...PROCTORED, pauseOutsideFullscreen: true, ai: AI };
  assert.equal(proctoringSettingsOf(base).pauseForCamera, true);
  assert.equal(proctoringSettingsOf({ ...base, fullscreen: "off" }).pauseForCamera, false, "fullscreen off: no pause");
  assert.equal(proctoringSettingsOf({ ...base, pauseOutsideFullscreen: false }).pauseForCamera, false);
  assert.equal(proctoringSettingsOf({ ...base, ai: { ...AI, enabled: false } }).pauseForCamera, false);
  assert.equal(proctoringSettingsOf({ settings: { ...base, fullscreen: "off" } }).pauseForCamera, false, "a stored report reads the same");
});

test("camera AI with fullscreen off: a blocked camera is a counted violation with a Retry banner, never a pause", async () => {
  await withCameraDeps();
  cameraResult = () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  const settings = { ...PROCTORED, fullscreen: "off", pauseOutsideFullscreen: true, ai: AI };
  const socket = await openRoom(settings, { fullscreen: false });
  await tick();
  const blocked = proctorEvents(socket).filter((item) => item.payload.type === "ai_camera_blocked");
  assert.equal(blocked.length, 1, "reported once");
  assert.equal(blocked[0].payload.resync, undefined, "a normal event, which the server counts");
  await act(async () => blocked[0].ack(null, { ok: true, violations: 1, maxViolations: 5 }));
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null, "nothing blocks the call");
  const banner = document.querySelector('[data-testid="anvi-camera-banner"]');
  assert.ok(banner);
  assert.match(banner.textContent, /Your camera is unavailable\. This interview uses camera checks — this was recorded \(Warning 1 of 3\)\./);
  assert.ok(buttonNamed(/Retry camera/));
  assert.equal(room().dataset.proctorPaused, undefined);
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken, "the microphone keeps streaming");

  // A rejoin does not re-report it: without the pause rule there is no hold to re-state.
  await dropUpstream(socket);
  assert.equal(proctorTypes(socket).filter((type) => type === "ai_camera_blocked").length, 1);

  cameraResult = () => fakeCamera();
  await click(buttonNamed(/Retry camera/));
  await tick();
  assert.equal(document.querySelector('[data-testid="anvi-camera-banner"]'), null);
});

test("camera AI with fullscreen required but pauseOutsideFullscreen off: banner, not a pause", async () => {
  await withCameraDeps();
  cameraResult = () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  const socket = await openRoom({ ...PROCTORED, pauseOutsideFullscreen: false, ai: AI });
  await tick();
  assert.ok(document.querySelector('[data-testid="anvi-camera-banner"]'));
  assert.equal(document.querySelector('[data-testid="anvi-pause-overlay"]'), null);
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken);
});

test("a handed-over camera is kept until the join ack brings the settings, and released when they turn camera AI off", async () => {
  await withCameraDeps();
  const camera = fakeCamera();
  const { join } = await mountRoom(RUNNING_VIEW, { cameraStream: camera });
  assert.equal(camera.track.stopped, false, "not stopped while the settings are unknown");
  await act(async () => join.ack(null, { ok: true, state: liveState, proctoring: { ...PROCTORED, ai: AI, violations: 0 } }));
  await tick();
  assert.equal(cameraRequests, 0, "the camera is not asked for again");
  assert.equal(FakeManager.instances[0].options.stream, camera);
  assert.equal(camera.track.stopped, false);
  await act(async () => root.unmount());
  root = null;

  await withCameraDeps();
  const unused = fakeCamera();
  const second = await mountRoom(RUNNING_VIEW, { cameraStream: unused });
  await act(async () => second.join.ack(null, { ok: true, state: liveState }));
  assert.equal(unused.track.stopped, true, "proctoring off: the handed camera is released");
  assert.equal(FakeManager.instances.length, 0);
});

test("a tab another one took over releases the camera and detector; Continue here starts them again", async () => {
  await withCameraDeps();
  const socket = await openRoom({ ...PROCTORED, ai: AI });
  await tick();
  const [manager] = FakeManager.instances;
  const track = manager.options.stream.track;
  await act(async () => socket.fire("anvi:taken_over", { attemptId: "attempt-one" }));
  assert.equal(manager.stopped, true);
  assert.equal(track.stopped, true);
  assert.equal(proctorTypes(socket).includes("ai_camera_blocked"), false, "releasing the camera is not a loss");
  await click(buttonNamed(/Continue here/));
  await tick();
  assert.equal(cameraRequests, 2);
  assert.equal(FakeManager.instances.length, 2);
});

test("a numbered rejoin warning is shown, so the first visible warning is Warning 1", async () => {
  const socket = await openRoom(PROCTORED);
  await act(async () => socket.fire("anvi:proctor-warning", { type: "rejoin", violations: 1, maxViolations: 5, message: "Warning 1 of 3: Leaving and rejoining this interview is recorded.", warning: 1, warnings: 3 }));
  const banner = document.querySelector('[data-testid="anvi-proctor-warning"]');
  assert.ok(banner);
  assert.match(banner.textContent, /^Warning 1 of 3: Leaving and rejoining this interview is recorded\.$/);
});

// ---- Round 3: attempt detail settings, server holds ----

// GET /student/ai-interviews/attempts/:id for a running attempt (round 3): the full settings ride along.
const detailOf = (settings, violations = 0) => ({ enabled: settings.enabled, settings, counts: { fullscreen_exit: 0, tab_hidden: violations, window_blur: 0, rejoin: 0 }, violations, endedForViolations: false });

test("a running attempt's detail { enabled, settings, violations } decides the settings; the join ack still wins", async () => {
  assert.equal(proctoring.hasProctoringSettings(detailOf(PAUSING)), true);
  assert.deepEqual(proctoring.proctoringSettingsOf(detailOf(PAUSING)), proctoring.proctoringSettingsOf(PAUSING));
  assert.equal(proctoring.violationsOf(detailOf(PAUSING, 2)), 2);

  const socket = await openRoom(detailOf(PAUSING, 2));
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /2\/5/, "on from the detail, with its count");
  await setFullscreen(false);
  assert.ok(proctorTypes(socket).includes("fullscreen_exit"));
  assert.ok(document.querySelector('[data-testid="anvi-pause-overlay"]'), "the pause rule applies");
  await act(async () => root.unmount());
  root = null;

  await openRoom(detailOf(PAUSING), { ack: { proctoring: { ...PAUSING, maxViolations: 7, violations: 1 } } });
  assert.match(document.querySelector('[data-testid="anvi-proctor-pill"]').textContent, /1\/7/, "the join ack's settings come first");
  await act(async () => root.unmount());
  root = null;

  // An unproctored attempt's detail carries the off defaults: nothing is watched.
  const quiet = await openRoom(detailOf({ ...PROCTORED, enabled: false }));
  await setFullscreen(false);
  assert.equal(document.querySelector('[data-testid="anvi-proctor-pill"]'), null);
  assert.deepEqual(proctorTypes(quiet), []);
});

test("camera AI from the attempt detail starts the handed-over camera before the join is acknowledged", async () => {
  await withCameraDeps();
  const camera = fakeCamera();
  await mountRoom(detailOf({ ...PROCTORED, ai: AI }), { cameraStream: camera });
  await tick();
  assert.equal(FakeManager.instances.length, 1, "the settings are known from the detail");
  assert.equal(FakeManager.instances[0].options.stream, camera);
  assert.equal(cameraRequests, 0);
});

test("a join ack paused:true is released by the room's resync; a hold that stays is shown with Resume interview", async () => {
  const overlay = () => document.querySelector('[data-testid="anvi-pause-overlay"]');
  const socket = await openRoom(PAUSING, { ack: { paused: true, reason: "fullscreen_exit" } });
  frame();
  assert.ok(isSilence(lastAudio(socket)), "held from the join");
  const enter = proctorEvents(socket).find((item) => item.payload.type === "fullscreen_enter");
  assert.equal(enter.payload.resync, true);
  await act(async () => enter.ack(null, { ok: true, resync: true, violations: 0, maxViolations: 5 }));
  await tick(proctoring.SERVER_HOLD_GRACE_MS + 100);
  assert.equal(overlay(), null, "the join hold never shows once the resync releases it");
  const spoken = frame();
  assert.equal(lastAudio(socket), spoken);
  await act(async () => root.unmount());
  root = null;

  await openRoom(PAUSING, { ack: { paused: true, reason: "fullscreen_exit" } });
  assert.equal(overlay(), null, "within the grace a join report needs");
  await tick(proctoring.SERVER_HOLD_GRACE_MS + 100);
  assert.ok(overlay(), "a hold that stays blocks the room");
  assert.equal(overlay().dataset.reason, "server");
  assert.ok(buttonNamed(/Resume interview/));
  assert.equal(buttonNamed(/Return to fullscreen/), undefined, "in fullscreen: nothing to fix");
});

test("anvi:paused blocks the room with the reason it names and its action, even where the room would not pause", async () => {
  const overlay = () => document.querySelector('[data-testid="anvi-pause-overlay"]');
  // No pause rule here; the server's word still blocks the room.
  const socket = await openRoom(PROCTORED);
  await setHidden(true);
  await act(async () => socket.fire("anvi:paused", { reason: "tab_hidden" }));
  assert.equal(overlay()?.dataset.reason, "tab_hidden");
  assert.match(overlay().textContent, /Interview paused — return to this tab to continue/);
  await setHidden(false);
  await tick(proctoring.SERVER_HOLD_GRACE_MS + 100);
  assert.equal(overlay()?.dataset.reason, "server", "back on the tab: still paused, so Resume interview");
  assert.ok(buttonNamed(/Resume interview/));
  await act(async () => socket.fire("anvi:resumed", {}));
  assert.equal(overlay(), null);
  await act(async () => root.unmount());
  root = null;

  await withCameraDeps();
  cameraResult = () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); };
  const camera = await openRoom({ ...PROCTORED, fullscreen: "off", ai: AI }, { fullscreen: false });
  await tick();
  assert.ok(document.querySelector('[data-testid="anvi-camera-banner"]'), "without the pause rule: a banner");
  await act(async () => camera.fire("anvi:paused", { reason: "camera_blocked" }));
  assert.equal(overlay()?.dataset.reason, "camera_blocked");
  assert.match(overlay().textContent, /turn your camera back on to continue/);
  assert.match(overlay().querySelector("button").textContent, /Retry camera/, "the camera fix is the primary action");
  assert.equal(document.querySelector('[data-testid="anvi-camera-banner"]'), null, "the overlay replaces the banner");
});

test("phones: a pause closes the question sheet and the overlay keeps Tab inside it", async () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  try {
    await openRoom(PAUSING);
    await click(document.querySelector('button[aria-label="Open the current question"]'));
    assert.ok(document.querySelector("#anvi-side-panel"), "the sheet is open");
    await setFullscreen(false);
    const overlay = document.querySelector('[data-testid="anvi-pause-overlay"]');
    assert.ok(overlay);
    assert.equal(document.querySelector("#anvi-side-panel"), null, "nothing focusable is left outside the inert stage");
    const buttons = [...overlay.querySelectorAll("button:not([disabled])")];
    const tab = (shiftKey = false) => act(async () => { document.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true })); });
    buttons.at(-1).focus();
    await tab();
    assert.equal(document.activeElement, buttons[0], "Tab from the last button wraps to the first");
    await tab(true);
    assert.equal(document.activeElement, buttons.at(-1), "Shift+Tab from the first wraps to the last");
  } finally {
    delete window.matchMedia;
  }
});
