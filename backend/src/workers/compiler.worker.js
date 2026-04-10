import '../setup.js';
import { connectDb } from '../utils/db.js';
import { startQueueWorker } from '../queues/workerRuntime.js';
import { QUEUE_NAMES } from '../queues/queueManager.js';
import { processCompilerExecutionJob } from '../services/compilerExecutionWorkflowService.js';

const concurrency = Number(process.env.COMPILER_WORKER_CONCURRENCY || 5);

await connectDb();

console.log(`[CompilerWorker] Starting with concurrency=${concurrency}`);
await Promise.all([
  startQueueWorker({
    queueName: QUEUE_NAMES.compiler,
    concurrency,
    processJob: processCompilerExecutionJob,
  }),
  startQueueWorker({
    queueName: QUEUE_NAMES.submission,
    concurrency,
    processJob: processCompilerExecutionJob,
  }),
]);
