import { QUEUE_NAMES } from '../queues/queueManager.js';
import { startQueueWorker } from '../queues/workerRuntime.js';
import {
  processAssessmentExecutionJob,
  processCompilerExecutionJob,
} from '../services/compilerExecutionWorkflowService.js';

let workersBooted = false;

function readConcurrency(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  // Keep accidental configuration values from overwhelming a small VPS.
  // Larger installations should scale dedicated worker processes instead.
  return Math.min(10, Math.max(1, parsed));
}

export function startEmbeddedWorkers() {
  const enabled = String(process.env.START_EXECUTION_WORKERS || 'true').trim().toLowerCase() !== 'false';
  if (!enabled || workersBooted) {
    return;
  }

  workersBooted = true;

  const compilerConcurrency = readConcurrency('COMPILER_WORKER_CONCURRENCY', 2);
  const assessmentConcurrency = readConcurrency('ASSESSMENT_WORKER_CONCURRENCY', 2);

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
