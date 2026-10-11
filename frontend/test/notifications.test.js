import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Renders the real bell, drawer and items. Requests and sockets are local stubs only.
let dom, server, root, createRoot, NotificationBell, NotificationSidebar, AuthContext, api, socket, listeners;
// The drawer animates with framer-motion, which needs a few more browser globals than plain React.
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const user = { _id: 'student-1', role: 'student', name: 'Aditi Sharma' };
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const items = () => [
  { _id: 'n1', type: 'CHALLENGE', title: 'Weekly target reached', message: '+40 XP and the Weekly Momentum badge for 2026-10-12.', actionUrl: '/student/challenges', isRead: false, createdAt: minutesAgo(1) },
  { _id: 'n2', type: 'BADGE', title: 'Badge earned: Code Initiate', message: 'Solve your first practice problem.', actionUrl: '/student/profile#badges', isRead: false, createdAt: minutesAgo(2) },
  { _id: 'n3', type: 'LEVEL', title: 'Level 2 unlocked: Foundation Builder', message: '120 XP and 20% demonstrated mastery got you here.', actionUrl: '/student/profile#badges', isRead: true, createdAt: minutesAgo(3) },
  { _id: 'n4', type: 'ASSESSMENT', title: 'Assessment Submitted', message: 'Assessment submitted successfully', actionUrl: '/student/assessments', isRead: true, createdAt: minutesAgo(4) },
];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/student/dashboard', pretendToBeVisual: true });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in notification test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  NotificationBell = (await server.ssrLoadModule('/src/components/NotificationBell.jsx')).default;
  NotificationSidebar = (await server.ssrLoadModule('/src/components/NotificationSidebar.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  socket = (await server.ssrLoadModule('/src/utils/socket.js')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
  listeners = new Map();
  api.getNotifications = async () => ({ notifications: items(), unreadCount: 2 });
  api.listStudentAnnouncements = async () => ({ announcements: [] });
  api.markNotificationRead = async () => ({});
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

const renderSidebar = (notifications = items(), unreadCount = 2) => act(async () => root.render(h(MemoryRouter, null,
  h(NotificationSidebar, { isOpen: true, onClose: () => {}, notifications, unreadCount, onMarkAllRead: () => {}, onClearAll: () => {}, onView: () => {}, formatTime: () => 'Just now' }))));
const panel = () => document.getElementById('notification-panel');
const buttonNamed = (pattern) => [...panel().querySelectorAll('button')].find((button) => pattern.test(button.textContent));

test('challenge, badge and level updates are labelled, rewarded and linked to where they live', async () => {
  await renderSidebar();
  const text = panel().textContent;
  assert.match(text, /Challenge.*\+40 XP.*Weekly target reached/);
  assert.match(text, /Badge.*Badge earned: Code Initiate/);
  assert.match(text, /Level up.*Level 2 unlocked: Foundation Builder/);
  for (const label of ['View challenge', 'See badge', 'See level']) assert.ok(buttonNamed(new RegExp(label)), `${label} action is offered`);
  assert.doesNotMatch(text, /\+20 XP/, 'XP pills come only from the message itself');
});

test('the Progress tab collects challenge updates and leaves everyday notices under All', async () => {
  await renderSidebar();
  const progressTab = buttonNamed(/^Progress/);
  assert.match(progressTab.textContent, /Progress3/);
  await act(async () => progressTab.click());
  assert.equal(progressTab.getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(panel().textContent, /Assessment Submitted/);
  assert.match(panel().textContent, /Weekly target reached/);
  await renderSidebar(items().filter((item) => item.type === 'ASSESSMENT'), 0);
  await act(async () => buttonNamed(/^Progress/).click());
  assert.match(panel().textContent, /Completed targets, new badges and level-ups will appear here/);
});

test('the bell counts a pushed progress update once, rings and marks it as a progress update', async () => {
  await act(async () => root.render(h(MemoryRouter, null,
    h(AuthContext.Provider, { value: { user, authChecked: true, isAuthenticated: true } }, h(NotificationBell)))));
  const bell = document.querySelector('button[aria-label="Notifications"]');
  assert.match(bell.textContent, /^2$/);
  const pushed = { _id: 'n9', type: 'BADGE', title: 'Badge earned: First Step', message: 'Complete your first verified activity.', actionUrl: '/student/profile#badges', isRead: false, createdAt: new Date().toISOString() };
  await act(async () => { for (const callback of listeners.get('new_notification') || []) { callback(pushed); callback({ ...pushed }); } });
  assert.match(bell.textContent, /^3$/, 'A duplicate push is not counted twice');
  assert.ok(bell.querySelector('svg.bell-ring'), 'The bell rings for a new arrival');
  assert.equal(bell.querySelector('span[title="New progress update"]')?.textContent, '3');
});
