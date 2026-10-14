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
const render = (sheets) => act(async () => {
  root.render(h(
    MemoryRouter,
    { initialEntries: ['/problems/p1'] },
    h(Where),
    h(Routes, null, h(Route, { path: '*', element: h(QuickPrepMembership, { quickPreps: sheets }) })),
  ));
});
const sheet = (slug, title, id = slug) => ({ id, slug, title, href: `/student/quickprep/${slug}` });

test('hides the membership control when the question is not in a QuickPrep', async () => {
  await render([]);
  assert.equal(document.querySelector('a,button'), null);
});

test('one QuickPrep is a direct link to its sheet', async () => {
  await render([sheet('arrays', 'Array Essentials')]);
  const link = document.querySelector('a');
  assert.equal(link.textContent.trim(), 'Array Essentials');
  await act(async () => link.click());
  assert.equal(location.pathname, '/student/quickprep/arrays');
});

test('multiple QuickPreps open a menu and each sheet remains navigable', async () => {
  await render([sheet('arrays', 'Array Essentials'), sheet('interviews', 'Interview Sprint')]);
  const trigger = document.querySelector('button');
  assert.match(trigger.textContent, /QuickPrep Sheets \(2\)/);
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu);
  const links = [...menu.querySelectorAll('a')];
  assert.deepEqual(links.map((link) => link.textContent.trim()), ['Array Essentials', 'Interview Sprint']);
  await act(async () => links[1].click());
  assert.equal(location.pathname, '/student/quickprep/interviews');
  assert.equal(document.querySelector('[role="menu"]'), null);
});
