import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSqlFixtures } from '../scripts/lib/sql-publication/tableFixtures.js';

const description = `Table: \`prompts\`
+---------+---------+
| Column Name | Type |
+---------+---------+
| user_id | int |
| prompt | varchar |
| tokens | int |
+---------+---------+
Each row represents a prompt.
Example:
Input:
prompts table:
+---------+---------+---------+
| user_id | prompt | tokens |
+---------+---------+---------+
| 1 | Bob's query | 3 |
| 1 | next | 4 |
+---------+---------+---------+
Output:
+---------+---------+
| user_id | avg_tokens |
+---------+---------+
| 1 | 3.50 |
+---------+---------+
Explanation: The mean of 3 and 4 is 3.5.`;

test('builds SQLite schema and samples from authored tables, preserving escaped string data', () => {
  const result = extractSqlFixtures(description);
  assert.equal(result.schemas.length, 1);
  assert.match(result.schemaSql, /"user_id" INTEGER/);
  assert.match(result.samples[0].input, /'Bob''s query'/);
  assert.equal(result.samples[0].output, '1|3.5');
  assert.deepEqual(result.samples[0].columns, ['user_id', 'avg_tokens']);
});

test('refuses incomplete source schemas and missing expected output tables', () => {
  assert.throws(() => extractSqlFixtures('No tables'), /schemas/);
  assert.throws(() => extractSqlFixtures(description.replace('| 1 | 3.50 |', '| 1 |')), /column counts/);
  assert.throws(() => extractSqlFixtures(description.replace('prompts table:', 'Input data:')), /unnamed/);
});
