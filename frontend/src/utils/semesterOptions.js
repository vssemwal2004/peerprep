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
