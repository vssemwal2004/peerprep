// /api/resume/review — the student's own resume check (mounted under /resume,
// which already requires a full student with the Prep Resume feature).
import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../../utils/errors.js';
import { MAX_JOB_CHARS, MAX_PDF_BYTES, checkResumePdf, explainReview } from './resumeReview.service.js';

// The exported PDF stays in memory and is never stored.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 1, fieldSize: MAX_JOB_CHARS * 4, parts: 3 } }).single('file');
const acceptPdf = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    return next(error.code === 'LIMIT_FILE_SIZE'
      ? new HttpError(413, 'The exported PDF is larger than 3 MB.', { code: 'RESUME_PDF_TOO_LARGE' })
      : new HttpError(400, 'Send one PDF in the "file" field and an optional "jobDescription".', { code: 'RESUME_REVIEW_INVALID' }));
  }
  return next(error);
});

/** Small per-student window limiter (per API instance). */
export function perStudentLimit({ max, windowMs, message, code }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.tenant?.universityId || req.user?.universityId || ''}:${req.user?._id}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(new HttpError(429, message, { code, retryAfterSeconds: retryAfter }));
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 20_000) for (const [k, list] of hits) if (!list.some((at) => now - at < windowMs)) hits.delete(k);
    return next();
  };
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function createResumeReviewRouter(deps = {}) {
  const router = Router();
  const check = deps.checkResumePdf || checkResumePdf;
  const explain = deps.explainReview || explainReview;

  router.post('/ats',
    perStudentLimit({ max: 30, windowMs: 60 * 60 * 1000, message: 'You have run many checks this hour. Please try again a little later.', code: 'RESUME_CHECK_LIMIT' }),
    acceptPdf,
    asyncRoute(async (req, res) => {
      const report = await check(req.file?.buffer, { jobDescription: req.body?.jobDescription || '' });
      res.json({ report, checkedAt: new Date().toISOString() });
    }));

  router.post('/explain',
    perStudentLimit({ max: 12, windowMs: 60 * 60 * 1000, message: 'ANVI has explained several checks this hour. Please try again a little later.', code: 'ANVI_EXPLAIN_LIMIT' }),
    asyncRoute(async (req, res) => {
      res.json({ explanation: await explain(req.body || {}) });
    }));

  return router;
}

export default createResumeReviewRouter();
