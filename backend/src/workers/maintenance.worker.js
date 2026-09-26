import '../setup.js';
import { connectDb, closeDb } from '../utils/db.js';
import { closeValkeyClient } from '../utils/valkey.js';
import { startMailQueueWorker } from './mailQueue.worker.js';
import { startAssessmentEvaluationDispatcher } from '../services/assessmentEvaluationDispatchService.js';
import { closeQueueConnections } from '../queues/queueManager.js';
import { startAssessmentReportSummaryWorker } from '../services/assessmentReportSummaryService.js';
import { startWorkerEmitter, closeRealtime } from '../utils/realtime.js';

await connectDb();
startWorkerEmitter();
await Promise.all([
  import('../jobs/reminders.js'),
  import('../jobs/analytics.js'),
  import('../jobs/assessmentExpiry.js'),
]);
startMailQueueWorker();
const stopAssessmentDispatcher = startAssessmentEvaluationDispatcher();
const stopAssessmentReportSummaries = startAssessmentReportSummaryWorker();

console.log('[MaintenanceWorker] Scheduled jobs and mail queue worker started.');

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[MaintenanceWorker] ${signal} received. Shutting down.`);
  await stopAssessmentDispatcher();
  await stopAssessmentReportSummaries();
  await closeQueueConnections().catch(() => {});
  await closeRealtime().catch(() => {});
  await closeValkeyClient().catch(() => {});
  await closeDb().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
