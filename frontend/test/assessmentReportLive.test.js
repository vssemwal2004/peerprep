import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// DOM contract checks only. The roster API, the legacy reports API and the
// socket are stubbed in-process; nothing reaches a backend or database.
let dom, server, root, createRoot, api, socketService, useLiveAssessmentRoster, ReportModal, TableRow;
let toastShown = false;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function fakeSocket() {
  const handlers = new Map();
  const emitted = [];
  const socket = {
    connected: true,
    emitted,
    on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); },
    off(event, fn) { handlers.get(event)?.delete(fn); },
    emit(event, data, ack) { emitted.push([event, data]); ack?.({ ok: true }); },
    timeout() { return { emit: (event, data, ack) => { emitted.push([event, data]); ack(null, { ok: true }); } }; },
    fire(event, payload) { [...(handlers.get(event) || [])].forEach((fn) => fn(payload)); },
    listenerCount(event) { return handlers.get(event)?.size || 0; },
  };
  return socket;
}

before(async () => {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:5173/admin/assessment/reports', pretendToBeVisual: true });
  for (const key of keys.filter((key) => key !== 'IS_REACT_ACT_ENVIRONMENT')) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  socketService = (await server.ssrLoadModule('/src/utils/socket.js')).default;
  useLiveAssessmentRoster = (await server.ssrLoadModule('/src/admin/reports/useLiveAssessmentRoster.js')).default;
  ReportModal = (await server.ssrLoadModule('/src/student/assessment-dashboard/AssessmentReportModal.jsx')).default;
  TableRow = (await server.ssrLoadModule('/src/admin/reports/ReportComponents.jsx')).TableRow;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
});

after(async () => {
  if (root) await act(async () => root.unmount());
  // ToastProvider clears each toast with a 4 s timer; let it fire before the DOM globals go away.
  if (toastShown) await wait(4100);
  await server?.close();
  dom?.window.close();
  for (const key of keys) {
    const descriptor = originals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => act(async () => { await wait(0); });

test('student modal shows "Result not announced yet" and no score when the result is held', async () => {
  const held = { assessmentName: 'DSA Mid-term', status: 'Completed', totalQuestions: 12, score: null, totalMarks: null, accuracy: null, evaluationStatus: 'completed', permissions: { resultReleased: false } };
  await act(async () => root.render(h(ReportModal, { report: held, open: true, onClose() {} })));
  const text = document.body.textContent;
  assert.ok(text.includes('Result not announced yet'));
  assert.ok(!text.includes('Final Score'));
  assert.ok(!text.includes('Accuracy'));
  assert.ok(!/\d+%/.test(text), 'no percentage or score ring is rendered');
  assert.ok(!text.includes('Evaluation pending'));

  const evaluating = { ...held, permissions: { resultReleased: true, canViewPercentage: true }, evaluationStatus: 'processing' };
  await act(async () => root.render(h(ReportModal, { report: evaluating, open: true, onClose() {} })));
  assert.ok(document.body.textContent.includes('Result not announced yet'), 'released but still evaluating stays unannounced');

  const released = { ...held, score: 9, totalMarks: 12, accuracy: 75, permissions: { resultReleased: true, canViewPercentage: true }, correctAnswers: 9, wrongAnswers: 3, skippedQuestions: 0 };
  await act(async () => root.render(h(ReportModal, { report: released, open: true, onClose() {} })));
  assert.ok(document.body.textContent.includes('Final Score'));
  assert.ok(!document.body.textContent.includes('Result not announced yet'));
});

test('admin roster row shows Evaluating…, Needs review and a dash, never the old labels', async () => {
  const visibleColumns = { student: true, status: true, progress: true, score: true, startedAt: false, submittedAt: false, time: false, violations: true };
  const base = { maxMarks: 20, tabSwitches: 0, fullscreenExits: 0, cameraFlags: 0, aiViolationCount: 0, violationScore: 0 };
  const rows = [
    { ...base, key: 'a', submissionId: 'a', name: 'Coding Judge', status: 'submitted', evaluationStatus: 'processing', score: null },
    { ...base, key: 'b', submissionId: 'b', name: 'Broken Grade', status: 'submitted', evaluationStatus: 'failed', score: null },
    { ...base, key: 'c', submissionId: 'c', name: 'Still Writing', status: 'in_progress', evaluationStatus: 'processing', score: null, answeredCount: 2, totalQuestions: 5 },
    { ...base, key: 'd', submissionId: 'd', name: 'Graded', status: 'submitted', evaluationStatus: 'completed', score: 15, percentage: 75 },
  ];
  const props = { visibleColumns, openStudentDetail() {}, openViolationReport() {}, toast: { success() {} } };
  await act(async () => root.render(h('table', null, h('tbody', null, rows.map((row) => h(TableRow, { key: row.key, row, ...props }))))));
  const cells = (key) => document.querySelector(`tr[data-row-key="${key}"]`).textContent;
  assert.ok(cells('a').includes('Evaluating…'));
  assert.ok(cells('b').includes('Needs review'));
  assert.ok(!cells('c').includes('Evaluating'), 'in-progress attempts never show the evaluating chip');
  assert.ok(cells('c').includes('—'));
  assert.ok(cells('d').includes('15/20') && cells('d').includes('75%'));
  const text = document.body.textContent;
  assert.ok(!text.includes('Evaluation pending') && !text.includes('Not available'));
});

function Harness({ id, options, onValue }) {
  onValue(useLiveAssessmentRoster(id, options));
  return null;
}

test('live roster: full load, subscribe, hints batched into one delta per interval', async () => {
  const socket = fakeSocket();
  const originalConnect = socketService.connect;
  socketService.connect = () => socket;
  const calls = [];
  api.getAssessmentReportRoster = async (id, { since } = {}) => {
    calls.push([id, since || null]);
    if (!since) {
      return {
        full: true, cursor: 'c1', serverTime: '2035-01-01T10:00:00Z',
        assessment: { _id: id, title: 'Live test', totalMarks: 20, passPercentage: 40 },
        rows: [
          { key: 's1', submissionId: 's1', studentId: 'u1', name: 'Asha', status: 'in_progress', answeredCount: 1 },
          { key: 'u2', submissionId: null, studentId: 'u2', name: 'Bilal', status: 'not_started' },
        ],
      };
    }
    return { full: false, cursor: 'c2', rows: [{ key: 's2', submissionId: 's2', studentId: 'u2', name: 'Bilal', status: 'in_progress', answeredCount: 0 }] };
  };
  let latest;
  try {
    await act(async () => root.render(h(Harness, { id: 'a1', options: { intervalMs: 250 }, onValue: (value) => { latest = value; } })));
    await flush();
    assert.deepEqual(calls, [['a1', null]]);
    assert.equal(latest.rows.length, 2);
    assert.equal(latest.assessment.title, 'Live test');
    assert.equal(latest.live, true);
    assert.deepEqual(socket.emitted[0], ['assessment-report:subscribe', { assessmentId: 'a1' }]);

    await act(async () => { await wait(320); });
    assert.deepEqual(calls, [['a1', null]], 'an interval with no hints costs no request while live');

    await act(async () => {
      socket.fire('assessment-report:changed', { assessmentId: 'other', rev: 1, kinds: ['answers'] });
      socket.fire('assessment-report:changed', { assessmentId: 'a1', rev: 2, kinds: ['answers'] });
      socket.fire('assessment-report:changed', { assessmentId: 'a1', rev: 3, kinds: ['started'] });
    });
    assert.deepEqual(calls, [['a1', null]], 'hints never fetch on their own');
    assert.equal(latest.pendingChanges, true);

    await act(async () => { await wait(300); });
    await flush();
    assert.deepEqual(calls, [['a1', null], ['a1', 'c1']], 'the next interval sends one delta request using the cursor');
    assert.equal(latest.pendingChanges, false);
    assert.equal(latest.rows.length, 2, 'the started student replaces its placeholder');
    assert.ok(latest.rows.some((row) => row.key === 's2'));
    assert.ok(latest.recentlyChanged.has('s2'));
    assert.deepEqual(latest.activity.map((event) => [event.name, event.type]), [['Bilal', 'started']], 'the activity feed records the start');
  } finally {
    await act(async () => root.unmount());
    root = null;
    socketService.connect = originalConnect;
  }
  assert.ok(socket.emitted.some(([event, data]) => event === 'assessment-report:unsubscribe' && data.assessmentId === 'a1'));
  assert.equal(socket.listenerCount('assessment-report:changed'), 0);
});

test('report page: KPIs and charts from the roster, client filter/sort, release results with confirm', async () => {
  const socket = fakeSocket();
  const originalConnect = socketService.connect;
  socketService.connect = () => socket;
  dom.reconfigure({ url: 'http://localhost:5173/admin/assessment/reports?assessmentId=a9' });
  const assessment = { _id: 'a9', title: 'Placement Mock', assessmentType: 'mixed', startTime: '2035-01-01T09:00:00Z', endTime: '2035-01-01T11:00:00Z', duration: 120 };
  const rosterCalls = [];
  const releaseCalls = [];
  api.listAssessments = async () => ({ assessments: [assessment] });
  api.getAssessmentReports = async () => ({ assessments: [assessment], students: [], summary: {} });
  api.getAssessmentById = async () => ({ assessment: { ...assessment, settings: { showResultsAfterSubmit: false } } });
  api.releaseAssessmentResults = async (id, release) => { releaseCalls.push([id, release]); return { resultsReleasedAt: '2035-01-02T10:00:00Z' }; };
  api.getAssessmentReportRoster = async (id, { since } = {}) => {
    rosterCalls.push(since || null);
    return {
      full: true, cursor: 'c1',
      assessment: { _id: id, title: 'Placement Mock', totalMarks: 20, passPercentage: 40, totalQuestions: 10 },
      rows: [
        { key: 's1', submissionId: 's1', studentId: 'u1', name: 'Asha Rao', rollNo: 'R-1', status: 'submitted', evaluationStatus: 'completed', score: 18, maxMarks: 20, percentage: 90, passed: true },
        { key: 's2', submissionId: 's2', studentId: 'u2', name: 'Bilal Khan', rollNo: 'R-2', status: 'submitted', evaluationStatus: 'processing', score: null, maxMarks: 20 },
        { key: 's3', submissionId: 's3', studentId: 'u3', name: 'Chen Li', rollNo: 'R-3', status: 'in_progress', answeredCount: 4, totalQuestions: 10 },
        { key: 'u4', submissionId: null, studentId: 'u4', name: 'Divya Nair', rollNo: 'R-4', status: 'not_started' },
      ],
    };
  };
  const [{ default: AssessmentReports }, { ToastProvider }] = await Promise.all([
    server.ssrLoadModule('/src/admin/AssessmentReports.jsx'),
    server.ssrLoadModule('/src/components/CustomToast.jsx'),
  ]);
  const button = (label) => [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === label);
  try {
    await act(async () => root.render(h(ToastProvider, null, h(MemoryRouter, { initialEntries: ['/admin/assessment/reports?assessmentId=a9'] }, h(AssessmentReports)))));
    await flush();
    await flush();
    const text = document.body.textContent;
    assert.deepEqual(rosterCalls, [null], 'one full roster load for the selected assessment');
    assert.ok(text.includes('Placement Mock · 4 candidates'));
    assert.ok(text.includes('3 started · 1 not started'), 'not-started students count toward the roster');
    assert.ok(text.includes('90%'), 'average/min/max are percentages of the single graded attempt');
    assert.ok(text.includes('76-100%') && !text.includes('91-100'), 'four percentage buckets');
    for (const label of ['Passed', 'Failed', 'Evaluating', 'In progress', 'Not started']) assert.ok(text.includes(label), `outcome legend has ${label}`);
    assert.ok(!text.includes('Awaiting results') && !text.includes('Evaluation pending'));
    assert.ok(text.includes('Not announced'));

    await act(async () => button('Release results').click());
    assert.ok(document.querySelector('[role="dialog"]'), 'release asks for confirmation');
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((entry) => entry.textContent.trim() === 'Release results');
    toastShown = true;
    await act(async () => confirm.click());
    await flush();
    assert.deepEqual(releaseCalls, [['a9', true]]);
    assert.ok(document.body.textContent.includes('Released'));

    await act(async () => button('Candidates').click());
    const rowKeys = () => [...document.querySelectorAll('tbody tr[data-row-key]')].map((tr) => tr.getAttribute('data-row-key'));
    assert.deepEqual(rowKeys(), ['s3', 's1', 's2', 'u4'], 'default sort by status: in progress first, not started last');
    const statusHeader = [...document.querySelectorAll('th')].find((th) => th.textContent.trim() === 'Status');
    await act(async () => statusHeader.click());
    assert.deepEqual(rowKeys(), ['u4', 's1', 's2', 's3'], 'status column flips to descending; equal statuses stay in name order');

    const search = document.querySelector('input[aria-label="Search candidates"]');
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { setValue.call(search, 'r-2'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.deepEqual(rowKeys(), ['s2']);
    assert.ok(document.querySelector('tr[data-row-key="s2"]').textContent.includes('Evaluating…'));
    assert.deepEqual(rosterCalls, [null], 'search and sort never refetch');

    await act(async () => { setValue.call(search, ''); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const filtersButton = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim().startsWith('Filters'));
    await act(async () => filtersButton.click());
    const sheet = () => document.querySelector('[aria-labelledby="roster-filter-title"]');
    assert.ok(sheet(), 'filters open in a sheet');
    const submittedChip = [...sheet().querySelectorAll('button[aria-pressed]')].find((entry) => entry.textContent.startsWith('Submitted'));
    await act(async () => submittedChip.click());
    assert.ok(sheet(), 'applying a filter keeps the sheet open');
    assert.deepEqual(rowKeys().sort(), ['s1', 's2']);
    const done = [...sheet().querySelectorAll('button')].find((entry) => entry.textContent.trim() === 'Show 2 of 4');
    await act(async () => done.click());
    assert.equal(sheet(), null, 'Done closes the sheet');
    assert.deepEqual(rowKeys().sort(), ['s1', 's2'], 'the filter stays applied after closing');
    assert.match(dom.window.sessionStorage.getItem('peerprep.reports.filters.a9'), /"submitted"/, 'filters survive a remount for this assessment');
    dom.window.sessionStorage.clear();
    assert.deepEqual(rosterCalls, [null], 'filtering never refetches');
  } finally {
    await act(async () => root.unmount());
    root = null;
    socketService.connect = originalConnect;
    dom.reconfigure({ url: 'http://localhost:5173/admin/assessment/reports' });
  }
});

test('report page: manual refresh applies changes, logs activity and shows deltas since the last update', async () => {
  const socket = fakeSocket();
  const originalConnect = socketService.connect;
  socketService.connect = () => socket;
  dom.reconfigure({ url: 'http://localhost:5173/admin/assessment/reports?assessmentId=a7' });
  const assessment = { _id: 'a7', title: 'Weekly Test', assessmentType: 'mixed', startTime: '2035-01-01T09:00:00Z', endTime: '2035-01-01T11:00:00Z', duration: 60 };
  api.listAssessments = async () => ({ assessments: [assessment] });
  api.getAssessmentReports = async () => ({ assessments: [assessment], students: [], summary: {} });
  api.getAssessmentById = async () => ({ assessment: { ...assessment, settings: { showResultsAfterSubmit: false } } });
  let call = 0;
  api.getAssessmentReportRoster = async () => {
    call += 1;
    const asha = call === 1
      ? { key: 'u1', submissionId: null, studentId: 'u1', name: 'Asha Rao', status: 'not_started' }
      : { key: 's1', submissionId: 's1', studentId: 'u1', name: 'Asha Rao', status: 'in_progress', answeredCount: 1, totalQuestions: 10 };
    return { full: true, cursor: `c${call}`, assessment: { _id: 'a7', title: 'Weekly Test', totalMarks: 20, passPercentage: 40, totalQuestions: 10 }, rows: [asha] };
  };
  const [{ default: AssessmentReports }, { ToastProvider }] = await Promise.all([
    server.ssrLoadModule('/src/admin/AssessmentReports.jsx'),
    server.ssrLoadModule('/src/components/CustomToast.jsx'),
  ]);
  try {
    await act(async () => root.render(h(ToastProvider, null, h(MemoryRouter, { initialEntries: ['/admin/assessment/reports?assessmentId=a7'] }, h(AssessmentReports)))));
    await flush();
    await flush();
    assert.ok(document.body.textContent.includes('Starts, submissions and flags appear here'));
    await act(async () => document.querySelector('button[title="Refresh now"]').click());
    await flush();
    await flush();
    const text = document.body.textContent;
    assert.equal(call, 2);
    assert.ok(text.includes('Asha Rao started the test'), 'the activity feed records the start');
    assert.ok(!text.includes('Updating…'), 'the refresh finishes');
    assert.ok(text.includes('+1'), 'In progress shows +1 since the previous update');
  } finally {
    await act(async () => root.unmount());
    root = null;
    socketService.connect = originalConnect;
    dom.reconfigure({ url: 'http://localhost:5173/admin/assessment/reports' });
  }
});

test('live roster falls back to the reports endpoint when the roster API is missing', async () => {
  const socket = fakeSocket();
  socket.timeout = () => ({ emit: (event, data, ack) => { socket.emitted.push([event, data]); ack(new Error('timeout')); } });
  const originalConnect = socketService.connect;
  socketService.connect = () => socket;
  const legacyCalls = [];
  api.getAssessmentReportRoster = async () => {
    const err = new Error('Not found');
    err.response = { status: 404 };
    throw err;
  };
  api.getAssessmentReports = async (params) => {
    legacyCalls.push(params);
    return { students: [{ _id: 'sub-1', studentName: 'Chen', studentId: 'R-1', status: 'submitted', score: 10, totalMarks: 20, evaluationStatus: 'completed' }], pagination: { total: 1 } };
  };
  let latest;
  try {
    await act(async () => root.render(h(Harness, { id: 'a2', onValue: (value) => { latest = value; } })));
    await flush();
    await flush();
    assert.equal(latest.mode, 'legacy');
    assert.equal(latest.live, false);
    assert.equal(latest.rows.length, 1);
    assert.equal(latest.rows[0].percentage, 50);
    assert.equal(legacyCalls[0].assessmentId, 'a2');
    assert.ok(legacyCalls[0].limit <= 100, 'legacy paging respects the backend cap');
  } finally {
    await act(async () => root.unmount());
    root = null;
    socketService.connect = originalConnect;
  }
});
