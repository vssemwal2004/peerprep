// Performance report: one layout for an assessment and for a Quick Prep sheet.
// Pure functions only (no DB), so the maths is unit tested and every format
// (PDF, Excel, CSV) renders the exact same numbers.

/**
 * Marks bands, as a percentage of the maximum (assessment total marks, or the
 * sheet's question count). Upper edges are inclusive:
 *   0-25   : 0    <= p <= 25
 *   26-50  : 25   <  p <= 50
 *   51-75  : 50   <  p <= 75
 *   76-100 : 75   <  p <= 100
 * so exactly 25% is in 0-25 and 25.5% in 26-50. Values outside 0..100 are clamped.
 */
export const MARK_BANDS = Object.freeze([
  Object.freeze({ key: '0-25', label: '0–25%', max: 25 }),
  Object.freeze({ key: '26-50', label: '26–50%', max: 50 }),
  Object.freeze({ key: '51-75', label: '51–75%', max: 75 }),
  Object.freeze({ key: '76-100', label: '76–100%', max: 100 }),
]);

export const STATUS = Object.freeze({ COMPLETED: 'completed', ONGOING: 'ongoing', NOT_STARTED: 'not_started' });
export const STATUS_LABELS = Object.freeze({ completed: 'Completed', ongoing: 'Ongoing', not_started: 'Not started' });

const round1 = (value) => Math.round(value * 10) / 10;
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

/** Index into MARK_BANDS for a percentage, or -1 when there is no percentage. */
export function bandIndexOf(percent) {
  if (!finite(percent)) return -1;
  const value = Math.min(100, Math.max(0, Number(percent)));
  const index = MARK_BANDS.findIndex((band) => value <= band.max);
  return index === -1 ? MARK_BANDS.length - 1 : index;
}

export const bandOf = (percent) => MARK_BANDS[bandIndexOf(percent)] || null;

/** Share of a whole as a percentage with one decimal; 0 when the whole is 0. */
export const shareOf = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** Average, highest, lowest and median of a list of percentages (null without values). */
export function percentStats(values = []) {
  const list = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!list.length) return { count: 0, average: null, highest: null, lowest: null, median: null };
  const middle = Math.floor(list.length / 2);
  const median = list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  return {
    count: list.length,
    average: round1(list.reduce((sum, value) => sum + value, 0) / list.length),
    highest: round1(list[list.length - 1]),
    lowest: round1(list[0]),
    median: round1(median),
  };
}

/** Students per band (count and share of the banded students). */
export function bandDistribution(percents = []) {
  const counts = MARK_BANDS.map(() => 0);
  let base = 0;
  for (const percent of percents) {
    const index = bandIndexOf(percent);
    if (index < 0) continue;
    counts[index] += 1;
    base += 1;
  }
  return { base, bands: MARK_BANDS.map((band, index) => ({ key: band.key, label: band.label, count: counts[index], percent: shareOf(counts[index], base) })) };
}

/** The four summary tiles. `notStarted` is derived so the tiles always add up to the total. */
export function summaryTiles({ total = 0, completed = 0, ongoing = 0 } = {}) {
  const safeTotal = Math.max(Number(total) || 0, (Number(completed) || 0) + (Number(ongoing) || 0));
  const notStarted = safeTotal - (Number(completed) || 0) - (Number(ongoing) || 0);
  return [
    { key: 'total', label: 'Total', value: safeTotal, percent: safeTotal ? 100 : 0 },
    { key: STATUS.COMPLETED, label: STATUS_LABELS.completed, value: Number(completed) || 0, percent: shareOf(Number(completed) || 0, safeTotal) },
    { key: STATUS.ONGOING, label: STATUS_LABELS.ongoing, value: Number(ongoing) || 0, percent: shareOf(Number(ongoing) || 0, safeTotal) },
    { key: STATUS.NOT_STARTED, label: STATUS_LABELS.not_started, value: notStarted, percent: shareOf(notStarted, safeTotal) },
  ];
}

/** Student table columns (key, header, PDF width weight). Absent academic columns are dropped. */
const STUDENT_COLUMNS = [
  { key: 'name', label: 'Name', weight: 2 },
  { key: 'studentId', label: 'Student ID', weight: 1.2 },
  { key: 'email', label: 'Email', weight: 2.2 },
  { key: 'group', label: 'Section / group', weight: 1.2, optional: true },
  { key: 'branch', label: 'Branch', weight: 0.9, optional: true },
  { key: 'semester', label: 'Semester', weight: 0.9, optional: true },
  { key: 'statusLabel', label: 'Status', weight: 1.8 },
  { key: 'scoreText', label: 'Score', weight: 0.9 },
  { key: 'percent', label: '%', weight: 0.6, numeric: true },
  { key: 'band', label: 'Band', weight: 0.9 },
  { key: 'startedAt', label: 'Started', weight: 1.5, date: true },
  { key: 'finishedAt', label: 'Submitted', weight: 1.5, date: true },
];

const STATUS_ORDER = { completed: 0, ongoing: 1, not_started: 2 };

/**
 * Assembles the report every renderer draws.
 * input.students: [{ name, studentId, email, group, branch, semester, status, statusDetail,
 *   scoreText, percent, banded, startedAt, finishedAt }]; `banded` marks the
 *   students the band chart and averages are computed over (see bandNote).
 */
export function buildPerformanceReport({
  kind, title, university = '', windowLabel = '', generatedAt = new Date(), counts = {},
  students = [], bandNote = '', notes = [], scoreLabel = 'Score', finishedLabel = 'Submitted', meta = [],
} = {}) {
  const tiles = summaryTiles(counts);
  const rows = students.map((student) => {
    const band = student.banded ? bandOf(student.percent) : null;
    const percent = finite(student.percent) ? round1(Number(student.percent)) : null;
    return {
      ...student,
      percent,
      band: band ? band.label : '',
      statusLabel: student.statusDetail && student.statusDetail !== STATUS_LABELS[student.status]
        ? `${STATUS_LABELS[student.status] || student.status} (${student.statusDetail})`
        : STATUS_LABELS[student.status] || student.status || '',
    };
  }).sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
    || (b.percent ?? -1) - (a.percent ?? -1)
    || String(a.name || '').localeCompare(String(b.name || '')));
  const bandedPercents = students.filter((student) => student.banded).map((student) => student.percent);
  const distribution = bandDistribution(bandedPercents);
  const columns = STUDENT_COLUMNS
    .filter((column) => !column.optional || rows.some((row) => row[column.key] !== null && row[column.key] !== undefined && row[column.key] !== ''))
    .map((column) => ({ ...column, label: column.key === 'scoreText' ? scoreLabel : column.key === 'finishedAt' ? finishedLabel : column.label }));
  return {
    kind,
    kindLabel: kind === 'quickprep' ? 'Quick Prep' : 'Assessment',
    title: title || 'Untitled',
    university,
    windowLabel,
    generatedAt: new Date(generatedAt).toISOString(),
    meta,
    tiles,
    statusBars: tiles.slice(1),
    bands: distribution.bands,
    bandBase: distribution.base,
    bandNote,
    averages: percentStats(bandedPercents),
    columns,
    rows,
    notes,
  };
}

/** "13 Nov 2026, 14:05" in India time (reports are read by Indian universities). */
export function formatDateTime(value, { withTime = true } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

/** Table cell text for one column. */
export function cellText(row, column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  if (column.date) return formatDateTime(value);
  if (column.numeric) return Number(value).toFixed(1);
  return String(value);
}

export const percentText = (value) => (value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`);

/** A file name safe on every OS: "performance-report-<title>-<yyyy-mm-dd>.<ext>". */
export function reportFileName(report, extension) {
  const slug = String(report.title || 'report').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'report';
  return `performance-report-${slug}-${report.generatedAt.slice(0, 10)}.${extension}`;
}
