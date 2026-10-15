import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, QuickPrepMembership, location;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/problems/p1', pretendToBeVisual: true });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  QuickPrepMembership = (await server.ssrLoadModule('/src/student/problems/QuickPrepMembership.jsx')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  location = null;
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

function Where() { location = useLocation(); return null; }
const render = (sheets, entry = '/problems/p1') => act(async () => {
  root.render(h(
    MemoryRouter,
    { initialEntries: [entry] },
    h(Where),
    h(Routes, null, h(Route, { path: '*', element: h(QuickPrepMembership, { quickPreps: sheets }) })),
  ));
});
const sheet = (slug, title, progress = {}) => ({ id: slug, slug, title, href: `/student/quickprep/${slug}`, ...progress });
const open = async () => {
  const trigger = document.querySelector('button');
  await act(async () => trigger.click());
  return document.querySelector('[role="dialog"]');
};
const sheetLinks = (panel) => [...panel.querySelectorAll('li > div:first-child a')];

test('hides the membership control when the question is not in a QuickPrep', async () => {
  await render([]);
  assert.equal(document.querySelector('a,button'), null);
});

test('one QuickPrep shows a clear chip whose sheet stays navigable', async () => {
  await render([sheet('arrays', 'Array Essentials')]);
  assert.match(document.querySelector('button').textContent, /In 1 QuickPrep sheet$/);
  const panel = await open();
  const [link] = sheetLinks(panel);
  assert.equal(link.textContent.trim(), 'Array Essentials');
  await act(async () => link.click());
  assert.equal(location.pathname, '/student/quickprep/arrays');
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('multiple QuickPreps list each sheet with the student’s progress', async () => {
  await render([
    sheet('arrays', 'Array Essentials', { started: true, solved: 3, total: 10 }),
    sheet('interviews', 'Interview Sprint', { total: 25 }),
    sheet('basics', 'Basics', { started: true, completed: true, solved: 5, total: 5 }),
  ]);
  assert.match(document.querySelector('button').textContent, /In 3 QuickPrep sheets/);
  const panel = await open();
  assert.deepEqual(sheetLinks(panel).map((link) => link.textContent.trim()), ['Array Essentials', 'Interview Sprint', 'Basics']);
  const text = panel.textContent;
  assert.match(text, /3\/10 solved/);
  assert.match(text, /Not started · 25 questions/);
  assert.match(text, /Completed/);
  await act(async () => sheetLinks(panel)[1].click());
  assert.equal(location.pathname, '/student/quickprep/interviews');
});

test('a sheet can be solved in place, keeping the question and marking the current sheet', async () => {
  await render([sheet('arrays', 'Array Essentials'), sheet('interviews', 'Interview Sprint')], '/problems/p1?quest=arrays');
  const panel = await open();
  assert.match(panel.querySelector('li').textContent, /Current sheet/);
  const solveLinks = [...panel.querySelectorAll('a[aria-label^="Solve this question in"]')];
  assert.deepEqual(solveLinks.map((link) => link.getAttribute('aria-label')), ['Solve this question in Interview Sprint']);
  await act(async () => solveLinks[0].click());
  assert.equal(`${location.pathname}${location.search}`, '/problems/p1?quest=interviews');
});
