import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { closestCompany, companySimilarity, filterOptions, mergeCompanyTags, normalizeCompany } from '../src/student/celebration/companyMatch.js';

let dom, server, root, createRoot, AcceptedCelebration, AuthContext, api, calls, closed, viewer;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'getComputedStyle', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const report = { source: 'problem', questionId: 'p1' };
const storageKey = 'peerprep:interview-report:student-a:problem:p1';

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  globalThis.fetch = async () => { throw new Error('No live requests allowed'); };
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  AcceptedCelebration = (await server.ssrLoadModule('/src/student/celebration/AcceptedCelebration.jsx')).default;
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  ({ AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.jsx'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  document.body.style.overflow = '';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
  calls = []; closed = 0; viewer = { _id: 'student-a' };
  api.questionInterviewOptions = async () => { calls.push('options'); return { companies: ['Amazon', 'Google', 'Microsoft'], jobTitles: ['Software Engineer', 'SDE Intern'] }; };
  api.reportQuestionInterview = async (source, id, body) => { calls.push({ source, id, body }); return { saved: true, company: { name: body.company, status: body.company === 'Google' ? 'listed' : 'pending' } }; };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const popup = () => document.querySelector('dialog[data-accepted-celebration]');
const text = () => popup()?.textContent || '';
const button = (label) => [...document.querySelectorAll('button')].find((node) => (label instanceof RegExp ? label.test(node.textContent) : node.textContent === label));
const click = async (node) => { assert.ok(node, 'Control exists'); await act(async () => node.click()); };
const combobox = (label) => [...document.querySelectorAll('input[role="combobox"]')].find((node) => document.querySelector(`label[for="${node.id}"]`)?.textContent === label);
async function type(input, value) {
  assert.ok(input, 'Field exists');
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { input.focus(); setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
}
async function mount(props = {}) {
  const popupElement = h(AcceptedCelebration, { open: true, kind: 'coding', title: 'Two Sum', onClose: () => { closed += 1; },
    stats: { passed: 12, total: 12, runtimeMs: 48, memoryKb: 20480, language: 'Python 3' }, report, ...props });
  await act(async () => root.render(viewer ? h(AuthContext.Provider, { value: { user: viewer } }, popupElement) : popupElement));
}
async function remount(props) {
  await act(async () => root.unmount()); root = createRoot(document.getElementById('app'));
  await mount(props);
}
async function openForm() {
  await mount();
  await click(button('Yes'));
  assert.deepEqual(calls, ['options']);
}

test('coding celebration shows the accepted heading, real stats and the interview question', async () => {
  await mount();
  assert.ok(document.querySelector('dialog[data-accepted-celebration][open]'));
  assert.match(text(), /Accepted/);
  assert.match(text(), /Congratulations!/);
  assert.match(text(), /All 12 hidden test cases passed/);
  assert.match(text(), /48 ms/); assert.match(text(), /20 MB/); assert.match(text(), /Python 3/);
  assert.match(text(), /Was this question asked in one of your interviews\?/);
  assert.doesNotMatch(text(), /coins?\b/i, 'The coin is decorative; no currency is promised');
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(document.activeElement, document.querySelector('[aria-label="Close celebration"]'));
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(closed, 1);
});

test('practice variant and unknown totals use honest copy', async () => {
  await mount({ kind: 'practice', stats: null });
  assert.match(text(), /Correct answer — nicely done/);
  assert.equal(document.querySelector('[aria-label="Submission stats"]'), null);
  await act(async () => root.render(h(AcceptedCelebration, { open: true, kind: 'coding', stats: { total: 0 }, onClose() {} })));
  assert.match(text(), /All hidden test cases passed/);
});

test('answering No remembers the choice and never opens the form', async () => {
  await mount();
  await click(button('No'));
  assert.equal(localStorage.getItem(storageKey), 'no');
  assert.match(text(), /Thanks — good luck with your next one/);
  assert.equal(document.querySelector('[data-interview-report] form'), null);
  assert.deepEqual(calls, []);
});

test('Yes with a new company submits the report and explains the review', async () => {
  await openForm();
  const submit = button('Submit');
  assert.equal(submit.disabled, true);
  await type(combobox('Company'), 'Acme Robotics');
  await type(document.querySelector('input[type="date"]'), '2026-09-15');
  await type(combobox('Job title'), 'SDE Intern');
  assert.equal(button('Submit').disabled, true, 'An unlisted name needs the explicit Add step');
  assert.match(text(), /Pick a company from the list, or add it as a new company\./);
  await click(button('Add “Acme Robotics” as a new company'));
  assert.match(text(), /New company · reviewed by PeerPrep before it appears on questions/);
  assert.equal(document.activeElement, combobox('Company'), 'Focus stays on the company field after the chip disappears');
  assert.equal(button('Submit').disabled, false);
  await click(button('Submit'));
  assert.deepEqual(calls.at(-1), { source: 'problem', id: 'p1', body: { interviewDate: '2026-09-15', company: 'Acme Robotics', jobTitle: 'SDE Intern' } });
  assert.match(text(), /Thanks! “Acme Robotics” was sent to the PeerPrep team for review\. Once approved and confirmed by enough students, it will appear on this question\./);
  assert.equal(localStorage.getItem(storageKey), 'yes');
});

test('catalog companies are suggested with keyboard support and listed reports say so', async () => {
  await openForm();
  const company = combobox('Company');
  await type(company, 'goo');
  const list = document.getElementById(company.getAttribute('aria-controls'));
  assert.equal(company.getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...list.querySelectorAll('[role="option"]')].map((node) => node.textContent), ['Google']);
  await act(async () => company.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  assert.equal(company.getAttribute('aria-activedescendant'), list.querySelector('[role="option"]').id);
  await act(async () => company.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.equal(company.value, 'Google');
  assert.equal(button(/as a new company/), undefined);
  await type(document.querySelector('input[type="date"]'), '2026-08-01');
  await type(combobox('Job title'), 'Software Engineer');
  await click(button('Submit'));
  assert.match(text(), /When enough students confirm, this question will show the Google tag\./);
});

test('a close misspelling offers the catalog name', async () => {
  await openForm();
  await type(combobox('Company'), 'Amazn');
  const suggestion = button(/Did you mean/);
  assert.equal(suggestion?.textContent, 'Did you mean Amazon?');
  assert.ok(button('Add “Amazn” as a new company'));
  await click(suggestion);
  assert.equal(combobox('Company').value, 'Amazon');
});

test('report errors are announced and the form stays editable', async () => {
  api.reportQuestionInterview = async () => { throw new Error('Too many interview reports today. Try again tomorrow.'); };
  await openForm();
  await type(combobox('Company'), 'Microsoft');
  await type(document.querySelector('input[type="date"]'), '2026-07-01');
  await type(combobox('Job title'), 'SDE Intern');
  await click(button('Submit'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Too many interview reports/);
  assert.equal(localStorage.getItem(storageKey), null);
  assert.ok(button('Submit'));
});

test('an already answered question and a missing report hide the panel', async () => {
  localStorage.setItem(storageKey, 'yes');
  await mount();
  assert.match(text(), /Congratulations!/);
  assert.doesNotMatch(text(), /asked in one of your interviews/);
  await act(async () => root.unmount()); root = createRoot(document.getElementById('app'));
  localStorage.clear();
  await mount({ report: null });
  assert.doesNotMatch(text(), /asked in one of your interviews/);
  await act(async () => root.render(h(AcceptedCelebration, { open: false, onClose() {} })));
  assert.equal(popup(), null);
  assert.equal(document.body.style.overflow, '');
});

test('the answered flag belongs to the signed-in student, and nothing is remembered without one', async () => {
  await mount();
  await click(button('No'));
  assert.equal(localStorage.getItem(storageKey), 'no');
  viewer = { _id: 'student-b' };
  await remount();
  assert.match(text(), /asked in one of your interviews/, 'Another student on the same browser is still asked');
  viewer = null;
  localStorage.clear();
  await remount();
  await click(button('No'));
  assert.equal(localStorage.length, 0);
});

test('focus follows each step of the interview panel', async () => {
  await mount();
  await click(button('Yes'));
  assert.equal(document.activeElement, document.querySelector('input[type="date"]'));
  await click(button('Cancel'));
  assert.equal(document.activeElement, button('Yes'));
  await click(button('No'));
  assert.equal(document.activeElement, popup().querySelector('[role="status"]'));
});

test('the backdrop closes on a full click but not on a scrollbar press or a drag that ends outside', async () => {
  await mount();
  const viewport = popup().querySelector('.accepted-celebration__viewport');
  Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 600 }, clientHeight: { configurable: true, value: 500 } });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 616, height: 500, right: 616, bottom: 500 });
  const fire = (node, type, clientX) => act(async () => node.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX, clientY: 100 })));
  await fire(viewport, 'mousedown', 608);
  await fire(viewport, 'click', 608);
  assert.equal(closed, 0, 'A scrollbar press keeps the popup open');
  await fire(popup().querySelector('h2'), 'mousedown', 300);
  await fire(viewport, 'click', 10);
  assert.equal(closed, 0, 'A press that started inside the card keeps the popup open');
  await fire(viewport, 'mousedown', 10);
  await fire(viewport, 'click', 10);
  assert.equal(closed, 1);
});

test('companyMatch normalizes, ranks and merges company names', () => {
  assert.equal(normalizeCompany('Amazon.com, Inc.'), 'amazon com');
  assert.equal(normalizeCompany('Infosys Technologies Pvt. Ltd'), 'infosys');
  assert.ok(companySimilarity('Amazn', 'Amazon') >= 0.75);
  assert.equal(closestCompany('Amazn', ['Amazon', 'Adobe']), 'Amazon');
  assert.equal(closestCompany('Micro soft LLC', ['Microsoft', 'Google']), 'Microsoft');
  assert.equal(closestCompany('amazon', ['Amazon']), null, 'Exact matches need no suggestion');
  assert.equal(closestCompany('Zeta', ['Amazon', 'Google']), null);
  assert.deepEqual(filterOptions(['Bloomberg', 'Google', 'Goldman Sachs', 'Big Go'], 'go'), ['Google', 'Goldman Sachs', 'Big Go']);
  assert.equal(filterOptions(Array.from({ length: 20 }, (_, index) => `Co ${index}`), '').length, 8);
  assert.deepEqual(mergeCompanyTags([{ company: 'Google', voters: 21 }], ['google', 'Amazon']),
    [{ name: 'Google', voters: 21, verified: true }, { name: 'Amazon', voters: 0, verified: false }]);
});
