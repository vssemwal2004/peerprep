import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Renders the super admin "Suggested companies" page in control mode against stubbed API calls; nothing leaves the process.
let dom, server, root, createRoot, api, Page, calls;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

const request = (key, name, extra = {}) => ({ key, name, variants: [name], status: 'pending', voters: 4, bestQuestionVoters: 2, questions: 2, universities: 3, firstRequestedAt: '2026-10-01T00:00:00Z', lastRequestedAt: new Date().toISOString(),
  jobTitles: ['SDE 1', 'Intern'], mergedInto: null, suggestion: null, verifiedQuestions: 0, reviewedAt: null, ...extra });
const listing = (rows) => ({ rows, counts: { pending: 2, approved: 5, merged: 1, rejected: 0, all: 8 }, threshold: 20, verifiedTags: 3,
  catalog: [{ key: 'amazon', name: 'Amazon' }, { key: 'google', name: 'Google' }], pagination: { page: 1, limit: 25, total: rows.length, pages: 1 } });
const pending = () => [request('amzon', 'Amzon', { variants: ['Amzon', 'amazon inc'], suggestion: { key: 'amazon', name: 'Amazon' } }), request('zoho-corp', 'Zoho Corp')];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/settings/suggested-companies', pretendToBeVisual: true });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in suggested companies test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_PEERPREP_DEPLOYMENT_ROLE': JSON.stringify('control') },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  Page = (await server.ssrLoadModule('/src/admin/companies/SuggestedCompanies.jsx')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  calls = [];
  api.listCompanySuggestions = async (params) => { calls.push(['list', params]); return listing(params.status === 'approved' ? [] : pending()); };
  api.decideCompanySuggestion = async (key, body) => { calls.push(['decide', key, body]); return { row: request(key, key, { status: body.action === 'merge' ? 'merged' : 'approved' }) }; };
  api.updateCompanyVoteSettings = async (body) => {
    calls.push(['settings', body]);
    const list = api.listCompanySuggestions;
    api.listCompanySuggestions = async (params) => ({ ...(await list(params)), threshold: body.voteThreshold });
    return { threshold: body.voteThreshold };
  };
  api.companyTagProgress = async (params) => {
    calls.push(['tags', params]);
    return { threshold: 20, rows: [
      { scopeKey: 'control', scopeLabel: 'Central library', questionId: 'sp1', questionTitle: 'Two Sum', companyKey: 'amazon', company: 'Amazon', voters: 20, threshold: 20, verified: true, latestDate: '2026-10-10' },
      { scopeKey: 'university:geu', scopeLabel: 'Graphic Era University', questionId: 'u1', questionTitle: null, companyKey: 'google', company: 'Google', voters: 7, threshold: 20, verified: false, latestDate: '2026-10-08' },
    ] };
  };
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const render = () => act(async () => root.render(h(MemoryRouter, { initialEntries: ['/admin/settings/suggested-companies'] }, h(Page))));
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const button = (pattern, scope = document) => [...scope.querySelectorAll('button')].find((node) => pattern.test(node.textContent) || pattern.test(node.getAttribute('aria-label') || ''));
const click = async (node) => { assert.ok(node, 'Click target must exist'); await act(async () => node.click()); };
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const requestRows = () => [...document.querySelectorAll('section[aria-labelledby="company-requests-title"] tbody tr')];
const decisions = () => calls.filter(([name]) => name === 'decide').map(([, key, body]) => [key, body]);

test('pending requests render with variants, job titles, reach, suggestion and the summary cards', async () => {
  await render();
  await settle();
  assert.deepEqual(calls[0], ['list', { status: 'pending', page: 1, limit: 25 }]);
  const rows = requestRows();
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Amzon.*Also typed as amazon inc.*SDE 1 · Intern.*4.*2.*3.*Similar to Amazon.*Merge.*Pending/);
  assert.match(rows[1].textContent, /Zoho Corp.*—.*Pending/);
  assert.match(document.body.textContent, /Pending review2.*Approved5.*1 merged · 0 rejected.*Verified question tags3.*Votes needed20/s);
  assert.match(document.querySelector('[role="radiogroup"][aria-label="Request status"]').textContent, /Pending2.*Approved5.*Merged1.*Rejected0.*All8/);
  assert.ok(document.querySelector('nav[aria-label="Breadcrumb"]').textContent.includes('Suggested companies'));
});

test('the students meter shows the best single question against the per-question threshold', async () => {
  await render();
  await settle();
  const meter = requestRows()[0].querySelector('[role="progressbar"]');
  assert.equal(meter.getAttribute('aria-label'), 'Best question: 2 of 20 students a question tag needs');
  assert.equal(meter.getAttribute('aria-valuenow'), '10');
});

test('a decision that empties the last page steps back to the previous page', async () => {
  api.listCompanySuggestions = async (params) => {
    calls.push(['list', params]);
    if (params.page === 2) return { ...listing([]), pagination: { page: 2, limit: 25, total: 25, pages: 1 } };
    return { ...listing(pending()), pagination: { page: params.page, limit: 25, total: 26, pages: 2 } };
  };
  await render();
  await settle();
  await click(button(/^Next$/));
  await settle();
  assert.deepEqual(calls.filter(([name]) => name === 'list').map(([, params]) => params.page), [1, 2, 1]);
  assert.equal(requestRows().length, 2);
  assert.doesNotMatch(document.body.textContent, /No pending requests/);
});

test('a failed rename keeps the dialog open and shows the error inside it', async () => {
  api.decideCompanySuggestion = async () => { throw new Error('Google is already listed. Merge into it instead.'); };
  await render();
  await settle();
  await click(button(/Actions for Zoho Corp/));
  await click([...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'Approve with another name…'));
  const dialog = document.querySelector('[role="dialog"]');
  const input = dialog.querySelector('input');
  await type(input, 'Z');
  assert.equal(button(/^Approve$/, dialog).disabled, true, 'One character is rejected before the request');
  await type(input, 'google');
  assert.equal(button(/^Approve$/, dialog).disabled, true, 'An existing catalog key is caught locally');
  await type(input, 'Zoho');
  await click(button(/^Approve$/, dialog));
  await settle();
  assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent, /already listed/);
});

test('the one-click suggestion merges into the similar catalog company and reloads', async () => {
  await render();
  await settle();
  await click(button(/^Merge Amzon into Amazon$/));
  await settle();
  assert.deepEqual(decisions(), [['amzon', { action: 'merge', mergeInto: 'amazon' }]]);
  assert.equal(calls.filter(([name]) => name === 'list').length, 2, 'The list reloads after a decision');
  assert.match(document.body.textContent, /Merged “Amzon” into Amazon\./);
});

test('the row menu shows only pending actions and Approve decides the request', async () => {
  await render();
  await settle();
  await click(button(/Actions for Zoho Corp/));
  const items = [...document.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent);
  assert.deepEqual(items, ['Approve', 'Approve with another name…', 'Merge into existing…', 'Reject']);
  await click([...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'Approve'));
  await settle();
  assert.deepEqual(decisions(), [['zoho-corp', { action: 'approve' }]]);
});

test('merging from the menu picks a company from the catalog in a dialog', async () => {
  await render();
  await settle();
  await click(button(/Actions for Zoho Corp/));
  await click([...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'Merge into existing…'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.deepEqual([...dialog.querySelectorAll('[role="option"]')].map((node) => node.textContent), ['Amazon', 'Google']);
  await click(button(/^Google$/, dialog));
  await click(button(/^Merge into Google$/, dialog));
  await settle();
  assert.deepEqual(decisions(), [['zoho-corp', { action: 'merge', mergeInto: 'google' }]]);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('bulk approve sends one decision per selected request', async () => {
  await render();
  await settle();
  await click(document.querySelector('input[aria-label="Select all on this page"]'));
  await click(button(/^Approve selected \(2\)$/));
  await settle();
  assert.deepEqual(decisions(), [['amzon', { action: 'approve' }], ['zoho-corp', { action: 'approve' }]]);
  assert.match(document.body.textContent, /Approved 2 companies\./);
});

test('an empty status shows its own message', async () => {
  await render();
  await settle();
  await click([...document.querySelectorAll('[role="radio"]')].find((node) => /^Approved5$/.test(node.textContent)));
  await settle();
  assert.equal(requestRows().length, 0);
  assert.match(document.body.textContent, /No approved companies yet/);
});

test('the vote threshold is changed inline from its stat card', async () => {
  await render();
  await settle();
  await click(button(/^Change$/));
  await type(document.querySelector('input[type="number"]'), '15');
  await click(button(/^Save$/));
  await settle();
  assert.deepEqual(calls.find(([name]) => name === 'settings'), ['settings', { voteThreshold: 15 }]);
  assert.match(document.body.textContent, /Votes needed15/);
  assert.match(document.body.textContent, /Question tags now need 15 confirmations from different students\./);
});

test('the Question tags view lists confirmation progress per question and company', async () => {
  await render();
  await settle();
  await click([...document.querySelectorAll('[role="radio"]')].find((node) => node.textContent === 'Question tags'));
  await settle();
  assert.deepEqual(calls.find(([name]) => name === 'tags'), ['tags', { status: 'all', limit: 100 }]);
  const section = document.querySelector('section[aria-labelledby="question-tags-title"]');
  assert.match(section.textContent, /Collecting tags become visible to students at 20 confirmations\./);
  const rows = [...section.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Two Sum.*Central library.*Central.*Amazon.*100%.*20 \/ 20 students.*Verified/);
  assert.doesNotMatch(rows[0].textContent, /University/);
  assert.match(rows[1].textContent, /Campus question.*Graphic Era University.*University.*Google.*35%.*7 \/ 20 students.*Collecting/);
  assert.ok(document.querySelector('section[aria-labelledby="company-requests-title"]').closest('[hidden]'), 'Requests stay mounted but hidden');
});
