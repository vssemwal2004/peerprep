// Downloads of the students that match the page filters, as CSV, Excel or PDF.
// Every file starts with what was selected (area, period, filters in plain
// words, student count) and then one row per student with the columns the
// admin ticked. Columns are read from the same per-student rows as the page.

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { HttpError } from '../../utils/errors.js';
import { PASS_PERCENT } from './assessmentFacts.js';
import { allowedModules } from './fields.js';
import { RATINGS } from './interviewFacts.js';
import { competitionRanks } from './ranking.js';

export const EXPORT_LIMITS = Object.freeze({ maxRows: 50000, maxPdfRows: 3000, maxPdfColumns: 12, maxColumns: 60, maxSummaryLines: 30 });

const STATUS_LABELS = {
  practice: { active: 'Practising', inactive: 'Stopped', never: 'Never practised' },
  learning: { active: 'Learning', inactive: 'Stopped', never: 'Never started' },
  quickprep: { finished: 'Finished a sheet', inProgress: 'In progress', none: 'Not started' },
  interview: { active: 'Interviewing', inactive: 'Stopped', never: 'Never interviewed' },
  assessment: { active: 'Taking tests', inactive: 'Stopped', never: 'Never took a test' },
};
const LANGUAGE_LABELS = {
  python: 'Python', javascript: 'JavaScript', java: 'Java', cpp: 'C++', c: 'C', typescript: 'TypeScript',
  csharp: 'C#', php: 'PHP', go: 'Go', rust: 'Rust', kotlin: 'Kotlin', ruby: 'Ruby', swift: 'Swift', r: 'R', sql: 'SQL',
};
const list = (values) => (values || []).filter(Boolean).join(', ');

// `group` matches the page sections; `module` gates licensing; `kind` drives formatting.
export const EXPORT_COLUMNS = [
  { key: 'position', label: '#', group: 'Student details', module: 'student', kind: 'number', width: 6, get: (row, context) => context.positions.get(row) },
  { key: 'name', label: 'Student name', group: 'Student details', module: 'student', width: 24, get: (row) => row.name },
  { key: 'studentId', label: 'Student ID', group: 'Student details', module: 'student', width: 16, get: (row) => row.studentId },
  { key: 'email', label: 'Email', group: 'Student details', module: 'student', width: 28, get: (row) => row.email },
  { key: 'semester', label: 'Semester', group: 'Student details', module: 'student', kind: 'number', width: 9, get: (row) => row.student.semester },
  { key: 'course', label: 'Course', group: 'Student details', module: 'student', width: 14, get: (row) => row.student.course },
  { key: 'branch', label: 'Branch', group: 'Student details', module: 'student', width: 18, get: (row) => row.student.branch },
  { key: 'college', label: 'College / University', group: 'Student details', module: 'student', width: 22, get: (row) => row.student.college },
  { key: 'group', label: 'Group / Section', group: 'Student details', module: 'student', width: 12, get: (row) => row.student.group },
  { key: 'coordinators', label: 'Coordinators', group: 'Student details', module: 'student', width: 18, get: (row) => list(row.student.coordinators) },
  { key: 'lists', label: 'Uploaded lists', group: 'Student details', module: 'student', width: 22, get: (row) => list(row.student.batchNames) },
  { key: 'account', label: 'Account', group: 'Student details', module: 'student', width: 10, get: (row) => (row.student.status === 'inactive' ? 'Disabled' : 'Active') },
  { key: 'overallPrepScore', label: 'Prep Score (overall)', group: 'Student details', module: 'student', kind: 'decimal', width: 11, get: (row) => row.scores?.total ?? 0 },
  { key: 'learningPrepScore', label: 'Prep Learning score', group: 'Prep Learning', module: 'learning', kind: 'decimal', width: 11, get: (row) => row.scores?.features.learning?.score ?? null },
  { key: 'interviewPrepScore', label: 'Prep Interview score', group: 'Prep Interview', module: 'interview', kind: 'decimal', width: 11, get: (row) => row.scores?.features.interview?.score ?? null },
  { key: 'assessmentPrepScore', label: 'Prep Assessment score', group: 'Prep Assessment', module: 'assessment', kind: 'decimal', width: 11, get: (row) => row.scores?.features.assessment?.score ?? null },

  { key: 'prepScore', label: 'Prep Score', group: 'Prep Coding', module: 'coding', kind: 'decimal', width: 11, get: (row) => row.coding.prepScore },
  { key: 'solvedTotal', label: 'Problems solved', group: 'Prep Coding', module: 'coding', kind: 'number', width: 10, get: (row) => row.coding.solved.total },
  { key: 'solvedEasy', label: 'Easy solved', group: 'Prep Coding', module: 'coding', kind: 'number', width: 9, get: (row) => row.coding.solved.Easy },
  { key: 'solvedMedium', label: 'Medium solved', group: 'Prep Coding', module: 'coding', kind: 'number', width: 9, get: (row) => row.coding.solved.Medium },
  { key: 'solvedHard', label: 'Hard solved', group: 'Prep Coding', module: 'coding', kind: 'number', width: 9, get: (row) => row.coding.solved.Hard },
  { key: 'accuracy', label: 'Accuracy %', group: 'Prep Coding', module: 'coding', kind: 'percent', width: 10, get: (row) => (row.coding.submissions ? row.coding.accuracy : null) },
  { key: 'submissions', label: 'Code submissions', group: 'Prep Coding', module: 'coding', kind: 'number', width: 11, get: (row) => row.coding.submissions },
  { key: 'attempted', label: 'Problems attempted', group: 'Prep Coding', module: 'coding', kind: 'number', width: 11, get: (row) => row.coding.attempted },
  { key: 'activeDays', label: 'Days practised', group: 'Prep Coding', module: 'coding', kind: 'number', width: 10, get: (row) => row.coding.activeDays },
  { key: 'daysSincePractice', label: 'Days since last practice', group: 'Prep Coding', module: 'coding', kind: 'number', width: 12, get: (row) => row.coding.daysSinceActive },
  { key: 'practiceStatus', label: 'Practice status', group: 'Prep Coding', module: 'coding', width: 14, get: (row) => STATUS_LABELS.practice[row.coding.practiceStatus] },
  { key: 'languages', label: 'Languages used', group: 'Prep Coding', module: 'coding', width: 18, get: (row) => list(row.coding.languages.map((language) => LANGUAGE_LABELS[language] || language)) },
  { key: 'topicsSolved', label: 'Topics solved', group: 'Prep Coding', module: 'coding', width: 30, get: (row) => list(row.coding.solvedTopics) },

  { key: 'sheetsStarted', label: 'Sheets started', group: 'Prep Coding', module: 'coding', kind: 'number', width: 9, get: (row) => row.quickprep?.started ?? null },
  { key: 'sheetsFinished', label: 'Sheets finished', group: 'Prep Coding', module: 'coding', kind: 'number', width: 9, get: (row) => row.quickprep?.finished ?? null },
  { key: 'sheetQuestionsSolved', label: 'Sheet questions solved', group: 'Prep Coding', module: 'coding', kind: 'number', width: 11, get: (row) => row.quickprep?.solved ?? null },
  { key: 'sheetProgress', label: 'Sheet progress %', group: 'Prep Coding', module: 'coding', kind: 'percent', width: 10, get: (row) => (row.quickprep?.started ? row.quickprep.progress : null) },
  { key: 'quickPrepStatus', label: 'Quick Prep status', group: 'Prep Coding', module: 'coding', width: 15, get: (row) => STATUS_LABELS.quickprep[row.quickprep?.status] },

  { key: 'learningProgress', label: 'Course completed %', group: 'Prep Learning', module: 'learning', kind: 'percent', width: 11, get: (row) => row.learning?.progress ?? null },
  { key: 'topicsCompleted', label: 'Topics completed', group: 'Prep Learning', module: 'learning', kind: 'number', width: 10, get: (row) => row.learning?.completedTopics ?? null },
  { key: 'topicsAvailable', label: 'Topics available', group: 'Prep Learning', module: 'learning', kind: 'number', width: 10, get: (row) => row.learning?.availableTopics ?? null },
  { key: 'videoMinutes', label: 'Video minutes', group: 'Prep Learning', module: 'learning', kind: 'number', width: 9, get: (row) => row.learning?.videoMinutes ?? null },
  { key: 'learningStatus', label: 'Learning status', group: 'Prep Learning', module: 'learning', width: 13, get: (row) => STATUS_LABELS.learning[row.learning?.status] },
  { key: 'daysSinceLesson', label: 'Days since last lesson', group: 'Prep Learning', module: 'learning', kind: 'number', width: 11, get: (row) => row.learning?.daysSinceActive ?? null },
  { key: 'subjectsStudied', label: 'Subjects studied', group: 'Prep Learning', module: 'learning', width: 26, get: (row) => list(row.learning?.subjects) },
  { key: 'subjectsFinished', label: 'Subjects finished', group: 'Prep Learning', module: 'learning', width: 26, get: (row) => list(row.learning?.subjectsFinished) },

  { key: 'interviewsDone', label: 'Interviews done', group: 'Prep Interview', module: 'interview', kind: 'number', width: 10, get: (row) => row.interview?.done ?? null },
  { key: 'mockDone', label: 'Mock interviews', group: 'Prep Interview', module: 'interview', kind: 'number', width: 10, get: (row) => row.interview?.mockDone ?? null },
  { key: 'mockScore', label: 'Mock score %', group: 'Prep Interview', module: 'interview', kind: 'percent', width: 10, get: (row) => (row.interview?.mockDone ? row.interview.mockScore : null) },
  { key: 'bestMockScore', label: 'Best mock score %', group: 'Prep Interview', module: 'interview', kind: 'percent', width: 10, get: (row) => (row.interview?.mockDone ? row.interview.bestMockScore : null) },
  ...RATINGS.map(({ key, label }) => ({ key: `rating_${key}`, label: `${label} (1-5)`, group: 'Prep Interview', module: 'interview', kind: 'decimal', width: 11, get: (row) => row.interview?.ratings[key] || null })),
  { key: 'interviewsGiven', label: 'Taken as interviewer', group: 'Prep Interview', module: 'interview', kind: 'number', width: 11, get: (row) => row.interview?.given ?? null },
  { key: 'aiInterviews', label: 'AI interviews completed', group: 'Prep Interview', module: 'interview', kind: 'number', width: 11, get: (row) => row.interview?.aiCompleted ?? null },
  { key: 'interviewStatus', label: 'Interview status', group: 'Prep Interview', module: 'interview', width: 14, get: (row) => STATUS_LABELS.interview[row.interview?.status] },
  { key: 'daysSinceInterview', label: 'Days since last interview', group: 'Prep Interview', module: 'interview', kind: 'number', width: 12, get: (row) => row.interview?.daysSinceActive ?? null },

  { key: 'testsTaken', label: 'Tests taken', group: 'Prep Assessment', module: 'assessment', kind: 'number', width: 9, get: (row) => row.assessment?.taken ?? null },
  { key: 'testsPassed', label: `Tests passed (${PASS_PERCENT}%+)`, group: 'Prep Assessment', module: 'assessment', kind: 'number', width: 10, get: (row) => row.assessment?.passed ?? null },
  { key: 'testsMissed', label: 'Tests missed', group: 'Prep Assessment', module: 'assessment', kind: 'number', width: 9, get: (row) => row.assessment?.missed ?? null },
  { key: 'testScore', label: 'Test score % (average)', group: 'Prep Assessment', module: 'assessment', kind: 'percent', width: 11, get: (row) => (row.assessment?.taken ? row.assessment.averageScore : null) },
  { key: 'bestTestScore', label: 'Best test score %', group: 'Prep Assessment', module: 'assessment', kind: 'percent', width: 10, get: (row) => (row.assessment?.taken ? row.assessment.bestScore : null) },
  { key: 'lastTestScore', label: 'Latest test score %', group: 'Prep Assessment', module: 'assessment', kind: 'percent', width: 10, get: (row) => (row.assessment?.taken ? row.assessment.lastScore : null) },
  { key: 'testPassRate', label: 'Pass rate %', group: 'Prep Assessment', module: 'assessment', kind: 'percent', width: 9, get: (row) => (row.assessment?.taken ? row.assessment.passRate : null) },
  { key: 'testStatus', label: 'Test status', group: 'Prep Assessment', module: 'assessment', width: 14, get: (row) => STATUS_LABELS.assessment[row.assessment?.status] },
  { key: 'daysSinceTest', label: 'Days since last test', group: 'Prep Assessment', module: 'assessment', kind: 'number', width: 11, get: (row) => row.assessment?.daysSinceActive ?? null },
];

const COLUMN_BY_KEY = new Map(EXPORT_COLUMNS.map((column) => [column.key, column]));

// Ticked when the download popup opens; the admin can add or remove any column.
export const DEFAULT_EXPORT_COLUMNS = Object.freeze({
  // Each default fits on a PDF page (EXPORT_LIMITS.maxPdfColumns).
  coding: ['position', 'name', 'studentId', 'semester', 'branch', 'sheetProgress', 'prepScore', 'solvedEasy', 'solvedMedium', 'solvedHard', 'accuracy', 'practiceStatus'],
  learning: ['position', 'name', 'studentId', 'semester', 'branch', 'learningPrepScore', 'learningProgress', 'topicsCompleted', 'topicsAvailable', 'videoMinutes', 'learningStatus', 'daysSinceLesson'],
  interview: ['position', 'name', 'studentId', 'semester', 'branch', 'interviewPrepScore', 'interviewsDone', 'mockDone', 'mockScore', 'bestMockScore', 'aiInterviews', 'interviewStatus'],
  assessment: ['position', 'name', 'studentId', 'semester', 'branch', 'assessmentPrepScore', 'testsTaken', 'testsPassed', 'testsMissed', 'testScore', 'bestTestScore', 'testStatus'],
  all: ['position', 'name', 'studentId', 'semester', 'branch', 'overallPrepScore', 'prepScore', 'sheetProgress', 'learningProgress', 'mockScore', 'testScore', 'practiceStatus'],
});

export function publicExportColumns(permissions) {
  const modules = new Set(allowedModules(permissions));
  return EXPORT_COLUMNS.filter((column) => modules.has(column.module)).map(({ get, ...column }) => column);
}

const AREA_LABELS = { all: 'All features', coding: 'Prep Coding', learning: 'Prep Learning', interview: 'Prep Interview', assessment: 'Prep Assessment' };
const PERIOD_LABELS = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '180d': 'Last 6 months', '365d': 'Last year', all: 'All time' };
const cleanText = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);

/** format, columns and the plain-language filter lines shown at the top of the file. */
export function validateExportOptions(body = {}, permissions, area) {
  const format = ['csv', 'xlsx', 'pdf'].includes(body.format) ? body.format : null;
  if (!format) throw new HttpError(400, 'Choose PDF, Excel or CSV.');
  const modules = new Set(allowedModules(permissions));
  const requested = Array.isArray(body.columns) && body.columns.length ? body.columns : DEFAULT_EXPORT_COLUMNS[area] || DEFAULT_EXPORT_COLUMNS.coding;
  const columns = [...new Set(requested.map(String))].slice(0, EXPORT_LIMITS.maxColumns).map((key) => {
    const column = COLUMN_BY_KEY.get(key);
    if (!column) throw new HttpError(400, `Unknown column: ${key}`);
    if (!modules.has(column.module)) throw new HttpError(403, `${column.label} belongs to a module that is not enabled.`);
    return column;
  });
  if (!columns.length) throw new HttpError(400, 'Choose at least one column.');
  if (format === 'pdf' && columns.length > EXPORT_LIMITS.maxPdfColumns) {
    throw new HttpError(400, `A PDF page fits up to ${EXPORT_LIMITS.maxPdfColumns} columns. Untick some columns or download Excel.`);
  }
  const summary = (Array.isArray(body.summary) ? body.summary : []).map((line) => cleanText(line)).filter(Boolean).slice(0, EXPORT_LIMITS.maxSummaryLines);
  return { format, columns, summary };
}

// ---------------------------------------------------------------- report model

/** The report every renderer draws: details block + table. */
export function buildReport({ rows, columns, summary, query, cohortSize, positionOf, generatedAt = new Date() }) {
  const positions = competitionRanks(rows, positionOf);
  const context = { positions };
  const limit = EXPORT_LIMITS.maxRows;
  const included = rows.slice(0, limit);
  const range = query.range;
  const period = range.preset === 'custom'
    ? `${range.from ? range.from.toISOString().slice(0, 10) : 'start'} to ${range.to ? range.to.toISOString().slice(0, 10) : 'today'}`
    : PERIOD_LABELS[range.preset] || range.preset;
  return {
    title: `Prep Analysis · ${AREA_LABELS[query.module] || query.module}`,
    generatedAt,
    details: [
      ['Area', AREA_LABELS[query.module] || query.module],
      ['Period', period],
      ['Students', `${rows.length.toLocaleString('en-IN')} of ${cohortSize.toLocaleString('en-IN')} match the filters`],
      ['Generated', generatedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
    ],
    filters: summary.length ? summary : ['No filters: every student is included'],
    truncated: rows.length > included.length,
    columns: columns.map(({ key, label, kind, width, group }) => ({ key, label, kind, width, group })),
    rows: included.map((row) => columns.map((column) => {
      const value = column.get(row, context);
      return value === undefined || value === '' ? null : value;
    })),
  };
}

// ---------------------------------------------------------------- CSV

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A leading = + - @ would run as a formula in spreadsheet apps.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function renderCsv(report) {
  const lines = [
    [report.title],
    ...report.details,
    ...report.filters.map((line, index) => [index === 0 ? 'Filters' : '', line]),
    ...(report.truncated ? [['Note', `Only the first ${EXPORT_LIMITS.maxRows.toLocaleString('en-IN')} students are included`]] : []),
    [],
    report.columns.map((column) => column.label),
    ...report.rows,
  ];
  // The byte-order mark makes Excel read names in any script correctly.
  return Buffer.from(`﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

// ---------------------------------------------------------------- Excel

const INDIGO = 'FF4F46E5';
const SLATE = 'FF0F172A';
const MUTED = 'FF64748B';

export async function renderXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeerPrep Prep Analysis';
  workbook.created = report.generatedAt;
  const sheet = workbook.addWorksheet('Students', { properties: { defaultRowHeight: 18 } });
  const width = report.columns.length;
  sheet.columns = report.columns.map((column) => ({ key: column.key, width: Math.max(column.width || 12, Math.min(40, column.label.length + 2)) }));

  sheet.addRow([report.title]);
  sheet.mergeCells(1, 1, 1, Math.max(2, width));
  Object.assign(sheet.getCell(1, 1), { font: { bold: true, size: 15, color: { argb: SLATE } } });
  sheet.getRow(1).height = 24;
  for (const [label, value] of report.details) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: MUTED } };
    if (width > 2) sheet.mergeCells(row.number, 2, row.number, width);
  }
  report.filters.forEach((line, index) => {
    const row = sheet.addRow([index === 0 ? 'Filters' : '', line]);
    row.getCell(1).font = { bold: true, color: { argb: MUTED } };
    row.getCell(2).font = { color: { argb: INDIGO } };
    if (width > 2) sheet.mergeCells(row.number, 2, row.number, width);
  });
  if (report.truncated) sheet.addRow(['Note', `Only the first ${EXPORT_LIMITS.maxRows.toLocaleString('en-IN')} students are included`]);
  sheet.addRow([]);

  const header = sheet.addRow(report.columns.map((column) => column.label));
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  const firstDataRow = header.number + 1;
  report.rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    if (index % 2 === 1) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  report.columns.forEach((column, index) => {
    const format = column.kind === 'percent' ? '0.0"%"' : column.kind === 'decimal' ? '0.0' : column.kind === 'number' ? '0' : null;
    if (format) sheet.getColumn(index + 1).numFmt = format;
  });
  sheet.views = [{ state: 'frozen', ySplit: header.number, xSplit: Math.min(2, width) }];
  if (report.rows.length) sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: firstDataRow + report.rows.length - 1, column: width } };

  const about = workbook.addWorksheet('About the columns');
  about.columns = [{ header: 'Column', key: 'label', width: 28 }, { header: 'Part of', key: 'group', width: 22 }];
  about.getRow(1).font = { bold: true };
  report.columns.forEach((column) => about.addRow({ label: column.label, group: column.group }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- PDF

const pdfText = (value, kind) => {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'percent') return `${value}%`;
  if (kind === 'decimal' && typeof value === 'number') return value.toFixed(1);
  return String(value);
};

export function renderPdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true, info: { Title: report.title, Author: 'PeerPrep' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const left = 30;
  const usable = doc.page.width - 60;
  const bottom = doc.page.height - 40;

  // Details block
  doc.rect(0, 0, doc.page.width, 62).fill('#312e81');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text(report.title, left, 20);
  doc.font('Helvetica').fontSize(8.5).fillColor('#c7d2fe').text(report.details.map(([label, value]) => `${label}: ${value}`).join('   ·   '), left, 42, { width: usable });
  doc.y = 76;
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text('Filters applied', left, doc.y);
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
  for (const line of report.filters) doc.text(`•  ${line}`, left + 4, doc.y, { width: usable - 4 });
  if (report.truncated || report.rows.length > EXPORT_LIMITS.maxPdfRows) doc.fillColor('#b45309').text(`Only the first ${EXPORT_LIMITS.maxPdfRows.toLocaleString('en-IN')} students fit in a PDF; download Excel for everyone.`, left, doc.y + 2);
  doc.moveDown(0.8);

  // Table: widths follow each column's preferred width, scaled to the page.
  const totalWeight = report.columns.reduce((sum, column) => sum + (column.width || 12), 0);
  const widths = report.columns.map((column) => (usable * (column.width || 12)) / totalWeight);
  const fontSize = report.columns.length > 9 ? 7.2 : 8;
  const rowHeight = fontSize + 8;
  const drawHeader = () => {
    const headerHeight = rowHeight + 6;
    doc.rect(left, doc.y, usable, headerHeight).fill('#4f46e5');
    let x = left;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');
    report.columns.forEach((column, index) => {
      const numeric = ['number', 'decimal', 'percent'].includes(column.kind);
      doc.text(column.label, x + 4, y + 4, { width: widths[index] - 8, height: headerHeight - 4, ellipsis: true, align: numeric ? 'right' : 'left' });
      x += widths[index];
    });
    doc.y = y + headerHeight;
  };
  drawHeader();
  const rows = report.rows.slice(0, EXPORT_LIMITS.maxPdfRows);
  rows.forEach((values, rowIndex) => {
    if (doc.y + rowHeight > bottom) {
      doc.addPage();
      doc.y = 30;
      drawHeader();
    }
    const y = doc.y;
    if (rowIndex % 2 === 1) doc.rect(left, y, usable, rowHeight).fill('#f1f5f9');
    let x = left;
    doc.font('Helvetica').fontSize(fontSize).fillColor('#0f172a');
    values.forEach((value, index) => {
      const column = report.columns[index];
      const numeric = ['number', 'decimal', 'percent'].includes(column.kind);
      doc.text(pdfText(value, column.kind), x + 4, y + 4, { width: widths[index] - 8, height: rowHeight - 2, ellipsis: true, lineBreak: false, align: numeric ? 'right' : 'left' });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  });
  if (!rows.length) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('No students match these filters.', left, doc.y + 8);

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
      .text(`PeerPrep · ${report.title}`, left, doc.page.height - 24, { width: usable / 2, lineBreak: false })
      .text(`Page ${index + 1} of ${range.count}`, left + usable / 2, doc.page.height - 24, { width: usable / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

export const EXPORT_TYPES = Object.freeze({
  csv: { contentType: 'text/csv; charset=utf-8', extension: 'csv', render: async (report) => renderCsv(report) },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', render: renderXlsx },
  pdf: { contentType: 'application/pdf', extension: 'pdf', render: renderPdf },
});
