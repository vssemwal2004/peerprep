import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuestionImportErrorCsv,
  buildQuestionCsvTemplate,
  MCQ_IMPORT_HEADERS,
} from '../src/admin/library/questionImportTemplates.js';

test('default MCQ CSV keeps the template focused on common authoring fields', () => {
  assert.deepEqual(MCQ_IMPORT_HEADERS, [
    'Question',
    'Option A',
    'Option B',
    'Option C',
    'Option D',
    'Correct Answer',
    'Marks',
    'Negative Marks',
    'Difficulty',
  ]);

  const csv = buildQuestionCsvTemplate('mcq');
  assert.match(csv, /"Correct Answer"/);
  assert.match(csv, /"A,C"/);
  assert.doesNotMatch(csv, /Passage Title|Question Image URL|Partial Scoring|Shuffle Options|Time in Seconds|Tags/);
  assert.doesNotMatch(csv, /"Set"/);
});

test('assessment MCQ template adds only the optional set column', () => {
  const csv = buildQuestionCsvTemplate('mcq', { includeSet: true });
  const header = csv.replace(/^\uFEFF/, '').split('\r\n')[0];

  assert.equal(header, [...MCQ_IMPORT_HEADERS, 'Set'].map((value) => `"${value}"`).join(','));
});

test('error CSV preserves source cells, explains failures and neutralizes formulas', () => {
  const csv = buildQuestionImportErrorCsv(
    ['Question', 'Option A', 'Correct Answer'],
    [{
      rowNumber: 4,
      message: 'Correct Answer must reference a valid option.',
      rawValues: ['=HYPERLINK("https://example.test")', 'First', 'Z'],
    }],
  );

  assert.match(csv, /^\uFEFF"Source Row","Import Error","Question","Option A","Correct Answer"/);
  assert.match(csv, /"4","Correct Answer must reference a valid option\."/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
});

