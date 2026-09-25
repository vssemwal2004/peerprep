export const MCQ_IMPORT_HEADERS = [
  'Question',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Correct Answer',
  'Marks',
  'Negative Marks',
  'Difficulty',
];

export const MCQ_IMPORT_EXAMPLES = [
  ['What is 2 + 2?', '3', '4', '5', '6', 'B', 1, 0, 'Easy'],
  ['Which are prime numbers?', '2', '4', '5', '9', 'A,C', 2, 0.5, 'Medium'],
];

export const MCQ_ASSESSMENT_SET_HEADER = 'Set';

export const WRITTEN_IMPORT_HEADERS = [
  'Heading (optional)',
  'Question',
  'Question Image URL (optional)',
  'Answer',
  'Keywords (optional)',
  'Positive Score',
  'Negative Score',
  'Difficulty',
  'Time in Seconds',
  'Tags',
];

export const WRITTEN_IMPORT_EXAMPLES = [
  ['Arrays', 'Explain what an array is.', '', 'An array is a collection of elements stored contiguously.', 'contiguous, elements', 2, 0, 'Easy', 120, 'Arrays, DSA'],
];

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const safeCsvCell = (value) => {
  const text = String(value ?? '');
  return csvCell(/^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text);
};

export function buildQuestionCsvTemplate(type = 'mcq', { includeSet = false } = {}) {
  const isMcq = type === 'mcq';
  const rows = isMcq
    ? [
      includeSet ? [...MCQ_IMPORT_HEADERS, MCQ_ASSESSMENT_SET_HEADER] : MCQ_IMPORT_HEADERS,
      ...MCQ_IMPORT_EXAMPLES.map((row) => (includeSet ? [...row, ''] : row)),
    ]
    : [WRITTEN_IMPORT_HEADERS, ...WRITTEN_IMPORT_EXAMPLES];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadQuestionCsvTemplate(type = 'mcq', options = {}) {
  const isMcq = type === 'mcq';
  const csv = buildQuestionCsvTemplate(type, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = isMcq ? 'mcq-import-template.csv' : 'written-answer-import-template.csv';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildQuestionImportErrorCsv(headers = [], errors = []) {
  const safeHeaders = (headers || []).map((header, index) => String(header || `Column ${index + 1}`));
  const rows = [
    ['Source Row', 'Import Error', ...safeHeaders],
    ...(errors || []).map((error) => [
      error.rowNumber ?? '',
      error.message || 'Invalid row',
      ...(error.rawValues || []),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadQuestionImportErrorCsv({ headers = [], errors = [], fileName = 'question-import' } = {}) {
  const csv = buildQuestionImportErrorCsv(headers, errors);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(fileName || 'question-import').replace(/\.(csv|xlsx?)$/i, '')}-errors.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
