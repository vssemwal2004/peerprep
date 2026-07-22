export function getSemesterNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const direct = Number(value);
  if (Number.isInteger(direct) && direct >= 1 && direct <= 8) return direct;
  const match = String(value).match(/\d+/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 8 ? parsed : null;
}

export function mergeSemesterOptions(...sources) {
  const bySemester = new Map();

  sources.flat().filter(Boolean).forEach((entry) => {
    const value = getSemesterNumber(
      typeof entry === 'object'
        ? (entry.value ?? entry.semester ?? entry.semesterName ?? entry.name)
        : entry,
    );
    if (!value) return;
    const existing = bySemester.get(value);
    const count = typeof entry === 'object' && Number.isFinite(Number(entry.count))
      ? Number(entry.count)
      : existing?.count;
    bySemester.set(value, {
      value,
      label: `Semester ${value}`,
      count,
    });
  });

  return [...bySemester.values()].sort((left, right) => left.value - right.value);
}

export function mergeFilterOptions(...sources) {
  const byValue = new Map();
  sources.flat().filter(Boolean).forEach((entry) => {
    const rawValue = typeof entry === 'object'
      ? (entry.value ?? entry.label ?? entry.name)
      : entry;
    const value = String(rawValue ?? '').trim();
    if (!value) return;
    const key = value.toLocaleLowerCase();
    const existing = byValue.get(key);
    const count = typeof entry === 'object' && Number.isFinite(Number(entry.count))
      ? Number(entry.count)
      : existing?.count;
    byValue.set(key, {
      value: existing?.value || value,
      label: existing?.label || value,
      count,
    });
  });
  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function deriveStudentFacets(students = []) {
  return {
    semesters: mergeSemesterOptions(students.map((student) => student.semester)),
    branches: mergeFilterOptions(students.map((student) => student.branch)),
    courses: mergeFilterOptions(students.map((student) => student.course)),
    colleges: mergeFilterOptions(students.map((student) => student.college)),
    groups: mergeFilterOptions(students.map((student) => student.group)),
    coordinators: mergeFilterOptions(students.flatMap((student) => (
      Array.isArray(student.teacherIds)
        ? student.teacherIds
        : String(student.teacherId || '').split(',')
    ))),
  };
}

export function filterStudentsLocally(students = [], options = {}) {
  const search = String(options.search || '').trim().toLocaleLowerCase();
  const exactFilters = [
    ['semester', 'semester'],
    ['branch', 'branch'],
    ['course', 'course'],
    ['college', 'college'],
    ['group', 'group'],
  ];

  return students.filter((student) => {
    const matchesSearch = !search || [
      student.name,
      student.email,
      student.studentId,
      student.branch,
      student.course,
      student.college,
      student.group,
      ...(Array.isArray(student.teacherIds) ? student.teacherIds : [student.teacherId]),
    ].some((value) => String(value || '').toLocaleLowerCase().includes(search));
    if (!matchesSearch) return false;

    const matchesExact = exactFilters.every(([optionKey, studentKey]) => {
      if (options[optionKey] === undefined || options[optionKey] === '') return true;
      return String(student[studentKey] ?? '').toLocaleLowerCase() === String(options[optionKey]).toLocaleLowerCase();
    });
    if (!matchesExact) return false;

    if (options.coordinator) {
      const coordinators = Array.isArray(student.teacherIds)
        ? student.teacherIds
        : String(student.teacherId || '').split(',');
      return coordinators.some((value) => String(value).trim().toLocaleLowerCase() === String(options.coordinator).toLocaleLowerCase());
    }
    return true;
  });
}
