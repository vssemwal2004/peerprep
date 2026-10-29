// The print fallback of "Download PDF": when the react-pdf report (pdf/) cannot be built, the browser's
// own print engine (Save as PDF) prints a print-only, always-light A4 layout (ReportPrint). The same
// layout is what Ctrl+P shows on the report page.

/** Prints the report; the document title becomes the suggested PDF file name until printing ends. */
export function printReport(fileName, { win = typeof window === "undefined" ? null : window } = {}) {
  if (!win?.print) return false;
  const doc = win.document;
  const previous = doc.title;
  if (fileName) doc.title = fileName;
  // Page numbers use @page margin boxes (Chromium 131+; ignored elsewhere). Added only while printing,
  // because older CSS parsers (jsdom among them) reject the nested at-rule and drop the whole sheet.
  let pages = null;
  try {
    pages = doc.createElement("style");
    pages.setAttribute("data-anvi-print-pages", "");
    pages.textContent = PAGE_NUMBER_CSS;
    doc.head.appendChild(pages);
  } catch {
    pages = null;
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    doc.title = previous;
    pages?.remove();
    win.removeEventListener("afterprint", restore);
  };
  win.addEventListener("afterprint", restore);
  try {
    win.print();
  } catch {
    restore();
    return false;
  }
  return true;
}

export const PAGE_NUMBER_CSS = '@media print { @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #64748b; } } }';

// Plain CSS so the PDF does not depend on the app theme: on screen the print root is hidden; in print
// everything else on the page is hidden. The <thead>/<tfoot> of .apr-frame repeat on every page
// (running header and footer); each block is its own row so pages break between blocks.
export const PRINT_CSS = `
.anvi-print-root { display: none; }
@media print {
  @page { size: A4; margin: 12mm 13mm 14mm; }
  html, body { background: #fff !important; color: #0f172a !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body > *:not(.anvi-print-root) { display: none !important; }
  .anvi-print-root { display: block !important; color: #0f172a; background: #fff; font: 10pt/1.45 Inter, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.anvi-print-root * { box-sizing: border-box; }
.apr-frame { width: 100%; border-collapse: collapse; }
.apr-frame > thead > tr > td, .apr-frame > tfoot > tr > td, .apr-frame > tbody > tr > td { padding: 0; vertical-align: top; }
.apr-run { display: flex; justify-content: space-between; gap: 12px; font-size: 8pt; color: #64748b; border-bottom: 0.6pt solid #e2e8f0; padding-bottom: 4pt; margin-bottom: 10pt; }
.apr-foot { border-bottom: 0; border-top: 0.6pt solid #e2e8f0; padding: 4pt 0 0; margin: 10pt 0 0; }
.apr-block { padding-bottom: 12pt; }
.apr-keep { break-inside: avoid; page-break-inside: avoid; }
.apr-break { break-before: page; page-break-before: always; }
.apr-eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #006e99; margin: 0; }
.apr-h1 { font-size: 18pt; font-weight: 700; margin: 3pt 0 1pt; letter-spacing: -.01em; }
.apr-h2 { font-size: 11.5pt; font-weight: 700; margin: 0 0 6pt; padding-bottom: 3pt; border-bottom: 1pt solid #d3ecf8; color: #0f172a; }
.apr-muted { color: #64748b; }
.apr-small { font-size: 8.5pt; }
.apr-cover { display: flex; justify-content: space-between; gap: 16pt; align-items: flex-start; }
.apr-score { text-align: right; min-width: 120pt; }
.apr-score-big { font-size: 26pt; font-weight: 700; line-height: 1; }
.apr-band { display: inline-block; margin-top: 4pt; padding: 1pt 7pt; border-radius: 9pt; font-size: 8pt; font-weight: 700; border: 0.6pt solid currentColor; }
.apr-meta, .apr-kpis { width: 100%; border-collapse: collapse; margin-top: 8pt; }
.apr-meta td, .apr-kpis td { border: 0.6pt solid #e2e8f0; padding: 4pt 6pt; vertical-align: top; width: 25%; }
.apr-label { display: block; font-size: 7pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
.apr-value { font-weight: 600; }
.apr-kpis .apr-value { font-size: 12pt; }
.apr-bars { width: 100%; border-collapse: collapse; }
.apr-bars td { padding: 2.5pt 0; vertical-align: middle; }
.apr-bar { height: 6pt; background: #f1f5f9; border-radius: 3pt; overflow: hidden; }
.apr-bar > span { display: block; height: 100%; border-radius: 3pt; background: #00a1db; }
.apr-cols { display: flex; gap: 14pt; }
.apr-cols > div { flex: 1; min-width: 0; }
.apr-list { margin: 0; padding-left: 13pt; }
.apr-list li { margin: 1.5pt 0; }
.apr-q { border: 0.6pt solid #e2e8f0; border-radius: 6pt; padding: 7pt 9pt; margin-bottom: 7pt; }
.apr-q-head { display: flex; justify-content: space-between; gap: 10pt; }
.apr-q-text { font-weight: 600; margin: 1pt 0 0; }
.apr-answer { white-space: pre-wrap; overflow-wrap: anywhere; margin: 1pt 0 0; }
.apr-chip { display: inline-block; margin: 0 3pt 3pt 0; padding: 0.5pt 5pt; border-radius: 4pt; font-size: 8pt; border: 0.6pt solid; }
.apr-matched { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
.apr-partial { color: #78350f; background: #fffbeb; border-color: #fde68a; }
.apr-missed { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }
.apr-flag { color: #92400e; background: #fffbeb; border-color: #fcd34d; font-weight: 600; }
.apr-feedback { background: #eaf6fc; border-radius: 4pt; padding: 4pt 6pt; margin-top: 4pt; }
.apr-sub { font-size: 7pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8; margin: 5pt 0 0; }
.apr-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.apr-table th, .apr-table td { border-bottom: 0.6pt solid #e2e8f0; padding: 2.5pt 4pt; text-align: left; vertical-align: top; }
.apr-table th { font-size: 7pt; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
.apr-table tr { break-inside: avoid; page-break-inside: avoid; }
.apr-alert { border-radius: 4pt; padding: 4pt 6pt; margin-bottom: 6pt; font-weight: 600; }
.apr-alert-rose { background: #fff1f2; color: #9f1239; }
.apr-alert-amber { background: #fffbeb; color: #92400e; }
.apr-disclaimer { font-size: 8pt; color: #64748b; border-top: 0.6pt solid #e2e8f0; padding-top: 5pt; }
`;

/** Band tones (reportModel BAND_TONES) as print colours. */
export const PRINT_TONES = Object.freeze({ positive: "#047857", brand: "#006e99", caution: "#b45309", critical: "#be123c", neutral: "#334155" });
