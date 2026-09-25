import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// Render-only smoke tests: no browser, network requests or database writes.
let server, Browser, Editor, Wizard, AuthContext, ToastProvider;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Browser = (await server.ssrLoadModule('/src/components/interviews/InterviewBrowser.jsx')).default;
  Editor = (await server.ssrLoadModule('/src/components/interviews/InterviewStudentEditor.jsx')).default;
  Wizard = (await server.ssrLoadModule('/src/admin/EventManagement.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ToastProvider = (await server.ssrLoadModule('/src/components/CustomToast.jsx')).ToastProvider;
});
after(async () => { await server?.close(); });

test('cards expose real details and preserve terminal status', () => {
  const markup = renderToStaticMarkup(h(Browser, {
    events: [{ _id: 'round1', name: 'Technical round', description: 'Prepare a project walkthrough.', isSpecial: true, status: 'cancelled', startDate: '2035-01-01', endDate: '2035-01-02', participants: ['a'], allowedParticipants: ['a', 'b'], templateUrl: '/template.pdf' }],
    search: '', view: 'all', onSearchChange() {}, onViewChange() {}, onSelect() {},
  }));
  for (const value of ['Technical round', 'Special interview', 'cancelled', '1 joined', '2 selected', 'Selected students', 'Template attached', 'Actions for Technical round']) assert.ok(markup.includes(value), value);
  assert.ok(!markup.includes('Prepare a project walkthrough.'), 'Descriptions belong in details, not compact rows');
  assert.ok(markup.includes('px-4 py-3'), 'Match Assessment row padding');
  assert.ok(markup.includes('role="listitem"'));
  assert.ok(!markup.includes('<table'));
});

test('empty filtered card lists provide a recovery action', () => {
  const markup = renderToStaticMarkup(h(Browser, { events: [], search: 'missing', view: 'all', onSearchChange() {}, onViewChange() {}, onSelect() {} }));
  assert.ok(markup.includes('No matching interviews'));
  assert.ok(markup.includes('Clear filters'));
});

test('large remote lists render only the requested page and expose pagination', () => {
  const events = Array.from({ length: 25 }, (_, index) => ({ _id: `round${index}`, name: `Interview ${index}`, status: 'published', participantCount: 10, selectedCount: 20 }));
  const markup = renderToStaticMarkup(h(Browser, { events, remote: true, search: '', view: 'all', pagination: { total: 5000, pages: 200, page: 2, limit: 25 }, onSearchChange() {}, onViewChange() {}, onSelect() {}, onPageChange() {}, onPageSizeChange() {} }));
  assert.equal((markup.match(/role="listitem"/g) || []).length, 25);
  assert.ok(markup.includes('26–50 of 5000 interviews'));
  assert.ok(markup.includes('Interviews per page'));
  assert.ok(markup.includes('Actions for Interview 0'));
});

for (const role of ['admin', 'coordinator']) {
  test(`${role}: shared creation page renders step one, not a long submission form`, () => {
    const markup = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/${role}/event/create`] }, h(AuthContext.Provider, { value: { user: { role } } }, h(ToastProvider, null, h(Wizard)))));
    for (const value of ['Interview setup', 'Add students', 'Review &amp; create', 'Step 1 of 3', 'Regular interview', 'Special interview', 'Continue to students']) assert.ok(markup.includes(value), value);
    assert.ok(markup.includes('aria-current="step"'));
    assert.ok(!markup.includes('Who can participate?'));
    assert.ok(!markup.includes('After you create'));
  });
}

test('student entry explains the registered-account boundary and special CSV requirements', () => {
  const props = { special: true, selected: [], onChange() {}, onPendingChange() {} };
  const individual = renderToStaticMarkup(h(Editor, { ...props, mode: 'individual' }));
  assert.ok(individual.includes('No new accounts are created here'));
  const bulk = renderToStaticMarkup(h(Editor, { ...props, mode: 'bulk' }));
  assert.ok(bulk.includes('Sample CSV'));
  assert.ok(bulk.includes('Teacher ID / Coordinator code'));
  assert.ok(bulk.includes('1,000 rows'));
});
