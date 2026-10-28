import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// MonacoCodeEditor's value sync, rendered for real against a fake Monaco
// (test/fixtures/fakeMonaco.js), since Monaco itself does not run in jsdom.
let dom, server, root, createRoot, MonacoCodeEditor, fake;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'MutationObserver'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const fakePath = fileURLToPath(new URL('./fixtures/fakeMonaco.js', import.meta.url));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
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
    // Own cache: the aliases change the config hash, which would otherwise make
    // concurrently running Vite-based tests re-optimize the shared cache.
    cacheDir: 'node_modules/.vite-monaco-editor-test',
    resolve: {
      alias: [
        { find: /^monaco-editor\/esm\/vs\/editor\/edcore\.main$/, replacement: fakePath },
        { find: /^monaco-editor\/esm\/vs\/editor\/editor\.worker\?worker$/, replacement: fakePath },
        { find: /^monaco-editor\/esm\/vs\/basic-languages\/.*$/, replacement: fakePath },
      ],
    },
  });
  fake = await server.ssrLoadModule(fakePath);
  MonacoCodeEditor = (await server.ssrLoadModule('/src/admin/compiler/MonacoCodeEditor.jsx')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  delete document.fonts;
  fake.editors.length = 0;
  Object.assign(fake.calls, { flushes: 0, executeEdits: 0, remeasureFonts: 0 });
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

const settle = () => act(async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); });

function renderEditor(props) {
  return act(async () => root.render(h(MonacoCodeEditor, { language: 'cpp', contentKey: 'q1', ...props })));
}

test('a parent echo of an older debounced commit never rewinds newer typing or moves the caret', async () => {
  const reported = [];
  const onChange = (code) => reported.push(code);
  await renderEditor({ value: 'int a;', onChange });
  await settle();
  const editor = fake.editors[0];
  assert.ok(editor, 'Monaco was created');

  editor.setPosition({ lineNumber: 1, column: 7 });
  editor.type('\n');
  editor.type('i');
  const committed = editor.getValue();
  editor.type('nt b;');
  const caret = editor.getPosition();

  // The parent finally renders the text from the debounced commit (older).
  await renderEditor({ value: committed, onChange });
  assert.equal(editor.getValue(), 'int a;\nint b;', 'Newer keystrokes survive the stale echo');
  assert.deepEqual(editor.getPosition(), caret, 'The caret stays where the student is typing');
  assert.equal(fake.calls.flushes, 0, 'No setValue flush happened');

  await renderEditor({ value: 'int a;\nint b;', onChange });
  assert.equal(fake.calls.flushes, 0, 'The catch-up render is an acknowledgement');

  // A value the editor never produced is a real replacement (e.g. another problem loaded).
  await renderEditor({ value: 'print(1)', onChange });
  assert.equal(editor.getValue(), 'print(1)');
  assert.equal(reported.at(-1), 'int a;\nint b;', 'External values are not reported back as edits');
});

test('a forced reset is an undoable edit that keeps the cursor in range, even mid-typing', async () => {
  const onChange = () => {};
  await renderEditor({ value: 'line one\nline two', onChange, valueVersion: 0 });
  await settle();
  const editor = fake.editors[0];
  editor.setPosition({ lineNumber: 2, column: 9 });
  editor.type('!');

  await renderEditor({ value: 'template', onChange, valueVersion: 1 });
  assert.equal(editor.getValue(), 'template');
  assert.equal(fake.calls.executeEdits, 1, 'Reset goes through executeEdits');
  assert.equal(fake.calls.flushes, 0, 'Reset does not flush the model');
  assert.deepEqual(editor.getPosition(), { lineNumber: 1, column: 9 }, 'Caret is clamped into the new text');

  // A different question is authoritative even if the old model was dirty.
  editor.type('x');
  await renderEditor({ value: 'other question', onChange, valueVersion: 1, contentKey: 'q2' });
  assert.equal(editor.getValue(), 'other question');
});

test('text typed in the basic textarea while Monaco loads is carried over with focus and caret', async () => {
  let releaseFont;
  const fontGate = new Promise((resolve) => { releaseFont = resolve; });
  const fontListeners = new Set();
  document.fonts = {
    load: () => fontGate,
    ready: Promise.resolve(),
    addEventListener: (type, listener) => fontListeners.add(listener),
    removeEventListener: (type, listener) => fontListeners.delete(listener),
  };
  const reported = [];
  await renderEditor({ value: 'abc', onChange: (code) => reported.push(code) });
  await settle();
  assert.equal(fake.editors.length, 0, 'Monaco waits for the editor font');

  const textarea = document.querySelector('textarea[aria-label="Code editor"]');
  textarea.focus();
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  const typeInTextarea = (text) => act(async () => {
    setValue.call(textarea, text);
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await typeInTextarea('abcd');
  await typeInTextarea('abcdef');
  textarea.setSelectionRange(5, 5);
  assert.deepEqual(reported, ['abcd', 'abcdef']);

  await act(async () => { releaseFont(); });
  await settle();
  const editor = fake.editors[0];
  assert.ok(editor, 'Monaco was created once the font loaded');
  assert.equal(editor.getValue(), 'abcdef', 'The model starts from the typed text, not the older prop');
  assert.ok(editor.focused, 'Focus moves from the textarea to Monaco');
  assert.deepEqual(editor.getPosition(), { lineNumber: 1, column: 6 }, 'Caret keeps its offset');
  assert.ok(fake.calls.remeasureFonts >= 1, 'Fonts are remeasured after load');
  assert.equal(fontListeners.size, 1, 'Font loading is observed');

  // The parent now renders an older debounced commit; it must not win.
  await renderEditor({ value: 'abcd', onChange: (code) => reported.push(code) });
  assert.equal(editor.getValue(), 'abcdef');
  assert.equal(fake.calls.flushes, 0);

  await act(async () => root.unmount());
  root = null;
  assert.equal(fontListeners.size, 0, 'The font listener is removed on unmount');
});

test('cursor position survives an unmount and remount of the same content', async () => {
  await renderEditor({ value: 'one\ntwo\nthree', onChange: () => {}, contentKey: 'persist-me' });
  await settle();
  fake.editors[0].setPosition({ lineNumber: 3, column: 4 });
  await act(async () => root.unmount());

  root = createRoot(document.getElementById('app'));
  await renderEditor({ value: 'one\ntwo\nthree', onChange: () => {}, contentKey: 'persist-me' });
  await settle();
  assert.deepEqual(fake.editors[1].getPosition(), { lineNumber: 3, column: 4 });
});
