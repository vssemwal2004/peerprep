// Pure roster helpers for the live assessment report. Everything here is
// deterministic and free of React/DOM so it can be unit tested with node:test.

export const ROSTER_PAGE_SIZES = [25, 50, 100, 200];

export const ROSTER_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'expired', label: 'Expired' },
  { value: 'violation', label: 'Violation' },
  { value: 'incomplete', label: 'Incomplete' },
];

export const ROSTER_EVALUATION_OPTIONS = [
  { value: 'all', label: 'Any evaluation' },
  { value: 'graded', label: 'Graded' },
  { value: 'evaluating', label: 'Evaluating' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'not_submitted', label: 'Not submitted' },
];

export const ROSTER_TYPE_OPTIONS = [
  { value: 'all', label: 'Any submission' },
  { value: 'on_time', label: 'On time' },
  { value: 'late', label: 'Late' },
];

// Class details a candidate belongs to. The roster sends them on every row; an empty value is
// shown as "Not set" so those candidates can still be found.
export const ACADEMIC_DIMENSIONS = [
  { key: 'college', label: 'College' },
  { key: 'course', label: 'Course' },
  { key: 'branch', label: 'Branch' },
  { key: 'semester', label: 'Semester' },
  { key: 'group', label: 'Group / section' },
];

export const DEFAULT_ROSTER_FILTERS = Object.freeze({
  query: '',
  statuses: [],
  evaluation: 'all',
  submissionType: 'all',
  scoreMin: '',
  scoreMax: '',
  flaggedOnly: false,
  hasViolations: false,
  // { course: ['B.Tech'], semester: ['3', '5'] }: values within one class detail are OR, details are AND.
  academic: Object.freeze({}),
  // Per-column filters from the table header menus, see COLUMN_FILTERS.
  columns: Object.freeze({}),
});

export const DISTRIBUTION_BUCKETS = ['0-25', '26-50', '51-75', '76-100'];

const UNSUBMITTED = new Set(['not_started', 'in_progress']);

const STATUS_ORDER = {
  in_progress: 0,
  submitted: 1,
  expired: 2,
  violation: 3,
  incomplete: 4,
  not_started: 5,
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export function rosterRowKey(row) {
  return String(row?.key || row?.submissionId || row?.studentId || '');
}

export function isSubmittedRow(row) {
  return Boolean(row?.status) && !UNSUBMITTED.has(row.status);
}

export function rowViolationCount(row) {
  return ['tabSwitches', 'fullscreenExits', 'cameraFlags', 'aiViolationCount']
    .reduce((sum, key) => sum + (Number(row?.[key]) || 0), 0);
}

export function rowHasViolations(row) {
  return rowViolationCount(row) > 0 || (Number(row?.violationScore) || 0) > 0;
}

/** Percentage (0-100) for a row, derived from score/maxMarks if the server omitted it. */
export function rowPercentage(row) {
  const pct = toNumberOrNull(row?.percentage);
  if (pct !== null) return Math.max(0, Math.min(100, pct));
  const score = toNumberOrNull(row?.score);
  const max = toNumberOrNull(row?.maxMarks);
  if (score === null || !max) return null;
  return Math.max(0, Math.min(100, (score / max) * 100));
}

/**
 * Evaluation state of a row:
 * not_submitted | evaluating | needs_review | graded
 */
export function rowEvaluationState(row) {
  if (!isSubmittedRow(row)) return 'not_submitted';
  if (row.evaluationStatus === 'processing') return 'evaluating';
  if (row.evaluationStatus === 'failed') return 'needs_review';
  if (toNumberOrNull(row.score) === null && rowPercentage(row) === null) return 'evaluating';
  return 'graded';
}

/** passed flag, falling back to the assessment pass mark when the server sent none. */
export function rowPassed(row, passPercentage = null) {
  if (rowEvaluationState(row) !== 'graded') return null;
  if (typeof row.passed === 'boolean') return row.passed;
  const pct = rowPercentage(row);
  const passMark = toNumberOrNull(passPercentage);
  if (pct === null || passMark === null) return null;
  return pct >= passMark;
}

/** Outcome bucket used by the completion chart. */
export function rowOutcome(row, passPercentage = null) {
  if (!row?.status || row.status === 'not_started') return 'not_started';
  if (row.status === 'in_progress') return 'in_progress';
  const evaluation = rowEvaluationState(row);
  if (evaluation === 'needs_review') return 'needs_review';
  if (evaluation === 'evaluating') return 'evaluating';
  const passed = rowPassed(row, passPercentage);
  if (passed === true) return 'passed';
  if (passed === false) return 'failed';
  return 'graded';
}

const shallowEqualRow = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

/**
 * Merge a roster response into the current rows.
 * - full=true replaces the roster (rows absent from the response disappear).
 * - full=false upserts the delta rows by key; a row whose submission now exists
 *   replaces the placeholder "not started" row of the same student.
 * Returns { rows, changedKeys } where changedKeys lists keys added or modified.
 */
export function mergeRosterRows(currentRows = [], incomingRows = [], { full = false } = {}) {
  const changedKeys = [];
  const previous = new Map(currentRows.map((row) => [rosterRowKey(row), row]));
  const incoming = (Array.isArray(incomingRows) ? incomingRows : []).filter((row) => rosterRowKey(row));

  if (full) {
    const rows = incoming.map((row) => {
      const key = rosterRowKey(row);
      const before = previous.get(key);
      if (before && shallowEqualRow(before, row)) return before;
      changedKeys.push(key);
      return row;
    });
    return { rows, changedKeys };
  }

  const next = new Map(previous);
  const studentToKey = new Map();
  for (const [key, row] of next) {
    if (row?.studentId) studentToKey.set(String(row.studentId), key);
  }

  for (const row of incoming) {
    const key = rosterRowKey(row);
    const studentKey = row.studentId ? studentToKey.get(String(row.studentId)) : undefined;
    // A student who just started gets a submission-keyed row; drop the old placeholder.
    if (studentKey && studentKey !== key && next.get(studentKey)?.status === 'not_started' && row.status !== 'not_started') {
      next.delete(studentKey);
    }
    const before = next.get(key);
    if (before && shallowEqualRow(before, row)) continue;
    next.set(key, row);
    if (row.studentId) studentToKey.set(String(row.studentId), key);
    changedKeys.push(key);
  }
  return { rows: [...next.values()], changedKeys };
}

/** Map a legacy /admin/assessment/reports row onto the roster row contract. */
export function legacyReportRowToRoster(row = {}, assessment = {}) {
  const maxMarks = toNumberOrNull(row.totalMarks) ?? toNumberOrNull(assessment.totalMarks);
  const evaluationStatus = row.evaluationStatus || 'completed';
  const evaluated = !['processing', 'failed'].includes(evaluationStatus);
  const score = evaluated ? toNumberOrNull(row.score) : null;
  const percentage = score !== null && maxMarks ? Math.max(0, Math.min(100, (score / maxMarks) * 100)) : null;
  const passMark = toNumberOrNull(assessment.passPercentage);
  return {
    key: String(row._id || ''),
    submissionId: row._id ? String(row._id) : null,
    studentId: row.studentUserId || row.userId || null,
    name: row.studentName || 'Unknown',
    email: row.studentEmail || row.email || '',
    rollNo: row.studentId || row.studentRollNo || '',
    status: row.status || 'incomplete',
    evaluationStatus,
    score,
    maxMarks,
    percentage,
    passed: percentage !== null && passMark !== null ? percentage >= passMark : null,
    startedAt: row.attemptDate || null,
    submittedAt: row.submittedAt || null,
    lastSavedAt: row.lastSavedAt || null,
    timeTakenSec: toNumberOrNull(row.timeTakenSec),
    answeredCount: toNumberOrNull(row.answeredCount),
    totalQuestions: toNumberOrNull(row.totalQuestions),
    violationScore: toNumberOrNull(row.violationScore) ?? 0,
    tabSwitches: Number(row.tabSwitches) || 0,
    fullscreenExits: Number(row.fullscreenExits) || 0,
    cameraFlags: Number(row.cameraFlags) || 0,
    aiViolationCount: Number(row.aiViolationCount) || 0,
    flagged: Boolean(row.flagged) || (Number(row.violationCount) || 0) > 0,
    isLate: Boolean(row.isLate),
    updatedAt: row.updatedAt || null,
  };
}

const parseBound = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const academicValue = (row, key) => {
  const value = row?.[key];
  return value === null || value === undefined || value === '' ? '' : String(value);
};

const minutesOf = (row) => {
  const seconds = toNumberOrNull(row?.timeTakenSec);
  return seconds === null ? null : Math.round((seconds / 60) * 10) / 10;
};

const progressPercent = (row) => {
  const answered = toNumberOrNull(row?.answeredCount);
  const total = toNumberOrNull(row?.totalQuestions);
  if (answered === null || !total) return null;
  return Math.min(100, Math.round((answered / total) * 1000) / 10);
};

/**
 * Filter kinds the table header menus offer. `get` is the value the filter reads:
 * enum -> a string, number -> a number or null, date -> epoch ms or null, text -> a string.
 */
export const COLUMN_FILTERS = {
  student: { kind: 'text', get: (row) => `${row.name || ''} ${row.email || ''} ${row.rollNo || ''}`.toLowerCase() },
  status: { kind: 'enum', get: (row) => row.status || 'not_started' },
  course: { kind: 'enum', get: (row) => academicValue(row, 'course') },
  branch: { kind: 'enum', get: (row) => academicValue(row, 'branch') },
  college: { kind: 'enum', get: (row) => academicValue(row, 'college') },
  semester: { kind: 'enum', get: (row) => academicValue(row, 'semester') },
  group: { kind: 'enum', get: (row) => academicValue(row, 'group') },
  progress: { kind: 'number', get: progressPercent },
  score: { kind: 'number', get: (row) => (rowEvaluationState(row) === 'graded' ? rowPercentage(row) : null) },
  time: { kind: 'number', get: minutesOf },
  violations: { kind: 'number', get: (row) => rowViolationCount(row) },
  startedAt: { kind: 'date', get: (row) => toTime(row.startedAt) },
  submittedAt: { kind: 'date', get: (row) => toTime(row.submittedAt) },
};

const dayStart = (value) => {
  const time = value ? new Date(`${value}T00:00:00`).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};
const dayEnd = (value) => {
  const start = dayStart(value);
  return start === null ? null : start + 24 * 60 * 60 * 1000 - 1;
};

export function columnFilterActive(kind, spec) {
  if (!spec) return false;
  if (kind === 'enum') return Array.isArray(spec.values) && spec.values.length > 0;
  if (kind === 'number') return parseBound(spec.min) !== null || parseBound(spec.max) !== null;
  if (kind === 'date') return Boolean(spec.from || spec.to);
  if (kind === 'text') return Boolean(String(spec.text || '').trim());
  return false;
}

function matchesColumnFilter(row, key, spec) {
  const definition = COLUMN_FILTERS[key];
  if (!definition || !columnFilterActive(definition.kind, spec)) return true;
  const value = definition.get(row);
  if (definition.kind === 'enum') return spec.values.includes(String(value));
  if (definition.kind === 'text') return String(value).includes(String(spec.text).trim().toLowerCase());
  if (value === null || value === undefined) return false;
  if (definition.kind === 'number') {
    const min = parseBound(spec.min);
    const max = parseBound(spec.max);
    return (min === null || value >= min) && (max === null || value <= max);
  }
  const from = dayStart(spec.from);
  const to = dayEnd(spec.to);
  return (from === null || value >= from) && (to === null || value <= to);
}

export function activeColumnFilterKeys(filters = DEFAULT_ROSTER_FILTERS) {
  return Object.keys(filters.columns || {}).filter((key) => COLUMN_FILTERS[key] && columnFilterActive(COLUMN_FILTERS[key].kind, filters.columns[key]));
}

export function activeAcademicKeys(filters = DEFAULT_ROSTER_FILTERS) {
  return ACADEMIC_DIMENSIONS.map((dimension) => dimension.key).filter((key) => filters.academic?.[key]?.length);
}

export function hasActiveRosterFilters(filters = DEFAULT_ROSTER_FILTERS) {
  return Boolean(
    String(filters.query || '').trim()
    || filters.statuses?.length
    || (filters.evaluation && filters.evaluation !== 'all')
    || (filters.submissionType && filters.submissionType !== 'all')
    || parseBound(filters.scoreMin) !== null
    || parseBound(filters.scoreMax) !== null
    || filters.flaggedOnly
    || filters.hasViolations
    || activeAcademicKeys(filters).length
    || activeColumnFilterKeys(filters).length,
  );
}

export function filterRosterRows(rows = [], filters = DEFAULT_ROSTER_FILTERS) {
  const query = String(filters.query || '').trim().toLowerCase();
  const statuses = new Set(filters.statuses || []);
  const min = parseBound(filters.scoreMin);
  const max = parseBound(filters.scoreMax);
  const academicKeys = activeAcademicKeys(filters);
  const columnKeys = activeColumnFilterKeys(filters);
  return rows.filter((row) => {
    for (const key of academicKeys) {
      if (!filters.academic[key].includes(academicValue(row, key))) return false;
    }
    for (const key of columnKeys) {
      if (!matchesColumnFilter(row, key, filters.columns[key])) return false;
    }
    if (query) {
      const haystack = `${row.name || ''} ${row.email || ''} ${row.rollNo || ''} ${row.studentId || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (statuses.size && !statuses.has(row.status)) return false;
    if (filters.evaluation && filters.evaluation !== 'all' && rowEvaluationState(row) !== filters.evaluation) return false;
    if (filters.submissionType === 'late' && !(isSubmittedRow(row) && row.isLate)) return false;
    if (filters.submissionType === 'on_time' && !(isSubmittedRow(row) && !row.isLate)) return false;
    if (min !== null || max !== null) {
      const pct = rowEvaluationState(row) === 'graded' ? rowPercentage(row) : null;
      if (pct === null) return false;
      if (min !== null && pct < min) return false;
      if (max !== null && pct > max) return false;
    }
    if (filters.flaggedOnly && !row.flagged) return false;
    if (filters.hasViolations && !rowHasViolations(row)) return false;
    return true;
  });
}

const textValue = (value) => (value === null || value === undefined || value === '' ? null : String(value).toLowerCase());

/** Sort value per column; null means "no value" and always sorts last. */
const SORT_ACCESSORS = {
  name: (row) => textValue(row.name),
  rollNo: (row) => textValue(row.rollNo),
  email: (row) => textValue(row.email),
  status: (row) => STATUS_ORDER[row.status] ?? 99,
  evaluation: (row) => ({ graded: 0, evaluating: 1, needs_review: 2, not_submitted: 3 })[rowEvaluationState(row)],
  score: (row) => (rowEvaluationState(row) === 'graded' ? rowPercentage(row) : null),
  progress: (row) => {
    const answered = toNumberOrNull(row.answeredCount);
    const total = toNumberOrNull(row.totalQuestions);
    if (answered === null) return null;
    return total ? answered / total : answered;
  },
  timeTakenSec: (row) => toNumberOrNull(row.timeTakenSec),
  startedAt: (row) => toTime(row.startedAt),
  submittedAt: (row) => toTime(row.submittedAt),
  lastSavedAt: (row) => toTime(row.lastSavedAt),
  violations: (row) => rowViolationCount(row),
  violationScore: (row) => toNumberOrNull(row.violationScore),
  flagged: (row) => (row.flagged ? 1 : 0),
  course: (row) => textValue(row.course),
  branch: (row) => textValue(row.branch),
  college: (row) => textValue(row.college),
  group: (row) => textValue(row.group),
  semester: (row) => toNumberOrNull(row.semester),
};

export const ROSTER_SORT_KEYS = Object.keys(SORT_ACCESSORS);

const STATUS_LABELS = Object.fromEntries(ROSTER_STATUS_OPTIONS.map((option) => [option.value, option.label]));

/** Distinct values of an enum column with how many rows carry each, in a sensible order. */
export function columnOptions(rows = [], key) {
  const definition = COLUMN_FILTERS[key];
  if (!definition || definition.kind !== 'enum') return [];
  const counts = new Map();
  rows.forEach((row) => {
    const value = String(definition.get(row));
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const label = (value) => (key === 'status' ? STATUS_LABELS[value] || value : value === '' ? 'Not set' : value);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => {
      if (key === 'status') return (STATUS_ORDER[a.value] ?? 99) - (STATUS_ORDER[b.value] ?? 99);
      if (a.value === '' || b.value === '') return a.value === '' ? 1 : -1;
      if (key === 'semester') return Number(a.value) - Number(b.value);
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
}

/**
 * Options for one class detail with counts that respect every OTHER active filter, so picking
 * "Branch: CSE" immediately shows which semesters, groups and courses still have candidates.
 */
export function facetOptions(rows = [], filters = DEFAULT_ROSTER_FILTERS, key) {
  const without = {
    ...filters,
    academic: { ...(filters.academic || {}), [key]: [] },
    columns: { ...(filters.columns || {}), [key]: undefined },
  };
  const options = columnOptions(filterRosterRows(rows, without), key);
  // A value that is selected but now has no candidates must stay visible so it can be unticked.
  (filters.academic?.[key] || []).forEach((value) => {
    if (!options.some((option) => option.value === value)) options.push({ value, label: value === '' ? 'Not set' : value, count: 0 });
  });
  return options;
}

/** One line per class detail value for the overview: candidates, finished, average, pass rate. */
export function groupBreakdown(rows = [], key, { passPercentage = null } = {}) {
  const groups = new Map();
  rows.forEach((row) => {
    const value = academicValue(row, key);
    const list = groups.get(value) || [];
    list.push(row);
    groups.set(value, list);
  });
  return [...groups.entries()]
    .map(([value, list]) => {
      const stats = computeRosterStats(list, { passPercentage });
      return {
        value,
        label: value === '' ? 'Not set' : value,
        candidates: stats.total,
        started: stats.started,
        finished: stats.finished,
        graded: stats.graded,
        avgPercentage: stats.avgPercentage,
        passRate: stats.passRate,
      };
    })
    .sort((a, b) => b.candidates - a.candidates || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** Page numbers to show: 1 2 3 4 5 … last, or 1 … 9 10 11 … last, or 1 … 38 39 40 41 42. */
export function pageWindow(current, total) {
  const last = Math.max(1, Number(total) || 1);
  const page = Math.min(Math.max(1, Number(current) || 1), last);
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap-end', last];
  if (page >= last - 3) return [1, 'gap-start', last - 4, last - 3, last - 2, last - 1, last];
  return [1, 'gap-start', page - 1, page, page + 1, 'gap-end', last];
}

/**
 * Stable sort by one column. Missing values always go last regardless of
 * direction; ties fall back to name, then key, so live updates never reshuffle
 * equal rows.
 */
export function sortRosterRows(rows = [], sort = { key: 'name', dir: 'asc' }) {
  const accessor = SORT_ACCESSORS[sort?.key] || SORT_ACCESSORS.name;
  const direction = sort?.dir === 'desc' ? -1 : 1;
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((a, b) => {
      const aMissing = a.value === null || a.value === undefined;
      const bMissing = b.value === null || b.value === undefined;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing) {
        const primary = compare(a.value, b.value) * direction;
        if (primary) return primary;
      }
      const byName = compare(textValue(a.row.name) || '', textValue(b.row.name) || '');
      if (byName) return byName;
      const byKey = compare(rosterRowKey(a.row), rosterRowKey(b.row));
      return byKey || a.index - b.index;
    })
    .map(({ row }) => row);
}

export function paginateRows(rows = [], page = 1, pageSize = 50) {
  const size = Math.max(1, Number(pageSize) || 50);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  return {
    page: safePage,
    totalPages,
    start: (safePage - 1) * size,
    rows: rows.slice((safePage - 1) * size, safePage * size),
  };
}

const round1 = (value) => Math.round(value * 10) / 10;

/** KPIs, distribution and outcome counts for the overview, all percentage based. */
export function computeRosterStats(rows = [], { passPercentage = null } = {}) {
  const stats = {
    total: rows.length,
    notStarted: 0,
    inProgress: 0,
    // finished = every candidate whose attempt has ended: submitted + expired + violation + incomplete.
    finished: 0,
    // Of those, by how the attempt ended (these four add up to `finished`).
    submitted: 0,
    expired: 0,
    violation: 0,
    incomplete: 0,
    // started = attempted = inProgress + finished.
    started: 0,
    graded: 0,
    evaluating: 0,
    needsReview: 0,
    passed: 0,
    failed: 0,
    late: 0,
    avgPercentage: null,
    minPercentage: null,
    maxPercentage: null,
    passRate: null,
    distribution: [0, 0, 0, 0],
    outcome: { passed: 0, failed: 0, graded: 0, evaluating: 0, needs_review: 0, in_progress: 0, not_started: 0 },
    flaggedSessions: 0,
    violationEvents: 0,
    tabSwitches: 0,
    fullscreenExits: 0,
    cameraFlags: 0,
    aiViolations: 0,
    avgTimeSec: null,
    topViolator: null,
  };
  const percentages = [];
  let timeTotal = 0;
  let timeCount = 0;

  for (const row of rows) {
    if (!row?.status || row.status === 'not_started') stats.notStarted += 1;
    else if (row.status === 'in_progress') stats.inProgress += 1;
    else {
      stats.finished += 1;
      if (row.status === 'submitted') stats.submitted += 1;
      else if (row.status === 'expired') stats.expired += 1;
      else if (row.status === 'violation') stats.violation += 1;
      else stats.incomplete += 1;
    }
    if (isSubmittedRow(row) && row.isLate) stats.late += 1;

    const evaluation = rowEvaluationState(row);
    if (evaluation === 'evaluating') stats.evaluating += 1;
    if (evaluation === 'needs_review') stats.needsReview += 1;
    if (evaluation === 'graded') {
      stats.graded += 1;
      const pct = rowPercentage(row);
      if (pct !== null) {
        percentages.push(pct);
        const bucket = pct <= 25 ? 0 : pct <= 50 ? 1 : pct <= 75 ? 2 : 3;
        stats.distribution[bucket] += 1;
      }
      const passed = rowPassed(row, passPercentage);
      if (passed === true) stats.passed += 1;
      if (passed === false) stats.failed += 1;
      const seconds = toNumberOrNull(row.timeTakenSec);
      if (seconds !== null && seconds > 0) { timeTotal += seconds; timeCount += 1; }
    }
    stats.outcome[rowOutcome(row, passPercentage)] += 1;

    const events = rowViolationCount(row);
    stats.violationEvents += events;
    stats.tabSwitches += Number(row.tabSwitches) || 0;
    stats.fullscreenExits += Number(row.fullscreenExits) || 0;
    stats.cameraFlags += Number(row.cameraFlags) || 0;
    stats.aiViolations += Number(row.aiViolationCount) || 0;
    if (row.flagged || rowHasViolations(row)) stats.flaggedSessions += 1;
    if (events > 0 && (!stats.topViolator || events > stats.topViolator.count)) {
      stats.topViolator = { name: row.name || 'Unknown', count: events, key: rosterRowKey(row) };
    }
  }

  stats.started = stats.inProgress + stats.finished;
  if (percentages.length) {
    stats.avgPercentage = round1(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
    stats.minPercentage = round1(Math.min(...percentages));
    stats.maxPercentage = round1(Math.max(...percentages));
  }
  // Pass rate is passed over graded; unknown when no graded row carries a pass decision.
  const decided = stats.passed + stats.failed;
  stats.passRate = decided && stats.graded ? round1((stats.passed / stats.graded) * 100) : null;
  stats.avgTimeSec = timeCount ? Math.round(timeTotal / timeCount) : null;
  return stats;
}

/** "3s ago" / "2m ago" style label for the live indicator. */
export function formatRelativeAge(timestamp, now = Date.now()) {
  if (timestamp === null || timestamp === undefined) return 'never';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
