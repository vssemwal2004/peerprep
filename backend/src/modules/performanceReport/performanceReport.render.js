// Renders a performance report (performanceReport.model.buildPerformanceReport)
// as PDF (pdfkit, vector charts), Excel (exceljs, chart as PNG) or CSV.
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { renderBarChartPng } from './chartPng.js';
import { cellText, formatDateTime, percentText, reportFileName } from './performanceReport.model.js';

export const BAND_COLORS = ['#bae6fd', '#38bdf8', '#0284c7', '#075985'];
export const STATUS_COLORS = { completed: '#059669', ongoing: '#f59e0b', not_started: '#94a3b8' };

export const PERFORMANCE_FORMATS = Object.freeze({
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  csv: { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
});

const headerLines = (report) => [
  ['Report', `${report.kindLabel} performance report`],
  [report.kindLabel, report.title],
  ['University', report.university || '—'],
  [report.kind === 'quickprep' ? 'Window' : 'Date range', report.windowLabel || '—'],
  ...report.meta,
  ['Generated at', `${formatDateTime(report.generatedAt)} IST`],
];

const averageLines = (report) => [
  ['Average %', percentText(report.averages.average)],
  ['Highest %', percentText(report.averages.highest)],
  ['Lowest %', percentText(report.averages.lowest)],
  ['Median %', percentText(report.averages.median)],
];

/* ───────────────────────────── CSV ───────────────────────────── */

// Quotes every cell and defuses spreadsheet formulas in text (CSV injection).
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function renderPerformanceCsv(report) {
  const lines = [];
  const push = (...cells) => lines.push(cells.map(csvCell).join(','));
  headerLines(report).forEach(([label, value]) => push(label, value));
  lines.push('');
  push('Summary', 'Students', '% of total');
  report.tiles.forEach((tile) => push(tile.label, tile.value, tile.percent));
  lines.push('');
  push('Marks band', 'Students', `% of ${report.bandBase} banded`);
  report.bands.forEach((band) => push(band.label, band.count, band.percent));
  push('Note', report.bandNote);
  lines.push('');
  averageLines(report).forEach(([label, value]) => push(label, value));
  report.notes.forEach((note) => push('Note', note));
  lines.push('');
  push(...report.columns.map((column) => column.label));
  report.rows.forEach((row) => push(...report.columns.map((column) => cellText(row, column))));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

/* ───────────────────────────── Excel ───────────────────────────── */

const XL = { navy: 'FF0F172A', sky: 'FF0284C7', skyPale: 'FFF0F9FF', border: 'FFE2E8F0', slate: 'FF475569', white: 'FFFFFFFF' };
const thin = { style: 'thin', color: { argb: XL.border } };
const boxed = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: XL.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.sky } };
    cell.border = boxed;
    cell.alignment = { vertical: 'middle' };
  });
}

function addTable(sheet, startRow, headers, rows) {
  headers.forEach((header, index) => { sheet.getCell(startRow, index + 1).value = header; });
  styleHeaderRow(sheet.getRow(startRow));
  rows.forEach((values, rowIndex) => values.forEach((value, index) => {
    const cell = sheet.getCell(startRow + 1 + rowIndex, index + 1);
    cell.value = value;
    cell.border = boxed;
  }));
  return startRow + rows.length + 2;
}

export async function renderPerformanceXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeerPrep';
  workbook.title = `${report.title} performance report`;
  workbook.created = new Date(report.generatedAt);

  const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 26 }, { width: 16 }, { width: 18 }];
  summary.getCell('A1').value = `${report.kindLabel} performance report`;
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: XL.navy } };
  let row = 3;
  headerLines(report).slice(1).forEach(([label, value]) => {
    summary.getCell(row, 1).value = label;
    summary.getCell(row, 1).font = { bold: true, color: { argb: XL.slate } };
    summary.getCell(row, 2).value = value;
    row += 1;
  });
  row += 1;
  const tilesStart = row;
  row = addTable(summary, row, ['Status', 'Students', '% of total'], report.tiles.map((tile) => [tile.label, tile.value, tile.percent / 100]));
  for (let index = 1; index <= report.tiles.length; index += 1) summary.getCell(tilesStart + index, 3).numFmt = '0.0%';
  const bandsStart = row;
  row = addTable(summary, row, ['Marks band', 'Students', `% of ${report.bandBase} banded`], report.bands.map((band) => [band.label, band.count, band.percent / 100]));
  for (let index = 1; index <= report.bands.length; index += 1) summary.getCell(bandsStart + index, 3).numFmt = '0.0%';
  summary.getCell(row - 1, 1).value = report.bandNote;
  summary.getCell(row - 1, 1).font = { italic: true, size: 9, color: { argb: XL.slate } };
  row += 1;
  row = addTable(summary, row, ['Average', 'Value'], averageLines(report));
  report.notes.forEach((note) => {
    summary.getCell(row, 1).value = note;
    summary.getCell(row, 1).font = { italic: true, size: 9, color: { argb: XL.slate } };
    row += 1;
  });

  // exceljs cannot write native charts: the two charts are embedded as images.
  const bandsPng = renderBarChartPng({ title: 'Marks distribution', bars: report.bands.map((band, index) => ({ ...band, color: BAND_COLORS[index] })) });
  const statusPng = renderBarChartPng({ title: 'Status', bars: report.statusBars.map((tile) => ({ label: tile.label, count: tile.value, percent: tile.percent, color: STATUS_COLORS[tile.key] })) });
  summary.addImage(workbook.addImage({ buffer: bandsPng, extension: 'png' }), { tl: { col: 4, row: 1 }, ext: { width: 540, height: 255 } });
  summary.addImage(workbook.addImage({ buffer: statusPng, extension: 'png' }), { tl: { col: 4, row: 16 }, ext: { width: 540, height: 255 } });

  const students = workbook.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  students.columns = report.columns.map((column) => ({
    header: column.label, key: column.key,
    width: column.key === 'email' ? 32 : column.key === 'name' ? 26 : column.date ? 20 : Math.max(10, column.label.length + 4),
  }));
  styleHeaderRow(students.getRow(1));
  report.rows.forEach((source) => {
    students.addRow(Object.fromEntries(report.columns.map((column) => {
      const value = source[column.key];
      if (column.date) return [column.key, value ? formatDateTime(value) : ''];
      if (column.numeric) return [column.key, value === null || value === undefined ? null : Number(value)];
      return [column.key, value ?? ''];
    })));
  });
  const percentColumn = report.columns.findIndex((column) => column.key === 'percent');
  if (percentColumn >= 0) students.getColumn(percentColumn + 1).numFmt = '0.0';
  students.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: report.columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ───────────────────────────── PDF ───────────────────────────── */

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const MARGIN = 36;

// Standard PDF fonts only cover Latin-1 (WinAnsi); other characters are dropped.
const pdfText = (value) => String(value ?? '').replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '');

function fit(doc, value, width) {
  const text = pdfText(value);
  if (doc.widthOfString(text) <= width) return text;
  let end = text.length;
  while (end > 0 && doc.widthOfString(`${text.slice(0, end)}…`) > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

function drawBarChart(doc, { x, y, width, height, title, bars }) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, x, y, { lineBreak: false });
  const top = y + 34;
  const bottom = y + height - 22;
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  for (let line = 0; line <= 4; line += 1) {
    const lineY = bottom - ((bottom - top) * line) / 4;
    doc.moveTo(x, lineY).lineTo(x + width, lineY).lineWidth(line === 0 ? 0.8 : 0.4).strokeColor(line === 0 ? '#94a3b8' : LINE).stroke();
  }
  const slot = width / Math.max(1, bars.length);
  bars.forEach((bar, index) => {
    const barWidth = Math.min(46, slot * 0.56);
    const barX = x + slot * index + (slot - barWidth) / 2;
    const barHeight = ((bottom - top) * bar.count) / max;
    if (barHeight > 0) doc.rect(barX, bottom - barHeight, barWidth, barHeight).fill(bar.color);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(INK)
      .text(String(bar.count), x + slot * index, bottom - barHeight - 20, { width: slot, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      .text(`${Number(bar.percent).toFixed(1)}%`, x + slot * index, bottom - barHeight - 10, { width: slot, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
      .text(bar.label, x + slot * index, bottom + 6, { width: slot, align: 'center', lineBreak: false });
  });
}

function drawTableHeader(doc, columns, widths, y) {
  const width = widths.reduce((sum, value) => sum + value, 0);
  doc.rect(MARGIN, y, width, 18).fill('#0284c7');
  let x = MARGIN;
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
  columns.forEach((column, index) => {
    doc.text(fit(doc, column.label, widths[index] - 6), x + 3, y + 6, { lineBreak: false });
    x += widths[index];
  });
  return y + 18;
}

export async function renderPerformancePdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: MARGIN, bufferPages: true, info: { Title: pdfText(`${report.title} performance report`), Author: 'PeerPrep' } });
  const chunks = [];
  doc.on('data', (part) => chunks.push(part));
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const pageWidth = doc.page.width;
  const usable = pageWidth - MARGIN * 2;

  // Header
  doc.rect(0, 0, pageWidth, 78).fill('#0369a1');
  doc.font('Helvetica').fontSize(8.5).fillColor('#e0f2fe').text(`${report.kindLabel.toUpperCase()} PERFORMANCE REPORT`, MARGIN, 18, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#ffffff').text(fit(doc, report.title, usable), MARGIN, 31, { lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor('#e0f2fe')
    .text(fit(doc, [report.university, report.windowLabel].filter(Boolean).join('  ·  '), usable), MARGIN, 55, { lineBreak: false });
  let y = 92;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  const metaLine = [...report.meta.map(([label, value]) => `${label}: ${value}`), `Generated ${formatDateTime(report.generatedAt)} IST`].join('   ·   ');
  doc.text(pdfText(metaLine), MARGIN, y, { width: usable });
  y = doc.y + 10;

  // Summary tiles
  const gap = 8;
  const tileWidth = (usable - gap * 3) / 4;
  report.tiles.forEach((tile, index) => {
    const x = MARGIN + index * (tileWidth + gap);
    doc.roundedRect(x, y, tileWidth, 54, 6).fillAndStroke('#f8fafc', LINE);
    doc.rect(x, y + 8, 3, 38).fill(tile.key === 'total' ? '#0284c7' : STATUS_COLORS[tile.key]);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(tile.label, x + 12, y + 9, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(String(tile.value), x + 12, y + 22, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`${tile.percent.toFixed(1)}% of total`, x + 12, y + 42, { lineBreak: false });
  });
  y += 70;

  // Charts
  const chartWidth = (usable - 24) / 2;
  drawBarChart(doc, { x: MARGIN, y, width: chartWidth, height: 190, title: 'Marks distribution', bars: report.bands.map((band, index) => ({ ...band, color: BAND_COLORS[index] })) });
  drawBarChart(doc, { x: MARGIN + chartWidth + 24, y, width: chartWidth, height: 190, title: 'Status', bars: report.statusBars.map((tile) => ({ label: tile.label, count: tile.value, percent: tile.percent, color: STATUS_COLORS[tile.key] })) });
  y += 198;
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED).text(pdfText(report.bandNote), MARGIN, y, { width: usable });
  y = doc.y + 10;

  // Averages
  const averages = averageLines(report);
  const averageWidth = usable / averages.length;
  doc.roundedRect(MARGIN, y, usable, 36, 6).fillAndStroke('#f0f9ff', '#bae6fd');
  averages.forEach(([label, value], index) => {
    const x = MARGIN + index * averageWidth + 12;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, x, y + 7, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0369a1').text(value, x, y + 18, { lineBreak: false });
  });
  y += 46;
  report.notes.forEach((note) => {
    doc.font('Helvetica').fontSize(7.5).fillColor('#b45309').text(pdfText(note), MARGIN, y, { width: usable });
    y = doc.y + 3;
  });

  // Student table on landscape pages, header repeated on every page.
  doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
  const tableWidth = doc.page.width - MARGIN * 2;
  const columns = [{ key: '#', label: '#', weight: 0.45 }, ...report.columns];
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (tableWidth * column.weight) / totalWeight);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(`Students (${report.rows.length})`, MARGIN, MARGIN, { lineBreak: false });
  y = drawTableHeader(doc, columns, widths, MARGIN + 18);
  const rowHeight = 15;
  report.rows.forEach((row, rowIndex) => {
    if (y + rowHeight > doc.page.height - MARGIN - 14) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
      y = drawTableHeader(doc, columns, widths, MARGIN);
    }
    if (rowIndex % 2 === 1) doc.rect(MARGIN, y, tableWidth, rowHeight).fill('#f8fafc');
    let x = MARGIN;
    doc.font('Helvetica').fontSize(7).fillColor('#1e293b');
    columns.forEach((column, index) => {
      const value = column.key === '#' ? String(rowIndex + 1) : cellText(row, column);
      doc.text(fit(doc, value, widths[index] - 6), x + 3, y + 4.5, { lineBreak: false });
      x += widths[index];
    });
    doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + tableWidth, y + rowHeight).lineWidth(0.3).strokeColor(LINE).stroke();
    y += rowHeight;
  });
  if (!report.rows.length) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No students.', MARGIN, y + 8, { lineBreak: false });

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0; // the footer sits in the margin; this stops pdfkit adding a page for it
    const footerY = doc.page.height - MARGIN + 10;
    doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
      .text(fit(doc, `PeerPrep · ${report.title}`, 400), MARGIN, footerY, { lineBreak: false })
      .text(`Page ${index + 1} of ${range.count}`, doc.page.width - MARGIN - 80, footerY, { width: 80, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

/** { buffer, contentType, fileName } for one format ('pdf' | 'xlsx' | 'csv'). */
export async function renderPerformanceReport(report, format) {
  const spec = PERFORMANCE_FORMATS[format];
  if (!spec) throw Object.assign(new Error('format must be pdf, xlsx or csv.'), { status: 400 });
  const buffer = format === 'pdf' ? await renderPerformancePdf(report)
    : format === 'xlsx' ? await renderPerformanceXlsx(report)
      : renderPerformanceCsv(report);
  return { buffer, contentType: spec.contentType, fileName: reportFileName(report, spec.extension) };
}
