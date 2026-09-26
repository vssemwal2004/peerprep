import { closeQueueWorkers } from '../queues/workerRuntime.js';
import { closeQueues } from '../queues/queueManager.js';
import { closeValkeyClient } from '../utils/valkey.js';
import { closeDb } from '../utils/db.js';

export function installWorkerShutdown() {
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 40000);
    try {
      await closeQueueWorkers();
      await closeQueues();
      await closeValkeyClient();
      await closeDb();
      clearTimeout(deadline);
      process.exit(0);
    } catch {
      clearTimeout(deadline);
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
