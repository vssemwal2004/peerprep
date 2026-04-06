const STORAGE_KEY = 'assessment_problem_selections_v1';

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

export function queueProblemSelection(assessmentKey, selection) {
  const store = readStore();
  const list = Array.isArray(store[assessmentKey]) ? store[assessmentKey] : [];
  list.push({ ...selection, queuedAt: Date.now() });
  store[assessmentKey] = list;
  writeStore(store);
}

export function consumeProblemSelections(assessmentKey) {
  const store = readStore();
  const list = Array.isArray(store[assessmentKey]) ? store[assessmentKey] : [];
  if (list.length === 0) return [];
  delete store[assessmentKey];
  writeStore(store);
  return list;
}
