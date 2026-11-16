import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// DOM test of the CSV review table in InterviewStudentEditor: shared header sort + pager.
// The API is mocked; no network or database is touched.
let dom, server, root, Editor, api, createRoot;
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'File', 'Blob', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/event/create' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Editor = (await server.ssrLoadModule('/src/components/interviews/InterviewStudentEditor.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  // Every row is "ready" except the one whose e-mail starts with "bad".
  api.checkInterviewParticipantCsv = async (file) => {
    const lines = (await file.text()).split(/\r?\n/).slice(1);
    return { results: lines.map((line, index) => (line.includes('"bad') ? { status: 'not_found', message: 'Registered student not found.' } : { status: 'ready', student: { _id: `id${index}` } })) };
  };
  root = createRoot(document.getElementById('app'));
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom.window.close();
  for (const key of globals) { const descriptor = originals.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const header = (label) => [...document.querySelectorAll('thead button')].find((button) => button.textContent.toLowerCase().startsWith(label.toLowerCase()));
const emails = () => [...document.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('input')[0].value);
async function click(element) { assert.ok(element, 'click target exists'); await act(async () => { element.click(); }); }

test('review table sorts from headers, keeps order while editing, and pages with the shared pager', async () => {
  await act(async () => root.render(h(Editor, { mode: 'bulk', special: false, selected: [], onChange() {}, onPendingChange() {} })));
  const csv = ['email,studentid', ...Array.from({ length: 30 }, (_, index) => `${index === 3 ? 'bad' : 'user'}${String(index).padStart(2, '0')}@example.com,S${index}`)].join('\n');
  const input = document.querySelector('input[type="file"]');
  const file = { name: 'students.csv', size: csv.length, text: async () => csv };
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  assert.equal(document.querySelectorAll('tbody tr').length, 25, 'first page shows 25 rows');
  assert.ok(document.querySelector('[data-table-pager]').textContent.includes('of 30'));
  await click(document.querySelector('[aria-label="Last page"]'));
  assert.equal(document.querySelectorAll('tbody tr').length, 5, 'last page shows the remaining 5');
  await click(document.querySelector('[aria-label="First page"]'));

  await click(header('Email')); await click(header('Email')); // descending
  assert.equal(emails()[0], 'user29@example.com');
  await click(header('Validation')); await click(header('Validation')); // descending: "Registered student not found." before "Ready to add"
  assert.equal(emails()[0], 'bad03@example.com');

  // Editing a cell must not move the row out from under the cursor.
  await click(header('Email')); await click(header('Email')); // email descending again
  const first = document.querySelector('tbody tr input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(first, 'aaa@example.com');
    first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(emails()[0], 'aaa@example.com', 'edited row stays in place until the next sort');
  await click(header('Row')); // re-sorting picks up the edit
  await click(header('Email'));
  assert.equal(emails()[0], 'aaa@example.com', 'a fresh sort uses the edited value');
});
