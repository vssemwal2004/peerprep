/**
 * A Prep Mock read from the platform's own database (not the copy a university receives, which is
 * marked platformShared). Platform students get such a mock only when the Master Admin assigns
 * them ("Assign own students"), never because it is open to all.
 */
export const isPlatformMock = (assessment = {}) => assessment?.kind === 'mock' && assessment.platformShared !== true;

const sameId = (entry, id) => String(entry?._id || entry || '') === id;

/** True when the student is one of a Prep Mock's own students (id index or a grant). */
export function isOwnMockStudent(assessment = {}, student = {}) {
  const id = String(student?._id || '');
  return Boolean(id) && assessment?.kind === 'mock'
    && ((assessment.ownStudents || []).some((entry) => sameId(entry, id))
      || (assessment.ownGrants || []).some((grant) => sameId(grant?.student, id)));
}

/**
 * The own-student window of one student: their grant's From/Until (null = no limit on that side).
 * A student without a grant, or a grant written without window fields (older data), uses the
 * mock's ownAccess window.
 */
export function ownWindowFor(assessment = {}, student = {}) {
  const id = String(student?._id || student || '');
  const grant = (assessment?.ownGrants || []).find((entry) => sameId(entry?.student, id));
  const source = grant && (grant.startTime !== undefined || grant.endTime !== undefined) ? grant : assessment?.ownAccess;
  return {
    startTime: source?.startTime ? new Date(source.startTime) : null,
    endTime: source?.endTime ? new Date(source.endTime) : null,
  };
}

/**
 * The mock as one own student sees it: open only inside its own-student window. Students who
 * have the mock another way (all students, assigned) are unchanged. Returns a copy.
 */
export function withOwnStudentWindow(assessment, student) {
  if (!assessment || !isOwnMockStudent(assessment, student)) return assessment;
  const id = String(student?._id || '');
  // A platform mock reaches its students only through "Assign own students", so its window always
  // applies there; a mock shared to a university is unchanged here.
  const otherwise = isPlatformMock(assessment) ? false
    : (assessment.targetType === 'all' && !(assessment.assignedStudents || []).length)
      || (assessment.assignedStudents || []).some((entry) => String(entry?._id || entry) === id);
  if (otherwise) return assessment;
  const { startTime: start, endTime: end } = ownWindowFor(assessment, student);
  const baseStart = assessment.startTime ? new Date(assessment.startTime) : null;
  const baseEnd = assessment.endTime ? new Date(assessment.endTime) : null;
  return {
    ...assessment,
    startTime: start && (!baseStart || start > baseStart) ? start : baseStart,
    endTime: end && (!baseEnd || end < baseEnd) ? end : baseEnd,
  };
}

/**
 * True when `student` may take `assessment`: an open test (no list) is for every full-access
 * student, and for assessment-only candidates only when it is a centrally shared test; a test
 * with a list is for the students on it, matched by account id or by Student ID.
 * The student test list and the student's own analysis both use this rule.
 */
export function isStudentAssignedToAssessment(assessment = {}, student = {}) {
  const studentObjectId = String(student?._id || '');
  // Prep Mock own students (Master Admin's platform students); their date window is applied
  // where the mock is listed and where an attempt starts (withOwnStudentWindow).
  if (isOwnMockStudent(assessment, student)) return true;
  // Platform mocks: only the students the Master Admin assigned (older mocks saved "open to all"
  // no longer reach every platform student).
  if (isPlatformMock(assessment)) return false;
  const studentCode = String(student?.studentId || '').trim().toLowerCase();
  if (assessment.targetType === 'all' && (!Array.isArray(assessment.assignedStudents) || assessment.assignedStudents.length === 0)) {
    return assessment.platformShared === true || student?.accessScope !== 'assessment_only';
  }
  return (assessment.assignedStudents || []).some((entry) => {
    const rawId = String(entry?._id || entry || '');
    const rawStudentCode = String(entry?.studentId || '').trim().toLowerCase();
    return rawId === studentObjectId || Boolean(studentCode && (rawId.toLowerCase() === studentCode || rawStudentCode === studentCode));
  });
}
