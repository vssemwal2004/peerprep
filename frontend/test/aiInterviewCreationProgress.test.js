import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom, server, root, createRoot, CreationProgress;
const interviewId = "interview-progress-test";
const base = `/admin/ai-interviews/${interviewId}`;
const keys = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"];
const original = new Map(
  keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "http://localhost:5173/admin/ai-interviews",
  });
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
    });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  CreationProgress = (
    await server.ssrLoadModule("/src/admin/ai-interviews/CreationProgress.jsx")
  ).default;
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
  for (const key of keys) {
    if (original.get(key))
      Object.defineProperty(globalThis, key, original.get(key));
    else delete globalThis[key];
  }
});

const completeFields = () => ({
  title: "Backend interview",
  role: "Developer",
  experience: "junior",
  difficulty: "medium",
  rules: { responseSeconds: 120, preparationSeconds: 15, minimumSeconds: 0 },
  interviewer: { displayName: "ANNU" },
  rubric: [{ name: "Clarity", weight: 100 }],
  sections: [
    {
      id: "s1",
      name: "Technical",
      weight: 100,
      groups: [
        {
          id: "g1",
          name: "APIs",
          source: "manual",
          weight: 100,
          questions: [
            {
              id: "q1",
              prompt: "Explain REST",
              subquestions: [],
              followUps: [],
            },
          ],
        },
      ],
    },
  ],
});

function Harness({ current, ...props }) {
  const location = useLocation();
  return h(
    "div",
    null,
    h(CreationProgress, {
      ...props,
      current: current || location.pathname.split("/").at(-1),
    }),
    h("output", { "data-current-route": true }, location.pathname),
  );
}
async function mount(props = {}, path = `${base}/basics`) {
  await act(async () =>
    root.render(h(MemoryRouter, { initialEntries: [path] }, h(Harness, props))),
  );
}
const step = (id) => document.querySelector(`[data-creation-step="${id}"]`);
const line = () => document.querySelector("[data-creation-position]");
const checkmark = (id) => step(id).querySelector("svg");

test("new interview has three steps but no links before the draft is created", async () => {
  await mount({ data: {} });
  const navigation = document.querySelector(
    'nav[aria-label="AI interview creation progress"]',
  );
  assert.ok(navigation);
  assert.equal(navigation.querySelectorAll("ol > li").length, 3);
  assert.equal(navigation.querySelectorAll("a").length, 0);
  assert.equal(
    step("basics")
      .querySelector('[aria-current="step"]')
      .getAttribute("aria-label"),
    "Interview details: Current",
  );
  for (const id of ["sections", "review"]) {
    assert.equal(
      step(id).firstElementChild.getAttribute("aria-disabled"),
      "true",
    );
    assert.equal(
      step(id).firstElementChild.getAttribute("title"),
      "Create the draft to continue",
    );
    assert.equal(checkmark(id), null);
  }
  assert.equal(line().style.width, "0%");
});

test("saved interview step links navigate and identify exactly one current step", async () => {
  await mount({ id: interviewId, data: {} }, `${base}/sections`);
  for (const id of ["basics", "sections", "review"])
    assert.equal(
      step(id).querySelector("a").getAttribute("href"),
      `${base}/${id}`,
    );
  assert.equal(document.querySelectorAll('[aria-current="step"]').length, 1);
  assert.ok(step("sections").querySelector('[aria-current="step"]'));
  await act(async () => step("review").querySelector("a").click());
  assert.equal(
    document.querySelector("[data-current-route]").textContent,
    `${base}/review`,
  );
  assert.ok(step("review").querySelector('[aria-current="step"]'));
  assert.equal(line().style.width, "100%");
  await act(async () => step("basics").querySelector("a").click());
  assert.equal(
    document.querySelector("[data-current-route]").textContent,
    `${base}/basics`,
  );
  assert.ok(step("basics").querySelector('[aria-current="step"]'));
  assert.equal(line().style.width, "0%");
});

for (const [current, width, number] of [
  ["basics", "0%", 1],
  ["sections", "50%", 2],
  ["review", "100%", 3],
]) {
  test(`${current} position is ${width} even with incomplete fields, not a saved-work percentage`, async () => {
    await mount({ id: interviewId, data: {}, current });
    assert.equal(line().style.width, width);
    assert.equal(
      line().closest("[data-creation-track]").getAttribute("aria-hidden"),
      "true",
    );
    assert.match(
      document.querySelector('[aria-live="polite"]').textContent,
      new RegExp(`Step ${number} of 3:`),
    );
    assert.equal(
      document.querySelector('[role="progressbar"]'),
      null,
      "This is a journey indicator, not a completion percentage",
    );
    assert.equal(document.querySelector("[aria-valuenow]"), null);
  });
}

test("visiting review never checkmarks incomplete earlier steps", async () => {
  await mount({ id: interviewId, current: "review", data: {} });
  for (const id of ["basics", "sections"]) {
    assert.equal(step(id).getAttribute("data-step-state"), "incomplete");
    assert.match(
      step(id).querySelector("a").getAttribute("aria-label"),
      /Needs details$/,
    );
    assert.match(step(id).textContent, /Needs details/);
    assert.equal(checkmark(id), null);
  }
  assert.equal(checkmark("review"), null);
});

test("actual filled details and authored questions mark earlier steps ready, not setup complete", async () => {
  await mount({ id: interviewId, current: "review", data: completeFields() });
  for (const id of ["basics", "sections"]) {
    assert.equal(step(id).getAttribute("data-step-state"), "ready");
    assert.match(
      step(id).querySelector("a").getAttribute("aria-label"),
      /Ready$/,
    );
    assert.ok(checkmark(id));
  }
  assert.equal(
    step("review").querySelector("a").getAttribute("aria-label"),
    "Review & finish: Current",
  );
  assert.equal(checkmark("review"), null);
  assert.doesNotMatch(
    document.querySelector('[aria-live="polite"]').textContent,
    /Setup complete/,
  );
});

test("ready details alone cannot checkmark missing topics or questions", async () => {
  const data = completeFields();
  data.sections[0].groups[0].questions = [];
  await mount({ id: interviewId, current: "review", data });
  assert.ok(checkmark("basics"));
  assert.equal(checkmark("sections"), null);
  assert.equal(step("sections").getAttribute("data-step-state"), "incomplete");
});

test("only the explicit validated completion prop completes the final step", async () => {
  await mount({
    id: interviewId,
    current: "review",
    data: completeFields(),
    complete: true,
  });
  assert.equal(
    step("review").querySelector("a").getAttribute("aria-label"),
    "Review & finish: Complete",
  );
  assert.ok(checkmark("review"));
  assert.match(
    document.querySelector('[aria-live="polite"]').textContent,
    /Setup complete\. Not live\./,
  );
});

test("mobile labels stay compact while full accessible names and reduced-motion support remain", async () => {
  await mount({ id: interviewId, data: {}, current: "sections" });
  for (const [id, short, full] of [
    ["basics", "Details", "Interview details"],
    ["sections", "Questions", "Questions & topics"],
    ["review", "Review", "Review & finish"],
  ]) {
    const item = step(id);
    const mobileLabel = [...item.querySelectorAll("span")].find((span) =>
      span.classList.contains("sm:hidden"),
    );
    const desktopLabel = [...item.querySelectorAll("span")].find((span) =>
      span.classList.contains("sm:inline"),
    );
    assert.equal(mobileLabel.textContent, short);
    assert.equal(desktopLabel.textContent, full);
    assert.ok(desktopLabel.classList.contains("hidden"));
    assert.ok(
      item.querySelector("a").getAttribute("aria-label").startsWith(full),
    );
    assert.ok(item.querySelector("a").classList.contains("min-w-0"));
    assert.ok(
      item.querySelector("a").classList.contains("focus-visible:ring-2"),
    );
    assert.ok(
      item
        .querySelector('[aria-hidden="true"]')
        .classList.contains("motion-reduce:transition-none"),
    );
  }
  assert.ok(line().classList.contains("motion-reduce:transition-none"));
  assert.equal(
    document.querySelector('[aria-live="polite"]').getAttribute("aria-atomic"),
    "true",
  );
  const navigation = document.querySelector("nav");
  assert.doesNotMatch(navigation.innerHTML, /min-w-\[|min-width\s*:/);
  assert.equal(navigation.querySelectorAll("ol.grid-cols-3").length, 1);
});
