import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let dom, server, root, createRoot, VoiceInterviewRoom, api;
const globals = ["window", "document", "navigator", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews/room/session-one", pretendToBeVisual: true });
  for (const name of globals) Object.defineProperty(globalThis, name, {
    configurable: true, writable: true,
    value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
  });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  VoiceInterviewRoom = (await server.ssrLoadModule("/src/student/VoiceInterviewRoom.jsx")).default;
  api = (await server.ssrLoadModule("/src/utils/api.js")).api;
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

test("student room offers microphone review and an animated avatar, not a text box", async () => {
  api.getStudentAIInterviewSession = async () => ({
    id: "session-one", version: 1, status: "active", question: "How did you build it?",
    questionNumber: 1, totalQuestions: 2, section: "Technical", topic: "Projects",
    pendingTranscript: "I built it with React.", pendingTranscriptId: "recording-one", turns: [],
  });
  api.getStudentAIQuestionAudio = async () => { throw new Error("Audio unavailable in this test"); };
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(VoiceInterviewRoom, { sessionId: "session-one" }))));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.match(document.body.textContent, /How did you build it\?/);
  assert.match(document.body.textContent, /Use this answer/);
  assert.match(document.body.textContent, /Record again/);
  assert.equal(document.querySelector("textarea"), null);
  assert.ok(document.querySelector('[role="img"][aria-label="ANNU is ready"]'));
});
