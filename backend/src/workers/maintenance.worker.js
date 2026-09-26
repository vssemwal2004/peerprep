import '../setup.js';
import { connectDb, closeDb } from '../utils/db.js';
import { closeValkeyClient } from '../utils/valkey.js';
import { startMailQueueWorker } from './mailQueue.worker.js';

await connectDb();
await Promise.all([
  import('../jobs/reminders.js'),
  import('../jobs/analytics.js'),
  import('../jobs/assessmentExpiry.js'),
]);
startMailQueueWorker();

console.log('[MaintenanceWorker] Scheduled jobs and mail queue worker started.');

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[MaintenanceWorker] ${signal} received. Shutting down.`);
  await closeValkeyClient().catch(() => {});
  await closeDb().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
