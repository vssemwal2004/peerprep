import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Renders the real practice library with local API stubs; nothing reaches a backend.
let dom, server, root, createRoot, ProblemsPage, ToastProvider, UniversityPolicyProvider, AuthContext, api, calls;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const istToday = () => new Date(Date.now() + 3.5 * 3600000).toISOString().slice(0, 10);
const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const questions = () => [
  { _id: 'q1', source: 'university', questionType: 'coding', sourceProblemId: 'p1', questionText: 'Two Sum', difficulty: 'Easy', tags: ['Array', 'Hash Table'], reportedCompanies: [{ company: 'Google', latestDate: '2026-09-01' }], result: 'correct' },
  { _id: 'q2', source: 'university', questionType: 'coding', sourceProblemId: 'p2', questionText: 'Course Schedule', difficulty: 'Medium', tags: ['Graph'], reportedCompanies: [], result: 'incorrect' },
  { _id: 'q3', source: 'university', questionType: 'mcq', questionText: 'Big-O of binary search', difficulty: 'Hard', tags: ['Array'], reportedCompanies: [], result: null },
];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/problems', pretendToBeVisual: true });
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in problems page test'); };
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ProblemsPage = (await server.ssrLoadModule('/src/student/ProblemsPage.jsx')).default;
  ({ ToastProvider } = await server.ssrLoadModule('/src/components/CustomToast.jsx'));
  ({ UniversityPolicyProvider } = await server.ssrLoadModule('/src/platform/UniversityPolicyContext.jsx'));
  AuthContext = (await server.ssrLoadModule('/src/context/AuthContext.jsx')).default;
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
  calls = [];
  const today = istToday();
  api.universityPolicy = async () => ({ active: true, permissions: { questions: true, coding: true, learning: true, assessments: true, events: true, interviews: true } });
  api.listPracticeQuestions = async (params) => {
    calls.push(params);
    return { questions: questions(), pagination: { page: 1, limit: 15, total: 3, pages: 1 },
      filters: { totalProblems: 20, tagCounts: [{ tag: 'Array', count: 12 }, { tag: 'Graph', count: 4 }], companyCounts: [{ company: 'Google', count: 7 }, { company: 'Amazon', count: 3 }] } };
  };
  api.listProblemLists = async () => ({ lists: [] });
  api.refreshStudentEngagement = async () => ({ version: 2, domains: ['coding'], badges: [], awards: { awards: [] },
    activity: { breakdownByDate: { [today]: { coding: 1, challenges: 1 }, [shift(today, -1)]: { coding: 1 } } },
    month: { dailyPlans: [{ dayKey: today, completed: true }] },
    daily: { completed: false, endsAt: new Date(Date.now() + 5 * 3600000).toISOString(), goals: [{ id: 'g1', slot: 'core', completed: true }, { id: 'g2', slot: 'choice', completed: false }] } });
  api.getDailyCodingChallenge = async () => ({ enabled: true, nextResetAt: new Date(Date.now() + 5 * 3600000 + 60000).toISOString(),
    challenge: { _id: 'p9', title: 'Daily Arrays', difficulty: 'Easy', href: '/problems/p9' } });
  api.getStudentActivity = async () => { throw new Error('Verified activity should be used first'); };
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
  return h('output', { id: 'location' }, useLocation().pathname);
}
async function mount() {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/problems'] },
    h(AuthContext.Provider, { value: { user: { _id: 'student-1', role: 'student', name: 'Aditi Sharma', accessScope: 'full' }, authChecked: true, isAuthenticated: true, refreshUser: async () => {} } },
      h(ToastProvider, null, h(UniversityPolicyProvider, null, h(ProblemsPage), h(Location)))))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const byText = (selector, pattern, scope = document) => [...scope.querySelectorAll(selector)].find((node) => pattern.test(node.textContent));
const lastCall = () => calls.at(-1);
const click = (node) => act(async () => node.click());

test('companies lead the page, topics and the calendar sit in the right rail, lists on the left', async () => {
  await mount();
  const companies = document.querySelector('section[aria-labelledby="companies-title"]');
  const rail = document.querySelector('aside[aria-label="Practice calendar and topics"]');
  const library = document.querySelector('aside[aria-label="Library"]');
  assert.ok(companies && rail && library);
  assert.ok(companies.compareDocumentPosition(library) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'Companies come before the columns');
  assert.ok(rail.querySelector('#topics-title') && rail.querySelector('#practice-calendar-title'), 'Topics moved into the right rail with the calendar');
  assert.equal(companies.querySelector('#topics-title'), null);
  assert.match(library.textContent, /All questions20.*Favorites0.*Your lists/);
  assert.doesNotMatch(document.body.textContent, /Question type|One line|Short answer/, 'The question-type filter is removed');
  assert.match(document.querySelector('h1').textContent, /Practice questions/);
  assert.match(document.body.textContent, /20 questions · 2 topics · 2 companies/);
  assert.doesNotMatch(document.body.textContent, /All TopicsAlgorithmsDatabase/, 'The placeholder category tabs are gone');
});

test('the Anvi banner describes only what Ask AnvI really does', async () => {
  await mount();
  const hero = document.querySelector('section[aria-label="Anvi AI coding guide"]');
  assert.match(hero.textContent, /Inside every coding problem/);
  assert.match(hero.textContent, /One focused approach.*A fresh angle on request.*Instructor-approved/);
  assert.doesNotMatch(hero.textContent, /debug|hint/i);
});

test('company, topic and difficulty controls drive the real query and can be removed as chips', async () => {
  await mount();
  await click(byText('section[aria-labelledby="companies-title"] button', /^GGoogle7$/));
  assert.equal(lastCall().companies, 'Google');
  assert.equal(lastCall().sortBy, 'latestInterviewDate', 'A company view lists the most recently asked first');
  await click(byText('aside[aria-label="Practice calendar and topics"] button', /^Graph4$/));
  assert.equal(lastCall().tags, 'Graph');
  assert.equal('type' in lastCall(), false, 'No question-type filter is sent');
  await click(byText('[role="radiogroup"][aria-label="Difficulty"] button', /^Hard$/));
  assert.equal(lastCall().difficulty, 'Hard');
  for (const label of ['Company: Google', 'Topic: Graph', 'Hard']) assert.ok(document.querySelector(`button[aria-label="Remove filter: ${label}"]`), `${label} is shown as a removable chip`);
  await click(document.querySelector('button[aria-label="Remove filter: Company: Google"]'));
  assert.equal(lastCall().companies, '');
  await click(byText('button', /^Clear all$/));
  assert.deepEqual([lastCall().tags, lastCall().difficulty], ['', '']);
});

test('choosing a topic shows its name and real question count above the list', async () => {
  await mount();
  await click(byText('aside[aria-label="Practice calendar and topics"] button', /^Array12$/));
  const header = document.querySelector('section[aria-labelledby="selection-title"]');
  assert.equal(header.querySelector('#selection-title').textContent, 'Array');
  assert.match(header.textContent, /Topic.*12 questions in this topic/);
  assert.doesNotMatch(header.textContent, /match your other filters/, 'With only a topic chosen, the counts are the same thing');
  await click(byText('[role="radiogroup"][aria-label="Difficulty"] button', /^Easy$/));
  assert.match(document.querySelector('section[aria-labelledby="selection-title"]').textContent, /12 questions in this topic · 3 match your other filters/);
  await click(byText('section[aria-labelledby="selection-title"] button', /Clear topic/));
  assert.equal(lastCall().tags, '');
  assert.equal(document.querySelector('section[aria-labelledby="selection-title"]'), null);
});

test('a catalogue with a thousand topics stays compact and opens a searchable topic browser', async () => {
  const many = Array.from({ length: 1200 }, (_, index) => ({ tag: `Topic ${String(index).padStart(4, '0')}`, count: 1200 - index }));
  const original = api.listPracticeQuestions;
  api.listPracticeQuestions = async (params) => ({ ...(await original(params)), filters: { totalProblems: 5000, tagCounts: many, companyCounts: [] } });
  await mount();
  const panel = document.querySelector('section[aria-labelledby="topics-title"]');
  assert.ok(panel.querySelectorAll('ul > li').length <= 11, 'The rail shows only the most common topics');
  await click(byText('button', /Browse all 1,200 topics/, panel));
  const browser = document.querySelector('[role="dialog"][aria-labelledby="topic-browser-title"]');
  assert.equal(browser.querySelectorAll('ul > li').length, 1200, 'Every topic is reachable');
  const search = browser.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'Topic 119');
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(browser.querySelectorAll('ul > li').length, 10);
  assert.match(browser.textContent, /10 matching topics/);
  await click(byText('[role="radiogroup"][aria-label="Sort topics"] button', /^A–Z$/, browser));
  assert.ok(browser.querySelector('section[aria-label="Topics starting with T"]'), 'A–Z groups topics by letter');
  await click(byText('button', /^Topic 1195/, browser));
  assert.equal(document.querySelector('[aria-labelledby="topic-browser-title"]'), null, 'Choosing a topic closes the browser');
  assert.equal(lastCall().tags, 'Topic 1195');
  assert.match(document.querySelector('section[aria-labelledby="selection-title"]').textContent, /Topic 1195.*5 questions in this topic/);
  assert.match(panel.textContent, /Topic 1195/, 'The chosen topic stays visible in the rail');
});

test('rows show real solved and attempted status and open the coding workspace', async () => {
  await mount();
  const rows = [...document.querySelectorAll('ul > li > div[role="button"]')];
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /Solved.*Two Sum.*Google.*Coding.*Easy/);
  assert.match(rows[1].textContent, /Attempted.*Course Schedule/);
  assert.match(rows[2].textContent, /Not attempted.*Big-O of binary search.*Multiple choice.*Hard/);
  assert.match(document.body.textContent, /1 of 3 solved on this page/);
  await click(rows[0]);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  assert.equal(document.getElementById('location').textContent, '/problems/p1');
});

test('the calendar is compact by default: streak, this week and today, with the month on request', async () => {
  await mount();
  const calendar = document.querySelector('section[aria-labelledby="practice-calendar-title"]');
  const week = calendar.querySelector('ol[aria-label="Last 7 days of practice"]');
  assert.equal(week.querySelectorAll('li').length, 7, 'Only one week is shown by default');
  assert.match(week.querySelector('li[aria-current="date"]').textContent, /2 activities, daily plan complete/);
  assert.match(calendar.textContent, /2 day streak/, 'Yesterday and today are both active');
  assert.match(calendar.textContent, /1 plan(?!s)/);
  const daily = byText('a', /Problem of the day/, calendar);
  assert.equal(daily.getAttribute('href'), '/problems/p9');
  assert.match(daily.textContent, /resets in 5h \dm.*Daily Arrays.*Easy.*Solve/);
  assert.match(calendar.textContent, /Today’s plan1\/2 done/);
  assert.equal(calendar.querySelector('button[aria-label="Previous month"]'), null);

  const toggle = byText('button', /^Month/, calendar);
  await click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(calendar.querySelector('ol[aria-label$="practice activity"] li[aria-current="date"]'), 'The month view marks today');
  await click(calendar.querySelector('button[aria-label="Previous month"]'));
  assert.equal(calendar.querySelector('li[aria-current="date"]'), null, 'Earlier months do not mark today');
  assert.equal(byText('a', /Problem of the day/, calendar), undefined, 'Today’s rows belong to the current month');
  await click(byText('button', /^Week/, calendar));
  assert.ok(calendar.querySelector('ol[aria-label="Last 7 days of practice"]'));
});
