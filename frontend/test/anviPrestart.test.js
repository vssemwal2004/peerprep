import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// The phased pre-start flow of a new ANVI attempt: phase order and skipping, the stepper and footer,
// gating, proctoring rules, fullscreen only on Join, the camera AI step and its handoff, resume
// highlights, the rejoin quick path, and the theme.

let dom, server, root, createRoot, setupLib, model, handoff, AnviLobby;
const globals = ["window", "document", "navigator", "HTMLElement", "localStorage", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const previousFetch = globalThis.fetch;
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const OK = { ok: true, reason: "" };

const track = (kind) => {
  const listeners = [];
  const value = {
    kind, label: kind === "video" ? "Webcam" : "Mic", readyState: "live", stopped: false,
    stop() { value.stopped = true; value.readyState = "ended"; },
    addEventListener(type, listener) { if (type === "ended") listeners.push(listener); },
    // The device went away (unplugged, or taken by another app): a real track fires "ended" then.
    end() { value.readyState = "ended"; listeners.splice(0).forEach((listener) => listener()); },
  };
  return value;
};
const streamOf = (kind) => {
  const t = track(kind);
  return { active: true, track: t, getTracks: () => [t], getAudioTracks: () => (kind === "audio" ? [t] : []), getVideoTracks: () => (kind === "video" ? [t] : []) };
};
let media = { mic: "ok", camera: "ok", cameraStreams: [] };

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews", pretendToBeVisual: true });
  dom.window.navigator.mediaDevices = {
    getUserMedia: async (constraints) => {
      if (constraints?.video) {
        if (media.camera !== "ok") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        const stream = streamOf("video");
        media.cameraStreams.push(stream);
        return stream;
      }
      if (media.mic !== "ok") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      return streamOf("audio");
    },
  };
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name in values ? values[name] : dom.window[name] });
  globalThis.fetch = async () => { throw new Error("Unexpected live request in pre-start test"); };
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  setupLib = await server.ssrLoadModule("/src/student/anvi/anviStartSetup.js");
  model = await server.ssrLoadModule("/src/student/anvi/prestart/prestartModel.js");
  handoff = await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js");
  AnviLobby = (await server.ssrLoadModule("/src/student/anvi/AnviLobby.jsx")).default;
});

let fullscreenRequests = 0;
let fullscreenExits = 0;
let fullscreenMode = "allow";
let fullscreenElement = null;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  media = { mic: "ok", camera: "ok", cameraStreams: [] };
  fullscreenRequests = 0;
  fullscreenExits = 0;
  fullscreenMode = "allow";
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  document.exitFullscreen = async () => { fullscreenExits += 1; fullscreenElement = null; };
  document.documentElement.requestFullscreen = async () => {
    fullscreenRequests += 1;
    if (fullscreenMode === "refuse") throw new Error("Permissions check failed");
    fullscreenElement = document.documentElement;
  };
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
after(async () => {
  await server?.close();
  dom?.window.close();
  globalThis.fetch = previousFetch;
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

const render = async (element) => {
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, element)));
  await tick();
};
const buttonNamed = (pattern, scope = document) => [...scope.querySelectorAll("button")].find((button) => pattern.test(button.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const checkboxFor = (pattern) => [...document.querySelectorAll("label")].find((label) => pattern.test(label.textContent))?.querySelector('input[type="checkbox"]');
const flow = () => document.querySelector('[data-anvi-lobby="prestart"]');
const phaseNow = () => flow().dataset.phase;
const nextButton = () => document.querySelector("[data-next]");
const hint = () => document.getElementById("anvi-phase-hint").textContent;
const next = async () => { await click(nextButton()); await tick(); };
const joinButton = () => buttonNamed(/Join now|Starting|Finishing upload|Entering fullscreen/);
// The camera module loads on demand, so a cold run can take a few ticks.
const waitFor = async (check, label) => {
  for (let tries = 0; tries < 100; tries += 1) { if (check()) return; await tick(20); }
  assert.fail(`timed out waiting for ${label}`);
};
const railStatus = (id) => document.querySelector(`[data-rail="${id}"]`).dataset.status;

const PROCTORED = { enabled: true, fullscreen: "required", tabSwitch: "warn", refresh: "record", maxViolations: 3, warnings: 2, onLimit: "end" };
const setupOf = (extra = {}) => setupLib.startSetupOf({
  id: "int-1", title: "System design mock", role: "SDE", questionCount: 5, estimatedMinutes: 20, language: "English",
  terms: { text: "", required: false }, resumeSetup: { mode: "none" }, ...extra,
}, "practice");
const flowOf = (setup, props = {}) => h(AnviLobby, { setup, support: OK, onStart: async () => true, onClose: () => {}, ...props });

// A stand-in for the Assessment ProctoringManager: reports the face state the test sets. Like the real
// one, stop() reports an all-unknown status, and a camera it cannot attach is reported as "blocked".
const UNKNOWN = { running: false, camera: "unknown", faceModel: "unknown", objectModel: "unknown", face: "unknown", eye: "unknown", mobile: "unknown", person: "unknown", error: null };
const fakeManagers = () => {
  const made = [];
  const create = async (options) => {
    if (made.failCreate) { made.failCreate -= 1; throw new Error("Failed to fetch dynamically imported module"); }
    const manager = {
      options, stopped: false,
      async start() {
        if (made.blockStart) { made.blockStart -= 1; options.onStatusChange({ ...UNKNOWN, camera: "blocked", error: "Camera permission blocked or unavailable" }); return; }
        options.onStatusChange({ running: true, camera: "ok", faceModel: "ready", objectModel: "ready", face: made.face || "ok", eye: "ok", mobile: "ok", person: "ok" });
      },
      stop() { manager.stopped = true; options.onStatusChange({ ...UNKNOWN }); },
      report(face) { options.onStatusChange({ running: true, camera: "ok", faceModel: "ready", objectModel: "ready", face, eye: "ok", mobile: "ok", person: "ok" }); },
    };
    made.push(manager);
    return manager;
  };
  return { made, create };
};

// ---- Model ----

test("phases: proctoring appears only when it applies; review and join share the final phase", () => {
  assert.deepEqual(model.phasesOf(setupOf()), ["background", "system", "instructions"]);
  assert.deepEqual(model.phasesOf(setupOf({ proctoring: PROCTORED })), ["background", "system", "proctoring", "instructions"]);
  assert.deepEqual(model.phasesOf(setupOf({ proctoring: { ...PROCTORED, enabled: false } })), ["background", "system", "instructions"], "rules are ignored while the master switch is off");
  const nothingOn = { enabled: true, fullscreen: "off", tabSwitch: "off", refresh: "off", blockRightClick: false, blockCopyPaste: false, blockShortcuts: false };
  assert.deepEqual(model.phasesOf(setupOf({ proctoring: nothingOn })), ["background", "system", "instructions"], "nothing to explain, nothing to show");
});

test("proctoring: older lists get the addendum defaults, and every rule has plain copy", () => {
  const p = setupLib.proctoringOf({ proctoring: { enabled: true, fullscreen: "required", tabSwitch: "record" } });
  assert.equal(p.pauseOutsideFullscreen, true);
  assert.equal(p.blockRightClick && p.blockCopyPaste && p.blockShortcuts, true);
  assert.equal(p.warnings, 3);
  assert.equal(p.onLimit, "end");
  assert.equal(p.ai.enabled, false);
  assert.equal(setupLib.proctoringOf({ proctoring: { enabled: false, ai: { enabled: true } } }).ai.enabled, false, "camera AI needs proctoring on");

  const rules = model.proctoringRulesOf(setupLib.proctoringOf({ proctoring: PROCTORED }));
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));
  assert.match(byId.fullscreen.text, /pauses until you return, and the timer keeps running/);
  assert.match(byId.tabSwitch.text, /recorded, and you'll see a warning each time/);
  assert.match(byId.refresh.text, /Refreshing the page, or leaving and rejoining the interview, is recorded\./);
  assert.match(byId.blocked.text, /^Right-click, copy and paste and keyboard shortcuts are turned off/);
  assert.equal(byId.warnings.title, "You get 2 warnings");
  assert.equal(byId.limit.title, "Ends after 3 violations");
  const flagged = model.proctoringRulesOf(setupLib.proctoringOf({ proctoring: { ...PROCTORED, onLimit: "flag" } }));
  assert.match(flagged.find((rule) => rule.id === "limit").text, /flagged for review\. It carries on/);
  const ai = setupLib.proctoringOf({ proctoring: { enabled: true, ai: { enabled: true, detectLookingAway: false } } });
  assert.deepEqual(model.aiChecksOf(ai).map((check) => check.id), ["noFace", "outOfFrame", "multiplePersons", "mobile"]);
});

test("resume highlights: skills from a Skills line become chips; otherwise the sections found", async () => {
  const { resumeHighlightsOf } = await server.ssrLoadModule("/src/student/anvi/prestart/resumeHighlights.js");
  const preview = "Aarav Sharma · B.Tech CSE, Graphic Era (2023–2027) · CGPA 8.4\nProjects: Campus food-ordering app (Node.js, MongoDB)\nSkills: Java, JavaScript, React, SQL, Git";
  assert.deepEqual(resumeHighlightsOf(preview), { skills: ["Java", "JavaScript", "React", "SQL", "Git"], sections: ["Projects", "Skills"] });
  assert.deepEqual(resumeHighlightsOf("Technical Skills - Python; C++ | Docker and AWS").skills, ["Python", "C++", "Docker", "AWS"]);
  assert.deepEqual(resumeHighlightsOf("Skills: java, Java, React (hooks), React").skills, ["java", "React"], "de-duplicated, notes dropped");
  assert.equal(resumeHighlightsOf(`Skills: ${Array.from({ length: 12 }, (_, i) => `S${i}`).join(", ")}`).skills.length, 8, "capped");
  assert.deepEqual(resumeHighlightsOf("EDUCATION\nB.Tech CSE\nPROJECTS\nChat app"), { skills: [], sections: ["Education", "Projects"] });
  assert.deepEqual(resumeHighlightsOf("Built a placement portal during my internship.").sections, ["Internships", "Projects"]);
  assert.deepEqual(resumeHighlightsOf(""), { skills: [], sections: [] });
});

test("flow: one phase per screen with a horizontal stepper, a fixed Back/Next footer and English-only instructions", async () => {
  await render(flowOf(setupOf({ proctoring: PROCTORED, language: { primary: "English", choices: ["English", "Hindi"], strict: false } })));
  const steps = [...document.querySelectorAll('nav[aria-label="Setup steps"] [data-rail]')].map((step) => step.dataset.rail);
  assert.deepEqual(steps, ["background", "system", "proctoring", "instructions"]);
  assert.equal(document.querySelectorAll("main h1").length, 1, "one phase at a time");
  assert.ok(document.querySelector("footer [data-next]"), "Next sits in the footer");
  assert.match(document.querySelector("main").className, /overflow-y-auto/, "a long phase scrolls inside itself; the footer stays put");
  await next(); await next();
  await click(checkboxFor(/I understand these proctoring rules/));
  await next();
  assert.equal(phaseNow(), "instructions");
  assert.equal(document.querySelector("[data-language-note]").textContent, "The interview and your responses stay in English.");
  assert.equal(document.querySelector('[role="radiogroup"]'), null, "no language picker");
});

// ---- Navigation and gating ----

test("flow: the rail and the phone progress follow the phases; Back works and later phases can't be skipped to", async () => {
  await render(flowOf(setupOf({ proctoring: PROCTORED })));
  assert.equal(document.activeElement, document.getElementById("anvi-phase-title"));
  assert.match(document.querySelector("[data-mobile-progress]").textContent, /Step 1 of 4/);
  assert.equal(railStatus("background"), "current");
  assert.equal(document.querySelector('[data-rail="instructions"] button').disabled, true, "phases ahead can't be opened yet");
  await next();
  assert.equal(phaseNow(), "system");
  assert.equal(railStatus("background"), "done");
  assert.match(document.querySelector("[data-mobile-progress]").textContent, /Step 2 of 4/);
  await click(buttonNamed(/^Back$/));
  assert.equal(phaseNow(), "background");
  await click(document.querySelector('[data-rail="system"] button'));
  assert.equal(phaseNow(), "system", "a phase already reached opens from the rail");
});

test("flow: the System check needs a working microphone", async () => {
  media.mic = "denied";
  await render(flowOf(setupOf()));
  await next();
  assert.equal(phaseNow(), "system");
  assert.match(document.querySelector('[data-check="mic"]').textContent, /Microphone access is blocked/);
  assert.equal(nextButton().disabled, true);
  assert.equal(hint(), "Allow your microphone, then test it again.");
  media.mic = "ok";
  await click(buttonNamed(/Test again/));
  await tick();
  assert.equal(nextButton().disabled, false);
});

// A Web Audio level meter driven by hand: `level` is the microphone's sample value, `pump(ms)` advances
// the clock and runs the queued animation frames.
function fakeMeter() {
  const meter = { level: 0, clock: 1000, frames: [] };
  dom.window.AudioContext = class {
    constructor() { this.state = "running"; }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (array) => array.fill(meter.level) }; }
  };
  const raf = dom.window.requestAnimationFrame;
  const caf = dom.window.cancelAnimationFrame;
  const now = Object.getOwnPropertyDescriptor(performance, "now");
  dom.window.requestAnimationFrame = (fn) => { meter.frames.push(fn); return meter.frames.length; };
  dom.window.cancelAnimationFrame = () => {};
  performance.now = () => meter.clock;
  meter.pump = (ms, step = 50) => act(async () => {
    for (let at = 0; at < ms; at += step) {
      meter.clock += step;
      meter.frames.splice(0).forEach((fn) => fn());
    }
  });
  meter.restore = () => {
    delete dom.window.AudioContext;
    dom.window.requestAnimationFrame = raf;
    dom.window.cancelAnimationFrame = caf;
    if (now) Object.defineProperty(performance, "now", now); else delete performance.now;
  };
  return meter;
}

test("model: the read-aloud verdict needs enough voice for the sentence, then a pause", async () => {
  const { readingVerdict, READ_SENTENCES } = await server.ssrLoadModule("/src/student/anvi/prestart/useMicCheck.js");
  assert.equal(READ_SENTENCES.length, 6);
  assert.equal(readingVerdict({ words: 10, voicedMs: 0, elapsedMs: 3000, quietMs: 0 }), null, "still waiting for the student");
  assert.equal(readingVerdict({ words: 10, voicedMs: 0, elapsedMs: 8000, quietMs: 0 }), "none");
  assert.equal(readingVerdict({ words: 10, voicedMs: 2000, elapsedMs: 4000, quietMs: 600 }), null, "a short breath mid-sentence");
  assert.equal(readingVerdict({ words: 10, voicedMs: 2000, elapsedMs: 4500, quietMs: 1500 }), "pass");
  assert.equal(readingVerdict({ words: 10, voicedMs: 400, elapsedMs: 3000, quietMs: 1500 }), "short", "a cough is not the sentence");
  assert.equal(readingVerdict({ words: 10, voicedMs: 2000, elapsedMs: 15000, quietMs: 0 }), "pass", "talking on and on still ends");
  assert.equal(model.phaseBlockerOf("system", setupOf(), { support: OK, online: true, micReady: true, micVerified: false }), "Read the sentence aloud to verify your microphone.");
  assert.equal(model.phaseBlockerOf("system", setupOf(), { support: OK, online: true, micReady: true, micVerified: false, micReading: "failed" }), "ANVI couldn't hear the sentence clearly. Try again.");
  assert.equal(model.phaseBlockerOf("system", setupOf(), { support: OK, online: true, micReady: true, micSilent: true }), "Your microphone sends no sound. Unmute it or choose another one.");
});

test("flow: the System check needs a random sentence read aloud; a muted microphone is named and blocks", async () => {
  const meter = fakeMeter();
  try {
    await render(flowOf(setupOf()));
    await next();
    await tick();
    assert.equal(phaseNow(), "system");
    const sentence = document.querySelector("[data-read-sentence]").textContent;
    assert.ok(sentence.length > 20, "a sentence to read is shown");
    assert.equal(nextButton().disabled, true);
    assert.equal(hint(), "Read the sentence aloud to verify your microphone.");

    // Nothing said: the check fails and offers another sentence.
    await click(document.querySelector("[data-read-start]"));
    meter.level = 0.002;
    await meter.pump(8200);
    assert.equal(document.querySelector("[data-read-aloud]").dataset.readAloud, "failed");
    assert.equal(nextButton().disabled, true);
    await click(buttonNamed(/Try another sentence/));
    assert.notEqual(document.querySelector("[data-read-sentence]").textContent, sentence, "a different sentence");

    // Read aloud for 3 s, then a pause: verified, Next opens.
    await click(document.querySelector("[data-read-start]"));
    meter.level = 0.12;
    await meter.pump(3000);
    meter.level = 0.002;
    await meter.pump(1700);
    assert.equal(document.querySelector("[data-read-aloud]").dataset.readAloud, "passed");
    assert.equal(nextButton().disabled, false);
    await act(async () => root.unmount());

    // A microphone that sends pure silence is named, and Next stays closed.
    meter.level = 0;
    await render(flowOf(setupOf()));
    await next();
    await tick();
    await meter.pump(4500);
    assert.ok(document.querySelector("[data-mic-silent]"), "the muted microphone is explained");
    assert.equal(hint(), "Your microphone sends no sound. Unmute it or choose another one.");
    assert.equal(document.querySelector("[data-read-start]").disabled, true);
  } finally {
    meter.restore();
  }
});

test("flow: the Proctoring phase explains each rule, needs the acknowledgement and never asks for fullscreen", async () => {
  await render(flowOf(setupOf({ proctoring: PROCTORED })));
  await next();
  await next();
  assert.equal(phaseNow(), "proctoring");
  const rules = [...document.querySelectorAll("[data-rule]")].map((rule) => rule.dataset.rule);
  assert.deepEqual(rules, ["fullscreen", "tabSwitch", "refresh", "blocked", "warnings", "limit"]);
  assert.match(flow().textContent, /You'll enter it only when you press Join on the last step/);
  assert.equal(buttonNamed(/fullscreen/i), undefined, "no fullscreen test button");
  assert.equal(nextButton().disabled, true);
  assert.equal(hint(), "Confirm the proctoring rules to continue.");
  await click(checkboxFor(/I understand these proctoring rules/));
  await next();
  await click(checkboxFor(/Google Gemini/));
  assert.equal(phaseNow(), "instructions");
  assert.equal(document.querySelector("[data-fullscreen-notice]").textContent, "Joining opens fullscreen. Stay in fullscreen until you finish; leaving pauses the interview.");
  assert.equal(fullscreenRequests, 0, "fullscreen is requested only by Join");
});

const toReady = async () => {
  await next(); await next();
  await click(checkboxFor(/I understand these proctoring rules/));
  await next();
  await click(checkboxFor(/Google Gemini/));
  assert.equal(phaseNow(), "instructions");
};

test("flow: Join asks for fullscreen; a refusal explains what to do and does not start", async () => {
  const starts = [];
  fullscreenMode = "refuse";
  await render(flowOf(setupOf({ proctoring: PROCTORED }), { onStart: async (args) => { starts.push(args); return true; } }));
  await toReady();
  await click(joinButton());
  await tick();
  assert.equal(fullscreenRequests, 1);
  assert.equal(starts.length, 0);
  assert.match(document.querySelector("[data-fullscreen-refused]").textContent, /Fullscreen was blocked, so the interview didn't start\..*Allow fullscreen/);
  fullscreenMode = "allow";
  await click(joinButton());
  await tick();
  assert.equal(fullscreenRequests, 2);
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].body, { termsAccepted: false, resumeConsent: false, language: "English" });
  assert.ok(starts[0].stream, "the tested microphone is handed over");
  assert.equal(starts[0].cameraStream, null, "no camera without camera AI");
});

test("flow: without fullscreen rules Join never asks for fullscreen", async () => {
  const starts = [];
  await render(flowOf(setupOf(), { onStart: async (args) => { starts.push(args); return true; } }));
  await next(); await next();
  await click(checkboxFor(/Google Gemini/));
  await click(joinButton());
  await tick();
  assert.equal(starts.length, 1);
  assert.equal(fullscreenRequests, 0);
});

// ---- Camera AI ----

test("camera AI: the System check needs the camera and a detected face, then hands the camera to the room", async () => {
  const managers = fakeManagers();
  managers.made.face = "missing";
  const starts = [];
  const proctoring = { enabled: true, fullscreen: "off", tabSwitch: "record", refresh: "off", ai: { enabled: true } };
  await render(flowOf(setupOf({ proctoring }), { createProctoringManager: managers.create, onStart: async (args) => { starts.push(args); return true; } }));
  await next();
  await tick();
  assert.equal(phaseNow(), "system");
  assert.ok(document.querySelector("[data-camera-step] video"), "a live preview");
  assert.match(document.querySelector("[data-camera-step] video").className, /-scale-x-100/, "mirrored");
  await waitFor(() => managers.made.length > 0, "the camera manager");
  assert.equal(managers.made.length, 1);
  assert.equal(managers.made[0].options.requireExistingStream, true, "the manager runs on the stream the step asked for");
  assert.equal(managers.made[0].options.stream, media.cameraStreams[0]);
  assert.equal(document.querySelector("[data-camera-step] video").srcObject, media.cameraStreams[0], "the preview shows the stream itself");
  assert.equal(nextButton().disabled, true);
  assert.equal(hint(), "Sit facing the camera so ANVI can see your face.");
  await act(async () => managers.made[0].report("ok"));
  assert.equal(document.querySelector("[data-face-check]").textContent, "Face detected ✓");
  assert.equal(nextButton().disabled, false);
  await next();
  assert.equal(managers.made[0].stopped, true, "the detector stops once the System check is left");
  assert.equal(media.cameraStreams[0].track.stopped, false, "the camera stays on for the room");
  assert.equal(railStatus("system"), "done", "the detector's own stop does not undo the face check");
  assert.match(flow().textContent, /Camera checks run on your device; no video is recorded or uploaded\./);
  assert.ok(document.querySelector('[data-ai-check="noFace"]'));
  await click(checkboxFor(/I understand these proctoring rules/));
  await next();
  await click(checkboxFor(/Google Gemini/));
  assert.equal(joinButton().disabled, false, "the face checked on the System check still counts on Ready");
  await click(joinButton());
  await tick();
  assert.equal(starts.length, 1);
  assert.equal(starts[0].cameraStream, media.cameraStreams[0], "the tested camera goes to the room");
  await act(async () => root.unmount());
  root = null;
  assert.equal(media.cameraStreams[0].track.stopped, false, "a handed-over camera is the room's to stop");
});

test("camera AI: a blocked camera keeps Next closed with a clear reason; an unused camera is stopped on exit", async () => {
  media.camera = "denied";
  const managers = fakeManagers();
  await render(flowOf(setupOf({ proctoring: { enabled: true, ai: { enabled: true } } }), { createProctoringManager: managers.create }));
  await next();
  await waitFor(() => /Camera access is blocked/.test(document.querySelector("[data-camera-step]")?.textContent || ""), "the camera error");
  assert.match(document.querySelector("[data-camera-step]").textContent, /Camera access is blocked/);
  assert.equal(hint(), "Allow your camera, then try again.");
  media.camera = "ok";
  await click(buttonNamed(/Try again/, document.querySelector("[data-camera-step]")));
  await waitFor(() => managers.made.length > 0, "the camera manager");
  await act(async () => managers.made[0].report("ok"));
  assert.equal(nextButton().disabled, false);
  await act(async () => root.unmount());
  root = null;
  assert.equal(media.cameraStreams[0].track.stopped, true);
});

const AI_ONLY = { enabled: true, fullscreen: "off", tabSwitch: "off", refresh: "off", ai: { enabled: true } };
const toSystem = async (managers, props = {}) => {
  await render(flowOf(setupOf({ proctoring: AI_ONLY }), { createProctoringManager: managers.create, ...props }));
  await next();
  assert.equal(phaseNow(), "system");
};
const cameraText = () => document.querySelector("[data-camera-step]")?.textContent || "";
const cameraRetry = () => buttonNamed(/Try again/, document.querySelector("[data-camera-step]"));
const toReadyFromSystem = async () => {
  await next();
  await click(checkboxFor(/I understand these proctoring rules/));
  await next();
  await click(checkboxFor(/Google Gemini/));
  assert.equal(phaseNow(), "instructions");
};

test("camera AI: a refused start keeps the face check, so Join can be pressed again", async () => {
  const managers = fakeManagers();
  let accept = false;
  const starts = [];
  await toSystem(managers, { onStart: async (args) => { starts.push(args); return accept; } });
  await waitFor(() => !nextButton().disabled, "the face check");
  await toReadyFromSystem();
  await click(joinButton());
  await tick();
  assert.equal(starts.length, 1);
  assert.equal(joinButton().disabled, false, "the handover's detector stop does not block Join");
  assert.equal(railStatus("system"), "done");
  accept = true;
  await click(joinButton());
  await tick();
  assert.equal(starts.length, 2);
  assert.equal(starts[1].cameraStream, media.cameraStreams[0]);
});

test("camera AI: checks that cannot load are a camera error with Try again, which loads them again", async () => {
  const managers = fakeManagers();
  managers.made.failCreate = 1;
  await toSystem(managers);
  await waitFor(() => /camera checks could not start/.test(cameraText()), "the load error");
  assert.equal(hint(), "Allow your camera, then try again.");
  assert.ok(cameraRetry(), "a retry button");
  assert.equal(media.cameraStreams[0].track.stopped, false, "the working camera is kept");
  await click(cameraRetry());
  await waitFor(() => managers.made.length === 1, "the camera manager");
  assert.equal(media.cameraStreams.length, 1, "the same camera; no second permission prompt");
  assert.equal(managers.made[0].options.stream, media.cameraStreams[0]);
  await waitFor(() => !nextButton().disabled, "the face check");
});

test("camera AI: a camera the checks cannot attach shows Try again instead of a dead end", async () => {
  const managers = fakeManagers();
  managers.made.blockStart = 1;
  await toSystem(managers);
  await waitFor(() => Boolean(cameraRetry()), "the retry button");
  assert.match(cameraText(), /camera checks could not start/);
  assert.equal(managers.made[0].stopped, true);
  await click(cameraRetry());
  await waitFor(() => managers.made.length === 2, "a new camera manager");
  await waitFor(() => !nextButton().disabled, "the face check");
});

test("camera AI: a camera that stops on the System check can be turned on again in place", async () => {
  const managers = fakeManagers();
  await toSystem(managers);
  await waitFor(() => !nextButton().disabled, "the face check");
  await act(async () => media.cameraStreams[0].track.end());
  assert.match(cameraText(), /Your camera stopped/);
  assert.equal(nextButton().disabled, true);
  assert.equal(managers.made[0].stopped, true, "the detector on the dead camera stops");
  await click(cameraRetry());
  await waitFor(() => managers.made.length === 2, "a new camera manager");
  assert.equal(media.cameraStreams.length, 2, "a new camera stream");
  assert.equal(managers.made[1].options.stream, media.cameraStreams[1]);
  await waitFor(() => !nextButton().disabled, "the face check");
});

test("fullscreen: a refused start leaves the fullscreen Join entered; a started one keeps it", async () => {
  let accept = false;
  await render(flowOf(setupOf({ proctoring: PROCTORED }), { onStart: async () => accept }));
  await toReady();
  await click(joinButton());
  await tick();
  assert.equal(fullscreenRequests, 1);
  assert.equal(fullscreenExits, 1, "a refused start gives the fullscreen back");
  assert.equal(document.fullscreenElement, null);
  accept = true;
  await click(joinButton());
  await tick();
  assert.equal(fullscreenRequests, 2);
  await act(async () => root.unmount());
  root = null;
  await tick(5);
  assert.equal(fullscreenExits, 1, "the room keeps the fullscreen of a started interview");
});

test("fullscreen: leaving the flow while a start waits on the student exits fullscreen; Exit stays open", async () => {
  let closed = 0;
  await render(flowOf(setupOf({ proctoring: PROCTORED }), { onStart: () => new Promise(() => {}), onClose: () => { closed += 1; } }));
  await toReady();
  await click(joinButton());
  await tick();
  assert.match(joinButton().textContent, /Starting your interview/);
  const exit = buttonNamed(/Exit/);
  assert.equal(exit.disabled, false, "a start waiting on a dialog elsewhere never traps the flow");
  await click(exit);
  assert.equal(closed, 1);
  await act(async () => root.unmount());
  root = null;
  await tick(5);
  assert.equal(fullscreenExits, 1);
});

test("rejoin: a proctored attempt asks for fullscreen in the Join click, from settings or the student view", async () => {
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: true, counts: {}, violations: 0 } }), true, "the student view has no settings");
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: true, settings: { enabled: true, fullscreen: "off" } } }), false);
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: true, settings: { enabled: true, fullscreen: "required" } } }), true);
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: true, fullscreen: "off" } }), false);
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: false } }), false);
  assert.equal(setupLib.rejoinNeedsFullscreen({}), false);

  const joins = [];
  const attempt = { id: "att-1", status: "in_progress", title: "Mock", language: "English", hardDeadline: new Date(Date.now() + 600_000).toISOString(), proctoring: { enabled: true, counts: {}, violations: 1, endedForViolations: false } };
  await render(h(AnviLobby, { attempt, support: OK, onStart: (args) => joins.push(args) }));
  await click(checkboxFor(/Google Gemini/));
  await click(buttonNamed(/Join now/));
  assert.equal(fullscreenRequests, 1);
  assert.equal(joins.length, 1);
});

test("rejoin: the in-progress attempt detail ({ enabled, settings, violations }) decides fullscreen exactly", async () => {
  const runningWith = (settings) => ({ proctoring: { enabled: true, settings, violations: 2 } });
  const full = { enabled: true, fullscreen: "required", tabSwitch: "warn", refresh: "record", pauseOutsideFullscreen: true, warnings: 3, maxViolations: 5, ai: { enabled: false } };
  assert.equal(setupLib.rejoinNeedsFullscreen(runningWith(full)), true);
  assert.equal(setupLib.rejoinNeedsFullscreen(runningWith({ ...full, fullscreen: "off" })), false, "tab-switch-only proctoring never asks for fullscreen");
  assert.equal(setupLib.rejoinNeedsFullscreen(runningWith({ ...full, enabled: false })), false);
  assert.equal(setupLib.rejoinNeedsFullscreen(runningWith({ ...full, enabled: undefined })), true, "a settings copy without its own switch follows the top-level one");
  assert.equal(setupLib.rejoinNeedsFullscreen({ proctoring: { enabled: false, settings: full, violations: 0 } }), false);

  const hardDeadline = new Date(Date.now() + 600_000).toISOString();
  const joinWith = async (settings) => {
    fullscreenRequests = 0;
    const joins = [];
    await render(h(AnviLobby, { attempt: { id: "att-1", status: "in_progress", title: "Mock", language: "English", hardDeadline, ...runningWith(settings) }, support: OK, onStart: (args) => joins.push(args) }));
    await click(checkboxFor(/Google Gemini/));
    await click(buttonNamed(/Join now/));
    assert.equal(joins.length, 1);
    await act(async () => root.unmount());
    root = null;
    return fullscreenRequests;
  };
  assert.equal(await joinWith({ ...full, fullscreen: "off" }), 0, "no fullscreen prompt when the attempt does not require it");
  assert.equal(await joinWith(full), 1);
});

test("handoff: the room gets the camera stream next to the microphone and audio", () => {
  const cameraStream = streamOf("video");
  handoff.setJoinHandoff("att-cam", { stream: streamOf("audio"), contexts: null, cameraStream });
  const taken = handoff.takeJoinHandoff("att-cam");
  assert.equal(taken.cameraStream, cameraStream);
  const ended = streamOf("video");
  handoff.setJoinHandoff("att-cam2", { cameraStream: ended });
  handoff.releaseJoinHandoff("att-cam2");
  assert.equal(ended.track.stopped, true, "an untaken camera is stopped");
});

// ---- Rejoin and theme ----

test("rejoin: an attempt already running keeps the quick lobby without phases", async () => {
  const attempt = { id: "att-1", status: "in_progress", title: "System design mock", language: "English", hardDeadline: new Date(Date.now() + 600_000).toISOString(), proctoring: PROCTORED };
  await render(h(AnviLobby, { attempt, support: OK, onStart: () => {} }));
  assert.ok(document.querySelector('[data-anvi-lobby="room"]'));
  assert.equal(flow(), null);
  assert.equal(nextButton(), null);
  assert.match(document.body.textContent, /Ready to join\?/);
});

const DARK_SURFACE = /^(bg|from|via|to)-(black|zinc-(8|9)\d\d|slate-(8|9)\d\d|gray-(8|9)\d\d|neutral-(8|9)\d\d|\[#[0-2])/;
const forcedDarkClasses = (rootNode) => {
  const found = [];
  for (const node of [rootNode, ...rootNode.querySelectorAll("*")]) {
    if (node.closest("[data-camera-preview]")) continue; // the live camera image, dark by nature
    const classes = String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    if (classes.includes("dark")) found.push("dark");
    for (const name of classes) if (!name.includes(":") && DARK_SURFACE.test(name)) found.push(name);
  }
  return found;
};

test("theme: the pre-start flow and the rejoin lobby follow the app theme, with no forced dark surfaces", async () => {
  await render(flowOf(setupOf({ proctoring: { ...PROCTORED, ai: { enabled: true } }, resumeSetup: { mode: "optional", sources: ["upload"] } }), { createProctoringManager: fakeManagers().create }));
  for (let step = 0; step < 4; step += 1) {
    assert.deepEqual(forcedDarkClasses(flow()), [], `phase ${phaseNow()}`);
    assert.match(flow().className, /\bbg-slate-50\b/);
    assert.match(flow().className, /dark:bg-/);
    if (phaseNow() === "system") await act(async () => {});
    const box = phaseNow() === "proctoring" ? checkboxFor(/I understand these/) : phaseNow() === "instructions" ? checkboxFor(/Google Gemini/) : null;
    if (box) await click(box);
    if (!nextButton() || nextButton().disabled) break;
    await next();
  }
  await act(async () => root.unmount());
  const attempt = { id: "att-1", status: "in_progress", title: "Mock", language: "English", hardDeadline: new Date(Date.now() + 600_000).toISOString() };
  await render(h(AnviLobby, { attempt, support: OK, onStart: () => {} }));
  assert.deepEqual(forcedDarkClasses(document.querySelector('[data-anvi-lobby="room"]')), []);
});
