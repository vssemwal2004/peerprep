import { QUEUE_NAMES } from '../queues/queueManager.js';
import { startQueueWorker } from '../queues/workerRuntime.js';
import {
  processAssessmentExecutionJob,
  processCompilerExecutionJob,
} from '../services/compilerExecutionWorkflowService.js';

let workersBooted = false;

export function startEmbeddedWorkers() {
  const enabled = String(process.env.START_EXECUTION_WORKERS || 'true').trim().toLowerCase() !== 'false';
  if (!enabled || workersBooted) {
    return;
  }

  workersBooted = true;

  const compilerConcurrency = Number(process.env.COMPILER_WORKER_CONCURRENCY || 5);
  const assessmentConcurrency = Number(process.env.ASSESSMENT_WORKER_CONCURRENCY || 5);

  console.log(`[EmbeddedWorkers] Starting compiler/submission workers with concurrency=${compilerConcurrency}`);
  console.log(`[EmbeddedWorkers] Starting assessment workers with concurrency=${assessmentConcurrency}`);

  void Promise.all([
    startQueueWorker({
      queueName: QUEUE_NAMES.compiler,
      concurrency: compilerConcurrency,
      processJob: processCompilerExecutionJob,
    }),
    startQueueWorker({
      queueName: QUEUE_NAMES.submission,
      concurrency: compilerConcurrency,
      processJob: processCompilerExecutionJob,
    }),
    startQueueWorker({
      queueName: QUEUE_NAMES.assessment,
      concurrency: assessmentConcurrency,
      processJob: processAssessmentExecutionJob,
    }),
  ]).catch((error) => {
    workersBooted = false;
    console.error('[EmbeddedWorkers] Failed to start execution workers:', error);
  });
}
