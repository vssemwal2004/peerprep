import { Worker } from 'bullmq';
import { assertLegacyQueuesDrained, assertQueueServer, createQueueConnection, queuePrefix, DEFAULT_ATTEMPTS } from './queueManager.js';
import { positiveInteger, withDeadline } from '../utils/valkey.js';
import { startWorkerEmitter, closeRealtime } from '../utils/realtime.js';

const workers = new Set();

export function toApplicationJob(job) {
  return {
    id: job.data.externalId,
    name: job.name,
    data: job.data.payload,
    attemptsMade: job.attemptsMade,
    maxAttempts: positiveInteger(job.opts.attempts, DEFAULT_ATTEMPTS),
  };
}

export async function startQueueWorker({ queueName, concurrency = 5, processJob }) {
  await assertLegacyQueuesDrained();
  startWorkerEmitter();
  const connection = createQueueConnection({ worker: true });
  try {
    await withDeadline(connection.connect(), 2000, 'Worker connection');
    await assertQueueServer(connection);
  } catch (error) { connection.disconnect(); throw error; }
  const active = new Set();
  const worker = new Worker(queueName, (job) => {
    const processing = Promise.resolve().then(() => processJob(toApplicationJob(job)));
    active.add(processing);
    return processing.finally(() => active.delete(processing));
  }, {
    connection,
    prefix: queuePrefix(),
    concurrency: Math.min(100, positiveInteger(concurrency, 1)),
    lockDuration: positiveInteger(process.env.EXECUTION_JOB_LOCK_MS, 60000),
    maxStalledCount: 2,
    autorun: false,
  });
  const entry = { worker, connection, active };
  workers.add(entry);
  worker.on('error', (error) => {
    console.warn(`[Worker:${queueName}] Queue dependency error (${error.code || error.name}).`);
  });
  worker.on('failed', (job) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      console.error(`[Worker:${queueName}] Job ${job.data.externalId} exhausted retries; retained for review.`);
    }
  });
  try { await worker.run(); }
  finally { workers.delete(entry); connection.disconnect(); }
}

export async function closeQueueWorkers() {
  await Promise.all([...workers].map(async ({ worker, connection, active }) => {
    await withDeadline(worker.pause(true), 1000, 'Worker pause').catch(() => {});
    let force = false;
    try {
      await withDeadline(Promise.allSettled([...active]), positiveInteger(process.env.WORKER_DRAIN_TIMEOUT_MS, 30000), 'Worker drain');
    } catch { force = true; }
    try { await withDeadline(worker.close(force), 2000, 'Worker close'); }
    catch { /* Lock expiry recovers any work not acknowledged before exit. */ }
    finally { connection.disconnect(); }
  }));
  await closeRealtime();
}
