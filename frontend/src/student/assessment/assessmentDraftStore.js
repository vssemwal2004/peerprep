const DB_NAME = 'peerprep-assessment-drafts';
const STORE_NAME = 'drafts';
let databasePromise;

function localStore() {
  try { return globalThis.localStorage; } catch { return null; }
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, 1);
      let abandoned = false;
      const timeout = setTimeout(() => { abandoned = true; reject(new Error('Draft storage is busy')); }, 2000);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (abandoned) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => { clearTimeout(timeout); reject(request.error); };
      request.onblocked = () => { abandoned = true; clearTimeout(timeout); reject(new Error('Draft storage is blocked')); };
    }).catch((error) => { databasePromise = null; throw error; });
  }
  return databasePromise;
}

async function transact(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    const timeout = setTimeout(() => {
      try { transaction.abort(); } catch { /* transaction may have completed */ }
      reject(new Error('Draft storage did not respond'));
    }, 2000);
    transaction.oncomplete = () => { clearTimeout(timeout); resolve(request.result); };
    transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error); };
    transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || new Error('Draft write was interrupted')); };
  });
}

export async function readAssessmentDraft(key) {
  let stored = null;
  let fallback = null;
  try { stored = await transact('readonly', (store) => store.get(key)); } catch { /* fallback below */ }
  try { fallback = JSON.parse(localStore()?.getItem(key) || 'null'); } catch { /* unavailable/corrupt */ }
  return Number(fallback?.updatedAt || 0) > Number(stored?.updatedAt || 0) ? fallback : (stored || fallback);
}

export async function writeAssessmentDraft(key, draft) {
  try {
    await transact('readwrite', (store) => store.put(draft, key));
    try { localStore()?.removeItem(key); } catch { /* obsolete fallback can remain */ }
    return true;
  } catch {
    try {
      const storage = localStore();
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(draft));
      return true;
    } catch { return false; }
  }
}

export async function deleteAssessmentDraft(key) {
  try { await transact('readwrite', (store) => store.delete(key)); } catch { /* best effort after submit */ }
  try { localStore()?.removeItem(key); } catch { /* best effort */ }
}
