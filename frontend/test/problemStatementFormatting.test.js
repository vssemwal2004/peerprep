import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRichText } from '../src/admin/compiler/problemStatementFormatting.js';

test('recovers a legacy Roman numeral table from vertical cells', () => {
  const content = [
    'Seven symbols have the following values:',
    '',
    'Symbol\nValue',
    '',
    'I\n1',
    '',
    'V\n5',
    '',
    'X\n10',
    '',
    'Convert the integer.',
  ].join('\n');

  const normalized = normalizeRichText(content);
  assert.match(normalized, /\| Symbol \| Value \|/);
  assert.match(normalized, /\| `?I`? \| 1 \|/);
  assert.match(normalized, /\| X \| 10 \|/);
  assert.doesNotMatch(normalized, /Symbol\nValue\n\nI\n1/);
});

test('converts source HTML tables without rendering raw markup', () => {
  const content = '<p>Values:</p><table><tr><th>Symbol</th><th>Value</th></tr><tr><td><code>I</code></td><td>1</td></tr></table>';
  const normalized = normalizeRichText(content);
  assert.match(normalized, /\| Symbol \| Value \|/);
  assert.match(normalized, /\| `I` \| 1 \|/);
  assert.doesNotMatch(normalized, /<table|<td|<code/);
});

test('keeps keyboard rows horizontal and readable', () => {
  const content = 'The keyboard grid is shown below.\n\nq\nw\ne\nr\nt\ny\nu\ni\no\np\n\na\ns\nd\nf\ng\nh\nj\nk\nl';
  const normalized = normalizeRichText(content);
  assert.match(normalized, /`q` {2}`w` {2}`e`/);
  assert.match(normalized, /`a` {2}`s` {2}`d`/);
  assert.doesNotMatch(normalized, /\nq\nw\ne\n/);
});

test('decodes repeated serialized CRLF while preserving a single literal escape', () => {
  assert.equal(normalizeRichText('first\\r\\nsecond\\r\\nthird\\r\\nfourth'), 'first\nsecond\nthird\nfourth');
  assert.equal(normalizeRichText('Print `\\n` after the value.'), 'Print `\\n` after the value.');
});

test('converts rectangular ASCII box tables used by SQL statements', () => {
  const source = `Table: Users

+---------+---------+
| user_id | name |
+---------+---------+
| 1 | Ada |
| 2 | Lin |
+---------+---------+`;

  assert.match(normalizeRichText(source), /\| user_id \| name \|\n\| --- \| --- \|\n\| 1 \| Ada \|/);
});

test('preserves angle-bracket placeholders used as literal notation', () => {
  const source = 'Return the value as <pre>...<suf>eC.';
  assert.equal(normalizeRichText(source), 'Return the value as <pre>...<suf>eC.');
});

test('preserves generic placeholders and comparison operators', () => {
  const source = 'Build `<sign><fact>...<pow>` where `2 <= x <= 5`.';
  assert.equal(normalizeRichText(source), source);
});

test('does not decode HTML entity names shown as code', () => {
  const source = 'Convert `&quot;` to `"`, but keep the entity name readable.';
  assert.equal(normalizeRichText(source), source);
});

test('preserves pre and suffix placeholders inside inline code', () => {
  const source = 'Return the abbreviation as `<pre>...<suf>eC`.';
  assert.equal(normalizeRichText(source), source);
});

test('keeps non-keyboard diagrams multiline instead of collapsing them', () => {
  const source = 'The coordinate grid is shown below.\n\n0 0\n0 1\n1 0\n1 1';
  const normalized = normalizeRichText(source);
  assert.match(normalized, /```text\n0 0\n0 1\n1 0\n1 1\n```/);
});
