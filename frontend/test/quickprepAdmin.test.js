import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Renders the real admin QuickPrep pages against stubbed API calls; nothing leaves the process.
let dom, server, root, createRoot, api, pages, calls, location;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

const item = (id, title, difficulty, extra = {}) => ({ source: 'university', problemId: id, section: '', title, difficulty, tags: ['Array'], companies: ['Amazon'], available: true, key: `coding:local:${id}`, ...extra });
const quest = (overrides = {}) => ({
  id: 'q1', slug: 'amazon-top-3', title: 'Amazon Top 3', description: 'Core Amazon set', category: 'company', company: 'Amazon', companies: ['Amazon', 'Google'], topics: ['Array'], difficulties: [],
  theme: 'amber', rewardXp: 60, badgeTitle: '', semesters: [3], status: 'published', publishedAt: '2026-10-01T00:00:00Z', createdAt: '2026-09-30T00:00:00Z', updatedAt: new Date().toISOString(),
  items: [item('p1', 'Two Sum', 'Easy'), item('p2', 'LRU Cache', 'Hard')], questionCount: 2, unavailableCount: 0, difficulty: { Easy: 1, Medium: 0, Hard: 1 }, audience: 40,
  stats: { enrolled: 5, completed: 2, averageProgress: 64 }, ...overrides,
});
const taxonomy = { companies: [{ name: 'Amazon', count: 12 }, { name: 'Google', count: 9 }, { name: 'Microsoft', count: 4 }], topics: [{ name: 'Array', count: 20 }, { name: 'Graph', count: 6 }], difficulties: [{ name: 'Easy', count: 10 }, { name: 'Medium', count: 8 }, { name: 'Hard', count: 4 }], total: 22 };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/admin/quickprep', pretendToBeVisual: true });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in QuickPrep admin test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  pages = {
    list: (await server.ssrLoadModule('/src/admin/quickprep/QuickPrepList.jsx')).default,
    wizard: (await server.ssrLoadModule('/src/admin/quickprep/QuickPrepWizard.jsx')).default,
    view: (await server.ssrLoadModule('/src/admin/quickprep/QuickPrepView.jsx')).default,
    detail: (await server.ssrLoadModule('/src/student/QuestDetail.jsx')).default,
    questionLibrary: (await server.ssrLoadModule('/src/admin/QuestionLibrary.jsx')).default,
    toast: (await server.ssrLoadModule('/src/components/CustomToast.jsx')).ToastProvider,
  };
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
  calls = [];
  api.listAdminQuests = async () => ({ quests: [quest(), quest({ id: 'q2', slug: 'graphs', title: 'Graphs Track', status: 'draft', category: 'topic', companies: [], questionCount: 0, items: [], stats: { enrolled: 0, completed: 0, averageProgress: 0 } })] });
  api.getQuestTaxonomy = async () => structuredClone(taxonomy);
  api.getAdminQuest = async (id) => ({ quest: quest({ id }) });
  api.createQuest = async (body) => { calls.push(['create', body]); return { quest: quest({ id: 'new1', ...body, items: [], questionCount: 0 }) }; };
  api.updateQuest = async (id, body) => { calls.push(['update', id, body]); return { quest: quest({ id, ...body }) }; };
  api.addQuestItems = async (id, items) => { calls.push(['add', id, items]); return { added: items.length, skipped: 0, quest: quest() }; };
  api.searchQuestLibrary = async (params) => { calls.push(['search', params]); return { items: [item('p1', 'Two Sum', 'Easy'), item('p3', 'Valid Anagram', 'Easy'), item('p4', 'Word Ladder', 'Hard')], pagination: { page: 1, pages: 1, total: 3 } }; };
  api.getQuestInsights = async () => ({
    quest: quest({ status: 'draft' }),
    summary: { audience: 40, started: 2, completed: 1, inProgress: 1, completionRate: 50, averageProgress: 75, xpAwarded: 60 },
    questions: [{ key: 'coding:local:p1', position: 1, section: 'Warm up', available: true, title: 'Two Sum', difficulty: 'Easy', tags: ['Array'], companies: [], source: 'university', solvedBy: 2, attemptedBy: 0, solveRate: 100 }],
    students: [{ id: 's1', name: 'Aditi Sharma', rollNumber: 'GE-1', semester: 3, solved: 2, attempted: 0, total: 2, progress: 100, startedAt: '2026-10-02T00:00:00Z', lastViewedAt: null, completedAt: '2026-10-05T00:00:00Z' },
      { id: 's2', name: 'Ravi Kumar', rollNumber: 'GE-2', semester: 3, solved: 1, attempted: 1, total: 2, progress: 50, startedAt: '2026-10-03T00:00:00Z', lastViewedAt: null, completedAt: null }],
  });
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

function Where() { location = useLocation(); return null; }
const render = (path, element, pattern) => act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Where), h(Routes, null,
  h(Route, { path: pattern, element: h(element) }), h(Route, { path: '*', element: h('p', null, 'elsewhere') })))));
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const button = (pattern, scope = document) => [...scope.querySelectorAll('button')].find((node) => pattern.test(node.textContent) || pattern.test(node.getAttribute('aria-label') || ''));
const click = (node) => act(async () => node.click());
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

test('the list is a table with reach, progress and a 3-dot menu of actions', async () => {
  await render('/admin/quickprep', pages.list, '/admin/quickprep');
  await settle();
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Amazon Top 3.*Company.*Amazon.*2.*40 students.*Sem 3.*5.*2.*64%.*Published/);
  assert.match(document.body.textContent, /Published1.*Drafts1/s);
  await click(button(/Actions for Amazon Top 3/));
  const menu = document.querySelector('[role="menu"]');
  assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent), ['View details', 'Edit details', 'Add questions', 'Unpublish', 'Duplicate', 'Archive', 'Remove']);
  await click(button(/Actions for Graphs Track/));
  const publish = [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'Publish');
  assert.ok(publish.disabled, 'An empty draft cannot be published');
  await click([...document.querySelectorAll('[role="radio"]')].find((node) => /^Draft\d/.test(node.textContent)));
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
});

test('creating starts with details from library-only dropdowns, then opens the questions step', async () => {
  await render('/admin/quickprep/new', pages.wizard, '/admin/quickprep/new');
  await settle();
  assert.match(document.body.textContent, /Step 1Details.*Step 2Questions.*Step 3Audience & publish/s);
  await type(document.querySelector('input[placeholder^="e.g. Amazon"]'), 'Amazon Sprint');
  await click(button(/^Companies|All companies/));
  const options = [...document.querySelectorAll('[role="listbox"] [role="option"]')].map((node) => node.textContent);
  assert.ok(options.some((text) => /Microsoft4/.test(text)), 'Only library companies with counts are offered');
  await click([...document.querySelectorAll('[role="option"] button')].find((node) => /Amazon/.test(node.textContent)));
  await click([...document.querySelectorAll('[role="option"] button')].find((node) => /Google/.test(node.textContent)));
  await click(button(/Create & add questions/));
  const [, body] = calls.find(([name]) => name === 'create');
  assert.deepEqual([body.title, body.companies, body.status, body.items], ['Amazon Sprint', ['Amazon', 'Google'], 'draft', []]);
  assert.equal(`${location.pathname}${location.search}`, '/admin/quickprep/new1/edit?step=questions');
});

test('Add questions opens the existing Question Library, where selected coding rows are added to the QuickPrep', async () => {
  const row = (id, title, extra = {}) => ({ _id: id, questionType: 'coding', questionText: title, difficulty: 'Easy', tags: [], status: 'published', visibility: 'public', updatedAt: '2026-10-01T00:00:00Z', ...extra });
  api.listLibraryQuestions = async (params) => { calls.push(['library', params]); return { questions: [row('lib-1', 'Two Sum', { sourceProblemId: 'p1' }), row('lib-2', 'Valid Anagram', { sourceProblemId: 'p3' }), row('sh-1', 'Shared Graphs', { platformShared: true, sourceProblemId: 'sp' })], pagination: { page: 1, pages: 1, total: 3 }, filters: {} }; };
  api.addQuestLibraryItems = async (id, libraryIds) => { calls.push(['library-add', id, libraryIds]); return { added: 1, skipped: [{ id: 'sh-1', title: 'Shared Graphs', reason: 'shared_unavailable', message: 'Not available to students from the shared catalog' }], quest: quest({ items: [item('p1', 'Two Sum', 'Easy'), item('p3', 'Valid Anagram', 'Easy')] }) }; };
  const libraryUrl = (await server.ssrLoadModule('/src/admin/quickprep/libraryLink.js')).quickPrepLibraryUrl({ id: 'q1', title: 'Amazon Top 3' });
  assert.equal(libraryUrl, '/admin/library?type=coding&lockType=coding&mode=quickprep&quickprep=q1&quickprepTitle=Amazon+Top+3&return=%2Fadmin%2Fquickprep%2Fq1%2Fedit%3Fstep%3Dquestions');
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [libraryUrl] }, h(Where), h(pages.toast, null, h(Routes, null,
    h(Route, { path: '/admin/library', element: h(pages.questionLibrary, { embedded: true }) }), h(Route, { path: '*', element: h('p', null, 'elsewhere') }))))));
  await settle();
  assert.equal(calls.find(([name]) => name === 'library')[1].type, 'coding', 'Only coding questions are listed');
  assert.match(document.body.textContent, /Adding questions to QuickPrep:\s*Amazon Top 3/);
  const rows = [...document.querySelectorAll('[role="button"][aria-disabled]')];
  assert.equal(rows[0].getAttribute('aria-disabled'), 'true', 'A question already in the QuickPrep is marked and locked');
  assert.match(rows[0].textContent, /Added/);
  await click(rows[1].querySelector('input[type="checkbox"]'));
  await click(rows[2].querySelector('input[type="checkbox"]'));
  await click(button(/Add to QuickPrep \(2\)/));
  assert.deepEqual(calls.find(([name]) => name === 'library-add').slice(1), ['q1', ['lib-2', 'sh-1']], 'Library row ids go to the server for mapping');
  assert.match(document.body.textContent, /1 selected question was not added \(1 added so far\).*Shared Graphs.*Not available to students/s, 'Skipped rows stay on screen with a reason');
  await click(button(/^Back to QuickPrep$/));
  assert.equal(`${location.pathname}${location.search}`, '/admin/quickprep/q1/edit?step=questions&added=1');
  // The library's toasts dismiss themselves after 4 s; let them finish before the DOM is torn down.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 4100)); });
});
test('the view explains why students cannot see a draft and tabulates questions and students', async () => {
  await render('/admin/quickprep/q1', pages.view, '/admin/quickprep/:id');
  await settle();
  const text = document.body.textContent;
  assert.match(text, /Students cannot see this QuickPrep yet.*It is a draft/);
  assert.match(text, /Audience40.*Started2.*Completed1.*50% of starters/s);
  assert.match(document.querySelector('tbody').textContent, /Two Sum.*Warm up.*Easy.*2.*0.*100%/);
  await click(button(/^Students/));
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /Aditi Sharma.*GE-1.*100%.*Completed/);
  assert.match(rows[1].textContent, /Ravi Kumar.*GE-2.*50%.*In progress/);
});

test('students see the QuickPrep questions as a sectioned table with progress and a solve action per row', async () => {
  api.getQuest = async () => ({ quest: { id: 'q1', slug: 'amazon-top-3', title: 'Amazon Top 3', description: '', category: 'company', companies: ['Amazon'], topics: ['Array'], theme: 'amber', rewardXp: 60,
    badge: { id: 'quest-q1', title: 'Amazon Top 3 Finisher', category: 'quests', rarity: 'Uncommon' }, total: 3, solved: 1, difficulty: { Easy: 2, Medium: 0, Hard: 1 }, started: true, completedAt: null,
    items: [
      { key: 'coding:local:p1', title: 'Two Sum', difficulty: 'Easy', tags: ['Array'], section: 'Week 1', status: 'solved', href: '/problems/p1?quest=amazon-top-3' },
      { key: 'coding:local:p2', title: 'Valid Anagram', difficulty: 'Easy', tags: [], section: 'Week 1', status: 'attempted', href: '/problems/p2?quest=amazon-top-3' },
      { key: 'coding:local:p3', title: 'LRU Cache', difficulty: 'Hard', tags: [], section: 'Week 2', status: 'none', href: '/problems/p3?quest=amazon-top-3' },
    ] } });
  await render('/student/quickprep/amazon-top-3', pages.detail, '/student/quickprep/:slug');
  await settle();
  const text = document.body.textContent;
  assert.match(text, /Continue: Valid Anagram/, 'Continue opens the first unsolved question');
  assert.match(text, /1 solved · 1 attempted · 1 to start/);
  const sections = [...document.querySelectorAll('th[scope="rowgroup"]')].map((node) => node.textContent);
  assert.deepEqual(sections, ['Week 11/2 solved', 'Week 20/1 solved']);
  const rows = [...document.querySelectorAll('tbody tr')].filter((row) => !row.querySelector('th'));
  assert.deepEqual(rows.map((row) => row.textContent.match(/(Review|Retry|Solve)$/)?.[1]), ['Review', 'Retry', 'Solve']);
  await click(rows[2]);
  assert.equal(`${location.pathname}${location.search}`, '/problems/p3?quest=amazon-top-3', 'A row opens the question inside the QuickPrep');
});