import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, api, AuthContext, OverviewDashboard, PlatformOverview, model;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const days = Array.from({ length: 14 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
const trend = days.map((date, index) => ({ date, coding: 0, assessments: index >= 7 ? 2 : 1, interviews: 0, learning: 0, logins: 3 }));

// What the server sends a coordinator who may see assessments only.
const COORDINATOR_VIEW = {
  generatedAt: new Date().toISOString(), role: 'coordinator', ownScope: true,
  access: { students: true, activity: false },
  people: { students: 40, newStudents: 4, activeWeek: 10, activeToday: 3, coordinators: null },
  assessments: { published: 3, drafts: 1, live: 1, upcoming: 1, inProgress: 2, flagged: 0, submissions: 21, averageScore: 50, scoreBands: [1, 2, 3, 4, 5] },
  prepScore: null, trend,
  upcoming: [{ type: 'assessment', id: 'a1', title: 'Arrays test', startsAt: new Date().toISOString(), live: true }],
  recent: [], pending: { draftAssessments: 1, closingSoon: 0, notActivated: 2 }, partial: [],
};

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/coordinator/overview' });
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key in values ? values[key] : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  ({ AuthContext } = await server.ssrLoadModule('/src/context/AuthContext.jsx'));
  OverviewDashboard = (await server.ssrLoadModule('/src/overview/OverviewDashboard.jsx')).default;
  PlatformOverview = (await server.ssrLoadModule('/src/overview/PlatformOverview.jsx')).default;
  model = await server.ssrLoadModule('/src/overview/overviewModel.js');
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

async function render(element) {
  await act(async () => root.render(h(AuthContext.Provider, { value: { user: { name: 'Meera Rao', role: 'coordinator' } } }, h(MemoryRouter, null, element))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

test('week change and pending rows follow the server numbers', () => {
  assert.equal(model.weekChange(trend.map((row) => row.assessments)), 100);
  assert.equal(model.weekChange([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]), null);
  const rows = model.pendingRows({ draftAssessments: 2, closingSoon: 0, emailFailed: 1 }, model.linksFor('admin'));
  assert.deepEqual(rows.map((row) => row.key), ['draftAssessments', 'emailFailed']);
  assert.equal(rows[0].to, '/admin/assessment');
});

test('a coordinator with only assessments sees a compact overview without other modules', async () => {
  api.overviewInsights = async () => structuredClone(COORDINATOR_VIEW);
  await render(h(OverviewDashboard, { role: 'coordinator', can: (permission) => permission === 'coordinator.assessment.create' }));
  const text = document.body.textContent;
  assert.match(text, /Coordinator overview/);
  assert.match(text, /, Meera/);
  assert.match(text, /My students40/);
  assert.match(text, /Assessment average50%/);
  assert.match(text, /1 draft assessment not yet published/);
  assert.match(text, /2 students have not signed in yet/);
  assert.match(text, /Arrays test/);
  for (const hidden of ['Coding practice', 'Coding acceptance', 'Topics completed', 'Top students', 'Recent activity', 'Add students', 'New interview']) {
    assert.ok(!text.includes(hidden), `${hidden} is hidden`);
  }
  assert.ok([...document.querySelectorAll('a')].some((link) => link.getAttribute('href') === '/coordinator/assessment/create'));
});

test('the Master Admin overview totals universities and flags an unreachable database', async () => {
  const iso = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const registration = (universityId, name, extra = {}) => ({ universityId, name, active: true, dbConfigured: true, judgeConfigured: true, serviceStartDate: iso(-30), serviceEndDate: iso(200), coordinatorLimit: 5, studentLimit: 500, coinBalance: 100, permissions: { assessments: true }, ...extra });
  api.platformOverview = async () => ({ universities: [registration('north', 'North University'), registration('south', 'South College', { judgeConfigured: false })], audit: [], assessmentCount: 7, questionCount: 90 });
  const central = {
    content: {
      problems: { published: 4006, draft: 0, byDifficulty: [{ difficulty: 'easy', count: 929 }, { difficulty: 'medium', count: 2103 }, { difficulty: 'hard', count: 974 }] },
      questions: { total: 4012, byType: [{ type: 'coding', count: 4002 }, { type: 'mcq', count: 10 }] },
      quickPreps: { published: 2, draft: 0, total: 2 }, assessments: { published: 4, draft: 0, shared: 1, assignments: 2 },
      sharedQuestions: { shared: 0, assignments: 0 }, aiInterviews: 2, learningSemesters: 36,
    },
    accounts: { admins: 3, coordinators: 3, students: 100 },
    mail: { queued: 0, sent: 12, failed: 2 },
    prepScore: { version: null, publishedAt: null, calculating: false, draftPending: false },
    coins: { trend: [], byKind: [], pricedFeatures: 0, features: 0, pricingVersion: null, charges: { captured: 0, refunded: 0, pending: 0 } },
  };
  const workspace = {
    ...COORDINATOR_VIEW, role: 'admin', ownScope: false, access: { students: true, activity: true },
    people: { students: 100, newStudents: 3, activeWeek: 30, activeToday: 4, coordinators: 3 },
    coding: { problems: 4006, attempts: 17, accepted: 14, acceptanceRate: 82.4, activeCoders: 1, byDifficulty: [{ difficulty: 'easy', attempts: 5, accepted: 2 }, { difficulty: 'medium', attempts: 11, accepted: 11 }, { difficulty: 'hard', attempts: 1, accepted: 1 }] },
    prepScore: { scored: 36, average: 0.93, highest: 2.25, bands: [{ from: 0, to: 0.5, students: 7 }], top: [{ id: 's1', name: 'Asha Verma', rollNumber: 'GEU1', score: 2.25 }] },
    pending: { notActivated: 375 },
    recent: [{ id: 'r1', title: 'Created assessment Arrays', actor: 'admin@geu.ac.in', at: new Date().toISOString() }],
  };
  api.platformInsights = async () => ({
    generatedAt: new Date().toISOString(), central, workspace,
    universities: [
      { universityId: 'north', name: 'North University', active: true, reachable: true, students: 300, coordinators: 6, newStudents: 20, activeWeek: 150, prepScoreAverage: 12.5, studentLimit: 500, modules: { assessments: true }, trend: trend.map(({ date }) => ({ date, coding: 3, assessments: 1, learning: 0, interviews: 0 })) },
      { universityId: 'south', name: 'South College', active: true, reachable: false, reason: 'no_database', modules: {} },
    ],
  });
  await render(h(PlatformOverview));
  const text = document.body.textContent;
  assert.match(text, /Total students400/);
  assert.match(text, /100 main · 300 universities/);
  assert.match(text, /Active this week180/);
  assert.match(text, /Not signed in yet375/);
  assert.match(text, /Coding problems4,006/);
  assert.match(text, /Library questions4,012/);
  assert.match(text, /Universities live2 \/ 2/);
  assert.match(text, /1 without a working database/);
  assert.match(text, /South College: database not connected/);
  assert.match(text, /Database not connected · Connect/);
  assert.match(text, /South College: code judge \(Judge0\) not connected/);
  assert.match(text, /Prep Score policy not published yet/);
  assert.match(text, /2 emails failed in 30 days/);
  assert.match(text, /Main database: 375 students have not signed in yet/);
  assert.match(text, /Asha Verma/);
  assert.match(text, /Created assessment Arrays/);
  assert.match(text, /Coding practice/, 'module panels come from the main database');
  const fix = [...document.querySelectorAll('a')].find((link) => link.textContent.includes('Database not connected · Connect'));
  assert.equal(fix.getAttribute('href'), '/admin/universities/south?tab=connections');
});
