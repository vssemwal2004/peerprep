import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT_STEPS, THEME_DEFAULTS, fitTheme, nextFitStep } from '../src/features/resume/templates/theme.js';

// Walks the search like the hook does, with a fake "measure": fits when step >= needed.
function search(start, needed) {
  let probe = { step: start, dir: null, best: null };
  for (let guard = 0; guard < 20; guard += 1) {
    const decision = nextFitStep(probe, probe.step >= needed);
    if (decision.next) { probe = decision.next; continue; }
    if (decision.settle !== probe.step) { probe = { step: decision.settle, dir: 'done', best: null }; continue; }
    return decision.settle;
  }
  throw new Error('search did not settle');
}

test('the search finds the largest size that fits one page, from any starting step', () => {
  const last = FIT_STEPS.length - 1;
  for (let start = 0; start <= last; start += 1) {
    for (let needed = 0; needed <= last; needed += 1) {
      assert.equal(search(start, needed), needed, `start ${start}, needs step ${needed}`);
    }
  }
  // Too long even at the smallest step: stays at the smallest readable size (then 2 pages).
  assert.equal(search(0, last + 1), last);
});

test('fitting tightens spacing more than type and keeps print-readable sizes', () => {
  const theme = { ...THEME_DEFAULTS, side: null };
  assert.equal(fitTheme(theme, 1), theme, 'full size is the template exactly');
  const smallest = fitTheme(theme, FIT_STEPS.at(-1));
  assert.ok(smallest.size.base >= 8.5, `body text ${smallest.size.base}pt stays readable`);
  assert.ok(smallest.size.lineHeight >= 1.12);
  const typeRatio = smallest.size.base / theme.size.base;
  const gapRatio = smallest.title.gapBefore / theme.title.gapBefore;
  assert.ok(gapRatio < typeRatio, 'gaps give more than text');
  assert.ok(smallest.page.padH >= 24 && smallest.page.padTop >= 20, 'margins never get cramped');
  assert.equal(smallest.colors, theme.colors, 'colours and layout do not change');
  assert.equal(fitTheme(theme, 0.91), fitTheme(theme, 0.91), 'cached, so the preview does not re-render needlessly');
});
