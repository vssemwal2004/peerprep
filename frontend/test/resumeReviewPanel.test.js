import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

let vite, dom, host, root, Panel, resume, api, advice;
before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, esbuild: { jsx: 'automatic' }, css: { postcss: { plugins: [] } }, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Panel = (await vite.ssrLoadModule('/src/features/resume/review/ResumeCheckPanel.jsx')).default;
  const { normalizeClientResume } = await vite.ssrLoadModule('/src/features/resume/resumeUtils.js');
  resume = normalizeClientResume({ exists: true, basics: { name: 'Student' }, projects: [{ title: 'Campus App', bullets: [{ text: 'Built a job board for students.' }] }] });
  api = (await vite.ssrLoadModule('/src/utils/api.js')).api;
  advice = api.resumeWritingAdvice;
  host = document.getElementById('root');
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  api.resumeWritingAdvice = advice;
});
after(async () => { await vite?.close(); dom?.window.close(); });

const report = { readinessScore: 86, checksPassed: 18, checksTotal: 25, failedChecks: [], categories: [], parsed: {}, job: null };
function fixture(overrides = {}) {
  return {
    requirements: { ready: true, missing: [] }, ats: { status: 'idle', report: null },
    grammar: { status: 'idle', progress: { done: 0, total: 0 } }, visibleIssues: [],
    explain: { status: 'idle' }, jobText: '', running: false, ...overrides,
  };
}

async function mount(check, props = {}) {
  if (!root) root = createRoot(host);
  await act(async () => root.render(createElement(Panel, { check, resume, hasContent: true, onLocate() {}, onBrowseTemplates() {}, ...props })));
}
const button = label => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === label);
const click = async element => { assert.ok(element, 'button must exist'); await act(async () => element.click()); };

test('incomplete draft replaces a cached score with links to the exact missing fields', async () => {
  const missing = { id: 'institute', section: 'education', entryIndex: 0, field: 'institute', label: 'Add your college name' };
  let target;
  await mount(fixture({ requirements: { ready: false, missing: [missing] }, ats: { status: 'done', report } }), { onLocate: place => { target = place; } });
  assert.match(host.textContent, /Finish 1 detail/);
  assert.doesNotMatch(host.textContent, /86|Check my résumé/);
  await click(button(missing.label));
  assert.equal(target, missing);
});

test('job match accepts a job description before the first scan', async () => {
  let received;
  await mount(fixture({ runJobMatch: value => { received = value; } }), { initialTab: 'job' });
  const input = host.querySelector('textarea[aria-label="Job description"]');
  assert.ok(input);
  assert.ok(button('Run quick match').disabled);
  await mount(fixture({ jobText: 'React developer', runJobMatch: value => { received = value; } }), { initialTab: 'job', key: 'saved' });
  await click(button('Run quick match'));
  assert.equal(received, 'React developer');
});

test('ANVI rewrite previews both versions and applies only the selected suggestion', async () => {
  const calls = [];
  api.resumeWritingAdvice = async ({ original }) => { calls.push(original); return { suggestion: 'Created a student job board.' }; };
  const changes = [];
  await mount(fixture({ replaceBullet: async (...args) => { changes.push(args); return { ok: true }; } }), { initialAction: 'rewrite' });
  await click(button('Suggest a rewrite'));
  assert.match(host.textContent, /Created a student job board/);
  assert.match(host.textContent, /Built a job board for students/);
  await click(button('Keep original'));
  assert.equal(changes.length, 0);
  await click(button('Suggest a rewrite'));
  await click(button('Apply rewrite'));
  assert.deepEqual(changes[0], ['projects|0|bullet|0', 'Built a job board for students.', 'Created a student job board.']);
  assert.equal(calls.length, 2);
});

test('live review uses actual PDF stage and grammar counters', async () => {
  await mount(fixture({ running: true, ats: { status: 'running', stage: 'read' }, grammar: { status: 'running', progress: { done: 3, total: 7 } } }));
  assert.match(host.textContent, /Reading your PDF/);
  assert.match(host.textContent, /3 \/ 7 lines/);
  assert.doesNotMatch(host.textContent, /86/);
});

test('grammar results stay available while the PDF is queued and a PDF retry checks only that lane', async () => {
  const stages = [];
  const grammar = { status: 'done', progress: { done: 3, total: 3 } };
  await mount(fixture({ running: true, ats: { status: 'running', stage: 'queued' }, grammar }));
  assert.match(host.textContent, /PDF is in the scan queue/);
  await click(button('Grammar fixes (0)'));
  assert.doesNotMatch(host.textContent, /PDF is in the scan queue/);
  await click(host.querySelector('[aria-label="Back to review overview"]'));
  await mount(fixture({ ats: { status: 'error', error: 'Scan interrupted' }, grammar, runCheck: options => stages.push(options) }));
  await click(button('Retry PDF check'));
  assert.deepEqual(stages, [{ only: 'ats' }]);
});

test('accepted PDF scans reconnect on the next visit through the real API client without exporting again', async t => {
  const { useResumeCheck } = await vite.ssrLoadModule('/src/features/resume/review/useResumeCheck.js');
  const { normalizeClientResume } = await vite.ssrLoadModule('/src/features/resume/resumeUtils.js');
  const { SAMPLE_RESUME } = await vite.ssrLoadModule('/src/features/resume/templates/sampleResume.js');
  const draft = normalizeClientResume(SAMPLE_RESUME);
  let check, exports = 0, pollCount = 0, uploads = 0;
  const blob = new Blob(['%PDF-fixture'], { type: 'application/pdf' });
  const buildPdf = () => { exports++; return blob; };
  function Review() {
    check = useResumeCheck({ userId: 'job-owner', resume: draft, buildPdf, onResumeChange() {} });
    return null;
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') {
      assert.match(url, /\/resume\/review\/ats$/);
      assert.equal(options.headers.Prefer, 'respond-async');
      assert.equal(await options.body.get('file').text(), '%PDF-fixture');
      uploads++;
      return Response.json({ status: 'queued', jobId: 'my-job', retryAfterMs: 10000 }, { status: 202 });
    }
    assert.match(url, /\/resume\/review\/ats\/jobs\/my-job$/);
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    pollCount++;
    return Response.json({ status: 'done', report, checkedAt: new Date().toISOString() });
  });
  root = createRoot(host);
  await act(async () => root.render(createElement(Review)));
  let firstAttempt;
  await act(async () => {
    firstAttempt = check.runCheck({ only: 'ats' });
    void check.runCheck({ only: 'ats' });
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert.equal(check.ats.stage, 'queued');
  await act(async () => root.unmount());
  await firstAttempt;
  root = createRoot(host);
  await act(async () => root.render(createElement(Review)));
  assert.equal(check.resumePending, true);
  await act(async () => check.runCheck({ only: 'ats' }));
  assert.equal(check.ats.report.readinessScore, report.readinessScore);
  assert.deepEqual([exports, uploads, pollCount], [1, 1, 1]);
});
