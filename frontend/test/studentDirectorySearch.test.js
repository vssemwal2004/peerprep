import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// The student list's search lives in the row above the table (next to "Select page"), not in the header,
// and stays reachable when a search finds nobody.
let dom, server, root, createRoot, StudentDirectory, AuthContext, ToastProvider, api;
const calls = [];
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/students' });
  dom.window.matchMedia ??= (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  dom.window.scrollTo = () => {};
  for (const key of globals) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
  });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  ({ default: AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.jsx'));
  ({ ToastProvider } = await server.ssrLoadModule('/src/components/CustomToast.jsx'));
  ({ default: StudentDirectory } = await server.ssrLoadModule('/src/admin/StudentDirectory.jsx'));
  const student = (index) => ({ _id: `s${index}`, name: `Student ${index}`, email: `s${index}@example.test`, studentId: `ID${index}`, branch: 'CSE', course: 'B.Tech', semester: 3, isActive: true });
  api.listAllStudents = async (params) => {
    calls.push(params);
    const rows = params.search === 'nobody' ? [] : [student(1), student(2)];
    return { students: rows, pagination: { page: 1, pages: 1, total: rows.length, limit: 25 }, facets: {} };
  };
  api.getAllSemestersForStudent = async () => [];
  api.listMasterData = async () => ({ entries: [] });
  api.listStudentUploadBatches = async () => ({ batches: [] });
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

const settle = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const searchBox = () => document.querySelector('input[aria-label="Search students"]');
const type = (value) => act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(searchBox(), value);
  searchBox().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

test('the search sits beside "Select page", not in the header, and still searches', async () => {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/admin/students'] },
    h(AuthContext.Provider, { value: { user: { _id: 'a1', role: 'admin', name: 'Admin' }, authChecked: true, isAuthenticated: true } },
      h(ToastProvider, null, h(StudentDirectory))))));
  await settle(50);
  const header = document.querySelector('[data-page-header]');
  assert.equal(header.querySelector('input[aria-label="Search students"]'), null, 'no search in the header');
  const selectPage = [...document.querySelectorAll('button')].find((button) => /Select page/.test(button.textContent));
  assert.ok(selectPage, 'the "Select page" row is shown');
  const row = selectPage.closest('div.mb-2');
  assert.ok(row.contains(searchBox()), 'the search is in the "Select page" row');

  await type('nobody');
  await settle(400);
  assert.equal(calls.at(-1).search, 'nobody');
  assert.match(document.body.textContent, /No students found/);
  assert.ok(searchBox(), 'with no results the search is still there to change or clear');
  await act(async () => document.querySelector('button[aria-label="Clear search"]').click());
  await settle(400);
  assert.equal(calls.at(-1).search, '');
  assert.ok([...document.querySelectorAll('button')].some((button) => /Select page/.test(button.textContent)));
});
