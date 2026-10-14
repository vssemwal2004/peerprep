import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Renders the real editorial renderer (react-markdown + GFM + KaTeX + sanitize + Prism)
// in jsdom. No network access is involved.
let dom, server, root, createRoot, EditorialView, editorialMarkdown;
const browserGlobals = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser'];
const globals = [...browserGlobals, 'IS_REACT_ACT_ENVIRONMENT'];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

const FENCE = '```';

const FIXTURE = [
  '## Overview',
  '',
  'We store indices in a `vector<int>` and group words in a Map<String, List<Integer>> keyed by signature.',
  'In C++ we write vector<int> idx; the guard a<b && c>d must stay literal, and my_snake_case_name stays plain.',
  '',
  'The following:',
  '',
  'Input: nums = [2,7,11,15], target = 9',
  'Output: [0,1]',
  '',
  '## Intuition',
  '',
  '> **Note:** Hash lookups are expected $O(1)$.',
  '',
  '> **Tip:** Sort first when the input order does not matter.',
  '',
  '> **Warning:** Do not reuse the same index twice.',
  '',
  '## Approach 1: Brute Force',
  '',
  '### Algorithm',
  '',
  '1. Fix the first index `i`.',
  '',
  '2. Scan every later index `j`.',
  '   - Compare `nums[i] + nums[j]` with the target.',
  '   - Stop at the first match.',
  '',
  '3. Return the pair.',
  '',
  '### Dry Run',
  '',
  '| Step | i | j | nums[i] + nums[j] | Match? |',
  '| ---- | - | - | ----------------- | ------ |',
  '| 1 | 0 | 1 | 9 | yes |',
  '| 2 | 0 | 2 | 13 | no |',
  '',
  '### Complexity',
  '',
  '- **Time:** $O(n \\log n)$ - sorting dominates.',
  '- **Space:** $O(n)$ - the index map.',
  '',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '',
  '## Approach 2: Hash Map',
  '',
  `${FENCE}cpp`,
  'vector<int> twoSum(vector<int>& nums, int target);',
  FENCE,
  '',
  `${FENCE}java`,
  'Map<String, List<Integer>> groups = new HashMap<>();',
  FENCE,
  '',
  `${FENCE}python`,
  'def two_sum(nums, target):',
  '    seen = {}',
  FENCE,
  '',
  `${FENCE}typescript`,
  'const seen = new Map<number, number>();',
  FENCE,
  '',
  'Unsafe content: <script>window.__pwned = true</script> and [click me](javascript:alert(1)) and [docs](https://example.com/docs).',
  '',
  '<script>window.__pwned = true</script>',
  '',
  '## Edge Cases',
  '',
  '- Empty input.',
  '- Duplicates such as a<b.',
  '',
  '## Common Mistakes',
  '',
  '- Using names like snake_case_value or dp_x_y by accident.',
].join('\n');

const SOLUTIONS = {
  c: 'int* twoSum(int* nums, int n) { return 0; }',
  python: 'class Solution:\n    def twoSum(self, nums, target):\n        return []',
  typescript: 'function twoSum(nums: number[], target: number): number[] { return []; }',
  cpp: 'class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { return {}; } };',
  javascript: 'var twoSum = function (nums, target) { return []; };',
  java: 'class Solution { public int[] twoSum(int[] nums, int target) { return new int[0]; } }',
};

const META = {
  format: 'md-v2',
  version: 1,
  source: 'doocs-derived',
  license: 'CC-BY-SA-4.0',
  attributionUrl: 'https://github.com/doocs/leetcode/blob/main/solution/0000-0099/0001.Two%20Sum/README_EN.md',
  generatedBy: 'test',
  reviewedAt: null,
  checks: [],
};

function installGlobals() {
  for (const key of browserGlobals) {
    const value = dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

async function render(props) {
  await act(async () => { root.render(h(EditorialView, props)); });
  // Effects (outline collection) run after the first commit.
  await act(async () => {});
  return document.getElementById('app');
}

function tabLabels(group) {
  return [...group.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173/problems/x', pretendToBeVisual: true });
  installGlobals();
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'error',
  });
  // Load leaf modules first: on a cold Vite cache a single ssrLoadModule of the whole
  // graph can exceed Vite's 60 s per-request transport timeout on slow disks.
  editorialMarkdown = await server.ssrLoadModule('/src/components/editorial/editorialMarkdown.js');
  await server.ssrLoadModule('/src/components/editorial/EditorialCodeGroup.jsx');
  EditorialView = (await server.ssrLoadModule('/src/components/editorial/EditorialView.jsx')).default;
}, { timeout: 300000 });

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
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

test('generics, comparisons and snake_case survive verbatim; prose Input:/Output: stays prose', async () => {
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  const text = app.textContent;
  assert.match(text, /a `?vector<int>`? and group words in a Map<String, List<Integer>> keyed/);
  assert.ok(text.includes('In C++ we write vector<int> idx; the guard a<b && c>d must stay literal'));
  assert.ok(text.includes('my_snake_case_name stays plain'));
  assert.ok(text.includes('Using names like snake_case_value or dp_x_y by accident'), 'intraword underscores must not italicise');
  assert.ok(text.includes('Duplicates such as a<b.'));
  assert.equal(app.querySelectorAll('em').length, 0);
  // "The following:" must not inject list markers into the next lines.
  const inputParagraph = [...app.querySelectorAll('p')].find((p) => p.textContent.includes('Input: nums = [2,7,11,15]'));
  assert.ok(inputParagraph, 'Input:/Output: lines render as an ordinary paragraph');
  assert.ok(inputParagraph.textContent.includes('Output: [0,1]'));
  assert.ok(!inputParagraph.textContent.includes('- '));
  // Inline code keeps generics too.
  assert.ok([...app.querySelectorAll('code')].some((code) => code.textContent === 'vector<int>'));
});

test('headings get anchors and an On this page outline; lists, tables, math and callouts render', async () => {
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  const h2s = [...app.querySelectorAll('h2[id]')];
  assert.deepEqual(
    h2s.map((heading) => heading.getAttribute('data-outline-label')),
    ['Overview', 'Intuition', 'Approach 1: Brute Force', 'Approach 2: Hash Map', 'Edge Cases', 'Common Mistakes', 'Implementation'],
  );
  assert.equal(new Set(h2s.map((heading) => heading.id)).size, h2s.length, 'heading ids are unique');
  const nav = app.querySelector('nav[aria-label="On this page"]');
  assert.ok(nav, 'outline renders');
  const outlineTargets = [...nav.querySelectorAll('a')].map((link) => link.getAttribute('href').slice(1));
  assert.ok(outlineTargets.length >= 7);
  for (const id of outlineTargets) assert.ok(app.querySelector(`[id="${id}"]`), `outline target ${id} exists`);

  // Ordered list split by blank lines stays ONE list with a nested bullet list.
  const ol = app.querySelector('ol.list-decimal');
  assert.ok(ol);
  assert.equal(ol.querySelectorAll(':scope > li').length, 3);
  assert.equal(ol.querySelectorAll(':scope > li ul > li').length, 2);

  // Table: wrapped so only the table scrolls horizontally.
  const wrapper = app.querySelector('[data-table-scroll]');
  assert.ok(wrapper && wrapper.className.includes('overflow-x-auto'));
  assert.equal(wrapper.querySelectorAll('tbody tr').length, 2);
  assert.equal(wrapper.querySelectorAll('th').length, 5);

  // KaTeX inline + display.
  assert.ok(app.querySelectorAll('.katex').length >= 3, 'inline math rendered by KaTeX');
  assert.equal(app.querySelectorAll('.katex-display').length, 1, 'block math rendered in display mode');
  assert.ok([...app.querySelectorAll('.katex annotation')].some((node) => node.textContent.includes('O(n \\log n)')));

  // Callouts.
  assert.deepEqual([...app.querySelectorAll('[data-callout]')].map((node) => node.getAttribute('data-callout')), ['note', 'tip', 'warning']);
  assert.ok(!app.querySelector('[data-callout="note"]').textContent.includes('**'));

  // Complexity rows.
  const rows = [...app.querySelectorAll('[data-complexity]')];
  assert.deepEqual(rows.map((row) => row.getAttribute('data-complexity')), ['time', 'space']);
  assert.ok(rows[0].querySelector('.katex'));
  assert.ok(rows[0].textContent.includes('sorting dominates'));
  assert.ok(app.querySelector('[data-complexity-list]'));
});

test('four consecutive fences form one tab group; implementation tabs follow the fixed order', async () => {
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  const groups = [...app.querySelectorAll('[data-code-group]')];
  assert.equal(groups.length, 2, 'one prose group + one implementation group');
  const [prose, implementation] = groups;
  assert.equal(prose.getAttribute('data-tab-count'), '4');
  assert.deepEqual(tabLabels(prose), ['C++', 'Java', 'Python', 'TypeScript']);
  assert.ok(prose.querySelector('pre code').textContent.includes('vector<int> twoSum(vector<int>& nums'));
  assert.ok(prose.querySelector('.token'), 'syntax highlighting tokens are present');
  assert.ok(implementation.closest('[data-editorial-implementation]'));
  assert.deepEqual(tabLabels(implementation), ['C++', 'Java', 'Python', 'JavaScript', 'TypeScript', 'C']);
  assert.ok(prose.querySelector('button[aria-label^="Copy"]'));

  // Choosing Python in one group switches every group and is remembered.
  const pythonTab = [...prose.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Python');
  await act(async () => { pythonTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  assert.equal(localStorage.getItem('peerprep:editorial:language'), 'python');
  assert.equal(prose.querySelector('[data-language]').getAttribute('data-language'), 'python');
  assert.equal(implementation.querySelector('[data-language]').getAttribute('data-language'), 'python');
  assert.ok(implementation.querySelector('pre code').textContent.includes('def twoSum'));
});

test('a remembered language is restored on the next render', async () => {
  localStorage.setItem('peerprep:editorial:language', 'java');
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  for (const group of app.querySelectorAll('[data-code-group]')) {
    assert.equal(group.querySelector('[data-language]').getAttribute('data-language'), 'java');
  }
});

test('script tags and javascript: links are neutralised; external links are safe', async () => {
  delete globalThis.window.__pwned;
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  assert.equal(app.querySelectorAll('script').length, 0);
  assert.equal(globalThis.window.__pwned, undefined);
  assert.ok(app.textContent.includes('<script>window.__pwned = true</script>'), 'raw HTML is shown as literal text');
  for (const link of app.querySelectorAll('a[href]')) {
    assert.ok(!/^\s*javascript:/i.test(link.getAttribute('href')), `unsafe href ${link.getAttribute('href')}`);
  }
  const neutralized = app.querySelector('[data-neutralized-link]');
  assert.ok(neutralized && neutralized.textContent === 'click me');
  const external = [...app.querySelectorAll('a')].find((link) => link.textContent.includes('docs'));
  assert.equal(external.getAttribute('href'), 'https://example.com/docs');
  assert.equal(external.getAttribute('target'), '_blank');
  assert.equal(external.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(app.querySelectorAll('[onclick], [onerror]').length, 0);
});

test('attribution footer is shown only when editorialMeta carries a license', async () => {
  let app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  const footer = app.querySelector('[data-editorial-attribution]');
  assert.ok(footer);
  const license = [...footer.querySelectorAll('a')].find((link) => link.textContent === 'CC BY-SA 4.0');
  assert.equal(license.getAttribute('href'), 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.ok([...footer.querySelectorAll('a')].some((link) => link.getAttribute('href') === META.attributionUrl && link.getAttribute('rel') === 'noopener noreferrer'));

  app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: { ...META, license: '', attributionUrl: 'javascript:alert(1)' } });
  assert.equal(app.querySelector('[data-editorial-attribution]'), null);
});

test('leetcode-ca-derived shows a subtle Reference link; peerprep-original shows nothing', async () => {
  const caMeta = { ...META, source: 'leetcode-ca-derived', license: '', attributionUrl: 'https://leetcode.ca/2016-01-24-55-Jump Game/' };
  let app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: caMeta });
  const footer = app.querySelector('[data-editorial-attribution="reference"]');
  assert.ok(footer, 'reference footer renders');
  const links = [...footer.querySelectorAll('a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent.trim(), 'Reference');
  assert.equal(links[0].getAttribute('href'), 'https://leetcode.ca/2016-01-24-55-Jump%20Game/', 'spaces are percent-encoded');
  assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
  assert.ok(!footer.textContent.includes('licensed'));

  app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: { ...caMeta, attributionUrl: 'javascript:alert(1)' } });
  assert.equal(app.querySelector('[data-editorial-attribution]'), null, 'unsafe reference URL renders nothing');

  app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: { ...META, source: 'peerprep-original', license: '', attributionUrl: '' } });
  assert.equal(app.querySelector('[data-editorial-attribution]'), null);
});

test('an inline "## Implementation" section is never duplicated by the appended tabs', async () => {
  const markdown = [
    '## Overview', '', 'Convert the expression.', '',
    '## Implementation', '',
    `${FENCE}c`, '#include <stdio.h>', 'int main(void) { return 0; }', FENCE,
  ].join('\n');
  const app = await render({ markdown, solutions: { c: 'int other(void);', python: 'pass' }, meta: { ...META, source: 'peerprep-original', license: '' } });
  const labels = [...app.querySelectorAll('h2[id]')].map((heading) => heading.getAttribute('data-outline-label'));
  assert.deepEqual(labels, ['Overview', 'Implementation']);
  assert.equal(app.querySelector('[data-editorial-implementation]'), null);
  const groups = app.querySelectorAll('[data-code-group]');
  assert.equal(groups.length, 1);
  assert.ok(groups[0].textContent.includes('#include <stdio.h>'));
  assert.ok(!app.textContent.includes('int other(void);'));

  // A heading inside a fence does not count as the section.
  assert.equal(editorialMarkdown.hasImplementationSection(`${FENCE}text\n## Implementation\n${FENCE}`), false);
  assert.equal(editorialMarkdown.hasImplementationSection('## Implementation'), true);
  assert.equal(editorialMarkdown.hasImplementationSection('### Implementation notes'), false);
});

test('SQL reference renders as a highlighted SQL tab after the judged languages', async () => {
  const app = await render({
    markdown: '## Overview\n\nJoin the two tables.\n\n## Approach 1: Left Join\n\n### Query Walkthrough\n\n1. `FROM Person p` reads every person.',
    solutions: { sql: 'SELECT p.firstName, a.city\nFROM Person p\nLEFT JOIN Address a ON p.personId = a.personId;' },
    meta: { ...META, source: 'peerprep-original', license: '' },
  });
  const group = app.querySelector('[data-editorial-implementation] [data-code-group]');
  assert.equal(group.querySelector('[data-language]').getAttribute('data-language'), 'sql');
  assert.ok(group.querySelector('.token.keyword'), 'SQL keywords are highlighted');
  assert.ok(app.textContent.includes('Reference query validated'));
  assert.deepEqual(
    editorialMarkdown.buildImplementationBlocks({ sql: 's', typescript: 't', c: 'c', java: 'j' }).map((block) => block.lang),
    ['java', 'typescript', 'c', 'sql'],
  );
});

test('single-line $$...$$ paragraphs render as display math; a leading title h1 is dropped', async () => {
  const markdown = '# Two Sum\n\n## Overview\n\nText with $x$ inline.\n\n$$f[i] = 1 + \\max\\{\\, f[j] : j < i \\,\\}$$\n\nPrice is \\$5.';
  const app = await render({ markdown, meta: null, title: 'Two Sum' });
  assert.equal(app.querySelectorAll('.katex-display').length, 1);
  assert.equal(app.querySelectorAll('.katex').length, 2);
  assert.ok(app.textContent.includes('Price is $5.'));
  assert.deepEqual([...app.querySelectorAll('h2[id]')].map((heading) => heading.getAttribute('data-outline-label')), ['Overview']);

  // Without a matching title, an h1 is kept (demoted to h2).
  const other = await render({ markdown, meta: null, title: 'Different' });
  assert.deepEqual([...other.querySelectorAll('h2[id]')].map((heading) => heading.getAttribute('data-outline-label')), ['Two Sum', 'Overview']);
});

test('table headers keep identifier case and only the table wrapper scrolls', async () => {
  const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
  const th = [...app.querySelectorAll('th')].find((cell) => cell.textContent.includes('nums[i] + nums[j]'));
  assert.ok(th);
  assert.ok(!/\buppercase\b/.test(th.className));
  const table = app.querySelector('[data-table-scroll] table');
  assert.ok(!/\bmin-w-max\b/.test(table.className), 'cells wrap instead of forcing max-content width');
});

// ---------------------------------------------------------------------------
// Real data: exported from peerprep_repair_staging (editorialMeta.format === 'md-v2')
// and from D:\PeerPrepSources\editorials\v2 (joined to the same DB for validated solutions).
// ---------------------------------------------------------------------------

const REAL = JSON.parse(readFileSync(new URL('./fixtures/editorialRealSamples.json', import.meta.url), 'utf8')).samples;
const ORDER = ['cpp', 'java', 'python', 'javascript', 'typescript', 'c', 'sql'];
const LABELS = { cpp: 'C++', java: 'Java', python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', c: 'C', sql: 'SQL' };

// Text that is not inside code or KaTeX output: no markdown syntax may leak into it.
function proseText(app) {
  const clone = app.cloneNode(true);
  for (const node of clone.querySelectorAll('code, pre, .katex, [data-code-group]')) node.remove();
  return clone.textContent;
}

function tableCountIn(markdown) {
  return (markdown.match(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm) || []).length;
}

test('real data: fixture covers the required sources', () => {
  assert.ok(REAL.filter((sample) => sample.origin === 'staging-db').length >= 3, 'three md-v2 problems from the staging DB');
  assert.ok(REAL.filter((sample) => sample.origin === 'editorials-v2-file').length >= 3, 'md-v2 files from editorials/v2');
  for (const sample of REAL) assert.equal(sample.meta.format, 'md-v2');
});

for (const sample of REAL) {
  test(`real data: ${sample.origin} ${sample.problemId} "${sample.title}" renders cleanly`, async () => {
    const app = await render({ markdown: sample.markdown, solutions: sample.solutions, meta: sample.meta, title: sample.title });
    const root = app.querySelector('[data-editorial-root]');
    assert.equal(root.getAttribute('data-editorial-format'), 'md-v2');

    // Headings: unique ids, outline links resolve, the title is never repeated as a section.
    const headings = [...app.querySelectorAll('h2[id], h3[id]')];
    assert.equal(new Set(headings.map((heading) => heading.id)).size, headings.length);
    const h2Labels = [...app.querySelectorAll('h2[id]')].map((heading) => heading.getAttribute('data-outline-label'));
    assert.ok(!h2Labels.some((label) => label.toLowerCase() === sample.title.toLowerCase()), 'title h1 is not shown as a section');
    assert.equal(h2Labels.filter((label) => label === 'Implementation').length, Object.keys(sample.solutions).length || sample.inlineImplementation ? 1 : 0, 'exactly one Implementation section');
    for (const link of app.querySelectorAll('nav[aria-label="On this page"] a')) {
      assert.ok(app.querySelector(`[id="${link.getAttribute('href').slice(1)}"]`));
    }
    if (sample.origin === 'editorials-v2-file') {
      assert.deepEqual(h2Labels.slice(0, 2), ['Overview', 'Intuition']);
      const approaches = h2Labels.filter((label) => /^Approach \d+: /.test(label));
      assert.ok(approaches.length >= 1 && approaches.length <= 3);
      approaches.forEach((label, index) => assert.ok(label.startsWith(`Approach ${index + 1}: `)));
      const tail = h2Labels.slice(2 + approaches.length);
      assert.deepEqual(tail, ['Edge Cases', 'Common Mistakes', 'Implementation']);
      for (const name of ['Algorithm', 'Dry Run', 'Complexity']) {
        assert.equal(
          [...app.querySelectorAll('h3[id]')].filter((heading) => heading.getAttribute('data-outline-label') === name).length,
          approaches.length,
          `each approach has ### ${name}`,
        );
      }
      assert.equal(app.querySelectorAll('[data-complexity="time"]').length, approaches.length);
      assert.equal(app.querySelectorAll('[data-complexity="space"]').length, approaches.length);
    }

    // Tables: every GFM table renders inside its own scroll wrapper.
    assert.equal(app.querySelectorAll('[data-table-scroll] table').length, tableCountIn(sample.markdown));

    // Math: rendered by KaTeX without errors; no stray "$" or markdown syntax in prose.
    assert.equal(app.querySelectorAll('.katex-error').length, 0);
    if (/\$[^$\n]+\$/.test(sample.markdown)) assert.ok(app.querySelectorAll('.katex').length > 0);
    const prose = proseText(app);
    if (!sample.markdown.includes('\\$')) {
      assert.ok(!prose.includes('$'), `no unrendered math in prose: ${prose.match(/.{0,40}\$.{0,40}/)?.[0]}`);
    }
    assert.ok(!prose.includes('**'), 'no literal bold markers');
    assert.ok(!/(^|\n)#{1,6} /.test(prose), 'no literal heading markers');
    assert.ok(!prose.includes('```'), 'no literal code fences');

    // Code: implementation tabs follow the fixed order and preserve generics verbatim.
    const implementation = app.querySelector('[data-editorial-implementation] [data-code-group]');
    const languages = ORDER.filter((language) => sample.solutions[language]);
    if (languages.length && !sample.inlineImplementation) {
      const tabs = [...implementation.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
      assert.deepEqual(tabs, languages.map((language) => LABELS[language]));
      for (const language of languages) {
        const tab = [...implementation.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === LABELS[language]);
        await act(async () => { tab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
        const code = implementation.querySelector('pre code').textContent;
        assert.equal(code, sample.solutions[language].replace(/\s+$/, ''), `${language} reference is rendered verbatim`);
      }
    } else {
      assert.equal(app.querySelector('[data-editorial-implementation]'), null);
    }
    for (const group of app.querySelectorAll('[data-code-group]')) {
      assert.ok(group.querySelector('pre code').textContent.trim(), 'no empty code panel');
    }

    // Attribution follows editorialMeta.
    const footer = app.querySelector('[data-editorial-attribution]');
    if (sample.meta.license) assert.equal(footer?.getAttribute('data-editorial-attribution'), 'license');
    else if (sample.meta.source === 'leetcode-ca-derived') assert.equal(footer?.getAttribute('data-editorial-attribution'), 'reference');
    else assert.equal(footer, null);
  });
}

test('real data: generics such as vector<int> survive in rendered reference code', async () => {
  const withGenerics = REAL.filter((sample) => /\b(vector|unordered_map|List|Map|HashMap|ArrayList|Set)<[^>\n]+>/.test(sample.solutions.cpp || '') || /\b(List|Map|HashMap|ArrayList|Set|Deque)<[^>\n]+>/.test(sample.solutions.java || ''));
  assert.ok(withGenerics.length >= 1, 'fixture contains reference code with generics');
  for (const sample of withGenerics) {
    localStorage.clear();
    const app = await render({ markdown: sample.markdown, solutions: sample.solutions, meta: sample.meta, title: sample.title });
    const group = app.querySelector('[data-editorial-implementation] [data-code-group]');
    for (const language of ['cpp', 'java']) {
      const generic = (sample.solutions[language] || '').match(/\b\w+<[^>\n]+>/)?.[0];
      if (!generic) continue;
      const tab = [...group.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === LABELS[language]);
      await act(async () => { tab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
      assert.ok(group.querySelector('pre code').textContent.includes(generic), `${sample.title} ${language}: ${generic}`);
    }
  }
});

test('real data: inline-implementation editorial keeps its own C code and no appended tabs', async () => {
  const sample = REAL.find((item) => item.inlineImplementation);
  assert.ok(sample, 'fixture has an inlineImplementation editorial');
  const app = await render({ markdown: sample.markdown, solutions: sample.solutions, meta: sample.meta, title: sample.title });
  assert.equal(app.querySelector('[data-editorial-implementation]'), null);
  const groups = [...app.querySelectorAll('[data-code-group]')];
  const last = groups[groups.length - 1];
  assert.ok(last.textContent.includes('#include <stdio.h>'));
  assert.ok(last.querySelector('.token'));
});

test('real data: one-line $$ formula in the LIS editorial renders in display mode', async () => {
  const sample = REAL.find((item) => /^\$\$.+\$\$$/m.test(item.markdown));
  assert.ok(sample);
  const app = await render({ markdown: sample.markdown, solutions: sample.solutions, meta: sample.meta, title: sample.title });
  assert.ok(app.querySelectorAll('.katex-display').length >= 1);
});

test('legacy editorial (no meta) renders headings, Thinking callout, math and attribution link', async () => {
  const legacy = [
    '### Solution 1: Enumerate Subarrays',
    '',
    '',
    '',
    '> **Thinking**',
    '>',
    '> For $n\\le 1000$ there are $O(n^2)$ subarrays.',
    '',
    'We enumerate the left endpoint $i$ and keep $\\textit{nums}$ intact.',
    '',
    '<p>[View the illustration in the source editorial](https://github.com/doocs/leetcode/blob/main/README_EN.md)</p>',
    '',
    'Adapted from [Doocs LeetCode Solutions](https://github.com/doocs/leetcode), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).',
  ].join('\r\n');
  const app = await render({ markdown: legacy, solutions: { python: 'print(1)' }, meta: null });
  assert.equal(app.querySelector('[data-editorial-root]').getAttribute('data-editorial-format'), 'legacy');
  assert.ok(app.querySelector('h3[id]').textContent.includes('Solution 1: Enumerate Subarrays'));
  const insight = app.querySelector('[data-callout="insight"]');
  assert.ok(insight && insight.textContent.includes('Thinking'));
  assert.ok(insight.querySelector('.katex'));
  assert.ok(!app.textContent.includes('<p>'), 'legacy <p> wrappers are unwrapped');
  const illustration = [...app.querySelectorAll('a')].find((link) => link.textContent.includes('View the illustration'));
  assert.ok(illustration && illustration.getAttribute('target') === '_blank');
  assert.equal(app.querySelector('[data-editorial-attribution]'), null);
  assert.deepEqual(tabLabels(app.querySelector('[data-editorial-implementation]')), []);
  assert.ok(app.querySelector('[data-editorial-implementation] [data-language="python"]'));
});

test('rendering survives unavailable localStorage', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    const app = await render({ markdown: FIXTURE, solutions: SOLUTIONS, meta: META });
    const group = app.querySelector('[data-code-group]');
    const javaTab = [...group.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Java');
    await act(async () => { javaTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(group.querySelector('[data-language]').getAttribute('data-language'), 'java');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', descriptor);
  }
});

test('pure helpers: URL policy, fence-aware cleanup and implementation ordering', () => {
  const { editorialUrlTransform, normalizeEditorialMarkdown, buildImplementationBlocks } = editorialMarkdown;
  assert.equal(editorialUrlTransform('javascript:alert(1)', 'href'), '');
  assert.equal(editorialUrlTransform('JaVaScRiPt:alert(1)', 'href'), '');
  assert.equal(editorialUrlTransform('data:text/html;base64,xx', 'src'), '');
  assert.equal(editorialUrlTransform('vbscript:x', 'href'), '');
  assert.equal(editorialUrlTransform('https://a.example/x', 'href'), 'https://a.example/x');
  assert.equal(editorialUrlTransform('#overview', 'href'), '#overview');
  assert.equal(editorialUrlTransform('/problems/1', 'href'), '/problems/1');
  assert.equal(
    normalizeEditorialMarkdown('<p>text</p>\n```html\n<p>keep</p>\n```'),
    'text\n```html\n<p>keep</p>\n```',
  );
  assert.deepEqual(
    buildImplementationBlocks({ sql: 'select 1', c: 'x', python: 'y', cpp: 'z', empty: '  ' }).map((block) => block.lang),
    ['cpp', 'python', 'c', 'sql'],
  );
});
