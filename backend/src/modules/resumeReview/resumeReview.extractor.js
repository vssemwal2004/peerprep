// Reads a resume PDF the way an ATS does, in a forked child process.
//
// PDF extraction is CPU-bound and a hostile file can hold the thread for
// seconds, so it never runs in the API process: one long-lived child (the
// engine's own `node/child` entry) takes one job at a time from a short queue,
// and a job that runs past the timeout gets the child killed and replaced.
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { HttpError } from '../../utils/errors.js';

const require = createRequire(import.meta.url);
const CHILD_ENTRY = require.resolve('@veriworkly/ats-engine/node/child');

export const EXTRACT_TIMEOUT_MS = 20_000;
export const MAX_QUEUE = 24;

export function createExtractor({ timeoutMs = EXTRACT_TIMEOUT_MS, maxQueue = MAX_QUEUE, spawn = () => fork(CHILD_ENTRY, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json' }) } = {}) {
  let child = null;
  let nextId = 1;
  let running = null; // { id, resolve, reject, timer }
  const queue = [];

  const stopChild = () => {
    if (!child) return;
    const dead = child;
    child = null;
    dead.removeAllListeners();
    try { dead.kill('SIGKILL'); } catch { /* already gone */ }
  };

  const ensureChild = () => {
    if (child && child.connected) return child;
    child = spawn();
    child.on('message', (message) => {
      if (!running || message?.id !== running.id) return; // late answer to a timed-out job
      const job = running;
      running = null;
      clearTimeout(job.timer);
      if (message.ok) job.resolve({ text: message.text, layout: message.layout });
      else {
        console.warn('[resume-review] PDF extraction failed', message.cause || message.message);
        job.reject(new HttpError(422, 'ANVI could not read the exported PDF.', { code: 'RESUME_PDF_UNREADABLE' }));
      }
      pump();
    });
    child.on('exit', () => {
      child = null;
      if (running) {
        const job = running;
        running = null;
        clearTimeout(job.timer);
        job.reject(new HttpError(503, 'The resume reader stopped unexpectedly. Please run the check again.', { code: 'RESUME_READER_CRASHED' }));
      }
      pump();
    });
    child.on('error', () => { /* 'exit' follows and fails the job */ });
    return child;
  };

  function pump() {
    if (running || !queue.length) return;
    const job = queue.shift();
    running = job;
    job.timer = setTimeout(() => {
      if (running !== job) return;
      running = null;
      stopChild();
      job.reject(new HttpError(504, 'Reading the PDF took too long. Please try again.', { code: 'RESUME_READER_TIMEOUT' }));
      pump();
    }, timeoutMs);
    try {
      ensureChild().send({ id: job.id, format: 'pdf', buffer: job.buffer.toString('base64') });
    } catch {
      clearTimeout(job.timer);
      running = null;
      stopChild();
      job.reject(new HttpError(503, 'The resume reader is unavailable. Please try again.', { code: 'RESUME_READER_UNAVAILABLE' }));
      pump();
    }
  }

  function extractPdf(buffer) {
    if (queue.length >= maxQueue) {
      return Promise.reject(new HttpError(503, 'Many students are checking resumes right now. Please try again in a minute.', { code: 'RESUME_READER_BUSY' }));
    }
    return new Promise((resolve, reject) => {
      queue.push({ id: nextId++, buffer, resolve, reject, timer: null });
      pump();
    });
  }

  return { extractPdf, close: stopChild, get pending() { return queue.length + (running ? 1 : 0); } };
}

let shared = null;
export const sharedExtractor = () => (shared ||= createExtractor());
