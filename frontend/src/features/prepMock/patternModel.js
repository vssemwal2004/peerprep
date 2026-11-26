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
export const sectionTypeLabel = (type) => TYPE_LABEL[type] || 'Mixed';

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

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
