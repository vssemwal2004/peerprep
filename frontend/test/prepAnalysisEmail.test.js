import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Prep Analysis students: tick some (or "Select all N matching") and send them one of the admin's templates.
let dom, server, root, createRoot, StudentTable;
const requests = [];
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'confirm'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => null } });

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/analysis' });
  dom.window.matchMedia ??= (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  dom.window.confirm = () => true; // "Send … to 3 students?" → OK
  for (const key of globals) {
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true
      : key === 'confirm' ? () => true
        : key === 'fetch' ? async (url, init = {}) => {
          const path = String(url).replace(/^.*\/admin\/prep-analysis/, '');
          const body = init.body ? JSON.parse(init.body) : null;
          requests.push({ path, body });
          if (path === '/student-ids') return json({ ids: ['s1', 's2', 's3'], total: 3, limit: 5000 });
          if (path === '/email/templates') return json({ templates: [{ id: 't1', name: 'Practice reminder', subject: 'Hi {{firstName}}' }], variables: [{ key: 'name', label: 'Full name' }] });
          if (path === '/email/preview') return json({ to: 'asha@example.test', name: 'Asha', subject: 'Hi Asha', html: '<p>Dear Asha</p>' });
          if (path === '/email/send') return json({ batchId: 'b1', template: { id: 't1', name: 'Practice reminder' }, requested: 3, queued: 2, noEmail: 1, notFound: 0 }, 202);
          return json({ message: `unexpected ${path}` }, 404);
        }
          : dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ StudentTable } = await server.ssrLoadModule('/src/admin/prepAnalysis/components/Insights.jsx'));
  root = createRoot(document.getElementById('app'));
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const settle = (ms = 50) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const click = (node) => act(async () => node.click());
const button = (pattern) => [...document.querySelectorAll('button')].find((node) => pattern.test(node.textContent));
// The shape the server's student table sends (tableRow).
const row = (id, name) => ({ id, name, studentId: id.toUpperCase(), email: `${id}@example.test`, position: 1, semester: 5, branch: 'CSE',
  prepScore: 0, points: 0, solved: { total: 0, Easy: 0, Medium: 0, Hard: 0 }, accuracy: 0, submissions: 0, activeDays: 0, daysSinceActive: null,
  practiceStatus: 'never', languages: [], review: { flagged: 0, untracked: 0 }, learning: null, quickprep: null, interview: null, assessment: null,
  scores: { total: 0, features: {} } });

test('tick students, select all matching, then send a template to them', async () => {
  const table = { rows: [row('s1', 'Asha'), row('s2', 'Bilal')], total: 3, page: 1, limit: 25, sort: 'prepScore', direction: 'desc', search: 'a' };
  await act(async () => root.render(h(MemoryRouter, null, h(StudentTable, {
    table, area: 'coding', loading: false, onChange: () => {}, onOpen: () => {}, requestBody: { module: 'coding', range: { preset: 'all' } },
  }))));
  assert.equal(document.querySelector('[role="status"]'), null, 'no bar until someone is ticked');
  await click(document.querySelector('input[aria-label="Select Asha"]'));
  assert.match(document.querySelector('[role="status"]').textContent, /1 selected/);

  await click(button(/Select all 3 matching/));
  await settle();
  assert.deepEqual(requests.at(-1), { path: '/student-ids', body: { module: 'coding', range: { preset: 'all' }, table: { search: 'a' } } });
  assert.match(document.querySelector('[role="status"]').textContent, /3 selected/);

  await click(button(/Send email/));
  await settle();
  assert.match(document.body.textContent, /To 3 selected students/);
  assert.equal(document.querySelector('[role="dialog"] select').value, 't1', 'the first template is chosen');
  assert.equal(document.querySelector('iframe[title="Email preview"]').getAttribute('sandbox'), '', 'the template preview cannot run scripts');
  assert.match(document.body.textContent, /Preview for Asha · asha@example\.test/);

  await click(button(/^Send to 3$/));
  await settle();
  const sent = requests.find((entry) => entry.path === '/email/send');
  assert.deepEqual(sent.body.studentIds.sort(), ['s1', 's2', 's3']);
  assert.equal(sent.body.templateId, 't1');
  assert.match(document.body.textContent, /“Practice reminder” queued for 2 students\./);
  assert.match(document.body.textContent, /1 student has no email address/);
});
