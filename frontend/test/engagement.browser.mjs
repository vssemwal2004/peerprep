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
  month: { key: today.slice(0, 7), dailyPlans: [{ dayKey: today, completed: false }] },
  daily: { periodKey: today, completed: false, rewardPoints: 20, endsAt: new Date(Date.now() + 86400000).toISOString(), goals: [
    { id: 'core', domain: 'coding', slot: 'core', title: 'Solve Balanced Brackets', target: 1, value: 0, progress: 0, difficulty: 'Easy', minutes: 10, href: '/problems/brackets', reason: 'Selected for your current coding practice level.' },
    { id: 'choice', domain: 'learning', slot: 'choice', title: 'Complete Binary Search Foundations', target: 1, value: 0, progress: 0, difficulty: 'Easy', minutes: 10, href: '/student/learning' },
    { id: 'stretch', domain: 'coding', slot: 'stretch', title: 'Try Sliding Window', target: 1, difficulty: 'Medium', minutes: 20, rewardXp: 5, href: '/problems/window' },
  ] },
  periods: ['weekly', 'monthly'].map((kind) => ({ kind, periodKey: kind === 'monthly' ? today.slice(0, 7) : today, title: kind === 'weekly' ? 'Weekly momentum' : 'Monthly journey', rewardPoints: kind === 'weekly' ? 40 : 150, endsAt: new Date(Date.now() + 5 * 86400000).toISOString(), goals: [
    { id: 'coding', domain: 'coding', label: 'Coding completions', target: 4, value: 2, progress: 50, href: '/problems' },
    { id: 'learning', domain: 'learning', label: 'Learning completions', target: 3, value: 1, progress: 33, href: '/student/learning' },
    { id: 'days', domain: 'momentum', label: 'Verified active days', target: 5, value: 3, progress: 60 },
  ] })), rules: 'Complete verified work. All three level requirements apply. Earned XP, badges and levels are permanent.' };
const fixture = { user, permissions, engagement, settings: DEFAULT_POLICY, badges: BADGES, levels: LEVELS };
let fixtureModule = '';
let bundledFixture;
const assets = `${root}/dist/assets`;
const cssFiles = (await readdir(assets)).filter((file) => /^(index|StudentProfile|StudentChallenges)-.*\.css$/.test(file));
const css = (await Promise.all(cssFiles.map((file) => readFile(`${assets}/${file}`, 'utf8')))).join('\n');
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5177, strictPort: true, open: false, hmr: false, ws: false } });
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname !== '/u/test-university/__engagement-fixture') return route.continue();
    fixtureModule = `
      import React from 'react';
      import ReactDOMClient from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import '/src/index.css';
      import AuthContext from '/src/context/AuthContext.jsx';
      import { ThemeProvider } from '/src/context/ThemeContext.jsx';
      import { UniversityPolicyProvider } from '/src/platform/UniversityPolicyContext.jsx';
      import StudentHeader from '/src/components/StudentDashboardHeader.jsx';
      import PopupDismissManager from '/src/components/PopupDismissManager.jsx';
      import GlobalSidebar from '/src/components/GlobalSidebar.jsx';
      import { STUDENT_SIDEBAR_PANEL_WIDTH, STUDENT_SIDEBAR_RAIL_WIDTH } from '/src/components/sidebarLayout.js';
      import Profile from '/src/student/StudentProfile.jsx';
      import Challenges from '/src/student/StudentChallenges.jsx';
      import Settings from '/src/admin/EngagementSettings.jsx';
      import { api } from '/src/utils/api.js';
      import socket from '/src/utils/socket.js';
      const f = ${JSON.stringify(fixture)};
      const params = new URLSearchParams(location.search), admin = params.has('admin');
      window.__saved = null; window.__claimCount = 0;
      const currentUser = { ...f.user, role: admin ? 'admin' : 'student' };
      api.me = async () => currentUser;
      api.universityPolicy = async () => ({ active: true, permissions: params.has('restricted') ? { ...f.permissions, questions: false, learning: false } : f.permissions });
      api.getNotifications = async () => ({ notifications: [], unreadCount: 0 });
      api.listStudentAnnouncements = async () => ({ announcements: [] });
      api.refreshStudentEngagement = async () => structuredClone(f.engagement);
      api.acceptStudentChallenge = async (kind, periodKey) => {
        const plan = kind === 'daily' ? f.engagement.daily : f.engagement.periods.find(plan => plan.kind === kind);
        plan.acceptedAt ||= new Date().toISOString();
        return { kind, periodKey, acceptedAt: plan.acceptedAt };
      };
      window.__completeDaily = () => {
        f.engagement.daily.completed = true;
        f.engagement.daily.goals.forEach(goal => { if (goal.slot !== 'stretch') goal.completed = true; });
        f.engagement.lifetime.points = 200;
        f.engagement.month.dailyPlans[0].completed = true;
      };
      api.getStudentRanking = async () => ({ ranking: { universityName: 'PeerPrep University', rank: f.engagement.daily.completed ? 7 : 8, totalStudents: 120, score: 240 + f.engagement.lifetime.points, level: f.engagement.level, hasProgress: true } });
      api.getStudentStats = async () => ({ stats: { totalQuestionsSolved: 12, totalSubmissions: 20, totalProblems: 100, solvedByDifficulty: { easy: 8, medium: 4, hard: 0 }, totalProblemsByDifficulty: { easy: 50, medium: 35, hard: 15 }, recentSubmissions: [], languagesUsed: [{ language: 'python', count: 20 }] } });
      api.listStudentProblems = async () => ({ problems: [], total: 100, statusSummary: { solved: 12, attempted: 15, total: 100 } });
      api.getStudentActivity = async () => ({ activityByDate: f.engagement.activity.activityByDate, stats: { totalActiveDays: 7, currentStreak: 3, longestStreak: 7 } });
      api.getStudentAnalysis = async () => ({ analysis: { assessments: { totalAttempted: 3, avgScore: 76 }, learning: { completedTopics: 7, totalTopics: 25 }, interviews: { totalInterviews: 2, avgScore: 70 } } });
      api.claimAchievements = async () => { window.__claimCount++; return { events: params.has('celebrate') && window.__claimCount === 1 ? [{ id: 'event-1', type: 'level', level: f.engagement.level }, { id: 'event-2', type: 'badge', award: f.engagement.badges[0] }] : [] }; };
      api.acknowledgeAchievements = async () => ({ acknowledged: true });
      api.getEngagementPolicy = async () => ({ settings: f.settings, permissions: { ...f.permissions, events: false }, badges: f.badges, levels: f.levels });
      api.getEngagementAnalytics = async () => ({ activeStudents: 23, xp: 860, missions: [{ _id: 'daily', assigned: 45, completed: 31 }] });
      api.updateEngagementPolicy = async (value) => { window.__saved = value; return { settings: value.settings }; };
      socket.connect = () => {}; socket.on = () => {}; socket.off = () => {}; socket.emit = () => {};
      function StudentShell() {
        const [pinned, setPinned] = React.useState(false);
        const toggle = () => setPinned(value => !value);
        return <div className="h-screen overflow-hidden" style={{ '--admin-sidebar-width': pinned ? STUDENT_SIDEBAR_PANEL_WIDTH : STUDENT_SIDEBAR_RAIL_WIDTH, '--app-navbar-height': '0rem' }}>
          <GlobalSidebar role="student" isExpanded={pinned} isPinned={pinned} onTogglePin={toggle} />
          <main data-app-scroll-container className="h-screen min-h-0 overflow-y-auto overscroll-contain" style={{ paddingLeft: 'var(--admin-sidebar-width)', scrollPaddingTop: 'calc(5rem + 1px)' }}>
            <StudentHeader sidebarPinned={pinned} onToggleSidebar={toggle} />
            {params.has('hub') ? <Challenges /> : <Profile />}
          </main>
        </div>;
      }
      ReactDOMClient.createRoot(document.getElementById('root')).render(
        <MemoryRouter initialEntries={[admin ? '/admin/settings/student-progression' : params.has('hub') ? '/student/challenges' : '/student/profile']}>
          <AuthContext.Provider value={{ user: currentUser, authChecked: true, isAuthenticated: true }}>
            <UniversityPolicyProvider><ThemeProvider><PopupDismissManager />{admin ? <Settings /> : <StudentShell />}</ThemeProvider></UniversityPolicyProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );
    `;
    if (!bundledFixture) {
      const result = await build({ stdin: { contents: fixtureModule, resolveDir: root, sourcefile: 'engagement-smoke.jsx', loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty', '.svg': 'dataurl' },
        define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env': JSON.stringify({ MODE: 'test' }) },
        plugins: [{ name: 'fixture-source-paths', setup(builder) { builder.onResolve({ filter: /^\/src\// }, ({ path }) => ({ path: resolve(root, `.${path}`) })); } }] });
      bundledFixture = result.outputFiles[0].text;
    }
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${css}</style></head><body><div id="root"></div><script>${bundledFixture}</script></body></html>`;
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(`${base}/u/test-university/__engagement-fixture`, { waitUntil: 'commit' });
  await page.locator('#activity').waitFor();
  await page.locator('#missions').waitFor();
  const header = page.locator('header[aria-label="Student header"]');
  assert.equal(await header.count(), 1, 'Profile reuses exactly one student header');
  assert.equal((await header.boundingBox()).y, 0);
  const activity = await page.locator('#activity').boundingBox();
  assert.ok(activity.y + activity.height < 768, 'Desktop heatmap must be visible below the real header without scrolling');
  const order = await page.locator('main h2').allTextContents();
  assert.ok(order.indexOf('Activity') < order.indexOf('Badges'));
  assert.ok(order.indexOf('Badges') < order.indexOf("Today's missions"));
  await page.screenshot({ path: `${output}/profile-light.png` });
  await header.getByRole('button', { name: 'Switch to dark theme' }).click();
  assert.ok(await page.locator('html').evaluate(node => node.classList.contains('dark')));
  await page.waitForTimeout(350); // Let existing theme color transitions settle before the visual snapshot.
  await page.screenshot({ path: `${output}/profile-dark.png` });
  await header.getByRole('button', { name: 'Open daily challenges', exact: true }).click();
  const dailyDrawer = page.getByRole('dialog', { name: 'Daily challenges', exact: true });
  const drawerSnapshot = async name => {
    await dailyDrawer.locator('.overflow-y-auto').evaluate(node => { node.scrollTop = 0; });
    await page.waitForTimeout(350); // Settle slide-in and the shared theme/color transitions.
    const box = await dailyDrawer.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, 'Settled drawer stays inside the viewport');
    await page.screenshot({ path: `${output}/${name}.png` });
  };
  await dailyDrawer.getByRole('button', { name: 'Accept daily challenge', exact: true }).waitFor();
  assert.equal(await page.locator('[data-app-scroll-container]').evaluate(node => node.style.overflow), 'hidden', 'Drawer locks the actual app scroller');
  await dailyDrawer.getByRole('button', { name: 'Completed 0', exact: true }).click();
  await dailyDrawer.getByText('Your first win is waiting.', { exact: false }).waitFor();
  await dailyDrawer.getByRole('button', { name: 'Pending 3', exact: true }).click();
  assert.equal(await dailyDrawer.getByRole('list', { name: 'Daily tasks' }).locator('li').count(), 3);
  await dailyDrawer.getByRole('button', { name: 'Accept daily challenge', exact: true }).click();
  const acceptancePopup = page.getByRole('dialog', { name: 'daily challenge accepted', exact: true });
  await acceptancePopup.waitFor();
  assert.equal(await acceptancePopup.locator('.challenge-celebration__confetti').evaluate(node => getComputedStyle(node).display), 'none', 'Reduced motion removes confetti');
  await page.keyboard.press('Escape');
  await acceptancePopup.waitFor({ state: 'hidden' });
  assert.equal(await dailyDrawer.count(), 1, 'Escape dismisses only the top celebration, not its parent drawer');
  await dailyDrawer.getByText('Challenge accepted', { exact: true }).waitFor();
  assert.equal(await header.getByRole('button', { name: 'Open daily challenges' }).getAttribute('aria-expanded'), 'true', 'Portaled interactions survive the global popup manager');
  await dailyDrawer.getByRole('button', { name: 'Close daily challenges' }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dailyDrawer.getByRole('link', { name: /View all challenges/ }).evaluate(node => node === document.activeElement), true, 'Focus wraps backwards inside the drawer');
  await page.keyboard.press('Tab');
  assert.equal(await dailyDrawer.getByRole('button', { name: 'Close daily challenges' }).evaluate(node => node === document.activeElement), true);
  await drawerSnapshot('daily-drawer-dark');
  await page.keyboard.press('Escape');
  await dailyDrawer.waitFor({ state: 'hidden' });
  assert.equal(await header.getByRole('button', { name: 'Open daily challenges' }).evaluate(node => node === document.activeElement), true, 'Focus returns to the header trigger');
  assert.equal(await page.locator('[data-app-scroll-container]').evaluate(node => node.style.overflow), '');
  await header.getByRole('textbox', { name: 'Search student modules' }).fill('coding');
  await header.getByRole('button', { name: 'PrepCoding Practice problem solving' }).waitFor();
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Open profile menu' }).click();
  await header.getByRole('button', { name: 'My profile', exact: true }).click();
  assert.equal(await header.getByRole('button', { name: 'Open profile menu' }).getAttribute('aria-expanded'), 'false', 'Selecting the current profile closes the menu');
  await page.locator('#badges').evaluate(node => node.scrollIntoView({ block: 'start' }));
  assert.equal((await header.boundingBox()).y, 0, 'Header stays visible while profile scrolls');
  assert.ok((await page.locator('#badges').boundingBox()).y >= 65, 'Section anchors clear the sticky header');
  await page.locator('#badges').getByRole('button', { name: 'View all', exact: true }).click();
  await page.getByRole('tab', { name: 'Levels', exact: true }).click();
  assert.equal(await page.getByText('Complete all requirements', { exact: true }).count(), 6);
  await page.screenshot({ path: `${output}/level-ladder.png` });
  await page.getByRole('button', { name: 'Close badges' }).click();
  await header.getByRole('button', { name: 'Expand and pin navigation' }).click();
  assert.equal((await header.boundingBox()).x, 232, 'Pinned navigation reserves space beside the profile header');
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  assert.equal((await header.boundingBox()).x, 68);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-app-scroll-container]').evaluate(node => { node.scrollTop = 0; });
  await header.getByRole('button', { name: 'Open module search' }).click();
  await header.getByRole('textbox', { name: 'Search student modules' }).fill('coding');
  const searchResults = await header.getByText('Student modules', { exact: true }).locator('..').boundingBox();
  assert.ok(searchResults.x >= (await header.boundingBox()).x && searchResults.x + searchResults.width <= 390 && searchResults.width > 250, 'Mobile search uses a readable dropdown within the content area');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${output}/profile-header-mobile.png` });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const profileButton = await header.getByRole('button', { name: 'Open profile menu' }).boundingBox();
    assert.ok(profileButton.x + profileButton.width <= width, 'Header controls fit the smallest supported screen');
    await header.getByRole('button', { name: 'Open daily challenges' }).click();
    await dailyDrawer.getByRole('progressbar', { name: 'Daily plan progress' }).waitFor();
    const box = await dailyDrawer.boundingBox();
    assert.ok(box.x >= 0 && box.width <= width, 'Daily drawer fits the mobile viewport');
    assert.ok(await dailyDrawer.evaluate(node => node.scrollWidth <= node.clientWidth), 'Drawer has no horizontal overflow');
    await page.screenshot({ path: `${output}/daily-drawer-mobile-${width}.png` });
    await dailyDrawer.getByRole('button', { name: 'Close daily challenges' }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#missions').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page-level mobile overflow');
  await page.screenshot({ path: `${output}/missions-mobile.png` });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/u/test-university/__engagement-fixture?celebrate`, { waitUntil: 'commit' });
  await page.getByRole('dialog', { name: 'You reached Level 2!' }).waitFor();
  await page.waitForTimeout(350);
  assert.ok(await page.locator('[role="presentation"] .pointer-events-none span').count() >= 50, 'Normal-motion mode includes the confetti burst');
  await page.screenshot({ path: `${output}/celebration.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Consumed celebration does not replay');
  await page.goto(`${base}/u/test-university/__engagement-fixture?restricted`, { waitUntil: 'commit' });
  await page.locator('#activity').waitFor();
  await header.getByRole('textbox', { name: 'Search student modules' }).fill('coding');
  assert.equal(await header.getByRole('button', { name: 'PrepCoding Practice problem solving' }).count(), 0, 'Profile header respects university feature allocations');
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Open module launcher' }).click();
  assert.equal(await header.getByRole('button', { name: 'Learning', exact: true }).count(), 0);
  await header.getByRole('button', { name: 'Open daily challenges' }).click();
  await dailyDrawer.getByText('Your next challenge is on its way', { exact: true }).waitFor();
  assert.equal(await dailyDrawer.getByText('Solve Balanced Brackets', { exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await page.goto(`${base}/u/test-university/__engagement-fixture?hub`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Accept daily challenge', exact: true }).waitFor();
  await header.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/challenges-daily.png` });
  await header.getByRole('button', { name: 'Open daily challenges' }).click();
  await dailyDrawer.getByRole('button', { name: 'Accept daily challenge', exact: true }).waitFor();
  await drawerSnapshot('daily-drawer-light');
  await page.mouse.click(200, 100);
  await dailyDrawer.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Accept daily challenge', exact: true }).click();
  await acceptancePopup.waitFor();
  assert.equal(await acceptancePopup.locator('.challenge-celebration__confetti span').count(), 40);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/challenge-accepted-daily.png` });
  await acceptancePopup.getByRole('button', { name: 'Close challenge celebration' }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await acceptancePopup.getByRole('link', { name: 'Let’s get started' }).evaluate(node => node === document.activeElement), true, 'Acceptance popup contains keyboard focus');
  await page.keyboard.press('Escape');
  await acceptancePopup.waitFor({ state: 'hidden' });
  await page.getByText('Challenge accepted', { exact: true }).waitFor();
  assert.equal(await page.getByText('#8 / 120', { exact: true }).count(), 1, 'Acceptance does not fabricate a rank increase');
  await page.getByRole('tab', { name: /^Monthly/ }).click();
  await page.getByRole('button', { name: 'Accept monthly challenge', exact: true }).click();
  const monthlyPopup = page.getByRole('dialog', { name: 'monthly challenge accepted', exact: true });
  await monthlyPopup.waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/challenge-accepted-monthly.png` });
  await monthlyPopup.getByRole('button', { name: 'Close challenge celebration' }).click();
  await page.getByText('Challenge accepted', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/challenges-monthly.png` });
  await page.getByRole('tab', { name: /^Weekly/ }).click();
  await page.getByRole('button', { name: 'Accept weekly challenge', exact: true }).click();
  const weeklyPopup = page.getByRole('dialog', { name: 'weekly challenge accepted', exact: true });
  await weeklyPopup.waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/challenge-accepted-weekly.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /^Monthly/ }).click();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Returning to accepted plans does not replay a popup');
  await header.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/challenges-redesign-dark.png` });
  await header.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Challenge hub has no mobile horizontal overflow');
  await page.screenshot({ path: `${output}/challenges-mobile.png` });
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Redesigned challenge page fits 320px screens');
  assert.ok(await page.locator('.challenge-studio').evaluate(node => node.scrollWidth <= node.clientWidth), 'No internal studio overflow');
  await page.screenshot({ path: `${output}/challenges-mobile-320.png` });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('tab', { name: /^Daily/ }).click();
  await page.evaluate(() => window.__completeDaily());
  await page.getByRole('button', { name: 'Refresh progress' }).click();
  await page.getByText('20 XP added to rank points', { exact: true }).waitFor();
  await page.getByText('#7 / 120', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Automatic level/award celebrations stay on dashboard/profile only');
  await header.getByRole('button', { name: 'Open daily challenges' }).click();
  await dailyDrawer.getByText('20 XP added to rank points', { exact: true }).waitFor();
  assert.equal(await dailyDrawer.getByRole('progressbar', { name: 'Daily plan progress' }).getAttribute('aria-valuenow'), '100');
  await dailyDrawer.getByRole('button', { name: 'Completed 2', exact: true }).click();
  assert.equal(await dailyDrawer.getByRole('list', { name: 'Daily tasks' }).locator('li').count(), 2);
  await drawerSnapshot('daily-drawer-completed');
  await dailyDrawer.getByRole('link', { name: /View all challenges/ }).click();
  await dailyDrawer.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto(`${base}/u/test-university/__engagement-fixture?hub&mobile-celebration`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Accept daily challenge', exact: true }).click();
  await acceptancePopup.waitFor();
  const popupBounds = await acceptancePopup.boundingBox();
  assert.ok(popupBounds.x >= 0 && popupBounds.x + popupBounds.width <= 320 && popupBounds.y >= 0 && popupBounds.y + popupBounds.height <= 650, 'Acceptance popup fits a small mobile screen');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/challenge-accepted-mobile.png` });
  await acceptancePopup.getByRole('link', { name: 'Let’s get started' }).click();
  await acceptancePopup.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('body').evaluate(node => node.style.overflow), '', 'Starting a mission restores scrolling');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${base}/u/test-university/__engagement-fixture?admin`, { waitUntil: 'commit' });
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
