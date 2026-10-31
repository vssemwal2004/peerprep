import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { newDefinition, newQuestion } from "../src/admin/ai-interviews/definition.js";
import { addQuestions } from "../src/admin/ai-interviews/wizard/structure.js";
import {
  audioReadiness,
  durationGuidance,
  readDuration,
  readHybrid,
  toggleConversational,
  writeDuration,
  writeHybrid,
} from "../src/admin/ai-interviews/wizard/settings/hybrid.js";
import { tabForField } from "../src/admin/ai-interviews/wizard/settings/tabs.js";

const withQuestions = (n) =>
  addQuestions(newDefinition(), Array.from({ length: n }, (_, i) => ({ ...newQuestion(), prompt: `Question ${i + 1}` }))).data;

// ---- Payload mapping (pure) -------------------------------------------------

test("duration and hybrid options round-trip through the server definition", async () => {
  const { normalizeAnvi, ANVI_DURATIONS, DURATION_MAX_QUESTIONS } = await import("../../backend/src/services/aiInterviewDefinition.js");
  let data = withQuestions(2);
  assert.equal(readDuration(data), null, "older interviews have no length");
  data = writeDuration(data, "30");
  assert.equal(data.anvi.durationMinutes, 30);
  assert.equal(data.anvi.persona.tone, "warm", "other ANVI settings are kept");
  const sectionId = data.sections[0].id;
  data = toggleConversational(writeHybrid(data, { allowLiveWarmup: true, allowStudentLiveMode: true }), sectionId);
  assert.deepEqual(data.anvi.hybrid, { allowLiveWarmup: true, conversationalSectionIds: [sectionId], allowStudentLiveMode: true });
  const saved = normalizeAnvi(data.anvi);
  assert.equal(saved.durationMinutes, 30);
  assert.deepEqual(saved.hybrid, data.anvi.hybrid);
  // What the server stored reads back the same.
  const reloaded = { ...data, anvi: saved };
  assert.equal(readDuration(reloaded), 30);
  assert.deepEqual(readHybrid(reloaded), data.anvi.hybrid);
  // Clearing removes the key, and the server accepts that too.
  data = toggleConversational(writeDuration(data, ""), sectionId);
  assert.equal("durationMinutes" in data.anvi, false);
  assert.deepEqual(data.anvi.hybrid.conversationalSectionIds, []);
  assert.equal("durationMinutes" in normalizeAnvi(data.anvi), false);
  // The mirrored tables match the server.
  const { DURATIONS, DURATION_MAX_QUESTIONS: mirror } = await import("../src/admin/ai-interviews/wizard/settings/hybrid.js");
  assert.deepEqual([...DURATIONS], [...ANVI_DURATIONS]);
  assert.deepEqual({ ...mirror }, { ...DURATION_MAX_QUESTIONS });
});

test("readHybrid drops removed sections and duration guidance matches the server range", () => {
  const data = withQuestions(3);
  assert.deepEqual(readHybrid({ ...data, anvi: { hybrid: { conversationalSectionIds: ["gone", data.sections[0].id] } } }).conversationalSectionIds, [data.sections[0].id]);
  assert.equal(durationGuidance(data, null), null);
  assert.deepEqual(durationGuidance(data, 10), { min: 1, max: 4, planned: 3, warning: "" });
  assert.match(durationGuidance(data, 30).warning, /usually asks 6 to 8/);
  assert.match(durationGuidance(withQuestions(6), 15).warning, /asks at most 5/);
  assert.equal(tabForField("duration"), "advanced");
  assert.equal(tabForField("hybrid"), "advanced");
});

test("audio readiness: ready, failed, queued, off and not yet generated", () => {
  assert.equal(audioReadiness(null).tone, "none");
  assert.equal(audioReadiness({ enabled: false, status: "done" }).tone, "off");
  const ready = audioReadiness({ enabled: true, status: "done", counts: { total: 6, ready: 6, failed: 0 }, assets: { ready: 6, generating: 0, failed: 0 } });
  assert.deepEqual([ready.tone, ready.label, ready.detail], ["ready", "Ready", "6 of 6 clips ready"]);
  const failed = audioReadiness({ enabled: true, status: "partial", counts: { total: 6, ready: 4, failed: 2 }, assets: { ready: 4, generating: 0, failed: 2 } });
  assert.deepEqual([failed.tone, failed.detail], ["failed", "4 of 6 clips ready · 2 failed"]);
  assert.equal(audioReadiness({ enabled: true, status: "pending", counts: { total: 0 } }).tone, "queued");
  assert.equal(audioReadiness({ enabled: true, status: "running", counts: { total: 6, ready: 1 } }).label, "Generating");
  assert.equal(audioReadiness({ enabled: true, status: "inactive" }).tone, "none");
});

// ---- Rendered UI ------------------------------------------------------------

let dom, server, root, createRoot, StepAnviSettings;
const globals = ["window", "document", "navigator", "HTMLElement", "HTMLDialogElement", "IS_REACT_ACT_ENVIRONMENT"];
const original = new Map(globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/admin/ai-interviews/i1/anvi" });
  for (const key of globals.filter((k) => k !== "IS_REACT_ACT_ENVIRONMENT"))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  StepAnviSettings = (await server.ssrLoadModule("/src/admin/ai-interviews/wizard/StepAnviSettings.jsx")).default;
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
const selectFor = (label) => {
  const el = [...document.querySelectorAll("label")].find((l) => l.textContent.trim().startsWith(label));
  return el && document.getElementById(el.htmlFor);
};
async function click(element) {
  assert.ok(element, "Click target exists");
  await act(async () => element.click());
}
async function choose(element, value) {
  assert.ok(element, "Select exists");
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

async function mount(initial, props = {}) {
  const state = { data: initial };
  function Harness() {
    const [data, setData] = useState(initial);
    state.data = data;
    return h(StepAnviSettings, { data, onChange: setData, errors: {}, ...props });
  }
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/admin/ai-interviews/i1/anvi?tab=advanced"] }, h(Harness))));
  await settle();
  return state;
}

test("Advanced tab: duration and the planned-count guidance write the payload; no Live options", async () => {
  const calls = [];
  const audioApi = { status: async (id) => (calls.push(id), null), regenerate: async () => null };
  const state = await mount(withQuestions(3), { audioApi });
  assert.equal(document.querySelector('[data-settings-panel="advanced"]') !== null, true);
  assert.ok(document.querySelector('[data-field="duration"]'), "Interview length card is on Advanced");
  assert.ok(document.querySelector('[data-field="answerTime"]'), "the default answer time is kept");
  assert.equal(document.querySelector('[data-field="interviewer"]'), null, "no interviewer profile picker: ANVI is the interviewer");
  assert.equal(document.querySelector('[data-field="hybrid"]'), null, "no Live options: interviews never open a Live call");
  assert.equal(document.querySelector('[data-field="language"]'), null, "English only: no language control");
  assert.match(document.querySelector('[data-audio-status="unpublished"]').textContent, /after you publish/);
  assert.deepEqual(calls, [], "an unpublished interview never asks for audio status");

  await choose(selectFor("Duration"), "30");
  assert.equal(state.data.anvi.durationMinutes, 30);
  assert.match(document.querySelector("[data-duration-guidance]").textContent, /3 questions planned for 30 minutes \(guidance 6–8\)/);
  assert.match(document.querySelector("[data-duration-warning]").textContent, /may end early/);
  await choose(selectFor("Duration"), "10");
  assert.equal(document.querySelector("[data-duration-warning]"), null, "3 questions suit 10 minutes");

  for (const label of ["Live warm-up", "Conversational questions", "Let students talk freely"])
    assert.equal(switchFor(label), null, `${label} is gone`);
  await choose(selectFor("Duration"), "");
  assert.equal("durationMinutes" in state.data.anvi, false);
});

test("Advanced tab: hybrid status, audio readiness and Regenerate call the API", async () => {
  const calls = [];
  let current = { enabled: true, status: "partial", revision: 2, counts: { total: 5, ready: 3, failed: 2 }, assets: { ready: 3, generating: 0, failed: 2 } };
  const audioApi = {
    status: async (id) => (calls.push(["status", id]), current),
    regenerate: async (id) => {
      calls.push(["regenerate", id]);
      current = { ...current, status: "done", counts: { total: 5, ready: 5, failed: 0 }, assets: { ready: 5, generating: 0, failed: 0 } };
      return current;
    },
  };
  await mount(withQuestions(2), { interviewId: "i1", published: true, audioApi });
  assert.deepEqual(calls, [["status", "i1"]]);
  assert.equal(document.querySelector("[data-hybrid-status]").textContent, "On for this server");
  assert.equal(document.querySelector('[data-audio-status="failed"]').textContent.trim(), "Some clips failed");
  await click(document.querySelector("[data-audio-regenerate]"));
  await settle();
  assert.deepEqual(calls.at(-1), ["regenerate", "i1"]);
  assert.equal(document.querySelector('[data-audio-status="ready"]').textContent.trim(), "Ready");
  assert.match(document.body.textContent, /Question audio is queued/);
});

test("Advanced tab: a rate-limited regenerate and hybrid off are shown plainly", async () => {
  const audioApi = {
    status: async () => ({ enabled: true, status: "done", counts: { total: 2, ready: 2, failed: 0 } }),
    regenerate: async () => { throw new Error("Question audio was requested a moment ago. Try again shortly."); },
  };
  await mount(withQuestions(1), { interviewId: "i1", published: true, audioApi });
  await click(document.querySelector("[data-audio-regenerate]"));
  await settle();
  assert.match(document.body.textContent, /requested a moment ago/);

  await act(async () => root.unmount());
  root = createRoot(document.getElementById("app"));
  await mount(withQuestions(1), { interviewId: "i1", published: true, audioApi: { status: async () => ({ enabled: false }), regenerate: async () => null } });
  assert.match(document.querySelector("[data-hybrid-status]").textContent, /Off on this server/);
  assert.equal(document.querySelector("[data-audio-regenerate]"), null, "nothing to regenerate while ANVI audio is off");
});
