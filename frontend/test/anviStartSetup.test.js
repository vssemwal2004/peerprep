import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// The pre-start steps of an ANVI interview: English only, resume and terms in the phased pre-start flow,
// the resume step in booking, and the End dialog copy.

let dom, server, root, createRoot, api, setupLib, callUtils, handoff, AnviLobby, BookingSheet, InterviewBoard, EndDialog;
const globals = ["window", "document", "navigator", "HTMLElement", "localStorage", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const previousFetch = globalThis.fetch;
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const OK = { ok: true, reason: "" };
const NOW = Date.parse("2026-10-22T10:00:00Z");
const iso = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const fakeStream = () => {
  const track = { label: "Test microphone", stopped: false, stop() { track.stopped = true; } };
  return { active: true, track, getTracks: () => [track], getAudioTracks: () => [track] };
};

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews", pretendToBeVisual: true });
  dom.window.navigator.mediaDevices = { getUserMedia: async () => fakeStream() };
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name in values ? values[name] : dom.window[name] });
  globalThis.fetch = async () => { throw new Error("Unexpected live request in start setup test"); };
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  api = (await server.ssrLoadModule("/src/utils/api.js")).api;
  setupLib = await server.ssrLoadModule("/src/student/anvi/anviStartSetup.js");
  callUtils = await server.ssrLoadModule("/src/student/anvi/room/callUtils.js");
  handoff = await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js");
  AnviLobby = (await server.ssrLoadModule("/src/student/anvi/AnviLobby.jsx")).default;
  BookingSheet = (await server.ssrLoadModule("/src/student/anvi/BookingSheet.jsx")).default;
  InterviewBoard = (await server.ssrLoadModule("/src/student/anvi/list/InterviewBoard.jsx")).default;
  EndDialog = (await server.ssrLoadModule("/src/student/anvi/room/EndDialog.jsx")).default;
});

beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; });
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

function Location() { return h("output", { id: "location" }, useLocation().pathname); }
const render = async (element) => {
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/student/ai-interviews"] }, element, h(Location))));
  await tick();
};
const buttonNamed = (pattern, scope = document) => [...scope.querySelectorAll("button")].find((button) => pattern.test(button.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const checkboxFor = (pattern) => [...document.querySelectorAll("label")].find((label) => pattern.test(label.textContent))?.querySelector('input[type="checkbox"]');
const joinHint = () => document.getElementById("anvi-join-hint").textContent;
const joinButton = () => buttonNamed(/Join now|Starting|Finishing upload|Entering fullscreen/);
const apiError = (code, status = 400) => Object.assign(new Error(`server said ${code}`), { response: { status, data: { code } } });
const pickFile = async (file) => {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  await tick();
};
const fileOf = (name, type, size = 2048) => ({ name, type, size });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// The phased flow.
const flow = () => document.querySelector('[data-anvi-lobby="prestart"]');
const phaseNow = () => flow().dataset.phase;
const nextButton = () => document.querySelector("[data-next]");
const next = async () => { await click(nextButton()); await tick(); };
const toPhase = async (id) => {
  for (let guard = 0; phaseNow() !== id; guard += 1) {
    assert.ok(guard < 6, `could not reach ${id}`);
    assert.equal(nextButton().disabled, false, `Next is blocked on ${phaseNow()}: ${document.getElementById("anvi-phase-hint")?.textContent}`);
    await next();
  }
};
// Consent (and terms when asked) on the final Review & join phase, which also holds Join.
const passInstructions = async ({ terms = false } = {}) => {
  await toPhase("instructions");
  if (terms) await click(checkboxFor(/I have read and agree|I agree to the interview terms/));
  await click(checkboxFor(/Google Gemini/));
};

const practice = (extra = {}) => setupLib.startSetupOf({
  id: "int-7", title: "Backend mock", role: "SDE", questionCount: 6, estimatedMinutes: 25,
  language: "English", terms: { text: "", required: false }, resumeSetup: { mode: "none" }, ...extra,
}, "practice");
const lobby = (setup, onStart = async () => true) => h(AnviLobby, { setup, support: OK, onStart, onClose: () => {} });

// ---- Pure helpers ----

test("language, terms, resume and start body are read from the list item in one place", () => {
  assert.deepEqual(setupLib.languageSetupOf({ language: "Hinglish" }), { primary: "Hinglish", choices: ["Hinglish"], strict: true });
  assert.deepEqual(setupLib.languageSetupOf({ language: { primary: "English", choices: ["English", "Hindi"], strict: false } }), { primary: "English", choices: ["English", "Hindi"], strict: false });
  assert.deepEqual(setupLib.languageSetupOf({}), { primary: "English", choices: ["English"], strict: true });
  assert.equal(setupLib.languageLabel({ primary: "English", choices: ["English", "Hindi", "Hinglish"] }), "English, Hindi or Hinglish");
  assert.equal(setupLib.languageLabel("English"), "English");
  assert.deepEqual(setupLib.resumeSetupOf({ requiresResume: true }).sources, ["builder"], "a list from before uploads keeps the builder consent");
  assert.equal(setupLib.resumeSetupOf({ resumeSetup: { mode: "optional", sources: [] } }).sources.length, 2);
  assert.deepEqual(setupLib.startBodyOf({ termsAccepted: true, resumeConsent: true, language: "Hindi" }), { termsAccepted: true, resumeConsent: true, language: "Hindi" });
  assert.deepEqual(setupLib.startBodyOf(), { termsAccepted: false, resumeConsent: false });
  const setup = practice({ terms: { text: "Be honest.", required: true }, resumeSetup: { mode: "required", sources: ["upload"] }, proctoring: { enabled: true, tabSwitch: "warn" } });
  assert.equal(setupLib.joinBlockerOf(setup, {}), "Add your resume to join.");
  assert.equal(setupLib.joinBlockerOf(setup, { resumeUploading: true }), "Confirm the proctoring rules to join.", "an upload in flight does not block: Join waits for it");
  assert.equal(setupLib.joinBlockerOf(setup, { resumeProvided: true, proctoringAck: true }), "Accept the interview terms to join.");
  assert.equal(setupLib.joinBlockerOf(setup, { resumeProvided: true, proctoringAck: true, termsAccepted: true }), "Tick the consent box to join.");
  assert.equal(setupLib.joinBlockerOf(setup, { resumeProvided: true, proctoringAck: true, termsAccepted: true, consent: true }), "");
});

test("every resume and start error code has student-friendly copy", () => {
  const copy = (code, status) => setupLib.resumeErrorOf(apiError(code, status)).message;
  assert.match(copy("RESUME_BUILDER_EMPTY", 404), /Resume Builder resume is empty/);
  assert.equal(setupLib.resumeErrorOf(apiError("RESUME_BUILDER_EMPTY", 404)).builderLink, true);
  assert.match(copy("RESUME_DOCX_UNSUPPORTED", 415), /Save your resume as a PDF/);
  assert.match(copy("RESUME_TYPE_UNSUPPORTED", 415), /PDF or a plain-text/);
  assert.match(copy("NOT_A_RESUME", 422), /doesn't look like a resume/);
  assert.match(copy("RESUME_UNREADABLE", 422), /No text could be read/);
  assert.match(copy("RESUME_TOO_LARGE", 413), /larger than 5 MB/);
  assert.match(copy("RATE_LIMITED", 429), /Wait a few minutes/);
  assert.match(copy("AI_UNAVAILABLE", 503), /try again in a minute/);
  assert.match(copy("RESUME_SOURCE_DISABLED", 403), /Use the other option/);
  assert.match(copy("RESUME_SOURCE_REQUIRED"), /Choose your Resume Builder resume or upload a file/);
  assert.match(copy("RESUME_FILE_REQUIRED"), /Choose a PDF or \.txt file/);
  assert.match(copy("RESUME_NOT_USED", 409), /doesn't use a resume/);
  assert.match(setupLib.resumeErrorOf({ message: "x", response: { status: 0 } }).message, /did not finish/);
  assert.match(setupLib.resumeFileProblem(fileOf("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")), /Save your resume as a PDF/);
  assert.match(setupLib.resumeFileProblem(fileOf("cv.png", "image/png")), /PDF or a plain-text/);
  assert.match(setupLib.resumeFileProblem(fileOf("cv.pdf", "application/pdf", 6 * 1024 * 1024)), /larger than 5 MB/);
  assert.equal(setupLib.resumeFileProblem(fileOf("cv.txt", "text/plain")), "");
  assert.match(setupLib.startErrorOf(apiError("TERMS_REQUIRED")), /accept the interview terms/);
  assert.match(setupLib.startErrorOf(apiError("RESUME_REQUIRED")), /needs your resume/);
  assert.match(setupLib.startErrorOf(apiError("LANGUAGE_NOT_ALLOWED")), /no longer offered/);
});

test("the End warning counts the questions left and falls back when the total is unknown", () => {
  assert.equal(callUtils.unansweredOf({ phase: "intro", questionNumber: 0, totalQuestions: 5 }), 5);
  assert.equal(callUtils.unansweredOf({ phase: "asking", questionNumber: 2, totalQuestions: 5 }), 4);
  assert.equal(callUtils.unansweredOf({ phase: "closing", questionNumber: 5, totalQuestions: 5 }), 0);
  assert.equal(callUtils.unansweredOf({ phase: "asking", questionNumber: 1 }), null);
  assert.equal(callUtils.endWarningOf(4), "You still have 4 unanswered questions. They will be marked as not answered and you can't rejoin this attempt.");
  assert.equal(callUtils.endWarningOf(null), "Questions you haven't answered will be marked as not answered, and you can't rejoin this attempt.");
  assert.equal(callUtils.endWarningOf(0), "Your answers are saved. You can't rejoin this attempt.");
  assert.equal(callUtils.pointsToEndButton("If you'd like to finish, please use the End interview button at the top right."), true);
  assert.equal(callUtils.pointsToEndButton("Let's end this topic and move on."), false);
});

test("the End dialog hides the question count and keeps focus on Keep going", async () => {
  let ended = 0;
  await render(h(EndDialog, { busy: false, onCancel: () => {}, onConfirm: () => { ended += 1; } }));
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /End interview now\?/);
  assert.match(dialog.textContent, /ANVI may still have more to discuss\. Your answers so far will be saved for your report\./);
  assert.doesNotMatch(dialog.textContent, /unanswered/);
  assert.equal(document.activeElement, buttonNamed(/Keep going/, dialog));
  await click(buttonNamed(/End interview/, dialog));
  assert.equal(ended, 1);
});

// ---- The pre-start flow ----

test("flow: interviews are English only: no language picker or badge, and English is always sent", async () => {
  const starts = [];
  // Even an older interview that still offers other languages runs in English.
  await render(lobby(practice({ language: { primary: "Hindi", choices: ["Hindi", "English"], strict: true } }), async (args) => { starts.push(args); return true; }));
  await toPhase("instructions");
  assert.equal(document.querySelector('[role="radiogroup"][aria-label="Interview language"]'), null, "no language picker");
  assert.equal(document.querySelector("[data-language-badge]"), null, "no language badge");
  assert.equal(document.querySelector('[data-step="language"]'), null, "no language step");
  assert.equal(document.querySelector("[data-language-note]").textContent, "The interview and your responses stay in English.");
  assert.match(document.querySelector('[aria-label="Interview essentials"]').textContent, /English/);
  assert.doesNotMatch(flow().textContent, /Hindi/);
  await passInstructions();
  await click(joinButton());
  await tick();
  assert.deepEqual(starts[0].body, { termsAccepted: false, resumeConsent: false, language: "English" });
});

test("flow: required terms are shown in a scrollable box and gate Next until accepted", async () => {
  const starts = [];
  await render(lobby(practice({ terms: { text: "Answer on your own.\nDo not use notes.", required: true } }), async (args) => { starts.push(args); return true; }));
  await toPhase("instructions");
  const terms = document.querySelector('[role="region"][aria-label="Interview terms"]');
  assert.match(terms.textContent, /Answer on your own\.\s*Do not use notes\./);
  assert.match(terms.className, /overflow-y-auto/);
  assert.equal(terms.tabIndex, 0, "keyboard users can scroll the terms");
  await click(checkboxFor(/Google Gemini/));
  assert.equal(joinButton().disabled, true);
  assert.equal(joinHint(), "Review & join: Accept the interview terms to continue.");
  await click(checkboxFor(/I have read and agree/));
  assert.equal(joinButton().disabled, false);
  assert.match(document.querySelector('[data-step="terms"]').textContent, /Accepted/);
  await click(joinButton());
  await tick();
  assert.equal(starts[0].body.termsAccepted, true);
});

test("flow: a required resume uploads in the background while ANVI 'reads' it; Next stays open, then skill chips appear", async () => {
  const uploads = [];
  const removed = [];
  const pending = deferred();
  api.uploadAnviResume = async (target, file, { onProgress }) => { uploads.push([target, file.name]); onProgress(1); return pending.promise; };
  api.deleteAnviResume = async (target) => { removed.push(target); return { ok: true }; };
  await render(lobby(practice({ resumeSetup: { mode: "required", sources: ["upload"], questionCount: 2, provided: false } })));
  assert.equal(phaseNow(), "background");
  const step = () => document.querySelector('[data-step="resume"]');
  assert.match(step().textContent, /Required/);
  assert.match(step().textContent, /Upload a file/);
  assert.match(step().querySelector("[data-resume-dropzone]").textContent, /Drag & drop or browse.*PDF\/TXT · up to 5 MB/);
  assert.equal(step().querySelector('[data-resume-source="builder"]'), null, "the Resume Builder is not offered when the interview does not allow it");
  assert.match(step().textContent, /Only the text is used, personal details are removed, and it's deleted after your interview\./);
  assert.equal(nextButton().disabled, true);
  assert.equal(document.getElementById("anvi-phase-hint").textContent, "Add your resume to continue.");

  await pickFile(fileOf("resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  assert.match(step().querySelector('[role="alert"]').textContent, /Word files can't be read yet\. Save your resume as a PDF/);
  assert.equal(uploads.length, 0, "a Word file is refused before upload");

  await pickFile(fileOf("resume.pdf", "application/pdf"));
  assert.deepEqual(uploads, [[{ kind: "practice", id: "int-7" }, "resume.pdf"]]);
  const reading = step().querySelector('[data-resume-state="uploading"]');
  assert.match(reading.textContent, /ANVI is reading your resume…/);
  assert.match(reading.textContent, /resume\.pdf/);
  assert.match(reading.textContent, /You can continue\. This finishes in the background\./);
  assert.ok(reading.querySelector('[role="progressbar"]'), "a progress indicator");
  assert.equal(nextButton().disabled, false, "the student can move on while it uploads");
  await next();
  assert.equal(phaseNow(), "system");

  await act(async () => pending.resolve({ source: "upload", createdAt: iso(0), preview: "Frontend developer. Built a placement portal.\nSkills: React, Node.js, SQL" }));
  await tick();
  assert.equal(document.querySelector('[data-rail="background"]').dataset.status, "done");
  await click(document.querySelector('[data-rail="background"] button'));
  assert.equal(phaseNow(), "background");
  assert.equal(step().querySelector('[data-resume-chip="added"]').textContent, "Ready");
  assert.match(step().querySelector('[data-resume-state="provided"]').textContent, /resume\.pdf.*2 KB · Using your uploaded file/);
  assert.deepEqual([...step().querySelectorAll('[data-highlight="skill"]')].map((chip) => chip.textContent), ["React", "Node.js", "SQL"], "the skills ANVI read appear as chips");
  const disclosure = step().querySelector("details");
  assert.match(disclosure.querySelector("summary").textContent, /View what ANVI will use/);
  assert.match(disclosure.querySelector('[aria-label="Resume preview"]').textContent, /Built a placement portal/);

  await click(buttonNamed(/Remove/, step()));
  await tick();
  assert.deepEqual(removed, [{ kind: "practice", id: "int-7" }]);
  assert.equal(nextButton().disabled, true);
});

test("flow: Join waits for an upload still in flight, says so, then starts on its own", async () => {
  const pending = deferred();
  api.uploadAnviResume = async () => pending.promise;
  const starts = [];
  await render(lobby(practice({ resumeSetup: { mode: "required", sources: ["upload"], provided: false } }), async (args) => { starts.push(args); return true; }));
  await pickFile(fileOf("resume.pdf", "application/pdf"));
  await passInstructions();
  assert.match(document.querySelector('[data-summary="background"]').textContent, /Resume uploading\. Join waits for it to finish\./);
  assert.equal(joinButton().disabled, false);
  await click(joinButton());
  await tick();
  assert.match(joinButton().textContent, /Finishing upload…/);
  assert.match(joinHint(), /still uploading/);
  assert.equal(starts.length, 0, "the start waits for the resume");
  await act(async () => pending.resolve({ source: "upload", createdAt: iso(0), preview: "" }));
  await tick();
  assert.equal(starts.length, 1, "joined automatically once the upload finished");
  assert.equal(starts[0].body.resumeConsent, true);
});

test("flow: a required upload that fails after the student moved on blocks Join and points back to Background", async () => {
  const pending = deferred();
  api.uploadAnviResume = async () => pending.promise;
  await render(lobby(practice({ resumeSetup: { mode: "required", sources: ["upload"], provided: false } })));
  await pickFile(fileOf("resume.pdf", "application/pdf"));
  await passInstructions();
  await act(async () => pending.reject(apiError("NOT_A_RESUME", 422)));
  await tick();
  assert.equal(document.querySelector('[data-rail="background"]').dataset.status, "attention");
  assert.equal(document.querySelector('[data-summary="background"]').dataset.summaryState, "bad");
  assert.equal(joinButton().disabled, true);
  assert.equal(joinHint(), "Background: Add your resume to continue.");
  await click(buttonNamed(/Edit Background/));
  assert.equal(phaseNow(), "background");
  assert.match(document.querySelector('[data-step="resume"] [role="alert"]').textContent, /doesn't look like a resume/);
  assert.ok(buttonNamed(/Try again/, document.querySelector('[data-step="resume"]')), "the same file can be retried");
});

test("flow: a server refusal of the upload is explained in plain words", async () => {
  for (const [code, status, pattern] of [["NOT_A_RESUME", 422, /doesn't look like a resume/], ["RESUME_TOO_LARGE", 413, /larger than 5 MB/], ["RATE_LIMITED", 429, /Wait a few minutes/], ["AI_UNAVAILABLE", 503, /try again in a minute/]]) {
    api.uploadAnviResume = async () => { throw apiError(code, status); };
    await render(lobby(practice({ resumeSetup: { mode: "optional", sources: ["upload"] } })));
    await pickFile(fileOf("cv.pdf", "application/pdf"));
    assert.match(document.querySelector('[data-step="resume"] [role="alert"]').textContent, pattern, code);
    await act(async () => root.unmount());
    root = null;
  }
});

test("flow: the Resume Builder needs explicit permission, links to the builder when empty, and an optional resume never blocks", async () => {
  const saves = [];
  let empty = true;
  api.saveAnviBuilderResume = async (target) => {
    saves.push(target);
    if (empty) throw apiError("RESUME_BUILDER_EMPTY", 404);
    return { source: "builder", createdAt: iso(0), preview: "Final-year CSE student." };
  };
  await render(lobby(practice({ resumeSetup: { mode: "optional", sources: ["builder", "upload"] } })));
  const step = () => document.querySelector('[data-step="resume"]');
  assert.match(step().textContent, /Optional/);
  assert.equal(nextButton().disabled, false, "an optional resume does not block");
  await click(step().querySelector('[data-resume-source="builder"] [role="radio"]'));
  const use = buttonNamed(/Use this resume/, step());
  assert.equal(use.disabled, true, "permission first");
  await click(checkboxFor(/I allow ANVI to read my Resume Builder resume/));
  await click(buttonNamed(/Use this resume/, step()));
  await tick();
  const alert = step().querySelector('[role="alert"]');
  assert.match(alert.textContent, /Resume Builder resume is empty/);
  assert.equal(alert.querySelector("a").getAttribute("href"), "/student/resume");
  empty = false;
  await click(step().querySelector('[data-resume-source="builder"] [role="radio"]'));
  await click(checkboxFor(/I allow ANVI to read my Resume Builder resume/));
  await click(buttonNamed(/Use this resume/, step()));
  await tick();
  assert.deepEqual(saves, [{ kind: "practice", id: "int-7" }, { kind: "practice", id: "int-7" }]);
  assert.match(step().textContent, /Using your Resume Builder resume/);
  assert.match(step().textContent, /Final-year CSE student\./);
});

test("flow: a resume added earlier (at booking) counts at once and its preview loads quietly", async () => {
  const reads = [];
  api.getAnviResume = async (target) => { reads.push(target); return { source: "upload", createdAt: iso(-60), preview: "Backend intern at a fintech." }; };
  const setup = setupLib.startSetupOf({ assignmentId: "as-3", title: "Placement mock", mode: "mock", resumeSetup: { mode: "required", sources: ["upload"], provided: true, source: "upload" } }, "assignment");
  await render(lobby(setup));
  await tick();
  assert.deepEqual(reads, [{ kind: "assignment", id: "as-3" }]);
  assert.doesNotMatch(flow().textContent, /Checking your resume/);
  assert.match(document.querySelector('[data-step="resume"]').textContent, /Backend intern at a fintech\./);
  assert.match(document.querySelector('[data-testid="anvi-assigned-context"]').textContent, /Your institution scheduled this interview/);
  assert.equal(nextButton().disabled, false);
});

test("board: Start practice opens the flow; a refused start stays with a clear reason, a started one hands its audio to the room", async () => {
  const calls = [];
  let outcome = "refuse";
  const onStartPractice = (item, body, callbacks) => {
    calls.push([item.id, body]);
    if (outcome === "refuse") callbacks.onError(apiError("TERMS_REQUIRED"));
    else callbacks.onSuccess({ id: "att-3" });
  };
  const item = { id: "int-7", title: "Backend mock", status: "not_started", language: "English", terms: { text: "Be honest.", required: true }, resumeSetup: { mode: "none" } };
  await render(h(InterviewBoard, { practice: [item], onStartPractice, onReload: async () => {}, now: NOW, support: OK }));
  await click(buttonNamed(/Start practice/));
  const view = flow();
  assert.ok(view);
  assert.equal(view.getAttribute("role"), "dialog");
  assert.equal(document.activeElement, document.getElementById("anvi-phase-title"), "the phase title takes focus");
  await passInstructions({ terms: true });
  await click(joinButton());
  await tick();
  assert.deepEqual(calls[0], ["int-7", { termsAccepted: true, resumeConsent: false, language: "English" }]);
  assert.match(view.textContent, /Please read and accept the interview terms, then join again\./);
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews");
  outcome = "start";
  await click(joinButton());
  await tick();
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews/room/att-3");
  assert.equal(flow(), null);
  assert.equal(handoff.hasJoinHandoff("att-3"), true, "the room will join with the flow's audio");
  handoff.releaseJoinHandoff("att-3");
});

test("board: dismissing the Prep Coin dialog settles the start, so the flow can join again or exit", async () => {
  const calls = [];
  const onStartPractice = (item, body, callbacks) => { calls.push(callbacks); };
  const item = { id: "int-7", title: "Backend mock", status: "not_started", language: "English", terms: { text: "", required: false }, resumeSetup: { mode: "none" } };
  await render(h(InterviewBoard, { practice: [item], onStartPractice, onReload: async () => {}, now: NOW, support: OK }));
  await click(buttonNamed(/Start practice/));
  await passInstructions();
  await click(joinButton());
  await tick();
  assert.equal(calls.length, 1);
  assert.match(joinButton().textContent, /Starting your interview/, "the cost dialog is open");
  assert.equal(typeof calls[0].onCancel, "function");
  await act(async () => calls[0].onCancel());
  await tick();
  assert.match(joinButton().textContent, /Join now/);
  assert.equal(joinButton().disabled, false);
  assert.equal(buttonNamed(/Exit/).disabled, false);
  assert.equal(flow().textContent.includes("could not be started"), false, "a cancel is not an error");

  // A checkout that never reports back still leaves Exit open; exiting settles it as not started.
  await click(joinButton());
  await tick();
  assert.equal(calls.length, 2);
  await click(buttonNamed(/Exit/));
  await tick();
  assert.equal(flow(), null);
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews");
});

test("board + Prep Coin checkout: Cancel in the real cost dialog runs nothing and returns the flow to Join now", async () => {
  const { usePrepCoinCheckout } = await server.ssrLoadModule("/src/student/prepCoin/usePrepCoinCheckout.jsx");
  const saved = { walletPricing: api.walletPricing, start: api.startStudentAIInterview };
  const starts = [];
  api.walletPricing = async () => ({ features: [{ featureKey: "ai_interview.start", label: "AI interview", price: 5, cost: 5, balance: 40, freeLeft: 0, freePerMonth: 0 }] });
  api.startStudentAIInterview = async (...args) => { starts.push(args); return { id: "att-9" }; };
  // Wired as AnviInterviewsPage wires it: the lobby's callbacks go through checkout, onCancel included.
  function Host() {
    const { checkout, dialog } = usePrepCoinCheckout("ai_interview.start");
    const onStartPractice = (item, body, callbacks = {}) => checkout((cost) => api.startStudentAIInterview(item.id, body, cost), {
      onSuccess: callbacks.onSuccess, onError: callbacks.onError, onCancel: () => callbacks.onCancel?.(),
    });
    const item = { id: "int-7", title: "Backend mock", status: "not_started", language: "English", terms: { text: "", required: false }, resumeSetup: { mode: "none" } };
    return h("div", null, h(InterviewBoard, { practice: [item], onStartPractice, onReload: async () => {}, now: NOW, support: OK }), dialog);
  }
  try {
    await render(h(Host));
    await click(buttonNamed(/Start practice/));
    await passInstructions();
    await click(joinButton());
    await tick();
    const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Cancel");
    assert.ok(cancel, "the cost dialog is open");
    assert.match(joinButton().textContent, /Starting your interview/);
    await click(cancel);
    await tick();
    assert.equal([...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Cancel"), false, "the dialog closed");
    assert.match(joinButton().textContent, /Join now/);
    assert.equal(joinButton().disabled, false);
    assert.equal(starts.length, 0, "nothing was started or charged");
  } finally {
    api.walletPricing = saved.walletPricing;
    api.startStudentAIInterview = saved.start;
  }
});

test("board: media handed to a room that never took it is released when the list opens again", async () => {
  const stream = fakeStream();
  handoff.setJoinHandoff("att-gone", { stream });
  await render(h(InterviewBoard, { practice: [], onReload: async () => {}, now: NOW, support: OK }));
  assert.equal(handoff.hasJoinHandoff("att-gone"), false);
  assert.equal(stream.track.stopped, true);
});

// ---- Booking ----

const slotsResponse = () => ({ cutoffMinutes: 60, rescheduleLimit: 2, slots: [{ id: "s-1", startsAt: iso(180), endsAt: iso(210), capacity: 4, bookedCount: 0 }] });
const bookingItem = (resumeSetup) => ({ assignmentId: "as-x", title: "Placement mock", slotMode: "slots", booking: null, resumeSetup });

test("booking: the resume step follows the slot; without a resume the confirmation says to add it later", async () => {
  const booked = [];
  const done = [];
  api.listAnviAssignmentSlots = async () => slotsResponse();
  api.bookAnviSlot = async (aid, slotId) => { booked.push([aid, slotId]); return { id: "bk-1" }; };
  await render(h(BookingSheet, { item: bookingItem({ mode: "required", sources: ["upload"], provided: false }), now: NOW, onClose: () => {}, onDone: (result, message) => done.push(message) }));
  await click(document.querySelector('[role="tabpanel"] button'));
  assert.equal(buttonNamed(/Confirm booking/), undefined, "the resume comes before the confirm");
  await click(buttonNamed(/Next: your resume/));
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.querySelector("h2").textContent, /Add your resume/);
  assert.match(dialog.textContent, /needs your resume before you join\. You can add it now or later\./);
  assert.match(dialog.textContent, /Your slot/);
  await click(buttonNamed(/Confirm booking without resume/, dialog));
  await tick();
  assert.deepEqual(booked, [["as-x", "s-1"]]);
  assert.match(dialog.querySelector("h2").textContent, /You're booked/);
  const missing = dialog.querySelector('[data-resume-confirmation="missing"]');
  assert.match(missing.textContent, /Add your resume before the interview/);
  assert.match(missing.textContent, /from this interview's card under Upcoming/);
  assert.ok(buttonNamed(/Add resume now/, missing));
  assert.deepEqual(done, [], "the sheet stays open on the confirmation");
  await click(buttonNamed(/^Done$/, dialog));
  assert.equal(done.length, 1);
  assert.match(done[0], /^Booked for /);
});

test("booking: a resume uploaded in the booking step is confirmed with Resume added", async () => {
  const uploads = [];
  api.listAnviAssignmentSlots = async () => slotsResponse();
  api.bookAnviSlot = async () => ({ id: "bk-2" });
  api.uploadAnviResume = async (target, file) => { uploads.push([target, file.name]); return { source: "upload", createdAt: iso(0), preview: "Data analyst." }; };
  await render(h(BookingSheet, { item: bookingItem({ mode: "optional", sources: ["upload"], provided: false }), now: NOW, onClose: () => {}, onDone: () => {} }));
  await click(document.querySelector('[role="tabpanel"] button'));
  await click(buttonNamed(/Next: your resume/));
  await pickFile(fileOf("cv.txt", "text/plain"));
  assert.deepEqual(uploads, [[{ kind: "assignment", id: "as-x" }, "cv.txt"]]);
  await click(buttonNamed(/^Confirm booking$/));
  await tick();
  assert.match(document.querySelector('[data-resume-confirmation="added"]').textContent, /Resume added ✓/);
});

test("booking: the booking can be confirmed while the resume still uploads; the confirmation follows the upload", async () => {
  const booked = [];
  const pending = deferred();
  api.listAnviAssignmentSlots = async () => slotsResponse();
  api.bookAnviSlot = async (aid, slotId) => { booked.push([aid, slotId]); return { id: "bk-4" }; };
  api.uploadAnviResume = async () => pending.promise;
  await render(h(BookingSheet, { item: bookingItem({ mode: "required", sources: ["upload"], provided: false }), now: NOW, onClose: () => {}, onDone: () => {} }));
  await click(document.querySelector('[role="tabpanel"] button'));
  await click(buttonNamed(/Next: your resume/));
  await pickFile(fileOf("cv.pdf", "application/pdf"));
  assert.match(document.querySelector('[data-resume-state="uploading"]').textContent, /ANVI is reading your resume…/);
  assert.equal(buttonNamed(/^Confirm booking$/).disabled, false, "the reading state never holds the booking");
  await click(buttonNamed(/^Confirm booking$/));
  await tick();
  assert.deepEqual(booked, [["as-x", "s-1"]], "booking did not wait for the resume");
  assert.match(document.querySelector('[data-resume-confirmation="uploading"]').textContent, /Uploading…/);
  await act(async () => pending.resolve({ source: "upload", createdAt: iso(0), preview: "" }));
  await tick();
  assert.match(document.querySelector('[data-resume-confirmation="added"]').textContent, /Resume added ✓/);
});

test("booking: an interview without a resume books in one step, as before", async () => {
  const done = [];
  api.listAnviAssignmentSlots = async () => slotsResponse();
  api.bookAnviSlot = async () => ({ id: "bk-3" });
  await render(h(BookingSheet, { item: bookingItem({ mode: "none" }), now: NOW, onClose: () => {}, onDone: (result, message) => done.push(message) }));
  await click(document.querySelector('[role="tabpanel"] button'));
  assert.equal(buttonNamed(/Next: your resume/), undefined);
  await click(buttonNamed(/Confirm booking/));
  await tick();
  assert.equal(done.length, 1);
});
