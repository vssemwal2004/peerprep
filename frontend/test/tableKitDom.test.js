import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, root, createRoot, DataTable, headerClass;
const globals = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173' });
  dom.window.matchMedia ??= (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  });
  for (const key of globals) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
  });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ DataTable } = await server.ssrLoadModule('/src/components/table/index.js'));
  ({ headerClass } = await server.ssrLoadModule('/src/components/table/headerClass.js'));
});

test('a table\'s own header classes replace the matching defaults (Tailwind order is stylesheet order)', () => {
  const plain = headerClass('text-left').split(' ');
  for (const value of ['px-3', 'py-2.5', 'text-[11px]', 'font-semibold', 'uppercase', 'tracking-wide', 'text-slate-500', 'dark:text-zinc-400']) assert.ok(plain.includes(value), value);
  const custom = headerClass('px-6 py-3 text-xs font-medium normal-case text-slate-700 dark:text-gray-300 text-right w-10').split(' ');
  for (const value of ['px-3', 'py-2.5', 'text-[11px]', 'font-semibold', 'uppercase', 'text-slate-500', 'dark:text-zinc-400']) assert.ok(!custom.includes(value), `${value} dropped`);
  assert.ok(custom.includes('tracking-wide') && custom.includes('text-right') && custom.includes('w-10'));
  // Alignment and wrapping utilities are not colours.
  assert.ok(headerClass('text-center whitespace-nowrap').split(' ').includes('text-slate-500'));
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app'));
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

// 60 students in id order; scores deliberately not in id order, one blank score.
const rows = Array.from({ length: 60 }, (_, index) => ({
  _id: `s${index + 1}`,
  name: `Student ${index + 1}`,
  score: index === 7 ? null : (index * 37) % 101,
}));
const columns = [
  { key: 'name', label: 'Name' },
  { key: 'score', label: 'Score', align: 'right', render: (row) => (row.score == null ? '—' : `${row.score}%`) },
  { key: 'actions', label: 'Actions', sortable: false, render: () => h('button', { type: 'button' }, 'Open') },
];

const bodyNames = () => [...document.querySelectorAll('tbody tr td:first-child')].map((cell) => cell.textContent);
const header = (label) => [...document.querySelectorAll('thead th')].find((cell) => cell.textContent.startsWith(label));
const pager = () => document.querySelector('[data-table-pager]');
const button = (label) => pager().querySelector(`button[aria-label="${label}"]`);
const click = (element) => act(async () => element.click());

test('DataTable sorts from its headers and pages with First / Last', async () => {
  await act(async () => root.render(h(DataTable, { columns, rows, noun: 'students' })));

  assert.equal(bodyNames().length, 25, 'default page size is 25');
  assert.deepEqual(bodyNames().slice(0, 2), ['Student 1', 'Student 2']);
  assert.match(pager().textContent, /Showing 1–25 of 60 students/);
  assert.equal(header('Actions').querySelector('button'), null, 'action columns are not sortable');
  assert.equal(button('First page').disabled, true);

  // Name sorts numerically aware: "Student 2" before "Student 10".
  await click(header('Name').querySelector('button'));
  assert.equal(header('Name').getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(bodyNames().slice(0, 3), ['Student 1', 'Student 2', 'Student 3']);
  await click(header('Name').querySelector('button'));
  assert.equal(header('Name').getAttribute('aria-sort'), 'descending');
  assert.equal(bodyNames()[0], 'Student 60');

  // Score sorts by the number, not the rendered "NN%" text; the blank score is last.
  await click(header('Score').querySelector('button'));
  assert.equal(header('Name').getAttribute('aria-sort'), null);
  const firstScores = [...document.querySelectorAll('tbody tr td:nth-child(2)')].map((cell) => Number.parseInt(cell.textContent, 10));
  assert.deepEqual(firstScores, [...firstScores].sort((a, b) => a - b));
  assert.equal(firstScores[0], 0);

  // The platform S.No. column is on and starts at 0 on page 1.
  const table = () => document.querySelector('table');
  assert.equal(table().hasAttribute('data-no-serial'), false);
  assert.equal(table().style.getPropertyValue('--serial-start'), '0');

  await click(button('Last page'));
  assert.match(pager().textContent, /Showing 51–60 of 60 students/);
  assert.equal(table().style.getPropertyValue('--serial-start'), '50', 'numbering continues across pages');
  assert.equal(bodyNames().length, 10);
  assert.equal(document.querySelector('tbody tr:last-child td:nth-child(2)').textContent, '—', 'blank values sort last');
  assert.equal(button('Last page').disabled, true);
  assert.equal(pager().querySelector('button[aria-current="page"]').textContent, '3');

  await click(button('First page'));
  assert.match(pager().textContent, /Showing 1–25 of 60 students/);
  assert.equal(pager().querySelector('button[aria-current="page"]').textContent, '1');

  // Rows per page: 10 → 6 pages, and back to page 1.
  await click(button('Page 2'));
  const select = pager().querySelector('select');
  await act(async () => {
    select.value = '10';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.match(pager().textContent, /Showing 1–10 of 60 students/);
  assert.ok(button('Page 6'), 'last page number is listed');
});

test('serial={false} and empty tables hide the S.No. column', async () => {
  await act(async () => root.render(h(DataTable, { columns, rows, serial: false })));
  assert.equal(document.querySelector('table').hasAttribute('data-no-serial'), true);
  await act(async () => root.render(h(DataTable, { columns, rows: [] })));
  assert.equal(document.querySelector('table').hasAttribute('data-no-serial'), true);
});

test('server mode leaves sorting and paging to the caller', async () => {
  const calls = [];
  const server = {
    sort: null, page: 2, pageSize: 25, total: 240,
    onSort: (key) => calls.push(['sort', key]),
    onPage: (page) => calls.push(['page', page]),
    onPageSize: (size) => calls.push(['size', size]),
  };
  await act(async () => root.render(h(DataTable, { columns, rows: rows.slice(0, 25), server, noun: 'students' })));
  assert.match(pager().textContent, /Showing 26–50 of 240 students/);
  await click(header('Score').querySelector('button'));
  await click(button('Last page'));
  await click(button('First page'));
  assert.deepEqual(calls, [['sort', 'score'], ['page', 10], ['page', 1]]);
  assert.deepEqual(bodyNames().slice(0, 2), ['Student 1', 'Student 2'], 'rows are shown as given');
});
