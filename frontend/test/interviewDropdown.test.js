import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// DOM interaction tests, not visual browser tests. All APIs are mocked: no
// interviews are edited/deleted and no mail is sent by this suite.
let dom, server, root, container, createRoot, Menu, Dismiss, Directory, AuthContext, api;
let calls = [], selected = [], copied = [], changed = 0;
let runtimeErrors = [];
const event = { _id: '507f1f77bcf86cd799439011', name: 'Technical round', description: 'Discuss your project.', status: 'published', startDate: '2035-01-01T10:00:00Z', endDate: '2035-01-01T12:00:00Z', participantCount: 1, selectedCount: 2 };
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDialogElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let oldCreateUrl, oldRevokeUrl, oldAnchorClick;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/interviews/one-to-one' });
  for (const key of globals.filter((key) => key !== 'IS_REACT_ACT_ENVIRONMENT')) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.addEventListener('error', (error) => runtimeErrors.push(error.message));
  // jsdom does not implement the dialog top layer; model only its open state.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied.push(text); } } });
  oldCreateUrl = URL.createObjectURL; oldRevokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:interview-test'; URL.revokeObjectURL = () => {};
  oldAnchorClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () { calls.push(['download', this.download]); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Menu = (await server.ssrLoadModule('/src/components/interviews/InterviewActionMenu.jsx')).default;
  Dismiss = (await server.ssrLoadModule('/src/components/PopupDismissManager.jsx')).default;
  Directory = (await server.ssrLoadModule('/src/components/interviews/InterviewDirectory.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  api.listEvents = async () => ({ events: [event], pagination: { page: 1, limit: 25, total: 1, pages: 1 } });
  api.getEvent = async (id) => { calls.push(['get', id]); return event; };
  api.updateEvent = async (...args) => { calls.push(['edit', ...args]); return {}; };
  api.updateEventStatus = async (...args) => { calls.push(['status', ...args]); return {}; };
  api.sendEventInvitations = async (...args) => { calls.push(['invitations', ...args]); return {}; };
  api.deleteEvent = async (...args) => { calls.push(['delete', ...args]); return {}; };
  api.exportParticipantsCsv = async (...args) => { calls.push(['export', ...args]); return 'name,email\nAda,ada@example.com'; };
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  container = document.getElementById('app'); root = createRoot(container);
  calls = []; selected = []; copied = []; changed = 0; runtimeErrors = [];
});
afterEach(() => assert.deepEqual(runtimeErrors, [], 'Interactions must not throw DOM event errors'));
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  URL.createObjectURL = oldCreateUrl; URL.revokeObjectURL = oldRevokeUrl;
  dom.window.HTMLAnchorElement.prototype.click = oldAnchorClick;
  dom.window.close();
  for (const key of globals) { const descriptor = originals.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

async function click(element) {
  assert.ok(element, 'Click target must exist');
  // Crucially, let capture listeners and queued microtasks run BEFORE click.
  // A single element.click() would miss the original dismiss-manager bug.
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); });
  assert.ok(element.isConnected, 'Target must survive pointerdown until click');
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true })); element.click(); });
}
async function mountDirectory() {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/admin/interviews/one-to-one'] }, h(AuthContext.Provider, { value: { user: { role: 'admin' } } }, h(Dismiss), h(Directory, { search: '', onSearchChange() {}, view: 'all', onViewChange() {}, onSelect: (id) => selected.push(id), onChanged: () => { changed += 1; } })))));
}
async function choose(label) {
  await click(document.querySelector('[aria-haspopup="menu"]'));
  await click([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === label));
}
function button(text) { return [...document.querySelectorAll('button')].find((item) => item.textContent === text); }
async function type(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

test('dropdown survives the global dismiss handler and invokes every action exactly once', async () => {
  const invoked = [];
  const icon = () => h('svg', null, h('path', { d: '' }));
  const actions = ['open', 'edit', 'export', 'copy', 'invitations', 'completed', 'cancelled', 'delete'].map((id) => ({ id, label: id, icon, run: () => invoked.push(id) }));
  let rowClicks = 0;
  await act(async () => root.render(h('article', { onClick: () => { rowClicks += 1; } }, h(Dismiss), h(Menu, { name: 'Round', actions }))));
  for (const action of actions) {
    const trigger = document.querySelector('[aria-haspopup="menu"]');
    await click(trigger);
    const menu = document.getElementById(trigger.getAttribute('aria-controls'));
    assert.equal(menu.getAttribute('data-dropdown-direction'), 'down');
    assert.ok(trigger.closest('[data-platform-popup-root]').contains(menu));
    await click([...menu.querySelectorAll('button')].find((item) => item.textContent === action.id).querySelector('path').parentElement.parentElement);
    assert.ok(!document.querySelector('[role="menu"]'), 'Menu should be closed');
  }
  assert.deepEqual(invoked, actions.map((action) => action.id));
  assert.equal(rowClicks, 0, 'Actions must not also activate the card');
});

test('keyboard navigation, Escape, scrolling, and outside dismissal stay functional', async () => {
  await act(async () => root.render(h('div', null, h(Dismiss), h(Menu, { name: 'Round', actions: [{ id: 'a', label: 'First', icon: () => null, run() {} }, { id: 'b', label: 'Second', icon: () => null, run() {} }] }), h('button', { id: 'outside' }, 'Outside'))));
  const trigger = document.querySelector('[aria-haspopup="menu"]');
  await click(trigger);
  assert.equal(document.activeElement.textContent, 'First');
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  assert.equal(document.activeElement.textContent, 'Second');
  await act(async () => window.dispatchEvent(new dom.window.Event('scroll')));
  assert.ok(document.querySelector('[role="menu"]'), 'Scroll must not cancel an action');
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(!document.querySelector('[role="menu"]'), 'Menu should be closed');
  assert.ok(document.activeElement === trigger, 'Escape should return focus to the trigger');
  await click(trigger); await click(document.getElementById('outside'));
  assert.ok(!document.querySelector('[role="menu"]'), 'Menu should be closed');
});

test('view, copy, and export run the actual directory handlers', async () => {
  await mountDirectory();
  await choose('View interview & reports'); assert.deepEqual(selected, [event._id]);
  await choose('Copy management link'); assert.deepEqual(copied, [`http://localhost:5173/admin/interviews/one-to-one/${event._id}`]);
  await choose('Export joined students CSV');
  assert.ok(calls.some(([kind, id]) => kind === 'export' && id === event._id));
  assert.ok(calls.some(([kind]) => kind === 'download'));
});

test('edit opens its form and saves using the existing API', async () => {
  await mountDirectory(); await choose('Edit details & schedule');
  assert.ok(document.querySelector('dialog[open]'));
  await type(document.querySelector('dialog input'), 'Updated interview');
  await click(button('Save changes'));
  assert.equal(calls.find(([kind]) => kind === 'edit')?.[2].name, 'Updated interview');
  assert.ok(!document.querySelector('dialog'), 'Dialog should be closed'); assert.equal(changed, 1);
});

for (const [label, confirmation, kind, expected] of [
  ['Send / resend invitations', 'Send invitations', 'invitations', []],
  ['Mark as complete', 'Mark as complete', 'status', 'completed'],
  ['Cancel interview', 'Cancel interview', 'status', 'cancelled'],
]) test(`${label} opens confirmation and performs no write until confirmed`, async () => {
  await mountDirectory(); await choose(label);
  assert.ok(document.querySelector('dialog[open]')); assert.equal(calls.length, 0);
  await click(button(confirmation));
  assert.deepEqual(calls[0], [kind, event._id, expected]);
  assert.ok(!document.querySelector('dialog'), 'Dialog should be closed');
});

test('delete requires the exact name; cancelling the dialog leaves records untouched', async () => {
  await mountDirectory(); await choose('Delete interview');
  assert.equal(button('Delete interview').disabled, true);
  await click(button('Keep unchanged')); assert.equal(calls.length, 0);
  await choose('Delete interview');
  await type(document.querySelector('dialog input'), event.name);
  assert.equal(button('Delete interview').disabled, false);
  await click(button('Delete interview'));
  assert.equal(calls.filter(([kind]) => kind === 'delete').length, 1);
});

test('API errors keep the confirmation open and permit a successful retry', async () => {
  const original = api.sendEventInvitations;
  try {
    api.sendEventInvitations = async () => { throw new Error('Mail queue unavailable'); };
    await mountDirectory(); await choose('Send / resend invitations');
    await click(button('Send invitations'));
    assert.ok(document.querySelector('dialog[open]'));
    assert.equal(document.querySelector('dialog [role="alert"]').textContent, 'Mail queue unavailable');
    assert.equal(changed, 0);
    api.sendEventInvitations = original;
    await click(button('Send invitations'));
    assert.ok(!document.querySelector('dialog'));
    assert.equal(changed, 1);
  } finally { api.sendEventInvitations = original; }
});
