import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom,
  server,
  root,
  createRoot,
  Workspace,
  Dismiss,
  api,
  factory,
  newSection,
  newGroup,
  newQuestion,
  calls,
  saved,
  failure;
const id = "507f1f77bcf86cd799439011";
const globals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "IS_REACT_ACT_ENVIRONMENT",
];
const original = new Map(
  globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
);
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "http://localhost:5173/admin/ai-interviews",
  });
  for (const key of globals.filter((k) => k !== "IS_REACT_ACT_ENVIRONMENT"))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = () => true;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        calls.push(["clipboard", text]);
      },
    },
  });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  Workspace = (
    await server.ssrLoadModule(
      "/src/admin/ai-interviews/AIInterviewWorkspace.jsx",
    )
  ).default;
  Dismiss = (
    await server.ssrLoadModule("/src/components/PopupDismissManager.jsx")
  ).default;
  api = (await server.ssrLoadModule("/src/admin/ai-interviews/api.js"))
    .interviewApi;
  const definition = await server.ssrLoadModule(
    "/src/admin/ai-interviews/definition.js",
  );
  factory = definition.newDefinition;
  newSection = definition.newSection;
  newGroup = definition.newGroup;
  newQuestion = definition.newQuestion;
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  calls = [];
  failure = null;
  saved = {
    _id: id,
    revision: 1,
    lifecycle: "draft",
    title: "Backend interview",
    data: { ...factory(), title: "Backend interview", interviewer: profileSnapshot() },
    validation: { complete: false },
    summary: {},
    history: [],
    updatedAt: "2026-09-25T10:00:00Z",
  };
  api.list = async (values) => {
    calls.push(["list", values]);
    return {
      items: [saved],
      pagination: {
        page: values.page,
        limit: values.limit,
        total: 5000,
        pages: 200,
      },
    };
  };
  api.get = async () => structuredClone(saved);
  api.capabilities = async () => ({
    limits: {
      sections: 20,
      groups: 10,
      questions: 200,
      followUps: 5,
      subquestions: 10,
      plannedQuestionsPerGroup: 50,
    },
  });
  api.resources = async () => ({
    items: [],
    pagination: { page: 1, pages: 1, limit: 25, total: 0 },
  });
  api.saveResource = async (kind, value) => {
    calls.push(["saveResource", kind, structuredClone(value)]);
    return {
      ...value,
      _id: "507f1f77bcf86cd799439099",
      revision: 1,
    };
  };
  api.companyCatalog = async () => ({ companies: ["Infosys", "Trilok Steel Works"] });
  api.create = async (data, key) => {
    calls.push(["create", data, key]);
    saved.data = structuredClone(data);
    return saved;
  };
  api.save = async (_id, revision, data) => {
    calls.push(["save", revision, structuredClone(data)]);
    if (failure) throw failure;
    saved = {
      ...saved,
      revision: revision + 1,
      data: structuredClone(data),
      validation: { complete: false },
    };
    return structuredClone(saved);
  };
  api.validate = async (_id, revision) => {
    calls.push(["validate", revision]);
    saved = {
      ...saved,
      revision: revision + 1,
      validation: {
        complete: false,
        issues: [{ path: "basics", message: "Add a job role." }],
      },
    };
    return structuredClone(saved);
  };
  api.action = async (...args) => {
    calls.push(["action", ...args]);
    return saved;
  };
  api.library = async () => ({
    items: [{ _id: "lib1", questionText: "Explain REST", tags: ["API"] }],
    pagination: { page: 1, pages: 1, limit: 25, total: 1 },
  });
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
const button = (text) =>
  [...document.querySelectorAll("button")].find(
    (x) => x.textContent.trim() === text,
  );
const drawerButton = (text) =>
  [
    ...[...document.querySelectorAll("dialog[open]")]
      .at(-1)
      .querySelectorAll("button"),
  ].find((x) => x.textContent.trim() === text);
const link = (text) =>
  [...document.querySelectorAll("a")].find(
    (x) => x.textContent.trim() === text,
  );
async function click(element) {
  assert.ok(element, "Click target exists");
  await act(async () =>
    element.dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true }),
    ),
  );
  assert.ok(element.isConnected);
  await act(async () => element.click());
}
async function type(element, value) {
  assert.ok(element, "Input exists");
  await act(async () => {
    const proto =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : element.tagName === "SELECT"
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(
      new window.Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
const labeled = (label) =>
  [...document.querySelectorAll("label")]
    .find((x) => x.querySelector("span")?.textContent === label)
    ?.querySelector("input,textarea,select");
// The interviewer snapshot a saved interview carries once a profile is chosen.
function profileSnapshot() {
  return {
    profileId: "507f1f77bcf86cd799439088",
    profileRevision: 1,
    name: "ANVI",
    displayName: "ANVI",
    avatar: "annu",
    tone: "Professional",
    language: "English",
    introduction: "",
    closing: "",
  };
}
async function mount(path = "/admin/ai-interviews") {
  const entries = Array.isArray(path) ? path : [path];
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: entries, initialIndex: entries.length - 1 },
        h(Dismiss),
        h(HistoryControls),
        h(
          Routes,
          null,
          h(Route, { path: "/admin/ai-interviews/*", element: h(Workspace) }),
        ),
      ),
    ),
  );
}
function HistoryControls() {
  const navigate = useNavigate();
  return h(
    "div",
    null,
    h("button", { onClick: () => navigate(-1) }, "History back"),
    h("button", { onClick: () => navigate(1) }, "History forward"),
  );
}
async function settle(ms = 1300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
test("directory has one secondary navigation, URL pagination and working action dropdown", async () => {
  await mount();
  const nav = document.querySelector('[aria-label="AI interview workspace"]');
  assert.equal(nav.querySelectorAll("a").length, 5);
  assert.ok(!nav.textContent.includes("Drafts"));
  assert.ok(
    document.body.textContent.includes("5000") ||
      document.body.textContent.includes("5,000"),
  );
  await click(document.querySelector('[aria-label="Next page"]'));
  assert.equal(calls.filter((x) => x[0] === "list").at(-1)[1].page, 2);
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click(button("Archive"));
  assert.ok(document.querySelector("dialog[open]"));
  assert.equal(calls.filter((x) => x[0] === "action").length, 0);
  await click(button("Confirm"));
  assert.equal(calls.find((x) => x[0] === "action")[2], "archive");
});
test("reports lists ANVI attempts, filters them and opens the scored report with re-evaluation", async () => {
  api.get = async () => {
    calls.push(["get"]);
    throw new Error("Reports must not be loaded as an interview ID");
  };
  const { reportApi } = await server.ssrLoadModule(
    "/src/admin/ai-interviews/api.js",
  );
  const reportCalls = [];
  const row = {
    attemptId: "a1",
    student: { name: "Asha Verma", email: "asha@example.com", studentId: "GEU-101" },
    interviewId: "i1",
    interviewTitle: "Backend round",
    status: "ready",
    partial: false,
    startedAt: "2026-10-22T10:00:00Z",
    overall: { score: 7.5, max: 10, percent: 75, band: "Good" },
  };
  const detail = {
    ...row,
    title: "Backend round",
    endedAt: "2026-10-22T10:20:00Z",
    eval: { modelId: "m", promptVersion: "anvi-eval-v1", calls: 1, history: [] },
    overall: { ...row.overall, partial: false, answered: 1, total: 1, strengths: ["Clear definition"], improvements: [] },
    bySection: [],
    byCompetency: [],
    actionItems: ["Explain caching with an example."],
    items: [{
      qid: "q1", n: 1, questionText: "Explain REST.", answerText: "REST is stateless.", status: "answered",
      expectedAnswer: "AUTHORED stateless answer", expectedKeyPoints: ["Stateless"], matched: ["Stateless"], partial: [], missed: [],
      marks: 7.5, maxMarks: 10, percentCorrect: 75, feedback: "You explained it.",
    }],
  };
  reportApi.list = async (values) => {
    reportCalls.push(["list", { ...values }]);
    return {
      attempts: [row],
      interviews: [{ id: "i1", title: "Backend round" }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    };
  };
  reportApi.get = async (attemptId) => {
    reportCalls.push(["get", attemptId]);
    return detail;
  };
  reportApi.reEvaluate = async (attemptId) => {
    reportCalls.push(["reEvaluate", attemptId]);
    return { ...detail, status: "evaluating", pendingWork: { status: "pending" } };
  };
  await mount("/admin/ai-interviews/reports");
  await settle(20);
  assert.equal(
    document.querySelector("h1").textContent,
    "AI Interview Reports",
  );
  assert.ok(document.querySelector('[aria-label="Back"]'));
  const nav = document.querySelector('[aria-label="AI interview workspace"]');
  assert.equal(
    nav.querySelector('[aria-current="page"]').textContent,
    "Reports",
  );
  assert.equal(calls.length, 0, "Reports must not call any authoring APIs");
  assert.ok(document.body.textContent.includes("Asha Verma"));
  assert.ok(document.body.textContent.includes("7.5 / 10"));
  assert.ok(document.body.textContent.includes("Report ready"));
  await type(document.querySelector('[aria-label="Filter by status"]'), "failed");
  await settle(20);
  assert.equal(reportCalls.filter(([kind]) => kind === "list").at(-1)[1].status, "failed");

  await click(document.querySelector('[aria-label="View report for Asha Verma"]'));
  await settle(20);
  assert.deepEqual(reportCalls.find(([kind]) => kind === "get"), ["get", "a1"]);
  const drawer = document.querySelector("dialog[open]");
  assert.ok(drawer.textContent.includes("AI-generated — may contain mistakes."));
  assert.ok(drawer.querySelector('[role="tablist"]'));
  await click([...drawer.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes("Question-wise")));
  assert.ok(drawer.textContent.includes("AUTHORED stateless answer"), "admins see the authored answer");
  await click(drawerButton("Re-evaluate"));
  await settle(20);
  assert.deepEqual(reportCalls.find(([kind]) => kind === "reEvaluate"), ["reEvaluate", "a1"]);
  assert.ok(document.querySelector("dialog[open]").textContent.includes("Evaluating"));
});
// ---- Wizard helpers -------------------------------------------------------
// A wizard field by its visible label (the required asterisk is ignored).
const field = (label) => {
  const found = [...document.querySelectorAll("label")].find(
    (el) => el.firstElementChild?.textContent.replace(/\s*\*$/, "").trim() === label,
  );
  if (!found) return undefined;
  return found.htmlFor
    ? document.getElementById(found.htmlFor)
    : found.querySelector("input,textarea,select");
};
const radio = (group, label) => {
  const container = [...document.querySelectorAll('[role="radiogroup"]')].find(
    (el) =>
      document
        .getElementById(el.getAttribute("aria-labelledby"))
        ?.textContent.replace(/\s*\*$/, "")
        .trim() === group,
  );
  assert.ok(container, `Radio group ${group} exists`);
  return [...container.querySelectorAll('[role="radio"]')].find((el) =>
    el.textContent.trim().startsWith(label),
  );
};
const buttonStarting = (text) =>
  [...document.querySelectorAll("button")].find((x) =>
    x.textContent.trim().startsWith(text),
  );
const settingsTab = (id) => document.querySelector(`[role="tab"][data-settings-tab="${id}"]`);
const selectedSettingsTab = () =>
  document.querySelector('[role="tab"][data-settings-tab][aria-selected="true"]')?.dataset.settingsTab;
const currentStep = () =>
  document.querySelector('[aria-label="Interview setup steps"] [aria-current="step"]')
    ?.closest("[data-wizard-step]")
    ?.getAttribute("data-wizard-step");
const cards = () => [...document.querySelectorAll("[data-question-card]")];
const switchFor = (label) =>
  document.querySelector(`[role="switch"][aria-label="${label}"]`);
async function key(element, value) {
  assert.ok(element, "Key target exists");
  await act(async () =>
    element.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true })),
  );
}
// Types into a combobox, waits for its suggestions, then clicks the option whose text starts with `option`.
const options = (label) =>
  [...(document.getElementById(field(label).getAttribute("aria-controls"))?.querySelectorAll('[role="option"]') || [])];
async function pick(label, text, option = text) {
  await click(field(label));
  await type(field(label), text);
  await settle(260);
  const target = options(label).find((el) => el.textContent.trim().startsWith(option));
  assert.ok(target, `Option ${option} is listed for ${label}`);
  await click(target);
}
const simpleSection = (questions = []) => {
  const section = { ...newSection(), name: "Interview", weight: 100 };
  section.groups = [{ ...newGroup(), name: "Questions", weight: 100, questions }];
  return section;
};
const q = (prompt, extra = {}) => ({ ...newQuestion(), prompt, ...extra });
const validated = (issues) => async (_id, revision) => {
  calls.push(["validate", revision]);
  saved = {
    ...saved,
    revision: revision + 1,
    validation: {
      complete: issues.length === 0,
      issues,
      validatedRevision: revision + 1,
    },
  };
  return structuredClone(saved);
};

// ---- Step 1: Basics and creation -----------------------------------------
test("create starts at Basics, flags required fields, then creates the draft with a default interviewer", async () => {
  await mount("/admin/ai-interviews/new");
  assert.ok(document.querySelector('[aria-label="Breadcrumb"]').textContent.includes("AI Interviews"));
  assert.equal(currentStep(), "basics");
  assert.equal(
    document.querySelector('[data-wizard-step="questions"] button').getAttribute("aria-disabled"),
    "true",
    "Later steps wait until the draft exists",
  );
  assert.ok(button("Continue").closest("footer").classList.contains("sticky"));
  await click(button("Continue"));
  assert.equal(calls.filter(([kind]) => kind === "create").length, 0);
  for (const message of [
    "Choose or add the interview name.", "Choose or add the job role this interview is for.",
    "Choose or add the company this interview is for.", "Choose an experience level.", "Choose a difficulty.",
  ])
    assert.ok(document.body.textContent.includes(message), message);
  assert.equal(document.querySelector('[data-field="jobName"]'), null, "No separate job name: the interview name is the job");
  assert.ok(document.activeElement === field("Interview name"), "Focus moves to the first invalid field");
  assert.equal(field("Interview name").getAttribute("aria-invalid"), "true");

  await pick("Interview name", "backend dev", "Backend Developer");
  assert.equal(field("Interview name").value, "Backend Developer", "The interview name is picked from the job names");
  await pick("Job role", "Software engineer", "Add “Software engineer”");
  assert.deepEqual(
    calls.find(([kind, resource]) => kind === "saveResource" && resource === "jobRoles").slice(1),
    ["jobRoles", { name: "Software engineer" }],
    "A job role that is not listed is saved for every admin",
  );
  await pick("Company", "Infosys");
  await click(radio("Experience level", "Fresher"));
  await click(radio("Difficulty", "Easy"));
  await key(radio("Difficulty", "Easy"), "ArrowRight");
  assert.equal(radio("Difficulty", "Medium").getAttribute("aria-checked"), "true", "Arrow keys move the selection");
  assert.ok(document.activeElement === radio("Difficulty", "Medium"));
  assert.equal(document.querySelector('[data-field="mode"]'), null, "One interview format: no Practice/Mock choice");
  assert.equal(document.querySelector('[data-field="language"]'), null, "Interviews are English only: no language picker");
  assert.ok(document.querySelector('[data-field="description"] label').textContent.includes("Optional"), "Only the description is optional");
  await type(field("Short description"), "Campus placement practice.");
  assert.ok(!document.body.textContent.includes("Choose or add the interview name."));
  await click(button("Continue"));
  const [, created, idempotencyKey] = calls.find(([kind]) => kind === "create");
  assert.equal(created.title, "Backend Developer");
  assert.equal(created.jobName, undefined);
  assert.equal(created.role, "Software engineer");
  assert.equal(created.companyName, "Infosys");
  assert.equal(created.experience, "fresher");
  assert.equal(created.difficulty, "medium");
  assert.equal(created.description, "Campus placement practice.");
  assert.equal(created.rules.mode, "mock");
  assert.equal(created.rules.language, "English");
  assert.deepEqual(created.anvi.language, { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" });
  assert.equal(created.interviewer.displayName, "ANVI");
  assert.equal(created.interviewer.profileId, "507f1f77bcf86cd799439099");
  assert.match(idempotencyKey, /^[a-zA-Z0-9_-]{8,100}$/);
  assert.deepEqual(created.rubric.map((r) => [r.name, r.weight]), [
    ["Knowledge", 40],
    ["Communication", 30],
    ["Problem solving", 30],
  ]);
  assert.equal(currentStep(), "questions", "Creation continues to Questions");
  assert.ok(document.querySelector('[data-start="manual"]') && document.querySelector('[data-start="anvi"]'));
  assert.ok(!document.querySelector('[aria-label="AI interview workspace"]'), "The wizard has no directory navigation");
});
test("Company lists PeerPrep's catalog, and a new company is added and selected in Basics", async () => {
  await mount("/admin/ai-interviews/new");
  await click(field("Company"));
  await settle(260);
  assert.deepEqual(options("Company").map((el) => el.textContent.trim()), ["Infosys", "Trilok Steel Works"]);
  await pick("Company", "Infosys");
  assert.deepEqual(calls.filter(([kind]) => kind === "saveResource").at(-1).slice(1), ["companies", { name: "Infosys" }],
    "A catalog company becomes the admin's own entry so the interview can reference it");
  assert.equal(field("Company").value, "Infosys");
  assert.ok(document.body.textContent.includes("ANVI tailors questions to this company."));

  await pick("Company", "Trilok Steel", "Add “Trilok Steel”");
  assert.deepEqual(calls.filter(([kind]) => kind === "saveResource").at(-1).slice(1), ["companies", { name: "Trilok Steel" }]);
  assert.equal(field("Company").value, "Trilok Steel");
  await click(document.querySelector('[aria-label="Clear company"]'));
  assert.equal(field("Company").value, "");
});
test("typed text that is neither picked nor added is discarded", async () => {
  await mount("/admin/ai-interviews/new");
  await pick("Interview name", "data", "Data Analyst");
  await click(field("Interview name"));
  await type(field("Interview name"), "Something else");
  await key(field("Interview name"), "Escape");
  assert.equal(field("Interview name").value, "Data Analyst");
});

// ---- Step 2: Questions ------------------------------------------------------
test("Write manually adds editable cards into the question bank, with topic, level, type and follow-ups", async () => {
  await mount(`/admin/ai-interviews/${id}/questions`);
  assert.ok(document.querySelector('[data-start="anvi"]').textContent.includes("Generate with ANVI"));
  assert.equal(document.querySelector("[data-live-topic]"), null, "New interviews have no per-student topics");
  assert.equal(buttonStarting("Advanced"), undefined, "No section editor for a simple interview");
  await click(document.querySelector('[data-start="manual"]'));
  assert.equal(cards().length, 1);
  assert.ok(document.activeElement === field("Question"), "The new card is focused");
  await type(field("Question"), "Explain the event loop.");
  await type(field("Expected answer / key points"), "Call stack\nTask queue");
  await type(field("Topic"), "JavaScript");
  await type(field("Difficulty"), "medium");
  await type(field("Type"), "Technical");
  await click(document.querySelector('[aria-label="Increase follow-ups"]'));
  await click(button("Add follow-up"));
  await type(document.querySelector('[aria-label="Prepared follow-up 1"]'), "Where do promises run?");
  await type(field("Marks"), "20");
  await type(field("Max answer time"), "180");
  await click(switchFor("Students can skip this question"));
  await settle();
  const [section] = saved.data.sections;
  assert.equal(saved.data.sections.length, 1);
  assert.deepEqual([section.name, section.weight], ["Interview", 100]);
  assert.deepEqual(
    section.groups.map((g) => [g.name, g.source, g.weight, g.shuffle, g.byTopic, g.pick]),
    [["Questions", "manual", 100, true, true, null]],
    "The bank asks topic by topic in a per-student order by default",
  );
  const [question] = section.groups[0].questions;
  assert.equal(question.prompt, "Explain the event loop.");
  assert.equal(question.expectedAnswer, "Call stack\nTask queue");
  assert.deepEqual([question.competency, question.difficulty, question.category], ["JavaScript", "medium", "Technical"]);
  assert.equal(question.followUpLimit, 2, "Starts from the default of 1 follow-up");
  assert.equal(question.maxFollowUps, 0);
  assert.deepEqual(question.followUps.map((f) => f.prompt), ["Where do promises run?"]);
  assert.equal(question.marks, 20);
  assert.deepEqual(question.ruleOverrides, { responseSeconds: 180 });
  assert.equal(question.skippable, false);
  // The wizard has no side summary panel; Review & publish shows the totals.
  assert.equal(document.querySelector('[aria-label="Interview summary"]'), null);

  await click(button("Done"));
  assert.ok(cards()[0].textContent.includes("Manual"));
  assert.ok(cards()[0].textContent.includes("Medium"));
  assert.ok(cards()[0].textContent.includes("20 marks"));
  assert.ok(document.querySelector('[aria-label="Topic: JavaScript"]'), "The bank is listed by topic");
  await click(document.querySelector('[aria-label="Duplicate question 1"]'));
  assert.equal(cards().length, 2);
  await click(button("Add question"));
  await type(field("Question"), "What is a closure?");
  await type(field("Topic"), "JavaScript");
  await click(document.querySelector('[aria-label="Move question 3 up"]'));
  assert.ok(cards()[1].textContent.includes("What is a closure?"));
  await click(document.querySelector('[aria-label="Delete question 1"]'));
  assert.equal(cards().length, 2);
  assert.ok(document.body.textContent.includes("Question 1 deleted."));
  await click(button("Undo"));
  assert.equal(cards().length, 3);
  assert.ok(cards()[0].textContent.includes("Explain the event loop."));
  await click(document.querySelector('[aria-label="Delete question 3"]'));
  await settle();
  assert.deepEqual(
    saved.data.sections[0].groups[0].questions.map((x) => x.prompt),
    ["Explain the event loop.", "What is a closure?"],
  );
});
test("What each student gets: all questions or a balanced random set, topic by topic", async () => {
  saved.data.sections = [simpleSection(["DSA", "DSA", "DSA", "DBMS"].map((topic, i) => q(`Question ${i + 1}?`, { competency: topic })))];
  Object.assign(saved.data.sections[0].groups[0], { shuffle: true, byTopic: true });
  await mount(`/admin/ai-interviews/${id}/questions`);
  const bank = document.querySelector("[data-question-bank]");
  assert.ok(bank.textContent.includes("Question bank (4)"));
  assert.ok(bank.textContent.includes("2 topics"));
  assert.equal(radio("Questions per student", "All 4").getAttribute("aria-checked"), "true");
  await click(radio("Questions per student", "A random set"));
  assert.equal(field("Questions each student is asked").value, "2");
  await click(document.querySelector('[aria-label="Increase questions each student is asked"]'));
  await settle();
  assert.equal(saved.data.sections[0].groups[0].pick, 3);
  assert.ok(bank.textContent.includes("30 marks per student"), "Totals are what one student gets");
  await click(switchFor("Ask topic by topic, in a different order for each student"));
  await settle();
  assert.deepEqual([saved.data.sections[0].groups[0].shuffle, saved.data.sections[0].groups[0].byTopic], [false, false]);
  await click(radio("Questions per student", "All 4"));
  await settle();
  assert.equal(saved.data.sections[0].groups[0].pick, null);
});
test("Continue on Questions flags empty cards and an empty interview", async () => {
  await mount(`/admin/ai-interviews/${id}/questions`);
  await click(button("Continue"));
  assert.equal(currentStep(), "questions");
  assert.ok(document.body.textContent.includes("Add at least one question: write it yourself or generate questions with ANVI."));
  await click(document.querySelector('[data-start="manual"]'));
  await click(button("Done"));
  await click(button("Continue"));
  assert.ok(document.body.textContent.includes("Write the question, or delete this card."));
  assert.ok(document.activeElement === field("Question"), "The empty card reopens with focus");
  await type(field("Question"), "Describe a project you are proud of.");
  await click(button("Continue"));
  assert.equal(currentStep(), "anvi");
});
test("Generate with ANVI drafts a reviewable bank by topic, type, difficulty and follow-ups", async () => {
  api.generateQuestions = async (interviewId, body) => {
    calls.push(["generate", interviewId, body]);
    return {
      questions: [
        {
          prompt: "What is normalisation?", expectedAnswer: "Remove redundancy\nNormal forms", keyPoints: [],
          topic: "DBMS", difficulty: "easy", category: "Technical", followUpLimit: 2, followUps: ["Why does it matter?", "What is 3NF?"],
        },
        {
          prompt: "Explain a deadlock.", expectedAnswer: "Circular wait", keyPoints: [],
          topic: "Operating Systems", difficulty: "hard", category: "Technical", followUpLimit: 2, followUps: ["How do you prevent it?"],
        },
      ],
    };
  };
  await mount(`/admin/ai-interviews/${id}/questions`);
  await click(document.querySelector('[data-start="anvi"]'));
  const panel = document.querySelector("[data-generate-panel]");
  assert.ok(panel);
  await click(button("Generate questions"));
  assert.ok(panel.textContent.includes("Add at least one topic."));
  assert.equal(calls.filter(([kind]) => kind === "generate").length, 0);
  await click(button("+ DBMS"));
  await type(field("Topics"), "Operating Systems");
  await key(field("Topics"), "Enter");
  assert.ok(document.querySelector('[aria-label="Remove Operating Systems"]'));
  await click(radio("Difficulty", "Mixed"));
  await type(field("Number of questions"), "2");
  await click(document.querySelector('[aria-label="Increase follow-ups per question"]'));
  await type(field("Anything else ANVI should know"), "Placement level.");
  await click(button("Generate questions"));
  const [, sentId, body] = calls.find(([kind]) => kind === "generate");
  assert.equal(sentId, id);
  assert.deepEqual(body, {
    mode: "pool", topics: ["DBMS", "Operating Systems"], category: "Technical", difficulty: "mixed", count: 2, followUps: 2,
    requirements: "Placement level.",
  });
  assert.ok(document.body.textContent.includes("Added 2 questions from ANVI."));
  assert.equal(cards().length, 2);
  assert.ok(cards().every((card) => card.textContent.includes("AI")));
  assert.ok(document.querySelector('[aria-label="Topic: DBMS"]') && document.querySelector('[aria-label="Topic: Operating Systems"]'));
  await click(cards()[0].querySelector("[data-question-toggle]"));
  await type(field("Question"), "What is database normalisation?");
  await settle();
  const questions = saved.data.sections[0].groups[0].questions;
  assert.deepEqual(
    questions.map((x) => [x.prompt, x.competency, x.difficulty, x.category, x.followUpLimit, x.followUps.map((f) => f.prompt), x.provenance.generated]),
    [
      ["What is database normalisation?", "DBMS", "easy", "Technical", 2, ["Why does it matter?", "What is 3NF?"], true],
      ["Explain a deadlock.", "Operating Systems", "hard", "Technical", 2, ["How do you prevent it?"], true],
    ],
  );
  assert.ok(!Number.isNaN(Date.parse(questions[0].provenance.generatedAt)));
});
test("generation explains a server without ANVI configured and adds nothing", async () => {
  api.generateQuestions = async () => {
    throw Object.assign(new Error("Set GEMINI_API_KEY on the backend before generating questions."), {
      response: { status: 503, data: { code: "AI_NOT_CONFIGURED" } },
    });
  };
  await mount(`/admin/ai-interviews/${id}/questions`);
  await click(document.querySelector('[data-start="anvi"]'));
  await click(button("+ DBMS"));
  await click(button("Generate questions"));
  assert.ok(document.body.textContent.includes("ANVI isn't set up on the server yet"));
  assert.equal(cards().length, 0);
  await settle();
  assert.equal(calls.filter(([kind]) => kind === "save").length, 0);
});
test("an older interview's per-student topics stay editable behind a cost notice", async () => {
  const live = {
    ...newGroup(), name: "HTTP caching", weight: 50, source: "annu", questions: undefined, priority: "medium",
    annu: { requirements: "Ask about HTTP caching.", skills: [], exclusions: "", targetCount: 2, maxFollowUps: 1 },
  };
  saved.data.sections = [simpleSection([q("Explain REST.")])];
  saved.data.sections[0].groups[0].weight = 50;
  saved.data.sections[0].groups.push(live);
  await mount(`/admin/ai-interviews/${id}/questions`);
  assert.ok(document.body.textContent.includes("Older format: ANVI writes these topics for each student"));
  assert.ok(document.querySelector("[data-live-topic]"));
  assert.equal(cards().length, 1, "Only the bank question has a card");
  await click(button("Continue"));
  assert.equal(currentStep(), "anvi");
});
test("an older multi-section interview loads grouped by section with Advanced open", async () => {
  const technical = { ...newSection("Technical"), name: "Technical round", weight: 60 };
  technical.groups = [
    { ...newGroup(), name: "APIs", weight: 50, questions: [q("Explain REST."), q("What is idempotency?")] },
    {
      ...newGroup(),
      name: "Debugging",
      weight: 50,
      source: "annu",
      questions: undefined,
      annu: { requirements: "Ask about debugging.", skills: [], exclusions: "", targetCount: 3, maxFollowUps: 0 },
    },
  ];
  const behavioral = { ...newSection("Behavioral"), name: "HR round", weight: 40 };
  behavioral.groups = [{ ...newGroup(), name: "Teamwork", weight: 100, questions: [q("Tell me about a conflict.")] }];
  saved.data.sections = [technical, behavioral];
  await mount(`/admin/ai-interviews/${id}/questions`);
  assert.ok(document.querySelector('section[aria-label="Section: Technical round"]'));
  assert.ok(document.querySelector('section[aria-label="Section: HR round"]'));
  assert.equal(buttonStarting("Advanced").getAttribute("aria-expanded"), "true");
  assert.ok(button("Add section"), "The section editor is open for power users");
  assert.equal(cards().length, 3);
  assert.ok(cards()[2].textContent.includes("Tell me about a conflict."));
  assert.equal(cards()[2].querySelector('[aria-hidden="true"]').textContent, "3", "Numbering runs across sections");
  assert.ok(document.body.textContent.includes("ANVI asks 3 different questions to each student"));
  assert.ok(
    document.querySelector('[data-live-topic]').textContent.includes("Exact number"),
    "An older topic's numeric count shows as an exact number",
  );
  await settle();
  assert.equal(calls.filter(([kind]) => kind === "save").length, 0, "Loading never rewrites the structure");
});
test("old builder links open the matching wizard step", async () => {
  await mount([`/admin/ai-interviews/${id}/sections`, `/admin/ai-interviews/${id}/interviewer`]);
  assert.equal(currentStep(), "anvi");
  await click(button("History back"));
  assert.equal(currentStep(), "questions");
  assert.ok(button("Add section"), "The old sections link opens the section editor");
});

// ---- Step 3: ANVI settings ---------------------------------------------------
test("ANVI settings save into data.anvi: one voice, its speed, and a rubric total check", async () => {
  saved.data.role = "Backend developer";
  saved.data.interviewer = null;
  saved.data.sections = [simpleSection([q("Explain REST.")])];
  // An older Hinglish draft with a Hindi voice locale: converted to English when next saved.
  saved.data.rules = { ...saved.data.rules, language: "Hinglish" };
  saved.data.anvi = { ...saved.data.anvi, voice: { name: "Aoede", languageCode: "hi-IN" }, language: { primary: "Hinglish", studentChoice: ["English"], strict: false, onOtherLanguage: "ignore" } };
  await mount(`/admin/ai-interviews/${id}/anvi`);
  assert.equal(selectedSettingsTab(), "voice", "Voice & speed opens first");
  assert.deepEqual([...document.querySelectorAll('[role="tab"][data-settings-tab]')].map((el) => el.dataset.settingsTab), ["voice", "candidate", "proctoring", "scoring", "advanced"]);
  assert.equal(document.querySelector('[data-field="language"]'), null, "no language card");
  assert.match(document.querySelector("[data-anvi-voice]").textContent, /One natural voice for every interview, in Indian English/);
  assert.equal(document.querySelector('[role="radiogroup"]'), null, "no voice, tone or pace pickers");
  assert.equal(field("Introduction script"), undefined, "no scripts: the intro and closing are fixed");
  assert.equal(document.querySelector('[aria-label="Interview summary"]'), null, "ANVI settings use the full width, without the summary panel");
  await type(document.getElementById("anvi-speech-rate"), "1.1");
  assert.equal(settingsTab("voice").title, "ANVI's voice · 1.10× speed");
  await click(switchFor("Short acknowledgements"));
  await click(settingsTab("advanced"));
  assert.equal(document.querySelector("[data-anvi-voice]"), null, "Only the selected tab is rendered");
  await type(field("Default answer time"), "180");

  await click(settingsTab("scoring"));
  await type(field("Weight for Knowledge"), "50");
  assert.ok(document.body.textContent.includes("Weights add up to 110%"));
  assert.ok(settingsTab("scoring").querySelector("[data-tab-error]"), "The Scoring tab shows a red dot");
  await click(settingsTab("advanced"));
  await click(button("Continue"));
  assert.equal(currentStep(), "anvi", "An invalid rubric blocks Continue");
  assert.equal(selectedSettingsTab(), "scoring", "Continue opens the tab holding the error");
  assert.ok(document.activeElement.closest('[data-field="rubric"]'), "and focuses the rubric");
  await click(button("Split evenly"));
  assert.equal(settingsTab("scoring").querySelector("[data-tab-error]"), null);
  assert.ok(document.querySelector("[data-rubric-total]").textContent.includes("100%"));
  await settle();
  assert.deepEqual(saved.data.anvi.persona, {
    tone: "warm",
    pace: "normal",
    acknowledgements: false,
    introduction: "",
    closing: "",
    speechRate: 1.1,
  });
  assert.deepEqual(saved.data.anvi.turns, { silenceSeconds: 2, nudgeSeconds: 45, maxNudges: 2, voiceCommands: true }, "turn-taking is fixed");
  assert.deepEqual(saved.data.anvi.voice, { name: "Aoede", languageCode: "en-IN" });
  assert.equal(saved.data.rules.language, "English", "the older Hinglish draft is saved as English");
  assert.deepEqual(saved.data.anvi.language, { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" });
  assert.equal(saved.data.rules.responseSeconds, 180);
  assert.equal(Math.round(saved.data.rubric.reduce((sum, r) => sum + r.weight, 0) * 100) / 100, 100);
  assert.equal(saved.data.interviewer.displayName, "ANVI", "A default interviewer is assigned automatically");
  await click(button("Continue"));
  assert.equal(currentStep(), "review");
});

test("ANVI settings open the sub-tab in ?tab= and Fix links open the tab holding the field", async () => {
  saved.data.sections = [simpleSection([q("Explain REST.")])];
  await mount(`/admin/ai-interviews/${id}/anvi?tab=proctoring`);
  assert.equal(selectedSettingsTab(), "proctoring");
  assert.ok(document.querySelector('[data-field="proctoring"]'));
  assert.equal(settingsTab("proctoring").querySelector("[data-tab-status]"), null, "no On badge while off");
  assert.equal(document.querySelector("[data-settings-panel-title]").textContent, "Proctoring");
  assert.equal(settingsTab("advanced").title, "No fixed length");
  api.validate = validated([{ path: "interviewer", message: "Add an interviewer." }]);
  await click(document.querySelector('[data-wizard-step="review"] button'));
  await settle(20);
  await click(document.querySelector('[aria-label="Fix: ANVI isn\'t set up for this interview yet. Open Advanced and try again."]'));
  assert.equal(currentStep(), "anvi");
  assert.equal(selectedSettingsTab(), "advanced", "The interviewer Fix opens Advanced");
});

// ---- Step 4: Review & publish --------------------------------------------------
test("review checklist maps server issues to friendly messages and Fix jumps to the field", async () => {
  const section = simpleSection([q("")]);
  const group = section.groups[0];
  saved.data.sections = [section];
  api.validate = validated([
    { path: "basics", message: "Add a job role." },
    { path: `sections/${section.id}/groups/${group.id}`, message: "Question 1: Add the main question." },
    { path: "rules", message: "Weights must total 100%." },
  ]);
  await mount(`/admin/ai-interviews/${id}/review`);
  await settle(20);
  assert.equal(calls.filter(([kind]) => kind === "validate").length, 1, "Review checks the saved revision");
  const readiness = document.querySelector("[data-readiness]").textContent;
  assert.ok(readiness.includes("3 things to fix before publishing"));
  assert.ok(readiness.includes("Add the job role this interview is for."));
  assert.ok(readiness.includes("Question 1 is empty. Write it, or delete the card."));
  assert.ok(readiness.includes("Scoring rubric weights must add up to 100%."));
  await click(document.querySelector('[aria-label="Fix: Add the job role this interview is for."]'));
  assert.equal(currentStep(), "basics");
  assert.ok(document.activeElement === field("Job role"), "Fix focuses the job role");
  assert.ok(document.body.textContent.includes("Choose or add the job role this interview is for."));
  await click(document.querySelector('[data-wizard-step="review"] button'));
  assert.equal(calls.filter(([kind]) => kind === "validate").length, 1, "An unchanged revision is not rechecked");
  await click(document.querySelector('[aria-label="Fix: Question 1 is empty. Write it, or delete the card."]'));
  assert.equal(currentStep(), "questions");
  assert.ok(document.activeElement === field("Question"), "The card opens with its question focused");
  await click(document.querySelector('[data-wizard-step="review"] button'));
  await click(document.querySelector('[aria-label="Fix: Scoring rubric weights must add up to 100%."]'));
  assert.equal(currentStep(), "anvi");
  assert.equal(selectedSettingsTab(), "scoring", "Fix opens the Scoring tab");
  assert.ok(document.activeElement.closest('[data-field="rubric"]'));
});
test("publish validates, explains a missing AI key, then publishes and offers next steps", async () => {
  Object.assign(saved.data, { role: "Engineer", experience: "junior", difficulty: "medium" });
  saved.data.sections = [simpleSection([q("Explain REST.", { expectedAnswer: "SECRET key point" })])];
  api.validate = validated([]);
  let attempts = 0;
  api.action = async (...args) => {
    calls.push(["action", ...args]);
    const [, action, revision] = args;
    if (action === "publish" && attempts++ === 0)
      throw Object.assign(new Error("Set GEMINI_API_KEY on the backend before making AI interviews available."), {
        response: { status: 503, data: { code: "AI_NOT_CONFIGURED" } },
      });
    saved =
      action === "publish"
        ? {
            ...saved,
            revision: revision + 1,
            publishedAt: "2026-10-22T10:00:00Z",
            publishedRevision: revision + 1,
            validation: { ...saved.validation, validatedRevision: revision + 1 },
          }
        : { ...saved, revision: revision + 1, publishedAt: undefined, publishedRevision: undefined };
    return structuredClone(saved);
  };
  await mount(`/admin/ai-interviews/${id}/review`);
  await settle(20);
  assert.ok(document.body.textContent.includes("Everything looks good. Ready to publish."));
  assert.equal(document.querySelector("[data-interview-status]").textContent, "Ready to publish");
  assert.equal(document.querySelector('[aria-label="Interview summary"]'), null, "Review shows the summary itself");
  const hero = () => document.querySelector("[data-review-hero]");
  assert.ok(hero().textContent.includes("Backend interview") && hero().textContent.includes("Ready to publish"));
  const ring = () => Number(/(\d+)%/.exec(hero().querySelector("[data-readiness-ring]").getAttribute("aria-label"))[1]);
  assert.ok(ring() > 0 && ring() < 100, "not 100% before publishing");
  assert.equal(hero().querySelector("a"), null, "Assign to students waits for publishing");
  assert.ok(document.querySelector("[data-review-kpis]").textContent.includes("Total marks"));
  assert.ok(document.querySelector('[data-review-checklist] [data-summary-step="check"]'));
  const preview = document.querySelector("#student-preview").textContent;
  assert.ok(preview.includes("Explain REST."));
  assert.ok(!preview.includes("SECRET key point"), "Students never see expected answers");
  await click(button("Publish interview"));
  assert.deepEqual(calls.find(([kind]) => kind === "action").slice(1, 4), [id, "publish", 2]);
  assert.ok(document.body.textContent.includes("ANVI isn't configured on the server yet"));
  assert.equal(calls.filter(([kind]) => kind === "validate").length, 1, "A current validation is reused");
  await click(document.querySelector("[data-hero-publish]"));
  assert.ok(document.querySelector("[data-publish-success]").textContent.includes("Students can now find it under AI Interviews."));
  assert.equal(ring(), 100, "published: the checklist is complete");
  assert.ok(hero().querySelector('a[href*="/schedules/new?interviewId="]'), "the hero offers Assign to students");
  assert.ok(link("View in directory"));
  assert.match(link("Assign to students").getAttribute("href"), /\/admin\/ai-interviews\/schedules\/new\?interviewId=/);
  assert.equal(document.querySelector("[data-interview-status]").textContent, "Published");
  assert.ok(link("Done"));
  await click(document.querySelector('[aria-label="Actions for Backend interview"]'));
  await click(button("Unpublish"));
  await click(drawerButton("Unpublish"));
  assert.equal(calls.filter(([kind]) => kind === "action").at(-1)[2], "unpublish");
  assert.notEqual(document.querySelector("[data-interview-status]").textContent, "Published");
  assert.ok(button("Publish interview"), "It can be published again");
});

test("Review shows what ANVI says, the bank selection, length and AI budget; an unready server shows a notice", async () => {
  api.capabilities = async () => ({
    limits: { sections: 20, groups: 10, questions: 200, followUps: 5, subquestions: 10, plannedQuestionsPerGroup: 50 },
    runtime: { mode: "hybrid", ready: false, missing: ["ANVI_USD_INR_RATE", "ANVI_PRICE_TTS_AUDIO_OUTPUT"] },
  });
  Object.assign(saved.data, { role: "Engineer", experience: "junior", difficulty: "medium" });
  saved.data.sections = [simpleSection(["DSA", "DSA", "DBMS", "DBMS"].map((topic, i) => q(`Question ${i + 1}?`, { competency: topic, followUpLimit: 1 })))];
  Object.assign(saved.data.sections[0].groups[0], { shuffle: true, byTopic: true, pick: 2 });
  saved.data.anvi = { ...saved.data.anvi, durationMinutes: 30 };
  api.validate = validated([]);
  await mount(`/admin/ai-interviews/${id}/review`);
  await settle(20);
  assert.match(document.querySelector("[data-runtime-missing]").textContent, /ANVI_USD_INR_RATE, ANVI_PRICE_TTS_AUDIO_OUTPUT/);
  const preview = document.querySelector("#student-preview").textContent;
  assert.ok(preview.includes("Hello, and welcome. I am ANVI"), "the fixed intro students hear");
  assert.ok(preview.includes("how are you feeling today"));
  assert.ok(preview.includes("That brings us to the end of the interview."));
  assert.ok(!preview.includes("Priya"), "no sample-name script");
  assert.match(document.querySelector("[data-preview-selection]").textContent, /Each student is asked 2 of these 4 questions, balanced by topic and difficulty, topic by topic in their own order\./);
  const kpis = document.querySelector("[data-review-kpis]").textContent;
  assert.ok(kpis.includes("Interview length") && kpis.includes("30 min"));
  assert.ok(kpis.includes("AI budget per student") && kpis.includes("Up to ₹18"));
  assert.ok(document.body.textContent.includes("2 of 4, balanced by topic and difficulty"));
  assert.ok(document.body.textContent.includes("Topic by topic, a different order for each student"));
  assert.ok(document.body.textContent.includes("4 questions · 2 topics"));
});

// ---- Autosave, archive and directory ---------------------------------------------
test("autosave preserves edits and revision conflicts stop automatic retries", async () => {
  await mount(`/admin/ai-interviews/${id}/basics`);
  await type(field("Short description"), "Developer");
  assert.equal(document.querySelector("[data-save-status]").textContent, "Saving…");
  await settle();
  assert.equal(saved.data.description, "Developer");
  assert.equal(document.querySelector("[data-save-status]").textContent, "All changes saved");
  failure = Object.assign(new Error("This interview changed elsewhere."), {
    response: { status: 409 },
  });
  await type(field("Short description"), "Senior developer");
  await settle();
  assert.ok(document.body.textContent.includes("Reload saved version"));
  assert.ok(document.querySelector("[data-save-status]").textContent.includes("Changed elsewhere"));
  assert.equal(field("Short description").value, "Senior developer");
  const count = calls.filter((x) => x[0] === "save").length;
  await settle();
  assert.equal(calls.filter((x) => x[0] === "save").length, count);
});
test("a failed save offers a retry", async () => {
  await mount(`/admin/ai-interviews/${id}/basics`);
  failure = new Error("Network down");
  await type(field("Short description"), "Developer");
  await settle();
  assert.ok(document.querySelector("[data-save-status]").textContent.includes("Couldn't save"));
  failure = null;
  await click(button("Retry"));
  assert.equal(saved.data.description, "Developer");
});
test("edits made during an in-flight autosave survive the older response", async () => {
  let release;
  api.save = async (_id, revision, data) => {
    const snapshot = structuredClone(data);
    calls.push(["save", revision, snapshot]);
    if (!release)
      await new Promise((resolve) => {
        release = resolve;
      });
    saved = { ...saved, revision: revision + 1, data: snapshot };
    return structuredClone(saved);
  };
  await mount(`/admin/ai-interviews/${id}/basics`);
  await type(field("Short description"), "First role");
  await settle();
  await type(field("Short description"), "Latest role");
  await act(async () => release());
  assert.equal(field("Short description").value, "Latest role");
  await settle();
  assert.equal(saved.data.description, "Latest role");
  assert.deepEqual(
    calls.filter((x) => x[0] === "save").map((x) => x[1]),
    [1, 2],
  );
});
test("archived interviews are read-only on every step and can be restored", async () => {
  saved.lifecycle = "archived";
  await mount(`/admin/ai-interviews/${id}/basics`);
  assert.ok(field("Job role").closest("fieldset").disabled);
  assert.equal(document.querySelector("[data-interview-status]").textContent, "Archived");
  assert.ok(document.body.textContent.includes("Archived — read only"));
  await click(document.querySelector('[data-wizard-step="anvi"] button'));
  assert.equal(settingsTab("candidate").disabled, false, "Sub-tabs stay usable when read-only");
  assert.ok(document.getElementById("anvi-speech-rate").disabled);
  await click(settingsTab("candidate"));
  assert.ok(radio("Ask for the student's resume", "Off").closest("fieldset").disabled);
  await click(document.querySelector('[data-wizard-step="review"] button'));
  assert.equal(button("Publish interview").disabled, true);
  assert.equal(calls.filter(([kind]) => kind === "save" || kind === "validate").length, 0);
  await click(button("Restore"));
  await click(drawerButton("Restore"));
  assert.equal(calls.find(([kind]) => kind === "action")[2], "restore");
});
test("delete requires the exact title and copy links remain authenticated admin URLs", async () => {
  await mount();
  assert.ok(link("Create interview"), "The page header offers Create interview");
  assert.ok(document.querySelector("[data-interview-status]").textContent.includes("Draft"));
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click(button("Copy admin link"));
  assert.equal(
    calls.find((x) => x[0] === "clipboard")[1],
    `http://localhost:5173/admin/ai-interviews/${id}/basics`,
  );
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click(button("Delete draft"));
  assert.match(document.querySelector("dialog").textContent, /linked schedules.*completed attempts and reports/i);
  assert.equal(button("Confirm").disabled, true);
  await type(document.querySelector("dialog input"), saved.title);
  await click(button("Confirm"));
  const sent = calls.find((x) => x[0] === "action");
  assert.equal(sent[2], "delete");
  assert.equal(sent[4].title, saved.title);
});

// ---- Advanced: the section editor keeps working inside the Questions step ----------
test("manual questions, subquestions and ANVI replacement preserve explicit source boundaries", async () => {
  const s = newSection(),
    g = newGroup();
  s.groups = [g];
  saved.data.sections = [s];
  await mount(`/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}`);
  await click(button("Add question"));
  await type(labeled("Main question *"), "Explain event loops");
  assert.equal(labeled("Main question *").closest("dialog").open, true, "Typing must not collapse the question editor");
  await click(button("Add subquestion"));
  await type(document.querySelector('[aria-label="Subquestions 1"]'), "What is a microtask?");
  await click(drawerButton("Add question"));
  assert.equal(saved.data.sections[0].groups[0].questions.length, 0, "Question remains in the topic draft until Save topic");
  await click(button("Save topic"));
  await settle();
  assert.equal(saved.data.sections[0].groups[0].questions[0].subquestions.length, 1);
  assert.ok(cards()[0].textContent.includes("Explain event loops"), "Section edits show in the flat list");
  await click(document.querySelector(`a[href="/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}"]`));
  const source = () =>
    [...document.querySelectorAll('[aria-label="Question source"] button')].find((x) => x.textContent.includes("ANVI AI"));
  await click(source());
  await click(drawerButton("Keep current source"));
  assert.equal(saved.data.sections[0].groups[0].source, "manual");
  await click(source());
  await click(button("Change source"));
  await type(labeled("What should ANVI ask? *"), "Assess basic debugging skills.");
  assert.ok(document.body.textContent.includes("available interview"));
  await click(button("Save topic"));
  await settle();
  const next = saved.data.sections[0].groups[0];
  assert.equal(next.source, "annu");
  assert.equal(next.questions, undefined);
  assert.equal(next.annu.requirements, "Assess basic debugging skills.");
});
test("Library selection imports a snapshot and the student preview hides answer guidance", async () => {
  api.library = async () => ({
    items: [{ _id: "lib1", questionText: "Explain REST", tags: ["API"], questionData: { expectedAnswer: "HIDDEN guidance" } }],
    pagination: { page: 1, pages: 1, limit: 25, total: 1 },
  });
  const s = newSection(),
    g = newGroup();
  s.groups = [g];
  saved.data.sections = [s];
  await mount(`/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}`);
  await click(button("Library"));
  await click([...document.querySelectorAll("dialog[open]")].at(-1).querySelector('input[type="checkbox"]'));
  await click(button("Add selected"));
  await click(button("Save topic"));
  await settle();
  const [question] = saved.data.sections[0].groups[0].questions;
  assert.equal(question.prompt, "Explain REST");
  assert.equal(question.provenance.libraryQuestionId, "lib1");
  assert.ok(cards()[0].textContent.includes("Library"));
  await click(document.querySelector('[data-wizard-step="review"] button'));
  const preview = document.querySelector("#student-preview").textContent;
  assert.ok(preview.includes("Explain REST"));
  assert.ok(!preview.includes("HIDDEN guidance"));
});
test("canceling a new topic creates nothing and returning with browser history recovers staged edits", async () => {
  const section = newSection(),
    group = newGroup();
  section.groups = [group];
  saved.data.sections = [section];
  await mount(`/admin/ai-interviews/${id}/sections`);
  await click(button("Add topic"));
  await click(drawerButton("Cancel"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  assert.equal(saved.data.sections[0].groups.length, 1);
  const topicHref = `/admin/ai-interviews/${id}/sections/${section.id}/groups/${group.id}`;
  await click(document.querySelector(`a[href="${topicHref}"]`));
  await type(labeled("Topic name *"), "Recovered topic");
  await click(drawerButton("Add question"));
  await type(labeled("Main question *"), "Preserve this unsaved question.");
  await click(button("History back"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  await click(button("History forward"));
  assert.equal(labeled("Topic name *").value, "Recovered topic");
  assert.ok(document.body.textContent.includes("unsaved changes from this tab"));
  await click(drawerButton("Add question"));
  assert.equal(labeled("Main question *").value, "Preserve this unsaved question.");
  await click(drawerButton("Add question"));
  await click(button("Save topic"));
  await settle();
  assert.equal(saved.data.sections[0].groups[0].questions[0].prompt, "Preserve this unsaved question.");
});
test("a question written before naming a new topic is recoverable after browser navigation", async () => {
  saved.data.sections = [newSection()];
  await mount([`/admin/ai-interviews/${id}/basics`, `/admin/ai-interviews/${id}/sections`]);
  const startManualTopic = async () => {
    await click(button("Add topic"));
    await click(
      [...document.querySelector("dialog[open]").querySelectorAll("button")].find((el) =>
        el.textContent.startsWith("Manual questions"),
      ),
    );
    await click(drawerButton("Add question"));
  };
  await startManualTopic();
  await type(labeled("Main question *"), "Recover this before the topic has a name.");
  await click(button("History back"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  assert.equal(currentStep(), "basics");
  await click(button("History forward"));
  await startManualTopic();
  assert.equal(labeled("Main question *").value, "Recover this before the topic has a name.");
  await click(drawerButton("Add question"));
  await type(labeled("Topic name *"), "Named afterwards");
  await click(button("Save topic"));
  await settle();
  assert.equal(saved.data.sections[0].groups[0].questions[0].prompt, "Recover this before the topic has a name.");
});
test("archived section disclosures and full topic previews remain usable without mutations", async () => {
  const section = newSection(),
    group = newGroup(),
    question = newQuestion();
  question.prompt = "A complete archived prompt that must remain readable.";
  question.followUps = [{ id: "cross1", prompt: "Explain the trade-offs.", expectedAnswer: "", ruleOverrides: {} }];
  group.questions = [question];
  section.groups = [group];
  saved.data.sections = [section, newSection("Behavioral")];
  saved.lifecycle = "archived";
  await mount(`/admin/ai-interviews/${id}/sections`);
  const disclosure = document.querySelector('[data-platform-disclosure="authoring"]');
  assert.equal(disclosure.getAttribute("aria-expanded"), "false");
  await click(disclosure);
  assert.equal(disclosure.getAttribute("aria-expanded"), "true");
  await click(document.querySelector(`a[href="/admin/ai-interviews/${id}/sections/${section.id}/groups/${group.id}"]`));
  assert.ok(document.body.textContent.includes(question.prompt));
  assert.ok(document.body.textContent.includes("Explain the trade-offs."));
  assert.ok(!button("Save topic"));
  assert.ok(!button("Add question"));
  assert.equal(calls.filter(([kind]) => kind === "save").length, 0);
});
test("ANVI topic defaults respect remaining interview capacity and invalid counts cannot be staged", async () => {
  api.capabilities = async () => ({
    limits: { sections: 20, groups: 10, questions: 3, followUps: 5, subquestions: 10, plannedQuestionsPerGroup: 50 },
  });
  const section = newSection(),
    group = newGroup();
  group.questions = [newQuestion(), newQuestion()].map((x) => ({ ...x, prompt: "Existing question" }));
  section.groups = [group];
  saved.data.sections = [section];
  await mount(`/admin/ai-interviews/${id}/sections`);
  await click(button("Add topic"));
  await click(
    [...document.querySelector("dialog[open]").querySelectorAll("button")].find((el) => el.textContent.startsWith("ANVI AI")),
  );
  await type(labeled("Topic name *"), "One remaining slot");
  await type(labeled("What should ANVI ask? *"), "Ask one fundamentals question.");
  const count = [...document.querySelector("dialog[open]").querySelectorAll('input[type="number"]')].find(
    (el) => el.value === "1" && el.min === "1",
  );
  assert.ok(count);
  await type(count, "2");
  await click(button("Save topic"));
  assert.ok(document.querySelector("dialog[open]"));
  assert.ok(document.body.textContent.includes("at most 1 main questions"));
  await type(count, "1");
  await click(button("Save topic"));
  await settle();
  assert.equal(saved.data.sections[0].groups[1].annu.targetCount, 1);
  assert.equal(button("Add topic").disabled, true);
  assert.equal(button("Add question").disabled, true, "The flat list respects the same limit");
});
test("generate & review in a section topic drafts questions and converts the topic after confirmation", async () => {
  const section = newSection(),
    group = {
      ...newGroup(),
      name: "Debugging",
      source: "annu",
      questions: undefined,
      difficulty: "medium",
      annu: { requirements: "Ask about debugging slow APIs.", skills: ["Profiling", " "], exclusions: "", targetCount: 3, maxFollowUps: 2 },
    };
  section.groups = [group];
  saved.data.sections = [section];
  let reply = {
    questions: [
      { prompt: "How would you find a slow endpoint?", expectedAnswer: "Measure latency\nUse tracing", keyPoints: [] },
      { prompt: "What causes N+1 queries?", expectedAnswer: "ORM lazy loading", keyPoints: [] },
      { prompt: "How do you profile memory?", expectedAnswer: "Heap snapshots", keyPoints: [] },
    ],
  };
  api.generateQuestions = async (interviewId, body) => {
    calls.push(["generate", interviewId, body]);
    return structuredClone(reply);
  };
  await mount(`/admin/ai-interviews/${id}/sections/${section.id}/groups/${group.id}`);
  const modes = document.querySelector("[data-annu-mode]");
  assert.match(modes.textContent, /New questions for each student/);
  await click(document.querySelector("[data-generate-review]"));
  const dialog = () => [...document.querySelectorAll("dialog[open]")].at(-1);
  assert.equal(button("Use these questions").disabled, true);
  await click([...dialog().querySelectorAll("button")].find((b) => b.textContent.trim() === "Generate questions"));
  const [, sentId, body] = calls.find(([kind]) => kind === "generate");
  assert.equal(sentId, id);
  assert.deepEqual(body, {
    groupId: group.id,
    count: 3,
    requirements: "Ask about debugging slow APIs.",
    skills: ["Profiling"],
    difficulty: "medium",
  });
  await type(dialog().querySelector('[aria-label="Question 1 text"]'), "How would you find the slowest endpoint?");
  await click(dialog().querySelector('[aria-label="Remove question 3"]'));
  reply = { questions: [{ prompt: "Explain connection pool exhaustion.", expectedAnswer: "Too few connections", keyPoints: [] }] };
  await click(dialog().querySelector('[aria-label="Regenerate question 2"]'));
  await click(button("Use these questions (2)"));
  await click(button("Replace with these questions"));
  await click(button("Save topic"));
  await settle();
  const next = saved.data.sections[0].groups[0];
  assert.equal(next.source, "manual");
  assert.equal(next.annu, undefined);
  assert.deepEqual(
    next.questions.map((x) => [x.kind, x.prompt, x.expectedAnswer, x.maxFollowUps, x.marks]),
    [
      ["specific", "How would you find the slowest endpoint?", "Measure latency\nUse tracing", 2, 10],
      ["specific", "Explain connection pool exhaustion.", "Too few connections", 2, 10],
    ],
  );
  assert.ok(next.questions.every((x) => x.provenance.generated === true));
});
