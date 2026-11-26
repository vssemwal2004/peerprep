// Prep Mock exam patterns (2026-11-26): written by the admin per company + role, versioned by the
// month/year the company used them. A mock links to one and keeps a copy (Assessment.mockPattern),
// so editing a pattern updates the copy on every mock that uses it, and "save as a new version"
// leaves older mocks on the older pattern. The pattern is shown to students; it does not have to
// match the mock's questions exactly (the admin sees a warning instead).
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import PrepMockPattern, { PATTERN_SECTION_TYPES } from '../models/PrepMockPattern.js';
import { HttpError } from '../utils/errors.js';

export const PATTERN_LIMITS = Object.freeze({ maxRows: 30, maxQuestions: 500, maxMinutes: 1440, maxMarks: 10000 });

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const patternCompanyKey = (company) => clean(company, 120).toLowerCase();
export const patternRoleKey = (role) => clean(role, 80).toLowerCase();
const wholeNumber = (value, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(max, Math.round(number)) : 0;
};
const marksNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(PATTERN_LIMITS.maxMarks, Math.round(number * 100) / 100) : 0;
};

/** Month + year the company used the pattern; never in the future. */
export function patternMonth(value, now = new Date()) {
  const month = Number(value?.month);
  const year = Number(value?.year);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12 || year < 2000) return null;
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return null;
  return { month, year };
}

export function patternTotals(rows = []) {
  return rows.reduce((total, row) => ({
    questions: total.questions + (Number(row.questions) || 0),
    minutes: total.minutes + (Number(row.minutes) || 0),
    marks: Math.round((total.marks + (Number(row.marks) || 0)) * 100) / 100,
  }), { questions: 0, minutes: 0, marks: 0 });
}

/** Validated pattern fields from a request body, or an HttpError with a plain message. */
export function patternFields(body = {}, now = new Date()) {
  const company = clean(body.company, 120);
  const role = clean(body.role, 80);
  if (!company) throw new HttpError(400, 'Choose the company of this pattern.');
  if (!role) throw new HttpError(400, 'Choose the role of this pattern.');
  const patternFrom = patternMonth(body.patternFrom, now);
  if (!patternFrom) throw new HttpError(400, 'Choose the month and year the company used this pattern (not in the future).');
  const source = Array.isArray(body.rows) ? body.rows : [];
  if (!source.length) throw new HttpError(400, 'Add at least one section to the pattern.');
  if (source.length > PATTERN_LIMITS.maxRows) throw new HttpError(400, `A pattern can have up to ${PATTERN_LIMITS.maxRows} sections.`);
  const rows = source.map((row, index) => {
    const name = clean(row?.name, 80);
    if (!name) throw new HttpError(400, `Section ${index + 1} needs a name.`);
    return {
      name,
      type: PATTERN_SECTION_TYPES.includes(row?.type) ? row.type : 'mcq',
      questions: wholeNumber(row?.questions, PATTERN_LIMITS.maxQuestions),
      minutes: wholeNumber(row?.minutes, PATTERN_LIMITS.maxMinutes),
      marks: marksNumber(row?.marks),
    };
  });
  const seen = new Set();
  rows.forEach((row) => {
    const key = row.name.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, `Two sections are called "${row.name}". Give each section its own name.`);
    seen.add(key);
  });
  if (!rows.some((row) => row.questions > 0)) throw new HttpError(400, 'Add the number of questions for at least one section.');
  return { company, role, companyKey: patternCompanyKey(company), roleKey: patternRoleKey(role), patternFrom, rows, notes: clean(body.notes, 600) };
}

/** The copy a mock keeps. */
export function patternSnapshot(pattern) {
  if (!pattern) return null;
  const rows = (pattern.rows || []).map((row) => ({ name: row.name, type: row.type, questions: row.questions, minutes: row.minutes, marks: row.marks }));
  return {
    patternId: pattern._id,
    company: pattern.company,
    role: pattern.role,
    patternFrom: pattern.patternFrom ? { month: pattern.patternFrom.month, year: pattern.patternFrom.year } : null,
    rows,
    totals: patternTotals(rows),
    notes: pattern.notes || '',
    updatedAt: pattern.updatedAt || new Date(),
  };
}

const forAdmin = (pattern, usage = {}) => ({ ...patternSnapshot(pattern), _id: String(pattern._id), createdAt: pattern.createdAt, mocks: usage.mocks || 0, published: usage.published || 0 });

async function usageByPattern(ids) {
  if (!ids.length) return new Map();
  const rows = await Assessment.aggregate([
    { $match: { kind: 'mock', patternId: { $in: ids } } },
    { $group: { _id: '$patternId', mocks: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'published'] }, 1, 0] } } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

/** Patterns of one company + role, newest OA first, with how many mocks use each. */
export async function listPatterns({ company, role } = {}) {
  const companyKey = patternCompanyKey(company);
  const roleKey = patternRoleKey(role);
  const query = companyKey ? { companyKey, ...(roleKey ? { roleKey } : {}) } : {};
  const patterns = await PrepMockPattern.find(query).sort({ 'patternFrom.year': -1, 'patternFrom.month': -1, updatedAt: -1 }).limit(500).lean();
  const usage = await usageByPattern(patterns.map((pattern) => pattern._id));
  return { patterns: patterns.map((pattern) => forAdmin(pattern, usage.get(String(pattern._id)))), limits: PATTERN_LIMITS, types: PATTERN_SECTION_TYPES };
}

const duplicateMessage = (fields) => `${fields.company} · ${fields.role} already has a pattern for ${fields.patternFrom.month}/${fields.patternFrom.year}. Edit that one or choose another month.`;

export async function createPattern(body, user) {
  const fields = patternFields(body);
  try {
    const pattern = await PrepMockPattern.create({ ...fields, createdBy: user?._id, updatedBy: user?._id });
    return { pattern: forAdmin(pattern.toObject()) };
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, duplicateMessage(fields));
    throw error;
  }
}

/**
 * Edits a pattern and refreshes the copy on every mock that uses it. The company and role stay
 * the same (a pattern belongs to them); use a new pattern for another role.
 */
export async function updatePattern(id, body, user) {
  if (!mongoose.isValidObjectId(String(id || ''))) throw new HttpError(400, 'Pattern not found.');
  const existing = await PrepMockPattern.findById(id);
  if (!existing) throw new HttpError(404, 'Pattern not found.');
  const fields = patternFields({ ...body, company: existing.company, role: existing.role });
  Object.assign(existing, { patternFrom: fields.patternFrom, rows: fields.rows, notes: fields.notes, updatedBy: user?._id });
  try {
    await existing.save();
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, duplicateMessage(fields));
    throw error;
  }
  const snapshot = patternSnapshot(existing.toObject());
  const updated = await Assessment.updateMany({ kind: 'mock', patternId: existing._id }, { $set: { mockPattern: snapshot, patternFrom: snapshot.patternFrom } });
  const usage = await usageByPattern([existing._id]);
  return { pattern: forAdmin(existing.toObject(), usage.get(String(existing._id))), mocksUpdated: updated.modifiedCount || 0 };
}

export async function deletePattern(id) {
  if (!mongoose.isValidObjectId(String(id || ''))) throw new HttpError(400, 'Pattern not found.');
  const used = await Assessment.countDocuments({ kind: 'mock', patternId: id });
  if (used) throw new HttpError(409, `${used} mock${used === 1 ? ' uses' : 's use'} this pattern. Move ${used === 1 ? 'it' : 'them'} to another pattern first.`);
  const removed = await PrepMockPattern.findByIdAndDelete(id);
  if (!removed) throw new HttpError(404, 'Pattern not found.');
  return { deleted: true };
}

/**
 * The pattern copy for a mock of this company + role, or null when cleared. A pattern of another
 * company or role is refused, so a mock never shows somebody else's pattern.
 */
export async function patternForMock(patternId, { company, role }) {
  if (patternId === null || patternId === '') return null;
  if (!mongoose.isValidObjectId(String(patternId))) throw new HttpError(400, 'Choose a valid exam pattern.');
  const pattern = await PrepMockPattern.findById(patternId).lean();
  if (!pattern) throw new HttpError(400, 'That exam pattern no longer exists. Choose another one.');
  if (pattern.companyKey !== patternCompanyKey(company) || pattern.roleKey !== patternRoleKey(role)) {
    throw new HttpError(400, `This pattern is for ${pattern.company} · ${pattern.role}. Choose a pattern of ${clean(company, 120)} · ${clean(role, 80)}.`);
  }
  return patternSnapshot(pattern);
}
