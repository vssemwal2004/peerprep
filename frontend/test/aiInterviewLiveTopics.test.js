import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { newDefinition, newQuestion } from "../src/admin/ai-interviews/definition.js";
import {
  addLiveTopic,
  addQuestions,
  estimate,
  isSimple,
  primaryLive,
  removeLiveTopic,
  setLiveQuestionCount,
  setTopicCount,
  updateLiveTopic,
} from "../src/admin/ai-interviews/wizard/structure.js";
import {
  livePlan,
  liveTopicCounts,
  priorityCounts,
  topicBreakdown,
} from "../src/admin/ai-interviews/wizard/livetopics/counts.js";
import { stepErrors } from "../src/admin/ai-interviews/wizard/steps.js";

// React ×3 (High), DBMS ×2 (Medium), OS ×1 (Low) sharing a pool of 6.
function threeTopics(pool = 6) {
  let data = newDefinition();
  for (const [name, priority] of [["React", "high"], ["DBMS", "medium"], ["OS", "low"]])
    ({ data } = addLiveTopic(data, { name, priority, annu: { requirements: `Ask about ${name}.` } }));
  return setLiveQuestionCount(data, pool);
}

// ---- Priority math (mirrors backend priorityCounts) -------------------------
test("priority shares split the pool 3:2:1 by largest remainder", () => {
  assert.deepEqual(priorityCounts(["high", "medium", "low"], 6), [3, 2, 1]);
  assert.deepEqual(priorityCounts(["high", "medium", "low"], 12), [6, 4, 2]);
  // 7 * 3/6 = 3.5, 7 * 2/6 = 2.33, 7 * 1/6 = 1.17: the largest remainder (High) gets the spare one.
  assert.deepEqual(priorityCounts(["high", "medium", "low"], 7), [4, 2, 1]);
  assert.deepEqual(priorityCounts(["medium", "medium"], 5), [3, 2], "ties go to the earlier topic");
  assert.deepEqual(priorityCounts(["low", "high"], 6), [1, 5], "equal remainders go to the higher priority");
  assert.deepEqual(priorityCounts(["low", "high"], 1), [0, 1], "a single question goes to the larger share");
});

test("every topic gets at least one question when the pool covers them all", () => {
  // Raw shares 3:1:1:1 of 4 give High 2 and one Low nothing; the floor moves one back.
  assert.deepEqual(priorityCounts(["high", "low", "low", "low"], 4), [1, 1, 1, 1]);
  assert.deepEqual(priorityCounts(["high", "high", "low"], 3), [1, 1, 1]);
  const short = priorityCounts(["high", "medium", "low", "low"], 3);
  assert.equal(short.reduce((n, c) => n + c, 0), 3);
  assert.deepEqual(short, [1, 1, 1, 0], "with fewer questions than topics the last low one gets none");
  assert.deepEqual(priorityCounts(["high"], 0), [0]);
  assert.deepEqual(priorityCounts([], 5), []);
  assert.deepEqual(priorityCounts(["bogus"], 2), [2], "unknown priorities count as medium");
});

test("explicit counts add on top of the pool and old snapshots keep their numbers", () => {
  let data = threeTopics(6);
  const [react, dbms] = data.sections[0].groups;
  data = setTopicCount(data, dbms.id, 4);
  const counts = liveTopicCounts(data);
  // React and OS share 6 as 3:1 (High, Low); DBMS asks exactly 4 on top.
  assert.deepEqual([counts[react.id], counts[dbms.id]], [5, 4]);
  assert.equal(estimate(data).live, 10);
  // An older interview: numeric targetCount and no pool.
  const old = structuredClone(data);
  delete old.anvi.liveQuestionCount;
  for (const g of old.sections[0].groups) {
    g.annu.targetCount = 3;
    delete g.priority;
  }
  assert.deepEqual(Object.values(liveTopicCounts(old)), [3, 3, 3]);
  const plan = livePlan(old);
  assert.equal(plan.pool, null);
  assert.ok(plan.topics.every((t) => t.explicit === 3 && t.priority === "medium"));
});

test("the plan prefers a server summary that covers every topic", () => {
  const data = threeTopics(6);
  const ids = data.sections[0].groups.map((g) => g.id);
  const plan = livePlan(data);
  assert.equal(plan.total, 6);
  assert.equal(topicBreakdown(plan.topics), "React ×3 (High), DBMS ×2 (Medium), OS ×1 (Low)");
  const server = livePlan(data, { liveTopicCounts: { [ids[0]]: 2, [ids[1]]: 2, [ids[2]]: 2 }, liveQuestionCount: 6 });
  assert.equal(server.fromServer, true);
  assert.deepEqual(server.topics.map((t) => t.count), [2, 2, 2]);
  const partial = livePlan(data, { liveTopicCounts: { [ids[0]]: 9 } });
  assert.equal(partial.fromServer, false, "a stale summary missing a topic is ignored");
  assert.equal(partial.total, 6);
});

// ---- Mapping topics -> live groups -------------------------------------------
test("each topic maps to one annu group with the backend shape and no questions", () => {
  let { data } = addQuestions(newDefinition(), [{ ...newQuestion(), prompt: "Fixed one" }]);
  let id;
  ({ data, groupId: id } = addLiveTopic(data, { name: "React" }));
  assert.equal(data.anvi.liveQuestionCount, 5, "the first pooled topic opens a pool of 5");
  data = updateLiveTopic(data, id, {
    priority: "high",
    difficulty: "hard",
    annu: { requirements: "Hooks and state.", skills: ["Hooks"], maxFollowUps: 2 },
  });
  const group = data.sections[0].groups.find((g) => g.id === id);
  assert.equal(Object.hasOwn(group, "questions"), false);
  const { id: _id, weight, ruleOverrides, shuffle, ...rest } = group;
  assert.equal(typeof _id, "string");
  assert.equal(weight, 50);
  assert.deepEqual(ruleOverrides, {});
  assert.equal(shuffle, false);
  assert.deepEqual(rest, {
    name: "React",
    source: "annu",
    difficulty: "hard",
    priority: "high",
    annu: { requirements: "Hooks and state.", skills: ["Hooks"], exclusions: "", targetCount: null, maxFollowUps: 2 },
  });
  // More topics stay in the same simple section with equal weights.
  ({ data } = addLiveTopic(data, { name: "DBMS" }));
  assert.equal(isSimple(data), true, "many topics plus one fixed group is still simple");
  assert.deepEqual(data.sections[0].groups.map((g) => [g.source, g.weight]), [["manual", 33.33], ["annu", 33.33], ["annu", 33.34]]);
  assert.equal(data.anvi.liveQuestionCount, 5, "a later topic shares the existing pool");
});

test("switching a topic between exact and pooled keeps a pool for pooled topics", () => {
  let data = newDefinition();
  let id;
  ({ data, groupId: id } = addLiveTopic(data, { name: "Old", annu: { requirements: "x", targetCount: 4 } }));
  assert.equal(data.anvi?.liveQuestionCount ?? null, null, "an exact topic needs no pool");
  data = setTopicCount(data, id, null);
  assert.equal(data.anvi.liveQuestionCount, 4, "going back to priority keeps its number as the pool");
  assert.equal(liveTopicCounts(data)[id], 4);
  data = removeLiveTopic(data, id);
  assert.equal(data.anvi.liveQuestionCount, null, "removing the last topic clears the pool");
});

test("Continue points at the first topic still missing what to ask", () => {
  let data = threeTopics(6);
  const dbms = data.sections[0].groups[1];
  data = updateLiveTopic(data, dbms.id, { annu: { requirements: "  " } });
  assert.equal(primaryLive(data).id, dbms.id);
  assert.ok(stepErrors("questions", data).live);
  data = updateLiveTopic(data, dbms.id, { annu: { requirements: "Joins" } });
  assert.deepEqual(stepErrors("questions", data), {});
});

// ---- Rendering: no question list for live topics ------------------------------
let dom, server, root, createRoot, StepQuestions, StepReview;
const globals = ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
const original = new Map(globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const limits = { sections: 20, groups: 10, questions: 200, followUps: 5, subquestions: 10, plannedQuestionsPerGroup: 50 };
const api = {
  generateQuestions: async () => {
    throw new Error("Live topics must never call generateQuestions");
  },
};

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/admin/ai-interviews" });
  for (const key of globals.filter((k) => k !== "IS_REACT_ACT_ENVIRONMENT"))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = () => true;
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const load = async (path) => (await server.ssrLoadModule(path)).default;
  StepQuestions = await load("/src/admin/ai-interviews/wizard/StepQuestions.jsx");
  StepReview = await load("/src/admin/ai-interviews/wizard/StepReview.jsx");
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

let latest;
function Harness({ initial }) {
  const [data, setData] = useState(initial);
  latest = data;
  // The wizard no longer has a side summary panel; the summary lives on Review & publish.
  return h(StepQuestions, { interviewId: "i1", api, data, onChange: setData, limits, errors: {} });
}
const render = (element) => act(async () => root.render(h(MemoryRouter, null, element)));
const click = async (element) => {
  assert.ok(element, "Click target exists");
  await act(async () => element.click());
};
const type = async (element, value) => {
  assert.ok(element, "Input exists");
  await act(async () => {
    const proto = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const button = (text, scope = document) =>
  [...scope.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(text));
const field = (label, scope = document) => {
  const found = [...scope.querySelectorAll("label")].find(
    (el) => el.firstElementChild?.textContent.replace(/\s*\*$/, "").trim() === label,
  );
  return found && document.getElementById(found.htmlFor);
};
const radio = (scope, label) => [...scope.querySelectorAll('[role="radio"]')].find((el) => el.textContent.trim() === label);

test("the topic editor previews the split and never lists live questions", async () => {
  let data = threeTopics(6);
  data.anvi.resume = { mode: "optional", sources: ["builder"], questionCount: 2 };
  await render(h(Harness, { initial: data }));
  const preview = document.querySelector("[data-live-preview]").textContent;
  assert.ok(preview.includes("Each student gets 6 questions from ANVI: React ×3 (High), DBMS ×2 (Medium), OS ×1 (Low)."));
  assert.ok(preview.includes("Questions are generated privately for each student"));
  assert.equal(document.querySelectorAll("[data-live-topic]").length, 3);
  assert.equal(document.querySelectorAll("[data-question-card]").length, 0, "no question cards for live topics");
  assert.ok(document.body.textContent.includes("Questions also use the student's resume."));
  assert.equal(document.querySelector('a[href="/admin/ai-interviews/i1/anvi"]').textContent, "Set in ANVI settings");

  // Raising OS to High re-splits instantly: 6 over shares 3:2:3 is 2.25 / 1.5 / 2.25, so 2 / 2 / 2.
  const os = document.querySelectorAll("[data-live-topic]")[2];
  await click(os.querySelector("[data-topic-toggle]"));
  await click(radio(os, "High"));
  assert.ok(document.querySelector("[data-live-preview]").textContent.includes("React ×2 (High), DBMS ×2 (Medium), OS ×2 (High)"));
  assert.equal(latest.sections[0].groups[2].priority, "high");

  // Too few questions for the topics: a warning with a one-click fix.
  await type(field("Questions per student"), "2");
  assert.ok(document.body.textContent.includes("“DBMS” gets no questions"));
  await click(button("Use 3"));
  assert.equal(latest.anvi.liveQuestionCount, 3);
});

test("a new interview starts a question bank, and an older live topic can still be removed", async () => {
  await render(h(Harness, { initial: newDefinition() }));
  assert.equal(document.querySelector("[data-live-topic]"), null, "no per-student topics for new interviews");
  assert.ok(document.querySelector('[data-start="manual"]') && document.querySelector('[data-start="anvi"]'));

  const { data } = addLiveTopic(newDefinition(), { name: "React", annu: { requirements: "Hooks and state for a fresher." } });
  await render(h(Harness, { key: "older", initial: data }));
  assert.ok(document.body.textContent.includes("Older format: ANVI writes these topics for each student"));
  await click(document.querySelector('[aria-label="Remove topic React"]'));
  assert.equal(latest.sections[0].groups.length, 0);
  assert.equal(latest.anvi.liveQuestionCount, null);
});

test("review and summary show topics and counts but no generated questions", async () => {
  let data = threeTopics(6);
  ({ data } = addQuestions(data, [{ ...newQuestion(), prompt: "Tell me about yourself." }]));
  const ids = data.sections[0].groups.filter((g) => g.source === "annu").map((g) => g.id);
  const summary = { liveTopicCounts: { [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1 }, liveQuestionCount: 6 };
  await render(
    h(StepReview, {
      data,
      issues: [],
      checked: true,
      checking: false,
      onFix() {},
      onRecheck() {},
      onEdit() {},
      published: false,
      justPublished: false,
      interviewId: "i1",
      summary,
    }),
  );
  const card = document.querySelector("[data-live-summary]");
  assert.ok(card.textContent.includes("ANVI creates 6 different questions for every student"));
  assert.ok(card.textContent.includes("plus 1 fixed question everyone gets"));
  assert.ok(card.textContent.includes("Questions are generated privately for each student"));
  const preview = document.getElementById("student-preview");
  assert.equal(preview.querySelectorAll("[data-live-preview-topic]").length, 3);
  assert.ok(preview.textContent.includes("ANVI asks 3 questions about React, written for this student (High priority)"));
  assert.equal(
    [...preview.querySelectorAll("li")].filter((li) => li.textContent.startsWith("Question ")).length,
    1,
    "only the fixed question is listed",
  );
  assert.ok(document.body.textContent.includes("7 (1 from the bank + 6 written by ANVI per student)"));
  assert.ok(document.body.textContent.includes("ANVI topics (older format)"));
});
