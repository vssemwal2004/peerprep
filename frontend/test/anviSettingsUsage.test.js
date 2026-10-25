import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h, useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { newDefinition, newQuestion } from "../src/admin/ai-interviews/definition.js";
import {
  LANGUAGE_FIELDS,
  TERMS_LIMIT,
  readConduct,
  aiRangeIssues,
  readLanguage,
  readProctoring,
  readResume,
  readWarmup,
  toggleLanguageChoice,
  toggleSource,
  writeConduct,
  writeLanguage,
  writeProctoring,
  writeResume,
  writeWarmup,
} from "../src/admin/ai-interviews/wizard/settings/model.js";
import { presetRange, rangeError } from "../src/admin/ai-interviews/reports/usageRange.js";

// ---- Payload mapping (pure) -------------------------------------------------

test("language writes data.anvi.language and keeps rules.language as the primary", () => {
  let data = newDefinition();
  assert.equal(readLanguage(data).primary, "English", "older interviews fall back to rules.language");
  data = writeLanguage(data, { primary: "Hindi" });
  assert.equal(data.rules.language, "Hindi");
  assert.deepEqual(data.anvi[LANGUAGE_FIELDS.group], {
    primary: "Hindi",
    studentChoice: [],
    strict: true,
    onOtherLanguage: "remind_and_flag",
  });
  data = toggleLanguageChoice(data, "English");
  data = toggleLanguageChoice(data, "Hinglish");
  assert.deepEqual(data.anvi.language.studentChoice, ["English", "Hinglish"]);
  data = writeLanguage(data, { primary: "English", strict: false, onOtherLanguage: "ignore" });
  assert.deepEqual(data.anvi.language.studentChoice, ["Hinglish"], "the primary language is never an extra choice");
  assert.equal(data.anvi.language.strict, false);
  assert.equal(data.anvi.language.onOtherLanguage, "ignore");
  assert.equal(data.anvi.persona.tone, "warm", "other ANVI settings are kept");
  assert.equal(readLanguage({ rules: { language: "Hinglish" } }).primary, "Hinglish");
});

test("conduct and terms: defaults, the 4000 limit and the acceptance rule", () => {
  let data = newDefinition();
  assert.deepEqual(readConduct(data), {
    endByVoice: false,
    finishAllQuestions: true,
    noPersonalQuestions: true,
    termsText: "",
    requireTermsAcceptance: false,
  });
  data = writeConduct(data, { termsText: "No notes." });
  assert.equal(data.anvi.conduct.requireTermsAcceptance, true, "adding terms asks students to accept them");
  data = writeConduct(data, { requireTermsAcceptance: false, endByVoice: true });
  assert.deepEqual(
    [data.anvi.conduct.requireTermsAcceptance, data.anvi.conduct.endByVoice, data.anvi.conduct.finishAllQuestions],
    [false, true, true],
  );
  data = writeConduct(data, { termsText: "x".repeat(TERMS_LIMIT + 50) });
  assert.equal(data.anvi.conduct.termsText.length, TERMS_LIMIT);
  data = writeConduct(data, { termsText: "   " });
  assert.equal(data.anvi.conduct.requireTermsAcceptance, false, "nothing to accept without terms");
  assert.equal(readConduct({ anvi: { conduct: { termsText: "Rules" } } }).requireTermsAcceptance, true);
});

test("warm-up clamps icebreakers to 0-3", () => {
  let data = newDefinition();
  assert.deepEqual(readWarmup(data), { enabled: true, icebreakers: 2, tellMeAboutYourself: true, scored: false });
  data = writeWarmup(data, { icebreakers: 3, scored: true });
  assert.deepEqual(data.anvi.warmup, { enabled: true, icebreakers: 3, tellMeAboutYourself: true, scored: true });
  assert.equal(writeWarmup(data, { icebreakers: 9 }).anvi.warmup.icebreakers, 2, "out of range falls back to the default");
});

test("resume sources keep at least one, and the mode mirrors rules.resume", () => {
  assert.deepEqual(toggleSource(["builder", "upload"], "builder"), ["upload"]);
  assert.deepEqual(toggleSource(["upload"], "upload"), ["upload"], "the last source cannot be removed");
  assert.deepEqual(toggleSource(["upload"], "builder"), ["builder", "upload"]);
  let data = newDefinition();
  assert.deepEqual(readResume(data), { mode: "none", sources: ["builder", "upload"], questionCount: 2 });
  data = writeResume(data, { mode: "required", sources: ["upload"], questionCount: 4 });
  assert.deepEqual(data.anvi.resume, { mode: "required", sources: ["upload"], questionCount: 4 });
  assert.equal(data.rules.resume, "required");
  assert.deepEqual(writeResume(data, { sources: [] }).anvi.resume.sources, ["upload"], "an empty list is refused");
  const withResumeQuestion = {
    ...newDefinition(),
    sections: [{ groups: [{ source: "manual", questions: [{ ...newQuestion(), kind: "resume" }] }] }],
  };
  assert.equal(readResume(withResumeQuestion).mode, "required", "older interviews with resume questions need a resume");
});

test("proctoring: defaults, recommended checks on enable, clamping, camera block and unknown keys", () => {
  let data = newDefinition();
  const initial = readProctoring(data);
  assert.equal(initial.enabled, false);
  assert.deepEqual(
    [initial.fullscreen, initial.tabSwitch, initial.refresh, initial.warnings, initial.maxViolations, initial.onLimit, initial.pauseOutsideFullscreen],
    ["off", "off", "off", 3, 0, "end", true],
  );
  assert.equal(initial.ai.enabled, false);
  assert.equal(initial.ai.detectionIntervalMs, 500, "camera defaults come from the Assessment module");
  data = { ...data, anvi: { ...data.anvi, proctoring: { futureKey: "kept" } } };
  data = writeProctoring(data, { enabled: true });
  assert.deepEqual(
    [data.anvi.proctoring.enabled, data.anvi.proctoring.fullscreen, data.anvi.proctoring.tabSwitch, data.anvi.proctoring.refresh],
    [true, "required", "warn", "record"],
    "turning it on picks the recommended checks",
  );
  assert.equal(data.anvi.proctoring.futureKey, "kept", "unknown keys are kept");
  data = writeProctoring(data, { tabSwitch: "record", maxViolations: 25, warnings: 11, onLimit: "flag" });
  assert.equal(data.anvi.proctoring.tabSwitch, "record");
  assert.equal(data.anvi.proctoring.maxViolations, 0, "out of range keeps the previous value");
  assert.equal(data.anvi.proctoring.warnings, 3);
  data = writeProctoring(data, { maxViolations: 20, warnings: 10 });
  assert.deepEqual([data.anvi.proctoring.maxViolations, data.anvi.proctoring.warnings, data.anvi.proctoring.onLimit], [20, 10, "flag"]);
  data = writeProctoring(data, { enabled: false });
  data = writeProctoring(data, { enabled: true });
  assert.equal(data.anvi.proctoring.tabSwitch, "record", "re-enabling keeps the admin's choices");
  data = writeProctoring(data, { ai: { enabled: true, detectionIntervalMs: 90000, detectMobile: false } });
  assert.equal(data.anvi.proctoring.ai.detectionIntervalMs, 5000, "an out-of-range number is stored as the nearest allowed value");
  assert.equal(readProctoring(data).ai.detectMobile, false);
  assert.deepEqual(aiRangeIssues({ detectionIntervalMs: 90000 }), ["Detection interval: 500–5000 ms"]);
  assert.deepEqual(aiRangeIssues(data.anvi.proctoring.ai), [], "what is stored is always in range");
  assert.equal(data.anvi.persona.tone, "warm", "other ANVI settings are kept");
});

test("proctoring: half-typed camera numbers never reach the save, so the server validator accepts them", async () => {
  // The definition validator (backend normalizeAnvi) refuses the whole save for an out-of-range camera number.
  const { normalizeAnvi } = await import("../../backend/src/services/aiInterviewDefinition.js");
  let data = writeProctoring(newDefinition(), { enabled: true });
  data = writeProctoring(data, { ai: { enabled: true, detectionIntervalMs: 1, ignoreLimit: 60, faceOutOfFrameGraceSec: 1, violationCooldownSec: undefined } });
  assert.deepEqual(
    [data.anvi.proctoring.ai.detectionIntervalMs, data.anvi.proctoring.ai.ignoreLimit, data.anvi.proctoring.ai.faceOutOfFrameGraceSec, data.anvi.proctoring.ai.violationCooldownSec],
    [500, 50, 3, 20],
    "clamped to the Assessment ranges; an emptied field saves the default",
  );
  assert.doesNotThrow(() => normalizeAnvi(data.anvi));
  assert.equal(normalizeAnvi(data.anvi).proctoring.ai.ignoreLimit, 50);
  // Turning camera checks or proctoring off still saves a valid camera block.
  data = writeProctoring(data, { ai: { ...data.anvi.proctoring.ai, enabled: false, detectionIntervalMs: "abc" } });
  data = writeProctoring(data, { enabled: false });
  assert.equal(data.anvi.proctoring.ai.detectionIntervalMs, 500);
  assert.doesNotThrow(() => normalizeAnvi(data.anvi));
});

test("usage date ranges are IST days with a 180-day limit", () => {
  assert.deepEqual(presetRange(7, "2026-10-22"), { from: "2026-10-16", to: "2026-10-22" });
  assert.equal(rangeError(presetRange(180, "2026-10-22")), "");
  assert.match(rangeError({ from: "2026-01-01", to: "2026-10-22" }), /at most 180 days/);
  assert.match(rangeError({ from: "2026-10-23", to: "2026-10-22" }), /on or before/);
});

// ---- Rendered UI ------------------------------------------------------------

let dom, server, root, createRoot, StepAnviSettings, ReportsPanel, reportApi, usageApi;
const globals = ["window", "document", "navigator", "HTMLElement", "HTMLDialogElement", "IS_REACT_ACT_ENVIRONMENT"];
const original = new Map(globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/admin/ai-interviews/reports" });
  for (const key of globals.filter((k) => k !== "IS_REACT_ACT_ENVIRONMENT"))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  StepAnviSettings = (await server.ssrLoadModule("/src/admin/ai-interviews/wizard/StepAnviSettings.jsx")).default;
  ReportsPanel = (await server.ssrLoadModule("/src/admin/ai-interviews/reports/AnviReportsPanel.jsx")).default;
  ({ reportApi } = await server.ssrLoadModule("/src/admin/ai-interviews/api.js"));
  ({ usageApi } = await server.ssrLoadModule("/src/admin/ai-interviews/reports/usageApi.js"));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom.window.close();
  for (const key of globals) {
    const d = original.get(key);
    if (d) Object.defineProperty(globalThis, key, d);
    else delete globalThis[key];
  }
});

const switchFor = (label) => document.querySelector(`[role="switch"][aria-label="${label}"]`);
const checkbox = (label) =>
  [...document.querySelectorAll("label")].find((el) => el.textContent.startsWith(label))?.querySelector('input[type="checkbox"]');
const radio = (group, label) => {
  const container = [...document.querySelectorAll('[role="radiogroup"]')].find(
    (el) => document.getElementById(el.getAttribute("aria-labelledby"))?.textContent.trim() === group,
  );
  assert.ok(container, `Radio group ${group} exists`);
  return [...container.querySelectorAll('[role="radio"]')].find((el) => el.textContent.trim().startsWith(label));
};
async function click(element) {
  assert.ok(element, "Click target exists");
  await act(async () => element.click());
}
async function type(element, value) {
  assert.ok(element, "Input exists");
  await act(async () => {
    const proto = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
      : element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
const settle = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

async function mountSettings(initial = newDefinition(), { path = "/admin/ai-interviews/i1/anvi" } = {}) {
  const state = { data: initial };
  function Harness() {
    const [data, setData] = useState(initial);
    const [reveal, setReveal] = useState(null);
    state.data = data;
    state.reveal = (fields) => setReveal({ fields, nonce: Math.random(), focus: true });
    state.location = useLocation();
    return h(StepAnviSettings, { data, onChange: setData, reveal, errors: {} });
  }
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Harness))));
  return state;
}
const tab = (id) => document.querySelector(`[role="tab"][data-settings-tab="${id}"]`);
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.settingsTab;
const chipOf = (id) => tab(id).querySelector("[data-tab-status]")?.textContent;
const summaryOf = (id) => tab(id).title;
const cardTitles = () => [...document.querySelectorAll("h3")].map((el) => el.textContent);

test("settings cards write the expected payload paths", async () => {
  const state = await mountSettings();
  assert.equal(selectedTab(), "voice");
  for (const title of ["ANVI's voice", "Personality", "What ANVI says"])
    assert.ok(cardTitles().includes(title), `${title} card is on Voice & personality`);
  assert.equal(document.querySelector('[data-field="language"]'), null, "English only: no Language card");
  assert.equal(document.querySelector('[data-field="voiceLanguage"]'), null, "and no accent picker");
  assert.equal(document.querySelector("[data-settings-panel-title]").textContent, "Voice & personality");

  await click(tab("conversation"));
  for (const title of ["Turn-taking", "Warm-up", "Interview conduct"])
    assert.ok(cardTitles().includes(title), `${title} card is on Conversation`);
  assert.ok(!cardTitles().includes("Personality"), "only the selected tab is rendered");
  assert.equal(summaryOf("conversation"), "2 conduct rules on · warm-up on");
  assert.equal(chipOf("conversation"), undefined, "only Proctoring shows a badge");
  await click(switchFor("Allow ending by voice"));
  assert.equal(summaryOf("conversation"), "3 conduct rules on · warm-up on");
  await click(switchFor("No personal questions"));
  assert.equal(state.data.anvi.conduct.endByVoice, true);
  assert.equal(state.data.anvi.conduct.noPersonalQuestions, false);

  await click(document.querySelector('[aria-label="Increase icebreaker questions"]'));
  await click(switchFor("Count it in the score"));
  assert.deepEqual(state.data.anvi.warmup, { enabled: true, icebreakers: 3, tellMeAboutYourself: true, scored: true });
  await click(switchFor("Start with a warm-up"));
  assert.equal(state.data.anvi.warmup.enabled, false);
  assert.equal(switchFor("Count it in the score"), null, "warm-up options hide when it is off");

  await click(tab("candidate"));
  assert.deepEqual(cardTitles().filter((t) => ["Resume", "Terms & conditions"].includes(t)), ["Resume", "Terms & conditions"]);
  assert.equal(summaryOf("candidate"), "No resume · no terms");
  await click(radio("Ask for the student's resume", "Required"));
  assert.equal(state.data.anvi.resume.mode, "required");
  assert.equal(summaryOf("candidate"), "Resume required · no terms");

  assert.equal(state.data.anvi.persona.tone, "warm", "persona settings are untouched");
});

test("settings sub-tabs: URL, keyboard, status chips, red dots and reveal focus", async () => {
  const data = newDefinition();
  data.sections = [{ id: "s1", name: "Interview", weight: 100, groups: [{ id: "g1", name: "Questions", weight: 100, source: "manual", questions: [{ ...newQuestion(), kind: "resume", prompt: "" }] }] }];
  data.anvi = { ...data.anvi, resume: { mode: "none" } };
  const state = await mountSettings(data, { path: "/admin/ai-interviews/i1/anvi?tab=scoring" });
  assert.equal(selectedTab(), "scoring", "?tab= picks the tab");
  assert.ok(cardTitles().includes("Scoring rubric"));
  const tabs = [...document.querySelectorAll('[role="tab"][data-settings-tab]')];
  assert.deepEqual(tabs.map((el) => el.dataset.settingsTab), ["voice", "conversation", "candidate", "proctoring", "scoring", "advanced"]);
  assert.ok(tabs.every((el) => el.getAttribute("aria-controls")), "tabs control a panel");
  assert.equal(document.querySelector('[role="tabpanel"]').getAttribute("aria-labelledby"), tab("scoring").id);
  assert.deepEqual(tabs.filter((el) => el.tabIndex === 0).map((el) => el.dataset.settingsTab), ["scoring"], "roving tab index");
  assert.equal(chipOf("proctoring"), undefined, "no badge while proctoring is off");
  assert.equal(summaryOf("proctoring"), "AI proctoring off");
  assert.equal(summaryOf("voice"), "Aoede voice · warm tone");
  assert.equal(summaryOf("advanced"), "No interviewer profile yet");
  assert.ok(tab("candidate").querySelector("[data-tab-error]"), "resume questions without a resume mark Candidate setup");
  assert.equal(tab("scoring").querySelector("[data-tab-error]"), null);

  await click(tab("proctoring"));
  await settle();
  assert.equal(state.location.search, "?tab=proctoring", "the selected tab is kept in the URL");
  await click(switchFor("Enable AI proctoring"));
  assert.equal(chipOf("proctoring"), "On");
  await click(switchFor("Enable camera AI checks"));
  assert.equal(chipOf("proctoring"), "On");
  assert.equal(summaryOf("proctoring"), "AI proctoring on with camera checks");

  await act(async () => tab("proctoring").dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.equal(selectedTab(), "scoring", "arrow keys move between tabs");
  assert.equal(document.activeElement, tab("scoring"));
  await act(async () => tab("scoring").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  assert.equal(selectedTab(), "voice");

  // A Fix link or Continue reveals fields: the tab that holds them opens and the field is there to focus.
  for (const [field, id] of [["persona", "voice"], ["resume", "candidate"], ["interviewer", "advanced"], ["answerTime", "advanced"], ["rubric", "scoring"], ["voice", "voice"], ["proctoring", "proctoring"]]) {
    await act(async () => state.reveal([field]));
    await settle();
    assert.equal(selectedTab(), id, `${field} opens ${id}`);
    assert.ok(document.querySelector(`[data-field="${field}"]`), `${field} is rendered`);
    assert.equal(state.location.search, `?tab=${id}`);
  }
  assert.ok(state.location.pathname.endsWith("/anvi"), "only the query changes");
});

test("AI proctoring card: options, limit, camera checks and payload paths", async () => {
  const state = await mountSettings();
  assert.equal(document.querySelector('[data-field="proctoring"]'), null, "proctoring has its own tab");
  await click(tab("proctoring"));
  assert.ok([...document.querySelectorAll("h3")].some((el) => el.textContent === "AI proctoring"));
  assert.equal(document.querySelector('[data-field="proctoring"] [role="radiogroup"]'), null, "options hide while it is off");
  assert.ok(document.body.textContent.includes("Scores are never reduced automatically."));

  await click(switchFor("Enable AI proctoring"));
  assert.deepEqual(
    [state.data.anvi.proctoring.enabled, state.data.anvi.proctoring.fullscreen, state.data.anvi.proctoring.tabSwitch, state.data.anvi.proctoring.refresh],
    [true, "required", "warn", "record"],
  );
  const card = () => document.querySelector('[data-field="proctoring"]').textContent;
  assert.ok(card().includes("Students enter fullscreen only at the last step, when they join."));
  assert.ok(card().includes("The interview timer keeps running while paused."));
  await click(switchFor("Pause the interview when the student leaves fullscreen or switches tab"));
  assert.equal(state.data.anvi.proctoring.pauseOutsideFullscreen, false);
  await click(radio("Tab switches", "Record"));
  assert.equal(state.data.anvi.proctoring.tabSwitch, "record");
  assert.ok(card().includes("The student is not told."));
  await click(radio("Refresh & rejoin", "Off"));
  assert.equal(state.data.anvi.proctoring.refresh, "off");
  await click(switchFor("Block keyboard shortcuts"));
  assert.equal(state.data.anvi.proctoring.blockShortcuts, false);
  assert.ok(card().includes("Browsers never let a page block Esc."));
  await click(document.querySelector('[aria-label="Increase warnings before the limit"]'));
  assert.equal(state.data.anvi.proctoring.warnings, 4);

  assert.equal(document.querySelector('[aria-label="Increase violations allowed"]'), null, "no limit by default");
  await click(radio("Limit", "Set a limit"));
  assert.equal(state.data.anvi.proctoring.maxViolations, 5);
  await click(document.querySelector('[aria-label="Increase violations allowed"]'));
  assert.equal(state.data.anvi.proctoring.maxViolations, 6);
  await click(radio("At the limit", "Only flag in report"));
  assert.equal(state.data.anvi.proctoring.onLimit, "flag");
  await click(radio("Limit", "No limit"));
  assert.equal(state.data.anvi.proctoring.maxViolations, 0);

  await click(radio("Fullscreen", "Off"));
  assert.equal(switchFor("Pause the interview when the student leaves fullscreen or switches tab"), null, "pause only with fullscreen required");

  assert.ok(card().includes("No video is recorded."));
  assert.ok(!card().includes("Detect mobile phone"), "camera options hide while camera checks are off");
  await click(switchFor("Enable camera AI checks"));
  assert.equal(state.data.anvi.proctoring.ai.enabled, true);
  assert.ok(card().includes("Detect mobile phone") && card().includes("Violation cooldown"), "the Assessment settings editor is embedded");
  const mobileRow = [...document.querySelectorAll('[data-proctoring-camera] span')].find((el) => el.textContent === "Detect mobile phone").parentElement;
  await click(mobileRow.querySelector("button"));
  assert.equal(state.data.anvi.proctoring.ai.detectMobile, false);
  assert.equal(state.data.anvi.proctoring.ai.enabled, true);
  assert.equal(state.data.anvi.proctoring.ai.ignoreLimit, 5);
  assert.equal(state.data.anvi.persona.tone, "warm", "persona settings are untouched");

  // Typing a number: the field keeps the typed text, only an in-range value is stored, and the
  // warning says what will be saved. On blur the field shows the saved value.
  const cameraInput = (label) => [...document.querySelectorAll('[data-proctoring-camera] span')].find((el) => el.textContent === label).parentElement.querySelector("input");
  const interval = cameraInput("Detection interval");
  await type(interval, "1");
  assert.equal(cameraInput("Detection interval").value, "1", "the half-typed value stays on screen");
  assert.equal(state.data.anvi.proctoring.ai.detectionIntervalMs, 500, "but the stored value is in range");
  const warning = () => document.querySelector('[data-proctoring-camera] [role="alert"]')?.textContent || "";
  assert.match(warning(), /nearest allowed value is saved: Detection interval: 500–5000 ms/);
  assert.doesNotMatch(warning(), /default is used/);
  await type(cameraInput("Detection interval"), "1000");
  assert.equal(state.data.anvi.proctoring.ai.detectionIntervalMs, 1000);
  assert.equal(warning(), "", "no warning once in range");
  await type(cameraInput("Ignore limit"), "60");
  assert.equal(state.data.anvi.proctoring.ai.ignoreLimit, 50);
  assert.equal(cameraInput("Ignore limit").value, "60");
  await act(async () => cameraInput("Ignore limit").dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })));
  assert.equal(cameraInput("Ignore limit").value, "50", "on blur the field shows the saved value");
  assert.equal(warning(), "");
  // The grace period: "1" on the way to "15" stays on screen (the stored value is in range), and on
  // blur the field shows the stored value.
  const grace = () => [...document.querySelectorAll("[data-proctoring-camera] p")].find((el) => el.textContent === "Face absence grace period").closest("div.flex").querySelector("input");
  await type(grace(), "1");
  assert.equal(grace().value, "1", "the half-typed grace period is not replaced by the minimum");
  assert.equal(state.data.anvi.proctoring.ai.faceOutOfFrameGraceSec, 3);
  await type(grace(), "15");
  assert.equal(grace().value, "15");
  assert.equal(state.data.anvi.proctoring.ai.faceOutOfFrameGraceSec, 15);
  await type(grace(), "1");
  await act(async () => grace().dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })));
  assert.equal(grace().value, "3", "on blur the field settles on the nearest allowed value");
  assert.equal(grace().value, String(state.data.anvi.proctoring.ai.faceOutOfFrameGraceSec), "shown and stored values agree");
});

test("Assessment AI proctoring editor: numbers keep the typed text and clamp on blur, in the same settings shape", async () => {
  const { default: AIProctoringSettings, DEFAULT_AI_PROCTORING_SETTINGS, normalizeAiProctoringSettings } = await server.ssrLoadModule("/src/features/assessment/admin/components/AIProctoringSettings.jsx");
  const emitted = [];
  let stored = null;
  // As CreateAssessment wires it: every change is normalized and stored, and the stored value is shown.
  function AssessmentHost() {
    const [value, setValue] = useState({ ...DEFAULT_AI_PROCTORING_SETTINGS, enabled: true });
    stored = value;
    return h(AIProctoringSettings, { value, onChange: (next) => { emitted.push(next); setValue(normalizeAiProctoringSettings(next)); } });
  }
  await act(async () => root.render(h(AssessmentHost)));
  const input = (label) => [...document.querySelectorAll("span")].find((el) => el.textContent === label).parentElement.querySelector("input");
  const grace = () => [...document.querySelectorAll("p")].find((el) => el.textContent === "Face absence grace period").closest("div.flex").querySelector("input");
  const blur = (element) => act(async () => element.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })));

  await type(grace(), "1");
  assert.equal(grace().value, "1", "typing 15 starts with 1, which stays on screen");
  await type(grace(), "15");
  assert.equal(grace().value, "15");
  assert.equal(stored.faceOutOfFrameGraceSec, 15);
  await type(grace(), "90");
  await blur(grace());
  assert.equal(grace().value, "60");
  assert.equal(stored.faceOutOfFrameGraceSec, 60);
  await type(grace(), "");
  await blur(grace());
  assert.equal(grace().value, "10", "an empty grace period falls back to the default");

  await type(input("Detection interval"), "90000");
  assert.equal(input("Detection interval").value, "90000");
  await blur(input("Detection interval"));
  assert.equal(input("Detection interval").value, "5000");
  assert.equal(stored.detectionIntervalMs, 5000);
  await type(input("Violation cooldown"), "1");
  await blur(input("Violation cooldown"));
  assert.equal(stored.violationCooldownSec, 5);
  await type(input("Ignore limit"), "");
  await blur(input("Ignore limit"));
  assert.equal(stored.ignoreLimit, 5, "an empty number falls back to its default");

  const keys = Object.keys({ ...DEFAULT_AI_PROCTORING_SETTINGS, enabled: true }).sort();
  for (const next of emitted) assert.deepEqual(Object.keys(next).sort(), keys, "every change is the whole settings object");
  assert.ok(emitted.every((next) => ["faceOutOfFrameGraceSec", "detectionIntervalMs", "ignoreLimit", "violationCooldownSec"].every((key) => next[key] === undefined || typeof next[key] === "number")));
});

test("AI proctoring editor: a parent that stores raw input still gets the clamped number on blur", async () => {
  const { default: AIProctoringSettings, DEFAULT_AI_PROCTORING_SETTINGS } = await server.ssrLoadModule("/src/features/assessment/admin/components/AIProctoringSettings.jsx");
  let stored = null;
  function RawHost() {
    const [value, setValue] = useState({ ...DEFAULT_AI_PROCTORING_SETTINGS, enabled: true });
    stored = value;
    return h(AIProctoringSettings, { value, onChange: setValue });
  }
  await act(async () => root.render(h(RawHost)));
  const grace = () => [...document.querySelectorAll("p")].find((el) => el.textContent === "Face absence grace period").closest("div.flex").querySelector("input");
  await type(grace(), "1");
  assert.equal(stored.faceOutOfFrameGraceSec, 1, "the raw number is reported while typing");
  assert.equal(grace().value, "1");
  await act(async () => grace().dispatchEvent(new window.FocusEvent("focusout", { bubbles: true })));
  assert.equal(stored.faceOutOfFrameGraceSec, 3, "blur reports the clamped value even though the shown value was already 3");
  assert.equal(grace().value, "3");
});

test("attempt list rows show the violation count from the list API's top-level violations", async () => {
  const originals = { list: reportApi.list };
  const base = { student: { name: "Asha Verma" }, interviewId: "i1", interviewTitle: "Backend round", status: "ready", startedAt: "2026-10-22T10:00:00Z" };
  reportApi.list = async () => ({
    attempts: [
      { ...base, attemptId: "a1", violations: 4, endReason: null },
      { ...base, attemptId: "a2", student: { name: "Ravi Kumar" }, violations: 1 },
      { ...base, attemptId: "a3", student: { name: "Meera Shah" }, violations: null },
      { ...base, attemptId: "a4", student: { name: "Dev Rao" }, violations: 3, endReason: "proctoring_limit" },
    ],
    interviews: [],
    pagination: { page: 1, pages: 1, limit: 25, total: 4 },
  });
  try {
    await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/admin/ai-interviews/reports"] }, h(ReportsPanel))));
    await settle();
    const rows = [...document.querySelectorAll("tbody tr")].map((row) => row.textContent);
    const rowOf = (name) => rows.find((text) => text.includes(name)) || "";
    assert.match(rowOf("Asha Verma"), /4 violations/);
    assert.match(rowOf("Ravi Kumar"), /1 violation(?!s)/);
    assert.doesNotMatch(rowOf("Meera Shah"), /violation/, "not proctored: no chip");
    assert.match(rowOf("Dev Rao"), /Ended: violations/);
  } finally {
    reportApi.list = originals.list;
  }
});

test("terms counter, acceptance toggle and student preview", async () => {
  const state = await mountSettings(newDefinition(), { path: "/admin/ai-interviews/i1/anvi?tab=candidate" });
  const counter = () => document.querySelector("[data-terms-counter]").textContent;
  assert.equal(counter(), "0 / 4,000 characters");
  assert.equal(switchFor("Students must accept to start").disabled, true, "nothing to accept yet");
  assert.ok(document.querySelector("[data-terms-preview]").textContent.includes("No terms"));

  const textarea = document.querySelector('textarea[maxlength="4000"]');
  await type(textarea, "Do not use notes.\nThe interview is transcribed.");
  assert.equal(counter(), "47 / 4,000 characters");
  assert.equal(state.data.anvi.conduct.termsText, "Do not use notes.\nThe interview is transcribed.");
  assert.equal(state.data.anvi.conduct.requireTermsAcceptance, true);
  assert.equal(switchFor("Students must accept to start").disabled, false);
  const preview = document.querySelector("[data-terms-preview]").textContent;
  assert.ok(preview.includes("Do not use notes.") && preview.includes("I have read and agree"));

  await click(switchFor("Students must accept to start"));
  assert.equal(state.data.anvi.conduct.requireTermsAcceptance, false);
  assert.ok(document.querySelector("[data-terms-preview]").textContent.includes("do not need to accept"));

  await type(textarea, "y".repeat(3700));
  assert.match(document.querySelector("[data-terms-counter]").className, /amber/, "near the limit the counter warns");
});

test("resume card: sources keep at least one and the privacy note is shown", async () => {
  const state = await mountSettings(newDefinition(), { path: "/admin/ai-interviews/i1/anvi?tab=candidate" });
  assert.ok(document.body.textContent.includes("Only the resume text is kept, with personal details removed, and it is deleted when the interview ends."));
  assert.equal(checkbox("Saved resume from Resume Builder"), undefined, "sources are hidden while resume is off");
  await click(radio("Ask for the student's resume", "Required"));
  assert.equal(state.data.anvi.resume.mode, "required");
  assert.equal(state.data.rules.resume, "required");
  await click(checkbox("Saved resume from Resume Builder"));
  assert.deepEqual(state.data.anvi.resume.sources, ["upload"]);
  const upload = checkbox("Uploaded file");
  assert.equal(upload.checked, true);
  assert.equal(upload.disabled, true, "the last source cannot be turned off");
  assert.ok(document.body.textContent.includes("At least one way must stay on."));
  await click(document.querySelector('[aria-label="Decrease questions from the resume"]'));
  assert.equal(state.data.anvi.resume.questionCount, 1);
});

const USAGE = {
  range: { from: "2026-09-23T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z" },
  interviewId: null,
  totals: { calls: 40, inputTokens: 900000, outputTokens: 300000, totalTokens: 1200000, audioSeconds: 0, estimatedCost: 1.84, complete: false },
  sessions: { count: 12, attempts: 10, liveMinutes: 96.5 },
  byKind: [
    { kind: "live", calls: 30, inputTokens: 800000, outputTokens: 200000, totalTokens: 1000000, audioSeconds: 0, estimatedCost: 1.5 },
    { kind: "evaluate", calls: 10, inputTokens: 100000, outputTokens: 100000, totalTokens: 200000, audioSeconds: 0, estimatedCost: null },
  ],
  byModel: [],
  byDay: [{ day: "2026-10-21", calls: 40, totalTokens: 1200000, estimatedCost: 1.84, sessions: 12, liveMinutes: 96.5, byKind: {} }],
  pricing: { currency: "USD", unit: "per 1M tokens", prices: {}, unpricedKinds: ["evaluate"] },
};

test("usage tab shows KPI tiles, the breakdowns and re-queries on filter changes", async () => {
  const calls = [];
  const originals = { list: reportApi.list, get: usageApi.get };
  reportApi.list = async () => ({ attempts: [], interviews: [{ id: "i1", title: "Backend round" }], pagination: { page: 1, pages: 1, limit: 25, total: 0 } });
  usageApi.get = async (values) => { calls.push({ ...values }); return USAGE; };
  try {
    await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/admin/ai-interviews/reports?view=usage"] }, h(ReportsPanel))));
    await settle();
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    assert.equal(tab.textContent, "Usage and cost");
    const last = calls.at(-1);
    assert.match(last.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(last.to, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(last.interviewId, "");
    const kpis = document.querySelector("[data-usage-kpis]").textContent;
    assert.ok(kpis.includes("Sessions") && kpis.includes("12"));
    assert.ok(kpis.includes("96.5 min"));
    assert.ok(kpis.includes("1.2M") && kpis.includes("900K in · 300K out"), `tokens shown compactly: ${kpis}`);
    assert.ok(kpis.includes("$1.84"));
    assert.ok(kpis.includes("Partial: no price set for report scoring"));
    const byKind = document.querySelector("[data-usage-by-kind]").textContent;
    assert.ok(byKind.includes("Live conversation") && byKind.includes("Report scoring") && byKind.includes("Price not set"));
    assert.ok(document.querySelector("[data-usage-by-day]").textContent.includes("21 Oct 2026"));

    await type(document.querySelector('select[aria-label="Interview"]'), "i1");
    await settle();
    assert.equal(calls.at(-1).interviewId, "i1");
    await type(document.querySelector('select[aria-label="Period"]'), "7");
    await settle();
    const week = calls.at(-1);
    assert.equal((Date.parse(week.to) - Date.parse(week.from)) / 86400000, 6);
    const count = calls.length;
    await type(document.querySelector('select[aria-label="Period"]'), "custom");
    await type(document.querySelector('input[aria-label="From"]'), "2025-01-01");
    await settle();
    assert.ok(document.querySelector('[role="alert"]').textContent.includes("at most 180 days"));
    assert.equal(calls.length, count, "an invalid range is not requested");
  } finally {
    reportApi.list = originals.list;
    usageApi.get = originals.get;
  }
});

test("attempt detail shows warm-up, terms, resume source and the other-language flag", async () => {
  const originals = { list: reportApi.list, get: reportApi.get };
  const row = { attemptId: "a1", student: { name: "Asha Verma" }, interviewId: "i1", interviewTitle: "Backend round", status: "completed", startedAt: "2026-10-22T10:00:00Z" };
  reportApi.list = async () => ({ attempts: [row], interviews: [], pagination: { page: 1, pages: 1, limit: 25, total: 1 } });
  reportApi.get = async () => ({
    ...row,
    language: "English",
    warmup: "ANVI: How is your day going?\nStudent: Good, thanks.",
    termsAcceptedAt: "2026-10-22T09:59:00Z",
    resumeSource: "upload",
    proctoring: {
      settings: { enabled: true, fullscreen: "required", tabSwitch: "warn", refresh: "record", maxViolations: 3, onLimit: "end" },
      events: [{ type: "tab_hidden", at: "2026-10-22T10:02:00Z", questionN: 1 }],
      counts: { fullscreen_exit: 0, tab_hidden: 1, window_blur: 0, rejoin: 0 },
      violations: 1,
      endedForViolations: false,
    },
    items: [
      { qid: "q1", n: 1, questionText: "Explain REST.", answerText: "REST matlab...", status: "answered", flags: ["other_language"] },
      { qid: "q2", n: 2, questionText: "What is caching?", answerText: "Storing results.", status: "answered", flags: [] },
    ],
  });
  try {
    await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/admin/ai-interviews/reports"] }, h(ReportsPanel))));
    await settle();
    await click(document.querySelector('[aria-label="View report for Asha Verma"]'));
    await settle();
    const drawer = document.querySelector("dialog[open]");
    const setup = drawer.querySelector("[data-attempt-setup]").textContent;
    assert.ok(setup.includes("Terms accepted") && setup.includes("22 Oct 2026"), setup);
    assert.ok(setup.includes("Uploaded file"));
    const flags = drawer.querySelector("[data-language-flags]").textContent;
    assert.ok(flags.includes("Explain REST.") && !flags.includes("What is caching?"));
    assert.equal([...drawer.querySelectorAll("span")].filter((el) => el.textContent === "Answered in another language").length, 2, "flag list and answer list");
    const toggle = drawer.querySelector("[data-warmup-transcript] button");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.ok(!drawer.textContent.includes("How is your day going?"), "the transcript starts collapsed");
    await click(toggle);
    assert.ok(drawer.textContent.includes("How is your day going?"));
    const integrity = drawer.querySelector("[data-report-integrity]");
    assert.ok(integrity, "an unscored attempt still shows its integrity record");
    assert.ok(integrity.querySelector("[data-integrity-events]").textContent.includes("Switched away from the tab"));
    assert.ok(integrity.textContent.includes("At the limit: End the interview"));
  } finally {
    reportApi.list = originals.list;
    reportApi.get = originals.get;
  }
});

test("a reports deep link with ?attemptId= opens that attempt's drawer; closing it drops attemptId and keeps the schedule filter", async () => {
  const originals = { list: reportApi.list, get: reportApi.get };
  const lists = [];
  const gets = [];
  const row = { attemptId: "t2", assignmentId: "a1", student: { name: "Asha Verma" }, interviewId: "i1", interviewTitle: "Backend round", status: "completed", startedAt: "2026-10-22T10:00:00Z" };
  reportApi.list = async (filters) => { lists.push({ ...filters }); return { attempts: [row], interviews: [], pagination: { page: 1, pages: 1, limit: 25, total: 1 } }; };
  reportApi.get = async (id) => { gets.push(id); return { ...row, items: [] }; };
  const state = {};
  function Harness() {
    state.location = useLocation();
    return h(ReportsPanel);
  }
  try {
    await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/admin/ai-interviews/reports?assignmentId=a1&attemptId=t2"] }, h(Harness))));
    await settle();
    assert.deepEqual(gets, ["t2"], "the linked attempt loads without a click");
    assert.equal(lists.at(-1).assignmentId, "a1", "the list is still narrowed to the schedule");
    const drawer = document.querySelector("dialog[open]");
    assert.ok(drawer, "the drawer is open");
    assert.ok(drawer.textContent.includes("Asha Verma · Backend round"));
    await click([...drawer.querySelectorAll("button")].find((el) => el.textContent.trim() === "Close"));
    await settle();
    assert.equal(document.querySelector("dialog[open]"), null, "the drawer closed");
    const search = new URLSearchParams(state.location.search);
    assert.equal(search.get("attemptId"), null, "attemptId is cleared from the URL");
    assert.equal(search.get("assignmentId"), "a1");
    assert.deepEqual(gets, ["t2"], "closing does not reopen it");
    await click(document.querySelector('[aria-label="View report for Asha Verma"]'));
    await settle();
    assert.ok(document.querySelector("dialog[open]"), "a row's View still opens the drawer");
    assert.equal(new URLSearchParams(state.location.search).get("attemptId"), null);
  } finally {
    reportApi.list = originals.list;
    reportApi.get = originals.get;
  }
});
