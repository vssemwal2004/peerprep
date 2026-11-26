// Builds the ANVI JD Match PDF in the browser and saves it. react-pdf loads only on first use.
import { createElement } from 'react';
import { saveBlob } from '../../exportPdf';

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export async function downloadJdReport(match, { studentName = '' } = {}) {
  const [{ pdf }, { default: JdMatchReportPdf }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./JdMatchReportPdf'),
  ]);
  const blob = await pdf(createElement(JdMatchReportPdf, { match, studentName })).toBlob();
  const report = match.report || {};
  const date = new Date(report.checkedAt || match.createdAt || Date.now()).toISOString().slice(0, 10);
  const name = ['anvi-jd-match', slug(report.role), slug(report.company), date].filter(Boolean).join('-');
  saveBlob(blob, `${name}.pdf`);
}
