import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValkeyUrl, withDeadline } from '../src/utils/valkey.js';
import { internalJobId, hasLegacyJobs, supportsQueueServer } from '../src/queues/queueManager.js';
import { toApplicationJob } from '../src/queues/workerRuntime.js';
import { readinessFromDependencies } from '../src/services/dependencyHealthService.js';
import { ResilientRateLimitStore } from '../src/middleware/resilientRateLimitStore.js';

test('cache and queue endpoint overrides remain independent with legacy fallback', () => {
  const names = ['CACHE_VALKEY_URL', 'QUEUE_VALKEY_URL', 'VALKEY_URL', 'REDIS_URL'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    delete process.env.VALKEY_URL;
    process.env.CACHE_VALKEY_URL = 'redis://127.0.0.1:6381';
    process.env.QUEUE_VALKEY_URL = 'redis://127.0.0.1:6382';
    assert.equal(buildValkeyUrl(), 'redis://127.0.0.1:6381');
    assert.equal(buildValkeyUrl('queue'), 'redis://127.0.0.1:6382');
    delete process.env.QUEUE_VALKEY_URL;
    assert.equal(buildValkeyUrl('queue'), 'redis://127.0.0.1:6379');
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('dependency deadline rejects a stuck request without waiting indefinitely', async () => {
  const began = Date.now();
  await assert.rejects(withDeadline(new Promise(() => {}), 20, 'test'), { code: 'DEPENDENCY_TIMEOUT' });
  assert.ok(Date.now() - began < 1000);
  assert.equal(await withDeadline(Promise.resolve(7), 100), 7);
});

test('BullMQ ID encoding preserves deterministic external IDs without colon collisions', () => {
  assert.equal(internalJobId('attempt:1:question:2'), internalJobId('attempt:1:question:2'));
  assert.notEqual(internalJobId('attempt:1:question:2'), internalJobId('attempt-1-question-2'));
  assert.doesNotMatch(internalJobId('attempt:1:question:2'), /:/);
  const restored = toApplicationJob({ name: 'grade', data: { externalId: 'attempt:1:q:2', payload: { version: 4 } }, attemptsMade: 2, opts: { attempts: 3 } });
  assert.deepEqual(restored, { id: 'attempt:1:q:2', name: 'grade', data: { version: 4 }, attemptsMade: 2, maxAttempts: 3 });
});

test('legacy migration guard considers every live queue state', () => {
  assert.equal(hasLegacyJobs({ compiler: { waiting: 0, processing: 0, delayed: 0 } }), false);
  for (const key of ['waiting', 'processing', 'delayed']) {
    assert.equal(hasLegacyJobs({ assessment: { [key]: 1 } }), true);
  }
  assert.equal(supportsQueueServer('redis_version:3.0.504\r\n'), false);
  assert.equal(supportsQueueServer('redis_version:6.2.0\r\n'), true);
  assert.equal(supportsQueueServer('valkey_version:8.0.0\r\n'), true);
});

test('Mongo-ready API remains available in a bounded cache/queue outage, but drains stop readiness', () => {
  const deps = { mongo: true, cache: { ready: false }, queue: { ready: false }, realtime: { configured: true, ready: false } };
  const status = readinessFromDependencies(deps);
  assert.equal(status.ok, true);
  assert.equal(status.degraded, true);
  assert.equal(status.acceptingAnswers, true);
  assert.equal(readinessFromDependencies(deps, true).ok, false);
  assert.equal(readinessFromDependencies({ ...deps, mongo: false }).ok, false);
});

test('cache outage retains local rate limits and recovers without erasing shadow counts', async () => {
  let available = true;
  let sharedHits = 0;
  const store = new ResilientRateLimitStore('test:', { client: {
    async sendCommand(args) {
      if (!available) throw new Error('cache down');
      if (args[1].includes('local count')) return [++sharedHits, 1000];
      return 1;
    },
  } });
  store.init({ windowMs: 1000 });
  try {
    assert.equal((await store.increment('student')).totalHits, 1);
    available = false;
    assert.equal((await store.increment('student')).totalHits, 2);
    assert.equal((await store.increment('student')).totalHits, 3);
    await store.decrement('student');
    available = true;
    assert.equal((await store.increment('student')).totalHits, 3);
    await store.resetKey('student');
    available = false;
    assert.equal((await store.increment('student')).totalHits, 1);
  } finally { store.shutdown(); }
});
