function naturalCompare(left, right) {
  return String(left || '').localeCompare(String(right || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function buildCandidateAllocationPreview(students = [], settings = {}, configuredSetCount = 1) {
  const setCount = Math.min(8, Math.max(1, Number(configuredSetCount) || 1));
  const sortBy = settings.setAllocationSortBy === 'name' ? 'name' : 'student_id';
  const direction = settings.setAllocationSortDirection === 'desc' ? -1 : 1;
  const ordered = [...students].sort((left, right) => {
    const primary = sortBy === 'name'
      ? naturalCompare(left.name, right.name)
      : naturalCompare(left.studentId || left.studentid, right.studentId || right.studentid);
    if (primary !== 0) return primary * direction;
    return naturalCompare(left.studentId || left.studentid, right.studentId || right.studentid)
      || naturalCompare(left.email, right.email);
  });
  const start = Math.min(setCount, Math.max(1, Number(settings.setStartingNumber) || 1));
  const automaticEnabled = settings.automaticSetAssignment !== false;

  return ordered.map((student, position) => {
    const requested = Number(student.assessmentSet);
    const source = String(student.assessmentSetSource || '').toLowerCase();
    const validSet = Number.isInteger(requested) && requested >= 1 && requested <= setCount;
    const explicitOverride = validSet && (
      source === 'manual'
      || source === 'csv'
      || (!automaticEnabled && !source)
    );
    const explicitSource = source === 'csv' ? 'csv' : 'manual';
    return {
      ...student,
      assessmentSet: setCount === 1
        ? 1
        : explicitOverride
          ? requested
          : automaticEnabled
            ? ((start - 1 + position) % setCount) + 1
            : '',
      assessmentSetSource: setCount === 1
        ? 'automatic'
        : explicitOverride
          ? explicitSource
          : automaticEnabled
            ? 'automatic'
            : '',
    };
  });
}
