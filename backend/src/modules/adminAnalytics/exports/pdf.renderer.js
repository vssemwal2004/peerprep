import PDFDocument from 'pdfkit';

function valueText(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function addPageNumber(doc) {
  const bottom = doc.page.height - 28;
  doc.fontSize(7).fillColor('#64748b').text(`PeerPrep Admin Analytics · ${new Date().toISOString().slice(0, 10)}`, 32, bottom, { align: 'left', width: doc.page.width - 64 });
}

function ensureSpace(doc, height) {
  if (doc.y + height <= doc.page.height - 45) return;
  addPageNumber(doc);
  doc.addPage();
}

export async function renderAnalyticsPdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, info: { Title: report.reportTitle, Author: 'PeerPrep Admin Analytics' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.rect(0, 0, doc.page.width, 86).fill('#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(report.reportTitle, 32, 25);
  doc.font('Helvetica').fontSize(8).fillColor('#bae6fd').text(`Generated ${report.generatedAt} · ${report.timezone} · ${report.formulaVersion}`, 32, 56);
  doc.y = 104;

  if (report.includeSummary) {
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Executive summary');
    doc.moveDown(0.5);
    const cardWidth = (doc.page.width - 64 - 12) / 3;
    report.summary.forEach((item, index) => {
      if (index > 0 && index % 3 === 0) doc.y += 54;
      const x = 32 + (index % 3) * (cardWidth + 6);
      const y = doc.y;
      doc.roundedRect(x, y, cardWidth, 48, 5).fillAndStroke('#f0f9ff', '#bae6fd');
      doc.fillColor('#475569').font('Helvetica').fontSize(7).text(item.label, x + 8, y + 8, { width: cardWidth - 16 });
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(15).text(`${valueText(item.value)}${item.unit === '%' ? '%' : ''}`, x + 8, y + 24, { width: cardWidth - 16 });
    });
    doc.y += 66;
  }

  ensureSpace(doc, 80);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Methodology and scope');
  doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
  doc.text(`Query: ${report.queryFingerprint} · ${report.rows.length} student rows · Report: ${report.reportType}`);
  doc.text(`Filters: ${JSON.stringify(report.filters).slice(0, 900)}`);
  doc.text(`Warnings: ${report.warnings.join(' | ') || 'None'}`);
  doc.text(`Weights: ${JSON.stringify(report.formula.weights)} · Minimum evidence: ${JSON.stringify(report.formula.minimumEvidence)}`);
  doc.moveDown(1);

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Student performance');
  doc.moveDown(0.4);
  const availableWidth = doc.page.width - 64;
  const cellWidth = availableWidth / report.columns.length;
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(32, y, availableWidth, 18).fill('#0284c7');
    report.columns.forEach((column, index) => doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6).text(column.label, 34 + index * cellWidth, y + 5, { width: cellWidth - 4, lineBreak: false, ellipsis: true }));
    doc.y = y + 20;
  };
  drawHeader();
  report.rows.forEach((row, rowIndex) => {
    if (doc.y + 16 > doc.page.height - 45) { addPageNumber(doc); doc.addPage(); drawHeader(); }
    const y = doc.y;
    if (rowIndex % 2 === 0) doc.rect(32, y - 1, availableWidth, 15).fill('#f8fafc');
    report.columns.forEach((column, index) => doc.fillColor('#334155').font('Helvetica').fontSize(5.7).text(valueText(row[column.key]), 34 + index * cellWidth, y + 3, { width: cellWidth - 4, lineBreak: false, ellipsis: true }));
    doc.y = y + 15;
  });

  if (report.includeCharts && report.charts.length) {
    addPageNumber(doc); doc.addPage();
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text('Selected chart summaries');
    doc.moveDown(0.7);
    report.charts.forEach((chart) => {
      ensureSpace(doc, 55);
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(10).text(chart.title);
      doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`${chart.status} · ${chart.count} evidence rows`);
      doc.fillColor('#334155').fontSize(7).text(chart.summary, { width: doc.page.width - 64 });
      doc.moveDown(0.7);
    });
  }
  addPageNumber(doc);
  doc.end();
  return completed;
}
