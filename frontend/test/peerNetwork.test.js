import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h, useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Real toaster, realtime bridge and peer helpers. Requests and sockets are local stubs only.
let dom, server, root, createRoot, toastModule, peerModule, PeerRealtimeBridge, PeerProfilePage, AuthContext, api, socket, listeners;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'CustomEvent', 'Event', 'matchMedia'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
// Prep Mates is opt-in: this student was given it by an admin.
const student = { _id: 'me-1', role: 'student', name: 'Aditi Sharma', universityId: 'alpha', accessScope: 'full', featureAccess: { mode: 'custom', features: ['dashboard', 'prep_coding', 'peers'] } };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
// The toast renderer is lazy-loaded; the first load goes through Vite's SSR transform.
async function waitFor(check, timeoutMs = 8000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the UI');
    await settle();
  }
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/student/dashboard', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in peer test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  toastModule = await server.ssrLoadModule('/src/components/CustomToast.jsx');
  peerModule = await server.ssrLoadModule('/src/student/peers/peerNetwork.js');
  PeerRealtimeBridge = (await server.ssrLoadModule('/src/student/peers/PeerRealtimeBridge.jsx')).default;
  PeerProfilePage = (await server.ssrLoadModule('/src/student/peers/PeerProfilePage.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  socket = (await server.ssrLoadModule('/src/utils/socket.js')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  listeners = new Map();
  socket.connect = () => socket;
  socket.emit = () => {};
  socket.on = (event, callback) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); };
  socket.off = (event, callback) => listeners.get(event)?.delete(callback);
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

test('buildToast keeps old string calls working and normalises rich toasts', () => {
  const { buildToast, DEFAULT_TOAST_DURATION } = toastModule;
  const plain = buildToast('Saved', 'success');
  assert.equal(plain.type, 'success');
  assert.equal(plain.message, 'Saved');
  assert.equal(plain.duration, DEFAULT_TOAST_DURATION);
  const rich = buildToast({ type: 'peer', title: 'Prep Mate request', message: 'x', actions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, null] });
  assert.equal(rich.actions.length, 2, 'at most two buttons');
  assert.ok(rich.duration > DEFAULT_TOAST_DURATION, 'toasts with buttons stay longer');
  assert.equal(buildToast({ message: 'x', type: 'bogus' }, 'info').type, 'info');
  assert.equal(buildToast('x', 'info', { duration: 0 }).duration, 0, '0 = stays until dismissed');
});

test('peer vocabulary never says follow, and button states follow the relation', () => {
  const { PEER_TERMS, mateButtonState, canUsePeers, compactCount } = peerModule;
  assert.ok(Object.values(PEER_TERMS).every((term) => !/follow/i.test(term)));
  assert.equal(mateButtonState({ mate: 'none' }).action, 'request');
  assert.equal(mateButtonState({ mate: 'outgoing' }).label, 'Request sent');
  assert.equal(mateButtonState({ mate: 'incoming' }).action, 'accept');
  assert.equal(mateButtonState({ mate: 'mates' }).action, 'remove');
  assert.equal(mateButtonState({ mate: 'cooldown' }).disabled, true);
  assert.equal(canUsePeers(student), true);
  assert.equal(canUsePeers({ ...student, universityId: null }), false, 'no university and no college: no peers');
  assert.equal(canUsePeers({ ...student, universityId: null, college: 'GEU' }), true, 'shared database: grouped by college');
  assert.equal(canUsePeers({ ...student, accessScope: 'assessment_only' }), false);
  assert.equal(canUsePeers({ ...student, featureAccess: { mode: 'custom', features: ['prep_coding'] } }), false);
  assert.equal(canUsePeers({ ...student, featureAccess: { mode: 'all' } }), false, '"All access" alone: no search, no Prep Mates');
  assert.equal(canUsePeers({ ...student, featureAccess: undefined }), false);
  assert.equal(compactCount(1234), '1.2k');
  assert.equal(compactCount(999), '999');
});

test('toaster renders title, message and buttons, runs the action and dismisses', async () => {
  const { ToastProvider, useToast } = toastModule;
  let clicked = 0;
  function Trigger() {
    const toast = useToast();
    useEffect(() => {
      toast.success('Saved plainly');
      toast.show({ type: 'peer', title: 'Prep Mate request', message: 'Ravi wants to be your Prep Mate.', avatar: { name: 'Ravi Kumar' }, actions: [{ label: 'Accept', variant: 'primary', onClick: () => { clicked += 1; } }] });
    }, [toast]);
    return null;
  }
  await act(async () => root.render(h(ToastProvider, null, h(Trigger))));
  await waitFor(() => document.querySelectorAll('[role="status"]').length === 2);
  const statuses = [...document.querySelectorAll('[role="status"]')];
  assert.equal(statuses.length, 2);
  assert.match(statuses[0].textContent, /Prep Mate request/, 'newest on top');
  assert.match(statuses[0].textContent, /RK/, 'avatar initials');
  assert.match(statuses[1].textContent, /Saved plainly/);
  const accept = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Accept');
  await act(async () => accept.click());
  await settle();
  assert.equal(clicked, 1);
  // Removed after its exit animation.
  await waitFor(() => ![...document.querySelectorAll('[role="status"]')].some((node) => /Prep Mate request/.test(node.textContent)));
  assert.match(document.body.textContent, /Saved plainly/, 'other toasts stay');
});

test('peer profile renders the own-profile layout with badges, coding, sheets and the network list', async () => {
  const { ToastProvider } = toastModule;
  const profile = {
    profile: { id: 'ravi-1', name: 'Ravi Kumar', avatarUrl: '', course: 'B.Tech', branch: 'CSE', semester: 5, bio: 'Graphs and DP.', links: { linkedin: 'https://linkedin.com/in/ravi', github: '', portfolio: '' } },
    progress: {
      modules: [
        { key: 'coding', label: 'Prep Coding', unit: 'problems', solved: 12, total: 4003, breakdown: [{ key: 'easy', solved: 8, total: 928 }, { key: 'medium', solved: 3, total: 2101 }, { key: 'hard', solved: 1, total: 974 }] },
        { key: 'learning', label: 'Learning Modules', unit: 'topics', solved: 6, total: 40 },
        { key: 'quickprep', label: 'Quick Prep', unit: 'questions', solved: 5, total: 50, sheetsStarted: 1, sheetsCompleted: 0 },
      ],
      level: { level: 2, title: 'Quick Solver' }, badges: { earned: 4, milestones: 4, challenges: 0 },
      badgeMetrics: { solved: 12, hardSolved: 1, bestStreak: 7, activeDays: 9, languages: 2, assessments: 1, interviews: 0 },
      coding: { attempted: 15, recentSolved: [{ id: 'p1', source: 'local', title: 'Two Sum', difficulty: 'Easy' }] },
      quickPrepSheets: [{ title: 'Amazon Top 50', slug: 'amazon-top-50', solved: 5, total: 50, completed: false }],
      activity: { byDate: { '2026-11-10': 3, '2026-11-12': 1 }, activeDays: 2 },
    },
    network: { prepMates: 2 },
    relation: { mate: 'none', requestId: null },
  };
  api.getPeerProfile = async () => profile;
  const networkCalls = [];
  api.getPeerNetworkOf = async (id, tab) => { networkCalls.push([id, tab]); return { items: [{ id: 'asha-1', name: 'Asha Verma', branch: 'CSE', semester: 5, relation: { mate: 'mates' } }], nextBefore: null }; };
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/student/peers/ravi-1'] },
    h(AuthContext.Provider, { value: { user: student, authChecked: true, isAuthenticated: true } },
      h(ToastProvider, null, h(Routes, null, h(Route, { path: '/student/peers/:id', element: h(PeerProfilePage) })))))));
  await waitFor(() => /Ravi Kumar/.test(document.body.textContent));
  const text = document.body.textContent;
  for (const expected of ['2 Prep Mates', 'Quick Solver', 'Badges earned', 'Activity', '4 activities in the past year · 2 active days', 'First Accept', 'On Fire', 'Two Sum', 'Amazon Top 50', 'Learning Modules', 'Add Prep Mate', 'Semester 5']) {
    assert.ok(text.includes(expected), `profile shows ${expected}`);
  }
  // Labels of figures that must never appear for another student (the privacy note may name them).
  for (const hidden of ['Prep Score', 'Coin balance', 'PeerPrep since', 'Prep Assessments', 'AI Interviews', 'Peer Interviews']) {
    assert.ok(!text.includes(hidden), `profile hides ${hidden}`);
  }
  assert.match(text, /Contact details, scores and Prep Coins stay private/);
  assert.ok(!/follow|pacer|pacing|keep pace/i.test(text), 'one simple term: Prep Mates');
  assert.ok(text.includes('Unstoppable'), 'locked badges are listed too');
  const matesButton = [...document.querySelectorAll('button')].find((button) => /Prep Mates/.test(button.textContent) && /2/.test(button.textContent));
  await act(async () => matesButton.click());
  await waitFor(() => document.querySelector('[role="dialog"]') && /Asha Verma/.test(document.querySelector('[role="dialog"]').textContent));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Ravi’s Prep Mates/);
  assert.deepEqual(networkCalls[0], ['ravi-1', 'mates']);
});

test('realtime Prep Mate request shows a toast whose Accept calls the API with the request id', async () => {
  const { ToastProvider } = toastModule;
  const accepted = [];
  api.acceptPrepMate = async (requestId) => { accepted.push(requestId); return { relation: { mate: 'mates' } }; };
  const events = [];
  window.addEventListener(peerModule.PEER_NETWORK_EVENT, (event) => events.push(event.detail));
  await act(async () => root.render(h(MemoryRouter, null,
    h(AuthContext.Provider, { value: { user: student, authChecked: true, isAuthenticated: true } },
      h(ToastProvider, null, h(PeerRealtimeBridge))))));
  await settle();
  const push = (payload) => act(async () => { for (const callback of listeners.get('peer-network-updated') || []) callback(payload); });

  // Updates meant for someone else refresh counts but never toast.
  await push({ kind: 'mate-request', requestId: 'r0', actor: { id: 'x', name: 'Other' }, targetId: 'someone-else' });
  await settle();
  assert.equal(document.querySelectorAll('[role="status"]').length, 0);
  assert.equal(events.length, 1);

  await push({ kind: 'mate-request', requestId: 'req-42', actor: { id: 'ravi-1', name: 'Ravi Kumar', avatarUrl: '' }, targetId: 'me-1' });
  await waitFor(() => document.querySelector('[role="status"]'));
  const toastNode = document.querySelector('[role="status"]');
  assert.match(toastNode.textContent, /Ravi Kumar wants to be your Prep Mate/);
  assert.ok(!/follow/i.test(document.body.textContent));
  const accept = [...toastNode.querySelectorAll('button')].find((button) => button.textContent === 'Accept');
  await act(async () => accept.click());
  await waitFor(() => /You and Ravi Kumar are now Prep Mates/.test(document.body.textContent));
  assert.deepEqual(accepted, ['req-42']);

  // An accepted request tells the requester.
  await push({ kind: 'mate-accepted', requestId: 'req-7', actor: { id: 'neha-1', name: 'Neha' }, targetId: 'me-1' });
  await waitFor(() => /Neha accepted your Prep Mate request/.test(document.body.textContent));
});
