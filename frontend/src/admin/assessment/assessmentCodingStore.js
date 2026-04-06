const STORAGE_KEY = 'assessment_coding_editor_v1';

function readStore() {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadCodingDraft(tempId) {
  const store = readStore();
  return store[tempId] || null;
}

export function saveCodingDraft(tempId, payload) {
  const store = readStore();
  store[tempId] = {
    ...store[tempId],
    ...payload,
    tempId,
    updatedAt: Date.now(),
  };
  writeStore(store);
  return store[tempId];
}

export function removeCodingDraft(tempId) {
  const store = readStore();
  if (!store[tempId]) return;
  delete store[tempId];
  writeStore(store);
}

export function listCodingDrafts(assessmentKey) {
  const store = readStore();
  return Object.values(store).filter((draft) => draft.assessmentKey === assessmentKey);
}

