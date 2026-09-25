export const STUDENT_COLUMNS = ['name', 'email', 'studentid', 'branch', 'semester', 'course', 'college', 'group', 'teacherid'];

export function validateInterviewSetup({ title, description, startDate, endDate, template }, now = Date.now()) {
  if (!title.trim()) return 'Enter an interview name.';
  if (!description.trim()) return 'Add instructions for the students.';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Choose a start and end date.';
  if (start <= now) return 'The start date must be in the future.';
  if (end <= start) return 'The end date must be after the start date.';
  if (template?.size > 10 * 1024 * 1024) return 'The template must be 10 MB or smaller.';
  return '';
}

export function studentCsvRow(student) {
  return Object.fromEntries(STUDENT_COLUMNS.map((key) => [key,
    key === 'studentid' ? student.studentId || student.studentid || ''
      : key === 'teacherid' ? student.teacherid || student.teacherIds?.[0] || String(student.teacherId || '').split(',')[0].trim()
        : student[key] ?? '',
  ]));
}

export function serializeStudents(rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [STUDENT_COLUMNS.join(','), ...rows.map((student) => {
    const row = studentCsvRow(student);
    return STUDENT_COLUMNS.map((key) => escape(row[key])).join(',');
  })].join('\r\n');
}

export function studentCsvFile(rows) {
  return new File([serializeStudents(rows)], 'interview-students.csv', { type: 'text/csv' });
}

// Quoted fields, escaped quotes, BOMs and spreadsheet header aliases are supported.
export function parseStudentCsv(text) {
  const records = [];
  let cells = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      cells.push(cell.trim());
      if (cells.some(Boolean)) records.push(cells);
      cells = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  cells.push(cell.trim());
  if (cells.some(Boolean)) records.push(cells);
  const aliases = { studentname: 'name', emailid: 'email', emailaddress: 'email', coordinatorid: 'teacherid', coordinatorcode: 'teacherid', teacheridcoordinatorcode: 'teacherid' };
  const headers = (records.shift() || []).map((value) => {
    const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return aliases[key] || key;
  });
  if (!headers.includes('email') && !headers.includes('studentid')) throw new Error('Include an Email or Student ID column.');
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column headings.');
  if (!records.length) throw new Error('The CSV does not contain any students.');
  if (records.length > 1000) throw new Error('Upload up to 1,000 students per file.');
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index + 2} has a different number of columns. Check commas and quotes.`);
    return Object.fromEntries(headers.map((key, column) => [key, values[column]]));
  });
}

export function mergeInterviewStudents(selected, incoming) {
  const seen = new Set(selected.map((student) => String(student._id)));
  return [...selected, ...incoming.filter((student) => {
    if (!student._id || seen.has(String(student._id))) return false;
    seen.add(String(student._id));
    return true;
  })];
}

export function interviewStatus(event, now = Date.now()) {
  if (['draft', 'cancelled', 'archived', 'completed'].includes(event.status)) return event.status;
  if (new Date(event.endDate).getTime() < now) return 'completed';
  if (new Date(event.startDate).getTime() > now) return 'scheduled';
  if (new Date(event.startDate).getTime() <= now && new Date(event.endDate).getTime() >= now) return 'live';
  return event.status || 'published';
}
