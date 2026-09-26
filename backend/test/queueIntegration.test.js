import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';

// Explicit opt-in, never read backend/.env or production connection settings.
const testUrl = process.env.TEST_QUEUE_URL;
test('BullMQ deduplicates, retries and retains the application job identity', { skip: !testUrl, timeout: 20000 }, async () => {
  const parsed = new URL(testUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'TEST_QUEUE_URL must point at an isolated local Redis/Valkey');
  const suffix = randomUUID();
  process.env.QUEUE_VALKEY_URL = testUrl;
  process.env.LEGACY_QUEUE_URL = testUrl;
  process.env.BULLMQ_QUEUE_PREFIX = `peerprep:test:${suffix}`;
  process.env.EXECUTION_QUEUE_PREFIX = `peerprep:test-legacy:${suffix}`;
  process.env.SOCKET_REDIS_ENABLED = 'false';
  const { assessmentQueue, closeQueues, createQueueConnection, internalJobId, queuePrefix } = await import('../src/queues/queueManager.js');
  const { startQueueWorker, closeQueueWorkers } = await import('../src/queues/workerRuntime.js');
  const connection = createQueueConnection();
  await connection.connect();
  const inspection = new Queue('assessment', { connection, prefix: queuePrefix() });
  const externalId = `attempt:${suffix}:version:1:question:0`;
  const observed = [];
  let workerRun;
  let workerError;
  try {
    await Promise.all([
      assessmentQueue.add('test-grade', { answer: 'A' }, { jobId: externalId, attempts: 2, backoffMs: 20 }),
      assessmentQueue.add('test-grade', { answer: 'A' }, { jobId: externalId, attempts: 2, backoffMs: 20 }),
    ]);
    assert.equal(await inspection.getWaitingCount(), 1);
    workerRun = startQueueWorker({
      queueName: 'assessment', concurrency: 2,
      async processJob(job) {
        observed.push(job);
        if (observed.length === 1) throw new Error('Intentional transient test failure');
      },
    }).catch((error) => { workerError = error; });
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      if (workerError) throw workerError;
      const current = await inspection.getJob(internalJobId(externalId));
      if (current && await current.getState() === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const stored = await inspection.getJob(internalJobId(externalId));
    assert.equal(await stored.getState(), 'completed');
    assert.equal(observed.length, 2);
    assert.deepEqual(observed.map((job) => job.attemptsMade), [0, 1]);
    assert.equal(observed[1].id, externalId);
    assert.deepEqual(observed[1].data, { answer: 'A' });
    await assessmentQueue.add('test-grade', { answer: 'A' }, { jobId: externalId });
    assert.equal(await inspection.getWaitingCount(), 0);
    assert.equal(observed.length, 2);
  } finally {
    await closeQueueWorkers();
    await workerRun;
    await closeQueues();
    // Only the UUID namespace created by this test is removed.
    await inspection.obliterate({ force: true });
    await inspection.close();
    connection.disconnect();
  }
});
