import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, Card, AuthContext, api;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const user = { _id: 'own-student', role: 'student', accessScope: 'full' };
const ready = { status: 'ready', rank: 4, totalStudents: 50, score: 120, universities: 2, totalUniversities: 3, partial: true, tied: true, updatedAt: '2026-10-12T12:00:00Z' };
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Card = (await server.ssrLoadModule('/src/student/profile/GlobalRankCard.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  api.getStudentGlobalRanking = async () => ({ ranking: ready });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});
const mount = (currentUser = user) => act(async () => root.render(h(MemoryRouter, null, h(AuthContext.Provider, { value: { user: currentUser } }, h(Card)))));

test('shows only own global standing, ties, timestamp and partial coverage', async () => {
  await mount();
  assert.match(document.body.textContent, /#4.*50 students.*tied/);
  assert.match(document.body.textContent, /2 of 3 universities synced/);
  assert.match(document.body.textContent, /Only your rank is visible/);
  assert.equal(document.querySelector('a').getAttribute('href'), '/student/rankings');
  assert.doesNotMatch(document.body.textContent, /own-student/);
});

test('unranked, disconnected and unavailable states never invent a rank', async () => {
  for (const status of ['unranked', 'not_connected', 'unavailable', 'syncing']) {
    api.getStudentGlobalRanking = async () => ({ ranking: { ...ready, status, rank: null } });
    await mount({ ...user, _id: status });
    assert.doesNotMatch(document.body.textContent, /#4/);
    assert.ok(document.querySelector('[role="status"]'));
  }
});

test('retry recovers without modifying points and restricted accounts make no request', async () => {
  let calls = 0;
  api.getStudentGlobalRanking = async () => { calls++; throw new Error('offline'); };
  await mount({ ...user, accessScope: 'assessment_only' });
  assert.equal(calls, 0); assert.equal(document.querySelector('section'), null);
  await mount();
  assert.match(document.body.textContent, /temporarily unavailable/);
  api.getStudentGlobalRanking = async () => ({ ranking: ready });
  await act(async () => document.querySelector('button').click());
  assert.match(document.body.textContent, /Prep Score 120/);
});

test('a late response for a previous student cannot expose their rank', async () => {
  let finish;
  api.getStudentGlobalRanking = () => new Promise((resolve) => { finish = resolve; });
  await mount();
  const first = finish;
  await mount({ ...user, _id: 'other' });
  await act(async () => first({ ranking: ready }));
  assert.doesNotMatch(document.body.textContent, /#4/);
  await act(async () => finish({ ranking: { status: 'unranked' } }));
  assert.match(document.body.textContent, /enter the global ranking/);
});
