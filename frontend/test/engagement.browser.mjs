// Local-only browser smoke test. Pass a Playwright module URL if it is not installed locally.
// Example: node test/engagement.browser.mjs file:///path/to/playwright/index.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { build } from 'esbuild';
import { BADGES, DEFAULT_POLICY, LEVELS, progressionView } from '../../backend/src/services/adaptiveEngagementRules.js';

const { chromium } = await import(process.argv[2] || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = fileURLToPath(new URL('../../tmp/engagement-preview/', import.meta.url));
await mkdir(output, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const user = { _id: '507f1f77bcf86cd799439011', role: 'student', name: 'Aditi Sharma', username: 'aditi', email: 'aditi@example.invalid', college: 'PeerPrep University', semester: 3, course: 'B.Tech', branch: 'Computer Science', bio: 'Building confidence, one useful challenge at a time.', accessScope: 'full' };
const permissions = { questions: true, learning: true, assessments: true, interviews: true, events: true };
const badges = BADGES.map((b, index) => ({ ...b, earned: index < 3, value: index < 3 ? b.target : 0, progress: index < 3 ? 100 : 0, earnedAt: index < 3 ? new Date().toISOString() : null }));
const engagement = { version: 2, enabled: true, generatedAt: new Date().toISOString(), domains: DEFAULT_POLICY.domains, level: progressionView(2, 180, 38, 7), ladder: LEVELS, badges,
  awards: { awards: badges, earnedCount: 3, nextAward: badges[3] }, learnerProgress: {}, lifetime: { points: 180, badges: 3 },
  activity: { activityByDate: { [today]: 3 }, breakdownByDate: { [today]: { coding: 1, learning: 2 } }, stats: { totalActiveDays: 1 } },
  daily: { completed: false, rewardPoints: 20, endsAt: new Date(Date.now() + 86400000).toISOString(), goals: [
    { id: 'core', domain: 'coding', slot: 'core', title: 'Solve Balanced Brackets', target: 1, value: 0, progress: 0, difficulty: 'Easy', minutes: 10, href: '/problems/brackets', reason: 'Selected for your current coding practice level.' },
    { id: 'choice', domain: 'learning', slot: 'choice', title: 'Complete Binary Search Foundations', target: 1, value: 0, progress: 0, difficulty: 'Easy', minutes: 10, href: '/student/learning' },
    { id: 'stretch', domain: 'coding', slot: 'stretch', title: 'Try Sliding Window', target: 1, difficulty: 'Medium', minutes: 20, rewardXp: 5, href: '/problems/window' },
  ] },
  periods: ['weekly', 'monthly'].map((kind) => ({ kind, title: kind === 'weekly' ? 'Weekly momentum' : 'Monthly journey', rewardPoints: kind === 'weekly' ? 40 : 150, endsAt: new Date(Date.now() + 5 * 86400000).toISOString(), goals: [
    { id: 'coding', domain: 'coding', label: 'Coding completions', target: 4, value: 2, progress: 50, href: '/problems' },
    { id: 'learning', domain: 'learning', label: 'Learning completions', target: 3, value: 1, progress: 33, href: '/student/learning' },
    { id: 'days', domain: 'momentum', label: 'Verified active days', target: 5, value: 3, progress: 60 },
  ] })), rules: 'Complete verified work. All three level requirements apply. Earned XP, badges and levels are permanent.' };
const fixture = { user, permissions, engagement, settings: DEFAULT_POLICY, badges: BADGES, levels: LEVELS };
let fixtureModule = '';
let bundledFixture;
const assets = `${root}/dist/assets`;
const css = await readFile(`${assets}/${(await readdir(assets)).find((file) => /^index-.*\.css$/.test(file))}`, 'utf8');
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5177, strictPort: true, open: false, hmr: false, ws: false } });
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname !== '/__engagement-fixture') return route.continue();
    fixtureModule = `
      import React from 'react';
      import ReactDOMClient from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import '/src/index.css';
      import AuthContext from '/src/context/AuthContext.jsx';
      import { UniversityPolicyProvider } from '/src/platform/UniversityPolicyContext.jsx';
      import Profile from '/src/student/StudentProfile.jsx';
      import Settings from '/src/admin/EngagementSettings.jsx';
      import { api } from '/src/utils/api.js';
      import socket from '/src/utils/socket.js';
      const f = ${JSON.stringify(fixture)};
      const params = new URLSearchParams(location.search), admin = params.has('admin');
      window.__saved = null; window.__claimCount = 0;
      const currentUser = { ...f.user, role: admin ? 'admin' : 'student' };
      api.me = async () => currentUser;
      api.universityPolicy = async () => ({ active: true, permissions: f.permissions });
      api.refreshStudentEngagement = async () => structuredClone(f.engagement);
      api.getStudentRanking = async () => ({ ranking: { universityName: 'PeerPrep University', rank: 8, totalStudents: 120, score: 420, level: f.engagement.level, hasProgress: true } });
      api.getStudentStats = async () => ({ stats: { totalQuestionsSolved: 12, totalSubmissions: 20, totalProblems: 100, solvedByDifficulty: { easy: 8, medium: 4, hard: 0 }, totalProblemsByDifficulty: { easy: 50, medium: 35, hard: 15 }, recentSubmissions: [], languagesUsed: [{ language: 'python', count: 20 }] } });
      api.listStudentProblems = async () => ({ problems: [], total: 100, statusSummary: { solved: 12, attempted: 15, total: 100 } });
      api.getStudentActivity = async () => ({ activityByDate: f.engagement.activity.activityByDate, stats: { totalActiveDays: 7, currentStreak: 3, longestStreak: 7 } });
      api.getStudentAnalysis = async () => ({ analysis: { assessments: { totalAttempted: 3, avgScore: 76 }, learning: { completedTopics: 7, totalTopics: 25 }, interviews: { totalInterviews: 2, avgScore: 70 } } });
      api.claimAchievements = async () => { window.__claimCount++; return { events: params.has('celebrate') && window.__claimCount === 1 ? [{ id: 'event-1', type: 'level', level: f.engagement.level }, { id: 'event-2', type: 'badge', award: f.engagement.badges[0] }] : [] }; };
      api.acknowledgeAchievements = async () => ({ acknowledged: true });
      api.getEngagementPolicy = async () => ({ settings: f.settings, permissions: { ...f.permissions, events: false }, badges: f.badges, levels: f.levels });
      api.getEngagementAnalytics = async () => ({ activeStudents: 23, xp: 860, missions: [{ _id: 'daily', assigned: 45, completed: 31 }] });
      api.updateEngagementPolicy = async (value) => { window.__saved = value; return { settings: value.settings }; };
      socket.connect = () => {}; socket.on = () => {}; socket.off = () => {};
      ReactDOMClient.createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null, React.createElement(AuthContext.Provider, { value: { user: currentUser, authChecked: true } }, React.createElement(UniversityPolicyProvider, null, React.createElement('div', { style: { paddingTop: '65px' } }, React.createElement(admin ? Settings : Profile))))));
    `;
    if (!bundledFixture) {
      const result = await build({ stdin: { contents: fixtureModule, resolveDir: root, sourcefile: 'engagement-smoke.jsx', loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty', '.svg': 'dataurl' },
        define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env': JSON.stringify({ MODE: 'test', VITE_PEERPREP_DEPLOYMENT_ROLE: 'university' }) },
        plugins: [{ name: 'fixture-source-paths', setup(builder) { builder.onResolve({ filter: /^\/src\// }, ({ path }) => ({ path: resolve(root, `.${path}`) })); } }] });
      bundledFixture = result.outputFiles[0].text;
    }
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${css}</style></head><body><div id="root"></div><script>${bundledFixture}</script></body></html>`;
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(`${base}/__engagement-fixture`, { waitUntil: 'commit' });
  await page.locator('#activity').waitFor();
  await page.locator('#missions').waitFor();
  const activity = await page.locator('#activity').boundingBox();
  assert.ok(activity.y + activity.height < 900, 'Desktop heatmap must be visible without scrolling');
  const order = await page.locator('main h2').allTextContents();
  assert.ok(order.indexOf('Activity') < order.indexOf('Badges'));
  assert.ok(order.indexOf('Badges') < order.indexOf("Today's missions"));
  await page.screenshot({ path: `${output}/profile-light.png` });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: `${output}/profile-dark.png` });
  await page.locator('#badges').getByRole('button', { name: 'View all', exact: true }).click();
  await page.getByRole('tab', { name: 'Levels', exact: true }).click();
  assert.equal(await page.getByText('Complete all requirements', { exact: true }).count(), 6);
  await page.screenshot({ path: `${output}/level-ladder.png` });
  await page.getByRole('button', { name: 'Close badges' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#missions').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page-level mobile overflow');
  await page.screenshot({ path: `${output}/missions-mobile.png` });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/__engagement-fixture?celebrate`, { waitUntil: 'commit' });
  await page.getByRole('dialog', { name: 'You reached Level 2!' }).waitFor();
  await page.waitForTimeout(350);
  assert.ok(await page.locator('[role="presentation"] .pointer-events-none span').count() >= 50, 'Normal-motion mode includes the confetti burst');
  await page.screenshot({ path: `${output}/celebration.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Consumed celebration does not replay');
  await page.goto(`${base}/__engagement-fixture?admin`, { waitUntil: 'commit' });
  await page.getByRole('heading', { name: 'Student progression', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save progression policy' }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Peer interviews' }).isDisabled(), true);
  await page.getByRole('spinbutton', { name: 'Daily time budget (minutes)' }).fill('30');
  await page.getByRole('button', { name: 'Save progression policy' }).click();
  await page.getByRole('status').waitFor();
  assert.equal(await page.evaluate(() => window.__saved.settings.dailyMinutes), 30);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/admin-progression.png`, fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(JSON.stringify({ passed: true, profileOrder: order, heatmapBottom: Math.round(activity.y + activity.height), screenshots: output }));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.error((await page.locator('body').innerText()).slice(0, 2500));
    await page.screenshot({ path: `${output}/failure.png` });
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
