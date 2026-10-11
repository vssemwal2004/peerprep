import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Coding workspace pieces rendered for real: the practice timer and the editor's console actions.
let dom, server, root, createRoot, WorkspaceTimer, CodeEditor;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/problems/p1', pretendToBeVisual: true });
  dom.window.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  WorkspaceTimer = (await server.ssrLoadModule('/src/student/WorkspaceTimer.jsx')).default;
  CodeEditor = (await server.ssrLoadModule('/src/student/CodeEditor.jsx')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const click = (node) => act(async () => node.click());

test('the practice timer counts, pauses, resumes and resets', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    await act(async () => root.render(h(WorkspaceTimer)));
    const timer = () => document.querySelector('[role="timer"]');
    const tick = (seconds) => act(async () => mock.timers.tick(seconds * 1000));
    assert.match(timer().textContent, /^00:00$/);
    await tick(3);
    assert.match(timer().textContent, /^00:03$/);

    await click(document.querySelector('button[aria-label="Pause timer"]'));
    assert.match(timer().textContent, /00:03Paused/);
    await tick(5);
    assert.match(timer().textContent, /^00:03/, 'A paused timer does not advance');

    await click(document.querySelector('button[aria-label="Resume timer"]'));
    await tick(2);
    assert.match(timer().textContent, /^00:05$/);
    await tick(3600);
    assert.match(timer().textContent, /^1:00:05$/, 'Hours appear only once they are needed');

    await click(document.querySelector('button[aria-label="Reset timer"]'));
    assert.match(timer().textContent, /^00:00$/);
    assert.ok(document.querySelector('button[aria-label="Reset timer"]').disabled, 'Nothing to reset at zero while running');
    await tick(1);
    assert.match(timer().textContent, /^00:01$/, 'Reset keeps the timer running');
  } finally {
    mock.timers.reset();
  }
});

test('Run and Submit sit on the Testcase row and send the latest code', async () => {
  const calls = [];
  const props = {
    supportedLanguages: ['python'], language: 'python', code: 'print(1)', onLanguageChange: () => {}, onCodeChange: () => {},
    testCases: [{ id: 'c1', input: '1' }], activeTestCaseId: 'c1', onActiveTestCaseChange: () => {}, activeConsoleTab: 'testcase',
    onConsoleTabChange: () => {}, result: null, isRunning: false, isSubmitting: false, showToolbar: false, consoleActions: true,
    onRun: (code) => calls.push(['run', code]), onSubmit: (code) => calls.push(['submit', code]), onReset: () => {},
  };
  await act(async () => root.render(h(CodeEditor, props)));
  const group = document.querySelector('[role="group"][aria-label="Run and submit"]');
  assert.ok(group, 'The actions render in the console');
  const row = group.parentElement;
  assert.match(row.textContent, /^Testcase.*Test Result.*Run.*Submit$/, 'Same row as the Testcase and Test Result tabs, at its end');
  const [run, submit] = group.querySelectorAll('button');
  await click(run);
  await click(submit);
  assert.deepEqual(calls, [['run', 'print(1)'], ['submit', 'print(1)']]);

  await act(async () => root.render(h(CodeEditor, { ...props, isSubmitting: true })));
  const busy = document.querySelector('[role="group"][aria-label="Run and submit"]');
  assert.match(busy.textContent, /Submitting…/);
  assert.ok([...busy.querySelectorAll('button')].every((button) => button.disabled), 'No double submission while one is in flight');

  await act(async () => root.render(h(CodeEditor, { ...props, consoleActions: false })));
  assert.equal(document.querySelector('[aria-label="Run and submit"]'), null, 'Other editors keep their own toolbar');
});
