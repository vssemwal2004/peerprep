import '../setup.js';
import { connectDb } from '../utils/db.js';
import { startQueueWorker } from '../queues/workerRuntime.js';
import { QUEUE_NAMES } from '../queues/queueManager.js';
import { processAssessmentExecutionJob } from '../services/compilerExecutionWorkflowService.js';

const concurrency = Number(process.env.ASSESSMENT_WORKER_CONCURRENCY || 5);

await connectDb();

console.log(`[AssessmentWorker] Starting with concurrency=${concurrency}`);
await startQueueWorker({
  queueName: QUEUE_NAMES.assessment,
  concurrency,
  processJob: processAssessmentExecutionJob,
});
