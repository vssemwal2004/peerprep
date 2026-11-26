// Prep Mock exam pattern: one model for the admin form, the admin workspace and the student page,
// so the table a student sees is exactly what the admin built. Pure (no imports) for the tests.
//
// Questions and marks always come from the mock's real sections; the admin adds section names, a
// suggested time per section (guidance only — the test enforces just the total duration) and the
// month + year the company used this OA pattern.

export const PATTERN_MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

/** Years an admin can pick: this year back to 2015, newest first. */
export function patternYears(now = new Date(), from = 2015) {
  const years = [];
  for (let year = now.getFullYear(); year >= from; year -= 1) years.push(year);
  return years;
}

/** "Mar 2025" (or the long month), or '' when not set. */
export function formatPatternFrom(patternFrom, { long = false } = {}) {
  const month = Number(patternFrom?.month);
  const year = Number(patternFrom?.year);
  if (!month || !year || month < 1 || month > 12) return '';
  const name = PATTERN_MONTHS[month - 1];
  return `${long ? name : name.slice(0, 3)} ${year}`;
}

const TYPE_LABEL = { mcq: 'MCQ', coding: 'Coding', short: 'Short answer', one_line: 'One line', mixed: 'Mixed' };
export const PATTERN_TYPES = Object.freeze(['mcq', 'coding', 'one_line', 'short', 'mixed']);

/**
 * The admin-written pattern of a company + role (PrepMockPattern / Assessment.mockPattern):
 * { rows: [{ name, type, questions, minutes, marks }], patternFrom, totals? } → table rows + totals.
 * Totals are always recomputed from the rows.
 */
export function writtenPattern(pattern) {
  const rows = (Array.isArray(pattern?.rows) ? pattern.rows : []).map((row, index) => ({
    name: String(row?.name || '').trim() || `Section ${index + 1}`,
    type: PATTERN_TYPES.includes(row?.type) ? row.type : 'mcq',
    questions: Math.max(0, Math.round(number(row?.questions))),
    minutes: Math.max(0, Math.round(number(row?.minutes))),
    marks: Math.max(0, Math.round(number(row?.marks) * 100) / 100),
  }));
  const totals = rows.reduce((total, row) => ({
    questions: total.questions + row.questions,
    minutes: total.minutes + row.minutes,
    marks: Math.round((total.marks + row.marks) * 100) / 100,
  }), { questions: 0, minutes: 0, marks: 0 });
  return { rows, totals, hasTimes: rows.some((row) => row.minutes > 0), patternFrom: pattern?.patternFrom || null };
}

/**
 * Soft checks of a written pattern against the mock's real sections and test length (the pattern
 * is for students to read, so these are warnings, never blockers). Sections are matched by name
 * (case-insensitive); returns [{ kind, message }].
 */
export function patternWarnings(pattern, sections = [], durationMinutes = 0) {
  const { rows, totals } = writtenPattern(pattern);
  if (!rows.length) return [];
  const real = patternRows(sections);
  const warnings = [];
  const byName = new Map(real.rows.map((row) => [row.name.toLowerCase(), row]));
  rows.forEach((row) => {
    const match = byName.get(row.name.toLowerCase());
    if (!match) {
      if (real.rows.length) warnings.push({ kind: 'missing', message: `"${row.name}" is in the pattern but the mock has no section with that name.` });
      return;
    }
    if (match.questions !== row.questions) warnings.push({ kind: 'questions', message: `${row.name}: pattern says ${row.questions} questions, the mock has ${match.questions}.` });
    if (Math.abs(match.marks - row.marks) > 0.001) warnings.push({ kind: 'marks', message: `${row.name}: pattern says ${row.marks} marks, the mock has ${match.marks}.` });
  });
  const patternNames = new Set(rows.map((row) => row.name.toLowerCase()));
  real.rows.filter((row) => !patternNames.has(row.name.toLowerCase())).forEach((row) => {
    warnings.push({ kind: 'extra', message: `The mock's section "${row.name}" is not in the pattern.` });
  });
  const duration = number(durationMinutes);
  if (duration > 0 && totals.minutes > 0 && totals.minutes !== duration) {
    warnings.push({ kind: 'time', message: `Pattern time adds up to ${totals.minutes} min; the test length is ${duration} min.` });
  }
  return warnings;
}
export const sectionTypeLabel = (type) => TYPE_LABEL[type] || 'Mixed';

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

/** "Amazon SDE 1 Practice Test": the mock name suggested once company and role are chosen. */
export function suggestMockName(company, role) {
  const companyName = cleanText(company);
  const roleName = cleanText(role);
  return companyName && roleName ? `${companyName} ${roleName} Practice Test` : '';
}

/** Test length for people: "1 h 30 min", "45 min", "2 h"; '–' when not set. */
export function formatTestLength(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (!total) return '–';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** True when month/year is after the current month (an OA pattern cannot be from the future). */
export function isFuturePatternMonth(month, year, now = new Date()) {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y) return false;
  return y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1);
}

/** An empty row for the pattern editor (numbers stay '' until typed). */
export const blankPatternRow = (type = 'mcq') => ({ name: '', type, questions: '', minutes: '', marks: '' });

/**
 * Why a pattern draft cannot be saved yet (mirrors the server's checks in
 * backend/src/services/prepMockPattern.js patternFields) → [message]. Empty means saveable.
 */
export function patternDraftProblems(draft, now = new Date()) {
  const problems = [];
  const month = Number(draft?.patternFrom?.month);
  const year = Number(draft?.patternFrom?.year);
  if (!month || !year) problems.push('Choose the month and year the company used this pattern.');
  else if (isFuturePatternMonth(month, year, now)) problems.push('The OA month cannot be in the future.');
  const rows = Array.isArray(draft?.rows) ? draft.rows : [];
  if (!rows.length) problems.push('Add at least one section.');
  if (rows.length > 30) problems.push('A pattern can have up to 30 sections.');
  const seen = new Set();
  rows.forEach((row, index) => {
    const name = cleanText(row?.name);
    if (!name) {
      problems.push(`Section ${index + 1} needs a name.`);
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) problems.push(`Two sections are called "${name}". Give each section its own name.`);
    seen.add(key);
  });
  if (rows.length && !rows.some((row) => number(row?.questions) > 0)) problems.push('Add the number of questions for at least one section.');
  return problems;
}

/** Pattern draft → request body for createMockPattern / updateMockPattern (company/role added by the caller). */
export function patternDraftBody(draft) {
  const rows = (Array.isArray(draft?.rows) ? draft.rows : []).map((row) => ({
    name: cleanText(row?.name),
    type: PATTERN_TYPES.includes(row?.type) ? row.type : 'mcq',
    questions: Math.max(0, Math.round(number(row?.questions))),
    minutes: Math.max(0, Math.round(number(row?.minutes))),
    marks: Math.max(0, Math.round(number(row?.marks) * 100) / 100),
  }));
  return {
    patternFrom: { month: Number(draft?.patternFrom?.month) || null, year: Number(draft?.patternFrom?.year) || null },
    rows,
    notes: String(draft?.notes || '').trim().slice(0, 600),
  };
}

/** Editor rows started from the mock's own sections (names, types, counts and marks). */
export function patternRowsFromSections(sections = []) {
  return patternRows(sections).rows.map((row) => ({
    name: row.name,
    type: PATTERN_TYPES.includes(row.type) ? row.type : 'mixed',
    questions: row.questions,
    minutes: row.minutes || '',
    marks: Math.round(row.marks * 100) / 100,
  }));
}

/** The copy of a pattern a mock keeps in its form (same shape as Assessment.mockPattern). */
export function patternCopy(pattern) {
  if (!pattern) return null;
  const { rows, totals } = writtenPattern(pattern);
  return {
    patternId: String(pattern._id || pattern.patternId || ''),
    company: pattern.company || '',
    role: pattern.role || '',
    patternFrom: pattern.patternFrom ? { month: Number(pattern.patternFrom.month), year: Number(pattern.patternFrom.year) } : null,
    rows,
    totals,
    notes: pattern.notes || '',
    updatedAt: pattern.updatedAt || null,
  };
}

/**
 * Rows of the pattern table and its totals from the mock's sections (admin form sections or the
 * student summary). Each row: { name, type, questions, minutes, marks, marksPerQuestion, negative }.
 * `durationMinutes` is the mock's enforced time: unallocated minutes and an over-allocation are
 * reported so the admin can fix them before publishing.
 */
export function patternRows(sections = [], durationMinutes = 0) {
  const rows = (Array.isArray(sections) ? sections : []).map((section, index) => {
    const questions = Array.isArray(section?.questions) ? section.questions.length : number(section?.questionCount ?? section?.totalQuestions);
    const marksPerQuestion = number(section?.marksPerQuestion) || 1;
    const questionMarks = Array.isArray(section?.questions)
      ? section.questions.reduce((sum, question) => sum + (number(question?.points ?? question?.marks) || marksPerQuestion), 0)
      : 0;
    const minutes = number(section?.suggestedMinutes);
    return {
      name: String(section?.sectionName || section?.title || `Section ${index + 1}`).trim() || `Section ${index + 1}`,
      type: section?.type || 'mixed',
      questions,
      minutes: minutes > 0 ? Math.round(minutes) : null,
      marks: number(section?.totalMarks) || questionMarks || questions * marksPerQuestion,
      marksPerQuestion,
      negative: Math.max(0, number(section?.negativeMarksPerQuestion)),
    };
  });
  const timed = rows.filter((row) => row.minutes);
  const allocated = timed.reduce((sum, row) => sum + row.minutes, 0);
  const duration = number(durationMinutes);
  return {
    rows,
    totals: {
      questions: rows.reduce((sum, row) => sum + row.questions, 0),
      marks: rows.reduce((sum, row) => sum + row.marks, 0),
      minutes: duration || allocated || null,
      allocated,
    },
    hasTimes: timed.length > 0,
    hasNegative: rows.some((row) => row.negative > 0),
    // Admin checks: section times over the duration, or set on some sections only.
    overAllocated: duration > 0 && allocated > duration ? allocated - duration : 0,
    partlyTimed: timed.length > 0 && timed.length < rows.length,
  };
}
