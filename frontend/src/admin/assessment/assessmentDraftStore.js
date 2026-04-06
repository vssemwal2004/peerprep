const STORAGE_KEY = 'assessment_builder_v1';

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

export function loadAssessmentDraft(assessmentKey) {
  const store = readStore();
  return store[assessmentKey] || null;
}

export function saveAssessmentDraft(assessmentKey, payload) {
  const store = readStore();
  store[assessmentKey] = {
    ...(store[assessmentKey] || {}),
    ...payload,
    assessmentKey,
    updatedAt: Date.now(),
  };
  writeStore(store);
  return store[assessmentKey];
}

export function clearAssessmentDraft(assessmentKey) {
  const store = readStore();
  if (!store[assessmentKey]) return;
  delete store[assessmentKey];
  writeStore(store);
}
