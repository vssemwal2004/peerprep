import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// DOM contract checks only. Evidence and pagination APIs are stubbed; no images,
// production endpoints or database records are fetched.
let dom, server, root, createRoot, Modal, api, calls;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const event = { eventId: 'recent-snapshot', type: 'camera', at: '2035-01-01T10:10:00Z', source: 'snapshot', meta: { evidenceId: 'evidence-document-id' } };
const report = { submission: { id: 'submission-1', studentName: 'Test Student' }, timeline: [event], nextEventCursor: 'cursor-1' };

before(async () => {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:5173/admin/assessment/reports' });
  for (const key of keys.filter((key) => key !== 'IS_REACT_ACT_ENVIRONMENT')) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Modal = (await server.ssrLoadModule('/src/admin/reports/ReportViolationModal.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  calls = [];
  api.getAssessmentEvidence = async (eventId) => {
    calls.push(['evidence', eventId]);
    return { url: 'https://storage.example/private/evidence?signature=test', expiresIn: 120 };
  };
  api.getSubmissionViolations = async (submissionId, options) => {
    calls.push(['page', submissionId, options]);
    return { submission: report.submission, timeline: [event,
      { eventId: 'older-event', type: 'tab_switch', at: '2035-01-01T10:00:00Z', source: 'violation' }], nextEventCursor: null };
  };
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const key of keys) {
    const descriptor = originals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const button = (label) => [...document.querySelectorAll('button')].find((entry) => entry.textContent === label);
const render = async (value = report) => act(async () => root.render(h(Modal, { report: value, loading: false, onClose() {} })));
async function click(label) {
  const target = button(label);
  assert.ok(target, `Button ${label} must exist`);
  await act(async () => target.click());
}

test('evidence resolves lazily from meta.evidenceId and stays open while older pages are appended', async () => {
  await render();
  assert.deepEqual(calls, []);
  await click('View evidence');
  assert.deepEqual(calls[0], ['evidence', 'evidence-document-id']);
  const originalImage = document.querySelector('img[alt="Assessment monitoring evidence"]');
  assert.ok(originalImage);
  assert.equal(originalImage.getAttribute('referrerpolicy'), 'no-referrer');
  await click('Load older events');
  assert.deepEqual(calls[1], ['page', 'submission-1', { before: 'cursor-1' }]);
  assert.ok(document.body.textContent.includes('2 events'), 'Repeated recent rows from the next page must be deduplicated');
  assert.equal(document.querySelector('img[alt="Assessment monitoring evidence"]'), originalImage,
    'Prepending older timeline rows must not remount the existing signed evidence viewer');
  assert.equal(button('Load older events'), undefined);
});

test('page failures retain the cursor for retry and switching students clears prior pagination', async () => {
  await render();
  const successfulPage = api.getSubmissionViolations;
  api.getSubmissionViolations = async (id, options) => { calls.push(['failed-page', id, options]); throw new Error('Temporarily unavailable'); };
  await click('Load older events');
  assert.equal(document.querySelector('[role="alert"]').textContent, 'Temporarily unavailable');
  api.getSubmissionViolations = successfulPage;
  await click('Load older events');
  assert.deepEqual(calls[1], ['page', 'submission-1', { before: 'cursor-1' }]);
  await render({ submission: { id: 'submission-2' }, timeline: [], nextEventCursor: null });
  assert.ok(document.body.textContent.includes('0 events'));
  assert.ok(!document.body.textContent.includes('TAB SWITCH'));
  assert.equal(document.querySelector('img'), null);
});

test('invalid evidence URLs are not rendered and the authorized lookup can be retried', async () => {
  await render();
  api.getAssessmentEvidence = async () => ({ url: 'javascript:alert(1)' });
  await click('View evidence');
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('[role="alert"]').textContent, 'Evidence is unavailable.');
  api.getAssessmentEvidence = async () => ({ url: 'data:image/jpeg;base64,AAAA' });
  await click('View evidence');
  assert.equal(document.querySelector('img').getAttribute('src'), 'data:image/jpeg;base64,AAAA');
});
