import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { validateExportRequest, EXPORT_COLUMNS } from '../src/modules/adminAnalytics/exports/export.validation.js';
import { renderAnalyticsXlsx } from '../src/modules/adminAnalytics/exports/excel.renderer.js';
import { renderAnalyticsPdf } from '../src/modules/adminAnalytics/exports/pdf.renderer.js';
import { COLUMN_DEFINITIONS } from '../src/modules/adminAnalytics/exports/export.service.js';

const report = {
  reportTitle: 'Student Performance Report', reportType: 'students', generatedAt: '2026-10-02T10:00:00.000Z', timezone: 'UTC',
  formulaVersion: 'admin-analytics-v2.1', queryFingerprint: 'fixture-fingerprint', filters: { sources: ['coding'] }, warnings: [],
  formula: { weights: { coding: 0.35 }, minimumEvidence: { codingTerminalAttempts: 4 }, notes: { coding: 'Terminal submissions only.' } },
  includeSummary: true, includeCharts: true,
  summary: [{ label: 'Students in scope', value: 1, unit: 'students', evidence: {} }],
  columns: ['studentName', 'studentId', 'overallScore'].map((key) => ({ key, ...COLUMN_DEFINITIONS[key] })),
  rows: [{ studentName: 'Aman', studentId: 'S-1', overallScore: 81.25 }],
  charts: [{ title: 'Student ranking', status: 'ready', count: 1, summary: '[{"name":"Aman","value":81.25}]' }],
};

test('analytics export request validates format, report, columns, sort, and graph IDs', () => {
  const value = validateExportRequest({
    format: 'xlsx', reportType: 'students', columns: ['studentName', 'overallScore'],
    sort: { by: 'overallScore', direction: 'desc' }, includeCharts: true,
    graphIds: ['student-ranking'],
  });
  assert.equal(value.format, 'xlsx');
  assert.deepEqual(value.columns, ['studentName', 'overallScore']);
  assert.throws(() => validateExportRequest({ format: 'csv', columns: ['studentName'] }), /xlsx or pdf/);
  assert.throws(() => validateExportRequest({ format: 'pdf', columns: ['sourceCode'] }), /Unsupported analytics export column/);
  assert.throws(() => validateExportRequest({ format: 'pdf', columns: ['studentName'], graphIds: ['imaginary'] }), /Unknown export graph/);
});

test('every selectable export column has a renderer definition', () => {
  assert.deepEqual(EXPORT_COLUMNS.filter((column) => !COLUMN_DEFINITIONS[column]), []);
});

test('XLSX export contains methodology, summary, student, and chart sheets', async () => {
  const buffer = await renderAnalyticsXlsx(report);
  assert.ok(buffer.length > 1000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Methodology', 'Executive Summary', 'Students', 'Chart Summaries']);
  assert.equal(workbook.getWorksheet('Students').getCell('A2').value, 'Aman');
  assert.equal(workbook.getWorksheet('Students').getCell('C2').value, 81.25);
  assert.equal(workbook.getWorksheet('Methodology').getCell('B5').value, 'admin-analytics-v2.1');
});

test('PDF export is a real PDF containing paginated report content', async () => {
  const buffer = await renderAnalyticsPdf(report);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 1000);
  assert.match(buffer.toString('latin1'), /PeerPrep Admin Analytics/);
});
