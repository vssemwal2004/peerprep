// Prep Mock builder: the section that questions imported from a library should land in.
// The builder stores the admin's choice before it navigates to the library and reads it once
// when it comes back with the selection. Pure (no imports) so it can be tested.

const STORAGE_KEY = 'prep_mock_import_target_v1';

function readStore() {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: imports fall back to grouping by type.
  }
}

/** Remember the chosen section ({ sectionIndex, sectionName, type }) or clear it (null). */
export function rememberMockImportTarget(assessmentKey, target) {
  if (!assessmentKey) return;
  const store = readStore();
  if (target && Number.isInteger(Number(target.sectionIndex)) && Number(target.sectionIndex) >= 0) {
    store[assessmentKey] = { sectionIndex: Number(target.sectionIndex), sectionName: String(target.sectionName || ''), type: String(target.type || '') };
  } else {
    delete store[assessmentKey];
  }
  writeStore(store);
}

/** Read and forget the remembered section (null when none). */
export function takeMockImportTarget(assessmentKey) {
  if (!assessmentKey) return null;
  const store = readStore();
  const target = store[assessmentKey] || null;
  if (target) {
    delete store[assessmentKey];
    writeStore(store);
  }
  return target;
}

/**
 * Index of the remembered section in `sections`: same position and name first, then the same
 * name anywhere; -1 when it is gone (imports then group by type as before).
 */
export function mockImportTargetIndex(sections, target) {
  if (!target || !Array.isArray(sections)) return -1;
  const name = String(target.sectionName || '').trim().toLowerCase();
  const nameOf = (section) => String(section?.sectionName || '').trim().toLowerCase();
  const index = Number(target.sectionIndex);
  if (Number.isInteger(index) && sections[index] && (!name || nameOf(sections[index]) === name)) return index;
  return name ? sections.findIndex((section) => nameOf(section) === name) : -1;
}
