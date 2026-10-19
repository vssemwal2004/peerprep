import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, api, pages, events;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

const SUMMARY = {
  generatedAt: new Date().toISOString(),
  totals: { universityWallets: 900, universityAccounts: 25, mainAccounts: 50, holders: 3, students: 65, coordinators: 10 },
  month: { issued: 1050, spent: 10, refunded: 0, netSpent: 10, charges: 1, refunds: 0, pending: 0, freeUses: 4 },
  trend: Array.from({ length: 30 }, (_, index) => ({ date: day(29 - index), issued: index === 29 ? 50 : 0, shared: 0, spent: 0, refunded: 0 })),
  byKind: [],
  features: [{ key: 'ai_interview.start', label: 'AI interview', price: 5, freePerMonth: 1, spent: 10, uses: 2, refunded: 0 }, { key: 'mock_interview.join', label: 'Mock interview', price: 0, freePerMonth: 0, spent: 0, uses: 0, refunded: 0 }],
  pricingVersion: 2,
  universities: [{ universityId: 'north', name: 'North University', active: true, logo: '', balance: 900, distributed30d: 100 }],
  topHolders: [{ id: 'w1', role: 'student', balance: 40, scope: 'PeerPrep main', name: 'Asha Verma' }],
  recent: [{ id: 'm1', kind: 'student_spend', amount: 10, createdAt: new Date().toISOString(), universityId: '__peerprep_platform__', scope: 'PeerPrep main', from: 'Asha Verma', to: 'PeerPrep', feature: 'AI interview' }],
};

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin/prep-coins' });
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key in values ? values[key] : dom.window[key] });
  globalThis.crypto.randomUUID ??= () => 'request-1';
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  events = await server.ssrLoadModule('/src/student/prepCoin/prepCoinEvents.js');
  pages = {
    overview: (await server.ssrLoadModule('/src/admin/prepCoins/PrepCoinsOverview.jsx')).default,
    issue: (await server.ssrLoadModule('/src/admin/prepCoins/IssueCoins.jsx')).default,
    ledger: (await server.ssrLoadModule('/src/admin/prepCoins/CoinLedger.jsx')).default,
    header: (await server.ssrLoadModule('/src/student/prepCoin/HeaderPrepCoin.jsx')).default,
    profile: (await server.ssrLoadModule('/src/student/prepCoin/ProfilePrepCoin.jsx')).default,
  };
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  api.coinConsoleSummary = async () => structuredClone(SUMMARY);
  api.platformWallets = async () => ({ universities: [{ universityId: 'north', name: 'North University', coinBalance: 900 }], movements: [] });
  api.coinLedger = async () => ({ entries: [], nextCursor: null });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

function Where() { const location = useLocation(); return h('output', { id: 'where' }, location.pathname + location.search); }
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function render(path, Page) {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: path.split('?')[0], element: h(Page) })), h(Where))));
  await settle();
}
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));

test('the overview shows live totals, feature spending, holders and the latest movements', async () => {
  await render('/admin/prep-coins', pages.overview);
  const text = document.body.textContent;
  assert.match(text, /In circulation975/);
  assert.match(text, /University wallets900/);
  assert.match(text, /With students65/);
  assert.match(text, /Issued · 30 days1,050/);
  assert.match(text, /AI interview/);
  assert.match(text, /Asha Verma/);
  assert.match(text, /Asha Verma → PeerPrep · AI interview/);
  assert.match(text, /Live/);
  assert.ok(document.querySelector('.prep-coin-icon'), 'the PeerPrep coin is the page mark');
});

test('the overview shows its API error without crashing when summary data is unavailable', async () => {
  api.coinConsoleSummary = async () => { throw new Error('Prep Coin summary is unavailable.'); };
  await render('/admin/prep-coins', pages.overview);
  assert.match(document.body.textContent, /Prep Coin summary is unavailable\./);
  assert.match(document.body.textContent, /Paid features/);
  assert.match(document.body.textContent, /No account holds coins yet\./);
  assert.match(document.body.textContent, /No coins have moved yet\./);
});

test('issuing coins previews the new balance and sends one idempotent request', async () => {
  const calls = [];
  api.topUpUniversityCoins = async (id, body) => { calls.push({ id, ...body }); return { balance: 900 + body.amount }; };
  await render('/admin/prep-coins/issue?university=north', pages.issue);
  assert.equal(document.querySelector('[aria-label="University"] [role="radio"][aria-checked="true"]').textContent.includes('North University'), true, 'the linked university is preselected');
  await act(async () => button('+500').click());
  const review = document.body.textContent;
  assert.match(review, /Now900/);
  assert.match(review, /After1,400/);
  await act(async () => button('Issue 500 coins').click());
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'north');
  assert.equal(calls[0].amount, 500);
  assert.ok(calls[0].requestId);
  assert.match(document.body.textContent, /500 coins issued to North University\. New balance: 1,400\./);
});

test('the ledger keeps its filters in the URL and asks the server for them', async () => {
  const queries = [];
  api.coinLedger = async (query) => { queries.push(query); return { entries: [{ ...SUMMARY.recent[0] }], nextCursor: null }; };
  await render('/admin/prep-coins/ledger', pages.ledger);
  assert.match(document.body.textContent, /Asha Verma → PeerPrep/);
  await act(async () => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Spent').click());
  await settle();
  assert.equal(document.getElementById('where').textContent, '/admin/prep-coins/ledger?kind=spent');
  assert.equal(queries.at(-1).kind, 'spent');
});

test('the student header and profile show the same live balance and flip the coin when it changes', async () => {
  let balance = 120;
  api.walletSummary = async () => ({ balance });
  await act(async () => root.render(h(MemoryRouter, null, h('div', null, h(pages.header), h(pages.profile)))));
  await settle();
  const links = [...document.querySelectorAll('a[href="/student/wallet"]')];
  assert.equal(links.length, 2);
  assert.ok(links.every((link) => link.textContent.includes('120')));
  assert.equal(document.querySelectorAll('.prep-coin-icon--pop').length, 0);
  balance = 150;
  await act(async () => window.dispatchEvent(new window.Event(events.PREP_COIN_CHANGED)));
  await settle();
  assert.ok([...document.querySelectorAll('a[href="/student/wallet"]')].every((link) => link.textContent.includes('150')));
  assert.equal(document.querySelectorAll('.prep-coin-icon--pop').length, 2);
});
