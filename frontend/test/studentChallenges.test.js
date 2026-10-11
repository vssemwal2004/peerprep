import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { dailyGoalStatus, dailyPlanProgress } from '../src/student/engagement/dailyChallengeModel.js';

let dom, server, root, createRoot, Challenges, Header, ThemeProvider, PopupDismissManager, AuthContext, UniversityPolicyProvider, api, socket;
let data, permissions, calls, rank;
const user = { _id: 'student-self', role: 'student', accessScope: 'full' };
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'getComputedStyle', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  globalThis.fetch = async () => { throw new Error('No live requests allowed'); };
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_PEERPREP_DEPLOYMENT_ROLE': JSON.stringify('university') }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  Challenges = (await server.ssrLoadModule('/src/student/StudentChallenges.jsx')).default;
  Header = (await server.ssrLoadModule('/src/components/StudentDashboardHeader.jsx')).default;
  ({ ThemeProvider } = await server.ssrLoadModule('/src/context/ThemeContext.jsx'));
  PopupDismissManager = (await server.ssrLoadModule('/src/components/PopupDismissManager.jsx')).default;
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ({ UniversityPolicyProvider } = await server.ssrLoadModule('/src/platform/UniversityPolicyContext.jsx'));
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
  socket = (await server.ssrLoadModule('/src/utils/socket.js')).default;
  socket.connect = socket.emit = socket.on = socket.off = () => {};
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  calls = [];
  permissions = { questions: true, learning: true, assessments: true, interviews: true, events: true };
  const goal = { id: 'core', slot: 'core', domain: 'learning', title: 'Finish Search Foundations', difficulty: 'Easy', href: '/student/learning', target: 1, value: 0, progress: 0 };
  data = { version: 2, enabled: true, domains: ['coding', 'learning'], generatedAt: '2026-10-15T08:00:00Z',
    daily: { kind: 'daily', periodKey: '2026-10-15', rewardPoints: 20, goals: [goal], endsAt: '2026-10-15T20:30:00Z' },
    periods: ['weekly', 'monthly'].map(kind => ({ kind, periodKey: kind === 'weekly' ? '2026-10-12' : '2026-10', title: `${kind} plan`, rewardPoints: kind === 'weekly' ? 40 : 150, goals: [{ ...goal, slot: undefined, target: 3, label: 'Complete learning tasks' }], endsAt: '2026-10-31T20:30:00Z' })),
    lifetime: { points: 180 }, level: { level: 2, title: 'Foundation Builder', mastery: 38 }, badges: [], rules: 'Verified work only.',
    month: { key: '2026-10', dailyPlans: [{ dayKey: '2026-10-14', completed: true }, { dayKey: '2026-10-15', completed: false }] },
  };
  rank = { rank: 8, totalStudents: 100, score: 400 };
  api.universityPolicy = async () => ({ active: true, permissions });
  api.refreshStudentEngagement = async () => { calls.push('refresh'); return structuredClone(data); };
  api.getStudentRanking = async force => { calls.push(`ranking:${force}`); return { ranking: structuredClone(rank) }; };
  api.acceptStudentChallenge = async (kind, periodKey) => { calls.push({ kind, periodKey }); return { kind, periodKey, acceptedAt: '2026-10-15T08:01:00Z' }; };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
const tab = kind => [...document.querySelectorAll('[role="tab"]')].find(node => node.textContent.startsWith(kind));
const click = async node => { assert.ok(node, 'Control exists'); await act(async () => node.click()); };
async function mount(path = '/student/challenges') {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(AuthContext.Provider, { value: { user, authChecked: true } }, h(UniversityPolicyProvider, null, h(Challenges))))));
}
function LocationProbe() {
  return h('output', { 'aria-label': 'Current route' }, useLocation().pathname);
}
async function mountHeader(currentUser = user) {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/student/profile'] }, h(AuthContext.Provider, { value: { user: currentUser, authChecked: true } }, h(UniversityPolicyProvider, null, h(ThemeProvider, null, h(PopupDismissManager), h('main', { 'data-app-scroll-container': true }, h(Header), h(LocationProbe))))))));
}
const control = name => document.querySelector(`[aria-label="${name}"]`);
const drawer = () => document.querySelector('[role="dialog"]');

for (const accessScope of ['full', 'assessment_only']) {
  test(`profile dropdown opens change password and closes for ${accessScope} students`, async () => {
    permissions = {};
    await mountHeader({ ...user, accessScope });
    await click(control('Open profile menu'));
    assert.ok(button('My profile'));
    await click(button('Change password'));
    assert.equal(control('Current route').textContent, '/student/change-password');
    assert.equal(control('Open profile menu').getAttribute('aria-expanded'), 'false');
    assert.equal(button('Change password'), undefined);
    assert.deepEqual(calls, [], 'Account security navigation does not request challenge data');
  });
}

test('all schedules are visible, deep linking and keyboard navigation work, and the whole month is shown', async () => {
  await mount('/student/challenges?period=monthly');
  assert.equal(tab('Monthly').getAttribute('aria-selected'), 'true');
  assert.ok(button('Accept monthly challenge'));
  assert.match(text(), /October 2026/);
  assert.ok(document.querySelector('[aria-label="2026-10-14: Completed"]'));
  assert.ok(document.querySelector('[aria-label="2026-10-31: Upcoming"]'));
  await act(async () => tab('Monthly').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  assert.equal(tab('Daily').getAttribute('aria-selected'), 'true');
  assert.ok(button('Accept daily challenge'));
  await click(tab('Weekly'));
  assert.ok(button('Accept weekly challenge'));
});

test('accept saves the period once, exposes continue, and never fabricates XP or rank changes', async () => {
  await mount();
  await click(button('Accept daily challenge'));
  assert.deepEqual(calls.filter(call => typeof call === 'object'), [{ kind: 'daily', periodKey: '2026-10-15' }]);
  assert.match(text(), /Challenge accepted/);
  assert.ok(!button('Accept daily challenge'));
  assert.ok([...document.querySelectorAll('a')].some(link => link.textContent.includes('Continue daily challenge') && link.getAttribute('href') === '/student/learning'));
  assert.match(text(), /180/); assert.match(text(), /#8 \/ 100/);
  assert.deepEqual(calls.slice(0, 2), ['refresh', 'ranking:true']);
});

test('verified refresh updates XP and reads ranking after rewards are reconciled', async () => {
  await mount();
  data.lifetime.points = 200; data.daily.completed = true; data.daily.goals[0].completed = true;
  rank = { ...rank, rank: 7, score: 420 };
  await click(button('Refresh progress'));
  assert.match(text(), /200/); assert.match(text(), /#7 \/ 100/);
  assert.match(text(), /20 XP added to rank points/);
  assert.deepEqual(calls.slice(-2), ['refresh', 'ranking:true']);
});

test('university allocations hide revoked tasks and no-access campuses do not request plans', async () => {
  permissions = { learning: true };
  data.daily.goals.push({ id: 'coding', domain: 'coding', slot: 'choice', title: 'Hidden coding', href: '/problems', target: 1 });
  await mount();
  assert.doesNotMatch(text(), /Hidden coding/);
  assert.match(text(), /Finish Search Foundations/);
  await act(async () => root.unmount()); root = createRoot(document.getElementById('app'));
  permissions = {}; calls = [];
  await mount();
  assert.match(text(), /not enabled any challenge-supported modules/);
  assert.deepEqual(calls, []);
});

test('missing backend route has an actionable retry and cannot show an accept button', async () => {
  api.refreshStudentEngagement = async () => { throw Object.assign(new Error('Not Found'), { response: { status: 404 } }); };
  await mount();
  assert.match(text(), /Restart the latest backend/);
  assert.ok(button('Retry challenges'));
  assert.ok(!button('Accept daily challenge'));
});

test('accept failure remains retryable and an old receipt cannot accept another period', async () => {
  api.acceptStudentChallenge = async () => { throw new Error('Plan expired; refresh.'); };
  await mount();
  await click(button('Accept daily challenge'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Plan expired/);
  let finish;
  api.acceptStudentChallenge = () => new Promise(resolve => { finish = resolve; });
  await click(button('Accept daily challenge'));
  assert.ok(button('Accepting…').disabled);
  await click(tab('Monthly'));
  await act(async () => finish({ acceptedAt: '2026-10-15T08:00:00Z' }));
  assert.ok(button('Accept monthly challenge'));
  assert.doesNotMatch(text(), /Challenge accepted/);
});

test('daily chart counts alternatives once and excludes optional stretch work', () => {
  const goals = [{ slot: 'core', target: 10, value: 5 }, { slot: 'choice', target: 1, completed: true }, { slot: 'choice', target: 1 }, { slot: 'stretch', target: 1 }];
  assert.deepEqual(dailyPlanProgress(goals), { total: 2, completed: 1, percent: 75 });
  goals[0].completed = true;
  assert.deepEqual(dailyPlanProgress(goals), { total: 2, completed: 2, percent: 100 });
  assert.deepEqual(dailyPlanProgress([]), { total: 0, completed: 0, percent: 0 });
  assert.equal(dailyGoalStatus({ completed: true, paused: true }), 'completed');
  assert.equal(dailyGoalStatus({ paused: true }), 'paused');
});

test('header drawer loads only on demand, skips ranking, locks scrolling and restores focus on Escape', async () => {
  await mountHeader();
  assert.deepEqual(calls, []);
  const trigger = control('Open daily challenges');
  trigger.focus();
  await click(trigger);
  assert.equal(drawer().id, trigger.getAttribute('aria-controls'));
  assert.equal(drawer().getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, control('Close daily challenges'));
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(document.querySelector('[data-app-scroll-container]').style.overflow, 'hidden');
  assert.equal(document.getElementById('app').inert, true);
  assert.deepEqual(calls, ['refresh']);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(drawer(), null);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.body.style.overflow, '');
  assert.notEqual(document.getElementById('app').inert, true);
  assert.equal(document.activeElement, trigger);
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
  assert.deepEqual(calls, ['refresh'], 'A closed drawer does not keep refreshing');
  await click(trigger);
  assert.deepEqual(calls, ['refresh', 'refresh'], 'Reopening refreshes current progress');
  data.daily.completed = true; data.daily.goals[0].completed = true;
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(control('Daily plan progress').getAttribute('aria-valuenow'), '100', 'Returning to the tab reconciles progress');
});

test('drawer filters tasks, accepts without invented rewards, then reflects verified completion', async () => {
  data.daily.goals.push({ id: 'stretch', slot: 'stretch', domain: 'learning', title: 'Optional recap', href: '/student/learning', target: 1, completed: true, rewardXp: 5 });
  await mountHeader(); await click(control('Open daily challenges'));
  assert.equal(control('Daily plan progress').getAttribute('aria-valuenow'), '0');
  await click(button('Completed1'));
  assert.equal(control('Daily tasks').children.length, 1);
  assert.match(control('Daily tasks').textContent, /Optional recap/);
  await click(button('Pending1'));
  assert.match(control('Daily tasks').textContent, /Finish Search Foundations/);
  await click(button('Accept daily challenge'));
  assert.match(drawer().textContent, /Challenge accepted/);
  assert.match(drawer().textContent, /180 lifetime XP/);
  data.daily.completed = true; data.daily.goals[0].completed = true; data.lifetime.points = 200;
  await click(control('Refresh daily challenges'));
  assert.equal(control('Daily plan progress').getAttribute('aria-valuenow'), '100');
  assert.match(drawer().textContent, /No pending tasks/);
  assert.match(drawer().textContent, /200 lifetime XP/);
  assert.match(drawer().textContent, /20 XP added to rank points/);
});

test('drawer hides revoked modules, pauses acceptance, and full access is required for the header entry', async () => {
  permissions = { learning: true };
  data.daily.goals.push({ id: 'coding', slot: 'choice', domain: 'coding', title: 'Inaccessible coding', href: '/problems', target: 1 });
  await mountHeader(); await click(control('Open daily challenges'));
  assert.doesNotMatch(drawer().textContent, /Inaccessible coding/);
  assert.match(drawer().textContent, /University access or content changed/);
  assert.equal(button('Accept daily challenge').disabled, true);
  await click(control('Close daily challenges'));
  await mountHeader({ ...user, accessScope: 'assessment_only' });
  assert.equal(control('Open daily challenges'), null);
  permissions = {};
  await mountHeader({ ...user });
  assert.equal(control('Open daily challenges'), null, 'No entry for campuses with no challenge-supported modules');
});

test('drawer handles retry, stale data and university pause without actionable phantom tasks', async () => {
  api.refreshStudentEngagement = async () => { throw new Error('Temporarily offline'); };
  await mountHeader(); await click(control('Open daily challenges'));
  assert.match(drawer().textContent, /Temporarily offline/);
  assert.ok(!button('Accept daily challenge'));
  api.refreshStudentEngagement = async () => structuredClone(data);
  await click(control('Refresh daily challenges'));
  assert.ok(button('Accept daily challenge'));
  api.refreshStudentEngagement = async () => { throw new Error('Temporarily offline'); };
  await click(control('Refresh daily challenges'));
  assert.match(drawer().textContent, /Showing last synced progress/);
  assert.equal(button('Accept daily challenge').disabled, true);
  data.enabled = false;
  api.refreshStudentEngagement = async () => structuredClone(data);
  await click(control('Refresh daily challenges'));
  assert.match(drawer().textContent, /Challenges are paused/);
  assert.ok(!button('Accept daily challenge'));
});

test('drawer navigation dismisses the dialog and restores app scrolling', async () => {
  await mountHeader(); await click(control('Open daily challenges'));
  const link = drawer().querySelector('a[href="/student/learning"]');
  assert.ok(link);
  await click(link);
  assert.equal(drawer(), null);
  assert.equal(document.body.style.overflow, '');
});

test('each accepted schedule celebrates only the successful action, without replay on refresh or tab changes', async () => {
  await mount();
  for (const kind of ['daily', 'weekly', 'monthly']) {
    await click(tab(kind[0].toUpperCase() + kind.slice(1)));
    await click(button(`Accept ${kind} challenge`));
    const popup = document.querySelector('dialog[data-challenge-celebration][open]');
    assert.ok(popup, `${kind} opens a celebration`);
    assert.match(popup.textContent, new RegExp(`${kind} challenge accepted`));
    assert.match(popup.textContent, /XP to earn/);
    assert.match(popup.textContent, /XP is awarded after verified completion/);
    assert.equal(document.body.style.overflow, 'hidden');
    await click(control('Close challenge celebration'));
    assert.equal(document.querySelector('dialog[data-challenge-celebration]'), null);
    assert.equal(document.body.style.overflow, '');
    assert.ok(document.activeElement.closest('.challenge-acceptance'), 'Focus returns to the plan action');
    await click(button('Refresh progress'));
    assert.equal(document.querySelector('dialog[data-challenge-celebration]'), null);
    assert.ok(!button(`Accept ${kind} challenge`));
  }
  await click(tab('Daily'));
  assert.ok(!button('Accept daily challenge'));
  assert.ok(document.querySelector('[aria-label="2026-10-15: Accepted"]'));
  assert.match(text(), /180/); assert.match(text(), /#8 \/ 100/);
});

test('failed and already-completed accept responses never trigger a celebration', async () => {
  api.acceptStudentChallenge = async () => { throw new Error('Try again'); };
  await mount();
  await click(button('Accept daily challenge'));
  assert.equal(document.querySelector('dialog[data-challenge-celebration]'), null);
  api.acceptStudentChallenge = async () => ({ kind: 'daily', periodKey: data.daily.periodKey, completed: true });
  await click(button('Accept daily challenge'));
  assert.equal(document.querySelector('dialog[data-challenge-celebration]'), null);
});

test('nested acceptance popup closes before the drawer and leaves scrolling restored after unmount', async () => {
  await mountHeader(); await click(control('Open daily challenges'));
  await click(button('Accept daily challenge'));
  assert.ok(document.querySelector('dialog[data-challenge-celebration][open]'));
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('dialog[data-challenge-celebration]'), null);
  assert.ok(drawer());
  assert.equal(document.body.style.overflow, 'hidden');
  await click(control('Close daily challenges'));
  assert.equal(document.body.style.overflow, '');
  await click(control('Open daily challenges'));
  await click(button('Accept daily challenge'));
  await act(async () => root.unmount()); root = createRoot(document.getElementById('app'));
  assert.equal(document.body.style.overflow, '', 'Unmounting both layers does not leak a scroll lock');
});

test('creative mission filters use verified status and a failed refresh disables stale actions', async () => {
  await mount();
  await click(button('Completed0'));
  assert.match(text(), /Your first win is waiting/);
  await click(button('All missions1'));
  api.refreshStudentEngagement = async () => { throw new Error('Offline'); };
  await click(button('Refresh progress'));
  assert.match(text(), /Showing last synced progress/);
  assert.equal(button('Accept daily challenge').disabled, true);
  assert.equal(control('Start: Finish Search Foundations'), null);
});
