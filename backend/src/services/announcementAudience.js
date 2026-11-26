// Who sees an announcement (2026-11-26): every student, or only chosen students. Students are
// chosen from the registered list (with filters) or from an uploaded CSV/Excel file
// (name + email required; semester, college, branch optional) matched to registered students by
// email. Everyone works inside their own rights: an "own data" coordinator can only choose, see
// and match their own students, and never learns whether an email belongs to someone else's student.
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Papa from 'papaparse';
import User from '../models/User.js';
import { hasCoordinatorPermission } from './coordinatorPermissions.js';
import { HttpError } from '../utils/errors.js';

export const AUDIENCE_LIMITS = Object.freeze({ maxStudents: 20000, maxUploadRows: 10000, maxUploadBytes: 2 * 1024 * 1024, maxCell: 200 });
export const AUDIENCES = Object.freeze(['all', 'selected']);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_FIELDS = 'name email studentId semester branch course college section';

/** Students this user may reach: all of them, or only their own for "own data" coordinators. */
export function studentScopeFor(user = {}) {
  return user?.role === 'coordinator' && user.coordinatorDataScope !== 'all'
    ? { role: 'student', teacherIds: user.coordinatorId }
    : { role: 'student' };
}

/** Choosing students means seeing them: coordinators need the "view students" right. */
export function assertCanChooseStudents(user) {
  if (user?.role === 'coordinator' && !hasCoordinatorPermission(user, 'coordinator.students.view')) {
    throw new HttpError(403, 'You need permission to view students to choose who sees this announcement.');
  }
}

const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

/** Unique valid ids, or a clear error (never a silent cut). */
export function validAudienceIds(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Choose the students who should see this announcement.');
  const ids = [...new Set(value.map((id) => String(id || '').trim()).filter((id) => mongoose.isValidObjectId(id)))];
  if (!ids.length) throw new HttpError(400, 'Choose at least one student who should see this announcement.');
  if (ids.length > AUDIENCE_LIMITS.maxStudents) {
    throw new HttpError(400, `An announcement can go to up to ${AUDIENCE_LIMITS.maxStudents.toLocaleString('en-US')} chosen students. Choose "All students" for more.`);
  }
  return ids;
}

/**
 * The audience fields to save from a create/update body.
 * - `audience: 'all'` clears the chosen students.
 * - `audience: 'selected'` keeps only real students this user may reach.
 * - On an update by an "own data" coordinator, students chosen earlier by someone with wider
 *   rights (which this coordinator cannot see) are kept, so an edit never removes them silently.
 * Returns {} when the body does not touch the audience (partial updates).
 */
export async function audienceFromBody(body = {}, user = {}, { existing = null } = {}) {
  if (body.audience === undefined || body.audience === null || body.audience === '') return existing ? {} : { audience: 'all', studentIds: [] };
  const audience = String(body.audience);
  if (!AUDIENCES.includes(audience)) throw new HttpError(400, 'Choose who sees this: all students or selected students.');
  if (audience === 'all') return { audience: 'all', studentIds: [] };

  assertCanChooseStudents(user);
  const ids = validAudienceIds(body.studentIds);
  const scope = studentScopeFor(user);
  const reachable = await User.find({ ...scope, _id: { $in: toObjectIds(ids) } }).select('_id').lean();
  const chosen = reachable.map((row) => String(row._id));

  let hidden = [];
  const earlier = (existing?.studentIds || []).map(String);
  if (earlier.length && scope.teacherIds !== undefined) {
    const visible = new Set((await User.find({ ...scope, _id: { $in: toObjectIds(earlier) } }).select('_id').lean()).map((row) => String(row._id)));
    hidden = earlier.filter((id) => !visible.has(id));
  }
  const studentIds = [...new Set([...chosen, ...hidden])];
  if (!chosen.length && !hidden.length) throw new HttpError(400, 'None of the chosen students could be found. Choose the students again.');
  if (studentIds.length > AUDIENCE_LIMITS.maxStudents) throw new HttpError(400, `An announcement can go to up to ${AUDIENCE_LIMITS.maxStudents.toLocaleString('en-US')} chosen students.`);
  return { audience: 'selected', studentIds: toObjectIds(studentIds), skipped: ids.length - chosen.length };
}

const studentCard = (student) => ({
  _id: String(student._id), name: student.name || '', email: student.email || '', studentId: student.studentId || '',
  semester: student.semester ?? null, branch: student.branch || '', course: student.course || '', college: student.college || '', section: student.section || '',
});

/** The chosen students of one announcement that this user may see, plus how many others are hidden. */
export async function audienceStudents(announcement, user) {
  assertCanChooseStudents(user);
  if (announcement?.audience !== 'selected') return { audience: 'all', students: [], hiddenCount: 0 };
  const ids = (announcement.studentIds || []).map(String);
  const students = ids.length
    ? await User.find({ ...studentScopeFor(user), _id: { $in: toObjectIds(ids) } }).select(STUDENT_FIELDS).sort({ name: 1 }).lean()
    : [];
  return { audience: 'selected', students: students.map(studentCard), hiddenCount: Math.max(0, ids.length - students.length) };
}

// ---- Upload: CSV / Excel list matched to registered students ----------------------------------

const HEADER_ALIASES = {
  name: ['name', 'studentname', 'fullname'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'mailid', 'studentemail'],
  semester: ['semester', 'sem'],
  college: ['college', 'campus', 'collegename'],
  branch: ['branch', 'department', 'dept', 'stream'],
};
const headerKey = (value) => {
  const flat = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.keys(HEADER_ALIASES).find((key) => HEADER_ALIASES[key].includes(flat)) || null;
};

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    if (value.hyperlink) return String(value.hyperlink).replace(/^mailto:/i, '');
    return '';
  }
  return String(value);
}

const clean = (value) => cellText(value).replace(/\s+/g, ' ').trim().slice(0, AUDIENCE_LIMITS.maxCell);

/** Rows from a CSV text: [[cells]]. */
export function csvMatrix(text) {
  const BOM = String.fromCharCode(0xfeff);
  const source = String(text || '');
  const parsed = Papa.parse(source.startsWith(BOM) ? source.slice(1) : source, { skipEmptyLines: 'greedy' });
  return parsed.data;
}

async function xlsxMatrix(buffer) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new HttpError(400, 'This Excel file could not be read. Save it again as .xlsx or .csv and upload it.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const matrix = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (matrix.length > AUDIENCE_LIMITS.maxUploadRows + 1) return;
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values.map(cellText));
  });
  return matrix;
}

/** Reads a CSV or .xlsx upload into [[cells]]. */
export async function readUploadMatrix(file) {
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose a CSV or Excel file to upload.');
  const name = String(file.originalname || '').toLowerCase();
  const isZip = file.buffer.length > 3 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04;
  if (name.endsWith('.xlsx') || isZip) {
    if (!isZip) throw new HttpError(400, 'This is not a valid .xlsx file. Upload the CSV template instead.');
    return xlsxMatrix(file.buffer);
  }
  if (name.endsWith('.xls')) throw new HttpError(400, 'Old .xls files are not supported. Save the sheet as .xlsx or .csv.');
  if (file.buffer.includes(0)) throw new HttpError(400, 'Upload a CSV (.csv) or Excel (.xlsx) file.');
  return csvMatrix(file.buffer.toString('utf8'));
}

/** Header check and per-row reading (no database): [{ row, name, email, semester, college, branch, problem }]. */
export function uploadRowsFrom(matrix) {
  const [header = [], ...body] = matrix;
  const columns = header.map(headerKey);
  const missing = ['name', 'email'].filter((key) => !columns.includes(key));
  if (missing.length) {
    throw new HttpError(400, `The file needs ${missing.map((key) => (key === 'name' ? '"name"' : '"email"')).join(' and ')} column${missing.length > 1 ? 's' : ''} in the first row. Download the template and fill it in.`);
  }
  const rows = body.filter((cells) => cells.some((cell) => clean(cell)));
  if (!rows.length) throw new HttpError(400, 'The file has no student rows under the header.');
  if (rows.length > AUDIENCE_LIMITS.maxUploadRows) {
    throw new HttpError(400, `Upload up to ${AUDIENCE_LIMITS.maxUploadRows.toLocaleString('en-US')} students at a time (this file has ${rows.length.toLocaleString('en-US')}).`);
  }
  const at = (cells, key) => { const index = columns.indexOf(key); return index < 0 ? '' : clean(cells[index]); };
  const seen = new Set();
  return rows.map((cells, index) => {
    const row = { row: index + 2, name: at(cells, 'name'), email: at(cells, 'email').toLowerCase().replace(/^mailto:/, ''), semester: at(cells, 'semester'), college: at(cells, 'college'), branch: at(cells, 'branch') };
    if (!row.name && !row.email) row.problem = 'Name and email are missing';
    else if (!row.email) row.problem = 'Email is missing';
    else if (!EMAIL.test(row.email)) row.problem = 'Email is not valid';
    else if (!row.name) row.problem = 'Name is missing';
    else if (seen.has(row.email)) row.problem = 'duplicate';
    if (row.email && !row.problem) seen.add(row.email);
    return row;
  });
}

const sameName = (a, b) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim() === String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Registered students (within this user's rights) for these lower-case emails, by email. */
async function studentsByEmail(emails, user) {
  const scope = studentScopeFor(user);
  const found = new Map();
  for (let start = 0; start < emails.length; start += 2000) {
    const chunk = emails.slice(start, start + 2000);
    const rows = await User.find({ ...scope, email: { $in: chunk } }).select(STUDENT_FIELDS).lean();
    rows.forEach((student) => found.set(String(student.email).toLowerCase(), student));
  }
  // Older accounts may keep capitals in their stored email: one case-insensitive pass for the rest.
  const rest = emails.filter((email) => !found.has(email));
  if (rest.length) {
    const rows = await User.aggregate([
      { $match: scope },
      { $project: { name: 1, email: 1, studentId: 1, semester: 1, branch: 1, course: 1, college: 1, section: 1, lower: { $toLower: { $ifNull: ['$email', ''] } } } },
      { $match: { lower: { $in: rest } } },
      { $limit: rest.length },
    ]);
    rows.forEach((student) => { if (!found.has(student.lower)) found.set(student.lower, student); });
  }
  return found;
}

/**
 * Matches an uploaded list to registered students by email.
 * status: matched | not_found (no registered student of yours with that email) | invalid | duplicate.
 */
export async function matchAudienceUpload(file, user) {
  assertCanChooseStudents(user);
  const rows = uploadRowsFrom(await readUploadMatrix(file));
  const emails = [...new Set(rows.filter((row) => !row.problem).map((row) => row.email))];
  const found = await studentsByEmail(emails, user);
  const out = rows.map((row) => {
    if (row.problem === 'duplicate') return { ...row, problem: undefined, status: 'duplicate', reason: 'Same email appears earlier in the file' };
    if (row.problem) return { ...row, problem: undefined, status: 'invalid', reason: row.problem };
    const student = found.get(row.email);
    if (!student) return { ...row, status: 'not_found', reason: 'No registered student with this email' };
    return { ...row, status: 'matched', nameDiffers: !sameName(row.name, student.name), student: studentCard(student) };
  });
  const count = (status) => out.filter((row) => row.status === status).length;
  return {
    fileName: String(file.originalname || 'upload').slice(0, 120),
    totals: { rows: out.length, matched: count('matched'), notFound: count('not_found'), invalid: count('invalid'), duplicate: count('duplicate') },
    rows: out,
  };
}
