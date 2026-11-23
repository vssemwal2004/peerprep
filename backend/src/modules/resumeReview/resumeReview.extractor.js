import { fork } from 'node:child_process';
import { availableParallelism, totalmem } from 'node:os';
import { HttpError } from '../../utils/errors.js';

const MIB = 1024 * 1024;
export const EXTRACT_TIMEOUT_MS = 35_000;
export const MAX_QUEUE = 256;

export function resumeScanConcurrency() {
  const cpu = availableParallelism();
  const memory = process.constrainedMemory?.() || totalmem();
  const memorySlots = Math.max(1, Math.floor((memory / MIB - 400) / 240));
  const override = Number(process.env.RESUME_SCAN_WORKERS);
  const requested = Number.isInteger(override) && override > 0 ? override : Math.min(4, Math.max(1, cpu - 1));
  return Math.min(requested, cpu, memorySlots, 8);
}

const readerError = (status, code, message) => new HttpError(status, message, { code });
const unavailable = () => readerError(503, 'RESUME_READER_UNAVAILABLE', 'The résumé reader could not start. Please try again.');
const readErrorDefault = () => readerError(422, 'RESUME_PDF_UNREADABLE', 'ANVI could not read the exported PDF.');

export function forkResumeWorker(entry) {
  return fork(entry, [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'advanced',
    // Do not pass the API's --watch, --inspect, --input-type or loader flags to a reader.
    execArgv: ['--max-old-space-size=256'],
  });
}

// Each process handles one PDF at a time; a damaged document cannot block the other readers.
export function createExtractor({
  concurrency = resumeScanConcurrency(), maxQueue = MAX_QUEUE, maxQueuedBytes = 64 * MIB,
  timeoutMs = EXTRACT_TIMEOUT_MS, startupTimeoutMs = 45_000, readError = readErrorDefault,
  spawn = () => forkResumeWorker(new URL('./resumeReview.worker.js', import.meta.url)),
} = {}) {
  const workers = new Set();
  const queue = [];
  let queuedBytes = 0;
  let nextId = 0;
  let closed = false;

  function discard(slot, error) {
    if (!workers.delete(slot)) return; // A late exit from a replaced child.
    clearTimeout(slot.timer);
    slot.job?.reject(error);
    slot.job = null;
    try { slot.child?.kill('SIGKILL'); } catch { /* already exited */ }
    if (queue.length && !closed) setImmediate(pump);
  }

  function send(slot) {
    const job = slot.job;
    if (!slot.ready || !job) return;
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => discard(slot, readerError(504, 'RESUME_READER_TIMEOUT',
      'Reading this document took too long. Try a simpler PDF layout or a shorter file.')), timeoutMs);
    try {
      slot.child.send({ id: job.id, buffer: job.buffer, format: job.format, score: job.score }, (error) => {
        if (error && slot.job === job) discard(slot, unavailable());
      });
      job.buffer = null;
    } catch { discard(slot, unavailable()); }
  }

  function start(slot) {
    try {
      const child = spawn();
      slot.child = child;
      child.on('error', () => discard(slot, unavailable()));
      const onExit = () => discard(slot, readerError(503, 'RESUME_READER_CRASHED', 'The résumé reader stopped. Please try the scan again.'));
      child.once('exit', onExit);
      child.once('disconnect', onExit);
      slot.timer = setTimeout(() => discard(slot, unavailable()), startupTimeoutMs);
      if (!slot.job) slot.timer.unref();
      child.on('message', (message) => {
        if (!workers.has(slot)) return;
        if (message?.ready && !slot.ready) {
          clearTimeout(slot.timer);
          slot.ready = true;
          if (slot.job) send(slot);
          else child.channel?.unref();
          return;
        }
        const job = slot.job;
        if (!job || !slot.ready || message?.id !== job.id) return;
        clearTimeout(slot.timer);
        slot.job = null;
        if (message.ok) job.resolve(job.score ? message.report : { text: message.text, layout: message.layout });
        else job.reject(readError(message));
        child.channel?.unref();
        pump();
      });
      child.unref?.();
      if (!slot.job) child.channel?.unref();
    } catch { discard(slot, unavailable()); }
  }

  function pump() {
    while (queue.length && !closed) {
      let slot = [...workers].find((worker) => !worker.job);
      if (!slot && workers.size >= concurrency) return;
      if (!slot) {
        slot = { child: null, ready: false, job: null, timer: null };
        workers.add(slot);
      }
      const job = queue.shift();
      queuedBytes -= job.buffer.length;
      slot.job = job;
      if (!slot.child) start(slot);
      else {
        slot.child.channel?.ref();
        slot.timer?.ref();
        send(slot);
      }
    }
  }

  function enqueue(buffer, format, score) {
    if (closed) return Promise.reject(unavailable());
    if (queue.length >= maxQueue || queuedBytes + buffer.length > maxQueuedBytes) {
      return Promise.reject(readerError(503, 'RESUME_READER_BUSY', 'The résumé readers are busy. Please try again shortly.'));
    }
    return new Promise((resolve, reject) => {
      queue.push({ id: ++nextId, buffer, format, score, resolve, reject });
      queuedBytes += buffer.length;
      pump();
    });
  }

  return {
    extractFile: (buffer, format) => enqueue(buffer, format),
    extractPdf: (buffer) => enqueue(buffer, 'pdf'),
    scanPdf: (buffer, options) => enqueue(buffer, 'pdf', options),
    get pending() { return queue.length + [...workers].filter((slot) => slot.job).length; },
    warm() {
      if (closed || workers.size) return;
      const slot = { child: null, ready: false, job: null, timer: null };
      workers.add(slot);
      start(slot);
    },
    close() {
      closed = true;
      const error = unavailable();
      for (const job of queue.splice(0)) job.reject(error);
      queuedBytes = 0;
      for (const slot of workers) discard(slot, error);
    },
  };
}

let shared;
export const sharedExtractor = () => (shared ||= createExtractor());
