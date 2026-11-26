// Prep Mock publish state shared by the All Mocks list and its publish popup. Pure (no imports).
// A published mock reaches every university whose PrepMock grant and dates are active; PeerPrep's
// own (platform) students see it only through a per-student grant with its own window.

/** Live = published and visible. Unpublishing turns a mock back into a draft. */
export const isLiveMock = (mock) => mock?.lifecycleStatus === 'published' && mock?.isVisible !== false;

/**
 * A draft saved complete from the builder ("Save – ready to publish"): it has a pattern (or an OA
 * month on an older mock), questions and a test length. Publishing still re-checks on the server.
 */
export const isReadyMock = (mock) => !isLiveMock(mock)
  && Boolean(mock?.mockPattern?.rows?.length || (mock?.patternFrom?.month && mock?.patternFrom?.year))
  && Number(mock?.totalQuestions ?? mock?.questions) > 0
  && Number(mock?.duration) > 0;

/** Where a failed publish sends the admin: the builder, at the Pattern step when the pattern is the problem. */
export const builderPathFor = (mock, error = '') => `/admin/prepmock/${mock?._id}/edit${/pattern|month and year/i.test(String(error)) ? '?step=pattern' : ''}`;

// --- Bulk actions (Master Admin, platform) ----------------------------------------------------
// Selection, scope resolution, batching and result merging for "assign own students to many mocks"
// and bulk publish / unpublish. The UI always resolves a scope (selection, company, role, all) to
// explicit mock ids from the loaded list, so what the dialog lists is exactly what is sent, and
// splits the ids into batches that respect the server caps.

/** Server caps per request (POST /admin/assessment/mock-bulk/*): over these it answers 400. */
export const BULK_LIMITS = Object.freeze({ mocks: 1000, students: 20000, pairs: 200000 });

/** Role key for mocks without a role (shared with the workspace's role folders). */
export const NO_ROLE_KEY = '__no_role__';

const idOf = (value) => String(value?._id ?? value ?? '');
const companyKeyOf = (mock) => (String(mock?.company || 'Uncategorized').trim() || 'Uncategorized').toLocaleLowerCase();
const roleKeyOfMock = (mock) => {
  const role = String(mock?.role || '').trim();
  return role ? role.toLocaleLowerCase() : NO_ROLE_KEY;
};

/** A mock this admin can act on in bulk: a platform mock that is not shared in. */
export const isBulkEligible = (mock) => Boolean(mock?._id) && !mock.shared;

/**
 * The mocks in a scope, from the loaded list: { all: true } | { mockIds } | { company } |
 * { company, role } (role = lower-case role or NO_ROLE_KEY), optionally narrowed by
 * `statuses` (['published', 'draft']). Shared mocks are never included.
 */
export function mocksForScope(mocks = [], scope = {}) {
  const ids = scope.mockIds ? new Set(scope.mockIds.map(idOf)) : null;
  const company = scope.company ? String(scope.company).trim().toLocaleLowerCase() : '';
  const role = scope.role ? String(scope.role).trim().toLocaleLowerCase() : '';
  const statuses = Array.isArray(scope.statuses) && scope.statuses.length ? new Set(scope.statuses) : null;
  if (!ids && !company && !scope.all) return [];
  return mocks.filter((mock) => isBulkEligible(mock)
    && (!ids || ids.has(idOf(mock)))
    && (!company || companyKeyOf(mock) === company)
    && (!role || roleKeyOfMock(mock) === role)
    && (!statuses || statuses.has(mock.lifecycleStatus)));
}

/** Adds (on) or removes (off) ids; returns the same Set when nothing changes (no re-render). */
export function toggleSelection(selection, ids, on) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(idOf).filter(Boolean);
  if (!list.some((id) => selection.has(id) !== on)) return selection;
  const next = new Set(selection);
  list.forEach((id) => (on ? next.add(id) : next.delete(id)));
  return next;
}

/** Drops ids that are no longer in the list (after a refresh or delete); same Set when unchanged. */
export function pruneSelection(selection, mocks = []) {
  if (!selection.size) return selection;
  const present = new Set(mocks.filter(isBulkEligible).map(idOf));
  const kept = [...selection].filter((id) => present.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}

/** Header checkbox state for a page of rows: 'all' | 'some' | 'none' (only selectable rows count). */
export function pageSelectionState(selection, rows = []) {
  const ids = rows.filter(isBulkEligible).map(idOf);
  const ticked = ids.filter((id) => selection.has(id)).length;
  if (!ids.length || !ticked) return 'none';
  return ticked === ids.length ? 'all' : 'some';
}

/** Ids of the selectable rows between two ids (inclusive, in row order): shift-click ranges. */
export function rangeIds(rows = [], fromId, toId) {
  const ids = rows.filter(isBulkEligible).map(idOf);
  const from = ids.indexOf(idOf(fromId));
  const to = ids.indexOf(idOf(toId));
  if (from < 0 || to < 0) return to >= 0 ? [ids[to]] : [];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** live | hidden (published but not visible) | ready | draft — the publish state of one mock. */
export const publishStateOf = (mock) => (isLiveMock(mock) ? 'live'
  : mock?.lifecycleStatus === 'published' ? 'hidden' : isReadyMock(mock) ? 'ready' : 'draft');

/** Counts of each publish state, plus the ids a bulk publish / unpublish would send. */
export function publishBreakdown(mocks = []) {
  const counts = { live: 0, hidden: 0, ready: 0, draft: 0 };
  const toPublish = [];
  const toUnpublish = [];
  mocks.filter(isBulkEligible).forEach((mock) => {
    const state = publishStateOf(mock);
    counts[state] += 1;
    if (state !== 'live') toPublish.push(idOf(mock));
    if (mock.lifecycleStatus === 'published') toUnpublish.push(idOf(mock));
  });
  return { ...counts, total: counts.live + counts.hidden + counts.ready + counts.draft, toPublish, toUnpublish };
}

/** Splits values into chunks of at most `size`. */
export function chunk(values = [], size = BULK_LIMITS.mocks) {
  const step = Math.max(1, Math.floor(size));
  const out = [];
  for (let index = 0; index < values.length; index += step) out.push(values.slice(index, index + step));
  return out;
}

/**
 * Mock-id batches for one bulk assign: each batch stays within the mock cap and the
 * (mocks × students) pair cap. Throws when the student list alone is over its cap.
 */
export function planAssignBatches(mockIds = [], studentCount = 0, limits = BULK_LIMITS) {
  if (studentCount > limits.students) throw new Error(`Up to ${limits.students.toLocaleString()} students can be assigned at once.`);
  const perBatch = Math.min(limits.mocks, Math.max(1, Math.floor(limits.pairs / Math.max(1, studentCount))));
  return chunk([...new Set(mockIds.map(idOf))].filter(Boolean), perBatch);
}

/** A count from a field that may be a number or a list. */
export const countOf = (value) => (Array.isArray(value) ? value.length : Number(value) || 0);

export const EMPTY_ASSIGN_RESULT = Object.freeze({ mocks: 0, granted: 0, updated: 0, removed: 0, notFound: 0, prepMockTurnedOn: 0, prepMockActivationFailed: false, missingMocks: [], skipped: [], perMock: [] });

/**
 * Merges one batch response of POST /mock-bulk/own-students into the running total. Every batch
 * gets the same student list, so "not found" students repeat: the largest count is kept, not the sum.
 */
export function mergeAssignResult(total = EMPTY_ASSIGN_RESULT, response = {}) {
  const missing = response.mocksNotFound ?? response.missingMocks ?? response.unknownMockIds ?? response.notFoundMocks;
  return {
    mocks: total.mocks + countOf(response.mocks),
    granted: total.granted + countOf(response.granted),
    updated: total.updated + countOf(response.updated),
    removed: total.removed + countOf(response.removed),
    notFound: Math.max(total.notFound, countOf(response.notFound)),
    prepMockTurnedOn: total.prepMockTurnedOn + countOf(response.prepMockTurnedOn),
    prepMockActivationFailed: total.prepMockActivationFailed || response.prepMockActivationFailed === true,
    missingMocks: [...total.missingMocks, ...(Array.isArray(missing) ? missing.map(idOf) : [])],
    skipped: [...total.skipped, ...(Array.isArray(response.skipped) ? response.skipped : [])],
    perMock: [...total.perMock, ...(Array.isArray(response.perMock) ? response.perMock : [])],
  };
}

export const EMPTY_PUBLISH_RESULT = Object.freeze({ changed: 0, unchanged: 0, missingMocks: [], skipped: [] });

/**
 * Merges successes, unchanged mocks, missing IDs and per-mock errors from publish or unpublish.
 */
export function mergePublishResult(total = EMPTY_PUBLISH_RESULT, response = {}, publish = true) {
  const changed = publish ? response.published : (response.unpublished ?? response.published);
  const unchanged = publish ? response.alreadyLive : (response.alreadyOff ?? response.alreadyDraft ?? response.notLive ?? response.alreadyUnpublished ?? response.alreadyLive);
  const skipped = publish ? response.skipped : (response.failed ?? response.skipped);
  return {
    changed: total.changed + countOf(changed),
    unchanged: total.unchanged + countOf(unchanged),
    missingMocks: [...total.missingMocks, ...(Array.isArray(response.notFound) ? response.notFound.map(idOf) : [])],
    skipped: [...total.skipped, ...(Array.isArray(skipped) ? skipped : [])],
  };
}

/**
 * Sends batches one after another (never in parallel: each one is a large atomic write on the
 * server) and merges the responses. Stops at the first failure and returns what was done so far
 * plus the batches still to send, so the dialog can show a partial result and offer a retry.
 * → { result, done, remaining, error }
 */
export async function runBatches(batches, send, merge, initial, onProgress = () => {}) {
  let result = initial;
  for (let index = 0; index < batches.length; index += 1) {
    onProgress({ done: index, total: batches.length });
    try {
      result = merge(result, await send(batches[index], index));
    } catch (error) {
      return { result, done: index, remaining: batches.slice(index), error };
    }
  }
  onProgress({ done: batches.length, total: batches.length });
  return { result, done: batches.length, remaining: [], error: null };
}

/** datetime-local pair → error text, or '' when the window is valid (either end may be empty). */
export function windowError(start, end) {
  if (start && Number.isNaN(new Date(start).getTime())) return 'The start date is not valid.';
  if (end && Number.isNaN(new Date(end).getTime())) return 'The end date is not valid.';
  if (start && end && new Date(end) <= new Date(start)) return 'The end must be after the start.';
  return '';
}

/** Where "now" sits in a grant window: 'scheduled' (not yet open) | 'open' | 'closed'. */
export function grantWindowState(window = {}, now = Date.now()) {
  const start = window?.startTime ? new Date(window.startTime).getTime() : null;
  const end = window?.endTime ? new Date(window.endTime).getTime() : null;
  if (end !== null && end <= now) return 'closed';
  if (start !== null && start > now) return 'scheduled';
  return 'open';
}

/** True when two windows have the same start and end (e.g. a student's own dates vs. the mock's default). */
export const sameWindow = (left = {}, right = {}) => ['startTime', 'endTime'].every((key) => {
  const a = left?.[key] ? new Date(left[key]).getTime() : null;
  const b = right?.[key] ? new Date(right[key]).getTime() : null;
  return a === b;
});

const count = (number, word, many = `${word}s`) => `${number.toLocaleString()} ${number === 1 ? word : many}`;

/** The one-line action of a bulk assign dialog, e.g. "Assign 12 students to 4 mocks". */
export function assignSummary({ mode = 'assign', students = 0, mocks = 0, updateExisting = false } = {}) {
  if (mode === 'remove') return `Remove ${count(students, 'student')} from ${count(mocks, 'mock')}`;
  if (!students && updateExisting) return `Change the dates of students already on ${count(mocks, 'mock')}`;
  return `Assign ${count(students, 'student')} to ${count(mocks, 'mock')}${updateExisting ? ' and update existing dates' : ''}`;
}

const button = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';
export const DIALOG_BUTTONS = Object.freeze({
  secondary: `${button} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-sky-500 focus-visible:ring-offset-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800`,
  primary: `${button} bg-sky-600 text-white hover:bg-sky-500 focus-visible:ring-sky-500`,
  success: `${button} bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500`,
  warning: `${button} bg-amber-600 text-white hover:bg-amber-500 focus-visible:ring-amber-500`,
});
