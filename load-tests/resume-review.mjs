// From the repository root: node load-tests/resume-review.mjs 200
// Local production HTTP handlers with synthetic students and generated PDFs.
// Uses an ephemeral localhost mongod from the test suite's binary cache.
// Set MONGOMS_SYSTEM_BINARY if MongoDB is installed in a custom location.
// Set RESUME_SCAN_WORKERS to compare pool sizes on the deployment hardware.
// Example in PowerShell: $env:RESUME_SCAN_WORKERS='2'; node load-tests/resume-review.mjs 200
// Admission ends when POST returns. Completion includes queue time and client polling.
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { createResumeReviewRouter } from '../backend/src/modules/resumeReview/resumeReview.routes.js';
import { sharedExtractor, resumeScanConcurrency } from '../backend/src/modules/resumeReview/resumeReview.extractor.js';
import { resumeScanJobs } from '../backend/src/modules/resumeReview/resumeReview.jobs.js';
import { apiRequestTimeout } from '../backend/src/middleware/requestTimeout.js';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const PDFDocument = require('pdfkit');

const count = Number(process.argv[2] || 200);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw Error('Use a burst size from 1 to 1000.');
const font = await readFile(new URL('../frontend/src/student/anvi/report/pdf/fonts/Inter-Regular.ttf', import.meta.url));
const titles = ['Course Planner', 'Clinic Scheduler', 'Library Catalog', 'Invoice Tracker'];
const stacks = ['TypeScript and PostgreSQL', 'Python and Redis', 'Go and Docker', 'Java and SQL'];
const email = id => `student${id}@example.com`;
const jd = 'Software engineer with experience writing automated tests, REST APIs, TypeScript and PostgreSQL.';

async function resumePdf(id) {
  const doc = new PDFDocument({ size: 'A4', margin: 45, info: { Title: `Candidate ${id}` } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const ended = once(doc, 'end');
  doc.font(font).fontSize(17).text(`Candidate ${id}`);
  doc.fontSize(10).text(email(id)).text('Software engineer | Bengaluru, India').moveDown();
  doc.text('EDUCATION').text('Bachelor of Technology, Computer Science | Sample Institute, 2022 – 2026').moveDown();
  doc.text('EXPERIENCE').text('Software Engineering Intern | Example Engineering | May – July 2025');
  const stack = stacks[id % stacks.length];
  doc.text(`Built an API with ${stack} for ${23 + id} internal users to track releases across test and production environments.`);
  doc.text('Worked with support staff to document incidents, establish regression tests, and monitor service reliability.').moveDown();
  doc.text('PROJECTS').moveDown(0.25);
  for (let i = 0; i < 3; i++) {
    doc.fontSize(12).text(titles[(id + i) % titles.length]).fontSize(10);
    doc.text(`Implemented a searchable dashboard in ${stacks[(id + i) % stacks.length]} to group requests by institution and display progress to users.`);
    doc.text(`Measured end-to-end latency across ${41 + id + i} test runs before deploying the release and documented findings with the support team.`).moveDown();
  }
  doc.addPage().fontSize(12).text('TECHNICAL SKILLS').fontSize(10);
  doc.text(`Languages and tools: ${stack}, Git, Linux, SQL, REST APIs, CI/CD and unit testing.`).moveDown();
  doc.text('ACTIVITIES AND ACHIEVEMENTS').moveDown(0.25);
  doc.text(`Mentored a team of ${3 + id % 11} students building a scheduling application. Reviewed pull requests and designed tests for accessibility and error handling.`);
  doc.text('Presented the project at a campus engineering showcase and published examples for students starting the following semester.');
  doc.end();
  await ended;
  return Buffer.concat(chunks);
}

const pdfs = [];
console.error(`Preparing ${count + 2} distinct two-page PDFs. Generation runs outside the timed benchmark.`);
for (let id = 0; id < count + 2; id++) pdfs.push(await resumePdf(id));
process.env.PEERPREP_TENANT_SECRET_KEY = randomBytes(32).toString('base64');
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60_000 } });
await mongoose.connect(mongo.getUri('resume_benchmark'));
const app = express();
app.use(apiRequestTimeout);
app.use((req, _res, next) => {
  req.user = { _id: req.get('x-fixture-student'), universityId: '00000000000000000000beef' };
  next();
});
app.use('/api/resume/review', createResumeReviewRouter());
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message, code: err.code || err.details?.code }));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/resume/review/ats`;
const round = value => Math.round(value);
const percentile = (values, p) => values.length ? round(values.toSorted((a,b) => a-b)[Math.ceil(p*values.length)-1]) : null;

async function scan(id) {
  const start = performance.now();
  const submittedAt = Date.now();
  let acceptedAt;
  const headers = { 'x-fixture-student': (id + 1).toString(16).padStart(24, '0'), Prefer: 'respond-async' };
  const signal = AbortSignal.timeout(180_000);
  try {
    const form = new FormData();
    form.set('file', new Blob([pdfs[id]], { type: 'application/pdf' }), 'resume.pdf');
    if (id % 2) form.set('jobDescription', jd);
    let response = await fetch(base, { method: 'POST', headers, body: form, signal });
    let body = await response.json();
    if (!response.ok) throw Error(body.code || body.error || `HTTP ${response.status}`);
    acceptedAt = performance.now() - start;
    while (body.status === 'queued' || body.status === 'running') {
      await delay(Math.max(100, Math.min(body.retryAfterMs || 500, 3000)), undefined, { signal });
      response = await fetch(`${base}/jobs/${encodeURIComponent(body.jobId)}`, { headers, signal });
      body = await response.json();
      if (!response.ok) throw Error(body.code || body.error || `HTTP ${response.status}`);
    }
    if (body.status === 'failed') throw Error(body.error?.code || body.error?.message || String(body.error));
    if (body.report?.parsed?.email !== email(id) || body.report?.layout?.pageCount !== 2 ||
        !Number.isFinite(body.report?.readinessScore) || (id % 2 && !Number.isFinite(body.report?.job?.score))) {
      throw Error('Score, job match, page count or student identity failed validation');
    }
    return { acceptedAt, serverDoneMs: Date.parse(body.checkedAt) - submittedAt, duration: performance.now() - start };
  } catch (error) {
    return { acceptedAt, error: error.message, duration: performance.now() - start };
  }
}

function summary(rows, wallMs) {
  const completed = rows.filter(row => !row.error);
  const admission = rows.filter(row => row.acceptedAt != null).map(row => row.acceptedAt);
  const times = completed.map(row => row.duration);
  const serverTimes = completed.map(row => row.serverDoneMs).filter(Number.isFinite);
  const errors = {};
  for (const row of rows) if (row.error) errors[row.error] = (errors[row.error] || 0) + 1;
  return {
    submitted: rows.length, accepted: admission.length, completed: completed.length, errors, wallMs: round(wallMs),
    acceptedP50Ms: percentile(admission, 0.5), acceptedP95Ms: percentile(admission, 0.95),
    serverDoneP95Ms: percentile(serverTimes, 0.95),
    completeP50Ms: percentile(times, 0.5), completeP95Ms: percentile(times, 0.95),
    completedPerSecond: Number((completed.length / (wallMs / 1000)).toFixed(2)),
  };
}

try {
  console.error('Checking a cold scan, a new warm scan, and a repeat of the same PDF.');
  const cold = await scan(0);
  const warm = await scan(1);
  const repeat = await scan(1);
  console.error(`Submitting ${count} simultaneous scans.`);
  const start = performance.now();
  const results = await Promise.all(Array.from({ length: count }, (_, i) => scan(i + 2)));
  console.log(JSON.stringify({
    platform: process.platform, node: process.version, logicalCPUs: availableParallelism(), workers: resumeScanConcurrency(),
    pdfBytes: [Math.min(...pdfs.map(pdf => pdf.length)), Math.max(...pdfs.map(pdf => pdf.length))],
    coldMs: round(cold.duration), warmMs: round(warm.duration), samePdfMs: round(repeat.duration),
    coldError: cold.error, warmError: warm.error, samePdfError: repeat.error,
    burst: summary(results, performance.now() - start),
  }, null, 2));
  if (cold.error || warm.error || repeat.error || results.some(row => row.error)) process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  await resumeScanJobs().close();
  sharedExtractor().close();
  await mongoose.disconnect();
  await mongo.stop();
}
