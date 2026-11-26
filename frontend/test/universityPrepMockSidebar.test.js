import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, Sidebar, Dismiss, AuthContext, ThemeProvider, UniversityPolicyProvider, api;
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/u/gamma/admin/overview' });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  Sidebar = (await server.ssrLoadModule('/src/components/GlobalSidebar.jsx')).default;
  Dismiss = (await server.ssrLoadModule('/src/components/PopupDismissManager.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ({ ThemeProvider } = await server.ssrLoadModule('/src/context/ThemeContext.jsx'));
  ({ UniversityPolicyProvider } = await server.ssrLoadModule('/src/platform/UniversityPolicyContext.jsx'));
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

async function mount(adminAccess) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  api.universityPolicy = async () => ({ active: true, permissions: { assessments: false, prepmock: true } });
  const user = { _id: adminAccess, role: 'admin', adminAccess, name: 'University admin' };
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/admin/overview'] },
    h(AuthContext.Provider, { value: { user, authChecked: true, logout: async () => {} } },
      h(UniversityPolicyProvider, null, h(ThemeProvider, null, h(Dismiss), h(Sidebar, { role: 'admin', isExpanded: true })))))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const group = document.querySelector('nav button[title="PrepMock"]');
  assert.ok(group, 'PrepMock is shown when only its module is granted');
  await act(async () => group.click());
  return document.getElementById(group.getAttribute('aria-controls')).textContent;
}

test('regular university admin sees only published mocks in the PrepMock sidebar', async () => {
  const menu = await mount('limited');
  assert.match(menu, /All Mocks/);
  assert.doesNotMatch(menu, /Create Mock|Upload Students|Mock Library|Analysis/);
  assert.equal(document.querySelector('nav button[title="Prep Assessment"]'), null);
});

test('university SPOC sees mock analysis and student upload, without mock authoring', async () => {
  const menu = await mount('full');
  assert.match(menu, /All Mocks/);
  assert.match(menu, /Analysis/);
  assert.match(menu, /Upload Students/);
  assert.doesNotMatch(menu, /Create Mock|Mock Library/);
});
