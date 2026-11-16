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
  // Outside /u/<slug> the page runs on the central platform: reach is every university, and student
  // progress (which lives in each university) is not shown; the window column says when students can open it.
  assert.match(rows[0].textContent, /Amazon Top 3.*Company.*Amazon.*More.*2.*All universities.*Published.*Always open/);
  assert.doesNotMatch(rows[0].textContent, /40 students|64%/, 'The central list has no per-university progress');
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

test('compact rows open full details without navigating; popup traps and restores focus', async () => {
  const topics = ['Array', 'String', 'Graph', 'Dynamic Programming', 'A very long topic name that must remain fully readable'];
  api.listAdminQuests = async () => ({ quests: [quest({ topics, companies: ['Amazon', 'Google', 'Microsoft', 'Adobe'], semesters: [1, 2, 3, 4], description: 'Full preparation sheet description.', badgeTitle: 'Placement champion', unavailableCount: 2 })] });
  await render('/admin/quickprep', pages.list, '/admin/quickprep');
  await settle();
  const row = document.querySelector('tbody tr');
  assert.doesNotMatch(row.textContent, /Dynamic Programming|Full preparation sheet description|Sem 1|amazon-top-3/);
  assert.ok(document.querySelector('table').classList.contains('whitespace-nowrap'));
  const more = button(/More details for Amazon Top 3/);
  await click(more);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog.hasAttribute('open'));
  assert.equal(location.pathname, '/admin/quickprep', 'More must not trigger row navigation');
  for (const value of [...topics, 'Microsoft', 'Adobe', 'Full preparation sheet description.', 'Sem 1, Sem 2, Sem 3, Sem 4', 'Placement champion', '60 XP', 'Question difficulty', '2 questions are unavailable']) assert.ok(dialog.textContent.includes(value), value);
  assert.equal(document.body.style.overflow, 'hidden');
  const close = button(/Close QuickPrep details/, dialog);
  assert.equal(document.activeElement, close);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
  assert.equal(document.activeElement.textContent, 'Open full sheet');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  assert.equal(document.activeElement, close);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.activeElement, more);
});

test('details popup closes via backdrop and links to the full sheet', async () => {
  await render('/admin/quickprep', pages.list, '/admin/quickprep');
  await settle();
  await click(button(/More details for Amazon Top 3/));
  await click(document.querySelector('[role="dialog"]'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(button(/More details for Amazon Top 3/));
  const link = [...document.querySelectorAll('dialog a')].find((node) => node.textContent === 'Open full sheet');
  assert.equal(link.getAttribute('href'), '/admin/quickprep/q1');
  await click(link);
  assert.equal(location.pathname, '/admin/quickprep/q1');
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, '');
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
  api.previewQuestLibraryItems = async (id, libraryIds) => { calls.push(['library-preview', id, libraryIds]); return { preview: true, added: 1, currentTotal: 1, max: 300,
    items: [{ id: 'lib-2', title: 'Valid Anagram', ok: true }, { id: 'sh-1', title: 'Shared Graphs', ok: false, reason: 'question_draft', message: 'Still a draft in the library' }],
    skipped: [{ id: 'sh-1', title: 'Shared Graphs', reason: 'question_draft', message: 'Still a draft in the library' }] }; };
  // Outside /u/<slug> this is the central platform, where a QuickPrep holds central library rows keyed by their own id.
  api.getAdminQuest = async (id) => ({ quest: quest({ id, items: [item('lib-1', 'Two Sum', 'Easy', { source: 'shared', key: 'coding:shared:lib-1' })], questionCount: 1 }) });
  api.addQuestLibraryItems = async (id, libraryIds) => { calls.push(['library-add', id, libraryIds]); return { added: 1, skipped: [], quest: quest({ items: [item('p1', 'Two Sum', 'Easy'), item('p3', 'Valid Anagram', 'Easy')] }) }; };
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
  assert.deepEqual(calls.find(([name]) => name === 'library-preview').slice(1), ['q1', ['lib-2', 'sh-1']], 'Library row ids go to the server for a dry run first');
  assert.equal(calls.some(([name]) => name === 'library-add'), false, 'Nothing is added before the admin confirms');
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'A review popup lists the selection before adding');
  assert.match(dialog.textContent, /Selected2.*Ready to add1.*Cannot be added1.*Sheet total after adding2/s, 'Counts include the sheet total after adding');
  assert.match(dialog.textContent, /1 question cannot be added.*Still a draft in the library/s, 'Draft picks are reported as an error');
  assert.match(dialog.textContent, /Valid Anagram.*Shared Graphs/s, 'Every selected question is listed');
  await click(button(/^Add 1 question$/, dialog));
  assert.deepEqual(calls.find(([name]) => name === 'library-add').slice(1), ['q1', ['lib-2']], 'Only the ready questions are added');
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

test('the publish step sets an optional start and end time, sent as ISO instants, and refuses an end before the start', async () => {
  await render('/admin/quickprep/q1/edit?step=publish', pages.wizard, '/admin/quickprep/:id/edit');
  await settle();
  const [starts, ends] = [...document.querySelectorAll('input[type="datetime-local"]')];
  assert.ok(starts && ends, 'Start and end inputs are on the publish step');
  await type(starts, '2026-12-01T10:00');
  await type(ends, '2026-11-30T10:00');
  assert.match(document.body.textContent, /The end must be after the start/);
  assert.ok(button(/^Publish$|Save changes/).disabled, 'An end before the start blocks publishing');
  await type(ends, '2026-12-05T18:30');
  await click(button(/Save changes|^Publish$/));
  const [, , body] = calls.find(([name]) => name === 'update');
  assert.equal(body.startsAt, new Date(2026, 11, 1, 10, 0).toISOString(), 'Local wall time becomes the same instant in ISO');
  assert.equal(body.endsAt, new Date(2026, 11, 5, 18, 30).toISOString());
});

test('the view shows the window and its student table searches name, email and student ID', async () => {
  const ended = { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-31T00:00:00Z' };
  const base = await api.getQuestInsights();
  api.getQuestInsights = async () => ({ ...base, quest: { ...base.quest, ...ended, status: 'published' },
    students: base.students.map((student, index) => ({ ...student, email: index ? 'ravi@example.edu' : 'aditi@example.edu' })) });
  await render('/admin/quickprep/q1', pages.view, '/admin/quickprep/:id');
  await settle();
  assert.match(document.body.textContent, /Ended/);
  await click(button(/^Students/));
  await type(document.querySelector('input[type="search"]'), 'ravi@');
  await settle();
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.deepEqual(rows.map((row) => /Ravi Kumar/.test(row.textContent)), [true], 'Email search leaves only Ravi');
  assert.match(document.querySelector('[data-table-pager]').textContent, /Showing 1–1 of 1/);
});

test('the student profile Quick Prep tab shows KPIs and a sortable, paged table of the student’s sheets', async () => {
  api.getStudentQuickPrepByAdmin = async (id) => { calls.push(['profile', id]); return { enabled: true,
    summary: { available: 2, started: 2, completed: 1, inProgress: 1, averageProgress: 75, solved: 3 },
    sheets: [
      { id: 'q1', title: 'Amazon Top 3', visible: true, startsAt: null, endsAt: null, windowStatus: 'open', total: 2, solved: 2, progress: 100, started: true, state: 'completed', startedAt: '2026-10-02T00:00:00Z', completedAt: '2026-10-05T00:00:00Z', lastActivity: '2026-10-05T00:00:00Z' },
      { id: 'q2', title: 'Graphs Sprint', visible: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-31T00:00:00Z', windowStatus: 'ended', total: 2, solved: 1, progress: 50, started: true, state: 'in-progress', startedAt: '2026-01-02T00:00:00Z', completedAt: null, lastActivity: '2026-01-03T00:00:00Z' },
    ] }; };
  const tab = (await server.ssrLoadModule('/src/admin/studentProfile/QuickPrepTab.jsx')).default;
  await act(async () => root.render(h(MemoryRouter, null, h(tab, { studentId: 's1' }))));
  await settle();
  assert.deepEqual(calls.find(([name]) => name === 'profile'), ['profile', 's1']);
  assert.match(document.body.textContent, /Sheets started2.*Completed1.*Avg\. progress75%/s);
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /Amazon Top 3.*Always open.*Completed.*2\/2.*100%/);
  assert.match(rows[1].textContent, /Graphs Sprint.*Ended.*In progress.*1\/2.*50%/);
  await click(button(/^Solved, /));
  await click(button(/^Solved, /));
  assert.match(document.querySelector('tbody tr').textContent, /Amazon Top 3/, 'Descending solved puts the finished sheet first');
  assert.match(document.querySelector('[data-table-pager]').textContent, /Showing 1–2 of 2/);
});

test('QuickPrep analysis is Prep Analysis opened on its Quick Prep tab', async () => {
  const { QUICKPREP_ANALYSIS_PATH } = await server.ssrLoadModule('/src/platform/universityPermissions.js');
  const { prepAnalysisStateFromSearch } = await server.ssrLoadModule('/src/admin/prepAnalysis/analysisPreset.js');
  assert.equal(QUICKPREP_ANALYSIS_PATH, '/admin/analysis?area=quickprep');
  assert.equal(prepAnalysisStateFromSearch(new URL(QUICKPREP_ANALYSIS_PATH, 'http://x').search).area, 'quickprep', 'the link opens the Quick Prep tab');
  await render('/admin/quickprep', pages.list, '/admin/quickprep');
  await settle();
  const link = [...document.querySelectorAll('a')].find((node) => node.textContent.trim() === 'Analysis');
  assert.ok(link, 'the list links to the analysis');
  assert.equal(link.getAttribute('href'), QUICKPREP_ANALYSIS_PATH);
});
