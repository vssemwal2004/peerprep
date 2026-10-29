// "Mark done" on the action plan: a personal checklist kept only in this browser (localStorage), per
// attempt. Every storage access is guarded: private windows and blocked site data simply fall back to
// a checklist that lasts for the visit.

export const actionStorageKey = (attemptId) => `peerprep:anvi-actions:${attemptId}`;

/** window.localStorage, or null when it is missing or access throws. */
export function defaultStorage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The action texts marked done for an attempt (only those still in `actions`). */
export function readDoneActions(attemptId, actions = [], storage = defaultStorage()) {
  if (!attemptId || !storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(actionStorageKey(attemptId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((text) => typeof text === "string" && actions.includes(text)) : [];
  } catch {
    return [];
  }
}

/** Saves the done list; false when it could not be stored (the checklist then lasts for this visit). */
export function writeDoneActions(attemptId, done = [], storage = defaultStorage()) {
  if (!attemptId || !storage) return false;
  try {
    if (done.length) storage.setItem(actionStorageKey(attemptId), JSON.stringify(done));
    else storage.removeItem(actionStorageKey(attemptId));
    return true;
  } catch {
    return false;
  }
}
