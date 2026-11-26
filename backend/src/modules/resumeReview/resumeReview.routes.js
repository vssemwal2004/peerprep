// /api/resume/review — the student's own resume check (mounted under /resume,
// which already requires a full student with the Prep Resume feature).
import { Router } from 'express';
import { setTimeout as delay } from 'node:timers/promises';
import multer from 'multer';
import { HttpError } from '../../utils/errors.js';
import { pendingResumeAction } from '../../middleware/pendingResumeAction.js';
import { resultsPollLimiter } from '../../middleware/rateLimiter.js';
import { createResumeScanJobs, resumeScanJobs } from './resumeReview.jobs.js';
import { MAX_JOB_CHARS, MAX_PDF_BYTES } from './resumeReview.service.js';
import { explainWithAnvi, rewriteBullet } from './resumeReview.advice.js';
import { createJdMatchRouter } from './jdMatch.routes.js';

// Multer buffers only this upload. The async queue encrypts pending inputs and drops them on completion.
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

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// Wait before Multer starts consuming a body. Bursts then apply socket backpressure
// instead of buffering a 3 MB PDF (and its encrypted copy) for every waiting student.
function createPdfIntake(capacity, byteBudget) {
  const waiting = new Set();
  let occupied = 0;
  let reserved = 0;
  function drain() {
    for (const entry of waiting) {
      if (occupied >= capacity || reserved + entry.bytes > byteBudget) break;
      waiting.delete(entry);
      occupied++;
      reserved += entry.bytes;
      entry.admit();
    }
  }
  return (req, res) => new Promise(resolve => {
    const declared = Number(req.headers['content-length']);
    const maxBody = MAX_PDF_BYTES + MAX_JOB_CHARS * 4 + 8192;
    const bytes = Math.min(byteBudget, maxBody, Number.isSafeInteger(declared) && declared > 0 ? declared : maxBody);
    function release() {
      occupied--;
      reserved -= bytes;
      drain();
    }
    const entry = {
      bytes,
      admit() {
        res.off('close', abandon);
        resolve(release);
      },
    };
    function abandon() {
      waiting.delete(entry);
      resolve(null);
      drain();
    }
    if (res.destroyed) return resolve(null);
    waiting.add(entry);
    res.once('close', abandon);
    drain();
  });
}

export function createResumeReviewRouter(deps = {}) {
  const router = Router();
  const explain = deps.explainReview || explainWithAnvi;
  const rewrite = deps.rewriteBullet || rewriteBullet;
  const customJobs = deps.jobs || (deps.checkResumePdf && createResumeScanJobs({ check: deps.checkResumePdf }));
  const jobs = () => customJobs || resumeScanJobs();
  const owner = req => String(req.user._id);
  const waitForIntake = createPdfIntake(deps.intakeConcurrency || 96, deps.intakeBytes || 48 * 1024 * 1024);
  const wantsJob = req => /(?:^|,)\s*respond-async\s*(?:,|$)/i.test(req.get('Prefer') || '');

  router.post('/ats',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      const scanOwner = owner(req);
      const release = await waitForIntake(req, res);
      if (!release) return;
      let job;
      try {
        await new Promise((resolve, reject) => {
          const abort = () => reject(new HttpError(400, 'The PDF upload was interrupted.'));
          if (req.aborted) return abort();
          req.once('aborted', abort);
          acceptPdf(req, res, error => {
            req.off('aborted', abort);
            if (error) reject(error);
            else resolve();
          });
        });
        if (res.destroyed) return;
        job = await jobs().submit(scanOwner, req.file?.buffer, req.body?.jobDescription || '');
      } finally {
        if (req.file) delete req.file.buffer;
        release();
      }
      if (res.destroyed) return;
      if (wantsJob(req)) {
        return res.status(job.status === 'done' ? 200 : 202).json(job);
      }
      // Older clients expect the finished report in the upload response. They share
      // the same durable scan, including when a browser disconnects and re-uploads.
      const deadline = Date.now() + 100_000;
      while (job && (job.status === 'queued' || job.status === 'running')) {
        if (res.destroyed) return;
        if (Date.now() >= deadline) throw new HttpError(503, 'Your scan is still queued. Retry to see its result.');
        await delay(job.retryAfterMs);
        if (res.destroyed) return;
        job = await jobs().read(scanOwner, job.jobId);
      }
      if (!job) throw new HttpError(404, 'This scan has expired. Start a fresh PDF check.');
      if (job.status === 'failed') throw new HttpError(job.error.status, job.error.message, { code: job.error.code });
      return res.json({ report: job.report, checkedAt: job.checkedAt });
    }));

  router.get('/ats/jobs/:id', resultsPollLimiter, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const job = await jobs().read(owner(req), req.params.id);
    if (!job) throw new HttpError(404, 'This scan has expired. Start a fresh PDF check.');
    res.json(job);
  }));

  router.post('/explain',
    pendingResumeAction(),
    asyncRoute(async (req, res) => {
      res.json({ explanation: await explain(req.body || {}) });
    }));

  router.post('/rewrite',
    pendingResumeAction(),
    asyncRoute(async (req, res) => res.json(await rewrite(req.body || {}))));

  // ANVI JD Match: opt-in per student, paid in Prep Coins (its own feature check comes first).
  router.use('/jd-match', createJdMatchRouter({ service: deps.jdMatch || null }));
  return router;
}

export default createResumeReviewRouter();
