import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DIFFICULTY_THEME, difficultyTheme } from '../src/utils/difficultyTheme.js';
import { DIFFICULTY } from '../src/student/problems/problemsUi.js';
import { difficultyTone } from '../src/student/profile/format.js';

test('question tables, profile pills and charts share the reference difficulty palette', () => {
  assert.equal(DIFFICULTY, DIFFICULTY_THEME);
  const css = readFileSync(new URL('../src/styles/difficulty.css', import.meta.url), 'utf8');
  for (const [label, color] of [['Easy', '#10b981'], ['Medium', '#f97316'], ['Hard', '#f43f5e']]) {
    const theme = difficultyTheme(label);
    assert.equal(theme.color, color);
    assert.equal(theme.stroke, color);
    assert.equal(difficultyTone(label), theme.pill);
    assert.equal(difficultyTheme(` ${label.toUpperCase()} `), theme);
    assert.match(css, new RegExp(`\\.difficulty-${label.toLowerCase()} \\{ --difficulty-accent: ${color};`));
  }
});

test('unknown and mixed labels stay neutral instead of implying easy', () => {
  for (const label of [null, undefined, '', 'Mixed', 'Unknown']) {
    assert.equal(difficultyTheme(label).pill, 'difficulty-neutral difficulty-pill');
  }
  assert.equal(difficultyTheme('easy-medium'), DIFFICULTY_THEME.Medium);
  assert.equal(difficultyTheme('medium-hard'), DIFFICULTY_THEME.Hard);
});

test('difficulty pill labels retain readable contrast in both themes', () => {
  const css = readFileSync(new URL('../src/styles/difficulty.css', import.meta.url), 'utf8');
  const luminance = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  for (const key of ['easy', 'medium', 'hard', 'neutral']) {
    const block = css.match(new RegExp(`\\.difficulty-${key} \\{([^}]+)\\}`))[1];
    const color = (name) => block.match(new RegExp(`--difficulty-${name}: (#[a-f0-9]+)`))[1];
    for (const [foreground, background] of [['ink', 'soft'], ['night', 'night-bg']]) {
      const values = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${key} ${foreground} contrast`);
    }
  }
});
