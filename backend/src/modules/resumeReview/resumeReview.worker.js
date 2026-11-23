import { extractResume } from '@veriworkly/ats-engine/node';
import { scoreExtractedResume } from './resumeReview.service.js';

process.once('disconnect', () => process.exit(0));
// Module loading belongs to reader startup. The parent starts the file deadline after readiness.
await Promise.all([import('pdf-parse'), import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs')]);
process.on('message', async ({ id, buffer, format, score }) => {
  try {
    const extracted = await extractResume(buffer, format);
    const result = score ? { report: scoreExtractedResume(extracted, buffer.length, score) } : extracted;
    process.send({ id, ok: true, ...result });
  } catch {
    process.send({ id, ok: false });
  }
});
process.send({ ready: true });
