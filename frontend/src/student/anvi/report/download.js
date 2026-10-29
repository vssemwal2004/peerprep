// "Download PDF": builds the branded A4 report with @react-pdf/renderer (loaded on click, so the report page
// does not carry it) and saves it under the report's file name. If anything fails, the caller falls back to
// the print layout (print.js / ReportPrint).

/** The lazily loaded PDF builder module ({ buildReportPdf(model) -> Blob }). */
export const loadReportPdf = () => import("./pdf/index.jsx");

/** Saves a Blob as a download. */
export function saveBlob(blob, fileName, { doc = typeof document === "undefined" ? null : document, url = typeof URL === "undefined" ? null : URL } = {}) {
  if (!doc || !url?.createObjectURL) throw new Error("Downloads are not available here.");
  const href = url.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => url.revokeObjectURL?.(href), 1500);
}

/**
 * Builds and saves the PDF. Resolves { ok: true } once saved, or { ok: false, error } when loading or
 * building failed (nothing is saved then).
 */
export async function downloadReportPdf({ model, fileName, load = loadReportPdf, save = saveBlob }) {
  try {
    const { buildReportPdf } = await load();
    const blob = await buildReportPdf(model);
    if (!blob || !blob.size) throw new Error("The generated PDF was empty.");
    save(blob, fileName);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
