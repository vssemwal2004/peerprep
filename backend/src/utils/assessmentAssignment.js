/**
 * True when `student` may take `assessment`: an open test (no list) is for every full-access
 * student, and for assessment-only candidates only when it is a centrally shared test; a test
 * with a list is for the students on it, matched by account id or by Student ID.
 * The student test list and the student's own analysis both use this rule.
 */
export function isStudentAssignedToAssessment(assessment = {}, student = {}) {
  const studentObjectId = String(student?._id || '');
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
