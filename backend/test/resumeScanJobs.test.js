import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';
import express from 'express';
import { once } from 'node:events';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createResumeScanJobs } from '../src/modules/resumeReview/resumeReview.jobs.js';
import { createResumeReviewRouter } from '../src/modules/resumeReview/resumeReview.routes.js';
import { runForTenant } from '../src/platform/tenantContext.js';
import { HttpError } from '../src/utils/errors.js';

let mongo, client, collection;
const previousKey = process.env.PEERPREP_TENANT_SECRET_KEY;
before(async () => {
  process.env.PEERPREP_TENANT_SECRET_KEY = randomBytes(32).toString('base64');
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60_000 } });
  client = new MongoClient(mongo.getUri());
  await client.connect();
  collection = client.db('resume-test').collection('jobs');
});
after(async () => {
  await client?.close();
  await mongo?.stop();
  if (previousKey === undefined) delete process.env.PEERPREP_TENANT_SECRET_KEY;
  else process.env.PEERPREP_TENANT_SECRET_KEY = previousKey;
});

async function until(fn) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await delay(15);
  }
  throw new Error('Timed out waiting for job state');
}

test('concurrent API instances share one scan, restrict status to its student and discard the PDF', async t => {
  let processed = 0;
  const resume = Buffer.from('%PDF-1.7 synthetic student.pdf');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const check = async bytes => {
    processed++;
    assert.deepEqual(bytes, resume);
    await gate;
    return { readinessScore: 87, text: 'an example report' };
  };
  const options = { getCollection: () => collection, concurrency: 2, check };
  const a = createResumeScanJobs(options), b = createResumeScanJobs(options);
  t.after(async () => { release(); await Promise.all([a.close(), b.close()]); });
  const [one, two] = await Promise.all([a.submit('alice', resume), b.submit('alice', resume)]);
  assert.equal(one.jobId, two.jobId);
  await until(() => processed > 0);
  assert.equal((await b.read('alice', one.jobId)).status, 'running');
  assert.equal(await b.read('bob', one.jobId), null);
  assert.equal(await b.read('alice', 'invalid-id'), null);
  const pending = await collection.findOne({ _id: one.jobId });
  assert.ok(pending.payload && !pending.payload.includes('synthetic'));
  release();
  const result = await until(async () => { const j = await b.read('alice', one.jobId); return j.status === 'done' && j; });
  assert.equal(result.report.readinessScore, 87);
  assert.equal((await a.submit('alice', resume)).checkedAt.getTime(), result.checkedAt.getTime());
  assert.equal(processed, 1);
  const completed = await collection.findOne({ _id: one.jobId });
  assert.equal(completed.payload, undefined);
  assert.ok(!completed.report.includes('example report'));
  assert.ok(completed.expiresAt instanceof Date);
  const different = await b.submit('alice', resume, 'different role');
  assert.notEqual(different.jobId, one.jobId);
  await until(async () => (await b.read('alice', different.jobId)).status === 'done');
});

test('the same student id in another university cannot poll a scan', async t => {
  const jobs = createResumeScanJobs({ concurrency: 1, check: async () => ({ readinessScore: 76 }) });
  t.after(() => jobs.close());
  const forSchool = (id, callback) => runForTenant({ universityId: id, connection: { db: client.db(id) } }, callback);
  const job = await forSchool('school_a', () => jobs.submit('student', Buffer.from('%PDF-1.7 tenant check')));
  assert.equal(await forSchool('school_b', () => jobs.read('student', job.jobId)), null);
  await until(() => forSchool('school_a', async () => (await jobs.read('student', job.jobId)).status === 'done'));
});

test('another process recovers a lost claim, retries a reader outage and can redo a failed scan', async t => {
  const bytes = Buffer.from('%PDF-1.7 retry fixture');
  let calls = 0;
  const jobs = createResumeScanJobs({ getCollection: () => collection, concurrency: 1, check: async () => {
    calls++;
    if (calls === 1) throw new HttpError(503, 'Reader unavailable', { code: 'RESUME_READER_UNAVAILABLE' });
    if (calls === 2) throw new HttpError(422, 'Unreadable PDF', { code: 'RESUME_PDF_UNREADABLE' });
    return { readinessScore: 75 };
  } });
  const writer = createResumeScanJobs({ getCollection: () => collection, concurrency: 0 });
  const { jobId } = await writer.submit('other-student', bytes);
  await writer.close();
  await collection.updateOne({ _id: jobId }, { $set: { status: 'running', claim: 'crashed', availableAt: new Date(0) } });
  t.after(() => jobs.close());
  await jobs.recover();
  const failed = await until(async () => { const j = await jobs.read('other-student', jobId); return j.status === 'failed' && j; });
  assert.equal(failed.error.code, 'RESUME_PDF_UNREADABLE');
  assert.equal(calls, 2);
  await jobs.submit('other-student', bytes);
  await until(async () => (await jobs.read('other-student', jobId)).status === 'done');
  assert.equal(calls, 3);
  await collection.updateOne({ _id: jobId }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await jobs.read('other-student', jobId), null);
  await assert.rejects(jobs.submit('other-student', Buffer.from('invalid')), { status: 400 });
});

test('legacy upload and async polling return the same report through the shared queue', async t => {
  let scans = 0;
  const jobs = createResumeScanJobs({ getCollection: () => collection, concurrency: 2, check: async () => {
    scans++;
    return { readinessScore: 82 };
  } });
  const app = express();
  app.use((req, res, next) => { req.user = { _id: 'riley' }; next(); });
  app.use(createResumeReviewRouter({ jobs }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await jobs.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/ats`;
  const submit = async headers => {
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.7 shared fixture']), 'resume.pdf');
    const response = await fetch(url, { method: 'POST', body: form, headers });
    return { status: response.status, body: await response.json() };
  };
  const [legacy, asyncJob] = await Promise.all([submit({}), submit({ Prefer: 'respond-async' })]);
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.report.readinessScore, 82);
  assert.ok([200, 202].includes(asyncJob.status));
  const poll = await fetch(`${url}/jobs/${asyncJob.body.jobId}`);
  assert.equal(poll.headers.get('cache-control'), 'private, no-store');
  const finished = await poll.json();
  assert.equal(finished.status, 'done');
  assert.deepEqual(finished.report, legacy.body.report);
  assert.equal(finished.checkedAt, legacy.body.checkedAt);
  assert.equal(scans, 1);
});

test('simultaneous uploads wait for bounded intake and continue after a rejected file', async t => {
  let active = 0, peak = 0;
  const jobs = { submit: async (_owner, bytes) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await delay(30);
      if (bytes[0] === 0) throw new HttpError(400, 'Invalid PDF');
      return { jobId: 'id', status: 'queued', retryAfterMs: 350 };
    } finally { active--; }
  } };
  const app = express();
  app.use((req, res, next) => { req.user = { _id: 'u' }; next(); });
  // Two of the 32 KiB files fit in this budget even though more sockets may connect.
  app.use(createResumeReviewRouter({ jobs, intakeConcurrency: 8, intakeBytes: 80_000 }));
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const statuses = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const body = new FormData();
    body.append('file', new Blob([Buffer.alloc(32_768, index)]), 'resume.pdf');
    const res = await fetch(`http://127.0.0.1:${server.address().port}/ats`, { method: 'POST', body, headers: { Prefer: 'respond-async' } });
    await res.json();
    return res.status;
  }));
  assert.equal(peak, 2);
  assert.equal(statuses[0], 400);
  assert.ok(statuses.slice(1).every(status => status === 202));
});
