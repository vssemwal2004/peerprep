import { createElement } from 'react';
import { filenameForResume, normalizeClientResume } from './resumeUtils';

/**
 * The resume PDF exactly as downloaded: same template, same page breaks and
 * same line breaks as the measured preview (`measured` from ResumePreview's
 * onLayoutChange). Falls back to standard PDF fonts if an embedded font fails.
 */
export async function buildResumePdfBlob(resume, measured = null) {
  const [{ pdf }, { default: ResumePdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./ResumePdf'),
  ]);
  const documentResume = normalizeClientResume(resume);
  const layout = measured?.template === documentResume.template ? measured : null;
  const lineBreaks = layout?.getLineBreaks?.() || null;
  let blob;
  try {
    blob = await pdf(createElement(ResumePdfDocument, { resume: documentResume, pages: layout?.pages, lineBreaks })).toBlob();
  } catch (error) {
    console.error('Prep Resume PDF render failed; retrying with standard fonts', error);
    blob = await pdf(createElement(ResumePdfDocument, { resume: documentResume, safeFonts: true })).toBlob();
  }
  if (!blob?.size) throw new Error('The generated PDF was empty. Please try again.');
  return blob;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadResumePdf(resume, measured = null) {
  const blob = await buildResumePdfBlob(resume, measured);
  saveBlob(blob, filenameForResume(resume));
  return blob;
}
