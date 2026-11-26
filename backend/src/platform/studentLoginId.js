// University login IDs are derived from the university code and the academic
// student ID. Academic IDs remain unchanged in the tenant database, including
// for students enrolled before this login format was introduced.
export function universityStudentCode(universityId) {
  return String(universityId || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function universityStudentLoginId(universityId, studentId) {
  const code = universityStudentCode(universityId);
  const id = String(studentId || '').trim();
  return code && id ? `${code}${id}` : '';
}

export function studentIdFromUniversityLogin(identifier, universityId) {
  const code = universityStudentCode(universityId);
  const input = String(identifier || '').trim();
  if (!code || input.slice(0, code.length).toUpperCase() !== code) return '';
  const studentId = input.slice(code.length);
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(studentId) ? studentId : '';
}
