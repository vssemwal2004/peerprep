import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, Sidebar, Dismiss, AuthContext, ThemeProvider;
let AdminLayout, CoordinatorLayout, permissions;
let AssessmentModuleLayout;
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173' });
  for (const key of globals) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
  });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Sidebar = (await server.ssrLoadModule('/src/components/GlobalSidebar.jsx')).default;
  Dismiss = (await server.ssrLoadModule('/src/components/PopupDismissManager.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ({ ThemeProvider } = await server.ssrLoadModule('/src/context/ThemeContext.jsx'));
  AdminLayout = (await server.ssrLoadModule('/src/admin/AdminLayout.jsx')).default;
  CoordinatorLayout = (await server.ssrLoadModule('/src/coordinator/CoordinatorLayout.jsx')).default;
  AssessmentModuleLayout = (await server.ssrLoadModule('/src/student/assessment-dashboard/AssessmentModuleLayout.jsx')).default;
  permissions = (await server.ssrLoadModule('/src/admin/coordinatorPermissions.js')).defaultCoordinatorPermissions;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
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

function Location() {
  const location = useLocation();
  return h('output', { id: 'location' }, location.pathname + location.search);
}

function Shell({ role }) {
  const [expanded, setExpanded] = useState(false);
  return h(Sidebar, { role, isExpanded: expanded, onExpand: () => setExpanded(true), onCollapse: () => setExpanded(false) });
}

async function mount(role = 'admin', Layout, accessScope = 'full') {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [`/${role}/overview`] },
    h(AuthContext.Provider, { value: { user: { role, accessScope, name: 'Test User', permissions }, logout: async () => {} } },
      h(ThemeProvider, null, h(Dismiss), Layout ? h(Layout) : h(Shell, { role }), h(Location), h('button', { id: 'outside' }, 'Outside'))))));
}

// Model the real pointer sequence: the global capture listener runs before click.
async function click(target) {
  assert.ok(target, 'Click target must exist');
  assert.ok(!target.closest('[inert]'), 'Click target must be visible and interactive');
  await act(async () => target.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })));
  assert.ok(!target.closest('[inert]'), 'Pointerdown must not close the target navigation panel');
  await act(async () => target.click());
}

const titled = (title) => document.querySelector(`nav button[title="${title}"]`);
const expandedGroups = () => [...document.querySelectorAll('nav > div > button[aria-expanded="true"]')];

for (const role of ['admin', 'coordinator', 'student']) {
  test(`${role}: every navigation dropdown opens, toggles, and its child links navigate`, async () => {
    await mount(role);
    assert.equal(expandedGroups().length, 0, 'Groups start closed');
    const groups = [...document.querySelectorAll('nav > div > button')];
    assert.ok(groups.length);
    for (const group of groups) {
      await click(group);
      assert.equal(group.getAttribute('aria-expanded'), 'true');
      assert.equal(expandedGroups().length, 1);
      const panel = document.getElementById(group.getAttribute('aria-controls'));
      assert.ok(panel && !panel.hasAttribute('inert'));
      const links = [...panel.querySelectorAll('a')].filter((item) => !item.closest('[inert]'));
      for (const link of links) {
        await click(link);
        assert.equal(document.getElementById('location').textContent, link.getAttribute('href'));
        assert.equal(group.getAttribute('aria-expanded'), 'true');
      }
      await click(group);
      assert.equal(group.getAttribute('aria-expanded'), 'false');
    }
  });
}

for (const role of ['admin', 'coordinator']) {
  test(`${role}: nested interview dropdown and links survive pointerdown`, async () => {
    await mount(role);
    const parent = titled('Interviews');
    await click(parent);
    await click(document.querySelector('[aria-label="Expand One-to-One Interviews"]'));
    assert.equal(parent.getAttribute('aria-expanded'), 'true');
    const toggle = document.querySelector('[aria-label="Collapse One-to-One Interviews"]');
    const panel = toggle.parentElement.nextElementSibling;
    for (const link of panel.querySelectorAll('a')) {
      await click(link);
      assert.equal(document.getElementById('location').textContent, link.getAttribute('href'));
      assert.equal(parent.getAttribute('aria-expanded'), 'true');
      assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    }
    await click(toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(parent.getAttribute('aria-expanded'), 'true');
  });

  test(`${role}: hover expansion uses the 20% narrower width and collapse stays 4rem`, async () => {
    await mount(role, role === 'admin' ? AdminLayout : CoordinatorLayout);
    const sidebar = document.querySelector('aside');
    const layout = sidebar.parentElement;
    const content = layout.querySelector('main[data-app-scroll-container]');
    assert.ok(layout.classList.contains('h-screen'));
    assert.ok(layout.classList.contains('overflow-hidden'));
    assert.ok(content.classList.contains('h-screen'));
    assert.ok(content.classList.contains('overflow-y-auto'));
    assert.equal(layout.style.getPropertyValue('--admin-sidebar-width'), '4rem');
    await act(async () => sidebar.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })));
    assert.equal(layout.style.getPropertyValue('--admin-sidebar-width'), '13.6rem');
    await act(async () => sidebar.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    assert.equal(layout.style.getPropertyValue('--admin-sidebar-width'), '4rem');
  });
}

test('student assessment module keeps its title outside the content scroller', async () => {
  await act(async () => root.render(h(AssessmentModuleLayout, { title: 'Your Assessments' }, h('div', { id: 'assessment-rows' }, 'Rows'))));
  const shell = document.querySelector('[data-page-header]').parentElement.parentElement;
  const title = document.querySelector('[data-page-header]');
  const content = title.nextElementSibling;

  assert.ok(shell.classList.contains('h-screen'));
  assert.ok(shell.classList.contains('overflow-hidden'));
  assert.equal(title.textContent, 'Your Assessments');
  assert.ok(content.classList.contains('overflow-y-auto'));
  assert.ok(content.contains(document.getElementById('assessment-rows')));
});

test('account popup still supports theme switching, outside dismissal and Escape without closing navigation', async () => {
  await mount();
  const group = titled('Assessments');
  await click(group);
  const account = document.querySelector('[aria-label="Open account menu"]');
  await click(account);
  const expectedPosition = document.createElement('div');
  expectedPosition.style.left = 'calc(13.6rem + 0.75rem)';
  assert.equal(document.getElementById(account.getAttribute('aria-controls')).style.left, expectedPosition.style.left);
  await click(document.querySelector('[role="switch"]'));
  assert.equal(document.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(account.getAttribute('aria-expanded'), 'false');
  assert.equal(group.getAttribute('aria-expanded'), 'true');
  await click(account);
  await click(document.getElementById('outside'));
  assert.equal(account.getAttribute('aria-expanded'), 'false');
  assert.equal(group.getAttribute('aria-expanded'), 'true');
});

test('switching groups keeps just the selected section open', async () => {
  await mount();
  for (const label of ['Assessments', 'Library', 'Interviews', 'Settings']) {
    await click(titled(label));
    assert.deepEqual(expandedGroups().map((group) => group.title), [label]);
  }
});

test('AI Interviews label opens its submenu and each option navigates with an exact active state', async () => {
  await mount();
  await click(titled('Interviews'));
  await click([...document.querySelectorAll('nav a')].find((link) => link.textContent === 'AI Interviews'));
  const toggle = document.querySelector('[aria-label="Collapse AI Interviews"]');
  assert.ok(toggle, 'Clicking the label must expand the AI submenu');
  const panel = document.getElementById(toggle.getAttribute('aria-controls'));
  const links = [...panel.querySelectorAll('a')];
  assert.deepEqual(links.map((link) => link.textContent), ['All AI Interviews', 'Create AI Interview', 'Reports']);
  for (const link of links) {
    await click(link);
    assert.equal(document.getElementById('location').textContent, link.getAttribute('href'));
    assert.deepEqual([...panel.querySelectorAll('[aria-current="page"]')], [link]);
  }
  await click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('assessment-only students can open and use their only group', async () => {
  await mount('student', undefined, 'assessment_only');
  await click(titled('Assessments'));
  const links = document.querySelectorAll('nav a');
  assert.equal(links.length, 3);
  for (const link of links) await click(link);
});
