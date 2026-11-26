// Pure helpers for "who sees this announcement" (no imports, so node tests can load it).

export const UPLOAD_TEMPLATE_HEADERS = ['name', 'email', 'semester', 'college', 'branch'];
export const UPLOAD_TEMPLATE_CSV = `${UPLOAD_TEMPLATE_HEADERS.join(',')}\r\nAarav Sharma,aarav.sharma@example.edu,5,Main Campus,CSE\r\nDiya Verma,diya.verma@example.edu,,,\r\n`;
export const UPLOAD_STATUSES = [
  { key: 'all', label: 'All rows' },
  { key: 'matched', label: 'Registered' },
  { key: 'not_found', label: 'Not registered' },
  { key: 'invalid', label: 'Needs fixing' },
  { key: 'duplicate', label: 'Duplicates' },
];

const idOf = (student) => String(student?._id || student?.id || '');

/** Adds students not already chosen (keeps the order: existing first). */
export function mergeStudents(current = [], additions = []) {
  const seen = new Set(current.map(idOf));
  const added = [];
  additions.forEach((student) => {
    const id = idOf(student);
    if (id && !seen.has(id)) { seen.add(id); added.push(student); }
  });
  return added.length ? [...current, ...added] : current;
}

export function removeStudents(current = [], ids = []) {
  const drop = new Set(ids.map(String));
  return current.filter((student) => !drop.has(idOf(student)));
}

/** A row's value for a filter: the file's value, else the registered student's. */
export function rowValue(row, key) {
  const own = String(row?.[key] ?? '').trim();
  if (own) return own;
  const value = row?.student?.[key];
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Options for the semester / branch / college filters of an uploaded list. */
export function uploadFilterOptions(rows = []) {
  const collect = (key) => [...new Set(rows.map((row) => rowValue(row, key)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return { semester: collect('semester'), branch: collect('branch'), college: collect('college') };
}

/** Rows shown for the chosen status tab, search and filters. */
export function filterUploadRows(rows = [], { status = 'all', query = '', semester = '', branch = '', college = '' } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (semester && rowValue(row, 'semester') !== semester) return false;
    if (branch && rowValue(row, 'branch').toLowerCase() !== branch.toLowerCase()) return false;
    if (college && rowValue(row, 'college').toLowerCase() !== college.toLowerCase()) return false;
    if (!needle) return true;
    return [row.name, row.email, row.student?.name, row.student?.studentId].some((value) => String(value || '').toLowerCase().includes(needle));
  });
}

/** One CSV cell, safe to open in Excel (no formulas). */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The rows that could not be used, as a CSV to fix and upload again. */
export function problemRowsCsv(rows = []) {
  const lines = [['row', ...UPLOAD_TEMPLATE_HEADERS, 'problem'].join(',')];
  rows.filter((row) => row.status !== 'matched').forEach((row) => {
    lines.push([row.row, row.name, row.email, row.semester, row.college, row.branch, row.reason].map(csvCell).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
}

/** "All students" / "12 selected students" for summaries. */
export function audienceLabel(audience, count = 0) {
  if (audience !== 'selected') return 'All students';
  return `${Number(count || 0).toLocaleString('en-US')} selected student${count === 1 ? '' : 's'}`;
}

/** Search inside the chosen list. */
export function searchStudents(students = [], query = '') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return students;
  return students.filter((student) => [student.name, student.email, student.studentId, student.branch].some((value) => String(value || '').toLowerCase().includes(needle)));
}
