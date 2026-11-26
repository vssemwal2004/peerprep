import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const classes = [
  'text-sky-400', 'dark:text-sky-400', 'text-sky-600', 'bg-sky-600', 'focus-visible:ring-sky-500', 'stroke-sky-500',
  'dark:text-emerald-300', 'dark:text-amber-300', 'dark:text-rose-300', 'dark:text-violet-300',
  'bg-rose-500/10', 'from-sky-500', 'to-sky-700',
];
const config = loadConfig(fileURLToPath(new URL('../tailwind.config.js', import.meta.url)));
const compiled = await postcss([tailwind({ ...config, content: [{ raw: `<div class="${classes.join(' ')}"></div>`, extension: 'html' }] })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined });
const darkProperties = new Map();
compiled.root.walkDecls(/^--pp-dark-/, (declaration) => {
  assert.equal(declaration.parent.selector, '[class~="dark"]');
  darkProperties.set(declaration.prop, declaration.value);
});

function utility(className, property) {
  const selector = `.${className.replace(/[:/]/g, '\\$&')}`;
  const rule = compiled.root.nodes.find((node) => node.type === 'rule' && node.selector.includes(selector));
  const value = rule?.nodes.find((node) => node.prop === property)?.value;
  assert.ok(value, `${className} emits ${property}`);
  return value;
}

function channels(value, dark) {
  const match = value.match(/var\((--pp-dark-[\w-]+),\s*([\d ]+)\)/);
  assert.ok(match, `color has a dark token and a light fallback: ${value}`);
  const rgb = dark ? darkProperties.get(match[1]) : match[2];
  assert.ok(rgb, `defined color channels for ${match[1]}`);
  return rgb.trim().split(/\s+/).map(Number);
}

function luminance(rgb) {
  return rgb.map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(first, second) {
  const [bright, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

test('accent utilities preserve the light colors and support dark overrides, tints and gradients', () => {
  const sky = utility('text-sky-400', 'color');
  assert.deepEqual(channels(sky, false), [56, 189, 248]);
  assert.deepEqual(channels(sky, true), channels(utility('dark:text-sky-400', 'color'), true));
  const [red, green, blue] = channels(sky, true);
  assert.ok(blue - red >= 145 && blue - red < 192, 'dark sky has a clear blue hue');
  assert.ok(green >= 182, 'dark sky has enough brightness for labels');
  assert.deepEqual(channels(utility('bg-sky-600', 'background-color'), false), [2, 132, 199]);
  assert.match(utility('bg-rose-500/10', 'background-color'), /\/ 0\.1\)/);
  assert.match(utility('from-sky-500', '--tw-gradient-from'), /--pp-dark-accent-sky-500/);
  assert.match(utility('to-sky-700', '--tw-gradient-to'), /--pp-dark-accent-sky-700/);
});

test('muted dark accents keep text, buttons, chart strokes and keyboard focus readable', () => {
  const canvas = [26, 26, 26];
  const control = [48, 48, 48];
  const button = channels(utility('bg-sky-600', 'background-color'), true);
  const ink = channels(utility('text-sky-600', 'color'), true);
  assert.ok(contrast([255, 255, 255], button) >= 4.5);
  assert.ok(contrast(ink, control) >= 4.5);
  assert.ok(contrast(channels(utility('focus-visible:ring-sky-500', '--tw-ring-color'), true), control) >= 3);
  assert.ok(contrast(channels(utility('stroke-sky-500', 'stroke'), true), canvas) >= 3);
  const statuses = ['emerald', 'amber', 'rose', 'violet'].map((tone) => channels(utility(`dark:text-${tone}-300`, 'color'), true));
  assert.equal(new Set(statuses.map(String)).size, statuses.length);
  for (const status of statuses) assert.ok(contrast(status, control) >= 4.5);
  for (const [property, rgb] of darkProperties) {
    if (/^--pp-dark-accent-[a-z]+-(500|600|700)$/.test(property)) {
      assert.ok(contrast([255, 255, 255], rgb.split(/\s+/).map(Number)) >= 4.5, `white label on ${property}`);
    }
  }
});
