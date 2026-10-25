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
let calls, listeners, permissions, dashboard, engagement, announcements, events, assessments, quests;
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
      universityName: 'Test University', rank: 4, totalStudents: 20, score: 64.3, percentile: 80,
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
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/u/test-university/student/dashboard' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'localStorage']) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in dashboard test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
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
  quests = [];
  api.listQuests = async () => { calls.push(['quests']); return { quests: structuredClone(quests) }; };
  api.getStudentChallengeBadges = async () => { throw new Error('Badge pagination must be mocked explicitly'); };
  api.claimAchievements = async () => ({ events: [] });
  api.acknowledgeAchievements = async () => ({ acknowledged: true });
  api.listStudentAnnouncements = async () => { calls.push(['announcements']); return { announcements: structuredClone(announcements) }; };
  api.listEvents = async () => { calls.push(['events']); return structuredClone(events); };
  api.listStudentAssessments = async () => { calls.push(['assessments']); return { assessments: structuredClone(assessments) }; };
  api.listStudentAnviAssignments = async () => { calls.push(['anvi']); return []; };
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

for (const latest of ['coding', 'learning']) {
  test(`continue shows only the most recent activity when it was ${latest}`, async () => {
    if (latest === 'learning') dashboard.resumeItems.reverse();
    const [item, older] = dashboard.resumeItems;
    await mount();
    const resume = section('Continue where you left off');
    assert.ok(resume, 'Resume section is shown');
    const resumeLinks = [...resume.querySelectorAll('a')];
    assert.equal(resumeLinks.length, 1, 'One card keeps the section focused');
    assert.match(resumeLinks[0].textContent, new RegExp(item.title));
    assert.doesNotMatch(resume.textContent, new RegExp(older.title), 'Older activity is not repeated');
    assert.equal(resumeLinks[0].getAttribute('href'), item.href);
    await act(async () => resumeLinks[0].click());
    assert.equal(document.getElementById('location').textContent, item.href);
  });
}

test('the resume card shows the real last run: verdict, passing tests, language and the student’s own code', async () => {
  Object.assign(dashboard.resumeItems[0], {
    language: 'python', lastVerdict: 'WA', passedTests: 3, totalTests: 8, difficulty: 'Easy',
    codePreview: { language: 'python', startLine: 2, lines: ['def two_sum(nums, target):', '    seen = {}  # value -> index', '    return []'] },
  });
  await mount();
  const resume = section('Continue where you left off');
  assert.match(resume.textContent, /Two Sum/);
  assert.match(resume.textContent, /Wrong answer/);
  assert.match(resume.textContent, /Python/);
  assert.match(resume.textContent, /3\/8 tests passing/);
  assert.match(resume.textContent, /Resume in Python/);
  assert.equal(resume.querySelector('[role="img"][aria-label="3 of 8 test cases passing"]').children.length, 8);
  const code = resume.querySelector('[aria-label="Preview of your last code"]');
  assert.match(code.textContent, /2def two_sum\(nums, target\):/, 'Line numbers continue from where the snippet starts');
  assert.match(code.textContent, /# value -> index/);
  assert.equal(code.querySelector('script, img'), null, 'Code is rendered as text only');
  assert.doesNotMatch(resume.textContent, /NaN|undefined/);
});

test('an opened but unattempted problem says so instead of showing invented progress', async () => {
  dashboard.resumeItems = [{ id: 'viewed', type: 'coding', title: 'Valid Anagram', difficulty: 'Easy', href: '/problems/valid-anagram', updatedAt: iso(8), progressPercent: null, status: 'viewed' }];
  await mount();
  const resume = section('Continue where you left off');
  assert.match(resume.textContent, /Not attempted yet/);
  assert.match(resume.textContent, /Start solving/);
  assert.equal(resume.querySelector('[aria-label="Preview of your last code"]'), null);
  assert.equal(resume.querySelector('[aria-label*="test cases passing"]'), null);
});

test('today pairs the real streak with the daily challenge beside recent work', async () => {
  await mount();
  const today = section('Today');
  assert.ok(today, 'Today sits next to the resume card');
  assert.ok(today.closest('.dashboard-greeting') === null && !today.closest('aside'), 'It belongs to the head row, not the rail');
  assert.match(today.textContent, /3day streak/);
  assert.match(today.textContent, /Done for today · Best 9/, 'Today already has activity in the fixture');
  assert.ok(today.querySelector('svg .streak-flicker'), 'An active streak with today done shows the burning mark');
  const chain = today.querySelector('ol[aria-label]');
  assert.equal(chain.querySelectorAll(':scope > li').length, 7);
  assert.match(chain.lastElementChild.textContent, /Today/);
  assert.match(chain.getAttribute('aria-label'), /active.*active$/, 'Yesterday and today are both active, so they are linked');
  assert.ok(section('Daily challenge').closest('section[aria-labelledby="today-title"]'), 'The daily challenge lives in Today');
  assert.equal(document.querySelector('aside[aria-label="Your progress and priorities"]').textContent.includes('Daily challenge'), false);
});

test('a live streak with no activity yet today shows a half-filled waiting flame and a nudge', async () => {
  dashboard.activityByDate = { '2035-01-16': 1 };
  await mount();
  const today = section('Today');
  assert.match(today.textContent, /Keep it alive today · Best 9/);
  assert.equal(today.querySelector('svg .streak-flicker'), null, 'The flame only burns once today is done');
  assert.ok(today.querySelector('svg clipPath'), 'The waiting flame is filled halfway');
});

test('learning subject cards are no longer shown on the dashboard', async () => {
  await mount();
  assert.equal(section('Explore your learning'), undefined);
  assert.ok(links().every((link) => link.getAttribute('href') !== dashboard.learningSubjects[0].href));
});

test('coding sheets show at most three QuickPrep cards, in progress first, with View all to the student QuickPrep page', async () => {
  quests = [
    questFixture({ id: 'q-done', slug: 'done', title: 'Finished Sheet', solved: 50, completedAt: iso(5) }),
    questFixture({ id: 'q-new', slug: 'graphs', title: 'Graphs Track', started: false, solved: 0, lastProblem: null, startedAt: null, lastViewedAt: null }),
    questFixture(),
    questFixture({ id: 'q-new-2', slug: 'dp', title: 'DP Basics', started: false, solved: 0, lastProblem: null, startedAt: null, lastViewedAt: null }),
  ];
  await mount();
  const sheets = section('Coding sheets');
  assert.ok(sheets, 'Coding sheets sit in the main column');
  const titles = [...sheets.querySelectorAll('h3')].map((node) => node.textContent);
  assert.deepEqual(titles, ['Amazon Top 50', 'Graphs Track', 'DP Basics'], 'Three cards: in progress first, then new');
  const viewAll = [...sheets.querySelectorAll('a')].find((anchor) => /View all/.test(anchor.textContent));
  assert.equal(viewAll.getAttribute('href'), '/student/quickprep');
  assert.match(viewAll.textContent, /\(4\)/);
  await act(async () => viewAll.click());
  assert.equal(document.getElementById('location').textContent, '/student/quickprep');
});

test('accessible document order follows greeting and recent work, then the progress rail, then discovery', async () => {
  announcements = announcements.map((announcement) => ({ ...announcement, priority: 'normal' }));
  quests = [questFixture()];
  await mount();
  const main = document.querySelector('[data-dashboard-main]');
  const greeting = document.querySelector('.dashboard-greeting');
  const rail = document.querySelector('aside[aria-label="Your progress and priorities"]');
  const recent = section('Continue where you left off');
  assert.ok(greeting?.querySelector('h1'), 'The greeting heads the page');
  assert.ok(main, 'Discovery has a dedicated primary column');
  assert.ok(rail, 'Progress and notices have a compact secondary rail');
  assert.ok(greeting.compareDocumentPosition(recent) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'Reading and keyboard order puts the greeting before recent work');
  assert.ok(recent.compareDocumentPosition(rail) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'Recent work comes before the rail, which comes before discovery on small screens');
  assert.ok(rail.compareDocumentPosition(main) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.deepEqual([...rail.querySelectorAll('h2')].map((heading) => heading.textContent), [
    'Announcements', 'Coding progress', 'Prep Score & rank', 'Global standing', 'Coming up',
  ], 'Any announcement leads the rail');
  assert.deepEqual([...main.querySelectorAll('h2')].map((heading) => heading.textContent), [
    'Coding sheets', 'Next in practice',
  ]);
});

test('the greeting shows a compact badge shelf; the full collection stays on the profile', async () => {
  engagement = engagementFixture();
  engagement.badges = [{ id: 'weekly:2035-01-08', kind: 'weekly', periodKey: '2035-01-08', title: 'Weekly momentum', earnedAt: iso(8) }];
  engagement.lifetime.badges = 1;
  await mount();
  const shelf = document.querySelector('.dashboard-greeting a[href="/student/profile#badges"]');
  assert.ok(shelf, 'Level and badges sit beside the greeting and open the profile collection');
  // Classic awards from the fixture's verified metrics: 11 solved, 1 hard, best streak 9.
  assert.match(shelf.getAttribute('aria-label'), /Level 2, Builder\. 4 of 10 badges earned\. Next: /);
  assert.match(shelf.textContent, /Builder/);
  assert.match(shelf.textContent, /4\/10/);
  assert.equal(section('Level & badges'), undefined);
  assert.doesNotMatch(text(), /Collected editions|Level & badges/, 'Editions and history stay on the profile');
});

test('adaptive badges on the shelf are the server’s earned set, newest first, with the level’s progress', async () => {
  engagement = { ...engagementFixture(), version: 2, enabled: true, domains: ['coding'], periods: [],
    daily: { rewardPoints: 20, goals: [] },
    level: { level: 3, title: 'Consistent Performer', totalLevels: 7, progress: 40, next: { title: 'Skill Champion' } },
    awards: { earnedCount: 2, nextAward: { id: 'locked', title: 'Hard Hitter', category: 'coding', value: 0, target: 1 }, awards: [
      { id: 'older', title: 'First Steps', category: 'coding', rarity: 'Common', earned: true, earnedAt: iso(1) },
      { id: 'newer', title: 'Week Warrior', category: 'momentum', rarity: 'Rare', earned: true, earnedAt: iso(8) },
      { id: 'locked', title: 'Hard Hitter', category: 'coding', earned: false },
    ] } };
  await mount();
  const shelf = document.querySelector('.dashboard-greeting a[href="/student/profile#badges"]');
  assert.match(shelf.getAttribute('aria-label'), /Level 3, Consistent Performer\. 2 of 3 badges earned/);
  assert.deepEqual([...shelf.querySelectorAll('[title]')].map((node) => node.getAttribute('title')).filter((title) => !title.includes('%')),
    ['Week Warrior', 'First Steps'], 'Newest earned badge leads; locked ones are not shown as earned');
  assert.ok(shelf.querySelector('[title="40% to Skill Champion"]'), 'Real level progress is shown');
});

test('a student with no badges sees the next one to earn instead of an empty shelf', async () => {
  dashboard.ranking.badgeMetrics = { solved: 0, hardSolved: 0, bestStreak: 0, activeDays: 0, languages: 0, assessments: 0, interviews: 0 };
  await mount();
  const shelf = document.querySelector('.dashboard-greeting a[href="/student/profile#badges"]');
  assert.match(shelf.textContent, /0\/10/);
  assert.match(shelf.textContent, /Next: First Accept/);
});

test('practice discovery shows only server-provided questions with working navigation', async () => {
  await mount();
  for (const item of dashboard.suggestedPractice) {
    const link = links().find((entry) => entry.textContent.includes(item.title) && entry.getAttribute('href') === item.href);
    assert.ok(link, `${item.title} is a real returned discovery item`);
    await act(async () => link.click());
    assert.equal(document.getElementById('location').textContent, item.href);
  }
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
    assert.match(section('Prep Score & rank').textContent, /Not ranked yet/);
    assert.match(section('Coming up').textContent, /Nothing scheduled yet/);
    assert.equal(section('Announcements'), undefined, 'An empty announcements card is not shown');
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
    // Learning has no dashboard discovery cards any more, so only practice can be "the other allowed module".
    const hidden = disabledModule === 'learning' ? dashboard.learningSubjects : dashboard.suggestedPractice;
    const allowed = disabledModule === 'learning' ? dashboard.suggestedPractice : [];
    for (const item of hidden) assert.equal(links().find((link) => link.getAttribute('href') === item.href), undefined,
      `${item.title} must stay hidden when its module is disabled`);
    for (const item of allowed) assert.ok(links().find((link) => link.getAttribute('href') === item.href),
      `${item.title} remains usable under the independent allowed module`);
  });
}

for (const module of ['questions']) {
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

test('the coding ring shows three difficulty arcs sized by catalogue and filled by real solves', async () => {
  // A large catalogue with very few solves: the case that used to collapse into one stray dot.
  await act(async () => root.render(h(MemoryRouter, null, h(CodingProgress, {
    totalSolved: 4, easySolved: 4, totalProblems: 3863, totalsByDifficulty: { easy: 1500, medium: 1900, hard: 463 },
  }))));
  const progress = section('Coding progress');
  const arcs = Object.fromEntries([...progress.querySelectorAll('svg [data-segment]')].map((node) => [node.getAttribute('data-segment'), node]));
  assert.deepEqual(Object.keys(arcs), ['easy', 'medium', 'hard']);
  assert.ok(arcs.easy.querySelector('[data-fill]'), 'Easy solves fill the Easy arc');
  assert.equal(arcs.medium.querySelector('[data-fill]'), null, 'Unsolved difficulties show only their track');
  assert.equal(arcs.hard.querySelector('[data-fill]'), null);
  const length = (node) => Number(node.querySelector('[data-track]').getAttribute('stroke-dasharray').split(' ')[0]);
  assert.ok(length(arcs.medium) > length(arcs.easy) && length(arcs.easy) > length(arcs.hard), 'Arcs follow catalogue size');
  assert.ok(length(arcs.hard) > 20, 'A small difficulty keeps a readable minimum arc');

  const hard = progress.querySelector('button[aria-label^="Hard:"]');
  await act(async () => hard.click());
  assert.equal(arcs.hard.getAttribute('opacity'), '1');
  assert.equal(arcs.easy.getAttribute('opacity'), '0.28', 'Selecting a difficulty highlights its arc');
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
    assert.equal(progress.querySelectorAll('svg [data-fill]').length, 0, 'Unknown or zero totals cannot show a fabricated filled arc');
    assert.equal(progress.querySelectorAll('svg [data-track]').length, 3, 'All three difficulty arcs stay visible as tracks');
  }
});

test('university rank shows the current student’s server-calculated standing without exposing other students', async () => {
  await mount();
  const ranking = section('Prep Score & rank');
  assert.ok(ranking);
  assert.match(ranking.textContent, /Test University/);
  assert.match(ranking.textContent, /#4|4\s*(?:of|\/)/);
  assert.match(ranking.textContent, /20/);
  assert.match(ranking.textContent, /64\.3/);
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
    'Announcements', 'Coding progress', 'Prep Score & rank', 'Global standing', 'Coming up',
  ], 'Announcements are brought ahead of routine rail items');
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

test('the notification bar shows the highest-priority announcement and stays dismissed until a newer one arrives', async () => {
  announcements = [
    { _id: 'routine', title: 'Library hours extended', message: 'Open till 10 PM this week.', priority: 'normal', createdAt: iso(9) },
    { _id: 'urgent', title: 'Placement registration closes Friday', message: 'Register before 5 PM.', priority: 'high', createdAt: iso(7) },
  ];
  await mount();
  const bar = () => document.querySelector('[aria-label="Latest announcement"]');
  assert.ok(bar(), 'Announcements are also surfaced as a notification bar');
  assert.match(bar().textContent, /Important.*Placement registration closes Friday/);
  assert.match(bar().textContent, /View all 2/);
  assert.ok(bar().compareDocumentPosition(document.querySelector('.dashboard-greeting')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'The bar comes before the greeting');
  await act(async () => bar().querySelector('button[aria-label="Dismiss announcement"]').click());
  assert.equal(bar(), null);
  assert.match(section('Announcements').textContent, /Placement registration closes Friday/, 'The rail card keeps every notice');

  await act(async () => root.unmount());
  root = createRoot(document.getElementById('app'));
  await mount();
  assert.equal(bar(), null, 'A dismissed notice stays closed for this viewer');
  announcements = [{ _id: 'newer', title: 'Drive postponed', message: '', priority: 'high', createdAt: iso(9) }];
  await emit('announcement_update');
  assert.match(bar().textContent, /Drive postponed/, 'A newer announcement brings the bar back');
});

test('disabled university modules hide their cards and resume links and skip their list APIs', async () => {
  permissions = { ...allPermissions, questions: false, coding: false, learning: false, events: false, assessments: true };
  engagement = { version: 2, enabled: true, domains: ['assessments', 'interviews'], daily: { goals: [] }, periods: [], lifetime: { points: 0 } };
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
  assert.equal(section('Coding sheets'), undefined, 'QuickPreps need coding, so they stay hidden');
  assert.equal(calls.filter(([name]) => name === 'quests').length, 0, 'The quests API is not called without coding');
  assert.ok(calls.some(([name]) => name === 'engagement'));
});

test('progress cues come from real data: difficulty tags and announcement priority', async () => {
  await mount();
  const practice = section('Next in practice');
  assert.match(practice.textContent, /Balanced Brackets.*Easy.*Linked List Reversal.*Medium/);
  assert.match(section('Announcements').textContent, /Important.*Placement registration closes Friday/);
  assert.match(section('Daily challenge').textContent, /Easy/);
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

const questFixture = (overrides = {}) => ({ id: 'q1', slug: 'amazon-top-50', title: 'Amazon Top 50', description: '', category: 'company', company: 'Amazon', topics: [], theme: 'amber',
  rewardXp: 60, badge: { title: 'Amazon Top 50 Finisher' }, total: 50, solved: 12, difficulty: { Easy: 20, Medium: 25, Hard: 5 }, started: true, startedAt: iso(6), completedAt: null,
  lastViewedAt: iso(8), lastProblem: { key: 'coding:local:p7', title: 'LRU Cache', href: '/problems/p7?quest=amazon-top-50' }, ...overrides });

test('coding sheets replace weekly and monthly challenges and show real QuickPrep progress', async () => {
  quests = [questFixture(), questFixture({ id: 'q2', slug: 'graphs', title: 'Graphs Track', started: false, solved: 0, lastProblem: null, startedAt: null, lastViewedAt: null })];
  await mount();
  const card = section('Coding sheets');
  assert.ok(card, 'The coding sheets sit in the main column');
  assert.doesNotMatch(text(), /Weekly momentum|Monthly explorer|This week|This month/, 'Weekly and monthly challenges are gone');
  assert.match(card.textContent, /Amazon Top 50.*12\/50.*Continue/);
  assert.match(card.textContent, /Amazon Top 50.*Graphs Track.*Start QuickPrep/, 'In-progress QuickPreps come first, then new ones to start');
  const link = [...card.querySelectorAll('a')].find((anchor) => anchor.textContent.includes('Amazon Top 50'));
  assert.equal(link.getAttribute('href'), '/student/quickprep/amazon-top-50');
  assert.equal(card.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '24');
});

test('a quest the student last worked on leads "Continue where you left off"', async () => {
  dashboard.resumeItems = [{ id: 'quest:q1', type: 'quest', title: 'Amazon Top 50', subtitle: 'LRU Cache', href: '/problems/p7?quest=amazon-top-50', questHref: '/student/quickprep/amazon-top-50',
    solved: 12, total: 50, lastProblemTitle: 'LRU Cache', lastProblemDifficulty: 'Medium', updatedAt: iso(8) }, ...dashboard.resumeItems];
  await mount();
  const resume = section('Continue where you left off');
  assert.match(resume.textContent, /QuickPrep.*Medium.*Amazon Top 50.*Last opened: LRU Cache.*12 \/ 50 solved.*Continue QuickPrep/);
  assert.equal(resume.querySelector('a').getAttribute('href'), '/problems/p7?quest=amazon-top-50');
  assert.doesNotMatch(resume.textContent, /Two Sum/, 'Only the most recent item is shown');
});

test('new challenge points trigger a fresh ranking snapshot after the older dashboard request', async () => {
  engagement = engagementFixture();
  engagement.lifetime.points = 40;
  engagement.newAwards = [{ kind: 'weekly', rewardPoints: 40 }];
  let requests = 0;
  api.getStudentDashboard = async () => {
    calls.push(['dashboard', true]);
    requests += 1;
    return { ...structuredClone(dashboard), ranking: { ...dashboard.ranking, score: requests === 1 ? 64.3 : 68.3, challengeBadges: requests === 1 ? 0 : 1 } };
  };
  await mount();
  assert.ok(requests >= 2, 'A verified award must force a snapshot after the initial policy and dashboard load');
  assert.match(section('Prep Score & rank').textContent, /68\.3/);
});

test('challenge request failure is recoverable without wiping practice, rank or announcements', async () => {
  api.refreshStudentEngagement = async () => { throw new Error('Offline'); };
  await mount();
  assert.match(section('Daily challenge').textContent, /Progress unavailable.*Retry/);
  assert.match(section('Announcements').textContent, /Placement registration/);
  assert.match(section('Next in practice').textContent, /Balanced Brackets/);
  assert.match(section('Prep Score & rank').textContent, /64\.3/);
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
  // Badge editions are collected on the profile's challenge card.
  await act(async () => root.render(h(MemoryRouter, null, h(ChallengeGoalsCard, { section: { data: engagement, loading: false, error: false }, onRetry: () => {} }))));
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
  assert.equal(section('Announcements'), undefined);
  assert.equal(document.querySelector('[aria-label="Latest announcement"]'), null, 'No notification bar without announcements');
  assert.ok(section('Coding progress').querySelector('[role="img"][aria-label="All problems: 0 solved out of 0"]'));
  assert.equal(section('Prep Score & rank').querySelector('[role="progressbar"]'), null);
  assert.doesNotMatch(section('Prep Score & rank').textContent, /#1/);
});

test('adaptive daily plans work for learning-only universities and hide stale coding tasks', async () => {
  permissions = { learning: true };
  engagement = { version: 2, enabled: true, domains: ['learning'], daily: { rewardPoints: 20, goals: [
    { id: 'core', slot: 'core', domain: 'learning', title: 'Complete Foundations', href: '/student/learning', difficulty: 'Easy', minutes: 10, target: 1 },
    { id: 'stale', slot: 'choice', domain: 'coding', title: 'Unauthorized coding task', href: '/problems/private', target: 1 },
  ] }, periods: [], lifetime: { points: 0 }, rules: 'Verified completions only.' };
  await mount();
  assert.match(section("Today's missions").textContent, /Complete Foundations/);
  assert.doesNotMatch(text(), /Unauthorized coding task/);
  assert.ok(links().every((link) => !link.getAttribute('href')?.startsWith('/problems')));
});

test('adaptive missions render for assessments-only allocated features', async () => {
  permissions = { assessments: true };
  engagement = { version: 2, enabled: true, domains: ['assessments'], daily: { rewardPoints: 20, goals: [
    { id: 'core', slot: 'core', domain: 'assessments', title: 'Complete assigned aptitude test', href: '/student/assessments', minutes: 20, target: 1 },
  ] }, periods: [], lifetime: { points: 0 } };
  await mount();
  assert.match(section("Today's missions").textContent, /Complete assigned aptitude test/);
  assert.ok(calls.some(([kind]) => kind === 'engagement'));
  assert.equal(section('Coding progress'), undefined);
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
  assert.match(section('Next in practice').textContent, /could not be loaded/,
    'Unavailable discovery stays explicit rather than disappearing as if it were empty');
});
