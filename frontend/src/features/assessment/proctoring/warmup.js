// Loads the AI models while the student is still on the checks/instructions screens, so the
// moment the test opens nothing heavy is left to do. With a worker the whole load is off the UI
// thread; otherwise the page-thread warm-up in modelLoader runs one model at a time when idle.
import { warmUpProctoringModels as warmUpOnPageThread } from './utils/modelLoader';
import {
  isInferenceWorkerSupported,
  releaseUnclaimedWorker,
  warmUpWorkerModel,
} from './worker/workerClient';

let started = false;

export function warmUpProctoringModels({ face = true, object = true } = {}) {
  if (started) return;
  started = true;
  if (isInferenceWorkerSupported()) {
    if (face) void warmUpWorkerModel('face');
    if (object) void warmUpWorkerModel('object');
    return;
  }
  warmUpOnPageThread({ face, object });
}

// Leaving the attempt page before the test starts: free the warmed worker and its models.
export function releaseWarmProctoringModels() {
  releaseUnclaimedWorker();
  started = false;
}
