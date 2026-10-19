import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { pathAllowed } from '../src/platform/universityPermissions.js';

let dom, server, root, createRoot, Page, api, engine;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

const points = () => ({ Easy: 1, Medium: 2, Hard: 4 });
const activity = (levelSource = 'content') => ({ enabled: true, units: 1, levelSource, level: 'Medium' });
const CONFIG = {
  formula: { volumeExponent: 0.4, qualityExponent: 1.5, scale: 1, decimalPlaces: 2 },
  modules: {
    coding: { weight: 1, points: points(), activities: { problemSolved: activity() } },
    assessment: { weight: 1, points: points(), passPercent: 40, activities: { assessmentCompleted: activity() } },
    interview: { weight: 1, points: points(), passPercent: 40, activities: { mockCompleted: activity('fixed'), aiCompleted: activity() } },
    learning: { weight: 1, points: points(), completionPercent: 100, topicLevels: { easy: 'Easy', 'easy-medium': 'Easy', medium: 'Medium', 'medium-hard': 'Hard', hard: 'Hard' }, activities: { videoCompleted: activity() } },
  },
};
const WORKSPACE = {
  active: { version: 5, config: CONFIG }, draft: null, universities: [{ id: 'north', name: 'North University' }],
  history: [{ version: 6, status: 'active', changeReason: 'Launch', publishedAt: '2026-10-19T10:00:00Z' }, { version: 5, status: 'archived', changeReason: 'Defaults', publishedAt: '2026-10-18T10:00:00Z' }],
};

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin/settings/prep-score-adjustment' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Page = (await server.ssrLoadModule('/src/admin/PrepScoreAdjustment.jsx')).default;
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  engine = await server.ssrLoadModule('/src/admin/prepScore/engine.js');
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  api.prepScorePolicy = async () => structuredClone(WORKSPACE);
  api.prepScoreSyncStatus = async () => ({ servingVersion: 6, rebuilding: false, processed: 0 });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const mount = () => act(async () => root.render(h(Page)));
const setInput = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, String(value));
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};
const simulatorTotal = () => document.querySelector('#simulator-title').closest('section').querySelector('tfoot td:last-child').textContent;

test('the Master Admin sees the formula with named variables and every value is editable', async () => {
  await mount();
  const text = document.body.textContent;
  assert.match(text, /Prep Score Adjustment/);
  assert.match(text, /Module score = S × Nα × Qβ/);
  for (const label of ['Volume exponent', 'Difficulty exponent', 'Scale', 'Decimal places', 'Pass mark', 'Video completion', 'Topic difficulty → level']) assert.ok(text.includes(label), label);
  assert.equal(document.querySelectorAll('section[aria-labelledby^="module-"]').length, 4, 'one card per module');
  assert.match(text, /Live: version 5/);
  assert.match(text, /Restore as draft/, 'older versions can be restored');
});

test('the simulator follows unsaved values exactly like the server formula', async () => {
  await mount();
  const counts = { coding: { Easy: 12, Medium: 8, Hard: 3 }, assessment: { Easy: 1, Medium: 2, Hard: 1 }, interview: { Easy: 0, Medium: 2, Hard: 1 }, learning: { Easy: 6, Medium: 4, Hard: 2 } };
  assert.equal(Number(simulatorTotal().replace(/,/g, '')), engine.simulate(CONFIG, counts).total);
  const hard = [...document.querySelectorAll('section[aria-labelledby="module-coding"] input')].find((input) => input.closest('label')?.textContent.startsWith('Hardh'));
  await setInput(hard, 9);
  const changed = structuredClone(CONFIG);
  changed.modules.coding.points.Hard = 9;
  assert.equal(Number(simulatorTotal().replace(/,/g, '')), engine.simulate(changed, counts).total);
  assert.match(document.body.textContent, /Unsaved changes/);
});

test('invalid values block saving with a plain explanation', async () => {
  await mount();
  const easy = [...document.querySelectorAll('section[aria-labelledby="module-coding"] input')].find((input) => input.closest('label')?.textContent.startsWith('Easye'));
  await setInput(easy, 7);
  assert.match(document.body.textContent, /Prep Coding: points must rise from Easy to Medium to Hard/);
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Save draft'));
  assert.equal(save.disabled, true);
});

test('only the Master Admin can open the page: university admins are routed away', () => {
  assert.equal(pathAllowed('/admin/settings/prep-score-adjustment', { questions: true, learning: true }, 'admin', '', { university: true }), false);
  assert.equal(pathAllowed('/admin/settings/prep-score-adjustment', null, 'admin', '', { university: false }), true);
});
