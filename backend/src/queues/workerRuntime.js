import {
  completeQueueJob,
  createWorkerClients,
  failQueueJob,
  fetchNextQueueJob,
  retryQueueJob,
  startDelayedJobPromoter,
  startStalledJobReaper,
  touchQueueJob,
} from './queueManager.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startQueueWorker({
  queueName,
  concurrency = 5,
  processJob,
}) {
  const workerConcurrency = Math.max(1, Number(concurrency || 1));
  const stopController = new AbortController();
  const { commandClient, blockingClients } = await createWorkerClients(queueName, workerConcurrency);

  void startDelayedJobPromoter(queueName, {
    intervalMs: Number(process.env.EXECUTION_PROMOTER_INTERVAL_MS || 1000),
    stopSignal: stopController.signal,
  });
  void startStalledJobReaper(queueName, {
    intervalMs: Number(process.env.EXECUTION_STALLED_REAPER_INTERVAL_MS || 15000),
    stalledAfterMs: Number(process.env.EXECUTION_JOB_STALLED_AFTER_MS || 120000),
    stopSignal: stopController.signal,
  });

  const runLoop = async (blockingClient) => {
    while (!stopController.signal.aborted) {
      try {
        const job = await fetchNextQueueJob(queueName, blockingClient, commandClient);
        if (!job) {
          await wait(250);
          continue;
        }

        const heartbeatMs = Math.max(1000, Number(process.env.EXECUTION_JOB_HEARTBEAT_MS || 10000));
        const heartbeat = setInterval(() => {
          void touchQueueJob(commandClient, job.id).catch((error) => {
            console.warn(`[Worker:${queueName}] Heartbeat failed for ${job.id}: ${error.message}`);
          });
        }, heartbeatMs);

        try {
          await processJob(job);
          clearInterval(heartbeat);
          await completeQueueJob(queueName, commandClient, job.id);
        } catch (error) {
          clearInterval(heartbeat);
          const nextAttemptNumber = job.attemptsMade + 1;
          if (nextAttemptNumber < job.maxAttempts) {
            await retryQueueJob(queueName, commandClient, job, error.message || 'Worker execution failed');
          } else {
            await failQueueJob(queueName, commandClient, job.id, {
              message: error.message || 'Worker execution failed',
            });
          }
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        console.error(`[Worker:${queueName}] Loop failure:`, error);
        await wait(1000);
      }
    }
  };

  await Promise.all(blockingClients.map((client) => runLoop(client)));
}
