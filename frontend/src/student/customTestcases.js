// Student-written testcases for Run. The server caps a run at 12 cases, of which at most
// MAX_CUSTOM_TESTCASES may be custom; custom cases without a typed expected output are
// compared against the problem's reference solution on the server.
export const MAX_CUSTOM_TESTCASES = 6;

const STORAGE_PREFIX = 'peerprep:custom-testcases:v1:';
const MAX_STORED_TEXT = 64 * 1024;

export function isCustomTestCase(entry) {
  return entry?.kind === 'custom';
}

export function createCustomTestCase(input = '') {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id: `custom-${suffix}`, kind: 'custom', input: String(input ?? ''), expectedOutput: '' };
}

/** Display labels: samples are "Case n", custom cases are "Custom n". Keyed by testcase id. */
export function testCaseLabels(testCases = []) {
  const labels = new Map();
  let sampleNumber = 0;
  let customNumber = 0;
  (Array.isArray(testCases) ? testCases : []).forEach((entry) => {
    labels.set(String(entry?.id), isCustomTestCase(entry) ? `Custom ${++customNumber}` : `Case ${++sampleNumber}`);
  });
  return labels;
}

/** Run payload: samples keep their expected output; custom cases send one only when typed. */
export function toRunTestCases(testCases = []) {
  const labels = testCaseLabels(testCases);
  return (Array.isArray(testCases) ? testCases : []).filter(Boolean).map((entry, index) => {
    const custom = isCustomTestCase(entry);
    const base = {
      id: String(entry.id || `case-${index + 1}`),
      label: labels.get(String(entry.id)) || `Case ${index + 1}`,
      kind: custom ? 'custom' : 'sample',
      input: String(entry.input ?? ''),
    };
    if (custom) {
      const typed = String(entry.expectedOutput ?? '');
      return typed.trim() ? { ...base, expectedOutput: typed } : base;
    }
    return entry.expectedOutput !== null && entry.expectedOutput !== undefined
      ? { ...base, expectedOutput: String(entry.expectedOutput) }
      : base;
  });
}

export function loadStoredCustomTestCases(problemKey) {
  if (!problemKey) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}${problemKey}`) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_CUSTOM_TESTCASES).filter((entry) => entry && typeof entry.id === 'string').map((entry) => ({
      id: entry.id,
      kind: 'custom',
      input: String(entry.input ?? ''),
      expectedOutput: String(entry.expectedOutput ?? ''),
    }));
  } catch {
    return [];
  }
}

export function saveStoredCustomTestCases(problemKey, testCases = []) {
  if (!problemKey) return;
  const custom = (Array.isArray(testCases) ? testCases : []).filter(isCustomTestCase).map((entry) => ({
    id: entry.id,
    input: String(entry.input ?? '').slice(0, MAX_STORED_TEXT),
    expectedOutput: String(entry.expectedOutput ?? '').slice(0, MAX_STORED_TEXT),
  }));
  try {
    const key = `${STORAGE_PREFIX}${problemKey}`;
    if (custom.length) window.localStorage.setItem(key, JSON.stringify(custom));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage may be full or blocked; custom cases still work for this session.
  }
}

/**
 * Pure state helpers shared by practice and assessment pages.
 * Adding copies the selected case's input, like starting from an example.
 */
export function addCustomTestCase(testCases = [], fromId = null) {
  const list = Array.isArray(testCases) ? testCases : [];
  if (list.filter(isCustomTestCase).length >= MAX_CUSTOM_TESTCASES) return { testCases: list, addedId: null };
  const source = list.find((entry) => String(entry.id) === String(fromId)) || list[0];
  const created = createCustomTestCase(source?.input ?? '');
  return { testCases: [...list, created], addedId: created.id };
}

export function removeCustomTestCase(testCases = [], id) {
  const list = Array.isArray(testCases) ? testCases : [];
  const index = list.findIndex((entry) => String(entry.id) === String(id) && isCustomTestCase(entry));
  if (index < 0) return { testCases: list, nextActiveId: null };
  const next = list.filter((_, position) => position !== index);
  return { testCases: next, nextActiveId: next[Math.max(0, index - 1)]?.id ?? null };
}

export function updateCustomTestCase(testCases = [], id, patch) {
  return (Array.isArray(testCases) ? testCases : []).map((entry) => (
    String(entry.id) === String(id) && isCustomTestCase(entry) ? { ...entry, ...patch } : entry
  ));
}
