import ExcelJS from 'exceljs';

const NAVY = 'FF0F172A';
const SKY = 'FF0284C7';
const PALE = 'FFE0F2FE';

function styleHeader(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SKY } };
    cell.alignment = { vertical: 'middle' };
  });
}

function stringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 32000);
  return String(value);
}

export async function renderAnalyticsXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PeerPrep Admin Analytics';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = workbook.created;
  workbook.properties.date1904 = false;

  const metadata = workbook.addWorksheet('Methodology', { views: [{ state: 'frozen', ySplit: 1 }] });
  metadata.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Value', key: 'value', width: 100 }];
  styleHeader(metadata.getRow(1));
  const metadataRows = [
    ['Report', report.reportTitle], ['Generated at', report.generatedAt], ['Timezone', report.timezone],
    ['Formula version', report.formulaVersion], ['Query fingerprint', report.queryFingerprint],
    ['Report type', report.reportType], ['Student rows', report.rows.length],
    ['Filters', report.filters], ['Warnings', report.warnings.join(' | ') || 'None'],
    ['Formula weights', report.formula.weights], ['Minimum evidence', report.formula.minimumEvidence],
    ['Methodology notes', report.formula.notes],
  ];
  metadataRows.forEach(([field, value]) => metadata.addRow({ field, value: stringify(value) }));
  metadata.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  metadata.autoFilter = 'A1:B1';

  if (report.includeSummary) {
    const summary = workbook.addWorksheet('Executive Summary');
    summary.columns = [{ header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 18 }, { header: 'Unit', key: 'unit', width: 14 }, { header: 'Evidence', key: 'evidence', width: 60 }];
    styleHeader(summary.getRow(1));
    report.summary.forEach((item) => summary.addRow({ metric: item.label, value: item.value, unit: item.unit || '', evidence: stringify(item.evidence) }));
    summary.getColumn(2).numFmt = '0.00';
  }

  const students = workbook.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  students.columns = report.columns.map((column) => ({ header: column.label, key: column.key, width: column.width || 18 }));
  styleHeader(students.getRow(1));
  report.rows.forEach((row) => students.addRow(Object.fromEntries(report.columns.map((column) => [column.key, row[column.key] ?? '']))));
  students.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, report.rows.length + 1), column: report.columns.length } };
  students.eachRow((row, index) => {
    if (index > 1 && index % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });

  if (report.includeCharts && report.charts.length) {
    const charts = workbook.addWorksheet('Chart Summaries');
    charts.columns = [{ header: 'Chart', key: 'title', width: 34 }, { header: 'Status', key: 'status', width: 12 }, { header: 'Evidence rows', key: 'count', width: 15 }, { header: 'Text summary', key: 'summary', width: 100 }];
    styleHeader(charts.getRow(1));
    report.charts.forEach((chart) => charts.addRow({ title: chart.title, status: chart.status, count: chart.count, summary: chart.summary }));
    charts.getColumn('summary').alignment = { wrapText: true, vertical: 'top' };
  }

  metadata.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  metadata.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  metadata.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  metadata.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
