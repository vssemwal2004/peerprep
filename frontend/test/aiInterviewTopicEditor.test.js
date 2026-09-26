import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h, useState } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom,
  server,
  root,
  createRoot,
  GroupEditor,
  Drawer,
  factory,
  newQuestion,
  api;
let current, changes, confirmed, discarded, parentClosed, wrapperProps;
const globals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "IS_REACT_ACT_ENVIRONMENT",
];
const originals = new Map(
  globals.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "http://localhost:5173",
  });
  for (const name of globals.filter(
    (name) => name !== "IS_REACT_ACT_ENVIRONMENT",
  )) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: dom.window[name],
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ GroupEditor } = await server.ssrLoadModule(
    "/src/admin/ai-interviews/Editors.jsx",
  ));
  ({ Drawer } = await server.ssrLoadModule("/src/admin/ai-interviews/ui.jsx"));
  const definition = await server.ssrLoadModule(
    "/src/admin/ai-interviews/definition.js",
  );
  factory = definition.newGroup;
  newQuestion = definition.newQuestion;
  api = (await server.ssrLoadModule("/src/admin/ai-interviews/api.js"))
    .interviewApi;
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  changes = [];
  confirmed = [];
  discarded = true;
  parentClosed = 0;
  wrapperProps = {};
  window.confirm = (message) => {
    confirmed.push(message);
    return discarded;
  };
  api.library = async () => ({
    items: [
      {
        _id: "library1",
        questionText: "Explain REST",
        difficulty: "Easy",
        tags: ["API"],
      },
      {
        _id: "library2",
        questionText: "Explain HTTP",
        difficulty: "Medium",
        tags: [],
      },
    ],
    pagination: { page: 1, pages: 1, limit: 25, total: 2 },
  });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom.window.close();
  for (const name of globals) {
    if (originals.get(name))
      Object.defineProperty(globalThis, name, originals.get(name));
    else delete globalThis[name];
  }
});
function Wrapper({
  initial,
  readOnly = false,
  limits = { questions: 200, followUps: 3 },
}) {
  const [group, setGroup] = useState(initial);
  current = group;
  return h(
    Drawer,
    {
      title: "Edit topic",
      onClose: () => {
        parentClosed++;
      },
      // Topic preview contains disclosure controls, not editable fields.
      readOnly: false,
    },
    h(GroupEditor, {
      group,
      limits,
      readOnly,
      onChange: (next) => {
        changes.push(next);
        setGroup(next);
      },
    }),
  );
}
async function mount(initial = factory(), overrides = {}) {
  wrapperProps = { initial, ...overrides };
  await act(async () => root.render(h(Wrapper, wrapperProps)));
}
async function click(element) {
  assert.ok(element, "Click target exists");
  await act(async () => element.click());
}
const button = (name, scope = document) =>
  [...scope.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === name,
  );
const labelled = (name) =>
  [...document.querySelectorAll("label")]
    .find((element) => element.querySelector("span")?.textContent === name)
    ?.querySelector("input,textarea,select");
const activeDrawer = () =>
  [...document.querySelectorAll("dialog[open]")].at(-1);
async function type(element, value) {
  assert.ok(element, "Input exists");
  await act(async () => {
    const prototype =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
test("new questions stay local until saved and reject empty prompts", async () => {
  await mount();
  await click(button("Add question"));
  assert.equal(document.querySelectorAll("dialog[open]").length, 2);
  assert.equal(current.questions.length, 0);
  await click(button("Add question", activeDrawer()));
  assert.match(activeDrawer().textContent, /Write the main question/);
  await type(labelled("Main question *"), "How do you investigate a slow API?");
  assert.equal(changes.length, 0);
  await click(button("Add question", activeDrawer()));
  assert.equal(
    current.questions[0].prompt,
    "How do you investigate a slow API?",
  );
  assert.equal(document.querySelectorAll("dialog[open]").length, 1);
});
test("subquestions and cross-questions retain separate backend semantics", async () => {
  await mount();
  await click(button("Add question"));
  await type(labelled("Main question *"), "Explain caching.");
  await click(button("Add subquestion"));
  await click(button("Add cross-question"));
  await click(button("Add question", activeDrawer()));
  assert.match(activeDrawer().textContent, /Complete each subquestion/);
  await type(
    document.querySelector('[aria-label="Subquestions 1"]'),
    "Which cache would you use?",
  );
  await type(
    document.querySelector('[aria-label="Cross-questions 1"]'),
    "How would you invalidate it?",
  );
  await type(
    labelled("Cross-question 1 guidance (admin only)"),
    "Expect a TTL strategy.",
  );
  await click(button("Add question", activeDrawer()));
  const question = current.questions[0];
  assert.equal(question.subquestions[0].prompt, "Which cache would you use?");
  assert.equal(question.followUps[0].prompt, "How would you invalidate it?");
  assert.equal(question.followUps[0].expectedAnswer, "Expect a TTL strategy.");
  assert.deepEqual(question.followUps[0].ruleOverrides, {});
});
test("cancel and Escape protect unsaved question edits without closing the topic", async () => {
  const question = { ...newQuestion(), prompt: "Original question" };
  await mount({ ...factory(), questions: [question] });
  await click(document.querySelector('[aria-label="Edit question 1"]'));
  await type(labelled("Main question *"), "Unsaved changes");
  discarded = false;
  await act(async () =>
    activeDrawer().dispatchEvent(
      new window.Event("cancel", { bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(document.querySelectorAll("dialog[open]").length, 2);
  assert.equal(parentClosed, 0);
  assert.equal(current.questions[0].prompt, "Original question");
  assert.match(confirmed.at(-1), /Discard your unsaved changes/);
  const unload = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, true);
  discarded = true;
  await click(button("Cancel", activeDrawer()));
  assert.equal(current.questions[0].prompt, "Original question");
  assert.equal(document.querySelectorAll("dialog[open]").length, 1);
});
test("source switching protects authored content and preserves topic settings", async () => {
  await mount({
    ...factory(),
    name: "APIs",
    difficulty: "hard",
    shuffle: true,
    ruleOverrides: { responseSeconds: 90 },
    questions: [{ ...newQuestion(), prompt: "Explain REST" }],
  });
  await click(
    [...document.querySelectorAll("[aria-pressed]")].find((element) =>
      element.textContent.includes("ANNU AI"),
    ),
  );
  assert.match(activeDrawer().textContent, /Change question source/);
  await click(button("Keep current source"));
  assert.equal(current.source, "manual");
  await click(
    [...document.querySelectorAll("[aria-pressed]")].find((element) =>
      element.textContent.includes("ANNU AI"),
    ),
  );
  await click(button("Change source"));
  assert.equal(current.source, "annu");
  assert.equal(current.questions, undefined);
  assert.equal(current.name, "APIs");
  assert.equal(current.difficulty, "hard");
  assert.equal(current.shuffle, true);
  assert.equal(current.ruleOverrides.responseSeconds, 90);
  assert.equal(current.annu.targetCount, 3);
  assert.match(document.body.textContent, /not connected yet/);
  await type(labelled("What should ANNU ask? *"), "Ask about API design.");
  assert.equal(current.annu.requirements, "Ask about API design.");
  assert.equal(
    [...document.querySelectorAll("details")].every((element) => !element.open),
    true,
  );
});
test("question reorder and removal work without entering the editor", async () => {
  await mount({
    ...factory(),
    questions: [
      { ...newQuestion(), prompt: "First" },
      { ...newQuestion(), prompt: "Second" },
    ],
  });
  await click(document.querySelector('[aria-label="Move question 2 up"]'));
  assert.deepEqual(
    current.questions.map((question) => question.prompt),
    ["Second", "First"],
  );
  discarded = false;
  await click(document.querySelector('[aria-label="Remove question 1"]'));
  assert.equal(current.questions.length, 2);
  discarded = true;
  await click(document.querySelector('[aria-label="Remove question 1"]'));
  assert.equal(current.questions[0].prompt, "First");
});
test("Library import snapshots questions and respects available capacity", async () => {
  await mount(factory(), { limits: { questions: 1, followUps: 3 } });
  await click(button("Library"));
  const checks = activeDrawer().querySelectorAll('input[type="checkbox"]');
  await click(checks[0]);
  assert.equal(checks[1].disabled, true);
  await click(button("Add selected"));
  assert.equal(current.questions.length, 1);
  assert.equal(current.questions[0].prompt, "Explain REST");
  assert.equal(current.questions[0].difficulty, "easy");
  assert.equal(current.questions[0].provenance.libraryQuestionId, "library1");
  assert.equal(button("Add question").disabled, true);
  assert.equal(button("Library").disabled, true);
});
test("read-only changes also disable an already open question drawer", async () => {
  await mount();
  await click(button("Add question"));
  await type(labelled("Main question *"), "Cannot save this");
  await act(async () =>
    root.render(h(Wrapper, { ...wrapperProps, readOnly: true })),
  );
  assert.equal(button("Add question", activeDrawer()).disabled, true);
  assert.equal(labelled("Main question *").matches(":disabled"), true);
  await click(button("Add question", activeDrawer()));
  assert.equal(changes.length, 0);
});

test("reopening a new question after route unmount recovers its staged content", async () => {
  const group = factory();
  await mount(group);
  await click(button("Add question"));
  await type(labelled("Main question *"), "Recover this question after Back");
  await act(async () => root.render(null));
  await mount(group);
  await click(button("Add question"));
  assert.equal(
    labelled("Main question *").value,
    "Recover this question after Back",
  );
  assert.match(activeDrawer().textContent, /unsaved question was recovered/);
  assert.equal(current.questions.length, 0);
  await click(button("Add question", activeDrawer()));
  assert.equal(current.questions[0].prompt, "Recover this question after Back");
});

test("read-only topics expose full questions and cross-question guidance without mutations", async () => {
  const question = {
    ...newQuestion(),
    prompt: "Full main question",
    context: "Candidate scenario",
    expectedAnswer: "Expected evidence",
    subquestions: [{ id: "sub-read-only", prompt: "Additional part" }],
    followUps: [
      {
        id: "follow-read-only",
        prompt: "Explain your trade-off",
        expectedAnswer: "Discuss alternatives",
        ruleOverrides: { responseSeconds: 60 },
      },
    ],
  };
  await mount({ ...factory(), questions: [question] }, { readOnly: true });
  const text = activeDrawer().textContent;
  for (const content of [
    "Full main question",
    "Candidate scenario",
    "Additional part",
    "Explain your trade-off",
    "Discuss alternatives",
    "Expected evidence",
    "60 sec",
  ]) {
    assert.ok(text.includes(content), `Read-only preview includes ${content}`);
  }
  assert.equal(button("Add question"), undefined);
  assert.equal(button("Library"), undefined);
  const disclosure = activeDrawer().querySelector("details");
  await click(disclosure.querySelector("summary"));
  assert.equal(disclosure.open, true);
  assert.equal(changes.length, 0);
});

test("a changed question base requires an explicit recovery decision before saving", async () => {
  const question = { ...newQuestion(), prompt: "Original question" };
  const group = { ...factory(), questions: [question] };
  await mount(group);
  await click(document.querySelector('[aria-label="Edit question 1"]'));
  await type(labelled("Main question *"), "Unsaved previous version");
  await act(async () => root.render(null));
  await mount({
    ...group,
    questions: [{ ...question, prompt: "New saved version" }],
  });
  await click(document.querySelector('[aria-label="Edit question 1"]'));
  assert.equal(labelled("Main question *").value, "New saved version");
  assert.equal(button("Save question", activeDrawer()).disabled, true);
  await click(button("Restore unsaved edit", activeDrawer()));
  assert.equal(labelled("Main question *").value, "Unsaved previous version");
  assert.equal(button("Save question", activeDrawer()).disabled, false);
  await click(button("Save question", activeDrawer()));
  assert.equal(current.questions[0].prompt, "Unsaved previous version");
});

test("switching an empty topic to ANNU respects remaining interview capacity", async () => {
  await mount(factory(), {
    limits: { questions: 2, followUps: 3, plannedQuestionsPerGroup: 50 },
  });
  await click(
    [...document.querySelectorAll("[aria-pressed]")].find((element) =>
      element.textContent.includes("ANNU AI"),
    ),
  );
  assert.equal(current.source, "annu");
  assert.equal(current.annu.targetCount, 2);
});

test("ANNU prompt presentation keeps authoring status and a live character count", async () => {
  await mount({
    ...factory(),
    source: "annu",
    questions: undefined,
    annu: {
      requirements: "",
      skills: [],
      exclusions: "",
      targetCount: 3,
      maxFollowUps: 0,
    },
  });
  const panel = document.querySelector("[data-annu-prompt]");
  assert.ok(panel);
  assert.match(panel.textContent, /ANNU AI/);
  assert.match(panel.textContent, /Authoring only/);
  assert.match(panel.textContent, /not connected yet/);
  assert.equal(
    panel.querySelector('[aria-label="ANNU prompt character count"]')
      .textContent,
    "0 / 12,000",
  );
  await type(labelled("What should ANNU ask? *"), "Ask about APIs");
  assert.equal(current.annu.requirements, "Ask about APIs");
  assert.equal(
    panel.querySelector('[aria-label="ANNU prompt character count"]')
      .textContent,
    "14 / 12,000",
  );
  assert.equal(current.annu.targetCount, 3);
  assert.equal(button("Generate questions"), undefined);
  assert.equal(
    [...document.querySelectorAll("details")].every((element) => !element.open),
    true,
  );
});
