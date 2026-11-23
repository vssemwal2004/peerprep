import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followResumeScan } from '../src/features/resume/review/atsJob.js';

const done = { status: 'done', report: { readinessScore: 90 }, checkedAt: '2026-11-23T00:00:00Z' };
const queued = { status: 'queued', jobId: 'scan1', retryAfterMs: 1200 };
const httpError = status => Object.assign(new Error('Request failed'), { response: { status } });

test('an accepted scan survives a temporary poll failure without a second upload', async () => {
  const stages = [], saved = [], delays = [];
  let posts = 0, polls = 0;
  const result = await followResumeScan({
    submit: async () => { posts++; return queued; },
    getStatus: async id => {
      assert.equal(id, 'scan1');
      if (++polls === 1) throw httpError(503);
      return polls === 2 ? { ...queued, status: 'running' } : done;
    },
    signal: new AbortController().signal, onStage: stage => stages.push(stage),
    remember: id => saved.push(id), wait: async delay => delays.push(delay),
  });
  assert.equal(result, done);
  assert.equal(posts, 1);
  assert.deepEqual(stages, ['queued', 'reconnect', 'read']);
  assert.deepEqual(saved, ['scan1', null]);
  assert.ok(delays[0] >= queued.retryAfterMs);
});

test('a page reload resumes the same job, and an expired job is submitted once again', async () => {
  let posts = 0;
  const options = {
    jobId: 'old', signal: new AbortController().signal, onStage() {}, remember() {}, wait: async () => {},
    submit: async () => { posts++; return queued; }, getStatus: async () => done,
  };
  assert.equal(await followResumeScan(options), done);
  assert.equal(posts, 0);
  assert.equal(await followResumeScan({ ...options, getStatus: async id => { if (id === 'old') throw httpError(404); return done; } }), done);
  assert.equal(posts, 1);
  await assert.rejects(followResumeScan({ ...options, getStatus: async () => { throw httpError(404); } }), error => error.response.status === 404);
  assert.equal(posts, 2);
});

test('terminal parser failures are retryable with a fresh job and unmount stops polling', async () => {
  const saved = [];
  const options = {
    jobId: 'scan1', signal: new AbortController().signal, onStage() {},
    remember: id => saved.push(id), getStatus: async () => ({ status: 'failed', error: { message: 'Unreadable PDF' } }),
  };
  await assert.rejects(followResumeScan(options), /Unreadable PDF/);
  assert.deepEqual(saved, [null]);
  const controller = new AbortController();
  let polls = 0;
  await assert.rejects(followResumeScan({
    ...options, jobId: null, signal: controller.signal, submit: async () => queued,
    onStage: () => controller.abort(), getStatus: async () => { polls++; return done; },
  }), { name: 'AbortError' });
  assert.equal(polls, 0);
  assert.equal(saved.at(-1), 'scan1', 'navigation retains the accepted job for the next visit');
});
