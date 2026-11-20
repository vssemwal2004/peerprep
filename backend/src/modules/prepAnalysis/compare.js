// "Compare": the students in view split by one class dimension (Section, Group, Campus, Branch,
// Semester or Course), 2–8 chosen values side by side. Every figure is read from the same
// per-student rows as the rest of the page (studentRows.js); nothing new is loaded.

import { HttpError } from '../../utils/errors.js';

export const COMPARE_LIMITS = Object.freeze({ minValues: 2, maxValues: 8, maxValueLength: 120, maxStudents: 5000 });

const text = (read) => (row) => String(read(row) ?? '').trim();
export const COMPARE_DIMENSIONS = Object.freeze({
  section: { label: 'Section', options: 'sections', field: 'student.section', get: text((row) => row.student.section) },
  group: { label: 'Group', options: 'groups', field: 'student.group', get: text((row) => row.student.group) },
  college: { label: 'Campus', options: 'colleges', field: 'student.college', get: text((row) => row.student.college) },
  branch: { label: 'Branch', options: 'branches', field: 'student.branch', get: text((row) => row.student.branch) },
  semester: {
    label: 'Semester', options: 'semesters', field: 'student.semester', numeric: true,
    get: (row) => row.student.semester, valueLabel: (value) => `Semester ${value}`,
  },
  course: { label: 'Course', options: 'courses', field: 'student.course', get: text((row) => row.student.course) },
});

/** The key two values match on: numbers for semesters, trimmed lowercase text otherwise. */
const keyOf = (dimension, value) => (dimension.numeric ? String(Number(value)) : String(value ?? '').trim().toLowerCase());

/** `compareBy`: { dimension, values }, checked. Values keep the admin's order, without repeats. */
export function validateCompareBy(input, { minValues = COMPARE_LIMITS.minValues } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Choose what to compare.');
  const key = String(input.dimension || '');
  if (!Object.hasOwn(COMPARE_DIMENSIONS, key)) throw new HttpError(400, 'Unknown comparison. Choose Section, Group, Campus, Branch, Semester or Course.');
  const dimension = COMPARE_DIMENSIONS[key];
  if (!Array.isArray(input.values)) throw new HttpError(400, 'Choose the values to compare.');
  if (input.values.length > COMPARE_LIMITS.maxValues) throw new HttpError(400, `Compare up to ${COMPARE_LIMITS.maxValues} values at a time.`);
  const seen = new Set();
  const values = [];
  for (const raw of input.values) {
    let value;
    if (dimension.numeric) {
      value = Number.parseInt(raw, 10);
      if (!Number.isInteger(value) || value < 1 || value > 12) continue;
    } else {
      value = String(raw ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, COMPARE_LIMITS.maxValueLength);
      if (!value) continue;
    }
    const valueKey = keyOf(dimension, value);
    if (seen.has(valueKey)) continue;
    seen.add(valueKey);
    values.push(value);
  }
  if (values.length < minValues) throw new HttpError(400, minValues === 1 ? 'Choose a value.' : `Pick at least ${minValues} different values to compare.`);
  return { dimension: key, values };
}

/** `compareBy`: { dimension, value } for the students behind one compared value. */
export function validateCompareValue(input) {
  const checked = validateCompareBy({ dimension: input?.dimension, values: [input?.value] }, { minValues: 1 });
  return { dimension: checked.dimension, value: checked.values[0] };
}

// ---------------------------------------------------------------- measures

const round1 = (value) => Math.round(value * 10) / 10;
const count = (rows, test) => rows.filter(test).length;
const sum = (rows, read) => rows.reduce((total, row) => total + (Number(read(row)) || 0), 0);
const average = (values) => (values.length ? round1(values.reduce((total, value) => total + value, 0) / values.length) : null);
const percent = (part, whole) => (whole ? round1((part / whole) * 100) : null);

/** Any recorded activity inside the period, in a feature this university has. */
export function activeInPeriod(row, modules) {
  return Boolean((modules.has('coding') && row.coding?.submissions > 0)
    || (modules.has('quickprep') && row.quickprep?.days?.size > 0)
    || (modules.has('learning') && (row.learning?.days?.size > 0 || row.learning?.completedTopics > 0))
    || (modules.has('interview') && row.interview?.done > 0)
    || (modules.has('assessment') && row.assessment?.taken > 0)
    || (modules.has('prepmock') && row.prepmock?.taken > 0));
}

// `better`: which way is good ('high' / 'low'), or null when neither (no best / worst marked).
// `module` 'student' measures are always shown; the others only for their feature.
const METRICS = [
  { key: 'students', label: 'Students', module: 'student', format: 'count', better: null, get: (rows) => rows.length },
  { key: 'active', label: 'Active in period', module: 'student', format: 'count', better: 'high', get: (rows, modules) => count(rows, (row) => activeInPeriod(row, modules)) },
  { key: 'activeShare', label: 'Active in period (%)', module: 'student', format: 'percent', better: 'high', get: (rows, modules) => percent(count(rows, (row) => activeInPeriod(row, modules)), rows.length) },
  { key: 'prepScore', label: 'Avg Prep Score', module: 'student', format: 'decimal', better: 'high', get: (rows) => average(rows.map((row) => row.scores?.total ?? 0)) },

  { key: 'codingPractising', label: 'Practised coding', module: 'coding', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.coding.submissions > 0) },
  { key: 'solved', label: 'Problems solved', module: 'coding', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.coding.solved.total) },
  { key: 'solvedEasy', label: 'Easy solved', module: 'coding', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.coding.solved.Easy) },
  { key: 'solvedMedium', label: 'Medium solved', module: 'coding', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.coding.solved.Medium) },
  { key: 'solvedHard', label: 'Hard solved', module: 'coding', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.coding.solved.Hard) },
  { key: 'solvedPerStudent', label: 'Solved per student', module: 'coding', format: 'decimal', better: 'high', get: (rows) => (rows.length ? round1(sum(rows, (row) => row.coding.solved.total) / rows.length) : null) },
  { key: 'accuracy', label: 'Accuracy (%)', module: 'coding', format: 'percent', better: 'high', get: (rows) => percent(sum(rows, (row) => row.coding.accepted), sum(rows, (row) => row.coding.submissions)) },

  { key: 'sheetStarters', label: 'Started a sheet', module: 'quickprep', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.quickprep?.started > 0) },
  { key: 'sheetFinishers', label: 'Finished a sheet', module: 'quickprep', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.quickprep?.finished > 0) },
  { key: 'sheetQuestions', label: 'Sheet questions solved', module: 'quickprep', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.quickprep?.solved) },
  { key: 'sheetProgress', label: 'Avg sheet progress (%)', module: 'quickprep', format: 'percent', better: 'high', get: (rows) => average(rows.filter((row) => row.quickprep?.started > 0).map((row) => row.quickprep.progress)) },

  { key: 'learningActive', label: 'Learned in period', module: 'learning', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.learning?.days?.size > 0 || row.learning?.completedTopics > 0) },
  { key: 'topicsCompleted', label: 'Topics completed', module: 'learning', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.learning?.completedTopics) },
  { key: 'learningProgress', label: 'Avg course completed (%)', module: 'learning', format: 'percent', better: 'high', get: (rows) => average(rows.filter((row) => row.learning).map((row) => row.learning.progress)) },

  { key: 'interviewed', label: 'Interviewed', module: 'interview', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.interview?.done > 0) },
  { key: 'interviewsDone', label: 'Interviews done', module: 'interview', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.interview?.done) },
  { key: 'mockScore', label: 'Avg mock score (%)', module: 'interview', format: 'percent', better: 'high', get: (rows) => average(rows.filter((row) => row.interview?.mockDone > 0).map((row) => row.interview.mockScore)) },

  { key: 'testTakers', label: 'Took a test', module: 'assessment', format: 'count', better: 'high', get: (rows) => count(rows, (row) => row.assessment?.taken > 0) },
  { key: 'testsTaken', label: 'Test attempts', module: 'assessment', format: 'count', better: 'high', get: (rows) => sum(rows, (row) => row.assessment?.taken) },
  { key: 'testAverage', label: 'Avg test score (%)', module: 'assessment', format: 'percent', better: 'high', get: (rows) => average(rows.filter((row) => row.assessment?.taken > 0).map((row) => row.assessment.averageScore)) },
  { key: 'passRate', label: 'Pass rate (%)', module: 'assessment', format: 'percent', better: 'high', get: (rows) => percent(sum(rows, (row) => row.assessment?.passed), sum(rows, (row) => row.assessment?.taken)) },
  { key: 'testsMissed', label: 'Tests missed', module: 'assessment', format: 'count', better: 'low', get: (rows) => sum(rows, (row) => row.assessment?.missed) },
];
METRICS.push(...METRICS.filter((metric) => metric.module === 'assessment').map((metric) => ({
  ...metric,
  key: `mock${metric.key[0].toUpperCase()}${metric.key.slice(1)}`,
  label: metric.label.replace(/tests?/gi, (match) => match.toLowerCase().endsWith('s') ? 'mocks' : 'mock'),
  module: 'prepmock',
  get: (rows) => metric.get(rows.map((row) => ({ ...row, assessment: row.prepmock }))),
})));

const MODULE_LABELS = { student: 'Students', coding: 'Prep Coding', quickprep: 'Quick Prep', learning: 'Prep Learning', interview: 'Prep Interview', assessment: 'Prep Assessment', prepmock: 'PrepMock' };

// Grouped bar charts: one group of bars per compared value, one bar per measure.
const CHARTS = [
  { id: 'students', title: 'Students and active students', metrics: ['students', 'active'] },
  { id: 'scores', title: 'Average Prep Score', metrics: ['prepScore'] },
  { id: 'solved', title: 'Problems solved by difficulty', metrics: ['solvedEasy', 'solvedMedium', 'solvedHard'], stack: true },
  { id: 'rates', title: 'Rates and averages (%)', metrics: ['activeShare', 'accuracy', 'sheetProgress', 'learningProgress', 'mockScore', 'testAverage', 'passRate', 'mockTestAverage', 'mockPassRate'] },
  { id: 'quickprep', title: 'Quick Prep sheets', metrics: ['sheetStarters', 'sheetFinishers'] },
  { id: 'learning', title: 'Topics completed', metrics: ['topicsCompleted'] },
  { id: 'interview', title: 'Interviews', metrics: ['interviewed', 'interviewsDone'] },
  { id: 'assessment', title: 'Tests', metrics: ['testTakers', 'testsTaken'] },
  { id: 'prepmock', title: 'Mocks', metrics: ['mockTestTakers', 'mockTestsTaken'] },
];

/** The measures for an area: student measures, then each licensed feature of the area. */
export function compareMetricsFor(area, modules) {
  return METRICS.filter((metric) => metric.module === 'student' || (modules.has(metric.module) && (area === 'all' || metric.module === area)));
}

/** Index of the best and worst value (null when they are all equal or fewer than two have a value). */
function extremes(values, better) {
  if (!better) return { best: null, worst: null };
  const present = values.map((value, index) => ({ value, index })).filter((entry) => typeof entry.value === 'number');
  if (present.length < 2) return { best: null, worst: null };
  const sorted = [...present].sort((left, right) => left.value - right.value);
  if (sorted[0].value === sorted.at(-1).value) return { best: null, worst: null };
  const [low, high] = [sorted[0].index, sorted.at(-1).index];
  return better === 'low' ? { best: low, worst: high } : { best: high, worst: low };
}

/** The selected rows split by the chosen values, in the admin's order. */
export function compareBuckets(rows, compareBy) {
  const dimension = COMPARE_DIMENSIONS[compareBy.dimension];
  const buckets = compareBy.values.map((value) => ({ value, label: dimension.valueLabel ? dimension.valueLabel(value) : String(value), rows: [] }));
  const byKey = new Map(buckets.map((bucket) => [keyOf(dimension, bucket.value), bucket]));
  for (const row of rows) {
    const raw = dimension.get(row);
    if (raw === null || raw === undefined || raw === '') continue;
    byKey.get(keyOf(dimension, raw))?.rows.push(row);
  }
  return buckets;
}

/**
 * The comparison table and charts: { dimension, columns, total, metrics, charts }. Every count
 * of "All selected" is the sum over the values: a student has one value per dimension.
 */
export function buildComparison({ rows, compareBy, area, modules }) {
  const dimension = COMPARE_DIMENSIONS[compareBy.dimension];
  const buckets = compareBuckets(rows, compareBy);
  const everyone = buckets.flatMap((bucket) => bucket.rows);
  const metrics = compareMetricsFor(area, modules).map((metric) => {
    const values = buckets.map((bucket) => metric.get(bucket.rows, modules));
    return {
      key: metric.key, label: metric.label, module: metric.module, moduleLabel: MODULE_LABELS[metric.module], format: metric.format, better: metric.better,
      values, total: metric.get(everyone, modules), ...extremes(values, metric.better),
    };
  });
  const shown = new Set(metrics.map((metric) => metric.key));
  return {
    dimension: { key: compareBy.dimension, label: dimension.label, field: dimension.field },
    columns: buckets.map((bucket) => ({ value: bucket.value, label: bucket.label, students: bucket.rows.length })),
    total: { label: 'All selected', students: everyone.length },
    metrics,
    charts: CHARTS.map((chart) => ({ ...chart, metrics: chart.metrics.filter((key) => shown.has(key)) }))
      .filter((chart) => chart.metrics.length),
  };
}

/** The comparison as a download report (see prepAnalysis.export.js renderCsv / renderXlsx). */
export function comparisonReport(comparison, { title, details, filters, generatedAt = new Date() }) {
  const columns = [
    { key: 'feature', label: 'Feature', width: 16, group: 'Comparison' },
    { key: 'measure', label: 'Measure', width: 28, group: 'Comparison' },
    ...comparison.columns.map((column, index) => ({ key: `v${index}`, label: column.label, width: 14, group: comparison.dimension.label })),
    { key: 'total', label: comparison.total.label, width: 14, group: 'Comparison' },
  ];
  return {
    title, generatedAt, details, filters, truncated: false, columns, sheetName: 'Comparison',
    rows: comparison.metrics.map((metric) => [metric.moduleLabel, metric.label, ...metric.values, metric.total]),
  };
}
