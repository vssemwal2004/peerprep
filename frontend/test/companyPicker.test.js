import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, CompanyPicker;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const COMPANIES = [{ company: 'Google', count: 1782 }, { company: 'Amazon', count: 1561 }, { company: 'Goldman Sachs', count: 165 }];

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin/assessment/create' });
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  CompanyPicker = (await server.ssrLoadModule('/src/admin/assessment/components/CompanyPicker.jsx')).default;
  root = createRoot(document.getElementById('root'));
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close(); dom?.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
};

test('the mock Company is picked from the student companies, searchable, with question counts', async () => {
  let picked = '';
  const render = (value) => act(async () => root.render(h(CompanyPicker, { id: 'mock-company', value, companies: COMPANIES, onChange: (company) => { picked = company; } })));
  await render('');
  const trigger = document.getElementById('mock-company');
  assert.match(trigger.textContent, /Select company/);
  await act(async () => trigger.click());
  const options = () => [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent);
  assert.deepEqual(options(), ['GGoogle1,782', 'AAmazon1,561', 'GGoldman Sachs165'], 'every student company with its count, most-asked first');
  await typeInto(document.querySelector('input[placeholder^="Search"]'), 'gold');
  assert.deepEqual(options(), ['GGoldman Sachs165']);
  await act(async () => document.querySelector('[role="option"] button').click());
  assert.equal(picked, 'Goldman Sachs');
  assert.equal(document.querySelector('[role="listbox"]'), null, 'the list closes after picking');
  await render('Goldman Sachs');
  assert.match(document.getElementById('mock-company').textContent, /Goldman Sachs.*165 questions/);
  await render('Old Company Ltd');
  assert.match(document.getElementById('mock-company').textContent, /Old Company Ltd/, 'a saved company no longer in the list still shows');
});

test('a company with a logo shows it (lazy, on a fixed tile); a broken logo falls back to the initial', async () => {
  const companies = [{ company: 'Google', count: 1782, logo: { url: 'https://img.example/google.png', width: 128, height: 128 } }, { company: 'Amazon', count: 1561, logo: null }];
  await act(async () => root.render(h(CompanyPicker, { id: 'mock-company', value: 'Google', companies, onChange: () => {} })));
  const trigger = document.getElementById('mock-company');
  assert.equal(trigger.querySelector('img')?.getAttribute('src'), 'https://img.example/google.png', 'the selected company shows its logo');
  await act(async () => trigger.click());
  const [google, amazon] = document.querySelectorAll('[role="option"]');
  const image = google.querySelector('img');
  assert.equal(image.getAttribute('loading'), 'lazy');
  assert.equal(google.textContent, 'Google1,782', 'no initial when the logo shows');
  assert.equal(amazon.querySelector('img'), null);
  assert.equal(amazon.textContent, 'AAmazon1,561', 'the initial when there is no logo');
  await act(async () => image.dispatchEvent(new dom.window.Event('error')));
  assert.equal(google.querySelector('img'), null);
  assert.equal(google.textContent, 'GGoogle1,782', 'a logo that fails to load falls back to the initial');
});
