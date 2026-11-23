import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ENGINE_VERSION } from '@veriworkly/ats-engine';
import { currentTenant } from '../../platform/tenantContext.js';
import { encryptTenantSecret, decryptTenantSecret } from '../../platform/tenantSecrets.js';
import { HttpError } from '../../utils/errors.js';
import { checkResumePdf, MAX_JOB_CHARS, validateResumePdf } from './resumeReview.service.js';
import { resumeScanConcurrency } from './resumeReview.extractor.js';

const collections = new WeakMap();
const indexes = new WeakMap();
const minute = 60_000;
const publicFields = { status: 1, report: 1, checkedAt: 1, error: 1 };

function tenantCollection() {
  const db = (currentTenant()?.connection || mongoose.connection).db;
  if (!db) throw new HttpError(503, 'The résumé scan queue is reconnecting. Please try again.');
  if (!collections.has(db)) collections.set(db, db.collection('resumeScanJobs'));
  return collections.get(db);
}

function ensureIndexes(collection) {
  if (!indexes.has(collection)) {
    indexes.set(collection, collection.createIndexes([
      { key: { availableAt: 1, createdAt: 1 }, name: 'claim_due_scans', sparse: true },
      { key: { expiresAt: 1 }, name: 'expire_scans', expireAfterSeconds: 0 },
    ]).catch(error => { indexes.delete(collection); throw error; }));
  }
  return indexes.get(collection);
}

function forStudent(row) {
  const job = { jobId: row._id, status: row.status };
  if (row.status === 'done') return { ...job, checkedAt: row.checkedAt, report: JSON.parse(decryptTenantSecret(row.report)) };
  if (row.status === 'failed') return { ...job, error: row.error };
  return { ...job, retryAfterMs: row.status === 'queued' ? 1800 : 900 };
}

/** Each API process takes a bounded share of work from the verified tenants' own databases. */
export function createResumeScanJobs({ check = checkResumePdf, concurrency = resumeScanConcurrency(), getCollection = tenantCollection, leaseMs = 2 * minute } = {}) {
  const ready = new Map();
  const active = new Set();
  let scheduled = false;
  let closed = false;

  async function processNext(collection, generation) {
    const now = new Date();
    const claim = randomUUID();
    const row = await collection.findOneAndUpdate(
      { availableAt: { $lte: now }, expiresAt: { $gt: now } },
      { $set: { status: 'running', claim, availableAt: new Date(+now + leaseMs) }, $inc: { attempts: 1 } },
      { sort: { availableAt: 1, createdAt: 1 }, returnDocument: 'after', projection: { payload: 1, attempts: 1 } },
    );
    if (!row) {
      if (ready.get(collection) === generation) ready.delete(collection);
      return;
    }
    const owned = { _id: row._id, claim };
    const renew = setInterval(() => {
      collection.updateOne(owned, { $set: { availableAt: new Date(Date.now() + leaseMs) } }).catch(() => {});
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    renew.unref();
    try {
      let outcome;
      try {
        if (row.attempts > 3) throw new HttpError(503, 'The PDF reader restarted several times. Please try this scan again.');
        const { pdf, description } = JSON.parse(decryptTenantSecret(row.payload));
        const report = await check(Buffer.from(pdf, 'base64'), { jobDescription: description });
        outcome = { status: 'done', checkedAt: new Date(), report: encryptTenantSecret(JSON.stringify(report)) };
      } catch (err) {
        const status = err.status || 500;
        if ((status === 503 || status === 504) && row.attempts < 2) {
          await collection.updateOne(owned, { $set: { status: 'queued', availableAt: new Date() }, $unset: { claim: '' } });
          return;
        }
        outcome = { status: 'failed', error: { status, code: err.details?.code || 'RESUME_SCAN_FAILED', message: err.status ? err.message : 'The PDF check could not finish. Please try again.' } };
      }
      await collection.updateOne(owned, {
        $set: { ...outcome, expiresAt: new Date(Date.now() + 15 * minute) },
        $unset: { availableAt: '', payload: '', claim: '' },
      });
    } finally { clearInterval(renew); }
  }

  function schedule() {
    if (closed || scheduled || !ready.size || active.size >= concurrency) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      while (!closed && active.size < concurrency && ready.size) {
        const [collection, generation] = ready.entries().next().value;
        ready.delete(collection);
        ready.set(collection, generation);
        const task = processNext(collection, generation).catch(error => {
          // A database outage leaves the claim recoverable after its lease expires.
          console.warn('[resume-scan] Could not process a queued job:', error.codeName || error.name);
          if (ready.get(collection) === generation) ready.delete(collection);
        }).finally(() => { active.delete(task); schedule(); });
        active.add(task);
      }
    });
  }

  function wake(collection) {
    ready.set(collection, Symbol());
    schedule();
  }

  async function submit(owner, buffer, jobDescription = '') {
    validateResumePdf(buffer);
    const description = String(jobDescription || '').trim().slice(0, MAX_JOB_CHARS);
    const collection = getCollection();
    await ensureIndexes(collection);
    const id = createHash('sha256').update(JSON.stringify(['resume-v1', ENGINE_VERSION, owner, description])).update(buffer).digest('hex');
    const now = new Date();
    const existing = await collection.findOne({ _id: id, owner, status: { $ne: 'failed' }, expiresAt: { $gt: now } }, { projection: publicFields });
    if (existing) {
      if (existing.status !== 'done' && !ready.has(collection)) wake(collection);
      return forStudent(existing);
    }
    // The stable id deduplicates tabs, retries and simultaneous submissions on different API instances.
    const document = { _id: id, owner, status: 'queued', attempts: 0, createdAt: now, availableAt: now,
      expiresAt: new Date(+now + 60 * minute), payload: encryptTenantSecret(JSON.stringify({ pdf: buffer.toString('base64'), description })) };
    let row = document;
    try { await collection.insertOne(document); }
    catch (err) {
      if (err.code !== 11000) throw err;
      // Retry a failed/expired scan, or join a concurrent insert without replacing its claim.
      const reset = { $or: [{ $eq: [{ $type: '$status' }, 'missing'] }, { $eq: ['$status', 'failed'] }, { $lte: ['$expiresAt', now] }] };
      const update = [{ $replaceWith: { $cond: [reset, { $literal: document }, '$$ROOT'] } }];
      row = await collection.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: 'after', projection: publicFields });
    }
    if (row.status === 'queued' || row.status === 'running') {
      wake(collection);
      return { ...forStudent(row), retryAfterMs: 350 };
    }
    return forStudent(row);
  }

  async function read(owner, id) {
    if (!/^[0-9a-f]{64}$/.test(id)) return null;
    const collection = getCollection();
    const row = await collection.findOne({ _id: id, owner, expiresAt: { $gt: new Date() } }, { projection: publicFields });
    if (row && (row.status === 'queued' || row.status === 'running') && !ready.has(collection)) wake(collection);
    return row && forStudent(row);
  }

  async function recover() {
    const collection = getCollection();
    const now = new Date();
    if (!closed && !ready.has(collection) && await collection.findOne({ availableAt: { $lte: now }, expiresAt: { $gt: now } }, { projection: { _id: 1 } })) wake(collection);
  }

  async function close() {
    closed = true;
    ready.clear();
    await Promise.all([...active]);
  }

  return { submit, read, recover, close };
}

let shared;
export const resumeScanJobs = () => shared ||= createResumeScanJobs();
