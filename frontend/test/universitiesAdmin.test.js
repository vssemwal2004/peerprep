import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, api, pages, model;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const iso = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const permissions = { learning: true, assessments: true, questions: true, events: false, interviews: false, resumes: true };
const UNIVERSITIES = [
  { universityId: 'north', name: 'North University', contactEmail: 'it@north.edu', active: true, dbConfigured: true, judgeConfigured: true, serviceStartDate: iso(-30), serviceEndDate: iso(200), coordinatorLimit: 10, studentLimit: 500, coinBalance: 1200, permissions, sources: { learning: 'university' } },
  { universityId: 'south', name: 'South College', active: true, dbConfigured: true, judgeConfigured: false, serviceStartDate: iso(-300), serviceEndDate: iso(10), coordinatorLimit: 5, studentLimit: 100, coinBalance: 0, permissions, sources: {} },
  { universityId: 'east', name: 'East Institute', active: false, dbConfigured: true, judgeConfigured: true, serviceStartDate: iso(-10), serviceEndDate: iso(100), coordinatorLimit: 5, studentLimit: 50, coinBalance: 30, permissions, sources: {} },
];
const OVERVIEW = { universities: UNIVERSITIES, audit: [{ _id: 'a1', action: 'university.created', universityId: 'north', createdAt: new Date().toISOString() }], defaults: { permissions, sources: { learning: 'university' } } };

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin/universities' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  model = await server.ssrLoadModule('/src/admin/universities/universityModel.js');
  pages = {};
  for (const name of ['UniversitiesOverview', 'UniversityList', 'AddUniversity', 'UniversityDetail', 'UniversityActivity']) {
    pages[name] = (await server.ssrLoadModule(`/src/admin/universities/${name}.jsx`)).default;
  }
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  api.platformOverview = async () => structuredClone(OVERVIEW);
  api.universityAccountCounts = async () => ({ coordinators: 4, students: 480 });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

function Where() { const location = useLocation(); return h('output', { id: 'where' }, location.pathname + location.search); }
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function render(path, pattern, Page) {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: pattern, element: h(Page) })), h(Where))));
  await settle();
}
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
};

test('health turns registration facts into one actionable status', () => {
  assert.equal(model.universityHealth(UNIVERSITIES[0]).status, 'live');
  assert.equal(model.universityHealth(UNIVERSITIES[0]).needsAttention, false);
  const south = model.universityHealth(UNIVERSITIES[1]);
  assert.equal(south.status, 'expiring');
  assert.deepEqual(south.issues, ['Code judge (Judge0) not connected']);
  assert.equal(model.universityHealth(UNIVERSITIES[2]).status, 'disabled');
  assert.equal(model.universityHealth({ ...UNIVERSITIES[0], serviceEndDate: iso(-1) }).status, 'expired');
});

test('overview summarises universities and lists only those needing attention', async () => {
  await render('/admin/universities', '/admin/universities', pages.UniversitiesOverview);
  const text = document.body.textContent;
  assert.match(text, /Universities3/);
  assert.match(text, /Need attention1/);
  assert.match(text, /Prep Coins with universities1,230/);
  const attention = document.querySelector('[aria-labelledby="attention-title"]').textContent;
  assert.ok(attention.includes('South College') && !attention.includes('North University'));
  assert.match(text, /University added/);
});

test('the list searches and filters, and each row links to its own page', async () => {
  await render('/admin/universities/all', '/admin/universities/all', pages.UniversityList);
  const rows = () => [...document.querySelectorAll('tbody tr')].map((row) => row.querySelector('a').textContent);
  assert.equal(rows().length, 3);
  await act(async () => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.startsWith('Disabled')).click());
  assert.deepEqual(rows().map((name) => name.includes('East')), [true]);
  await act(async () => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.startsWith('All')).click());
  await type(document.querySelector('input[placeholder^="Search"]'), 'south');
  assert.equal(rows().length, 1);
  assert.equal(document.querySelector('tbody a').getAttribute('href'), '/admin/universities/south');
});

test('a university page splits management into tabs and shows what to fix', async () => {
  await render('/admin/universities/south', '/admin/universities/:universityId', pages.UniversityDetail);
  assert.match(document.querySelector('h1').textContent, /South College/);
  assert.match(document.body.textContent, /Code judge \(Judge0\) not connected/);
  assert.equal(document.querySelectorAll('[role="tab"]').length, 7);
  await act(async () => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Plan & Prep Coins').click());
  await settle();
  assert.equal(document.getElementById('where').textContent, '/admin/universities/south?tab=plan');
  assert.match(document.body.textContent, /480 of 100/, 'live usage beside the limit');
  let saved;
  api.updateUniversity = async (id, body) => { saved = [id, body]; return {}; };
  await act(async () => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Modules').click());
  await act(async () => document.querySelector('[aria-label="Peer interviews for South College"]').click());
  await settle();
  assert.deepEqual(saved, ['south', { permissions: { events: true } }]);
  assert.match(document.body.textContent, /Peer interviews turned on/);
});

test('an unknown university shows a clear not-found state', async () => {
  await render('/admin/universities/missing', '/admin/universities/:universityId', pages.UniversityDetail);
  assert.match(document.body.textContent, /University not found/);
});

test('adding a university is a guided flow that cannot skip the connection test', async () => {
  await render('/admin/universities/new', '/admin/universities/new', pages.AddUniversity);
  const next = () => button('Continue');
  assert.equal(next().disabled, true);
  await type(document.querySelector('input[placeholder="graphic-era"]'), 'west');
  await type(document.querySelector('input[placeholder="Graphic Era University"]'), 'West University');
  assert.equal(next().disabled, false);
  await act(async () => next().click());
  assert.match(document.body.textContent, /Test the MongoDB connection/);
  assert.equal(next().disabled, true, 'connections need a passing database test');
  api.testUniversityDatabase = async () => ({ connected: true });
  await type(document.querySelector('input[placeholder="mongodb+srv://…"]'), 'mongodb://db.example/west');
  await act(async () => button('Test connection').click());
  await settle();
  await type(document.querySelector('input[placeholder="https://judge.university.edu"]'), 'https://judge.example');
  assert.equal(next().disabled, false);
});

test('the activity log stays in the master workspace and pages within ten days', async () => {
  const calls = [];
  api.platformAudit = async (query) => {
    calls.push(query);
    return query.before
      ? { entries: [{ id: 'old', action: 'university.updated', universityId: 'north', createdAt: '2026-01-01T10:00:00Z', actorName: 'Asha' }], nextCursor: null }
      : { entries: [{ id: 'new', action: 'prep_coin.pricing_updated', universityId: '', createdAt: new Date().toISOString(), actorName: 'Asha', details: {} }], nextCursor: '2026-02-01T00:00:00Z' };
  };
  await render('/admin/universities/activity', '/admin/universities/activity', pages.UniversityActivity);
  assert.match(document.body.textContent, /Prep Coin prices changed/);
  assert.equal(document.querySelector('select[aria-label="University"]'), null);
  assert.match(document.body.textContent, /does not combine or expose activity from university databases/);
  await act(async () => button('Load more within 10 days').click());
  await settle();
  assert.match(document.body.textContent, /University updated/);
  assert.equal(calls.at(-1).before, '2026-02-01T00:00:00Z');
});
