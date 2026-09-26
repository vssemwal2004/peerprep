import test from 'node:test';
import assert from 'node:assert/strict';
import { readAssessmentDraft, writeAssessmentDraft, deleteAssessmentDraft } from '../src/student/assessment/assessmentDraftStore.js';

test('unavailable IndexedDB falls back to local storage and clears it after confirmation', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  try {
    const draft = { updatedAt: 123, answersMap: { '0-0': { answer: 'B' } }, protocol: { pendingFinal: { mutationId: 'unchanged' } } };
    assert.equal(await writeAssessmentDraft('draft:test', draft), true);
    assert.deepEqual(await readAssessmentDraft('draft:test'), draft);
    await deleteAssessmentDraft('draft:test');
    assert.equal(await readAssessmentDraft('draft:test'), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('storage denial reports unavailable instead of claiming local durability', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
  try {
    assert.equal(await writeAssessmentDraft('draft:test', { updatedAt: 1 }), false);
    assert.equal(await readAssessmentDraft('draft:test'), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('IndexedDB draft acknowledgement waits for transaction commit, not request success', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  let commit;
  let committed;
  const database = {
    transaction() {
      const transaction = { objectStore: () => ({ put: (value) => {
        const request = { result: 'key' };
        commit = () => { committed = value; transaction.oncomplete(); };
        return request;
      } }), abort() {} };
      return transaction;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open: () => {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  } });
  try {
    const isolatedStore = await import('../src/student/assessment/assessmentDraftStore.js?commit-test');
    let resolved = false;
    const draft = { updatedAt: 1, protocol: { pendingBatch: { mutationId: 'pending' } } };
    const save = isolatedStore.writeAssessmentDraft('draft:commit', draft).then((value) => { resolved = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(resolved, false);
    assert.equal(committed, undefined);
    commit();
    assert.equal(await save, true);
    assert.deepEqual(committed, draft);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else delete globalThis.indexedDB;
  }
});

test('local storage quota failure is reported and never overwrites the earlier recoverable draft', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const earlier = { updatedAt: 1, answersMap: { '0-0': { answer: 1 } } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify(earlier), setItem: () => { throw new Error('QuotaExceededError'); },
  } });
  try {
    assert.equal(await writeAssessmentDraft('draft:quota', { updatedAt: 2 }), false);
    assert.deepEqual(await readAssessmentDraft('draft:quota'), earlier);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
