import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Render the actual dashboard, shared progress cards and university policy
// provider. Every request and socket is local; these checks never contact a
// backend, database, mail provider or live student account.
let dom, server, root, createRoot, Dashboard, CodingProgress, ChallengeGoalsCard, AuthContext, UniversityPolicyProvider, api, socket;
let calls, listeners, permissions, dashboard, engagement, announcements, events, assessments;
const NativeDate = Date;
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT', 'Date', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const allPermissions = { questions: true, coding: true, learning: true, assessments: true, events: true, interviews: true, resumes: true };
const user = { id: 'student-self', role: 'student', name: 'Aditi Sharma', university: 'Test University', accessScope: 'full' };
const iso = (hour) => new NativeDate(2035, 0, 17, hour, 0).toISOString();

function setHour(hour) {
  const timestamp = new NativeDate(2035, 0, 17, hour, 0).getTime();
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  };
}

function fixture() {
  return {
    coding: {
      totalSolved: 11, totalProblems: 100, easySolved: 7, mediumSolved: 3, hardSolved: 1,
      totalsByDifficulty: { easy: 50, medium: 35, hard: 15 }, attemptedProblems: 14,
      streak: { current: 3, best: 9 }, activity: { '2035-01-17': 2, '2035-01-16': 1 },
    },
    activityByDate: { '2035-01-17': 2, '2035-01-16': 1 },
    learning: { completedTopics: 2, totalTopics: 20 },
    suggestedPractice: [
      { id: 'problem-brackets', title: 'Balanced Brackets', difficulty: 'Easy', href: '/problems/problem-brackets', source: 'university' },
      { id: 'problem-linked-list', title: 'Linked List Reversal', difficulty: 'Medium', href: '/problems/problem-linked-list', source: 'university' },
    ],
    learningSubjects: [
      { id: 'subject-algorithms', title: 'Algorithms', semesterName: 'Semester 2', totalTopics: 8, completedTopics: 2, progressPercent: 25, href: '/student/learning/Semester%202/Algorithms/teacher-1?semesterId=semester-2&subjectId=subject-algorithms', state: { semesterId: 'semester-2', subjectId: 'subject-algorithms', coordinatorId: 'teacher-1' } },
      { id: 'subject-databases', title: 'Database Fundamentals', semesterName: 'Semester 2', totalTopics: 12, completedTopics: 0, progressPercent: 0, href: '/student/learning/Semester%202/Database%20Fundamentals/teacher-1?semesterId=semester-2&subjectId=subject-databases', state: { semesterId: 'semester-2', subjectId: 'subject-databases', coordinatorId: 'teacher-1' } },
    ],
    ranking: {
      universityName: 'Test University', rank: 4, totalStudents: 20, score: 143, percentile: 80,
      level: { level: 2, title: 'Builder' }, earnedBadges: 2, hasProgress: true, tied: false,
      scoreBreakdown: { coding: 50, learning: 20, assessments: 43, badges: 30 },
      methodology: 'Coding, completed learning, assessments and earned badges.',
      badgeMetrics: { solved: 11, hardSolved: 1, bestStreak: 9, activeDays: 2, languages: 1, assessments: 0, interviews: 0 },
      levelMetrics: { solvedCount: 11, streak: 3, assessmentScore: null, interviewScore: 0, challengePoints: 0 },
      challengeBadges: 0,
    },
    resumeItems: [
      { id: 'draft-question', type: 'coding', title: 'Two Sum', subtitle: 'Your saved solution', href: '/problems/two-sum', updatedAt: iso(8), progressPercent: 30, status: 'in_progress' },
      { id: 'last-topic', type: 'learning', title: 'Binary Search Basics', subtitle: 'Algorithms · Topic 3', href: '/student/learning/Semester%202/Algorithms/teacher-1?semesterId=semester-2&subjectId=subject-algorithms&topicId=topic-3&contentType=video', updatedAt: iso(7), progressPercent: 40, status: 'in_progress' },
    ],
  };
}

function emptyFixture() {
  return {
    ...fixture(), coding: { totalSolved: 0, totalProblems: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, totalsByDifficulty: { easy: 0, medium: 0, hard: 0 }, attemptedProblems: 0, streak: { current: 0, best: 0 }, activity: {} },
    resumeItems: [], suggestedPractice: [], learningSubjects: [], activityByDate: {}, learning: { completedTopics: 0, totalTopics: 0 }, ranking: null,
  };
}

function engagementFixture() {
  const empty = !dashboard.coding?.totalProblems && !dashboard.learning?.totalTopics;
  return {
    daily: { enabled: true, completed: false, rewardPoints: 10, endsAt: '2035-01-17T20:30:00Z', problem: empty ? null : { id: 'daily-arrays', title: 'Daily Arrays Challenge', difficulty: 'Easy', href: '/problems/daily-arrays' } },
    periods: empty ? [] : ['weekly', 'monthly'].map((kind) => ({ kind, periodKey: kind === 'weekly' ? '2035-01-15' : '2035-01', title: kind === 'weekly' ? 'Weekly momentum' : 'Monthly explorer', rewardPoints: kind === 'weekly' ? 40 : 150, earned: false, progress: 30, endsAt: kind === 'weekly' ? '2035-01-21T20:30:00Z' : '2035-01-31T20:30:00Z', goals: [
      { metric: 'coding', label: 'Accepted problems', target: kind === 'weekly' ? 3 : 10, value: 1, progress: kind === 'weekly' ? 33 : 10, completed: false, href: '/problems' },
      { metric: 'learning', label: 'Completed lessons', target: kind === 'weekly' ? 2 : 6, value: 0, progress: 0, completed: false, href: '/student/learning' },
      { metric: 'activeDays', label: 'Practice days', target: kind === 'weekly' ? 2 : 8, value: 1, progress: kind === 'weekly' ? 50 : 13, completed: false, href: '/problems' },
    ] })),
    badges: [], lifetime: { points: 0, badges: 0, dailyCompleted: 0 }, newAwards: [], rules: 'Verified work counts once per period. Awards never reset.',
  };
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/student/dashboard' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'localStorage']) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in dashboard test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    define: { 'import.meta.env.VITE_PEERPREP_DEPLOYMENT_ROLE': JSON.stringify('university') },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  assert.equal((await server.ssrLoadModule('/src/platform/universityPermissions.js')).isUniversityDeployment, true,
    'Feature-gate checks must run under an actual university policy');
  Dashboard = (await server.ssrLoadModule('/src/student/StudentDashboard.jsx')).default;
  CodingProgress = (await server.ssrLoadModule('/src/student/profile/CodingProgress.jsx')).default;
  ({ ChallengeGoalsCard } = await server.ssrLoadModule('/src/student/engagement/EngagementCards.jsx'));
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  ({ UniversityPolicyProvider } = await server.ssrLoadModule('/src/platform/UniversityPolicyContext.jsx'));
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  socket = (await server.ssrLoadModule('/src/utils/socket.js')).default;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  setHour(9);
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
  calls = [];
  listeners = new Map();
  permissions = { ...allPermissions };
  dashboard = fixture();
  engagement = null;
  announcements = [{ _id: 'notice-1', title: 'Placement registration closes Friday', message: 'Register before 5 PM to join the campus drive.', priority: 'high', createdAt: iso(8) }];
  events = [];
  assessments = [];
  api.universityPolicy = async () => ({ active: true, permissions: { ...permissions } });
  api.getStudentDashboard = async (forceRefresh = false) => { calls.push(['dashboard', forceRefresh]); return structuredClone(dashboard); };
  api.refreshStudentEngagement = async () => { calls.push(['engagement']); return structuredClone(engagement || engagementFixture()); };
  api.getStudentChallengeBadges = async () => { throw new Error('Badge pagination must be mocked explicitly'); };
  api.listStudentAnnouncements = async () => { calls.push(['announcements']); return { announcements: structuredClone(announcements) }; };
  api.listEvents = async () => { calls.push(['events']); return structuredClone(events); };
  api.listStudentAssessments = async () => { calls.push(['assessments']); return { assessments: structuredClone(assessments) }; };
  socket.connect = () => { calls.push(['socket-connect']); return socket; };
  socket.on = (event, callback) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
  };
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

function Location() {
  const location = useLocation();
  return h('output', { id: 'location', 'data-state': JSON.stringify(location.state) }, location.pathname + location.search);
}

async function mount(authUser = user) {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/student/dashboard'] },
    h(AuthContext.Provider, { value: { user: authUser, authChecked: true, refreshUser: async () => {} } },
      h(UniversityPolicyProvider, null, h(Dashboard), h(Location))))));
}

const text = () => document.getElementById('app').textContent;
const links = () => [...document.querySelectorAll('a')];
const section = (heading) => [...document.querySelectorAll('h2, h3')].find((node) => node.textContent === heading)?.closest('section');
async function emit(event) {
  await act(async () => { for (const callback of listeners.get(event) || []) await callback({}); });
}

for (const [hour, greeting] of [[8, 'Good morning'], [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening'], [22, 'Good evening']]) {
  test(`greets the current student at local hour ${hour}`, async () => {
    setHour(hour);
    await mount();
    assert.match(document.querySelector('h1')?.textContent || '', new RegExp(`${greeting}.*Aditi`));
  });
}

test('continue cards link to the student’s actual saved question and last learning topic', async () => {
  await mount();
  const resume = section('Continue where you left off');
  assert.ok(resume, 'Resume section is shown');
  for (const item of dashboard.resumeItems) {
    const link = [...resume.querySelectorAll('a')].find((entry) => entry.textContent.includes(item.title));
    assert.ok(link, `Saved ${item.type} activity appears`);
    assert.equal(link.getAttribute('href'), item.href);
    await act(async () => link.click());
    assert.equal(document.getElementById('location').textContent, item.href);
  }
});

test('accessible document order follows greeting, coding and recent work, with priorities in a separate rail', async () => {
  announcements = announcements.map((announcement) => ({ ...announcement, priority: 'normal' }));
  await mount();
  const main = document.querySelector('[data-dashboard-main]');
  const greeting = document.querySelector('.dashboard-greeting');
  const coding = document.querySelector('aside[aria-label="Your coding progress"]');
  const rail = document.querySelector('aside[aria-label="Your progress and priorities"]');
  assert.ok(main, 'Personal work has a dedicated primary column');
  assert.ok(greeting?.querySelector('h1'), 'Greeting precedes the progress and recent work sections');
  assert.ok(coding?.querySelector('h2'), 'Coding has its own top-level section');
  const recent = section('Continue where you left off');
  assert.ok(greeting.compareDocumentPosition(coding) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'Reading and keyboard order puts greeting before coding');
  assert.ok(coding.compareDocumentPosition(recent) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'Reading and keyboard order puts coding before recent work');
  assert.equal(coding.querySelector('h2').textContent, 'Coding progress');
  assert.deepEqual([...main.querySelectorAll('h2')].map((heading) => heading.textContent), [
    'Continue where you left off', 'University standing', 'Level & badges', 'Your challenges', 'Explore your learning', 'Next in practice',
  ]);
  assert.ok(rail, 'Progress and notices have a compact secondary rail');
  assert.deepEqual([...rail.querySelectorAll('h2')].map((heading) => heading.textContent), [
    'Daily challenge', 'Coming up', 'Announcements',
  ]);
});

test('learning and practice discovery show only server-provided subjects and questions with working navigation', async () => {
  await mount();
  for (const item of [...dashboard.learningSubjects, ...dashboard.suggestedPractice]) {
    const link = links().find((entry) => entry.textContent.includes(item.title) && entry.getAttribute('href') === item.href);
    assert.ok(link, `${item.title} is a real returned discovery item`);
    await act(async () => link.click());
    assert.equal(document.getElementById('location').textContent, item.href);
    if (item.state) assert.deepEqual(JSON.parse(document.getElementById('location').getAttribute('data-state')), item.state,
      'Opening a learning subject preserves its semester and coordinator context');
  }
  const algorithms = links().find((entry) => entry.getAttribute('href') === dashboard.learningSubjects[0].href);
  assert.match(algorithms.textContent, /8 topics/);
  assert.match(algorithms.textContent, /2 completed/);
  assert.equal(algorithms.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '25');
  const databases = links().find((entry) => entry.getAttribute('href') === dashboard.learningSubjects[1].href);
  assert.match(databases.textContent, /12 topics/);
  assert.match(databases.textContent, /Explore subject/);
  assert.equal(databases.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '0');
});

test('missing optional discovery fields hide unused sections without invented subjects or practice', async () => {
  delete dashboard.learningSubjects;
  delete dashboard.suggestedPractice;
  await mount();
  assert.equal(section('Explore your learning'), undefined);
  assert.equal(section('Next in practice'), undefined);
  assert.ok(section('Continue where you left off'), 'Actual recent work remains visible');
  assert.doesNotMatch(text(), /Database Fundamentals|Balanced Brackets|Linked List Reversal|0 topics|NaN|Infinity/);
});

for (const disabledModule of [null, 'learning', 'questions']) {
  test(`first login offers working start cards only for enabled modules (${disabledModule || 'all enabled'})`, async () => {
    dashboard = emptyFixture();
    dashboard.ranking = { ...fixture().ranking, rank: null, score: 0, percentile: 0, earnedBadges: 0, hasProgress: false, level: null, badgeMetrics: { solved: 0, hardSolved: 0, bestStreak: 0, activeDays: 0, languages: 0, assessments: 0, interviews: 0 }, levelMetrics: { solvedCount: 0, streak: 0, assessmentScore: null, interviewScore: 0, challengePoints: 0 } };
    announcements = [];
    if (disabledModule) permissions = { ...allPermissions, [disabledModule]: false };
    if (disabledModule === 'questions') permissions.coding = false;
    await mount();
    const start = document.querySelector('.dashboard-greeting');
    assert.ok(start && start.textContent.includes('Start here'), 'New students have a clear starting point in the greeting');
    assert.equal(document.querySelector('[aria-label="Your progress at a glance"]'), null,
      'First login shows clear actions rather than an overview of repeated zero counts');
    assert.equal(section('Continue where you left off'), undefined, 'An empty history must not imply unfinished work');
    assert.equal(section('Explore your learning'), undefined);
    assert.equal(section('Next in practice'), undefined);
    assert.match(section('University standing').textContent, /Not ranked yet/);
    assert.match(section('Coming up').textContent, /Nothing scheduled yet/);
    assert.match(section('Announcements').textContent, /No new announcements/);
    for (const [module, label, path] of [['questions', 'Start coding', '/problems'], ['learning', 'Start learning', '/student/learning']]) {
      const link = [...start.querySelectorAll('a')].find((entry) => entry.textContent.includes(label));
      if (module === disabledModule) {
        assert.equal(link, undefined, `${label} is hidden when its module is disabled`);
        continue;
      }
      assert.ok(link, `${label} is offered without fabricated activity`);
      assert.ok(link.querySelector('svg'), `${label} has a visual cue`);
      assert.equal(link.getAttribute('href'), path);
      await act(async () => link.click());
      assert.equal(document.getElementById('location').textContent, path);
    }
  });
}

for (const disabledModule of ['learning', 'questions']) {
  test(`disabling ${disabledModule} hides its discovery and preserves the other allowed module`, async () => {
    permissions = { ...allPermissions, [disabledModule]: false };
    if (disabledModule === 'questions') permissions.coding = false;
    await mount();
    const hidden = disabledModule === 'learning' ? dashboard.learningSubjects : dashboard.suggestedPractice;
    const allowed = disabledModule === 'learning' ? dashboard.suggestedPractice : dashboard.learningSubjects;
    for (const item of hidden) assert.equal(links().find((link) => link.getAttribute('href') === item.href), undefined,
      `${item.title} must stay hidden when its module is disabled`);
    for (const item of allowed) assert.ok(links().find((link) => link.getAttribute('href') === item.href),
      `${item.title} remains usable under the independent allowed module`);
  });
}

for (const module of ['questions', 'learning']) {
  test(`a ${module}-only university policy change refetches progress and reveals newly enabled discovery`, async () => {
    permissions = { ...allPermissions, [module]: false };
    const field = module === 'learning' ? 'learningSubjects' : 'suggestedPractice';
    dashboard[field] = [];
    let policyReads = 0;
    api.universityPolicy = async () => { policyReads += 1; return { active: true, permissions: { ...permissions } }; };
    await mount();
    const heading = module === 'learning' ? 'Explore your learning' : 'Next in practice';
    assert.equal(section(heading), undefined);
    const beforeRequests = calls.filter(([name]) => name === 'dashboard').length;
    const beforePolicies = policyReads;

    // The same student and events/assessment permissions remain unchanged.
    // Date.now is fixed, so the dashboard's throttled focus handler cannot
    // refresh by itself. The policy provider's real focus listener loads the
    // changed policy, which must propagate through the dashboard hook inputs.
    permissions = { ...permissions, [module]: true };
    dashboard = fixture();
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(policyReads, beforePolicies + 1, 'Focus rereads the actual university policy');
    assert.ok(calls.filter(([name]) => name === 'dashboard').length > beforeRequests,
      'A module-only permission change must fetch newly authorized dashboard data');
    const discovery = section(heading);
    assert.ok(discovery);
    const item = dashboard[field][0];
    assert.ok([...discovery.querySelectorAll('a')].some((link) => link.getAttribute('href') === item.href && link.textContent.includes(item.title)),
      'Discovery comes from the fresh authorized payload rather than the previous empty response');
    assert.equal(listeners.get('announcement_update')?.size, 1, 'Refreshing module permissions does not duplicate socket listeners');
  });
}

test('the shared coding gauge previews difficulty totals on hover and keyboard focus, then restores all questions', async () => {
  await mount();
  const progress = section('Coding progress');
  assert.ok(progress, 'Dashboard uses the real profile coding progress card');
  const gauge = () => progress.querySelector('[role="img"][aria-label*="problems:"]');
  assert.equal(gauge().getAttribute('aria-label'), 'All problems: 11 solved out of 100');

  for (const [name, solved, total] of [['Easy', 7, 50], ['Medium', 3, 35], ['Hard', 1, 15]]) {
    const button = progress.querySelector(`button[aria-label="${name}: ${solved} solved out of ${total} questions"]`);
    assert.ok(button, `${name} is keyboard-accessible`);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })));
    assert.equal(gauge().getAttribute('aria-label'), `${name} problems: ${solved} solved out of ${total}`);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    assert.equal(gauge().getAttribute('aria-label'), 'All problems: 11 solved out of 100');
    await act(async () => button.focus());
    assert.equal(gauge().getAttribute('aria-label'), `${name} problems: ${solved} solved out of ${total}`);
    await act(async () => button.blur());
    assert.equal(gauge().getAttribute('aria-label'), 'All problems: 11 solved out of 100');
  }
  const hard = progress.querySelector('button[aria-label^="Hard:"]');
  await act(async () => hard.click());
  await act(async () => hard.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
  assert.equal(gauge().getAttribute('aria-label'), 'Hard problems: 1 solved out of 15', 'A touch/click selection persists');
  const allQuestions = [...progress.querySelectorAll('button')].find((button) => button.textContent === 'All questions');
  assert.ok(allQuestions);
  await act(async () => allQuestions.click());
  assert.equal(gauge().getAttribute('aria-label'), 'All problems: 11 solved out of 100');
});

test('progress stays visibly loading and difficulty selectors are disabled until the personal request completes', async () => {
  let resolveRequest;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  api.getStudentDashboard = () => pending;
  await mount();
  const progress = section('Coding progress');
  assert.equal(progress.getAttribute('aria-busy'), 'true');
  assert.ok(progress.querySelector('[role="img"][aria-label="Loading coding progress"]'));
  assert.ok([...progress.querySelectorAll('button')].every((button) => button.disabled));
  await act(async () => resolveRequest(structuredClone(dashboard)));
  assert.equal(section('Coding progress').getAttribute('aria-busy'), 'false');
  assert.ok([...section('Coding progress').querySelectorAll('button')].every((button) => !button.disabled));
});

test('shared gauge distinguishes missing totals from zero and safely handles invalid counts', async () => {
  for (const [props, expected] of [
    [{ totalSolved: 0, totalProblems: 0, totalsByDifficulty: { easy: 0, medium: 0, hard: 0 } }, 'All problems: 0 solved out of 0'],
    [{ totalSolved: 7, easySolved: 7 }, 'All problems: 7 solved, available total unavailable'],
    [{ totalSolved: -3, totalProblems: Infinity, easySolved: NaN, mediumSolved: -1, hardSolved: Infinity, streak: { current: Infinity, best: NaN } }, 'All problems: 0 solved, available total unavailable'],
  ]) {
    await act(async () => root.render(h(MemoryRouter, null, h(CodingProgress, props))));
    const progress = section('Coding progress');
    assert.ok(progress.querySelector(`[role="img"][aria-label="${expected}"]`));
    assert.doesNotMatch(progress.textContent, /NaN|Infinity|∞/);
    assert.equal(progress.querySelectorAll('svg circle[stroke]').length, 0, 'Unknown or zero totals cannot show a fabricated filled arc');
  }
});

test('university rank shows the current student’s server-calculated standing without exposing other students', async () => {
  await mount();
  const ranking = section('University standing');
  assert.ok(ranking);
  assert.match(ranking.textContent, /Test University/);
  assert.match(ranking.textContent, /#4|4\s*(?:of|\/)/);
  assert.match(ranking.textContent, /20/);
  assert.match(ranking.textContent, /143/);
  const position = ranking.querySelector('[role="progressbar"][aria-label="University rank position"]');
  assert.ok(position);
  assert.equal(position.getAttribute('aria-valuenow'), '4');
  assert.equal(position.getAttribute('aria-valuemax'), '20');
  assert.equal(position.getAttribute('aria-valuetext'), 'Rank 4 of 20 students');
  assert.equal(ranking.querySelector('table'), null, 'The student sees their own position rather than peer records');
});

test('admin announcement updates replace the displayed notices and remove listeners on unmount', async () => {
  await mount();
  assert.match(section('Announcements').textContent, /Placement registration closes Friday/);
  assert.equal(listeners.get('announcement_update')?.size, 1);
  assert.deepEqual([...document.querySelectorAll('aside[aria-label="Your progress and priorities"] h2')].map((heading) => heading.textContent), [
    'Announcements', 'Daily challenge', 'Coming up',
  ], 'An important announcement is brought ahead of routine upcoming items');
  const beforeCount = calls.filter(([name]) => name === 'announcements').length;
  announcements = [{ _id: 'notice-2', title: 'Drive postponed', message: 'The updated schedule will be shared tomorrow.', priority: 'high', createdAt: iso(9) }];
  await emit('announcement_update');
  assert.equal(calls.filter(([name]) => name === 'announcements').length, beforeCount + 1);
  assert.match(section('Announcements').textContent, /Drive postponed/);
  assert.doesNotMatch(section('Announcements').textContent, /Placement registration closes Friday/);
  await act(async () => root.unmount());
  root = null;
  assert.equal(listeners.get('announcement_update')?.size, 0);
});

test('disabled university modules hide their cards and resume links and skip their list APIs', async () => {
  permissions = { ...allPermissions, questions: false, coding: false, learning: false, events: false, assessments: true };
  await mount();
  assert.equal(section('Coding progress'), undefined);
  assert.ok(links().every((link) => !link.getAttribute('href')?.startsWith('/problems')));
  assert.ok(links().every((link) => !link.getAttribute('href')?.startsWith('/student/learning')));
  assert.ok(links().every((link) => !link.getAttribute('href')?.startsWith('/student/interview')));
  assert.doesNotMatch(text(), /Two Sum|Binary Search Basics|Balanced Brackets|Linked List Reversal|Algorithms|Database Fundamentals/);
  assert.equal(calls.filter(([name]) => name === 'events').length, 0);
  assert.ok(calls.some(([name]) => name === 'assessments'));
  assert.ok(section('Announcements'), 'Announcements remain available when unrelated modules are disabled');
  assert.equal(section('Daily challenge'), undefined);
  assert.equal(section('Your challenges'), undefined);
  assert.equal(calls.filter(([name]) => name === 'engagement').length, 0);
});

test('sections have distinct icons, palettes and visual layouts rather than identical blue cards', async () => {
  await mount();
  assert.ok(section('Level & badges').classList.contains('engagement-level-card'));
  assert.ok(section('Daily challenge').classList.contains('engagement-daily-card'));
  assert.ok(section('Your challenges').classList.contains('engagement-period-weekly'));
  assert.ok(section('Announcements').classList.contains('dashboard-announcements-section'));
  assert.ok(document.querySelector('.dashboard-heading-icon.tone-mint svg'));
  assert.ok(document.querySelector('.dashboard-subject-icon.tone-mint svg'));
  assert.ok(document.querySelector('.dashboard-subject-icon.tone-lavender svg'));
  assert.ok(section('Daily challenge').querySelector('.engagement-code-tile svg'));
});

test('daily challenge uses its real destination and switches to review only after server-verified completion', async () => {
  engagement = engagementFixture();
  engagement.daily.problem.href = '/problems/shared/daily-arrays';
  await mount();
  const daily = section('Daily challenge');
  assert.match(daily.textContent, /Daily Arrays Challenge.*Solve challenge/);
  assert.doesNotMatch(daily.textContent, /Completed today/);
  assert.equal(daily.querySelector('a').getAttribute('href'), '/problems/shared/daily-arrays');
  await act(async () => daily.querySelector('a').click());
  assert.equal(document.getElementById('location').textContent, '/problems/shared/daily-arrays');
  engagement.daily.completed = true;
  await emit('compiler-submission-updated');
  assert.match(section('Daily challenge').textContent, /Completed today.*Review solution/);
  assert.ok(section('Daily challenge').classList.contains('is-completed'));
});

test('weekly and monthly tabs support keyboard navigation and show their separate goals and badge styles', async () => {
  await mount();
  const card = section('Your challenges');
  const weekly = card.querySelector('[data-period="weekly"]');
  const monthly = card.querySelector('[data-period="monthly"]');
  assert.match(card.textContent, /Weekly momentum/);
  assert.equal(card.querySelector('[role="progressbar"]').getAttribute('aria-valuemax'), '3');
  await act(async () => { weekly.focus(); weekly.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  assert.equal(document.activeElement, monthly);
  assert.equal(monthly.getAttribute('aria-selected'), 'true');
  assert.equal(weekly.tabIndex, -1);
  assert.equal(card.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'), monthly.id);
  assert.match(card.textContent, /Monthly explorer/);
  assert.ok(card.classList.contains('engagement-period-monthly'));
  assert.equal(card.querySelector('[role="progressbar"]').getAttribute('aria-valuemax'), '10');
  await act(async () => monthly.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  assert.equal(document.activeElement, weekly);
  assert.match(card.textContent, /Weekly momentum/);
});

test('new challenge points trigger a fresh ranking snapshot after the older dashboard request', async () => {
  engagement = engagementFixture();
  engagement.lifetime.points = 40;
  engagement.newAwards = [{ kind: 'weekly', rewardPoints: 40 }];
  let requests = 0;
  api.getStudentDashboard = async () => {
    calls.push(['dashboard', true]);
    requests += 1;
    return { ...structuredClone(dashboard), ranking: { ...dashboard.ranking, score: requests === 1 ? 143 : 183, challengeBadges: requests === 1 ? 0 : 1 } };
  };
  await mount();
  assert.ok(requests >= 2, 'A verified award must force a snapshot after the initial policy and dashboard load');
  assert.match(section('University standing').textContent, /183/);
  assert.match(section('Your challenges').textContent, /Challenge reward earned.*40/);
});

test('challenge request failure is recoverable without wiping learning, rank or announcements', async () => {
  api.refreshStudentEngagement = async () => { throw new Error('Offline'); };
  await mount();
  assert.match(section('Daily challenge').textContent, /Progress unavailable.*Retry/);
  assert.match(section('Your challenges').textContent, /Progress unavailable.*Retry/);
  assert.match(section('Announcements').textContent, /Placement registration/);
  assert.match(section('Explore your learning').textContent, /Algorithms/);
  assert.match(section('University standing').textContent, /143/);
  api.refreshStudentEngagement = async () => structuredClone(engagementFixture());
  await act(async () => section('Daily challenge').querySelector('button').click());
  assert.match(section('Daily challenge').textContent, /Daily Arrays Challenge/);
});

test('collected editions load older badges with deduplication, safe retries and no invented awards', async () => {
  engagement = engagementFixture();
  const badge = { id: 'weekly:2035-01-08', kind: 'weekly', periodKey: '2035-01-08', title: 'Weekly momentum', earnedAt: iso(8), rewardPoints: 40 };
  const older = { ...badge, id: 'monthly:2034-12', kind: 'monthly', periodKey: '2034-12' };
  engagement.badges = [badge]; engagement.badgesCursor = 'test-cursor'; engagement.lifetime.badges = 2;
  let requests = 0;
  api.getStudentChallengeBadges = async (cursor) => {
    assert.equal(cursor, 'test-cursor'); requests += 1;
    if (requests === 1) throw new Error('Offline');
    return { badges: [badge, older], nextCursor: null };
  };
  await mount();
  const collection = section('Your challenges').querySelector('.engagement-collection');
  assert.equal(collection.querySelectorAll('.engagement-collected-badges > div').length, 1);
  await act(async () => collection.querySelector('button').click());
  assert.match(collection.textContent, /Retry older editions/);
  assert.equal(collection.querySelectorAll('.engagement-collected-badges > div').length, 1);
  await act(async () => collection.querySelector('button').click());
  assert.equal(collection.querySelectorAll('.engagement-collected-badges > div').length, 2);
  assert.equal(collection.querySelector('button'), null);
});

test('a pending badge page cannot leak editions into a new collection', async () => {
  const data = engagementFixture();
  const badge = { id: 'weekly:2035-01-08', kind: 'weekly', periodKey: '2035-01-08', title: 'Weekly momentum', earnedAt: iso(8) };
  data.badges = [badge]; data.badgesCursor = 'old-user-cursor'; data.lifetime.badges = 2;
  let finish;
  api.getStudentChallengeBadges = () => new Promise((resolve) => { finish = resolve; });
  const render = (payload) => h(MemoryRouter, null, h(ChallengeGoalsCard, { section: { data: payload, loading: false, error: false }, onRetry: () => {} }));
  await act(async () => root.render(render(data)));
  await act(async () => document.querySelector('.engagement-more-editions').click());
  const next = { ...engagementFixture(), badges: [{ ...badge, id: 'monthly:2035-01', kind: 'monthly', periodKey: '2035-01' }], lifetime: { points: 150, badges: 1 }, badgesCursor: null };
  await act(async () => root.render(render(next)));
  await act(async () => finish({ badges: [{ ...badge, id: 'old-user-badge' }], nextCursor: null }));
  assert.equal(document.querySelectorAll('.engagement-collected-badges > div').length, 1);
  assert.match(document.querySelector('.engagement-collected-badges').textContent, /Monthly/);
  assert.doesNotMatch(document.querySelector('.engagement-collected-badges').textContent, /Weekly/);
});

test('coming up only shows actionable assessments and joined upcoming interviews', async () => {
  assessments = [
    { _id: 'open', title: 'Open aptitude assessment', status: 'Available', startTime: iso(8), endTime: iso(15) },
    { _id: 'later', title: 'Tomorrow’s assessment', status: 'Not Started', startTime: iso(30), endTime: iso(33) },
    { _id: 'done', title: 'Already completed assessment', status: 'Completed', startTime: iso(8), endTime: iso(15) },
    { _id: 'expired', title: 'Expired assessment', status: 'Available', startTime: iso(1), endTime: iso(7) },
  ];
  events = [
    { _id: 'joined', name: 'Booked interview', joined: true, startDate: iso(13) },
    { _id: 'unjoined', name: 'Unbooked interview', joined: false, startDate: iso(14) },
    { _id: 'past', name: 'Past interview', joined: true, startDate: iso(6) },
  ];
  await mount();
  const comingUp = section('Coming up');
  assert.ok(comingUp);
  assert.match(comingUp.textContent, /Open aptitude assessment|Booked interview/);
  assert.doesNotMatch(comingUp.textContent, /Already completed assessment|Expired assessment|Unbooked interview|Past interview/);
});

test('empty personal activity does not invent unfinished questions, notices, or achievements', async () => {
  dashboard = emptyFixture();
  announcements = [];
  await mount();
  assert.doesNotMatch(text(), /Two Sum|Binary Search Basics|Balanced Brackets|Linked List Reversal|Database Fundamentals|Placement registration closes Friday|NaN|Infinity/);
  assert.equal(section('Continue where you left off'), undefined);
  assert.match(document.querySelector('.dashboard-greeting').textContent, /Start here/);
  assert.equal(section('Explore your learning'), undefined);
  assert.equal(section('Next in practice'), undefined);
  assert.match(section('Announcements').textContent, /no|nothing|up to date/i);
  assert.ok(section('Coding progress').querySelector('[role="img"][aria-label="All problems: 0 solved out of 0"]'));
  assert.equal(section('University standing').querySelector('[role="progressbar"]'), null);
  assert.doesNotMatch(section('University standing').textContent, /#1/);
});

test('a dashboard failure is explicit and independent notices still load', async () => {
  api.getStudentDashboard = async () => { calls.push(['dashboard-failed']); throw new Error('Dashboard service unavailable'); };
  await mount();
  assert.ok([...document.querySelectorAll('[role="status"]')].some((node) => node.textContent.includes('Your progress could not be loaded.')),
    'The failed progress request is reported');
  assert.match(section('Announcements').textContent, /Placement registration closes Friday/);
  assert.equal(document.querySelector('[role="img"][aria-label^="All problems:"]'), null,
    'A failed request must not masquerade as zero solved problems');
  assert.doesNotMatch(text(), /Two Sum|Binary Search Basics|NaN|Infinity/);
  assert.match(section('Explore your learning').textContent, /could not be loaded/,
    'Unavailable discovery stays explicit rather than disappearing as if it were empty');
  assert.match(section('Next in practice').textContent, /could not be loaded/);
});
