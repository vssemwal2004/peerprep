// Isolated, offline browser check: no backend or student account is used.
// Pass a Playwright module URL when it is installed outside this package.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { DIFFICULTY_THEME } from '../src/utils/difficultyTheme.js';

const { chromium } = await import(process.argv[2] || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let browser;
try {
  const CodingProgress = (await server.ssrLoadModule('/src/student/profile/CodingProgress.jsx')).default;
  const { DifficultyTag } = await server.ssrLoadModule('/src/student/dashboard/ui.jsx');
  const { DifficultyBadge } = await server.ssrLoadModule('/src/admin/compiler/CompilerUi.jsx');
  const { DifficultyMix } = await server.ssrLoadModule('/src/student/quests/QuestCard.jsx');
  const markup = renderToStaticMarkup(h(MemoryRouter, null, h('main', null,
    h(CodingProgress, { totalSolved: 6, totalProblems: 12, easySolved: 2, mediumSolved: 2, hardSolved: 2, totalsByDifficulty: { easy: 4, medium: 4, hard: 4 }, showActivity: false }),
    ...Object.keys(DIFFICULTY_THEME).map((difficulty) => h('div', { key: difficulty, id: difficulty }, h(DifficultyTag, { difficulty }), h(DifficultyBadge, { difficulty }))),
    h(DifficultyMix, { difficulty: { Easy: 1, Medium: 1, Hard: 1 }, total: 3 }),
  )));
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.abort());
  await page.setContent(markup);
  const cssFiles = process.argv.includes('--built')
    ? (await readdir(`${root}/dist/assets`)).filter((name) => /^index-.*\.css$/.test(name)).map((name) => `${root}/dist/assets/${name}`)
    : [`${root}/src/styles/difficulty.css`];
  assert.ok(cssFiles.length, 'Palette stylesheet exists');
  const css = (await Promise.all(cssFiles.map((path) => readFile(path, 'utf8')))).join('\n');
  // Font imports are irrelevant to colour checks and are blocked by this offline test.
  await page.addStyleTag({ content: css.replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;/g, '') });
  // Lazy-loaded legacy CSS must not override the shared palette.
  await page.addStyleTag({ content: await readFile(`${root}/src/student/engagement/studentEngagement.css`, 'utf8') });
  const expected = {
    Easy: ['rgb(16, 185, 129)', 'rgb(4, 120, 87)', 'rgb(112, 203, 173)', 'rgb(93, 185, 148)'],
    Medium: ['rgb(249, 115, 22)', 'rgb(194, 65, 12)', 'rgb(230, 177, 110)', 'rgb(202, 152, 91)'],
    Hard: ['rgb(244, 63, 94)', 'rgb(190, 18, 60)', 'rgb(237, 158, 170)', 'rgb(214, 140, 154)'],
  };
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark);
    for (const [label, [lightFill, lightText, darkText, darkFill]] of Object.entries(expected)) {
      const colors = await page.locator(`#${label} .difficulty-pill`).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
      assert.deepEqual(colors, [dark ? darkText : lightText, dark ? darkText : lightText]);
      const fill = dark ? darkFill : lightFill;
      const fills = await page.locator(`.difficulty-${label.toLowerCase()}.difficulty-fill`).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
      assert.deepEqual(fills, [fill, fill]);
      const arc = page.locator(`[data-segment="${label.toLowerCase()}"] [data-fill]`);
      assert.equal(await arc.getAttribute('stroke'), DIFFICULTY_THEME[label].color);
      assert.equal(await arc.evaluate((node) => getComputedStyle(node).stroke), fill);
    }
  }
  console.log('PASS: actual coding gauge, dashboard badges, solver badges and quest mix use one palette in light/dark modes.');
} finally {
  await browser?.close();
  await server.close();
}
