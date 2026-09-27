import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom,
  server,
  root,
  createRoot,
  Studio,
  api,
  calls,
  doc,
  capabilities,
  saveFailure;
let id;
let fixtureNumber = 0;
const path = "/admin/ai-interviews/avatars";
const keys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "File",
  "IS_REACT_ACT_ENVIRONMENT",
];
const original = new Map(
  keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
const urlOriginals = [URL.createObjectURL, URL.revokeObjectURL];
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "http://localhost:5173",
  });
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
    });
  window.confirm = () => true;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  URL.createObjectURL = () => "blob:avatar-test";
  URL.revokeObjectURL = () => {};
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  Studio = (
    await server.ssrLoadModule(
      "/src/admin/ai-interviews/avatars/AvatarStudio.jsx",
    )
  ).default;
  api = (await server.ssrLoadModule("/src/admin/ai-interviews/avatars/api.js"))
    .avatarApi;
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  // Tab-memory recovery is intentional. Independent fixtures must not share
  // an avatar identity and accidentally recover another test's unsaved draft.
  id = (++fixtureNumber).toString(16).padStart(24, "0");
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  calls = [];
  saveFailure = null;
  delete window.MediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
  capabilities = {
    storage: { ready: true },
    renderer: { configured: true, available: true },
    languages: [
      { value: "en", label: "English" },
      { value: "hi", label: "Hindi" },
      { value: "hinglish", label: "Hinglish (experimental)" },
    ],
    voices: [{ value: "default", label: "Default voice" }],
    limits: { maxUploadMB: 25, maxIntroSeconds: 60 },
    tts: { configured: true },
    stt: { configured: true },
    gemini: { configured: true },
  };
  doc = {
    _id: id,
    revision: 1,
    active: true,
    data: {
      name: "Annu",
      role: "Technical interviewer",
      description: "",
      language: "en",
      introduction: "Welcome to your interview.",
      speechMode: "upload",
      voice: "default",
      consent: true,
    },
    assets: {
      source: {
        key: "source",
        url: "https://media.example/source.jpg",
        mime: "image/jpeg",
        name: "source.jpg",
        kind: "image",
      },
      audio: {
        key: "audio",
        url: "https://media.example/audio.wav",
        mime: "audio/wav",
        name: "audio.wav",
      },
    },
    render: { status: "idle" },
    previewStale: false,
  };
  api.capabilities = async () => structuredClone(capabilities);
  api.list = async (values) => {
    calls.push(["list", values]);
    return {
      items: [structuredClone(doc)],
      pagination: { page: values.page, pages: 3, total: 30, limit: 12 },
    };
  };
  api.get = async () => structuredClone(doc);
  api.create = async (data) => {
    calls.push(["create", structuredClone(data)]);
    doc = { ...doc, data: structuredClone(data), assets: {}, revision: 1 };
    return structuredClone(doc);
  };
  api.save = async (_id, revision, data) => {
    calls.push(["save", revision, structuredClone(data)]);
    if (saveFailure) throw saveFailure;
    assert.equal(revision, doc.revision);
    doc = {
      ...doc,
      data: structuredClone(data),
      revision: doc.revision + 1,
      previewStale: Boolean(doc.assets.preview),
    };
    return structuredClone(doc);
  };
  api.upload = async (_id, revision, kind, file) => {
    calls.push(["upload", revision, kind, file.name]);
    assert.equal(revision, doc.revision);
    doc = {
      ...doc,
      revision: revision + 1,
      assets: {
        ...doc.assets,
        [kind]: {
          key: kind,
          url: `https://media.example/${file.name}`,
          mime: file.type,
          name: file.name,
          kind: file.type.startsWith("image/") ? "image" : "video",
        },
      },
    };
    return structuredClone(doc);
  };
  api.render = async (_id, revision) => {
    calls.push(["render", revision]);
    assert.equal(revision, doc.revision);
    doc = {
      ...doc,
      revision: revision + 1,
      render: { status: "queued", stage: "queued", jobId: "job1" },
      previewStale: Boolean(doc.assets.preview),
    };
    return structuredClone(doc);
  };
  api.status = async () => {
    calls.push(["status"]);
    doc = {
      ...doc,
      revision: doc.revision + 1,
      render: { status: "ready", stage: "complete" },
      previewStale: false,
      assets: {
        ...doc.assets,
        preview: {
          url: "https://media.example/generated.mp4",
          mime: "video/mp4",
        },
      },
    };
    return structuredClone(doc);
  };
  api.archive = async (_id, revision, active) => {
    calls.push(["archive", revision, active]);
    doc.active = active;
    doc.revision++;
    return structuredClone(doc);
  };
  api.assist = async (_id, revision, action, language) => {
    calls.push(["assist", revision, action, language]);
    return { text: "A suggested introduction." };
  };
  api.transcribe = async (_id, revision) => {
    calls.push(["transcribe", revision]);
    return { text: "A transcription suggestion." };
  };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom.window.close();
  [URL.createObjectURL, URL.revokeObjectURL] = urlOriginals;
  for (const key of keys) {
    if (original.get(key))
      Object.defineProperty(globalThis, key, original.get(key));
    else delete globalThis[key];
  }
});
async function mount(entry = path) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(Routes, null, h(Route, { path: `${path}/*`, element: h(Studio) })),
      ),
    ),
  );
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === text || element.getAttribute("aria-label") === text,
  );
const link = (text) =>
  [...document.querySelectorAll("a")].find(
    (element) => element.textContent.trim() === text,
  );
const labeled = (text) =>
  [...document.querySelectorAll("label")]
    .find((element) => element.querySelector("span")?.textContent === text)
    ?.querySelector("input,textarea,select");
async function click(element) {
  assert.ok(element, "Click target exists");
  await act(async () => element.click());
}
async function type(element, value) {
  assert.ok(element, "Input exists");
  await act(async () => {
    const prototype =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : element.tagName === "SELECT"
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(
      element,
      value,
    );
    element.dispatchEvent(
      new window.Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function upload(label, name, mime) {
  const element = document.querySelector(`[aria-label="${label}"]`);
  assert.ok(element);
  await act(async () => {
    Object.defineProperty(element, "files", {
      configurable: true,
      value: [new File(["asset"], name, { type: mime })],
    });
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
const atStep = (step) => ({
  pathname: `${path}/${id}/edit`,
  state: { avatarStep: step },
});

test("avatar library filters, paginates and archives with revision confirmation", async () => {
  await mount();
  assert.ok(document.body.textContent.includes("Technical interviewer"));
  assert.ok(document.querySelector('img[alt="Avatar source"]'));
  await click(document.querySelector('[aria-label="Next page"]'));
  assert.equal(calls.filter(([name]) => name === "list").at(-1)[1].page, 2);
  await type(
    document.querySelector('[aria-label="Avatar status filter"]'),
    "false",
  );
  assert.equal(
    calls.filter(([name]) => name === "list").at(-1)[1].active,
    "false",
  );
  await click(document.querySelector('[aria-label="Archive Annu"]'));
  assert.equal(calls.filter(([name]) => name === "archive").length, 0);
  await click(button("Archive avatar", document.querySelector("dialog")));
  assert.deepEqual(
    calls.find(([name]) => name === "archive"),
    ["archive", 1, false],
  );
});

test("missing renderer explicitly blocks generation without pretending to preview", async () => {
  capabilities.renderer = { configured: false, available: false };
  await mount(atStep(2));
  assert.equal(button("Generate preview").disabled, true);
  assert.equal(button("Finish").disabled, true);
  assert.match(document.body.textContent, /Video renderer setup is required/);
  assert.equal(
    document.querySelector('video[aria-label="Generated avatar video"]'),
    null,
  );
  assert.equal(
    calls.some(([name]) => name === "render"),
    false,
  );
});

test("creation saves identity and uploads before generating a real video preview", async () => {
  await mount(`${path}/new`);
  await type(labeled("Avatar name *"), "Asha");
  await type(labeled("Role"), "Interview coach");
  await upload("Avatar photo or video", "portrait.png", "image/png");
  await click(document.querySelector('input[type="checkbox"]'));
  await click(button("Next"));
  assert.ok(labeled("Introduction transcript *"));
  assert.deepEqual(calls.filter(([name]) => name === "upload")[0], [
    "upload",
    1,
    "source",
    "portrait.png",
  ]);
  await type(labeled("Introduction transcript *"), "Welcome. Let us begin.");
  await upload("Introduction audio file", "intro.wav", "audio/wav");
  await click(button("Next"));
  assert.ok(button("Generate preview"));
  await click(button("Generate preview"));
  assert.equal(doc.render.status, "queued");
  assert.equal(button("Finish").disabled, true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2200));
  });
  assert.equal(button("Finish").disabled, false);
  await click(document.querySelector('[aria-label="Play avatar preview"]'));
  const video = document.querySelector(
    'video[aria-label="Generated avatar video"]',
  );
  assert.equal(
    video.getAttribute("src"),
    "https://media.example/generated.mp4",
  );
  assert.equal(video.controls, true);
  assert.equal(video.autoplay, false);
  await click(document.querySelector('[aria-label="Close dialog"]'));
  await click(button("Finish"));
  assert.ok(link("Create avatar"));
});

test("failed metadata saves preserve the input and allow retry", async () => {
  await mount(atStep(0));
  await type(labeled("Avatar name *"), "Edited name");
  saveFailure = new Error("Temporary save failure");
  await click(button("Save draft"));
  assert.equal(labeled("Avatar name *").value, "Edited name");
  assert.match(document.body.textContent, /Temporary save failure/);
  saveFailure = null;
  await click(button("Save draft"));
  assert.equal(doc.data.name, "Edited name");
  assert.match(document.body.textContent, /Draft saved/);
});

test("stale previews are clearly previous versions and must regenerate before finish", async () => {
  doc.assets.preview = {
    url: "https://media.example/old.mp4",
    mime: "video/mp4",
  };
  doc.render.status = "ready";
  doc.previewStale = true;
  await mount(atStep(2));
  assert.equal(button("Finish").disabled, true);
  await click(button("View previous preview"));
  assert.match(
    document.querySelector("dialog").textContent,
    /Previous version/,
  );
  assert.equal(
    document
      .querySelector('video[aria-label="Generated avatar video"]')
      .getAttribute("src"),
    "https://media.example/old.mp4",
  );
  await click(document.querySelector('[aria-label="Close dialog"]'));
  await click(button("Regenerate preview"));
  assert.equal(
    calls.some(([name]) => name === "render"),
    true,
  );
});

test("writing and transcription suggestions require explicit application", async () => {
  await mount(atStep(1));
  const originalText = labeled("Introduction transcript *").value;
  await click(button("Improve wording"));
  assert.equal(labeled("Introduction transcript *").value, originalText);
  await type(labeled("Suggested introduction"), "Admin approved script.");
  await click(button("Apply to introduction"));
  assert.equal(
    labeled("Introduction transcript *").value,
    "Admin approved script.",
  );
  await click(button("Transcribe audio to script"));
  assert.equal(
    labeled("Introduction transcript *").value,
    "Admin approved script.",
  );
  await click(button("Discard"));
  assert.match(
    document.body.textContent,
    /uploaded audio determines the spoken words/,
  );
});

test("Hinglish TTS is blocked while upload remains available", async () => {
  await mount(atStep(1));
  await type(labeled("Introduction language"), "hinglish");
  await click(button("Text-to-speech"));
  await click(button("Next"));
  assert.match(
    document.body.textContent,
    /currently supports uploaded audio only/,
  );
  assert.equal(
    calls.some(([name]) => name === "render"),
    false,
  );
  await click(button("Upload / record audio"));
  assert.ok(
    document.querySelector('audio[aria-label="Introduction audio preview"]'),
  );
});

test("archived avatar fields and render actions are read-only", async () => {
  doc.active = false;
  await mount(atStep(0));
  assert.equal(labeled("Avatar name *").matches(":disabled"), true);
  assert.equal(button("Save draft").disabled, true);
  assert.equal(button("Next").disabled, true);
});

test("opening a preview refreshes signed links and media errors offer retry", async () => {
  doc.assets.preview = { url: "https://media.example/expired.mp4" };
  doc.render.status = "ready";
  await mount();
  api.get = async () => {
    calls.push(["fresh-preview"]);
    return {
      ...doc,
      assets: {
        ...doc.assets,
        preview: { url: "https://media.example/fresh.mp4" },
      },
    };
  };
  await click(button("Preview"));
  const video = document.querySelector(
    'video[aria-label="Generated avatar video"]',
  );
  assert.equal(video.getAttribute("src"), "https://media.example/fresh.mp4");
  await act(async () =>
    video.dispatchEvent(new window.Event("error", { bubbles: true })),
  );
  assert.match(
    document.querySelector("dialog").textContent,
    /link may have expired/,
  );
  await click(button("Refresh preview"));
  assert.equal(calls.filter(([name]) => name === "fresh-preview").length, 2);
});

test("a current preview is not presented as an available regeneration", async () => {
  doc.assets.preview = { url: "https://media.example/current.mp4" };
  doc.render.status = "ready";
  await mount(atStep(2));
  assert.equal(button("Preview up to date").disabled, true);
  assert.equal(button("Finish").disabled, false);
  assert.equal(button("Regenerate preview"), undefined);
});

test("clicking a card opens details and switching languages plays the saved matching clip", async () => {
  doc.render.status = "ready";
  doc.languagePreviews = {
    en: { url: "https://media.example/english.mp4", introduction: "English introduction", stale: false },
    hi: { url: "https://media.example/hindi.mp4", introduction: "नमस्ते", stale: false },
  };
  doc.assets.preview = doc.languagePreviews.en;
  await mount();
  await click(document.querySelector('[aria-label="Open Annu introduction"]'));
  const dialog = document.querySelector("dialog");
  assert.match(dialog.textContent, /Technical interviewer/);
  assert.equal(dialog.querySelector('video').getAttribute("src"), "https://media.example/english.mp4");
  await type(document.querySelector('[aria-label="Preview language"]'), "hi");
  assert.equal(dialog.querySelector('video').getAttribute("src"), "https://media.example/hindi.mp4");
  assert.match(dialog.textContent, /नमस्ते/);
  assert.equal(calls.some(([name]) => name === "render" || name === "save"), false);
});

test("an in-progress introduction opened from the library resolves to a current video", async () => {
  doc.render.status = "queued";
  doc.previewStale = true;
  await mount();
  await click(document.querySelector('[aria-label="Open Annu introduction"]'));
  assert.match(document.querySelector("dialog").textContent, /Generating the English introduction/);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2200)); });
  assert.ok(document.querySelector('video[aria-label="Generated avatar video"]'));
  assert.doesNotMatch(document.querySelector("dialog").textContent, /Previous version/);
});

test("missing language preview never plays the wrong audio and opens language-specific creation", async () => {
  doc.assets.preview = { url: "https://media.example/english.mp4", language: "en" };
  doc.render.status = "ready";
  await mount();
  await click(document.querySelector('[aria-label="Open Annu introduction"]'));
  await type(document.querySelector('[aria-label="Preview language"]'), "hi");
  assert.equal(document.querySelector('video[aria-label="Generated avatar video"]'), null);
  assert.match(document.querySelector("dialog").textContent, /No Hindi preview yet/);
  await click(link("Create Hindi preview"));
  assert.equal(labeled("Introduction language").value, "hi");
  await click(button("Next"));
  assert.match(document.body.textContent, /Your recording is in English/);
  assert.equal(calls.some(([name]) => name === "render"), false);
});

test("changing language on an existing recording requires replacement and keeps the draft", async () => {
  doc.assets.audio.language = "en";
  await mount(atStep(1));
  await type(labeled("Introduction language"), "hi");
  await click(button("Next"));
  assert.equal(labeled("Introduction language").value, "hi");
  assert.match(document.body.textContent, /Upload or record Hindi audio/);
  assert.equal(button("Transcribe audio to script").disabled, true);
  await upload("Introduction audio file", "hindi.wav", "audio/wav");
  await click(button("Next"));
  assert.ok(button("Generate preview"));
});

test("recording can be stopped while other actions are locked and releases the microphone", async () => {
  let stopped = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop: () => {
              stopped++;
            },
          },
        ],
      }),
    },
  });
  window.MediaRecorder = class {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/webm";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new window.Blob(["recorded"], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  };
  await mount(atStep(1));
  await click(button("Record audio"));
  const stop = [...document.querySelectorAll("button")].find((element) =>
    element.textContent.startsWith("Stop recording"),
  );
  assert.ok(stop);
  assert.equal(stop.matches(":disabled"), false);
  assert.equal(button("Next").disabled, true);
  await click(stop);
  assert.ok(stopped > 0);
  assert.ok(
    document.querySelector('audio[aria-label="Introduction audio preview"]'),
  );
  assert.match(document.body.textContent, /avatar-introduction.webm/);
});
