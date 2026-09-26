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
    data: { ...factory(), title: "Backend interview" },
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
      followUps: 3,
      subquestions: 10,
      plannedQuestionsPerGroup: 50,
    },
  });
  api.resources = async () => ({
    items: [],
    pagination: { page: 1, pages: 1, limit: 25, total: 0 },
  });
  api.saveResource = async (_kind, value) => ({
    ...value,
    _id: "507f1f77bcf86cd799439099",
    revision: 1,
  });
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
async function mount(path = "/admin/ai-interviews") {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [path] },
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
  assert.equal(nav.querySelectorAll("a").length, 4);
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
test("reports opens a truthful placeholder without fetching an interview record", async () => {
  api.get = async () => {
    calls.push(["get"]);
    throw new Error("Reports must not be loaded as an interview ID");
  };
  await mount("/admin/ai-interviews/reports");
  assert.equal(
    document.querySelector("h1").textContent,
    "AI Interview Reports",
  );
  assert.ok(
    document.body.textContent.includes("Reports are not available yet"),
  );
  assert.ok(document.querySelector('[aria-label="Back"]'));
  const nav = document.querySelector('[aria-label="AI interview workspace"]');
  assert.equal(
    nav.querySelector('[aria-current="page"]').textContent,
    "Reports",
  );
  assert.equal(
    calls.length,
    0,
    "Reports placeholder must not call any authoring APIs",
  );
  await click(
    [...document.querySelectorAll("a")].find(
      (link) => link.textContent === "View AI interviews",
    ),
  );
  assert.ok(calls.some(([kind]) => kind === "list"));
});
test("create draft uses a compact form and navigates into the section builder", async () => {
  await mount("/admin/ai-interviews/new");
  assert.ok(document.querySelector('[aria-label="Back"]'));
  assert.ok(document.querySelector('[aria-label="Breadcrumb"]'));
  await type(labeled("Interview title *"), "Graduate practice");
  await click(button("Technical"));
  assert.ok(
    button("Create & add questions")
      .closest("footer")
      .classList.contains("sticky"),
    "Initial creation action remains in the sticky footer",
  );
  await click(button("Create & add questions"));
  const created = calls.find((x) => x[0] === "create");
  assert.equal(created[1].title, "Graduate practice");
  assert.equal(created[1].sections.length, 1);
  assert.ok(created[2]);
  assert.equal(
    document.querySelectorAll(
      '[aria-label="AI interview creation progress"] li',
    ).length,
    3,
  );
  assert.ok(
    !document.querySelector('[aria-label="AI interview workspace"]'),
    "Authoring must not repeat directory navigation",
  );
  assert.ok(button("Add section"));
});
test("new company is persisted and selected in the creation form", async () => {
  await mount("/admin/ai-interviews/new");
  await click(button("Select company"));
  await click(button("Add company"));
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  assert.equal(dialogs.length, 2);
  await type(dialogs.at(-1).querySelector("input"), "Trilok Steel");
  await click(button("Save"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  assert.ok(button("Trilok Steel"));
});
test("manual questions, subquestions and ANNU replacement preserve explicit source boundaries", async () => {
  const s = newSection(),
    g = newGroup();
  s.groups = [g];
  saved.data.sections = [s];
  await mount(`/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}`);
  await click(button("Add question"));
  await type(labeled("Main question *"), "Explain event loops");
  assert.equal(
    labeled("Main question *").closest("dialog").open,
    true,
    "Typing must not collapse the question editor",
  );
  await click(button("Add subquestion"));
  await type(
    document.querySelector('[aria-label="Subquestions 1"]'),
    "What is a microtask?",
  );
  await click(drawerButton("Add question"));
  assert.equal(
    saved.data.sections[0].groups[0].questions.length,
    0,
    "Question remains in the topic draft until Save topic",
  );
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].subquestions.length,
    1,
  );
  await click(
    document.querySelector(
      `a[href="/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}"]`,
    ),
  );
  await click(
    [
      ...document.querySelectorAll('[aria-label="Question source"] button'),
    ].find((x) => x.textContent.includes("ANNU AI")),
  );
  await click(drawerButton("Keep current source"));
  assert.equal(saved.data.sections[0].groups[0].source, "manual");
  await click(
    [
      ...document.querySelectorAll('[aria-label="Question source"] button'),
    ].find((x) => x.textContent.includes("ANNU AI")),
  );
  await click(button("Change source"));
  await type(
    labeled("What should ANNU ask? *"),
    "Assess basic debugging skills.",
  );
  assert.ok(document.body.textContent.includes("not connected yet"));
  await click(button("Save topic"));
  await click(button("Save"));
  const next = saved.data.sections[0].groups[0];
  assert.equal(next.source, "annu");
  assert.equal(next.questions, undefined);
  assert.equal(next.annu.requirements, "Assess basic debugging skills.");
});
test("Library selection imports a snapshot and preview hides answer guidance", async () => {
  const s = newSection(),
    g = newGroup();
  s.groups = [g];
  saved.data.sections = [s];
  await mount(`/admin/ai-interviews/${id}/sections/${s.id}/groups/${g.id}`);
  await click(button("Library"));
  await click(
    [...document.querySelectorAll("dialog[open]")]
      .at(-1)
      .querySelector('input[type="checkbox"]'),
  );
  await click(button("Add selected"));
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].prompt,
    "Explain REST",
  );
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].provenance.libraryQuestionId,
    "lib1",
  );
  await click(link("Preview"));
  assert.ok(document.body.textContent.includes("Explain REST"));
  assert.ok(!document.body.textContent.includes("Admin answer guidance"));
});
test("autosave preserves edits and revision conflicts stop automatic retries", async () => {
  await mount(`/admin/ai-interviews/${id}/basics`);
  await type(labeled("Job role"), "Developer");
  await settle();
  assert.equal(saved.data.role, "Developer");
  failure = Object.assign(new Error("This interview changed elsewhere."), {
    response: { status: 409 },
  });
  await type(labeled("Job role"), "Senior developer");
  await click(button("Save"));
  assert.ok(document.body.textContent.includes("Reload saved version"));
  assert.equal(labeled("Job role").value, "Senior developer");
  const count = calls.filter((x) => x[0] === "save").length;
  await settle();
  assert.equal(calls.filter((x) => x[0] === "save").length, count);
});
test("review validates the saved revision and links to specific missing configuration", async () => {
  await mount(`/admin/ai-interviews/${id}/review`);
  await click(button("Finish setup"));
  assert.equal(calls.find((x) => x[0] === "validate")[1], 1);
  assert.ok(document.body.textContent.includes("Add a job role."));
  assert.equal(link("Fix").getAttribute("aria-label"), "Fix: Add a job role.");
  await click(link("Fix"));
  assert.ok(labeled("Job role"));
});
test("archived interview remains read-only in the builder", async () => {
  saved.lifecycle = "archived";
  await mount(`/admin/ai-interviews/${id}/basics`);
  assert.ok(labeled("Job role").closest("fieldset").disabled);
  assert.ok(!button("Save"));
});

test("delete requires the exact title and copy links remain authenticated admin URLs", async () => {
  await mount();
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click(button("Copy admin link"));
  assert.equal(
    calls.find((x) => x[0] === "clipboard")[1],
    `http://localhost:5173/admin/ai-interviews/${id}/sections`,
  );
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click(button("Delete draft"));
  assert.equal(button("Confirm").disabled, true);
  await type(document.querySelector("dialog input"), saved.title);
  await click(button("Confirm"));
  const sent = calls.find((x) => x[0] === "action");
  assert.equal(sent[2], "delete");
  assert.equal(sent[4].title, saved.title);
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
  await type(labeled("Job role"), "First role");
  await click(button("Save"));
  await type(labeled("Job role"), "Latest role");
  await act(async () => release());
  assert.equal(labeled("Job role").value, "Latest role");
  await click(button("Save"));
  assert.equal(saved.data.role, "Latest role");
  assert.deepEqual(
    calls.filter((x) => x[0] === "save").map((x) => x[1]),
    [1, 2],
  );
});

test("admin completes both question sources and chooses an interviewer through the three-step flow", async () => {
  api.resources = async (kind) => ({
    items:
      kind === "profiles"
        ? [
            {
              _id: "profile1",
              name: "ANNU coach",
              revision: 1,
              active: true,
              data: {
                name: "ANNU coach",
                displayName: "ANNU",
                avatar: "annu",
                tone: "Professional",
                language: "English",
                introduction: "Welcome to your practice interview.",
                closing: "Thank you.",
              },
            },
          ]
        : [],
    pagination: {
      page: 1,
      pages: 1,
      limit: 25,
      total: kind === "profiles" ? 1 : 0,
    },
  });
  api.validate = async (_id, revision) => {
    calls.push(["validate", revision]);
    saved = {
      ...saved,
      revision: revision + 1,
      validation: { complete: true, issues: [] },
    };
    return structuredClone(saved);
  };
  await mount("/admin/ai-interviews/new");
  await type(labeled("Interview title *"), "Graduate software practice");
  await type(labeled("Job role"), "Software engineer");
  await type(labeled("Experience level"), "fresher");
  await type(labeled("Default question difficulty"), "easy");
  await click(button("Technical"));
  await click(button("Create & add questions"));
  await click(button("Add topic"));
  const sourceChoices = [
    ...document.querySelector("dialog[open]").querySelectorAll("button"),
  ];
  await click(
    sourceChoices.find((el) => el.textContent.startsWith("Manual questions")),
  );
  await type(labeled("Topic name *"), "API fundamentals");
  await click(button("Add question"));
  await type(
    labeled("Main question *"),
    "Explain how an API request is processed.",
  );
  await click(button("Add cross-question"));
  await type(
    document.querySelector('[aria-label="Cross-questions 1"]'),
    "How would you handle a timeout?",
  );
  await click(drawerButton("Add question"));
  await click(button("Save topic"));
  await click(button("Add topic"));
  await click(
    [...document.querySelector("dialog[open]").querySelectorAll("button")].find(
      (el) => el.textContent.startsWith("ANNU AI"),
    ),
  );
  await type(labeled("Topic name *"), "Debugging approach");
  await type(
    labeled("What should ANNU ask? *"),
    "Ask about diagnosing slow APIs. Keep questions suitable for a fresher and adapt follow-ups to their answer.",
  );
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(saved.data.sections[0].groups.length, 2);
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].followUps.length,
    1,
  );
  assert.equal(saved.data.sections[0].groups[1].annu.targetCount, 3);
  assert.equal(saved.data.sections[0].groups[1].annu.maxFollowUps, 0);
  assert.equal(saved.data.sections[0].groups[0].weight, 50);
  const sectionSummary = document.querySelector(
    '[data-platform-disclosure="authoring"]',
  ).textContent;
  assert.ok(sectionSummary.includes("1 written"));
  assert.ok(sectionSummary.includes("3 planned"));
  await click(link("Review interview →"));
  await click(
    [...document.querySelectorAll("a")].find((el) =>
      el.textContent.includes("Edit Interviewer & settings"),
    ),
  );
  assert.ok(document.querySelector("dialog[open][data-authoring-drawer]"));
  await click(button("Select interviewer profile"));
  await click(drawerButton("Select"));
  await click(link("Done"));
  await click(button("Finish setup"));
  assert.equal(saved.data.interviewer.displayName, "ANNU");
  assert.ok(document.body.textContent.includes("Setup is complete"));
  assert.ok(document.body.textContent.includes("not published to students"));
  assert.ok(document.body.textContent.includes("have not been generated"));
  assert.equal(calls.filter(([kind]) => kind === "validate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "action").length, 0);
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
  await click(button("Add question"));
  await type(labeled("Main question *"), "Preserve this unsaved question.");
  await click(button("History back"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  await click(button("History forward"));
  assert.equal(labeled("Topic name *").value, "Recovered topic");
  assert.ok(
    document.body.textContent.includes("unsaved changes from this tab"),
  );
  await click(button("Add question"));
  assert.equal(
    labeled("Main question *").value,
    "Preserve this unsaved question.",
  );
  await click(drawerButton("Add question"));
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].prompt,
    "Preserve this unsaved question.",
  );
});

test("a question written before naming a new topic is recoverable after browser navigation", async () => {
  const section = newSection();
  saved.data.sections = [section];
  await mount(`/admin/ai-interviews/${id}/basics`);
  await click(link("Continue to questions →"));
  const startManualTopic = async () => {
    await click(button("Add topic"));
    await click(
      [
        ...document.querySelector("dialog[open]").querySelectorAll("button"),
      ].find((el) => el.textContent.startsWith("Manual questions")),
    );
    await click(button("Add question"));
  };
  await startManualTopic();
  await type(
    labeled("Main question *"),
    "Recover this before the topic has a name.",
  );
  await click(button("History back"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 0);
  await click(button("History forward"));
  await startManualTopic();
  assert.equal(
    labeled("Main question *").value,
    "Recover this before the topic has a name.",
  );
  await click(drawerButton("Add question"));
  await type(labeled("Topic name *"), "Named afterwards");
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(
    saved.data.sections[0].groups[0].questions[0].prompt,
    "Recover this before the topic has a name.",
  );
});

test("archived section disclosures and full topic previews remain usable without mutations", async () => {
  const section = newSection(),
    group = newGroup(),
    question = newQuestion();
  question.prompt = "A complete archived prompt that must remain readable.";
  question.followUps = [
    {
      id: "cross1",
      prompt: "Explain the trade-offs.",
      expectedAnswer: "",
      ruleOverrides: {},
    },
  ];
  group.questions = [question];
  section.groups = [group];
  saved.data.sections = [section, newSection("Behavioral")];
  saved.lifecycle = "archived";
  await mount(`/admin/ai-interviews/${id}/sections`);
  const disclosure = document.querySelector(
    '[data-platform-disclosure="authoring"]',
  );
  assert.equal(disclosure.getAttribute("aria-expanded"), "false");
  await click(disclosure);
  assert.equal(disclosure.getAttribute("aria-expanded"), "true");
  await click(
    document.querySelector(
      `a[href="/admin/ai-interviews/${id}/sections/${section.id}/groups/${group.id}"]`,
    ),
  );
  assert.ok(document.body.textContent.includes(question.prompt));
  assert.ok(document.body.textContent.includes("Explain the trade-offs."));
  assert.ok(!button("Save topic"));
  assert.ok(!button("Add question"));
  assert.equal(calls.filter(([kind]) => kind === "save").length, 0);
});

test("ANNU defaults respect remaining interview capacity and invalid counts cannot be staged", async () => {
  api.capabilities = async () => ({
    limits: {
      sections: 20,
      groups: 10,
      questions: 3,
      followUps: 3,
      subquestions: 10,
      plannedQuestionsPerGroup: 50,
    },
  });
  const section = newSection(),
    group = newGroup();
  group.questions = [newQuestion(), newQuestion()].map((q) => ({
    ...q,
    prompt: "Existing question",
  }));
  section.groups = [group];
  saved.data.sections = [section];
  await mount(`/admin/ai-interviews/${id}/sections`);
  await click(button("Add topic"));
  await click(
    [...document.querySelector("dialog[open]").querySelectorAll("button")].find(
      (el) => el.textContent.startsWith("ANNU AI"),
    ),
  );
  await type(labeled("Topic name *"), "One remaining slot");
  await type(
    labeled("What should ANNU ask? *"),
    "Ask one fundamentals question.",
  );
  const count = [
    ...document
      .querySelector("dialog[open]")
      .querySelectorAll('input[type="number"]'),
  ].find((el) => el.value === "1" && el.min === "1");
  assert.ok(count);
  await type(count, "2");
  await click(button("Save topic"));
  assert.ok(document.querySelector("dialog[open]"));
  assert.ok(document.body.textContent.includes("at most 1 main questions"));
  await type(count, "1");
  await click(button("Save topic"));
  await click(button("Save"));
  assert.equal(saved.data.sections[0].groups[1].annu.targetCount, 1);
  assert.equal(button("Add topic").disabled, true);
});
